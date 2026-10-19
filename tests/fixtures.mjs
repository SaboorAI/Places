// Synthetic atlas only; no user travel history in public test fixtures.
export const atlasSeed = {
 users: [{id:'user_saboor',name:'Saboor',color:'#ffa96a'}],
 places: Array.from({length:91},(_,i)=>({id:`fixture-${i}`,eventId:`event-${i}`,userId:'user_saboor',name:i<4?'Tokyo':`Example ${i}`,fullName:i<4?'Tokyo, Japan':`Example ${i}, Test`,lat:10+i/100,lng:20,notes:'',source:'',query:'',tags:[],country:i<4?'Japan':'Test',countryCode:i<4?'JP':'',continent:'Asia',cityId:'',tripId:null,relationshipType:'visit',startDate:'',endDate:''}))
};
