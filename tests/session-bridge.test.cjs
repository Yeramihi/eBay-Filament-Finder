const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  let listener;const data={};const event={addListener(){}};
  const chrome={runtime:{id:'extension',onMessage:{addListener:fn=>listener=fn},onInstalled:event},tabs:{onUpdated:event,onRemoved:event,onActivated:event},windows:{onRemoved:event},contextMenus:{onClicked:event},storage:{session:{get:async keys=>Object.fromEntries(keys.filter(key=>key in data).map(key=>[key,data[key]])),set:async patch=>Object.assign(data,patch)}}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/background.js`,'utf8'),{chrome,URL,console,importScripts(){}});
  return {data,send:(message,sender={id:'extension',url:'https://www.ebay.co.uk/sch/i.html?_pgn=2'})=>new Promise(resolve=>listener(message,sender,resolve))};
}
test('background session bridge stores page snapshots across client-side pagination',async()=>{
  const h=setup(),key='finder-page:https://www.ebay.co.uk/sch/i.html?_pgn=1:rows';
  assert.equal((await h.send({type:'finder-page-session-set',patch:{[key]:[{url:'https://www.ebay.co.uk/itm/123'}]}})).saved,true);
  const response=await h.send({type:'finder-page-session-get',keys:[key]});assert.equal(response.data[key].length,1);
});
test('session bridge rejects other websites and internal scanner state',async()=>{
  const h=setup();
  assert.match((await h.send({type:'finder-page-session-get',keys:['finder:visibleScan:active']})).error,/snapshot keys/);
  assert.match((await h.send({type:'finder-page-session-get',keys:['finder-page:https://other.example/sch/i.html']})).error,/snapshot keys/);
  assert.match((await h.send({type:'finder-page-session-get',keys:['finder-page:https://www.ebay.co.uk/sch/i.html']},{id:'extension',url:'https://other.example'})).error,/snapshot source/);
});
