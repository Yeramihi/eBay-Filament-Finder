const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('toolbar context menu and sidebar message both open the bundled guide',async()=>{
  let install,click,message;const menus=[],tabs=[];
  const event=()=>({addListener(){}});
  const chrome={runtime:{id:'test-extension',onMessage:{addListener:fn=>message=fn},onInstalled:{addListener:fn=>install=fn},getManifest:()=>({version:'1.4'}),getURL:p=>'chrome-extension://test-extension/'+p},
    tabs:{create:async details=>tabs.push(details),onUpdated:event(),onRemoved:event()},windows:{onRemoved:event()},storage:{local:{get:async()=>({}),set:async()=>{}}},
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
  const screenshots=[...html.matchAll(/<img src="\.\.\/images\/guide\/((?:search|listing)-[^"]+\.jpg)"/g)].map(m=>m[1]);
  assert.equal(screenshots.length,16);assert.equal(new Set(screenshots).size,16);
  for(const filename of screenshots)assert.ok(fs.statSync(`${__dirname}/../images/guide/${filename}`).size>1000);
});
