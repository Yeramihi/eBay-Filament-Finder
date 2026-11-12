const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(keys){
  const created=[],nodes=new Map(),changes=[];
  function element(tag='div') {
    const node={tag,children:[],handlers:{},hidden:false,className:'',textContent:'',classList:{toggle(){}},setAttribute(name,value){this[name]=value;},append(...children){this.children.push(...children);},before(other){this.beforeNode=other;},after(other){this.afterNode=other;},addEventListener(name,callback){this.handlers[name]=callback;}};
    created.push(node);return node;
  }
  const root={append(){},querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},querySelectorAll:()=>[]};
  const context={document:{createElement:element},Option:class{constructor(label,value){this.textContent=label;this.value=value;}},chrome:{storage:{onChanged:{addListener(){}}}},EbayRuntime:{local:{get:async()=>({})},report(){}}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/cards.js`,'utf8'),context);
  const sync=context.EbayCards.controls(root,keys,(key,ascending)=>changes.push({key,ascending}));
  return {created,nodes,changes,sync,sort:created.find(node=>node.tag==='select'),row:created.find(node=>node.className==='finder-sort-menu')};
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
