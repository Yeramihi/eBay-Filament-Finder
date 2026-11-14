const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context={URL,console};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/variants.js`,'utf8'),context);
const api=context.EbayVariants;
const url='https://www.ebay.co.uk/itm/123456789012';
function background(html,{description='',cached=null}={}) {
  let listener;const writes=[],removed=[],fetched=[];
  const event={addListener(){}};
  const variants={...api,getRows:()=>[{label:'TPU white',inStock:true,amount:10,currency:'GBP'}],
    getCoupon:()=>null,getPostage:()=>0,withPostage:rows=>rows,withBannerOffers:rows=>rows,withVolumePricing:rows=>rows};
  const chrome={runtime:{id:'extension',onMessage:{addListener:fn=>listener=fn},onInstalled:event},
    tabs:{onUpdated:event,onRemoved:event,onActivated:event,sendMessage:async()=>null},
    windows:{onRemoved:event},contextMenus:{onClicked:event}};
  const cache={canonical:()=>url,isMissing:async()=>false,get:async()=>cached,
    refreshFromPage:async(key,rows)=>{writes.push(rows);return {persisted:true,fetchedAt:123,priceChanges:[]};},
    remove:async key=>{removed.push(key);},put:async(key,rows)=>{writes.push(rows);return {rows};}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/background.js`,'utf8'),{
    chrome,URL,console,AbortSignal,importScripts(){},EbayVariants:variants,EbayListingCache:cache,
    fetch:async href=>{fetched.push(href);return {ok:true,text:async()=>href===url?html:description};}
  });
  return {writes,removed,fetched,send:(message,source='https://www.ebay.co.uk/sch/i.html')=>new Promise(resolve=>listener(message,
    {id:'extension',url:source,tab:{id:1}},resolve))};
}
test('only listing title or scoped description qualifies, ignoring recommendations and scripts',()=>{
  assert.equal(api.listingFilamentInfo('<title>TPU phone case</title><aside>PLA filament recommendations</aside>').relevant,false);
  assert.equal(api.listingFilamentInfo('<h1>PLA FILAMENT</h1>').relevant,true);
  assert.equal(api.listingFilamentInfo('<h1>TPU</h1><div id="desc_div">3D printer filament</div>').relevant,true);
  assert.equal(api.listingFilamentInfo('<h1>TPU case</h1><script>"description":"filament"</script>').relevant,false);
  assert.equal(api.hasFilamentText('filamentous'),false);
  assert.equal(api.hasFilamentText('filament-PLA'),true);
  const doc={title:'TPU case',querySelector:()=>null,querySelectorAll:()=>[{textContent:'Flexible filament'}]};
  assert.equal(api.listingFilamentInfo(doc).relevant,true);
});
test('background skips unrelated listings without reading variants or caching and removes old cached entry',async()=>{
  const h=background('<title>TPU phone case</title><aside>filament</aside>',{cached:{rows:[{title:'Phone case'}]}});
  const result=await h.send({type:'scan-listing',url});
  assert.equal(result.irrelevant,true);
  assert.equal(h.writes.length,0);
  assert.deepEqual(h.removed,[url]);
});
test('background caches listings with filament in their title or description',async()=>{
  for(const html of ['<h1>White filament</h1>', '<title>White TPU</title><div id="desc_div">Printing filament</div>']) {
    const h=background(html);const result=await h.send({type:'scan-listing',url});
    assert.equal(result.rows[0].filamentVerified,true);
    assert.equal(h.writes.length,1);
  }
});
test('separate eBay description is checked but arbitrary frame URLs are never fetched',async()=>{
  const html='<title>White TPU</title><iframe id="desc_ifr" src="https://vi.vipr.ebaydesc.com/itmdesc/123456789012"></iframe>';
  const h=background(html,{description:'<div>This is printer filament</div>'});
  assert.equal((await h.send({type:'scan-listing',url})).rows.length,1);
  assert.equal(h.fetched.length,2);
  const other=background(html.replace('vi.vipr.ebaydesc.com','example.com'),{description:'filament'});
  assert.equal((await other.send({type:'scan-listing',url})).irrelevant,true);
  assert.equal(other.fetched.length,1);
});

test('a manual listing-panel override permits saving non-filament data',async()=>{
  const h=background('<title>TPU case</title>');
  const message={type:'finder-cache-refresh',rows:[{label:'TPU white',title:'Phone case'}]};
  assert.equal((await h.send(message,url)).saved,false);
  assert.equal(h.writes.length,0);
  assert.equal((await h.send({...message,manuallyIncluded:true},url)).saved,true);
  assert.equal(h.writes[0][0].manuallyIncluded,true);
  assert.equal(h.writes[0][0].filamentVerified,false);
});
test('scanning reuses explicitly included cached listings without rejecting them',async()=>{
  const cached={rows:[{label:'White',title:'TPU phone case',manuallyIncluded:true}]};
  const h=background('<title>Phone case</title>',{cached});
  assert.equal((await h.send({type:'scan-listing',url})).rows[0].manuallyIncluded,true);
  assert.equal(h.fetched.length,0);
});
