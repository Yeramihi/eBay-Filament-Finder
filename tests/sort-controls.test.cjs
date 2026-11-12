const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(keys,pathname='/sch/i.html',saved={}){
  let storageChange;
  const created=[],nodes=new Map(),changes=[];
  function element(tag='div') {
    const node={tag,children:[],handlers:{},hidden:false,className:'',textContent:'',classList:{values:{},toggle(key,value){this.values[key]=value;}},setAttribute(name,value){this[name]=value;},append(...children){this.children.push(...children);},before(other){this.beforeNode=other;},after(other){this.afterNode=other;},addEventListener(name,callback){this.handlers[name]=callback;}};
    created.push(node);return node;
  }
  const root={append(){},querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},querySelectorAll:()=>[]};
  const context={location:{pathname},document:{createElement:element},Option:class{constructor(label,value){this.textContent=label;this.value=value;}},chrome:{storage:{onChanged:{addListener(callback){storageChange=callback;}}}},EbayRuntime:{local:{get:async()=>saved},report(){}}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/cards.js`,'utf8'),context);
  const sync=context.EbayCards.controls(root,keys,(key,ascending)=>changes.push({key,ascending}));
  return {created,nodes,changes,sync,storageChange,sort:created.find(node=>node.tag==='select'),row:created.find(node=>node.className==='finder-sort-menu')};
}
test('sort dropdown is permanently on its own row below the toolbar buttons',()=>{
  const h=setup([['label','Variant'],['total','Individual purchase']]);
  assert.equal(h.row.tag,'div');assert.equal(h.row.hidden,false);
  const buttons=h.nodes.get('.finder-toolbar').beforeNode;
  assert.equal(buttons.afterNode,h.row);
  assert.ok(!h.created.some(node=>node.tag==='summary'&&node.textContent==='Sort by'));
  h.sync('total',false);assert.equal(h.sort.value,'total:false');assert.equal(h.row.hidden,false);
});
test('text and price choices use readable directions and retain sort behavior',()=>{
  const h=setup([['title','Listing'],['label','Variant'],['total','Individual purchase'],['average','Mixed bulk average']]);
  assert.deepEqual(h.sort.children.map(option=>option.textContent),[
    'Listing — A–Z','Listing — Z–A','Variant — A–Z','Variant — Z–A',
    'Individual purchase — Low–High','Individual purchase — High–Low','Mixed bulk average — Low–High','Mixed bulk average — High–Low'
  ]);
  h.sort.value='average:false';h.sort.handlers.change();
  assert.deepEqual(h.changes,[{key:'average',ascending:false}]);
});

test('listing and search views restore independently and ignore the other page preference',async()=>{
  const saved={'finder:display':'lines','finder:results:display':'photos','finder:listing:display':'tiles'};
  const results=setup([['total','Price']],'/sch/i.html',saved);
  const listing=setup([['total','Price']],'/itm/123',saved);
  await Promise.resolve();
  const resultClasses=results.nodes.get('.finder-entries').classList.values;
  const listingClasses=listing.nodes.get('.finder-entries').classList.values;
  assert.equal(resultClasses['photos-only'],true);assert.equal(listingClasses['photos-only'],false);
  results.storageChange({'finder:listing:display':{newValue:'lines'}},'local');
  assert.equal(resultClasses['photos-only'],true);
  listing.storageChange({'finder:listing:display':{newValue:'lines'}},'local');
  assert.equal(listingClasses.lines,true);
});
test('existing shared view preference remains the fallback on both page types',async()=>{
  for(const path of ['/sch/i.html','/itm/123']) {
    const h=setup([['total','Price']],path,{'finder:display':'photos'});
    await Promise.resolve();assert.equal(h.nodes.get('.finder-entries').classList.values['photos-only'],true);
  }
});
