const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/../js/runtime.js`,'utf8');
function setup(send=async()=>({ok:true})) {
  const events={},errors=[];let calls=0;
  const chrome={runtime:{id:'extension',sendMessage:message=>{calls++;return send(message);}},storage:{local:{get:async()=>({}),set:async()=>{}},session:{get:async()=>({}),set:async()=>{}}}};
  const context={chrome,console:{error:error=>errors.push(error)},window:{addEventListener:(type,fn)=>events[type]=fn}};
  vm.runInNewContext(source,context);
  return {api:context.EbayRuntime,chrome,events,errors,get calls(){return calls;}};
}
test('invalidated context cancels a pending cache request and disposes once',async()=>{
  let reject,cleanups=0;
  const h=setup(()=>new Promise((_,fail)=>reject=fail));h.api.onDispose(()=>cleanups++);
  const pending=h.api.sendMessage({type:'finder-cache-index'});
  reject(new Error('Extension context invalidated.'));
  await assert.rejects(pending,error=>h.api.expected(error));
  await assert.rejects(h.api.sendMessage({type:'finder-cache-index'}),error=>h.api.expected(error));
  assert.equal(h.calls,1);assert.equal(cleanups,1);assert.equal(h.errors.length,0);
});
test('missing runtime ID stops calls before Chrome throws',async()=>{
  const h=setup();delete h.chrome.runtime.id;
  await assert.rejects(h.api.sendMessage({type:'finder-cache-read'}));
  assert.equal(h.calls,0);assert.equal(h.api.active(),false);
});
test('ordinary search-page reload tears down old tasks and suppresses teardown rejections',async()=>{
  const h=setup();let cleanups=0,prevented=false;h.api.onDispose(()=>cleanups++);
  h.events.pagehide({persisted:false});
  await assert.rejects(h.api.sendMessage({type:'finder-cache-index'}));
  h.events.unhandledrejection({reason:new Error('Extension context invalidated.'),preventDefault(){prevented=true;}});
  assert.equal(cleanups,1);assert.equal(h.calls,0);assert.equal(prevented,true);assert.deepEqual(h.errors,[]);
});
test('back-forward cache suspension can resume with a valid connection',async()=>{
  const h=setup();h.events.pagehide({persisted:true});
  await assert.rejects(h.api.sendMessage({type:'finder-cache-index'}));
  assert.equal(h.calls,0);h.events.pageshow({persisted:true});
  assert.equal((await h.api.sendMessage({type:'finder-cache-index'})).ok,true);assert.equal(h.calls,1);
});
test('real request failures remain visible instead of being swallowed as reloads',async()=>{
  const h=setup(async()=>{throw new Error('Storage unavailable');});
  await assert.rejects(h.api.sendMessage({type:'finder-cache-index'}),/Storage unavailable/);
  assert.equal(h.api.active(),true);h.api.report(new Error('Storage unavailable'));assert.equal(h.errors.length,1);
});
