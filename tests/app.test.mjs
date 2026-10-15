import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';
import React from 'react';
import { create, act } from 'react-test-renderer';

// Exercise the real application state and handlers. Map rendering is a test double;
// this suite deliberately does not claim WebGL/browser visual coverage.
async function harness(saved = {}) {
 const storage = new Map(Object.entries(saved));
 const appSource = (await readFile('public/src/app.js','utf8'))
  .replace(/^import .*;\n/gm,'')
  .replace(/ReactDOM.createRoot\([\s\S]*$/,'')
  .replace(/<GlobeMap\b/g,'<MapStub').replace(/<LeafletMap\b/g,'<MapStub');
 const source = (await transform(appSource + '\nglobalThis.api={App,parseMentions,mergePlaces,sanitizePlacesForStorage,scopePlacesByUser,loadPlaces};',{loader:'jsx'})).code;
 const context=vm.createContext({React,MapStub:()=>null,console,Intl,crypto,URL,Blob,AbortController,AbortSignal,setTimeout,clearTimeout,
  requestAnimationFrame:fn=>fn(),
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  document:{getElementById:()=>null},
  fetch:async url=> {
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
 return {renderer,storage,api:context.api};
}
const click = async node => act(async()=>node.props.onClick({stopPropagation(){},preventDefault(){}}));
const button = (renderer,label)=>renderer.root.findAllByType('button').find(node=>node.children.join('')===label);

test('fresh browser selects seeded Saboor profile and loads ten events',async()=>{
 const {renderer,storage}=await harness();
 assert.equal(renderer.root.findByProps({'aria-label':'Active profile'}).props.value,'user_saboor');
 assert.equal(JSON.parse(storage.get('visitedPlaces.user.places.v1')).length,10);
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,10);
 await act(()=>renderer.unmount());
});
test('existing local places and selected profile survive startup',async()=>{
 const custom={id:'my-place',userId:'user_local',name:'My memory',lat:10,lng:20,notes:'Keep this'};
 const {renderer,storage}=await harness({'visitedPlaces.activeUserId.v1':'user_local','visitedPlaces.user.places.v1':JSON.stringify([custom])});
 assert.equal(renderer.root.findByProps({'aria-label':'Active profile'}).props.value,'user_local');
 const places=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 assert.equal(places.length,1);assert.equal(places[0].notes,'Keep this');
 await act(()=>renderer.unmount());
});
test('search, tool navigation, map mode, and disabled guide retain working handlers',async()=>{
 const {renderer,storage}=await harness();
 await act(()=>renderer.root.findByProps({'aria-label':'Search places'}).props.onChange({target:{value:'Tokyo'}}));
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,1);
 await click(button(renderer,'Guide'));
 assert.equal(renderer.root.findByProps({className:'chat-section'}).props.hidden,false);
 assert.equal(button(renderer,'Ask').props.disabled,true);
 await click(button(renderer,'Map'));
 assert.equal(JSON.parse(storage.get('visitedPlaces.user.preferences.v1')).mapShape,'panel');
 await act(()=>renderer.unmount());
});
test('backup import merges, preserves event metadata, and deduplicates per user',async()=>{
 const {renderer,storage}=await harness();
 const original=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 const file={text:async()=>JSON.stringify({users:[{id:'user_friend',name:'Friend'}],places:[original[0],{...original[0],id:'friend-event',userId:'user_friend',notes:'Friend memory'}]})};
 const input=renderer.root.findByProps({type:'file'});
 await act(async()=>input.props.onChange({target:{files:[file],value:'backup'}}));
 const updated=JSON.parse(storage.get('visitedPlaces.user.places.v1'));
 assert.equal(updated.length,11);assert.equal(updated.find(p=>p.userId==='user_friend').notes,'Friend memory');
 assert.equal(updated.find(p=>p.userId==='user_friend').eventId,original[0].eventId);
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
 assert.equal(JSON.parse(storage.get('visitedPlaces.user.places.v1')).length,9);
 await act(()=>renderer.unmount());
});
test('an intentionally empty saved atlas stays empty after reload',async()=>{
 const {renderer,storage}=await harness({'visitedPlaces.activeUserId.v1':'user_saboor','visitedPlaces.user.places.v1':'[]'});
 assert.equal(renderer.root.findAllByProps({className:'place-name'}).length,0);
 assert.deepEqual(JSON.parse(storage.get('visitedPlaces.user.places.v1')),[]);
 await act(()=>renderer.unmount());
});
