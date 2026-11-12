const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('toolbar context menu and sidebar message both open the bundled guide',async()=>{
  let install,click,message;const menus=[],tabs=[];
  const event=()=>({addListener(){}});
  const chrome={runtime:{id:'test-extension',onMessage:{addListener:fn=>message=fn},onInstalled:{addListener:fn=>install=fn},getManifest:()=>({version:'1.4'}),getURL:p=>'chrome-extension://test-extension/'+p},
    tabs:{create:async details=>tabs.push(details),onUpdated:event(),onRemoved:event(),onActivated:event()},windows:{onRemoved:event()},storage:{local:{get:async()=>({}),set:async()=>{}}},
    contextMenus:{removeAll:async()=>{},create:(details,callback)=>{menus.push(details);callback();},onClicked:{addListener:fn=>click=fn}}};
  vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/background.js`,'utf8'),{chrome,importScripts(){},console,URL,Map,Date});
  install({reason:'install'});await new Promise(r=>setTimeout(r,0));
  const menu=menus.find(m=>m.title==='User guide');assert.ok(menu);assert.equal(menu.contexts[0],'action');
  click({menuItemId:menu.id},{});await new Promise(r=>setTimeout(r,0));
  let response;
  assert.equal(message({type:'open-finder-guide'},{id:'test-extension'},r=>response=r),true);
  await new Promise(r=>setTimeout(r,0));assert.equal(response.opened,true);
  assert.equal(tabs.length,2);
  assert.ok(tabs.every(t=>t.url==='chrome-extension://test-extension/html/guide.html'));
  message({type:'open-finder-guide'},{id:'other-extension'},()=>{});
  assert.equal(tabs.length,2);
});
test('guide contains all sixteen photographed sort options and their assets',()=>{
  const html=fs.readFileSync(`${__dirname}/../html/guide.html`,'utf8');
  const screenshots=[...html.matchAll(/<img src="\.\.\/images\/guide\/((?:search|listing)-(?:title|label|total|spool|average)-(?:asc|desc)\.jpg)"/g)].map(m=>m[1]);
  assert.equal(screenshots.length,16);assert.equal(new Set(screenshots).size,16);
  for(const filename of screenshots)assert.ok(fs.statSync(`${__dirname}/../images/guide/${filename}`).size>1000);
});

test('release pages link only to bundled images and valid local anchors',()=>{
  for(const page of ['guide','whats-new']) {
    const html=fs.readFileSync(`${__dirname}/../html/${page}.html`,'utf8');
    for(const [,path] of html.matchAll(/(?:src|href)="(\.\.\/[^"#]+)"/g))assert.ok(fs.existsSync(`${__dirname}/../html/${path}`),path);
    const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
    for(const [,id] of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(id),`${page}: ${id}`);
    assert.ok(!/<script|onerror=|onclick=/i.test(html),'documentation is static and bundled');
  }
});
test('guide covers current modes, cache, separate views, coupons and full-data filtering',()=>{
  const html=fs.readFileSync(`${__dirname}/../html/guide.html`,'utf8');
  for(const id of ['modes','cache','views','prices','sorting','settings','performance'])assert.ok(html.includes(`id="${id}"`));
  for(const name of ['Background','Visible tabs','Mixed','Always show all cached data','Purge all cache','Clear remembered missing listings','Search results view','Listing page view','Never dropped','Retry cache save'])assert.ok(html.includes(name),name);
  assert.ok(html.includes('not copied into the filters'));assert.ok(html.includes('all loaded in-memory rows'));
  assert.ok(!html.includes('before offers, coupons and postage'));assert.ok(!html.includes('copies your current eBay search'));
});
