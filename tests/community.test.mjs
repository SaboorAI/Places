import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { AtlasStore } from '../worker/atlas.js';
import { routeCommunity } from '../worker/community.js';
import { OWNER_KEY_HASH } from '../worker/owner-key.js';
import { CommunitySync, COMMUNITY_KEYS } from '../public/src/communitySync.js';

const key = 'person-key-'.repeat(5);
const ownerKey = 'owner-fixture-'.repeat(4);
afterEach(() => mock.restoreAll());
function database() {
 const data = new Map(); let queue = Promise.resolve();
 const db = { get: async id => structuredClone(data.get(id)), put: async (id, value) => data.set(id, structuredClone(value)) };
 db.transaction = fn => { const run = queue.then(() => fn(db)); queue = run.catch(() => {}); return run; };
 return db;
}
const request = (path='/api/community', method='GET', body, token) => new Request('https://places.test'+path, {
 method, headers: {'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})}, ...(body!==undefined?{body:JSON.stringify(body)}:{})
});
const personPlace = (id, extra={}) => ({id:'place-one',userId:id,name:'Example',lat:10,lng:20,notes:'Memory',...extra});
async function createPerson(object,id='user_friend',name='Friend',editKey=key) {
 const response=await object.fetch(request('/api/community/people','POST',{id,name,editKey}));
 assert.equal(response.status,201); return (await response.json()).user;
}
function ownerFixture() {
 const original=crypto.subtle.digest.bind(crypto.subtle);
 mock.method(crypto.subtle,'digest',(algorithm,bytes)=>new TextDecoder().decode(bytes)===ownerKey
  ? Promise.resolve(Uint8Array.from(OWNER_KEY_HASH.match(/../g),hex=>parseInt(hex,16)).buffer) : original(algorithm,bytes));
}
function browser(db) {
 const data=new Map();const output={places:[],profiles:[],permissions:new Set(),status:''};
 const sync=new CommunitySync({places:[],storage:{getItem:id=>data.get(id),setItem:(id,value)=>data.set(id,value)},
  fetcher:(path,options)=>new AtlasStore({storage:db}).fetch(request(path,options.method,options.body?JSON.parse(options.body):undefined,options.headers.authorization?.replace('Bearer ',''))),
  onPlaces:places=>{output.places=places;},onProfiles:profiles=>{output.profiles=profiles;},onPermissions:permissions=>{output.permissions=permissions;},onStatus:status=>{output.status=status;}
 });
 return {sync,data,output};
}

test('public cloud starts with 91 Saboor records and never exposes capability hashes',async()=>{
 const db=database();const object=new AtlasStore({storage:db});await createPerson(object);
 const response=await object.fetch(request());assert.equal(response.status,200);const text=await response.text();const {profiles}=JSON.parse(text);
 assert.equal(profiles[0].places.length,91);assert.equal(profiles[1].name,'Friend');
 assert.ok(!text.includes('keyHash'));assert.ok(!text.includes(key));assert.ok(!text.includes(OWNER_KEY_HASH));
});
test('only the owner key edits Saboor, including publishing real edits and intentional empty state',async()=>{
 ownerFixture();const db=database();let object=new AtlasStore({storage:db});
 const path='/api/community/people/user_saboor';const body={revision:0,places:[personPlace('user_saboor')]};
 for(const token of [undefined,key]) assert.equal((await object.fetch(request(path,'PUT',body,token))).status,401);
 assert.equal((await object.fetch(request(path,'PUT',body,ownerKey))).status,200);
 object=new AtlasStore({storage:db});let state=await(await object.fetch(request())).json();assert.equal(state.profiles[0].places.length,1);
 assert.equal((await object.fetch(request(path,'PUT',{revision:1,places:[]},ownerKey))).status,200);
 state=await(await new AtlasStore({storage:db}).fetch(request())).json();assert.deepEqual(state.profiles[0].places,[]);
});
test('independent person saves cannot overwrite another person or bypass revision checks',async()=>{
 const db=database();const object=new AtlasStore({storage:db});await createPerson(object);await createPerson(object,'user_other','Other','other-key-'.repeat(5));
 const path='/api/community/people/user_friend';const body={revision:0,places:[personPlace('user_friend')]};
 assert.equal((await object.fetch(request(path,'PUT',body,'other-key-'.repeat(5)))).status,401);
 assert.equal((await object.fetch(request(path,'PUT',{...body,places:[personPlace('user_saboor')]},key))).status,400);
 const results=await Promise.all([object.fetch(request(path,'PUT',body,key)),object.fetch(request(path,'PUT',body,key))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const {profiles}=await(await object.fetch(request())).json();assert.equal(profiles[0].places.length,91);assert.equal(profiles[1].places.length,1);assert.equal(profiles[2].places.length,0);
});
test('rejects reserved IDs, duplicate registrations, malformed places, and foreign origins',async()=>{
 const object=new AtlasStore({storage:database()});
 for(const id of ['user_saboor','user_local','bad/id']) assert.equal((await object.fetch(request('/api/community/people','POST',{id,name:'Imposter',editKey:key}))).status,400);
 await createPerson(object);assert.equal((await object.fetch(request('/api/community/people','POST',{id:'user_friend',name:'Friend',editKey:key}))).status,409);
 for(const places of [[personPlace('user_friend',{lat:999})],[personPlace('user_friend'),personPlace('user_friend')]]) assert.equal((await object.fetch(request('/api/community/people/user_friend','PUT',{revision:0,places},key))).status,400);
 assert.equal((await routeCommunity(new Request('https://places.test/api/community',{headers:{origin:'https://other.test'}}),{})).status,403);
 assert.equal((await routeCommunity(request(),{})).status,503);
 const tooBig=new Request('https://places.test/api/community/people',{method:'POST',body:'x'.repeat(2*1024*1024+1)});
 assert.equal((await object.fetch(tooBig)).status,413);
});
test('two browsers see shared updates and keys restore only the matching person on a new device',async()=>{
 const db=database();const a=browser(db),b=browser(db);await a.sync.load();await b.sync.load();
 const user=await a.sync.createPerson('Alex');
 assert.ok(a.output.permissions.has(user.id));assert.ok(!a.output.permissions.has('user_saboor'));
 a.sync.change([...a.output.places,personPlace(user.id)]);await a.sync.save();
 await b.sync.load();assert.equal(b.output.places.filter(p=>p.userId===user.id).length,1);assert.equal(b.output.permissions.size,0);
 const recovery=JSON.parse(a.data.get(COMMUNITY_KEYS))[user.id];await b.sync.unlock(recovery);
 assert.deepEqual([...b.output.permissions],[user.id]);
 b.sync.change(b.output.places.map(p=>p.userId===user.id?{...p,notes:'Changed on second device'}:p));await b.sync.save();await a.sync.load();
 assert.equal(a.output.places.find(p=>p.userId===user.id).notes,'Changed on second device');
 a.sync.stop();b.sync.stop();
});
test('offline deletions and unrelated remote additions reconcile, while same-record conflicts preserve drafts',async()=>{
 const db=database();const a=browser(db),b=browser(db);await a.sync.load();const user=await a.sync.createPerson('Alex');
 const p=personPlace(user.id);a.sync.change([...a.output.places,p]);await a.sync.save();
 await b.sync.unlock(a.sync.keys[user.id]);
 a.sync.change(a.output.places.filter(row=>row.userId!==user.id));
 b.sync.change([...b.output.places,personPlace(user.id,{id:'two'})]);await b.sync.save();await a.sync.load();
 assert.deepEqual(a.output.places.filter(row=>row.userId===user.id).map(row=>row.id),['two']);await a.sync.save();
 await b.sync.load();assert.deepEqual(b.output.places.filter(row=>row.userId===user.id).map(row=>row.id),['two']);
 a.sync.change(a.output.places.map(row=>row.id==='two'?{...row,notes:'Local'}:row));
 b.sync.change(b.output.places.map(row=>row.id==='two'?{...row,notes:'Remote'}:row));await b.sync.save();await a.sync.load();
 assert.equal(a.output.places.find(row=>row.id==='two').notes,'Local');assert.ok(a.sync.blocked.has(user.id));assert.match(a.output.status,/Conflicting/);
 a.sync.stop();b.sync.stop();
});
test('network failures preserve pending changes and retries save them',async()=>{
 const a=browser(database());await a.sync.load();const person=await a.sync.createPerson('Alex');
 a.sync.change([...a.output.places,personPlace(person.id)]);const fetcher=a.sync.fetcher;a.sync.fetcher=async()=>{throw Error('Offline');};await a.sync.save();
 assert.match(a.output.status,/kept on this device/);assert.equal(a.sync.places.filter(p=>p.userId===person.id).length,1);
 a.sync.fetcher=fetcher;await a.sync.load();await a.sync.save();assert.equal(a.sync.base[person.id].places.length,1);a.sync.stop();
});

test('first owner unlock preserves legacy cloud additions and publishes them once',async()=>{
 ownerFixture();const db=database();
 await db.put('atlas',{revision:3,places:[personPlace('user_saboor',{id:'legacy-place'})]});
 const a=browser(db);await a.sync.load();await a.sync.unlock(ownerKey);
 assert.ok(a.sync.places.some(place=>place.id==='legacy-place'));
 await a.sync.save();assert.equal(a.sync.base.user_saboor.revision,1);
 const publicState=await(await new AtlasStore({storage:db}).fetch(request())).json();
 assert.equal(publicState.profiles[0].places.length,92);
 assert.equal((await db.get('atlas')).revision,3); // Legacy storage was not overwritten.
 a.sync.stop();
});
test('locking pending edits preserves the key and blocks accidental draft loss',async()=>{
 const a=browser(database());await a.sync.load();const person=await a.sync.createPerson('Alex');
 a.sync.change([...a.output.places,personPlace(person.id)]);
 assert.equal(a.sync.lock(person.id),false);assert.ok(a.sync.permissions.has(person.id));
 await a.sync.save();assert.equal(a.sync.lock(person.id),true);assert.ok(!a.sync.permissions.has(person.id));
 a.sync.stop();
});
test('retrying a conflicting legacy migration does not silently overwrite either edit',async()=>{
 ownerFixture();const db=database();const a=browser(db);await a.sync.load();
 const original=a.output.places[0];
 await db.put('atlas',{revision:1,places:[{...original,notes:'Legacy edit'}]});
 a.sync.change(a.output.places.map(place=>place.id===original.id?{...place,notes:'Local edit'}:place));
 await a.sync.unlock(ownerKey);
 assert.ok(a.sync.blocked.has('user_saboor'));
 await a.sync.load();
 assert.ok(a.sync.blocked.has('user_saboor'));
 assert.equal(a.sync.places.find(place=>place.id===original.id).notes,'Local edit');
 assert.equal((await db.get('atlas')).places[0].notes,'Legacy edit');
 a.sync.stop();
});
