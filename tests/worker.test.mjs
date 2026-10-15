import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const request = (body, headers = {}) => new Request('https://places.example/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
afterEach(() => mock.restoreAll());
test('missing secret is actionable, health never reveals the secret', async () => {
 const response = await worker.fetch(request({message:'Japan'}),{});
 assert.equal(response.status,503); assert.equal((await response.json()).code,'GUIDE_NOT_CONFIGURED');
 const health=await worker.fetch(new Request('https://places.example/api/health'),{ANTHROPIC_API_KEY:'secret'});
 assert.deepEqual(await health.json(),{ok:true,travelGuide:true,cloudStorage:false});
});
test('rejects invalid, non-string and empty input', async () => {
 for(const body of [null,{}, {message:{}},{message:'  '}]) assert.equal((await worker.fetch(request(body),{})).status,400);
 assert.equal((await worker.fetch(new Request('https://places.example/api/chat',{method:'POST',body:'{broken'}),{})).status,400);
});
test('bounds input length and streamed body size', async () => {
 assert.equal((await worker.fetch(request({message:'x'.repeat(2001)}),{})).status,413);
 assert.equal((await worker.fetch(request({message:'Japan',extra:'x'.repeat(16000)}),{})).status,413);
});
test('rejects cross-origin chat and non-POST methods', async () => {
 assert.equal((await worker.fetch(request({message:'Japan'},{origin:'https://other.example'}),{})).status,403);
 assert.equal((await worker.fetch(new Request('https://places.example/api/chat'),{})).status,405);
});
test('uses configurable model, keeps key server-side and combines text blocks', async () => {
 mock.method(globalThis,'fetch',async (url, options)=>{
  assert.equal(url,'https://api.anthropic.com/v1/messages');
  assert.equal(options.headers['x-api-key'],'test-secret');
  assert.equal(JSON.parse(options.body).model,'configured-model');
  return Response.json({content:[{type:'text',text:'One'},{type:'text',text:'Two'}]});
 });
 const response=await worker.fetch(request({message:' Japan '}),{ANTHROPIC_API_KEY:'test-secret',ANTHROPIC_MODEL:'configured-model'});
 assert.equal(response.status,200); assert.deepEqual(await response.json(),{ok:true,reply:'One\n\nTwo'});
});
test('default model replaces the retired Sonnet 3.5 model', async () => {
 mock.method(globalThis,'fetch',async (url, options)=>{
  assert.equal(JSON.parse(options.body).model,'claude-sonnet-4-6');
  return Response.json({content:[{type:'text',text:'Japan'}]});
 });
 assert.equal((await worker.fetch(request({message:'Japan'}),{ANTHROPIC_API_KEY:'test'})).status,200);
});
test('provider errors do not leak raw diagnostics', async () => {
 for(const status of [401,403,404,429,500]) {
  mock.method(globalThis,'fetch',async()=>new Response('sensitive upstream diagnostic',{status}));
  const response=await worker.fetch(request({message:'Japan'}),{ANTHROPIC_API_KEY:'test'});
  assert.equal(response.status,status===429?429:502);
  assert.doesNotMatch(await response.text(),/sensitive|test-secret/);
  mock.restoreAll();
 }
});
test('network failures, timeouts, malformed and empty replies are handled', async () => {
 for(const behavior of ['network','timeout','json','empty']) {
  mock.method(globalThis,'fetch',async()=>{
   if(behavior==='network') throw new Error('network');
   if(behavior==='timeout') throw new DOMException('timeout','TimeoutError');
   return behavior==='json'?new Response('invalid'):Response.json({content:[]});
  });
  assert.equal((await worker.fetch(request({message:'Japan'}),{ANTHROPIC_API_KEY:'test'})).status,behavior==='timeout'?504:502);
  mock.restoreAll();
 }
});
test('existing state API still saves and restores per-profile events with KV', async () => {
 const storage=new Map(); const env={STATE_STORE:{get:async key=>storage.get(key),put:async(key,val)=>storage.set(key,val)}};
 const state={users:[{id:'user_saboor',name:'Saboor'}],places:[{id:'tokyo',eventId:'trip1',userId:'user_saboor',name:'Tokyo',lat:35.68,lng:139.69,relationshipType:'visit',startDate:'2025-07-27',notes:'Memory',tags:['trip']}]};
 const save=await worker.fetch(new Request('https://places.example/api/state?space=test',{method:'PUT',body:JSON.stringify(state)}),env);
 assert.equal(save.status,200);
 const load=await worker.fetch(new Request('https://places.example/api/state?space=test'),env);
 const result=(await load.json()).state;
 assert.equal(result.places[0].notes,'Memory');assert.equal(result.places[0].eventId,'trip1');assert.equal(result.users[0].id,'user_saboor');
});
