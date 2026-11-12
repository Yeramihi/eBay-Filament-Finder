const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
function setup(){
  class Node {
    constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.attrs={};this.events={};this.className='';this._text='';this.classList={contains:name=>this.className.split(/\s+/).includes(name),toggle:(name,yes)=>{const classes=new Set(this.className.split(/\s+/).filter(Boolean));if(yes)classes.add(name);else classes.delete(name);this.className=[...classes].join(' ');}};}
    append(...nodes){for(let node of nodes){if(typeof node==='string')node=new Node('#text');node.remove();node.parent=this;this.children.push(node);}}
    prepend(node){this.append(node);this.children.unshift(this.children.pop());}
    after(node){const parent=this.parent;if(!parent)return;node.remove();node.parent=parent;parent.children.splice(parent.children.indexOf(this)+1,0,node);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);this.parent=undefined;}
    replaceChildren(...nodes){for(const child of this.children)child.parent=undefined;this.children=[];this._text='';this.append(...nodes);}
    get childNodes(){return this.children;}
    get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
    set textContent(text){this.children=[];this._text=text;}
    setAttribute(name,value){this.attrs[name]=value;if(name==='id')this.id=value;}
    removeAttribute(name){delete this.attrs[name];}
    hasAttribute(name){return name in this.attrs;}
    matches(selector){return selector.split(',').some(raw=>{const part=raw.trim();if(part.startsWith('.'))return this.classList.contains(part.slice(1));if(part.startsWith('[')){const [,name,value]=part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)||[];const current=name?.startsWith('data-')?this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:this.attrs[name];return current!==undefined&&(value===undefined||current===value);}return this.tagName===part.toUpperCase();});}
    querySelectorAll(selector){const parts=selector.split(' '),last=parts.pop(),found=[];const visit=node=>{for(const child of node.children){if(child.matches(last)&&(!parts.length||child.closest(parts.join(' '))))found.push(child);visit(child);}};visit(this);return found;}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){for(let node=this;node;node=node.parent)if(node.matches(selector))return node;return null;}
    getRootNode(){let root=this;while(root.parent)root=root.parent;return root;}
    addEventListener(type,handler){(this.events[type]||=[]).push(handler);}
    removeEventListener(type,handler){this.events[type]=(this.events[type]||[]).filter(callback=>callback!==handler);}
    fire(type,extra={}){const event={preventDefault(){this.defaultPrevented=true;},stopPropagation(){},composedPath:()=>[this,...(this.parent?[this.parent]:[])],...extra};for(const callback of [...(this.events[type]||[])])callback(event);}
    focus(){this.fire('focus');}
    showPopover(){this.open=true;}
    getBoundingClientRect(){return {left:10,top:10,bottom:34,width:320,height:220};}
  }
  const root=new Node('shadow-root'),window=new Node('window');
  const context={Option:function(text,value){const node=new Node('option');node.textContent=text;node.value=value;return node;},URL,Intl,console,setTimeout,clearTimeout,innerWidth:1280,innerHeight:720,window,document:{createElement:tag=>new Node(tag),createTextNode:text=>{const node=new Node('#text');node.textContent=text;return node;}},chrome:{runtime:{getURL:path=>'chrome-extension://fixture/'+path}},EbayRuntime:{onDispose(){}}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/variants.js`,'utf8'),context);
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/cards.js`,'utf8'),context);
  return {root,api:context.EbayCards,variants:context.EbayVariants};
}
test('photo details retain full calculations and nested tooltips without closing their parent',()=>{
  const {root,api,variants}=setup();
  const row={title:'Filament',label:'PLA red',singleItem:true,inStock:true,amount:10,currency:'GBP',postage:0,total:10,coupon:{percent:20},image:'https://example.com/photo.jpg'};
  const format=row=>'£'+row.amount.toFixed(2),card=api.entry(row,format);root.append(card);
  api.updateAverage(card,variants.matchingAverage([row]),format,'total');
  const info=card.querySelector('.photo-info');assert.equal(info.tagName,'BUTTON');
  info.fire('pointerenter');const parent=root.querySelector('.finder-photo-details');
  assert.ok(parent.open);assert.match(parent.textContent,/Individual purchase: £8.00/);assert.match(parent.textContent,/Mixed bulk average: £8.00/);
  assert.equal(parent.querySelector('.photo-info'),null,'the details panel must not recursively create another photo panel');
  const inner=parent.querySelector('.finder-info');inner.fire('pointerenter');
  const explanation=root.querySelector('.finder-tooltip');assert.ok(explanation.open);assert.ok(root.querySelector('.finder-photo-details'));
  root.fire('pointerdown',{composedPath:()=>[explanation,root]});assert.ok(root.querySelector('.finder-photo-details'),'clicks in a nested tooltip keep the parent open');
  inner.fire('keydown',{key:'Escape'});assert.equal(root.querySelector('.finder-tooltip'),null);assert.ok(root.querySelector('.finder-photo-details'));
  parent.querySelector('.photo-details-close').fire('click');assert.equal(root.querySelector('.finder-photo-details'),null,'returning focus to the corner icon must not reopen the panel');
});
test('photo details preserve listing-wide actions and close when virtual tiles are removed',()=>{
  const {root,api}=setup();let hidden;
  const row={url:'https://www.ebay.co.uk/itm/123',title:'Filament',label:'PLA',inStock:true,amount:10,currency:'GBP',postage:0,total:10};
  const card=api.entry(row,r=>'£'+r.amount,{search:true,hideListing:days=>hidden=days,clearCache(){},refresh(){}});root.append(card);
  card.querySelector('.photo-info').fire('click');const parent=root.querySelector('.finder-photo-details');
  assert.ok(parent.querySelector('.listing-cache-actions'));
  parent.querySelector('[data-action="visibility"]').fire('click');assert.equal(hidden,30);
  api.closeTooltip();assert.equal(root.querySelector('.finder-photo-details'),null);
});
