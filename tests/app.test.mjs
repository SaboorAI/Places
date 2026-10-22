import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
import React from 'react';
import { atlasSeed } from './fixtures.mjs';
import { CommunitySync, COMMUNITY_BASE, COMMUNITY_KEYS } from '../public/src/communitySync.js';
import { create, act } from 'react-test-renderer';

const activeRenderers = new Set();
afterEach(async()=> { for (const renderer of activeRenderers) await act(()=>renderer.unmount()); activeRenderers.clear(); });

// Exercise the real application state and handlers. Map rendering is a test double;
// this suite deliberately does not claim WebGL/browser visual coverage.
async function harness(saved = {}, publicAtlas = { places: [] }, extraProfiles = []) {
 const profiles = [{...atlasSeed.users[0],revision:0,places:publicAtlas.places.length ? publicAtlas.places : atlasSeed.places}, ...extraProfiles];
 const storage = new Map(Object.entries({"places.atlas.edit-key.v1":JSON.stringify("test-key"),...saved}));
 const appSource = (await readFile('public/src/app.js','utf8'))
  .replace(/^import .*;\n/gm,'')
  .replace(/ReactDOM.createRoot\([\s\S]*$/,'')
  .replace(/<GlobeMap\b/g,'<MapStub').replace(/<LeafletMap\b/g,'<MapStub');
 const source = (await transform(appSource + '\nglobalThis.api={App,parseMentions,mergePlaces,sanitizePlacesForStorage,scopePlacesByUser,loadPlaces};',{loader:'jsx'})).code;
 const context=vm.createContext({React,atlasSeed,publicAtlas,CommunitySync,COMMUNITY_BASE,MapStub:()=>null,console,Intl,crypto,URL,Blob,AbortController,AbortSignal,setTimeout,clearTimeout,setInterval,clearInterval,
  requestAnimationFrame:fn=>fn(),
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  document:{getElementById:()=>null},
  fetch:async (url, options={})=> {
   if(url==='/api/community') return Response.json({version:1,profiles});
   if(url==='/api/community/unlock') {
    const key=options.headers.authorization?.replace('Bearer ','');
    const id=key==='test-key'?'user_saboor':Object.entries(JSON.parse(storage.get(COMMUNITY_KEYS)||'{}')).find(([id,value])=>value===key)?.[0];
    const user=profiles.find(p=>p.id===id);
    return user ? Response.json({user}) : Response.json({error:'Invalid key'},{status:401});
   }
   if(url==='/api/community/people') {
    const body=JSON.parse(options.body);const user={id:body.id,name:body.name,color:'#69d1ff',revision:0,places:[]};profiles.push(user);return Response.json({user},{status:201});
   }
   if(url.startsWith('/api/community/people/') && options.method==='PUT') {
    const user=profiles.find(p=>p.id===url.split('/').pop());const body=JSON.parse(options.body);Object.assign(user,{revision:body.revision+1,places:body.places});return Response.json({user});
   }
   if(url==='/api/atlas') return Response.json({revision:0,places:publicAtlas.places.length ? publicAtlas.places : atlasSeed.places,users:atlasSeed.users});
   if(url==='/api/health') return Response.json({travelGuide:false});
   if(url.startsWith('/data/')) return Response.json(JSON.parse(await readFile('public'+url,'utf8')));
   throw Error('Unexpected external request: '+url);
  }
 });
 context.window=context;
 for(const file of ['data/app-data.js','data/user-data.js','src/dataLoader.js','src/ui.js','src/globe.js']) vm.runInContext(await readFile('public/'+file,'utf8'),context);
 vm.runInContext(source,context);
 let renderer;
 await act(async()=>{ renderer=create(React.createElement(context.api.App)); });
 // Finish the asynchronous JSON bootstrap without timer-based waits.
 for(let i=0;i<6;i++) await act(async()=>{await new Promise(resolve=>setImmediate(resolve));});
 activeRenderers.add(renderer);
 return {renderer,storage,api:context.api};
}
const click = async node => act(async()=>node.props.onClick({stopPropagation(){},preventDefault(){}}));
const button = (renderer,label)=>renderer.root.findAllByType('button').find(node=>node.children.join('')===label);

test('fresh browser loads all 91 backup entries under Saboor without Me',async()=>{
 const {renderer,storage}=await harness();
 assert.deepEqual(JSON.parse(storage.get('visitedPlaces.userDirectory.v1')).map(u=>u.name),['Saboor']);
 assert.equal(JSON.parse(storage.get('visitedPlaces.user.places.v1')).length,91);
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,91);
 await act(()=>renderer.unmount());
});
test('existing local places and selected profile survive startup',async()=>{
 const custom={id:'my-place',userId:'user_local',name:'My memory',lat:10,lng:20,notes:'Keep this'};
 const {renderer,storage}=await harness({'visitedPlaces.activeUserId.v1':'user_local','visitedPlaces.user.places.v1':JSON.stringify([custom])});
 assert.equal(storage.get('visitedPlaces.activeUserId.v1'),'user_saboor');
 const places=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 assert.equal(places.length,92);assert.equal(places.find(p=>p.id==='my-place').notes,'Keep this');assert.ok(places.every(p=>p.userId==='user_saboor'));
 await act(()=>renderer.unmount());
});
test('search, tool navigation, map mode, and disabled guide retain working handlers',async()=>{
 const {renderer,storage}=await harness();
 await act(()=>renderer.root.findByProps({'aria-label':'Search places'}).props.onChange({target:{value:'Tokyo'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,4);
 await click(button(renderer,'Guide'));
 assert.equal(renderer.root.findByProps({className:'chat-section'}).props.hidden,false);
 assert.equal(button(renderer,'Ask').props.disabled,true);
 await click(button(renderer,'Map'));
 assert.equal(JSON.parse(storage.get('visitedPlaces.user.preferences.v1')).mapShape,'panel');
 await act(()=>renderer.unmount());
});
test('backup import preserves separate owners without duplicating an existing event',async()=>{
 const friendProfile={id:'user_friend',name:'Friend',color:'#69d1ff',revision:0,places:[]};
 const {renderer,storage}=await harness({[COMMUNITY_KEYS]:JSON.stringify({user_friend:'friend-key'})},{places:[]},[friendProfile]);
 const original=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 const file={text:async()=>JSON.stringify({users:[{id:'user_friend',name:'Friend'}],places:[original[0],{...original[0],id:'friend-event',userId:'user_friend',notes:'Friend memory'}]})};
 const input=renderer.root.findByProps({type:'file'});
 await act(async()=>input.props.onChange({target:{files:[file],value:'backup'}}));
 const updated=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 assert.equal(updated.length,92);assert.equal(updated.find(p=>p.id==='user_friend:friend-event').userId,'user_friend');
 assert.deepEqual(JSON.parse(storage.get('visitedPlaces.userDirectory.v1')).map(u=>u.name),['Saboor','Friend']);
 await act(()=>renderer.unmount());
});
test('mixed note parser retains country context and aliases',async()=>{
 const {renderer,api}=await harness();
 const mentions=api.parseMentions('Japan\nTokyo\nKyoto\nUnited States\nNYC');
 assert.ok(mentions.some(p=>p.token==='Tokyo' && p.context==='Japan'));
 assert.ok(mentions.some(p=>p.query.includes('New York City')));
 await act(()=>renderer.unmount());
});
test('removing a place keeps other events and persists the change',async()=>{
 const {renderer,storage}=await harness();
 await click(button(renderer,'Remove'));
 assert.equal(JSON.parse(storage.get('visitedPlaces.user.places.v1')).length,90);
 await act(()=>renderer.unmount());
});
test('an intentionally empty saved atlas stays empty after reload',async()=>{
 const {renderer,storage}=await harness({'visitedPlaces.activeUserId.v1':'user_saboor','visitedPlaces.user.places.v1':'[]',[COMMUNITY_BASE]:JSON.stringify({user_saboor:{revision:0,places:atlasSeed.places}})});
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,0);
 assert.deepEqual(JSON.parse(storage.get('visitedPlaces.user.places.v1')),[]);
 await act(()=>renderer.unmount());
});

test('people have separate filters, colors, and persistent profiles',async()=>{
 const {renderer,storage}=await harness();
 await act(()=>renderer.root.findByProps({'aria-label':'New person name'}).props.onChange({target:{value:'Alex'}}));
 await click(button(renderer,'Add person'));
 assert.match(renderer.root.findByProps({'aria-label':'Filter by person'}).props.value,/^user_/);
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,0);
 const users=JSON.parse(storage.get('visitedPlaces.userDirectory.v1'));
 assert.deepEqual(users.map(u=>u.name),['Saboor','Alex']);
 assert.notEqual(users[0].color,users[1].color);
 await act(()=>renderer.root.findByProps({'aria-label':'Filter by person'}).props.onChange({target:{value:'all'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,91);
 await act(()=>renderer.root.findByProps({'aria-label':'Filter by person'}).props.onChange({target:{value:'user_saboor'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,91);
 await act(()=>renderer.unmount());
});

test('cloud reload preserves another person’s local places',async()=>{
 const friend={...atlasSeed.places[0],id:'friend-local',userId:'user_friend',notes:'Keep separate'};
 const {renderer,storage}=await harness({'visitedPlaces.user.places.v1':JSON.stringify([friend]),'visitedPlaces.userDirectory.v1':JSON.stringify([{id:'user_friend',name:'Friend'}])});
 let places=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 assert.equal(places.length,92);
 assert.equal(places.find(p=>p.id===`user_friend:${friend.id}`).userId,'user_friend');
 await click(button(renderer,'Retry sync'));
 places=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 assert.equal(places.length,92);
 assert.equal(places.find(p=>p.id===`user_friend:${friend.id}`).notes,'Keep separate');
 await act(()=>renderer.root.findByProps({'aria-label':'Filter by person'}).props.onChange({target:{value:'user_friend'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,1);
 await act(()=>renderer.unmount());
});

test('public backup loads all 91 complete records without a key, even with empty saved storage',async()=>{
 const published=JSON.parse(await readFile('public/data/saboor-atlas.json','utf8'));
 assert.equal(published.places.length,91);
 assert.equal(new Set(published.places.map(p=>p.id)).size,91);
 for(const saved of [{}, {'visitedPlaces.user.places.v1':'[]'}]) {
  const {renderer,storage}=await harness({...saved,'places.atlas.edit-key.v1':'""'},published);
  assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,91);
  assert.equal(button(renderer,'Remove'),undefined);
  assert.equal(button(renderer,'Edit'),undefined);
  assert.equal(renderer.root.findByProps({'aria-label':'Filter by person'}).props.value,'user_saboor');
  assert.ok(renderer.root.findAllByProps({className:'place-note'}).length>0);
  assert.equal(storage.get('places.atlas.edit-key.v1'),'""');
  await act(()=>renderer.unmount());
 }
});

test('public Saboor collection and personal additions filter independently',async()=>{
 const published=JSON.parse(await readFile('public/data/saboor-atlas.json','utf8'));
 const friend={id:'friend-public-test',userId:'user_friend',name:'Friend location',lat:10,lng:20};
 const {renderer,storage}=await harness({'places.atlas.edit-key.v1':'""','visitedPlaces.user.places.v1':JSON.stringify([friend])},published);
 const filter=()=>renderer.root.findByProps({'aria-label':'Filter by person'});
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,91);
 await act(()=>filter().props.onChange({target:{value:'all'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,92);
 await act(()=>filter().props.onChange({target:{value:'user_friend'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,1);
 await click(button(renderer,'Enable cloud saving'));
 await click(button(renderer,'Remove'));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,0);
 await act(()=>filter().props.onChange({target:{value:'user_saboor'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,91);
 assert.equal(JSON.parse(storage.get('visitedPlaces.user.places.v1')).filter(p=>p.userId==='user_friend').length,0);
 await act(()=>renderer.unmount());
});

test('valid owner key unlocks editing of the published Saboor records',async()=>{
 const published=JSON.parse(await readFile('public/data/saboor-atlas.json','utf8'));
 const {renderer,storage}=await harness({},published);
 assert.equal(renderer.root.findAllByType('button').filter(node=>node.children.join('')==='Edit').length,91);
 await click(button(renderer,'Edit'));
 const editor=renderer.root.findByProps({className:'place-edit'});
 await act(()=>editor.findByType('textarea').props.onChange({target:{value:'Owner updated this public memory'}}));
 await click(button(renderer,'Save'));
 assert.ok(JSON.parse(storage.get('visitedPlaces.user.places.v1')).some(place=>place.notes==='Owner updated this public memory'));
 await act(()=>renderer.unmount());
});
test('a backup cannot modify locked Saboor records',async()=>{
 const published=JSON.parse(await readFile('public/data/saboor-atlas.json','utf8'));
 const {renderer,storage}=await harness({'places.atlas.edit-key.v1':'""'},published);
 const file={text:async()=>JSON.stringify({places:[{...published.places[0],notes:'Unauthorized change'}]})};
 await act(async()=>renderer.root.findByProps({type:'file'}).props.onChange({target:{files:[file],value:'backup'}}));
 assert.ok(!JSON.parse(storage.get('visitedPlaces.user.places.v1')).some(place=>place.notes==='Unauthorized change'));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,91);
 await act(()=>renderer.unmount());
});

test('copied backup IDs remain independent across people and normalization is stable',async()=>{
 const {renderer,api}=await harness();
 const original=atlasSeed.places[0];
 const normalized=api.sanitizePlacesForStorage([original,{...original,userId:'user_friend'}]);
 assert.notEqual(normalized[0].id,normalized[1].id);
 assert.equal(normalized[0].id,original.id);
 assert.equal(api.sanitizePlacesForStorage(normalized)[1].id,normalized[1].id);
 await act(()=>renderer.unmount());
});
