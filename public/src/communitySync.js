import { reconcile, EDIT_KEY } from './atlasSync.js';

export const COMMUNITY_KEYS = 'places.community.keys.v1';
export const COMMUNITY_BASE = 'places.community.base.v1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const owned = (places, id) => places.filter(place => place.userId === id);

// Each person has an independent revision and editing capability. A write never
// includes another person's records. Cached bases preserve offline deletions.
export class CommunitySync {
  constructor({ places, storage, fetcher = fetch, onPlaces, onProfiles, onPermissions, onStatus, normalize = places => places }) {
    Object.assign(this, { places, storage, fetcher, onPlaces, onProfiles, onPermissions, onStatus, normalize });
    this.keys = this.read(COMMUNITY_KEYS, {});
    this.base = this.read(COMMUNITY_BASE, {});
    this.profiles = new Map(); this.permissions = new Set(); this.blocked = new Set();
    this.ready = false; this.busy = false; this.stopped = false;
  }
  read(key, fallback) { try { return JSON.parse(this.storage.getItem(key)) ?? fallback; } catch { return fallback; } }
  persist(key, value) {
    try { this.storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  status(message) { if (!this.stopped) this.onStatus(message); }
  async request(path, method = 'GET', body, key) {
    const fetcher = this.fetcher;
    const response = await fetcher(path, {
      method, cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || 'Cloud request failed.'); error.status = response.status; throw error; }
    return data;
  }
  validate(profile) {
    if (!profile || typeof profile.id !== 'string' || !Number.isInteger(profile.revision) || !Array.isArray(profile.places)) throw new Error('Cloud returned an invalid collection. Local changes were preserved.');
    return { ...profile, places: this.normalize(profile.places) };
  }
  async load(discardLocal = false) {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      const data = await this.request('/api/community');
      if (this.stopped) return;
      if (!Array.isArray(data.profiles)) throw new Error('Cloud returned invalid profiles.');
      const profiles = data.profiles.map(profile => this.validate(profile));
      // Validate saved keys, including the owner's key from earlier app versions.
      const legacyKey = this.read(EDIT_KEY, '');
      const candidates = { ...this.keys, ...(!this.keys.user_saboor && legacyKey ? { user_saboor: legacyKey } : {}) };
      for (const [id, key] of Object.entries(candidates)) {
        if (this.permissions.has(id)) continue;
        try {
          const result = await this.request('/api/community/unlock', 'POST', {}, key);
          if (result.user.id === id) { this.permissions.add(id); this.keys[id] = key; }
        } catch { /* Public reads work even if an old editing key is invalid. */ }
      }
      if (this.stopped) return;
      let legacyPlaces = null;
      if (this.permissions.has('user_saboor') && profiles.find(person => person.id === 'user_saboor')?.revision === 0 && !this.legacyChecked) {
        try {
          const legacy = await this.request('/api/atlas', 'GET', undefined, this.keys.user_saboor);
          if (Array.isArray(legacy.places)) { legacyPlaces = this.normalize(legacy.places).filter(place => place.userId === 'user_saboor'); this.legacyChecked = !legacyPlaces.length; }
        } catch { /* Legacy storage remains intact; public reads never depend on it. */ }
      }
      if (this.stopped) return;
      const remoteIds = new Set(profiles.map(profile => profile.id));
      const next = this.places.filter(place => !remoteIds.has(place.userId));
      this.blocked.clear();
      for (const profile of profiles) {
        const local = owned(this.places, profile.id);
        const previous = this.base[profile.id];
        // Explicit reload discards only collections this browser can edit.
        let result = this.keys[profile.id] && !(discardLocal && this.permissions.has(profile.id))
          ? previous ? reconcile(previous.places, local, profile.places)
            : { places: [...new Map([...profile.places, ...local].map(place => [place.id, place])).values()], conflicts: [] }
          : { places: profile.places, conflicts: [] };
        if (profile.id === 'user_saboor' && legacyPlaces?.length && !result.conflicts.length && !discardLocal) {
          const migrated = [...new Map([...profile.places, ...legacyPlaces].map(place => [place.id, place])).values()];
          result = reconcile(profile.places, result.places, migrated);
          if (!result.conflicts.length) this.legacyChecked = true;
        }
        if (result.conflicts.length) { this.blocked.add(profile.id); next.push(...local); }
        else { next.push(...result.places); this.base[profile.id] = profile; }
        this.profiles.set(profile.id, profile);
      }
      this.persist(COMMUNITY_KEYS, this.keys); this.persist(COMMUNITY_BASE, this.base);
      this.places = next; this.ready = true;
      this.onProfiles(profiles.map(({ places, ...person }) => person));
      this.onPermissions(new Set(this.permissions)); this.onPlaces(next);
      this.describe();
    } catch (error) { this.ready = false; this.status(`Offline · changes kept on this device. ${error.message}`); }
    finally { this.busy = false; this.schedule(); }
  }
  describe() {
    if (this.blocked.size) return this.status('Conflicting edits · export a backup, then retry or reload cloud.');
    const dirty = [...this.permissions].some(id => !same(owned(this.places, id), this.base[id]?.places));
    this.status(dirty ? 'Changes waiting to save…' : this.ready ? 'All collections up to date' : 'Connecting to cloud…');
  }
  change(places) { this.places = places; this.describe(); this.schedule(); }
  schedule() {
    clearTimeout(this.timer);
    if (this.stopped || !this.ready || this.busy) return;
    if ([...this.permissions].some(id => !this.blocked.has(id) && !same(owned(this.places, id), this.base[id]?.places))) this.timer = setTimeout(() => this.save(), 750);
  }
  async createPerson(name, id = `user_${crypto.randomUUID()}`) {
    const key = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    // Save capability before sending a create: a lost response must not lose it.
    const keys = { ...this.keys, [id]: key };
    if (!this.persist(COMMUNITY_KEYS, keys)) throw new Error('Browser storage is unavailable. Enable it before creating a cloud profile.');
    this.keys = keys;
    const result = await this.request('/api/community/people', 'POST', { id, name, editKey: key });
    if (this.stopped) return result.user;
    const profile = this.validate(result.user);
    this.base[id] = profile; this.profiles.set(id, profile); this.permissions.add(id);
    this.persist(COMMUNITY_BASE, this.base);
    this.onProfiles([...this.profiles.values()].map(({ places, ...person }) => person));
    this.onPermissions(new Set(this.permissions));
    // Local-only profiles can be promoted without dropping their records.
    await this.load(); this.schedule();
    return profile;
  }
  async unlock(key) {
    key = key.trim();
    const { user } = await this.request('/api/community/unlock', 'POST', {}, key);
    const keys = { ...this.keys, [user.id]: key };
    if (!this.persist(COMMUNITY_KEYS, keys)) throw new Error('Browser storage is unavailable. Editing key could not be saved.');
    this.keys = keys; this.permissions.add(user.id); this.onPermissions(new Set(this.permissions));
    await this.load(); return user;
  }
  lock(id) {
    if (this.keys[id] && this.base[id] && !same(owned(this.places, id), this.base[id].places)) {
      this.status('Pending edits are kept on this device. Retry sync and save, or export a backup before locking.');
      return false;
    }
    delete this.keys[id]; this.permissions.delete(id);
    this.persist(COMMUNITY_KEYS, this.keys);
    if (id === 'user_saboor') this.persist(EDIT_KEY, '');
    this.onPermissions(new Set(this.permissions)); this.describe(); return true;
  }
  async save() {
    if (!this.ready || this.busy || this.stopped) return;
    this.busy = true; let reload = false;
    try {
      for (const id of this.permissions) {
        if (this.blocked.has(id)) continue;
        const places = owned(this.places, id);
        if (same(places, this.base[id]?.places)) continue;
        this.status('Saving to cloud…');
        const { user } = await this.request(`/api/community/people/${encodeURIComponent(id)}`, 'PUT', { revision: this.base[id].revision, places }, this.keys[id]);
        if (this.stopped) return;
        const saved = this.validate(user);
        this.base[id] = saved; this.profiles.set(id, saved);
        this.persist(COMMUNITY_BASE, this.base);
      }
      this.describe();
    } catch (error) {
      reload = error.status === 409;
      this.ready = false; this.status(`Changes kept on this device. ${error.message} Retry sync when ready.`);
    } finally { this.busy = false; }
    if (reload) await this.load(); else this.schedule();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
