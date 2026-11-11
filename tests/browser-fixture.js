(() => {
  const local = {}, session = {}, listeners = [], requests = [];
  const storage = data => ({get:async keys=>{if(typeof keys==='string')return {[keys]:data[keys]};return Object.fromEntries((keys||[]).map(key=>[key,data[key]]));},set:async patch=>{const changes=Object.fromEntries(Object.entries(patch).map(([key,value])=>[key,{oldValue:data[key],newValue:value}]));Object.assign(data,patch);if(data===local)for(const listener of listeners)listener(changes,'local');}});
  globalThis.chrome={runtime:{id:'fixture',getURL:path=>'/'+path,getManifest:()=>({version:'1.4'}),onMessage:{addListener(){}},sendMessage:async message=>{
    if(message.type==='get-finder-settings-view'){const [html,css]=await Promise.all(['/html/settings.html','/css/settings.css'].map(p=>fetch(p).then(r=>r.text())));return {html,css};}
    if(message.type==='open-finder-guide'){window.open('/html/guide.html','_blank');return {opened:true};}
    if(message.type==='scan-listing'){requests.push(message.url);document.querySelector('#requests').textContent=`Listing requests: ${requests.length}\n${requests.join('\n')}`;await new Promise(resolve=>setTimeout(resolve,150));return {rows:[{id:'1',label:'PLA yellow',amount:12,currency:'GBP',postage:0,total:12,inStock:true,outOfStock:false}]};}
  }},storage:{local:storage(local),session:storage(session),onChanged:{addListener:fn=>listeners.push(fn),removeListener:fn=>listeners.splice(listeners.indexOf(fn),1)}}};
  function page(ids,filament=true){document.querySelector('#srp-river-results').innerHTML=ids.map(id=>`<li class="s-item"><a class="s-item__link" href="/itm/${id}"><h3 class="s-item__title">${filament?'Filament':'Printer'} PLA ${id}</h3></a></li>`).join('');history.pushState({},'',`?page=${ids[0]}`);}
  document.querySelector('#page1').onclick=()=>page([111111111111,222222222222]);
  document.querySelector('#page2').onclick=()=>page([222222222222,333333333333]);
  document.querySelector('#page3').onclick=()=>page([444444444444],false);
  document.querySelector('#page4').onclick=()=>page([555555555555]);
  page([111111111111,222222222222]);
  (async()=>{for(const file of ['variants','dock','settings','cards','search-bridge','search'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=`/js/${file}.js`;script.onload=resolve;script.onerror=reject;document.head.append(script);});})();
})();
