import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AtlasStore, routeAtlas } from '../worker/atlas.js';
import { OWNER_KEY_HASH } from '../worker/owner-key.js';
import { AtlasSync, reconcile } from '../public/src/atlasSync.js';
import { atlasSeed as seed } from './fixtures.mjs';

const token = 'unit-test-key-'.repeat(4);
const p = { id: 'one', userId: 'user_saboor', name: 'Memory', lat: 10, lng: 20, notes: 'Original' };
afterEach(() => mock.restoreAll());
function authorizeFixture() {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  mock.method(crypto.subtle, 'digest', (algorithm, bytes) => new TextDecoder().decode(bytes) === token
    ? Promise.resolve(Uint8Array.from(OWNER_KEY_HASH.match(/../g), hex => parseInt(hex, 16)).buffer)
    : digest(algorithm, bytes));
}
function storage() {
  const values = new Map([['atlas',{revision:0,places:seed.places,users:seed.users}]]); let queue = Promise.resolve();
  const db = { get: async key => structuredClone(values.get(key)), put: async (key, val) => values.set(key, structuredClone(val)) };
  db.transaction = fn => { const result = queue.then(() => fn(db)); queue = result.catch(() => {}); return result; };
  return db;
}
const req = (method = 'GET', body, key = token) => new Request('https://places.example/api/atlas', {
  method, headers: { authorization: `Bearer ${key}` }, ...(body ? { body: JSON.stringify(body) } : {})
});
test('synthetic fixture covers 91 records and one profile', () => {
  assert.equal(seed.places.length, 91); assert.equal(new Set(seed.places.map(p => p.id)).size, 91);
  assert.deepEqual(seed.users.map(u => u.id), ['user_saboor']);
  assert.ok(seed.places.every(p => p.userId === 'user_saboor'));
});
test('cloud requires durable storage and valid authorization, rejecting foreign origins', async () => {
  assert.equal((await routeAtlas(req(), {})).status, 401);
  authorizeFixture();
  assert.equal((await routeAtlas(req(), {})).status, 503);
  assert.equal((await routeAtlas(req('PUT', { revision: 0, places: [] }, 'bad'), {})).status, 401);
  assert.equal((await routeAtlas(new Request('https://places.example/api/atlas', { headers: { origin: 'https://other.example' } }), {})).status, 403);
});
test('durable data and intentional empty atlas survive object restart', async () => {
  authorizeFixture(); const db = storage(); let obj = new AtlasStore({ storage: db });
  assert.equal((await (await obj.fetch(req())).json()).places.length, 91);
  assert.equal((await obj.fetch(req('PUT', { revision: 0, places: [p] }))).status, 200);
  obj = new AtlasStore({ storage: db });
  assert.deepEqual((await (await obj.fetch(req())).json()).places, [p]);
  assert.equal((await obj.fetch(req('PUT', { revision: 1, places: [] }))).status, 200);
  obj = new AtlasStore({ storage: db });
  assert.deepEqual((await (await obj.fetch(req())).json()).places, []);
});
test('concurrent saves cannot overwrite a newer revision', async () => {
  authorizeFixture(); const obj = new AtlasStore({ storage: storage() });
  const responses = await Promise.all([obj.fetch(req('PUT', { revision: 0, places: [p] })), obj.fetch(req('PUT', { revision: 0, places: [] }))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
});
test('malformed or duplicate places cannot erase the stored atlas', async () => {
  authorizeFixture(); const obj = new AtlasStore({ storage: storage() });
  for (const places of [[p, p], [{...p, lat: 999}], [{...p, userId: 'another'}]]) assert.equal((await obj.fetch(req('PUT', {revision: 0, places}))).status, 400);
  const oversized = new Request('https://places.example/api/atlas', { method: 'PUT', headers: {authorization: `Bearer ${token}`}, body: 'x'.repeat(2*1024*1024+1) });
  assert.equal((await obj.fetch(oversized)).status, 413);
  assert.equal((await (await obj.fetch(req())).json()).places.length, 91);
});
test('three-way sync preserves deletions and unrelated offline edits', () => {
  const two = {...p, id:'two'};
  assert.deepEqual(reconcile([p,two], [p,{...two,notes:'Offline'}], [two]).places, [{...two,notes:'Offline'}]);
  assert.deepEqual(reconcile([p], [], [p]).places, []);
  assert.equal(reconcile([p], [{...p,notes:'Here'}], [{...p,notes:'There'}]).conflicts.length, 1);
});
test('client never uploads on initial read; unlock then edits save, no write loop', async () => {
  const values = new Map([['places.atlas.edit-key.v1',JSON.stringify(token)]]); const calls = []; let remote = {revision:0,places:[p]};
  const sync = new AtlasSync({ places:[p], initialBase:[p], storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}, onPlaces:()=>{},onStatus:()=>{},
    fetcher:async (path, options) => {
      calls.push(options.method);
      if(path.endsWith('/unlock')) return Response.json({ok:true});
      if(options.method === 'PUT') { const body=JSON.parse(options.body); remote={revision:body.revision+1,places:body.places}; }
      return Response.json(remote);
    }
  });
  await sync.load(); assert.deepEqual(calls,['GET']);
  await sync.unlock(token); sync.change([]); await sync.save();
  assert.deepEqual(remote.places,[]); assert.equal(remote.revision,1);
  assert.equal(calls.filter(m=>m==='PUT').length,1); assert.equal(sync.timer?true:false,true);
  sync.stop();
});
test('offline load leaves local edits intact and does not send PUT', async () => {
  let applied=false;const calls=[];
  const sync=new AtlasSync({places:[p],initialBase:[],storage:{getItem:k=>k==='places.atlas.edit-key.v1'?JSON.stringify(token):null,setItem:()=>{}},onPlaces:()=>{applied=true;},onStatus:()=>{},fetcher:async(_,o)=>{calls.push(o.method);throw Error('Offline');}});
  await sync.load();assert.equal(applied,false);assert.deepEqual(sync.places,[p]);assert.deepEqual(calls,['GET']);sync.stop();
});

test('locked browser makes no request for private travel data', async () => {
 let requested=false;
 const sync=new AtlasSync({places:[],storage:{getItem:()=>null},onPlaces:()=>{},onStatus:()=>{},fetcher:async()=>{requested=true;}});
 await sync.load();assert.equal(requested,false);sync.stop();
});

test('new cloud storage starts empty and never fabricates travel entries', async () => {
 authorizeFixture(); const db=storage(); await db.put('atlas',null);
 const obj=new AtlasStore({storage:db});
 const state=await (await obj.fetch(req())).json();
 assert.deepEqual(state.places,[]);assert.equal(state.revision,0);
});
