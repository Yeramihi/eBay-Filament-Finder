// Persistent, marketplace-specific listing data. Expiry always uses retrieval time,
// never the time a cached listing was last displayed.
globalThis.EbayListingCache = (() => {
  const prefix = 'finder:cache:item:';
  const ageKey = 'finder:cache:maxAge';
  const missingPrefix='finder:cache:missing:';
  const days = {day:1,week:7,month:30,never:Infinity};
  function canonical(value) {
    const url = new URL(value);
    const id = url.pathname.match(/^\/itm\/(?:[^/]+\/)?(\d+)/)?.[1];
    if (!id || !/^https:\/\/(?:www\.)?ebay\.(?:co\.uk|com)$/.test(url.origin)) throw new Error('Unsupported listing URL.');
    return url.origin+'/itm/'+id;
  }
  function valid(entry, setting) {
    return entry?.version === 1 && Array.isArray(entry.rows) && entry.rows.length &&
      Number.isFinite(entry.fetchedAt) && Date.now()-entry.fetchedAt < (days[setting] || 30)*86400000;
  }
  function result(entry, cached) {
    return {rows:entry.rows.map(row=>({...row,fetchedAt:entry.fetchedAt,cached}))};
  }
  async function readMany(values) {
    const urls=[...new Set(values.map(canonical))];
    const saved=await chrome.storage.local.get([ageKey,...urls.map(url=>prefix+url),...urls.map(url=>missingPrefix+url)]);
    const expired=[];
    const items=urls.map(url=>{
      if(saved[missingPrefix+url]) return {url,removed:true,missing:true};
      const entry=saved[prefix+url];
      if(valid(entry,saved[ageKey])) return {url,...result(entry,true)};
      if(entry) expired.push(prefix+url);
      return {url};
    });
    if(expired.length) await chrome.storage.local.remove(expired);
    return items;
  }
  async function read(value) {
    const [item]=await readMany([value]);
    return item.missing ? {removed:true,missing:true} : item.rows ? {rows:item.rows} : null;
  }
  async function readAll(origin,indexOnly=false) {
    canonical(origin+'/itm/0');
    const saved=await chrome.storage.local.get(null), metadata=new Map(), expired=[];
    // Older cache entries relied on search snapshots for their title/image.
    for(const [key,page] of Object.entries(saved)) if(key.startsWith('finder:saved-page:'+origin+'/')) {
      for(const listing of page?.listings || []) if(listing.title) metadata.set(listing.url,listing);
    }
    const items=[];
    for(const [key,entry] of Object.entries(saved)) {
      if(key.startsWith(missingPrefix+origin+'/itm/')) {items.push({url:key.slice(missingPrefix.length),removed:true,missing:true});continue;}
      if(!key.startsWith(prefix+origin+'/itm/') || saved[missingPrefix+key.slice(prefix.length)]) continue;
      if(!valid(entry,saved[ageKey])) {expired.push(key);continue;}
      const url=key.slice(prefix.length), listing=metadata.get(url) || {};
      if(indexOnly) {items.push({url,...listing,title:entry.rows[0]?.title||listing.title,image:entry.rows[0]?.image||listing.image});continue;}
      items.push({url,...listing,rows:result(entry,true).rows.map(row=>({...listing,...row,url,title:row.title||listing.title,image:row.image||listing.image}))});
    }
    if(expired.length) await chrome.storage.local.remove(expired);
    return items;
  }
  async function write(value, rows, pageOpenedAt=Date.now()) {
    const url=canonical(value);
    const missing=(await chrome.storage.local.get(missingPrefix+url))[missingPrefix+url];
    if(missing?.at>pageOpenedAt) return {persisted:false,removed:true,rows:[],cacheError:'This listing no longer exists on eBay.'};
    const entry={version:1,fetchedAt:Date.now(),pageOpenedAt,rows:rows.map(({cached,fetchedAt,...row})=>row)};
    // Storage failures must not discard successfully retrieved live results.
    try {
      await chrome.storage.local.set({[prefix+url]:entry});
      if(missing) await chrome.storage.local.remove(missingPrefix+url);
      return {...result(entry,false),persisted:true,fetchedAt:entry.fetchedAt};
    } catch(error) {
      console.error('Could not persist listing cache.',error);
      return {...result(entry,false),persisted:false,cacheError:error.message || 'Extension storage is unavailable.'};
    }
  }
  const priceKey=row=>row.singleItem ? 'single' : row.id!=null ? 'variant:'+String(row.id) : null;
  function priceSnapshot(row) {
    return {item:row.amount,currency:row.currency,postage:row.postage,
      individual:EbayVariants.totalEstimate(row).amount,bulk:EbayVariants.spoolEstimate(row).amount};
  }
  const differentPrice=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.round(a*100)!==Math.round(b*100);
  async function refresh(value,rows,baseline,pageOpenedAt) {
    const url=canonical(value), key=prefix+url;
    const previous=(await chrome.storage.local.get(key))[key];
    if(Number.isFinite(previous?.pageOpenedAt)&&previous.pageOpenedAt>pageOpenedAt) {
      return {...result(previous,true),persisted:true,fetchedAt:previous.fetchedAt,superseded:true,priceChanges:[]};
    }
    const comparison=baseline&&Array.isArray(baseline.rows) ? baseline : previous;
    const oldRows=new Map((comparison?.rows || []).map(row=>[priceKey(row),row]));
    const priceChanges=[];
    for(const row of rows) {
      const id=priceKey(row), old=id && oldRows.get(id);
      if(!old) continue; // Added/removed variants are not price changes.
      const before=priceSnapshot(old), after=priceSnapshot(row);
      if((before.currency&&after.currency&&before.currency!==after.currency) ||
          ['item','postage','individual','bulk'].some(field=>differentPrice(before[field],after[field]))) {
        priceChanges.push({id,label:row.label,before,after,previousFetchedAt:comparison.fetchedAt});
      }
    }
    // Comparison and replacement share the cache queue so a concurrent scan
    // cannot change the baseline between these two operations.
    return {...await write(url,rows,pageOpenedAt),priceChanges};
  }
  async function removeExpired() {
    const saved=await chrome.storage.local.get(null);
    const expired=Object.keys(saved).filter(key=>key.startsWith(prefix)&&!valid(saved[key],saved[ageKey]));
    if(expired.length) await chrome.storage.local.remove(expired);
  }
  let pending=Promise.resolve();
  function serial(action) {
    const result=pending.then(action);
    pending=result.catch(()=>{});
    return result;
  }
  const isMissing=value=>serial(async()=>!!(await chrome.storage.local.get(missingPrefix+canonical(value)))[missingPrefix+canonical(value)]);
  const forgetMissing=()=>serial(async()=>{
    const saved=await chrome.storage.local.get(null);
    const keys=Object.keys(saved).filter(key=>key.startsWith(missingPrefix));
    if(keys.length) await chrome.storage.local.remove(keys);
    return {cleared:true,count:keys.length};
  });
  const get=value=>serial(()=>read(value));
  const getMany=values=>serial(()=>readMany(values));
  const getAll=origin=>serial(()=>readAll(origin));
  const getIndex=origin=>serial(()=>readAll(origin,true));
  const put=(value,rows)=>serial(()=>write(value,rows));
  const refreshFromPage=(value,rows,baseline,pageOpenedAt)=>serial(()=>refresh(value,rows,baseline,pageOpenedAt));
  const remove=value=>serial(()=>chrome.storage.local.remove(prefix+canonical(value)));
  const markMissing=value=>serial(async()=>{
    const url=canonical(value);
    await chrome.storage.local.set({[missingPrefix+url]:{at:Date.now()}});
    await chrome.storage.local.remove(prefix+url);
    const saved=await chrome.storage.local.get(null),patch={};
    for(const [key,page] of Object.entries(saved)) if(key.startsWith('finder:saved-page:')&&page?.listings?.some(listing=>listing.url===url)) {
      patch[key]={...page,listings:page.listings.filter(listing=>listing.url!==url),state:{...page.state,pageListingUrls:(page.state?.pageListingUrls || []).filter(item=>item!==url)}};
    }
    if(Object.keys(patch).length) await chrome.storage.local.set(patch);
    const session=await chrome.storage.session.get(null),sessionPatch={};
    for(const [key,value] of Object.entries(session)) if(key.startsWith('finder-page:')&&Array.isArray(value)&&value.some(row=>row.url===url)) sessionPatch[key]=value.filter(row=>row.url!==url);
    if(Object.keys(sessionPatch).length) await chrome.storage.session.set(sessionPatch);
    return {removed:true,missing:true};
  });
  const purge=()=>serial(async()=>{
    const local=await chrome.storage.local.get(null);
    const localKeys=Object.keys(local).filter(key=>key.startsWith(prefix)||key.startsWith('finder:saved-page:'));
    if(localKeys.length) await chrome.storage.local.remove(localKeys);
    const session=await chrome.storage.session.get(null);
    const sessionKeys=Object.keys(session).filter(key=>key.startsWith('finder-page:'));
    if(sessionKeys.length) await chrome.storage.session.remove(sessionKeys);
    return {purged:true};
  });
  const prune=()=>serial(removeExpired);
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes[ageKey]) prune().catch(console.error);
  });
  prune().catch(console.error);
  return {get,getMany,getAll,getIndex,isMissing,forgetMissing,put,refreshFromPage,remove,markMissing,purge,canonical};
})();
