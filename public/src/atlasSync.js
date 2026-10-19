export const BASE_KEY = 'places.atlas.cloud-base.v1';
export const EDIT_KEY = 'places.atlas.edit-key.v1';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rows = list => new Map(list.map(p => [p.id, p]));

// Three-way reconciliation preserves offline additions, edits AND deletions.
// Concurrent edits of the same record stop rather than silently losing either copy.
export function reconcile(base, local, remote) {
  const b = rows(base), l = rows(local), r = rows(remote), merged = [], conflicts = [];
  for (const id of new Set([...r.keys(), ...l.keys(), ...b.keys()])) {
    const before = b.get(id), here = l.get(id), there = r.get(id);
    let chosen;
    if (same(here, before)) chosen = there;
    else if (same(there, before) || same(here, there)) chosen = here;
    else { conflicts.push(id); continue; }
    if (chosen) merged.push(chosen);
  }
  return { places: merged, conflicts };
}

export class AtlasSync {
  constructor({ places, storage, fetcher = fetch, onPlaces, onStatus }) {
    Object.assign(this, { places, storage, fetcher, onPlaces, onStatus });
    this.base = this.read(BASE_KEY, null);
    this.key = this.read(EDIT_KEY, '');
    this.ready = false; this.busy = false; this.stopped = false; this.blocked = false;
  }
  read(key, fallback) { try { return JSON.parse(this.storage.getItem(key)) ?? fallback; } catch { return fallback; } }
  write(key, value) { try { this.storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
  status(message) { if (!this.stopped) this.onStatus(message); }
  async request(method, body, key = this.key, path = '/api/atlas') {
    const response = await this.fetcher(path, {
      method, cache: 'no-store', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error || 'Cloud request failed.'); error.status = response.status; throw error; }
    if (path === '/api/atlas' && (!Number.isInteger(data.revision) || !Array.isArray(data.places))) throw new Error('Cloud returned an invalid atlas. Local places were preserved.');
    return data;
  }
  async load(discardLocal = false) {
    if (this.busy || this.stopped) return;
    if (!this.key) { this.status('Unlock your private atlas in Settings to load and save cloud memory.'); return; }
    this.busy = true; this.status('Checking cloud memory…');
    try {
      const remote = await this.request('GET');
      if (this.stopped) return;
      // First connection merges existing local memories with the private backup.
      const result = discardLocal ? { places: remote.places, conflicts: [] }
        : this.base ? reconcile(this.base.places, this.places, remote.places)
        : { places: [...new Map([...remote.places, ...this.places].map(p => [p.id, p])).values()], conflicts: [] };
      if (result.conflicts.length) {
        this.blocked = true; this.ready = false;
        this.status('Conflicting edits on another device. Export a backup before choosing Reload cloud. Your local changes are preserved.');
        return;
      }
      this.base = remote; this.write(BASE_KEY, remote);
      this.places = result.places; this.onPlaces(result.places);
      this.ready = true; this.blocked = false;
      this.describe();
    } catch (error) { this.ready = false; this.status(`Saved on this device only. ${error.message}`); }
    finally { this.busy = false; this.schedule(); }
  }
  describe() {
    this.status(same(this.places, this.base?.places)
      ? (this.key ? 'Saved to cloud · Saboor' : 'Cloud memory loaded · unlock to save changes')
      : (this.key ? 'Changes waiting to save…' : 'Changes saved on this device · unlock cloud saving in Settings'));
  }
  change(places) { this.places = places; if (!this.blocked) this.describe(); this.schedule(); }
  schedule() {
    clearTimeout(this.timer);
    if (!this.stopped && this.ready && !this.blocked && !this.busy && this.key && !same(this.places, this.base?.places)) {
      this.timer = setTimeout(() => this.save(), 1000);
    }
  }
  async unlock(key) {
    await this.request('POST', {}, key.trim(), '/api/atlas/unlock');
    this.key = key.trim(); this.write(EDIT_KEY, this.key);
    await this.load();
    this.schedule();
  }
  lock() { this.key = ''; this.write(EDIT_KEY, ''); clearTimeout(this.timer); this.describe(); }
  async save() {
    if (!this.ready || this.busy || this.blocked || !this.key || this.stopped) return;
    const sent = this.places;
    this.busy = true; this.status('Saving to cloud…');
    let conflict = false;
    try {
      const saved = await this.request('PUT', { revision: this.base.revision, places: sent });
      this.base = saved; this.write(BASE_KEY, saved); this.describe();
    } catch (error) {
      conflict = error.status === 409;
      this.ready = false;
      this.status(`Changes kept on this device. ${error.message} Use Retry sync when ready.`);
    } finally { this.busy = false; }
    if (conflict) await this.load();
    else this.schedule();
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
