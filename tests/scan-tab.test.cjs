const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup({title='Filament listing',rows=[{label:'PLA',inStock:true}],relevant}={}){
  let clock=0,interval,reloads=0,reads=0;
  const windowHandlers={};
  const nodes=new Map(),messages=[];
  const get=key=>{if(!nodes.has(key))nodes.set(key,{textContent:'',hidden:false,disabled:false,handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}});return nodes.get(key);};
  const root={querySelector:get};
  const document={title,readyState:'complete',querySelectorAll:()=>[],documentElement:{append(){}},createElement:()=>({attachShadow:()=>root})};
  const context={document,window:{addEventListener:(type,fn)=>{windowHandlers[type]=fn;}},Date:{now:()=>clock},URL,JSON,Array,getComputedStyle:()=>({}),
    location:{origin:'https://www.ebay.co.uk',pathname:'/itm/396793856846',reload:()=>reloads++},
    setInterval:fn=>{interval=fn;return 1;},clearInterval(){},EbayListingData:()=>{reads++;return rows;},
    chrome:{runtime:{id:'extension',onMessage:{addListener(){}},sendMessage:async message=>{
      messages.push(message);
      if(message.type==='visible-scan-context')return {scan:true,jobId:'job',url:'https://www.ebay.co.uk/itm/396793856846',status:'loading'};
      if(message.status==='ready')return {rows:message.rows};
      return {status:message.status||'loading'};
    }}}
  };
  if(relevant!==undefined) context.EbayVariants={isMissingListing:()=>false,listingFilamentInfo:()=>({relevant})};
  context.EbayRuntime=require('./runtime-stub.cjs').forChrome(context.chrome);
  const ready=vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/scan-tab.js`,'utf8'),context);
  return {ready,get,messages,document,windowHandlers,setRows:r=>rows=r,get reads(){return reads;},get reloads(){return reloads;},advance:async ms=>{clock+=ms;await interval();await tick();}};
}
test('reader waits for complete, stable valid data before reporting success',async()=>{
  const h=setup();await h.ready;await tick();
  assert.equal(h.messages.filter(m=>m.status==='ready').length,0);
  await h.advance(1600);
  assert.equal(h.messages.filter(m=>m.status==='ready').length,1);
});
test('challenge pauses extraction; manual Retry after resolution reads the same listing',async()=>{
  const h=setup({title:'Pardon Our Interruption'});await h.ready;await tick();
  assert.equal(h.get('.retry').hidden,false);assert.equal(h.reads,0);
  await h.advance(3000);assert.equal(h.reads,0);
  await h.get('.retry').handlers.click();assert.equal(h.reads,0);
  h.document.title='Filament listing';await h.get('.retry').handlers.click();await h.advance(1600);
  assert.equal(h.messages.filter(m=>m.status==='ready').length,1);assert.equal(h.reloads,0);
});
test('unreadable listing times out to Retry/Skip/Stop, then user Retry can reload it',async()=>{
  const h=setup({rows:[]});await h.ready;await tick();await h.advance(46000);
  assert.equal(h.get('.retry').hidden,false);assert.equal(h.get('.skip').hidden,false);
  assert.equal(h.messages.filter(m=>m.status==='ready').length,0);
  await h.get('.retry').handlers.click();assert.equal(h.reloads,1);
});
test('normal listing sidebar exits before mounting anything in a managed scan tab',async()=>{
  const context={chrome:{runtime:{sendMessage:async()=>({scan:true})}}};
  context.EbayRuntime=require('./runtime-stub.cjs').forChrome(context.chrome);
  await vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/content.js`,'utf8'),context);
  // No document API exists in this test: reaching any mounting code fails.
});

test('Retry reloads rows with missing stock rather than repeatedly accepting incomplete data',async()=>{
  const h=setup({rows:[{label:'PLA',amount:12}]});await h.ready;await tick();await h.advance(46000);
  await h.get('.retry').handlers.click();assert.equal(h.reloads,1);
  assert.equal(h.messages.filter(m=>m.status==='ready').length,0);
});

test('Escape in a visible scan tab requests Stop, including while waiting between listings',async()=>{
  const h=setup();await h.ready;await tick();await h.advance(1600);
  let prevented=false;
  h.windowHandlers.keydown({key:'Escape',preventDefault:()=>prevented=true,stopImmediatePropagation(){}});await tick();
  assert.equal(prevented,true);
  assert.ok(h.messages.some(m=>m.type==='visible-scan-action'&&m.action==='stop'));
});

test('visible reader skips unrelated listings before reading or saving variant data',async()=>{
  const h=setup({title:'TPU phone case',relevant:false});await h.ready;await tick();
  assert.equal(h.messages.some(message=>message.status==='irrelevant'),true);
  assert.equal(h.messages.some(message=>message.status==='ready'),false);
  assert.equal(h.reads,0);
});
