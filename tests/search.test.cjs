const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/../js/search.js`, 'utf8');
const materialContext={};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/variants.js`, 'utf8'),materialContext);
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
function element() {
  return {hidden:false, open:true, value:'', disabled:false, textContent:'', style:{setProperty(){}},
    classList:{toggle(){},add(){},contains(){return false;}}, querySelector(){return element();},querySelectorAll(){return [];},remove(){},handlers:{}, setAttribute(){}, focus(){this.focused=true;}, append(){}, replaceChildren(){},
    addEventListener(type, fn){this.handlers[type]=fn;}, closest(){return null;}};
}
function harness({fastRetries=false,query='yellow PLA silk',visibleMode=false,parallel=1,mode,realRuntime=false,allCache=false,invalidateCache=false,saved={},automaticScan=false,initialCandidates=[],initialFilament=false}={}) {
  const nodes = new Map();
  const windowHandlers = {}, runtimeHandlers = [], pageChildren = [], requestMessages = [];
  const get = selector => {if (!nodes.has(selector)) nodes.set(selector, element()); return nodes.get(selector);};
  get('.finder-toolbar').hidden = true;
  const radio = {value:'and', checked:true};
  const root = {querySelector:get, querySelectorAll:()=>[radio]};
  const buttons = [], calls = [], pending = [], collapsed = [], snapshots = [], controlMessages = [], polls = [];
  let candidates = initialCandidates, hasFilament = initialFilament, observer;
  let pagination = {page:1,previous:null,next:null};
  const rendered=[];
  const cache=new Map();let activeURL;
  const context = {
    console, URL, Intl, Map, Set, WeakMap, performance, setTimeout:(fn,ms)=>setTimeout(fn,fastRetries && ms===3000?0:ms), clearTimeout, setInterval(){},clearInterval(){},
    location:{href:'https://www.ebay.co.uk/sch/i.html?_nkw=yellow+PLA+silk',origin:'https://www.ebay.co.uk'},
    window:{addEventListener:(type,fn)=>{(windowHandlers[type] ||= []).push(fn);}}, Node:{ELEMENT_NODE:1},
    document:{addEventListener(){},documentElement:{append:element=>pageChildren.push(element)}, getElementById(){return null;}, createElement(tag){
      const e=element(); e.attachShadow=()=>root;
      if(tag==='button')buttons.push(e); return e;
    }},
    MutationObserver:class {constructor(fn){observer=fn;} observe(){}disconnect(){}},
    chrome:{runtime:{id:'test-extension',onMessage:{addListener:fn=>runtimeHandlers.push(fn)},getURL:x=>x,sendMessage:message=>{
      if(message.type==='finder-cache-index') return invalidateCache ? Promise.reject(new Error('Extension context invalidated.')) : Promise.resolve({items:[]});
      if(message.type==='finder-cache-read')return Promise.resolve({items:message.urls.map(url=>({url,rows:cache.get(url)}))});
      if(message.type==='scan-listing'){activeURL=message.url;requestMessages.push(message);calls.push(message.url);return new Promise(resolve=>pending.push(response=>{if(response.rows)cache.set(message.url,response.rows);resolve(response);}));}
      controlMessages.push(message);
      if(message.type==='visible-scan-poll')return new Promise(resolve=>polls.push(response=>{if(response.rows)cache.set(activeURL,response.rows);resolve(response);}));
      return Promise.resolve({cancelled:true});}},
      storage:{onChanged:{addListener(){}},local:{get:async()=>({parallelListings:parallel,'finder:visibleScan':visibleMode,'finder:scanMode':mode===undefined ? (visibleMode?'visible':'background') : mode,'finder:cache:showAll':allCache,'finder:automaticScan':automaticScan})}}},

    EbaySearchPagination:()=>pagination,
    EbaySearchListings:()=>candidates,
    EbaySearchResultsKey:()=>candidates.map(x=>x.url+':'+x.title).join('\n'),
    EbaySearchHasFilament:()=>hasFilament,
    EbaySearchQuery:()=>query,
    EbaySettings:{defaultParallel:1},
    EbayDock:{ready:Promise.resolve(saved), setCompact(){},mount(){},setAutoCollapsed:x=>collapsed.push(x),
      isCollapsed:()=>collapsed.at(-1)===true,
      save:x=>snapshots.push(x),saveSort(){},onSortChange(){},getSort:async()=>null},
    EbayCards:{controls:()=>()=>{},tooltip(){},setFiltersExpanded:(r,v)=>{get('.finder-toolbar').hidden=!v;},
      showEntries(){},emptyState:()=>({}),entry:()=>({}),updateAverage(){}},
    EbaySearchView:{yieldTurn:()=>Promise.resolve(),sort:async(rows,compare,current)=>current()?rows.sort(compare):null,create:()=>({set(container,rows){rendered.push(rows);},dispose(){}})},
    EbayVariants:{ambiguousFilamentTypes:materialContext.EbayVariants.ambiguousFilamentTypes,attachQueryValidation:materialContext.EbayVariants.attachQueryValidation,spoolEstimate:()=>({}),comparePrice:()=>0, terms:q=>q.toLowerCase().split(/\s+/).filter(Boolean), matchingAverage:()=>null, matches:(text,words)=>words.every(word=>text.toLowerCase().includes(word))}
  };
  if(realRuntime) vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/runtime.js`,'utf8'),context);
  else context.EbayRuntime=require('./runtime-stub.cjs').forChrome(context.chrome);
  vm.runInNewContext(source,context);
  return {get, cache,rendered,buttons,calls,pending,collapsed,snapshots,controlMessages,polls,windowHandlers,runtimeHandlers,pageChildren,requestMessages,
    setCandidates: x=>candidates=x,
    setPagination:x=>pagination=x,
    async ownMutation(){observer([{type:'attributes',target:{nodeType:1,closest:()=>({})}}]);await new Promise(r=>setTimeout(r,280));},
    async discover(filament=false){hasFilament=filament;observer([{type:'childList',target:{nodeType:1,closest:()=>null},addedNodes:[{nodeType:1,matches:()=>false}],removedNodes:[]}]);await new Promise(r=>setTimeout(r,280));},
    async complete(){pending.shift()({rows:[{label:'yellow PLA silk'}]});await tick();}
  };
}
const listing = id => ({url:`https://www.ebay.co.uk/itm/${id}`,title:`Filament ${id}`});
test('initial scan preserves an empty filter; pagination extends and resumes without duplicates',async()=>{
  const h=harness();await tick();assert.equal(h.collapsed[0],true);
  h.setCandidates([listing(1),listing(2)]);
  await h.buttons[0].handlers.click();await tick();
  assert.equal(h.get('#variant-query').value,'');
  assert.equal(h.get('.finder-toolbar').hidden,false);
  assert.equal(h.calls.length,1);
  h.setCandidates([listing(2),listing(3)]);await h.discover(true);
  assert.equal(h.collapsed.at(-1),false);
  await h.complete();await h.complete();await h.complete();
  assert.deepEqual(h.calls,[listing(1).url,listing(2).url,listing(3).url]);
  h.setCandidates([listing(3),listing(4)]);await h.discover();await h.complete();
  assert.equal(h.calls.length,4);
  await h.discover();assert.equal(h.calls.length,4);
  assert.equal(h.snapshots.filter(x=>x.results).at(-1).results.length,4);
});
test('Stop retains pending work and manual Scan resumes without rescanning completed items',async()=>{
  const h=harness();await tick();h.setCandidates([listing(1),listing(2)]);
  await h.buttons[0].handlers.click();await tick();
  h.buttons[1].handlers.click();await h.complete();
  h.setCandidates([listing(2),listing(3)]);await h.discover();
  assert.equal(h.calls.length,1);
  await h.buttons[0].handlers.click();await tick();
  await h.complete();await h.complete();
  assert.deepEqual(h.calls,[listing(1).url,listing(2).url,listing(3).url]);
  await h.buttons[0].handlers.click();await tick();assert.equal(h.calls.length,3);
});
test('title detection uses whole words and ignores non-title listing text',()=>{
  const bridge=fs.readFileSync(`${__dirname}/../js/search-bridge.js`,'utf8');
  let titles=[];
  const list={closest:()=>null,querySelectorAll:()=>titles};
  const context={document:{querySelectorAll:()=>[list],documentElement:{}},
    chrome:{runtime:{onMessage:{addListener(){}}}},getComputedStyle:()=>({}),location:{href:'https://www.ebay.co.uk/sch/i.html'}};
  vm.runInNewContext(bridge,context);
  const title=textContent=>({textContent,closest:()=>null,getAttribute:()=>null,parentElement:null});
  for(const [text,expected] of [['FILAMENT spool',true],['silk-filament',true],['filaments',false],['microfilament',false],['PLA spool',false]]){
    titles=[title(text)];assert.equal(context.EbaySearchHasFilament(),expected,text);
  }
  titles=[];assert.equal(context.EbaySearchHasFilament(),false);
});

test('extension mutations do not trigger discovery or automatic opening',async()=>{
  const h=harness();await tick();const before=h.collapsed.length;
  await h.ownMutation();assert.equal(h.collapsed.length,before);
});
test('dock keeps open across results and can open again when new filament appears',async()=>{
  const nodes=new Map();
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  const root={querySelector:get,addEventListener(){}};
  let restore;
  const context={console,setTimeout,clearTimeout,innerWidth:1000,
    location:{pathname:'/sch/i.html',origin:'https://www.ebay.co.uk',href:'https://www.ebay.co.uk/sch/i.html'},
    window:{addEventListener(){}},
    document:{head:{append(){}},documentElement:{style:{setProperty(){}},setAttribute(){},append(){}},createElement(){
      const node=element();node.style={setProperty(){}};node.attachShadow=()=>root;return node;
    }},
    chrome:{storage:{session:{get:async()=>({}),set:async()=>{}},local:{get:()=>new Promise(resolve=>restore=resolve),set:async()=>{}},onChanged:{addListener(){}}}}
  };
  context.EbayRuntime=require('./runtime-stub.cjs').forChrome(context.chrome);
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/dock.js`,'utf8'),context);
  const dock=context.EbayDock;
  const toggles=[];dock.onToggle(value=>toggles.push(value));
  dock.setAutoCollapsed(false);dock.mount(element());
  restore({'finder:results:collapsed':true});await tick();
  assert.equal(get('.content').hidden,false);
  get('.rail').handlers.click();assert.equal(get('.content').hidden,true);
  dock.setAutoCollapsed(true);assert.equal(get('.content').hidden,true);
  dock.setAutoCollapsed(false);assert.equal(get('.content').hidden,false);
  dock.setAutoCollapsed(true);assert.equal(get('.content').hidden,false);
  assert.deepEqual(toggles,[true]);
  get('.rail').handlers.click();
  get('.rail').handlers.click();
  assert.deepEqual(toggles,[true,true,false]);
});
test('pagination before the first user Scan never requests listings',async()=>{
  const h=harness();await tick();
  h.setCandidates([listing(1)]);await h.discover(true);
  h.setCandidates([listing(2)]);await h.discover(true);
  assert.deepEqual(h.calls,[]);
  await h.buttons[0].handlers.click();await tick();await h.complete();
  assert.deepEqual(h.calls,[listing(2).url]);
});
test('completed scan resumes repeatedly, keeping its filter and never repeating cached listings',async()=>{
  const h=harness();await tick();h.setCandidates([listing(1)]);
  await h.buttons[0].handlers.click();await tick();await h.complete();
  h.get('#variant-query').value='custom filter';
  h.get('.apply-filters').handlers.click();
  for(let id=2;id<=5;id++){
    h.setCandidates([listing(1),listing(id)]);await h.discover(true);await h.complete();
  }
  assert.equal(h.get('#variant-query').value,'custom filter');
  assert.deepEqual(h.calls,[1,2,3,4,5].map(id=>listing(id).url));
  assert.equal(h.snapshots.filter(x=>'checked' in x).at(-1).checked,5);
});
test('Resize eBay reserves full open width, protects the rail when collapsed and updates live',async()=>{
  const nodes=new Map(), props=new Map(), styles=[];
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);};
  const root={querySelector:get,addEventListener(){}};
  let restore,onChange;
  const context={console,setTimeout,clearTimeout,innerWidth:1000,
    location:{pathname:'/itm/123456789',origin:'https://www.ebay.co.uk',href:'https://www.ebay.co.uk/itm/123456789'},
    window:{addEventListener(){}},
    document:{head:{append:e=>styles.push(e)},documentElement:{style:{setProperty:(k,v)=>props.set(k,v)},setAttribute(){},append(){}},createElement(){
      const node=element();node.style={setProperty(){}};node.attachShadow=()=>root;return node;
    }},chrome:{storage:{session:{get:async()=>({}),set:async()=>{}},local:{get:()=>new Promise(resolve=>restore=resolve),set:async()=>{}},onChanged:{addListener:fn=>onChange=fn}}}
  };
  context.EbayRuntime=require('./runtime-stub.cjs').forChrome(context.chrome);
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/dock.js`,'utf8'),context);
  const dock=context.EbayDock;dock.mount(element());
  assert.equal(props.get('--ebay-finder-inset'),'44px');
  restore({'finder:resizeEbay':true});await tick();
  assert.equal(props.get('--ebay-finder-inset'),'min(100vw, max(280px, 25vw))');
  onChange({'finder:widthPercent':{newValue:50},'finder:side':{newValue:'left'}},'local');
  assert.equal(props.get('--ebay-finder-inset'),'min(100vw, max(280px, 50vw))');
  get('.rail').handlers.click();assert.equal(props.get('--ebay-finder-inset'),'44px');
  get('.rail').handlers.click();dock.setCompact(true);
  assert.equal(props.get('--ebay-finder-inset'),'min(320px, 100vw)');
  onChange({'finder:resizeEbay':{newValue:false}},'local');
  assert.equal(props.get('--ebay-finder-inset'),'44px');
  assert.match(styles[0].textContent,/width:calc\(100% - var\(--ebay-finder-inset, 44px\)\)/);
  assert.match(styles[0].textContent,/\.lightbox-dialog/);
});

test('new results resume after a request failure without retrying the already failed listing',async()=>{
  const h=harness({fastRetries:true});await tick();h.setCandidates([listing(1)]);
  await h.buttons[0].handlers.click();await tick();
  h.pending.shift()({error:'Temporary eBay failure'});await tick();
  h.pending.shift()({error:'Temporary eBay failure'});await tick();
  assert.equal(h.buttons[0].disabled,false);
  h.setCandidates([listing(1),listing(2)]);await h.discover(true);await h.complete();
  assert.deepEqual(h.calls,[listing(1).url,listing(1).url,listing(2).url]);
  assert.equal(h.snapshots.filter(x=>x.failures).at(-1).failures.length,1);
});

test('starting a scan never copies the eBay query or replaces user-entered filters',async()=>{
  for(const initial of ['', 'silk purple']) {
    const h=harness({query:'FILAMENT yellow PLA'});await tick();h.setCandidates([listing(1)]);
    h.get('#variant-query').value=initial;
    h.get('#listing-query').value='my listing filter';
    await h.buttons[0].handlers.click();await tick();await h.complete();
    assert.equal(h.get('#variant-query').value,initial);
    assert.equal(h.get('#listing-query').value,'my listing filter');
  }
});

test('sidebar pagination refreshes page number, disabled buttons and stale links without starting a scan',async()=>{
  const h=harness();await tick();let clicks=0,staleClicks=0;
  assert.equal(h.get('.finder-previous-page').disabled,true);
  assert.equal(h.get('.finder-next-page').disabled,true);
  assert.equal(h.get('.finder-page-number').textContent,'Page 1');
  h.setPagination({page:1,previous:null,next:{click:()=>staleClicks++}});await h.discover();
  assert.equal(h.get('.finder-next-page').disabled,false);
  h.setPagination({page:1,previous:null,next:{click:()=>clicks++}});
  h.get('.finder-next-page').handlers.click();
  assert.equal(clicks,1);assert.equal(staleClicks,0);
  h.setPagination({page:2,previous:{click:()=>clicks++},next:null});await h.discover();
  assert.equal(h.get('.finder-page-number').textContent,'Page 2');
  assert.equal(h.get('.finder-next-page').disabled,true);
  assert.equal(h.get('.finder-previous-page').disabled,false);
  h.get('.finder-previous-page').handlers.click();assert.equal(clicks,2);
  h.setPagination({page:1,previous:null,next:null});await h.discover();
  assert.equal(h.get('.finder-previous-page').disabled,true);
  assert.equal(h.get('.finder-next-page').disabled,true);
  assert.deepEqual(h.calls,[]);
});

test('visible mode forces serial processing even when parallel is set to five',async()=>{
  const h=harness({visibleMode:true,parallel:5});await tick();h.setCandidates([listing(1),listing(2)]);
  await h.buttons[0].handlers.click();await tick();assert.equal(h.calls.length,1);
  await h.complete();assert.equal(h.calls.length,2);await h.complete();
});
test('visible cancellation retains the candidate for Resume without clearing successful cache',async()=>{
  const h=harness({visibleMode:true});await tick();h.setCandidates([listing(1),listing(2)]);
  await h.buttons[0].handlers.click();await tick();await h.complete();
  h.pending.shift()({cancelled:true,error:'User stopped visible scan'});await tick();
  assert.equal(h.buttons[0].disabled,false);
  assert.equal(h.snapshots.filter(s=>s.results).at(-1).results.length,1);
  await h.buttons[0].handlers.click();await tick();await h.complete();
  assert.deepEqual(h.calls,[listing(1).url,listing(2).url,listing(2).url]);
  assert.equal(h.snapshots.filter(s=>s.results).at(-1).results.length,2);
});
test('visible job is polled while paused and retains its original candidate on cancel',async()=>{
  const h=harness({visibleMode:true});await tick();h.setCandidates([listing(1)]);
  await h.buttons[0].handlers.click();await tick();
  h.pending.shift()({pending:true,jobId:'visible-job'});await tick();assert.equal(h.polls.length,1);
  h.polls.shift()({cancelled:true,error:'Scan tab closed'});await tick();
  assert.equal(h.buttons[0].disabled,false);assert.equal(h.get('.scan-notice').hidden,false);
  assert.equal(h.snapshots.filter(s=>s.failures?.length).length,0);
  await h.buttons[0].handlers.click();await tick();await h.complete();
  assert.deepEqual(h.calls,[listing(1).url,listing(1).url]);
});

// Mixed mode drains in-flight background work before serial visible recovery.
for(const mode of ['mixed',null]) test(`${mode===null?'default mixed':'mixed'} drains parallel background jobs before visible recovery, then resumes background`,async()=>{
  const h=harness({mode,parallel:2});await tick();h.setCandidates([listing(1),listing(2),listing(3)]);
  await h.buttons[0].handlers.click();await tick();
  assert.equal(h.calls.length,2);assert.equal(h.requestMessages[0].visible,false);
  h.pending.shift()({error:'eBay requires verification'});await tick();
  assert.equal(h.calls.length,2,'visible fallback waits for the other background request');
  await h.complete();assert.equal(h.calls.length,3);assert.equal(h.requestMessages[2].visible,true);
  assert.equal(h.requestMessages[2].url,listing(1).url);
  await h.complete();assert.equal(h.requestMessages[3].visible,false);
  assert.equal(h.requestMessages[3].url,listing(3).url);await h.complete();
  assert.equal(h.snapshots.filter(s=>s.results).at(-1).results.length,3);
});
test('Escape on the search page pauses scanning and retains queued candidates',async()=>{
  const h=harness({mode:'mixed'});await tick();h.setCandidates([listing(1),listing(2)]);
  await h.buttons[0].handlers.click();await tick();let prevented=false;
  for(const handler of h.windowHandlers.keydown)handler({key:'Escape',preventDefault:()=>prevented=true,stopImmediatePropagation(){}});
  assert.equal(prevented,true);assert.equal(h.buttons[1].disabled,true);
  h.pending.shift()({error:'Interrupted'});await tick();
  assert.equal(h.calls.length,1);
  await h.buttons[0].handlers.click();await tick();await h.complete();await h.complete();
  assert.deepEqual(h.calls,[listing(1).url,listing(1).url,listing(2).url]);
});

test('a context invalidated during real cache-index loading cancels the search and disables stale controls',async()=>{
  const h=harness({realRuntime:true,allCache:true,invalidateCache:true});
  await tick();await tick();
  assert.equal(h.buttons[0].disabled,true);
  assert.equal(h.buttons[1].disabled,true);
  assert.equal(h.calls.length,0);
  await h.discover();
  assert.equal(h.calls.length,0);
});

test('listing title search starts hidden, can be added, and removal clears its applied filter',async()=>{
  const h=harness();await tick();
  assert.equal(h.get('#listing-filter').hidden,true);
  assert.equal(h.get('.add-listing-filter').hidden,false);
  h.get('.add-listing-filter').handlers.click();
  assert.equal(h.get('#listing-filter').hidden,false);
  assert.equal(h.get('#listing-query').focused,true);
  h.get('#listing-query').value='brand';
  h.get('.apply-filters').handlers.click();await tick();
  assert.equal(h.snapshots.at(-1).appliedListingQuery,'brand');
  h.get('.remove-listing-filter').handlers.click();await tick();
  assert.equal(h.get('#listing-filter').hidden,true);
  assert.equal(h.get('#listing-query').value,'');
  assert.equal(h.snapshots.at(-1).appliedListingQuery,'');
  assert.equal(h.snapshots.at(-1).listingFilterVisible,false);
});

test('restored title filters stay visible and old OR preferences now require both matches',async()=>{
  const rows=[
    {url:listing(1).url,title:'Brand filament',label:'yellow PLA',inStock:true},
    {url:listing(2).url,title:'Other filament',label:'yellow PLA',inStock:true},
    {url:listing(3).url,title:'Brand filament',label:'blue PLA',inStock:true}
  ];
  const h=harness({saved:{discoveryVersion:2,query:'yellow',listingQuery:'brand',combine:'or',appliedCombine:'or',results:rows}});
  await tick();await tick();
  assert.equal(h.get('#listing-filter').hidden,false);
  assert.equal(h.get('#listing-query').value,'brand');
  assert.deepEqual(h.rendered.flat().map(row=>row.url).filter(Boolean),[listing(1).url]);
});

test('single-item multi-material listings move below Results, while real variants stay in Results',async()=>{
  const rows=[
    {url:listing(1).url,title:'2 X YOYI PLA Classic PLA+ PETG SILK ASA TPU White',label:'Mixed title',singleItem:true,inStock:true},
    {url:listing(2).url,title:'PLA PETG filament',label:'PLA white',singleItem:false,inStock:true},
    {url:listing(3).url,title:'PLA silk PLA+ white',label:'PLA white',singleItem:true,inStock:true},
    {url:listing(4).url,title:'PLA PETG',label:'PLA PETG',singleItem:true,outOfStock:true}
  ];
  const h=harness({saved:{discoveryVersion:2,results:rows}});await tick();await tick();
  const batches=h.rendered.slice(-4);
  assert.deepEqual(Array.from(batches[0],row=>row.url).sort(),[listing(2).url,listing(3).url]);
  assert.deepEqual(Array.from(batches[1],row=>row.url).sort(),[listing(1).url,listing(4).url]);
  assert.equal(h.get('.finder-unrecognised').hidden,false);
  assert.equal(batches[3].length,0);
  assert.ok(source.indexOf('class="finder-unrecognised"')>source.indexOf('class="results"'));
  assert.ok(source.indexOf('class="finder-unrecognised"')<source.indexOf('class="finder-hidden"'));
});

test('invalid filters show an error only on submit and preserve both last valid filters',async()=>{
  const h=harness();await tick();
  assert.equal(h.get('#variant-query-error').hidden,true);
  h.get('#variant-query').value='PLA';
  h.get('.apply-filters').handlers.click();await tick();
  const count=h.snapshots.length;
  h.get('#variant-query').value='(white ASA) OR (black PETG';
  h.get('#variant-query').handlers.keydown({key:'Enter',preventDefault(){}});
  await tick();
  assert.match(h.get('#variant-query-error').textContent,/Missing closing bracket/);
  assert.equal(h.get('#variant-query-error').hidden,false);
  assert.equal(h.snapshots.length,count);
  h.get('#variant-query').handlers.input();
  assert.equal(h.get('#variant-query-error').hidden,true);
  h.get('#variant-query').value='PETG';
  h.get('.add-listing-filter').handlers.click();
  const before=h.snapshots.length;
  h.get('#listing-query').value='brand OR';
  h.get('.apply-filters').handlers.click();await tick();
  assert.equal(h.get('#listing-query-error').hidden,false);
  assert.equal(h.snapshots.length,before);
  h.get('#listing-query').value='brand';
  h.get('.apply-filters').handlers.click();await tick();
  assert.equal(h.get('#listing-query-error').hidden,true);
  assert.equal(h.snapshots.at(-1).appliedQuery,'PETG');
  assert.equal(h.snapshots.at(-1).appliedListingQuery,'brand');
});

test('automatic scan starts on initial filament results and respects Stop',async()=>{
  const h=harness({automaticScan:true,initialCandidates:[listing(1)],initialFilament:true});
  await new Promise(resolve=>setTimeout(resolve,320));
  assert.equal(h.calls.length,1);
  h.buttons[1].handlers.click();await h.complete();
  h.setCandidates([listing(1),listing(2)]);await h.discover(true);
  assert.equal(h.calls.length,1);
});
test('automatic scan is gated by filament detection and reuses fresh cache',async()=>{
  const h=harness({automaticScan:true,initialCandidates:[listing(1)]});
  await new Promise(resolve=>setTimeout(resolve,320));
  assert.equal(h.calls.length,0);
  h.cache.set(listing(1).url,[{label:'PLA',inStock:true}]);
  await h.discover(true);
  assert.equal(h.calls.length,0);
  h.setCandidates([listing(1),listing(2)]);await h.discover(true);
  assert.deepEqual(h.calls,[listing(2).url]);await h.complete();
  // Cache reads omit entries outside retention, just as a cache miss does.
  h.cache.delete(listing(1).url);await h.discover(true);
  assert.deepEqual(h.calls,[listing(2).url,listing(1).url]);await h.complete();
});
