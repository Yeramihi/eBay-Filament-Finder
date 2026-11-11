// Persistent, marketplace-specific listing data. Expiry always uses retrieval time,
// never the time a cached listing was last displayed.
globalThis.EbayListingCache = (() => {
  const prefix = 'finder:cache:item:';
  const ageKey = 'finder:cache:maxAge';
  const days = {day:1,week:7,month:30,never:Infinity};
  function canonical(value) {
    const url = new URL(value);
    const id = url.pathname.match(/^\/itm\/(?:[^/]+\/)?(\d+)/)?.[1];
    if (!id || !/^https:\/\/(?:www\.)?ebay\.(?:co\.uk|com)$/.test(url.origin)) throw new Error('Unsupported listing URL.');
    return url.origin+'/itm/'+id;
  }
  function valid(entry, setting) {
    return entry?.version === 1 && Array.isArray(entry.rows) && entry.rows.length &&
      Number.isFinite(entry.fetchedAt) && Date.now()-entry.fetchedAt < (days[setting] || 7)*86400000;
  }
  function result(entry, cached) {
    return {rows:entry.rows.map(row=>({...row,fetchedAt:entry.fetchedAt,cached}))};
  }
  async function read(value) {
    const url=canonical(value), key=prefix+url;
    const saved=await chrome.storage.local.get([key,ageKey]);
    if (valid(saved[key],saved[ageKey])) return result(saved[key],true);
    if (saved[key]) await chrome.storage.local.remove(key);
    return null;
  }
  async function write(value, rows) {
    const url=canonical(value);
    const entry={version:1,fetchedAt:Date.now(),rows:rows.map(({cached,fetchedAt,...row})=>row)};
    // Storage failures must not discard successfully retrieved live results.
    try {
      await chrome.storage.local.set({[prefix+url]:entry});
      return {...result(entry,false),persisted:true,fetchedAt:entry.fetchedAt};
    } catch(error) {
      console.error('Could not persist listing cache.',error);
      return {...result(entry,false),persisted:false,cacheError:error.message || 'Extension storage is unavailable.'};
    }
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
  const get=value=>serial(()=>read(value));
  const put=(value,rows)=>serial(()=>write(value,rows));
  const remove=value=>serial(()=>chrome.storage.local.remove(prefix+canonical(value)));
  const prune=()=>serial(removeExpired);
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes[ageKey]) prune().catch(console.error);
  });
  prune().catch(console.error);
  return {get,put,remove,canonical};
})();
