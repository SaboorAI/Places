const users = [{ id: 'user_saboor', name: 'Saboor', color: '#ffa96a' }];
import { OWNER_KEY_HASH } from './owner-key.js';

const MAX_BYTES = 2 * 1024 * 1024;
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export async function authorized(request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  if (token.length < 32 || token.length > 128) return false;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hex = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('');
  return hex === OWNER_KEY_HASH;
}

export async function routeAtlas(request, env) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({ error: 'Use the Places website.' }, 403);
  if (!['GET', 'PUT', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed.' }, 405);
  if (!await authorized(request)) return reply({ error: 'Unlock cloud saving in Settings with your private editing key.' }, 401);
  if (new URL(request.url).pathname === '/api/atlas/unlock') {
    if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
    return reply({ ok: true });
  }
  if (!['GET', 'PUT'].includes(request.method)) return reply({ error: 'Use GET or PUT.' }, 405);
  if (!env.ATLAS_STORE) return reply({ error: 'Cloud storage is unavailable. Your changes remain on this device.' }, 503);
  try {
    return await env.ATLAS_STORE.get(env.ATLAS_STORE.idFromName('saboor')).fetch(request);
  } catch {
    return reply({ error: 'Cloud storage could not be reached. Your changes remain on this device.' }, 503);
  }
}

// SQLite-backed Durable Object: one serialized, durable atlas with revision checks.
export class AtlasStore {
  constructor(ctx) { this.ctx = ctx; }

  async fetch(request) {
    if (!await authorized(request)) return reply({ error: 'Unlock your atlas in Settings with your private key.' }, 401);
    if (request.method === 'GET') {
      return this.ctx.storage.transaction(async txn => {
        const state = await txn.get('atlas');
        if (state) return reply(state);
        // Data is imported through the private API, never bundled in the public repository.
        const initial = { revision: 0, updatedAt: '', users, places: [] };
        await txn.put('atlas', initial);
        return reply(initial);
      });
    }
    if (request.method !== 'PUT') return reply({ error: 'Method not allowed.' }, 405);
    if (!await authorized(request)) return reply({ error: 'Invalid editing key.' }, 401);
    let body;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply({ error: 'A JSON body is required.' }, 400);
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); return reply({ error: 'Backup exceeds 2 MB.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = JSON.parse(new TextDecoder().decode(bytes));
    } catch { return reply({ error: 'Invalid JSON.' }, 400); }
    if (!Number.isInteger(body?.revision) || body.revision < 0 || !Array.isArray(body.places) || body.places.length > 10000) return reply({ error: 'Invalid atlas.' }, 400);
    const ids = new Set();
    for (const p of body.places) {
      if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180 || !['user_saboor', 'user_local'].includes(p.userId)) return reply({ error: 'Every place must have a unique ID, valid coordinates, and belong to Saboor.' }, 400);
      ids.add(p.id);
    }
    // The revision check and write are one transaction, including concurrent clients.
    return this.ctx.storage.transaction(async txn => {
      const previous = await txn.get('atlas');
      if (body.revision !== (previous?.revision || 0)) return reply({ error: 'The atlas changed on another device. Refresh before saving.' }, 409);
      const state = {
        revision: body.revision + 1,
        updatedAt: new Date().toISOString(),
        users,
        places: body.places.map(p => ({ ...p, userId: 'user_saboor' }))
      };
      if (previous) await txn.put('previous', previous);
      await txn.put('atlas', state);
      return reply(state);
    });
  }
}

