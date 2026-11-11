const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  let previous=[],next=[],selected='1',present=true;
  const nav={closest:selector=>selector.includes('.srp-river-answer')?{}:null,getAttribute:()=>null,parentElement:null,
    querySelector:()=>selected===null?null:{textContent:selected},
    querySelectorAll:selector=>selector.includes('pagination__previous')?previous:next};
  const context={URL,document:{documentElement:{},querySelectorAll:()=>present?[nav]:[]},location:{href:'https://www.ebay.co.uk/sch/i.html?_pgn=7'},getComputedStyle:()=>({}),chrome:{runtime:{onMessage:{addListener(){}}}}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/search-bridge.js`,'utf8'),context);
  function anchor(href,{disabled=false,hidden=false}={}){return {hidden,parentElement:null,getAttribute:name=>name==='href'?href:null,closest:()=>disabled?{}:null};}
  return {read:context.EbaySearchPagination,anchor,set:(p,n,page)=>{previous=p;next=n;selected=page;},remove:()=>present=false,context};
}
test('pagination reads first, middle, last and single pages from actual-style link states',()=>{
  const h=setup(),previous=h.anchor('/sch/i.html?_pgn=1'),next=h.anchor('/sch/i.html?_pgn=3');
  h.set([], [next], '1');let p=h.read();assert.equal(p.page,1);assert.equal(p.previous,null);assert.equal(p.next,next);
  h.set([previous],[next],'2');p=h.read();assert.equal(p.page,2);assert.equal(p.previous,previous);assert.equal(p.next,next);
  h.set([previous],[],'3');p=h.read();assert.equal(p.page,3);assert.equal(p.next,null);
  h.set([],[],'1');p=h.read();assert.equal(p.previous,null);assert.equal(p.next,null);
  h.remove();p=h.read();assert.equal(p.page,7);assert.equal(p.previous,null);assert.equal(p.next,null);
});
test('pagination refuses disabled, hidden, placeholder, external and non-search links',()=>{
  const h=setup();
  for(const link of [h.anchor('/sch/i.html?_pgn=2',{disabled:true}),h.anchor('/sch/i.html?_pgn=2',{hidden:true}),h.anchor('#'),h.anchor(''),h.anchor('javascript:void(0)'),h.anchor('https://example.com/sch/i.html'),h.anchor('/itm/123456789')]){
    h.set([],[link],'1');assert.equal(h.read().next,null);
  }
  h.set([],[],null);assert.equal(h.read().page,7);
  h.context.location.href='https://www.ebay.co.uk/sch/i.html?_pgn=bad';assert.equal(h.read().page,1);
});
