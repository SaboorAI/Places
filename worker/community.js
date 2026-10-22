import published from '../public/data/saboor-atlas.json' with { type: 'json' };
import { OWNER_KEY_HASH } from './owner-key.js';

const SABOOR = 'user_saboor';
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_PEOPLE = 200;
const COLORS = ['#69d1ff', '#ff9ecf', '#ffd166', '#64e6a8', '#b98dff', '#ff866e'];
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
function personColor(index) {
  if (COLORS[index]) return COLORS[index];
  const hue = (index * 137.508) % 360;
  const channel = n => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (.67 - .215 * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
const publicPerson = ({ keyHash, ...person }) => person;
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
const seed = () => ({ id: SABOOR, name: 'Saboor', color: '#ffa96a', revision: 0, places: published.places });

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('JSON body required.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Request exceeds 2 MB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function routeCommunity(request, env) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({ error: 'Use the Places website.' }, 403);
  if (!['GET', 'POST', 'PUT'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405);
  if (!env.ATLAS_STORE) return reply({ error: 'Cloud storage is unavailable. Your changes remain on this device.' }, 503);
  try {
    // Reuse the deployed SQLite class, in a separate object from the legacy atlas.
    return await env.ATLAS_STORE.get(env.ATLAS_STORE.idFromName('community-v1')).fetch(request);
  } catch {
    return reply({ error: 'Cloud storage could not be reached. Your changes remain on this device.' }, 503);
  }
}

export async function handleCommunity(ctx, request) {
  const path = new URL(request.url).pathname;
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const keyHash = token.length >= 32 && token.length <= 128 ? await hash(token) : '';
  let body;
  if (request.method !== 'GET') {
    try { body = await readBody(request); }
    catch (error) { return reply({ error: error.message === 'Request exceeds 2 MB.' ? error.message : 'Invalid JSON body.' }, error.message === 'Request exceeds 2 MB.' ? 413 : 400); }
  }
  return ctx.storage.transaction(async txn => {
    const people = await txn.get('people') || [{ id: SABOOR, name: 'Saboor', color: '#ffa96a' }];
    const stateFor = async id => await txn.get(`person:${id}`) || (id === SABOOR ? seed() : null);
    if (path === '/api/community' && request.method === 'GET') {
      const profiles = await Promise.all(people.map(async person => publicPerson(await stateFor(person.id))));
      return reply({ version: 1, profiles });
    }
    if (path === '/api/community/unlock' && request.method === 'POST') {
      const person = keyHash && people.find(person => (person.id === SABOOR ? OWNER_KEY_HASH : person.keyHash) === keyHash);
      return person ? reply({ user: publicPerson(person) }) : reply({ error: 'The editing key does not match a person.' }, 401);
    }
    if (path === '/api/community/people' && request.method === 'POST') {
      const { id, name, editKey } = body || {};
      if (typeof id !== 'string' || !/^user_[a-zA-Z0-9_-]{1,80}$/.test(id) || ['user_local', SABOOR].includes(id)) return reply({ error: 'Invalid person ID.' }, 400);
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 60 || typeof editKey !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(editKey)) return reply({ error: 'Use a name up to 60 characters and a secure editing key.' }, 400);
      if (people.some(person => person.id === id)) return reply({ error: 'This profile already exists. Unlock it with its editing key.' }, 409);
      if (people.length >= MAX_PEOPLE) return reply({ error: 'The shared atlas has reached its profile limit.' }, 409);
      const keyHash = await hash(editKey);
      if (keyHash === OWNER_KEY_HASH || people.some(person => person.keyHash === keyHash)) return reply({ error: 'Choose a different editing key.' }, 400);
      const color = personColor(people.length - 1);
      const person = { id, name: name.trim(), color, keyHash };
      const state = { ...person, revision: 0, updatedAt: '', places: [] };
      await txn.put('people', [...people, person]);
      await txn.put(`person:${id}`, state);
      return reply({ user: publicPerson(state) }, 201);
    }
    const match = /^\/api\/community\/people\/(user_[a-zA-Z0-9_-]{1,80})$/.exec(path);
    if (match && request.method === 'PUT') {
      const id = match[1];
      const person = people.find(person => person.id === id);
      if (!person || !keyHash || keyHash !== (id === SABOOR ? OWNER_KEY_HASH : person.keyHash)) return reply({ error: 'Unlock this person with their editing key before saving.' }, 401);
      if (!body || !Number.isInteger(body.revision) || body.revision < 0 || !Array.isArray(body.places) || body.places.length > 2000) return reply({ error: 'Invalid collection; at most 2,000 places per person.' }, 400);
      const ids = new Set();
      for (const place of body.places) {
        if (!place || typeof place.id !== 'string' || !place.id || place.id.length > 200 || ids.has(place.id) || place.userId !== id || typeof place.name !== 'string' || !place.name.trim() || place.name.length > 300 || !Number.isFinite(place.lat) || Math.abs(place.lat) > 90 || !Number.isFinite(place.lng) || Math.abs(place.lng) > 180) return reply({ error: 'Places must have unique IDs, valid coordinates, and belong to this person.' }, 400);
        ids.add(place.id);
      }
      const previous = await stateFor(id);
      if (body.revision !== previous.revision) return reply({ error: 'This collection changed on another device. Retry sync to merge it.' }, 409);
      const state = { ...person, revision: previous.revision + 1, updatedAt: new Date().toISOString(), places: body.places };
      await txn.put(`previous:${id}`, previous);
      await txn.put(`person:${id}`, state);
      return reply({ user: publicPerson(state) });
    }
    return reply({ error: 'Method or route not found.' }, 404);
  });
}
