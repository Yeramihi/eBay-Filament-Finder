const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(`${__dirname}/../js/visible-scanner.js`,'utf8');
const url='https://www.ebay.co.uk/itm/396793856846';
const parent={id:'extension',tab:{id:1,windowId:10},documentId:'search-document',url:'https://www.ebay.co.uk/sch/i.html?_nkw=pla'};
function setup(){
  const data={},tabs=new Map([[1,{id:1,active:false,url:parent.url}]]),created=[],closed=[],messages=[],writes=[];
  let id=10;
  const context={console,URL,Date,Promise,Number,crypto:{randomUUID:()=>`job-${++id}`},chrome:{runtime:{id:'extension'},storage:{session:{
    get:async key=>({[key]:structuredClone(data[key])}),
    set:async patch=>{writes.push(structuredClone(patch));Object.assign(data,structuredClone(patch));},remove:async key=>{delete data[key];}
  }},tabs:{
    create:async options=>{const tab={...options,id:++id};created.push(tab);tabs.set(tab.id,tab);return tab;},
    update:async(id,patch)=>{const tab=tabs.get(id);if(!tab)throw Error('Missing tab');Object.assign(tab,patch);return tab;},
    get:async id=>{if(!tabs.has(id))throw Error('Missing tab');return {...tabs.get(id)};},
    remove:async id=>{closed.push(id);tabs.delete(id);},
    sendMessage:async(id,message)=>messages.push({id,message})
  }}};
  const load=()=>{vm.runInNewContext(source,context);return context.EbayVisibleScanner;};
  const api=load();
  const owner=()=>{const job=data['finder:visibleScan:active'];return {id:'extension',tab:{id:job.tabId},url:tabs.get(job.tabId).url,documentId:'listing-document'};};
  const send=(message,sender=owner())=>api.handle(message,sender);
  return {api,data,tabs,created,closed,messages,writes,owner,send,restart:load};
}
const rows=[{label:'PLA yellow',amount:12,currency:'GBP',inStock:true}];
test('visible scan owns a foreground tab before navigation, survives worker restart and closes only after the complete queue',async()=>{
  const h=setup(),started=await h.api.start(url,parent,{current:1,total:2});
  assert.equal(started.pending,true);assert.equal(h.created.length,1);
  assert.equal(h.created[0].active,true);assert.equal(h.created[0].openerTabId,1);
  const owner=h.owner();assert.equal(h.tabs.get(owner.tab.id).url,url);
  const api=h.restart();const context=await api.handle({type:'visible-scan-context'},owner);
  assert.equal(context.scan,true);assert.equal(context.progress.total,2);
  await api.handle({type:'visible-scan-report',jobId:started.jobId,status:'ready',rows},owner);
  assert.deepEqual(h.closed,[]);assert.ok(h.data['finder:visibleScan:result:1'].result.rows);
  assert.equal(h.data['finder:visibleScan:active'],undefined);
  assert.ok(h.tabs.has(owner.tab.id));
  const result=await api.handle({type:'visible-scan-poll',jobId:started.jobId},parent);
  assert.equal(result.rows[0].label,'PLA yellow');
  await api.handle({type:'visible-scan-finish'},parent);
  assert.deepEqual(h.closed,[owner.tab.id]);
});
test('challenge pauses the same tab; Retry keeps ownership and successful data retains it for reuse',async()=>{
  const h=setup(),started=await h.api.start(url,parent),owner=h.owner();
  await h.send({type:'visible-scan-report',jobId:started.jobId,status:'paused',detail:'Complete verification'},owner);
  let poll=await h.send({type:'visible-scan-poll',jobId:started.jobId},parent);
  assert.equal(poll.pending,true);assert.equal(poll.status,'paused');assert.equal(h.closed.length,0);
  const retry=await h.send({type:'visible-scan-action',jobId:started.jobId,action:'retry'},owner);
  assert.equal(retry.status,'loading');assert.equal(h.created.length,1);
  await h.send({type:'visible-scan-report',jobId:started.jobId,status:'ready',rows},owner);
  assert.equal(h.closed.length,0);
});
test('invalid stock data remains paused and is never cached as success',async()=>{
  const h=setup(),started=await h.api.start(url,parent);
  const response=await h.send({type:'visible-scan-report',jobId:started.jobId,status:'ready',rows:[{label:'unknown stock'}]});
  assert.equal(response.status,'paused');assert.equal(h.closed.length,0);
  assert.equal(h.data['finder:visibleScan:result:1'],undefined);
});
test('only one foreground listing can run across all search tabs',async()=>{
  const h=setup(),first=await h.api.start(url,parent);
  const duplicate=await h.api.start(url,parent);assert.equal(first.jobId,duplicate.jobId);
  const second=await h.api.start(url,{...parent,tab:{id:2,windowId:10}});
  assert.equal(second.paused,true);assert.equal(h.created.length,1);
});
test('Stop retains the scan tab and returns cancellation, not a successful listing',async()=>{
  const h=setup(),started=await h.api.start(url,parent);
  await h.send({type:'visible-scan-action',jobId:started.jobId,action:'stop'});
  const result=await h.send({type:'visible-scan-poll',jobId:started.jobId},parent);
  assert.equal(result.cancelled,true);assert.equal(result.rows,undefined);assert.equal(h.closed.length,0);
  assert.equal(h.messages.at(-1).message.type,'visible-scan-ended');
});
test('Skip retains the owned tab for the next listing and returns a skipped result',async()=>{
  const h=setup(),started=await h.api.start(url,parent);
  await h.send({type:'visible-scan-action',jobId:started.jobId,action:'skip'});
  const result=await h.send({type:'visible-scan-poll',jobId:started.jobId},parent);
  assert.equal(result.skipped,true);assert.equal(h.closed.length,0);
});
test('navigation away never closes the tab or accepts late rows',async()=>{
  const h=setup(),started=await h.api.start(url,parent),owner=h.owner();
  h.tabs.get(owner.tab.id).pendingUrl='https://www.ebay.co.uk/itm/999999999999';
  const result=await h.send({type:'visible-scan-report',jobId:started.jobId,status:'ready',rows},owner);
  assert.equal(result.cancelled,true);assert.equal(h.closed.length,0);
});
test('challenge redirects remain open, while navigating to another item ends ownership',async()=>{
  const h=setup();await h.api.start(url,parent);const owner=h.owner();
  await h.api.updated(owner.tab.id,{url:'https://signin.ebay.co.uk/signin/'});
  assert.equal(h.data['finder:visibleScan:active'].status,'paused');assert.equal(h.closed.length,0);
  await h.api.updated(owner.tab.id,{url:'https://www.ebay.co.uk/itm/999999999999'});
  assert.equal(h.data['finder:visibleScan:active'],undefined);assert.equal(h.closed.length,0);
});
test('source reload cancels the previous job but never closes its listing',async()=>{
  const h=setup();await h.api.start(url,parent);const old=h.owner();
  await h.api.start(url,{...parent,documentId:'new-search-document'});
  assert.equal(h.created.length,2);assert.equal(h.closed.length,0);assert.ok(h.tabs.has(old.tab.id));
});
test('unrelated tabs and documents cannot act on or retrieve the job',async()=>{
  const h=setup(),started=await h.api.start(url,parent);
  const unrelated={...parent,tab:{id:99}};
  assert.equal((await h.send({type:'visible-scan-context'},unrelated)).scan,false);
  const action=await h.send({type:'visible-scan-action',jobId:started.jobId,action:'skip'},unrelated);
  assert.ok(action.error);assert.equal(h.closed.length,0);
  const wrongDoc=await h.send({type:'visible-scan-poll',jobId:started.jobId},{...parent,documentId:'other'});
  assert.equal(wrongDoc.rows,undefined);
});
test('closing the source leaves the owned tab open and stops the job',async()=>{
  const h=setup();await h.api.start(url,parent);await h.api.removed(1);
  assert.equal(h.data['finder:visibleScan:active'],undefined);assert.equal(h.closed.length,0);
});
test('closing the scan tab returns a resumable cancellation',async()=>{
  const h=setup(),started=await h.api.start(url,parent),owner=h.owner();
  h.tabs.delete(owner.tab.id);await h.api.removed(owner.tab.id);
  const result=await h.send({type:'visible-scan-poll',jobId:started.jobId},parent);
  assert.equal(result.cancelled,true);
});

test('successive listing jobs navigate the same owned tab',async()=>{
  const h=setup(),first=await h.api.start(url,parent),owner=h.owner();
  await h.send({type:'visible-scan-report',jobId:first.jobId,status:'ready',rows},owner);
  const nextURL='https://www.ebay.co.uk/itm/999999999999';
  const second=await h.api.start(nextURL,parent);
  assert.equal(h.created.length,1);assert.equal(h.owner().tab.id,owner.tab.id);
  assert.equal(h.tabs.get(owner.tab.id).url,nextURL);assert.equal(h.closed.length,0);
  await h.send({type:'visible-scan-report',jobId:second.jobId,status:'ready',rows});
  await h.send({type:'visible-scan-finish'},parent);
  assert.deepEqual(h.closed,[owner.tab.id]);
});
