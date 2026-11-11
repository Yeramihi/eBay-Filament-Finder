(() => {
  'use strict';
  if (document.getElementById('ebay-filament-finder')) return;
  const host = document.createElement('div');
  host.id = 'ebay-filament-finder';
  host.style.cssText = 'width:100%';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <style>
      *{box-sizing:border-box}section{font:12px/1.4 system-ui,sans-serif;background:white;color:#18212f;border:0}
      button,input{font:inherit}button{cursor:pointer}.controls{display:flex;flex-wrap:wrap;gap:6px;padding:9px}input{min-width:0;flex:1;padding:6px;border:1px solid #aab7c7;border-radius:5px}.scan-status{flex:0 0 100%;font-size:11px;color:#58677a}
      .scan-status:empty{display:none}
      .finder-pagination{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;padding:9px;border-bottom:1px solid #d7e1ed;background:#f4f7fb}
      .finder-page-number{white-space:nowrap;font-weight:650;color:#17365d}
      .finder-pagination .finder-button:disabled{opacity:.5;cursor:default}
      .scan-status.is-scanning{animation:scan-pulse 1.8s ease-in-out infinite}
      @keyframes scan-pulse{50%{opacity:.65}}
      @media (prefers-reduced-motion: reduce){.scan-status.is-scanning{animation:none}}
      .finder-results {
        background-image: linear-gradient(#fffffff0, #fffffff0), url("${chrome.runtime.getURL('images/icons/icon-128.png')}");
        background-position: center;
        background-size: auto, min(128px, 75%) auto;
        background-repeat: no-repeat;
        background-attachment: scroll;
      }
      .finder-button.scan:enabled{background:#167443;border-color:#167443;color:white}
      .finder-button.scan:enabled:hover{background:#115c35}
      .finder-button.stop:enabled{background:#b4232c;border-color:#b4232c;color:white}
      .finder-button.stop:enabled:hover{background:#921b23}
      .finder-button.scan:disabled,.finder-button.stop:disabled{background:#edf0f4;border-color:#c4ccd6;color:#566477;opacity:1}
      .scan-notice{margin:8px 9px;color:#64748b}
      .filters{display:grid;gap:4px;padding:9px 9px 0}.combine{display:flex;gap:20px;padding:3px 0}.combine label{display:flex;align-items:center;gap:4px}.combine input{flex:none;width:auto;margin:0;padding:0}a{color:#174b83;text-decoration:none}a:hover{text-decoration:underline}.truncated{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}small{display:block;color:#64748b}details{padding:8px 9px}summary{cursor:pointer}li{margin:5px 0}[hidden]{display:none!important}
    </style>
    <section class="finder-layout" aria-label="eBay Filament finder">
      <nav class="finder-pagination" aria-label="Search results pages">
        <button type="button" class="finder-button finder-previous-page" aria-label="Previous results page" disabled>‹ Previous</button>
        <span class="finder-page-number" role="status" aria-live="polite">Page 1</span>
        <button type="button" class="finder-button finder-next-page" aria-label="Next results page" disabled>Next ›</button>
      </nav>
      <div class="finder-toolbar" id="finder-toolbar" hidden>
        <div class="filters">
          <label for="variant-query">Variant</label><input id="variant-query" placeholder='e.g. ASA yellow' autocomplete="off">
          <div class="combine" role="radiogroup" aria-label="Combine Variant and Listing filters">
            <label><input type="radio" name="combine" value="and" checked> AND</label>
            <label><input type="radio" name="combine" value="or"> OR</label>
          </div>
          <label for="listing-query">Listing</label><input id="listing-query" placeholder='e.g. JAYO "Buy 5 pay 3"' autocomplete="off">
        </div><div class="controls"><button type="button" class="apply-filters finder-button">Apply filters</button></div>
      </div>
      <div class="finder-results">
        <p class="scan-notice" role="status" hidden></p>
        <details class="results" open><summary>Results</summary><div class="finder-entries"></div></details>
        <details class="finder-hidden" hidden><summary>Hidden</summary><p class="hidden-help">Whole listings hidden from results, including their out-of-stock variants. Unhide at any time; they return automatically when the selected period ends.</p><div class="finder-entries"></div></details>
        <details class="failures" hidden><summary></summary><ul></ul></details>
      </div>
    </section>`;
  EbayDock.setCompact(true);
  EbayDock.setAutoCollapsed(!EbaySearchHasFilament());
  EbayDock.mount(host);
  const syncSort = EbayCards.controls(root,[['title','Listing'],['label','Variant'],['total','Individual purchase'],['spool','Bulk purchase*'],['average','Mixed bulk average']],(key,direction)=>{sortTouched=true;sortKey=key;ascending=direction;EbayDock.saveSort(key,direction);render();}, updateCompactWidth);
  const previousPage = root.querySelector('.finder-previous-page');
  const nextPage = root.querySelector('.finder-next-page');
  const pageNumber = root.querySelector('.finder-page-number');
  function syncPagination() {
    const pagination = EbaySearchPagination();
    previousPage.disabled = !pagination.previous;
    nextPage.disabled = !pagination.next;
    const label = `Page ${pagination.page}`;
    if (pageNumber.textContent !== label) pageNumber.textContent = label;
    return pagination;
  }
  function navigatePage(direction) {
    // Resolve again at click time: eBay can replace or disable its links after
    // the finder last refreshed. Use the real link to preserve eBay handlers.
    const pagination = syncPagination();
    pagination[direction]?.click();
    scheduleDiscovery();
  }
  previousPage.addEventListener('click', () => navigatePage('previous'));
  nextPage.addEventListener('click', () => navigatePage('next'));
  syncPagination();
  const input = root.querySelector('#variant-query');
  const listingInput = root.querySelector('#listing-query');
  const combineButtons = [...root.querySelectorAll('[name=combine]')];
  const combineMode = () => combineButtons.find(button => button.checked)?.value || 'and';
  const scan = document.createElement('button');
  scan.type = 'button';
  scan.className = 'finder-button scan';
  scan.textContent = 'Scan';
  EbayCards.tooltip(scan,'Scan this search page');
  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'finder-button stop';
  stop.textContent = 'Stop';
  stop.disabled = true;
  const status = document.createElement('span');
  status.className = 'scan-status';
  status.setAttribute('role', 'status');
  root.querySelector('.finder-toggle-row').append(scan, stop, status);
  const scanNotice = root.querySelector('.scan-notice');
  const resultsSection = root.querySelector('.results');
  let running = false, stopped = false, results = [], failures = [], checked = 0, total = 0;
  let sortKey = 'total', ascending = true;
  let appliedQuery = '', appliedListingQuery = '', appliedCombine = 'and';
  let sortTouched = false;
  let userPaused = false, scanMode = 'background', visibleJob;
  let scanStarted = false, scanParallel = EbaySettings.defaultParallel;
  let showAllCache=false, scopeRefreshPending=false;
  const pageListings=new Set();
  const cachePreferencesReady=chrome.storage.local.get('finder:cache:showAll').then(saved=>{showAllCache=saved['finder:cache:showAll']===true;});
  const hiddenKey='finder:hiddenListings';
  let hiddenListings={}, hiddenTimer;
  const hiddenPending=new Set();
  const hiddenReady=chrome.storage.local.get(hiddenKey).then(saved=>{hiddenListings=saved[hiddenKey] || {};}).catch(()=>{});
  const hiddenUntil=url=>Number.isFinite(hiddenListings[url]?.expiresAt)&&hiddenListings[url].expiresAt>Date.now() ? hiddenListings[url].expiresAt : 0;
  const queue = [], seen = new Set();
  const collator = new Intl.Collator(undefined, { numeric:true, sensitivity:'base' });

  const scanBanner = document.createElement('div');
  scanBanner.id = 'ebay-finder-scan-notice';
  scanBanner.setAttribute('role','status');
  scanBanner.setAttribute('aria-live','polite');
  scanBanner.style.cssText = 'all:initial!important;position:fixed!important;top:12px!important;left:50%!important;transform:translateX(-50%)!important;z-index:2147483647!important;box-sizing:border-box!important;max-width:calc(100vw - 112px)!important;padding:12px 18px!important;border:2px solid #17365d!important;border-radius:10px!important;background:#fff3d5!important;color:#17365d!important;font:600 14px/1.45 system-ui,sans-serif!important;text-align:center!important;box-shadow:0 4px 18px #0003!important;display:none!important;';
  document.documentElement.append(scanBanner);
  function updateScanBanner() {
    const active = running && !stopped;
    scanBanner.textContent = active ? 'Filament finder is scanning. Press Escape (Esc) to stop the scan.' : '';
    scanBanner.style.setProperty('display',active?'block':'none','important');
  }


  function updateCompactWidth() {
    const filtersCollapsed = root.querySelector('.finder-toolbar').hidden;
    EbayDock.setCompact(!running && results.length === 0 && filtersCollapsed);
  }

  async function listings() {
    return globalThis.EbaySearchListings();
  }

  const rowElements = new WeakMap();
  let renderGeneration = 0;
  let cacheRevision=0, cacheSyncTimer, cacheSyncBusy=false, cacheSyncAgain=false;
  async function render() {
    const generation = ++renderGeneration;
    // Let the browser paint typed text before filtering and building rows.
    await new Promise(resolve => setTimeout(resolve,0));
    if (generation !== renderGeneration) return;
    clearTimeout(hiddenTimer);
    const expiry=Object.values(hiddenListings).map(entry=>entry?.expiresAt).filter(time=>Number.isFinite(time)&&time>Date.now());
    if(expiry.length) hiddenTimer=setTimeout(render,Math.min(2147483647,Math.max(1,Math.min(...expiry)-Date.now()+1)));
    const words = EbayVariants.terms(appliedQuery);
    const listingWords = EbayVariants.terms(appliedListingQuery);
    const present=new Set(results.map(row=>row.url));
    // Keep hiding controls available after the separate data cache expires or
    // when a different search does not include this listing. Never retain old
    // prices just to display the hidden-list management entry.
    const hiddenPreviews=Object.entries(hiddenListings).filter(([url])=>hiddenUntil(url) && url.startsWith(location.origin+'/itm/') && !present.has(url)).map(([url,record])=>({url,title:record.title || 'Hidden listing',hiddenPreview:true}));
    const visible = [...results,...hiddenPreviews].filter(row => {
      // Hidden listings stay available for management even after filters change.
      if(hiddenUntil(row.url)) return true;
      const checks = [];
      if (words.length) checks.push(EbayVariants.matches(row.label, words));
      if (listingWords.length) checks.push(EbayVariants.matches(row.title || '', listingWords));
      return !checks.length || (appliedCombine === 'or' ? checks.some(Boolean) : checks.every(Boolean));
    });
    const groups = new Map();
    for (const row of visible) {
      const key = row.url;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(row);
    }
    const averages = new Map([...groups].map(([key,rows]) => [key,EbayVariants.matchingAverage(rows)]));
    visible.sort((a,b) => {
      if (sortKey === 'average') {
        // Compare only the primary price before applying the secondary price;
        // title/variant tie-breakers belong after both numeric comparisons.
        const primary = EbayVariants.comparePrice(
          {currency:a.currency,average:averages.get(a.url)?.amount},
          {currency:b.currency,average:averages.get(b.url)?.amount},'average',ascending);
        // Suppress compareSpool's default title-first tie-breaker so variant
        // name is the third level, in the selected direction.
        const secondary = primary ? 0 : EbayVariants.compareSpool(
          {...a,title:'',label:''}, {...b,title:'',label:''},ascending);
        const variant = collator.compare(a.label || '',b.label || '');
        return primary || secondary || (ascending ? variant : -variant) ||
          collator.compare(a.title || '',b.title || '');
      }
      if (sortKey === 'spool') return EbayVariants.compareSpool(a,b,ascending);
      if (['amount','postage','total'].includes(sortKey)) return EbayVariants.comparePrice(a,b,sortKey,ascending);
      const order = collator.compare(a[sortKey],b[sortKey]);
      return (ascending ? order : -order) || collator.compare(a.title || '',b.title || '') || collator.compare(a.label || '',b.label || '');
    });
    const entries = [];
    const outOfStock = [];
    const hiddenEntries=[];
    const averageUpdates = [];
    const actionRows=new Map();
    for(const row of visible) if(!actionRows.has(row.url) || (actionRows.get(row.url).outOfStock&&!row.outOfStock)) actionRows.set(row.url,row);
    let batchStarted = performance.now();
    for (const row of visible) {
      if(performance.now()-batchStarted>8){await new Promise(resolve=>setTimeout(resolve,0));if(generation!==renderGeneration)return;batchStarted=performance.now();}
      const until=hiddenUntil(row.url);
      if(until && actionRows.get(row.url)!==row) continue;
      let entry=rowElements.get(row);
      if(!entry){entry=EbayCards.entry(row,price,{search:true,clearCache:()=>clearListing(row),refresh:()=>refreshListing(row),hideListing:days=>toggleHidden(row,days)});rowElements.set(row,entry);}
      const actions=entry.querySelector('.listing-cache-actions');
      if(actions) {
        actions.hidden=actionRows.get(row.url)!==row;
        for(const button of actions.querySelectorAll('button')) button.disabled=button.dataset.action==='visibility' ? hiddenPending.has(row.url) : running || listingActions.size>0;
        const duration=actions.querySelector('.hide-duration');
        if(duration) duration.disabled=hiddenPending.has(row.url);
      }
      EbayCards.updateHidden(entry,until);
      averageUpdates.push([entry,row.hiddenPreview || row.outOfStock ? null : averages.get(row.url)]);
      (until ? hiddenEntries : row.outOfStock ? outOfStock : entries).push(entry);
    }
    const showResults = running || results.length > 0 || hiddenEntries.length>0;
    if(!entries.length && showResults) entries.push(EbayCards.emptyState({scanning:running,outOfStock:outOfStock.length>0}));
    if(generation!==renderGeneration)return;
    updateCompactWidth();
    resultsSection.hidden = !showResults;
    // Commit average fields and their sort styling together, after all yielding work.
    for (const [entry,average] of averageUpdates) EbayCards.updateAverage(entry,average,price,sortKey);
    EbayCards.showEntries(root, entries, outOfStock, hiddenEntries);
    syncSort(sortKey,ascending);
    persist();
    const failureCount = failures.length ? ` · ${failures.length} couldn't be checked` : '';
    let message = '';
    if (running) message = `Scanning ${checked}/${total} listings…`;
    else if(total && !scanStarted) message=`${results.length} cached variants from ${new Set(results.map(row=>row.url)).size} listings.`;
    else if (total) {
      const outcome = stopped && checked < total ? 'Scan stopped.' : 'Scan completed.';
      message = `${outcome} ${results.length} variants extracted from ${checked - failures.length} listings.`;
    }
    const text = message + failureCount;
    if (status.textContent !== text) status.textContent = text;
    status.classList.toggle('is-scanning', running);
  }

  function price(row) {
    if (typeof row.amount !== 'number') return 'Unknown';
    const prefix = row.approximate ? '≈ ' : '';
    try {return prefix + EbayVariants.formatCurrency(row.amount,row.currency);}
    catch {return prefix + `${row.amount.toFixed(2)} ${row.currency}`;}
  }
  function showFailures() {
    const details = root.querySelector('.failures'); details.hidden = !failures.length;
    root.querySelector('.failures summary').textContent = `Could not check ${failures.length} listings`;
    const list = root.querySelector('ul'); list.replaceChildren();
    for (const failure of failures) {
      const li = document.createElement('li'); li.textContent = `${failure.title}: ${failure.error}`; list.append(li);
    }
  }
  let restored = false;
  function persist() {
    if (restored) EbayDock.save({query:appliedQuery,listingQuery:appliedListingQuery,combine:appliedCombine,appliedQuery,appliedListingQuery,appliedCombine,checked,total,running,stopped,
      discoveryVersion:2,allCacheView:showAllCache,pageListingUrls:[...pageListings],resultsOpen:root.querySelector('.results').open});
  }
  const stateReady = Promise.all([EbayDock.ready,hiddenReady,cachePreferencesReady]).then(async ([saved]) => {
    input.value = saved.query || '';
    listingInput.value = saved.listingQuery || '';
    appliedQuery = saved.appliedQuery ?? input.value;
    appliedListingQuery = saved.appliedListingQuery ?? listingInput.value;
    appliedCombine = saved.appliedCombine || saved.combine || 'and';
    for (const button of combineButtons) button.checked = button.value === (saved.combine === 'or' ? 'or' : 'and');
    const trustedScan = saved.discoveryVersion === 2;
    results = trustedScan ? saved.results || [] : []; failures = trustedScan ? saved.failures || [] : [];
    checked = trustedScan ? saved.checked || 0 : 0; total = trustedScan ? saved.total || 0 : 0;
    if(!trustedScan) EbayDock.save({results:[],failures:[]});
    for(const url of saved.pageListingUrls || []) pageListings.add(url);
    if(!saved.allCacheView) for(const row of results) pageListings.add(row.url);
    if(!showAllCache && saved.allCacheView) {
      results=results.filter(row=>pageListings.has(row.url));
      checked=total=new Set([...results,...failures].map(row=>row.url)).size;
    }
    // Completed listings remain cached; a fresh user scan may discover more.
    for (const listing of [...results, ...failures]) seen.add(listing.url);
    total = checked;
    stopped = !!(saved.stopped || saved.running);
    root.querySelector('.results').open = saved.resultsOpen !== false;
    if (results.length) EbayCards.setFiltersExpanded(root, true);
    restored = true;
    // Search snapshots cannot cover a new query or a newly opened results page.
    // Match its current organic results against the shared listing cache too.
    try {await loadCached(await listings(),showAllCache);} catch(error) {console.error(error);}
    showFailures(); render();
  });
  // An explicitly opened listing replaces its entire saved variant set.
  // Expired data is also removed from the current results and deduplication set.
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local') return;
    if(changes['finder:cache:showAll']) {
      showAllCache=changes['finder:cache:showAll'].newValue===true;
      cacheRevision++;scopeRefreshPending=true;
      scheduleCacheSync();
    }
    if(changes[hiddenKey]) {cacheRevision++;hiddenListings=changes[hiddenKey].newValue || {};render();}
    if(!restored) return;
    if(Object.keys(changes).some(key=>key.startsWith('finder:cache:item:'))) {
      cacheRevision++;
      if(showAllCache&&running) scopeRefreshPending=true;
      scheduleCacheSync();
    }
  });
  function scheduleCacheSync() {
    if(running || listingActions.size) return;
    clearTimeout(cacheSyncTimer);
    cacheSyncTimer=setTimeout(()=>refreshFromCache().catch(console.error),100);
  }
  async function refreshFromCache() {
    await stateReady;
    if(running || listingActions.size) return;
    if(cacheSyncBusy) {cacheSyncAgain=true;return;}
    cacheSyncBusy=true;
    const revision=cacheRevision;
    try {
      const references=new Map(results.map(row=>[row.url,{url:row.url,title:row.title,image:row.image}]));
      for(const listing of await listings()) {
        pageListings.add(listing.url);
        if(!references.has(listing.url)) references.set(listing.url,listing);
      }
      const [response,saved]=await Promise.all([
        chrome.runtime.sendMessage(showAllCache ? {type:'finder-cache-read-all'} : {type:'finder-cache-read',urls:[...references.keys()]}),
        chrome.storage.local.get(hiddenKey)
      ]);
      // A tab can become active while Scan is starting, or a cache write can
      // race this read. Never apply a snapshot over newer work or a cache clear.
      if(running || listingActions.size || revision!==cacheRevision) return;
      if(!Array.isArray(response?.items)) return;
      hiddenListings=saved[hiddenKey] || {};
      const items=new Map(response.items.map(item=>[item.url,item]));
      // An all-cache response omits deleted/expired entries; remove stale rows too.
      for(const url of references.keys()) if(!items.has(url)) items.set(url,{url});
      const groups=new Map();
      for(const row of results) {if(!groups.has(row.url)) groups.set(row.url,[]);groups.get(row.url).push(row);}
      for(const item of items.values()) {
        if(!references.has(item.url)) references.set(item.url,{url:item.url,title:item.title,image:item.image});
        const old=groups.get(item.url) || [];
        if(item.rows?.length && (showAllCache || pageListings.has(item.url))) {
          const queued=queue.find(listing=>listing.url===item.url);
          if(queued?.forceRefresh) continue;
          if(!old.length) {
            const failure=failures.some(listing=>listing.url===item.url);
            if(seen.has(item.url) && !queued && !failure) continue;
            if(!seen.has(item.url)) {seen.add(item.url);checked++;total++;}
            else if(queued) checked++;
            if(queued) queue.splice(queue.indexOf(queued),1);
            failures=failures.filter(listing=>listing.url!==item.url);
          }
          // Keep row identities for unchanged cache entries, reusing their tiles.
          if(old.length===item.rows.length && old.every(row=>row.cached&&row.fetchedAt===item.rows[0].fetchedAt)) continue;
          const listing=references.get(item.url);
          groups.set(item.url,item.rows.map(row=>({...listing,...row,url:item.url,title:row.title||listing.title,image:row.image||listing.image})));
        } else if(old.length) {
          groups.delete(item.url);
          seen.delete(item.url);checked=Math.max(0,checked-1);total=Math.max(checked,total-1);
        }
      }
      results=[...groups.values()].flat();
      if(results.length) EbayCards.setFiltersExpanded(root,true);
      scopeRefreshPending=false;
      EbayDock.save({results,failures,allCacheView:showAllCache,pageListingUrls:[...pageListings]});showFailures();render();
    } finally {
      cacheSyncBusy=false;
      if(cacheSyncAgain) {cacheSyncAgain=false;scheduleCacheSync();}
    }
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') scheduleCacheSync();
  });
  window.addEventListener('focus',scheduleCacheSync);
  window.addEventListener('pageshow',event=>{if(event.persisted) scheduleCacheSync();});
  root.querySelector('.results').addEventListener('toggle',persist);
  async function loadCached(candidates,all=false) {
    for(const listing of candidates) pageListings.add(listing.url);
    const unknown=[...new Map(candidates.filter(listing=>!seen.has(listing.url)).map(listing=>[listing.url,listing])).values()];
    if(!all&&!unknown.length) return;
    const response=await chrome.runtime.sendMessage(all ? {type:'finder-cache-read-all'} : {type:'finder-cache-read',urls:unknown.map(listing=>listing.url)});
    if(!Array.isArray(response?.items)) throw new Error(response?.error || 'Could not read cached listings.');
    const byURL=new Map(candidates.map(listing=>[listing.url,listing]));
    for(const item of response.items) {
      if(!item.rows?.length || seen.has(item.url)) continue;
      const listing=byURL.get(item.url) || {url:item.url,title:item.title,image:item.image};
      seen.add(item.url);checked++;total++;
      results.push(...item.rows.map(row=>({...listing,...row,url:item.url,title:row.title||listing.title,image:row.image||listing.image})));
    }
    EbayDock.save({results,allCacheView:showAllCache,pageListingUrls:[...pageListings]});
    if(results.length) EbayCards.setFiltersExpanded(root,true);
    render();
  }
  async function configureScan() {
    const settings=await chrome.storage.local.get(['parallelListings','finder:visibleScan','finder:scanMode']).catch(()=>({}));
    scanMode=['background','visible','mixed'].includes(settings['finder:scanMode']) ? settings['finder:scanMode'] : settings['finder:visibleScan']===true ? 'visible' : 'background';
    const parallel=settings.parallelListings;
    scanParallel=Number.isInteger(parallel)&&parallel>=1&&parallel<=999 ? parallel : EbaySettings.defaultParallel;
    if(scanMode==='visible') scanParallel=1;
  }
  const listingActions=new Set();
  async function toggleHidden(listing,days) {
    if(hiddenPending.has(listing.url)) return;
    const hide=hiddenUntil(listing.url)===0;
    hiddenPending.add(listing.url);render();
    try {
      const response=await chrome.runtime.sendMessage({type:'finder-hidden-set',url:listing.url,title:listing.title,days:hide ? days : 0});
      if(response?.error || !response?.hidden) throw new Error(response?.error || 'Could not save hidden listings.');
      hiddenListings=response.hidden;
    } catch(error) {
      scanNotice.textContent=error.message;scanNotice.hidden=false;
    } finally {hiddenPending.delete(listing.url);render();}
  }
  async function clearListing(listing) {
    if(running || listingActions.size) return;
    cacheRevision++;
    listingActions.add(listing.url);render();
    try {
      const response=await chrome.runtime.sendMessage({type:'finder-cache-delete',url:listing.url});
      if(!response?.removed) throw new Error(response?.error || 'Could not clear this listing.');
      results=results.filter(row=>row.url!==listing.url);
      if(seen.delete(listing.url)) {checked=Math.max(0,checked-1);total=Math.max(checked,total-1);}
      EbayDock.save({results,allCacheView:showAllCache,pageListingUrls:[...pageListings]});
    } catch(error) {showScanNotice(error.message);}
    finally {listingActions.delete(listing.url);render();}
  }
  async function refreshListing(listing) {
    if(running || listingActions.size) return;
    listingActions.add(listing.url);render();
    const previousStopped=stopped, previousPaused=userPaused;
    try {
      await configureScan();
      // A manual refresh bypasses retention without discarding the old data
      // first: a failed request must leave the last known result available.
      const queued=queue.find(candidate=>candidate.url===listing.url);
      if(queued) queued.forceRefresh=true;
      else queue.unshift({url:listing.url,title:listing.title,image:listing.image,forceRefresh:true});
      const failed=failures.some(failure=>failure.url===listing.url);
      failures=failures.filter(failure=>failure.url!==listing.url);
      if(seen.has(listing.url) && !failed) checked=Math.max(0,checked-1);
      else if(!seen.has(listing.url)) {seen.add(listing.url);total++;}
      stopped=userPaused=false;
      EbayDock.save({failures});showFailures();
      await processQueue(listing.url);
    } catch(error) {showScanNotice(error.message);}
    finally {stopped=stopped||previousStopped;userPaused=userPaused||previousPaused;listingActions.delete(listing.url);render();}
  }
  function enqueue(candidates) {
    for (const listing of candidates) {
      if (seen.has(listing.url)) continue;
      seen.add(listing.url);
      queue.push(listing);
      total++;
    }
  }

  async function start() {
    if (running || listingActions.size) return;
    cacheRevision++;
    scan.disabled = true;
    await stateReady;
    if(results.length) {
      const urls=[...new Set(results.map(row=>row.url))];
      const response=await chrome.runtime.sendMessage({type:'finder-cache-read',urls});
      const valid=new Set((response?.items || []).filter(item=>item.rows?.length).map(item=>item.url));
      for(const url of urls) if(!valid.has(url)) {seen.delete(url);checked=Math.max(0,checked-1);total=Math.max(checked,total-1);}
      results=results.filter(row=>valid.has(row.url));
      EbayDock.save({results,allCacheView:showAllCache,pageListingUrls:[...pageListings]});
    }
    if (!scanStarted) {
      input.value = EbaySearchQuery().replace(/\bfilament\b/gi, '')
        .replace(/"\s*"/g, '').replace(/\s+/g, ' ').trim();
      appliedQuery = input.value;
      EbayCards.setFiltersExpanded(root, true);
    }
    await configureScan();
    try {
      const candidates=await listings();
      await loadCached(candidates);
      enqueue(candidates);
    }
    catch {
      showScanNotice('Refresh the eBay search page, then try Scan again.');
      return;
    }
    scanStarted = true;
    userPaused = false;
    stopped = false;
    if (!queue.length) {
      showScanNotice(total ? 'All discovered listings are already cached.' : 'No visible organic search results found in the main results list. Sponsored and recommended items are excluded.');
      return;
    }
    processQueue();
  }

  async function processQueue(onlyURL) {
    if (running || stopped || !queue.length) return;
    cacheRevision++;
    running = true;
    scan.disabled = true;
    stop.disabled = false;
    scanNotice.hidden = true;
    updateScanBanner();
    render();
    const fallbacks=[];
    const unreadable=response=>response?.error || !Array.isArray(response?.rows);
    const eligible=listing=>!onlyURL || listing.url===onlyURL;
    const hasQueued=()=>queue.some(eligible);
    async function request(listing, visible=scanMode==='visible') {
      try {
        let response = await chrome.runtime.sendMessage({type:'scan-listing',url:listing.url,title:listing.title,image:listing.image,visible,
          returnToSource:visible && scanMode==='mixed',
          progress:{current:checked+1,total},forceRefresh:listing.forceRefresh===true});
        if (response?.pending) {
          visibleJob = response.jobId;
          while (response?.pending) {
            if (stopped) await chrome.runtime.sendMessage({type:'visible-scan-cancel'});
            response = await chrome.runtime.sendMessage({type:'visible-scan-poll',jobId:visibleJob});
            if (response?.pending) {
              scanNotice.textContent = response.detail || 'Scanning the visible listing tab…';
              scanNotice.hidden = false;
              await new Promise(resolve => setTimeout(resolve,750));
            }
          }
          visibleJob = undefined;
          scanNotice.hidden = true;
        }
        return response;
      }
      catch (error) { return {error:error.message}; }
    }
    function accept(listing,response) {
      // Preserve completed in-flight work after Stop; unfinished listings resume.
      if (stopped && unreadable(response)) {
        queue.unshift(listing);
        return false;
      }
      if (scanMode !== 'background' && (response?.cancelled || response?.paused || (!response?.skipped && !Array.isArray(response?.rows)))) {
        queue.unshift(listing);
        stopped = userPaused = true;
        scanNotice.textContent = response?.error || 'Visible scan paused. Click Scan to resume.';
        scanNotice.hidden = false;
        return false;
      }
      checked++;
      if (response?.skipped) {
        failures.push({...listing,error:'Skipped by user.'});
        EbayDock.save({failures});showFailures();
      } else if (unreadable(response)) {
        failures.push({...listing,error:response?.error || 'No response from extension.'});
        stopped = true;
        EbayDock.save({failures});showFailures();
      } else {
        results=results.filter(row=>row.url!==listing.url);
        results.push(...response.rows.map(row=>({...row,url:listing.url,title:row.title||listing.title,image:row.image||listing.image})));
        EbayDock.save({results,allCacheView:showAllCache,pageListingUrls:[...pageListings]});
      }
      render();
      return !stopped;
    }
    async function worker() {
      // A first mixed-mode error closes this gate immediately. Requests already
      // in flight finish, but no worker takes another background candidate.
      while (!stopped && !fallbacks.length && hasQueued()) {
        const index=queue.findIndex(eligible);
        const [listing]=queue.splice(index,1);
        let response=await request(listing);
        if (scanMode==='mixed' && !stopped && unreadable(response)) {
          listing.visibleFallback=true;
          fallbacks.push(listing);
          scanNotice.textContent='Background check failed. Waiting for active requests before opening the visible scan tab…';
          scanNotice.hidden=false;
          return;
        }
        if (scanMode==='background' && !stopped && unreadable(response)) {
          await new Promise(resolve=>setTimeout(resolve,3000));
          if(!stopped) response=await request(listing);
        }
        if(!accept(listing,response) || onlyURL) return;
      }
    }
    try {
      while(!stopped && hasQueued()) {
        // Recover interrupted visible jobs first when a user resumes the scan.
        if(scanMode==='mixed') {
          for(let index=0;index<queue.length;) {
            if(eligible(queue[index]) && queue[index].visibleFallback) fallbacks.push(...queue.splice(index,1));
            else index++;
          }
        }
        if(!fallbacks.length) {
          await Promise.all(Array.from({length:onlyURL ? 1 : Math.min(scanParallel,queue.length)},()=>worker()));
        }
        // All background workers have drained before this single owner opens a
        // tab. Multiple concurrent failures reuse that tab strictly one by one.
        while(!stopped && fallbacks.length) {
          const listing=fallbacks.shift();
          scanNotice.textContent='Opening a failed listing for your attention…';
          scanNotice.hidden=false;
          const response=await request(listing,true);
          if(!accept(listing,response)) break;
        }
        if(onlyURL) break;
        // Recovery finished: the next worker group uses the chosen parallelism.
      }
    } finally {
      if(fallbacks.length) queue.unshift(...fallbacks);
      running = false;
      if(scopeRefreshPending) scheduleCacheSync();
      scan.disabled = false;
      stop.disabled = true;
      updateScanBanner();
      render();
      // Close the reusable scan tab only when the complete accumulated queue
      // is drained. Cancelled scans retain it so a manual Resume can reuse it.
      if (!onlyURL && !stopped && queue.length) processQueue();
      else if (!stopped && scanMode !== 'background') chrome.runtime.sendMessage({type:'visible-scan-finish'}).catch(() => {});
    }
  }

  let discoveryTimer;
  let resultsKey = location.href + '\n' + EbaySearchResultsKey();
  async function discover() {
    syncPagination();
    const key = location.href + '\n' + EbaySearchResultsKey();
    if (key !== resultsKey) {
      resultsKey = key;
      if (EbayDock.isCollapsed()) EbayDock.setAutoCollapsed(!EbaySearchHasFilament());
    }
    await stateReady;
    const previousTotal = total;
    try {
      const candidates=await listings();
      await loadCached(candidates);
      if(scanStarted && !listingActions.size) enqueue(candidates);
    }
    catch { return; }
    // A failed listing ends that scan attempt, not automatic discovery. New
    // candidates resume it; only an explicit Stop keeps processing paused.
    if (!scanStarted || listingActions.size) return;
    if (!userPaused && total > previousTotal) stopped = false;
    if (!stopped && !userPaused) processQueue();
  }
  function scheduleDiscovery() {
    clearTimeout(discoveryTimer);
    discoveryTimer = setTimeout(discover,250);
  }
  // Shadow DOM updates never reach this observer. Ignore the dock host and
  // our layout attributes too, so automatic opening cannot trigger a loop.
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (target?.closest('#ebay-finder-dock, #ebay-filament-finder, #ebay-finder-page-layout, #ebay-finder-scan-notice')) return false;
      if (record.type === 'attributes' && target === document.documentElement) return false;
      if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node =>
        node.nodeType === Node.ELEMENT_NODE && node.matches('#ebay-finder-dock, #ebay-filament-finder, #ebay-finder-page-layout, #ebay-finder-scan-notice'))) return false;
      return true;
    })) scheduleDiscovery();
  });
  observer.observe(document.documentElement, {subtree:true, childList:true, characterData:true,
    attributes:true, attributeFilter:['href','class','hidden','aria-hidden','style','aria-current','aria-disabled','disabled']});
  window.addEventListener('popstate',scheduleDiscovery);
  window.addEventListener('hashchange',scheduleDiscovery);
  // pushState/replaceState in the page's world cannot be intercepted reliably
  // from an isolated content script. Check the URL without patching eBay code.
  let lastURL = location.href;
  setInterval(() => {
    if (location.href !== lastURL) { lastURL = location.href; scheduleDiscovery(); }
  },750);
  function showScanNotice(message) {
    running = false;
    scan.disabled = false;
    scanNotice.textContent = message;
    scanNotice.hidden = false;
    render();
  }
  scan.addEventListener('click',start);
  function stopScan() {
    if (!running) return;
    userPaused=true; stopped=true; stop.disabled=true;
    updateScanBanner();
    if (scanMode !== 'background') chrome.runtime.sendMessage({type:'visible-scan-cancel'}).catch(() => {});
  }
  stop.addEventListener('click',stopScan);
  // Capture Escape before the dock's ordinary Escape-to-collapse handler.
  // It works even while typing in a filter or when the sidebar is collapsed.
  window.addEventListener('keydown',event=>{
    if (event.key !== 'Escape' || event.isComposing || !running) return;
    event.preventDefault();event.stopImmediatePropagation();stopScan();
  },true);
  chrome.runtime.onMessage.addListener((message,sender)=>{
    if(sender.id===chrome.runtime.id && message?.type==='finder-search-activated') scheduleCacheSync();
    if (sender.id === chrome.runtime.id && message?.type === 'visible-scan-stop-source' &&
        running && (!visibleJob || visibleJob === message.jobId)) stopScan();
  });
  window.addEventListener('pagehide',()=>{
    if (scanMode !== 'background' && (running || visibleJob)) chrome.runtime.sendMessage({type:'visible-scan-cancel'}).catch(() => {});
  });
  function applyFilters() {
    appliedQuery = input.value;
    appliedListingQuery = listingInput.value;
    appliedCombine = combineMode();
    persist();
    render();
  }
  root.querySelector('.apply-filters').addEventListener('click',applyFilters);
  for (const field of [input,listingInput]) {
    field.addEventListener('keydown',event=>{
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); applyFilters(); }
    });
  }
  function applySavedSort(saved) {
    if (!saved || !['title','label','amount','postage','total','spool','average'].includes(saved.key) || typeof saved.ascending !== 'boolean') return;
    sortKey = ['amount','postage'].includes(saved.key) ? 'total' : saved.key; ascending = saved.ascending; render();
  }
  EbayDock.onSortChange(saved => {
    sortTouched = true;
    applySavedSort(saved);
  });
  EbayDock.getSort().then(saved => {
    if (!sortTouched) applySavedSort(saved);
  });
})();
