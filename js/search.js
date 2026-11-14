(() => {
  'use strict';
  if (!EbayRuntime.active() || document.getElementById('ebay-filament-finder')) return;
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
      .query-input{position:relative;min-width:0}.query-input input{width:100%;padding-right:72px}.query-help{position:absolute;right:36px;top:50%;transform:translateY(-50%);width:32px;height:32px;border:0;background:transparent;color:#355779;font:600 18px system-ui;cursor:pointer}.query-help:focus-visible{outline:2px solid #2563eb;border-radius:5px}.clear-query{position:absolute;right:2px;top:50%;transform:translateY(-50%);width:32px;height:32px;padding:0;border:0;background:transparent;color:#64748b;font:22px/1 system-ui;cursor:pointer}.clear-query:focus-visible{outline:2px solid #2563eb;border-radius:5px}.clear-query span{display:inline-flex;align-items:center;justify-content:center;border:1px solid currentColor;border-radius:50%;width:20px;height:20px}input[aria-invalid="true"]{border-color:#b91c1c}.query-error{color:#b91c1c;font-size:11px;margin:0}.filters{display:grid;gap:4px;padding:9px 9px 0}.listing-filter{display:grid;gap:4px}.add-listing-filter{justify-self:start}.listing-filter-heading{display:flex;align-items:center;justify-content:space-between;gap:6px}a{color:#174b83;text-decoration:none}a:hover{text-decoration:underline}.truncated{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}small{display:block;color:#64748b}details{padding:8px 9px}summary{cursor:pointer}li{margin:5px 0}[hidden]{display:none!important}
    </style>
    <section class="finder-layout" aria-label="eBay Filament finder">
      <nav class="finder-pagination" aria-label="Search results pages">
        <button type="button" class="finder-button finder-previous-page" aria-label="Previous results page" disabled>‹ Previous</button>
        <span class="finder-page-number" role="status" aria-live="polite">Page 1</span>
        <button type="button" class="finder-button finder-next-page" aria-label="Next results page" disabled>Next ›</button>
      </nav>
      <div class="finder-toolbar" id="finder-toolbar" hidden>
        <div class="filters">
          <label for="variant-query">Variant</label><div class="query-input"><input id="variant-query" autocomplete="off" maxlength="512" aria-describedby="variant-query-error"><button type="button" class="query-help variant-query-help" aria-label="Search input rules">?</button><button type="button" class="clear-query clear-variant-query" aria-label="Clear variant search" hidden><span aria-hidden="true">×</span></button></div><p class="query-error" id="variant-query-error" role="alert" hidden></p>
          <button type="button" class="add-listing-filter finder-button" aria-controls="listing-filter" aria-expanded="false">+ Add listing title search</button>
          <div class="listing-filter" id="listing-filter" hidden>
            <div class="listing-filter-heading"><label for="listing-query">Listing title</label><button type="button" class="remove-listing-filter finder-button" aria-label="Remove listing title search">Remove</button></div>
            <div class="query-input"><input id="listing-query" autocomplete="off" maxlength="512" aria-describedby="listing-query-error"><button type="button" class="query-help listing-query-help" aria-label="Search input rules">?</button><button type="button" class="clear-query clear-listing-query" aria-label="Clear listing title search" hidden><span aria-hidden="true">×</span></button></div><p class="query-error" id="listing-query-error" role="alert" hidden></p>
          </div>
        </div><div class="controls"><button type="button" class="apply-filters finder-button">Apply filters</button></div>
      </div>
      <div class="finder-results">
        <p class="scan-notice" role="status" hidden></p>
        <details class="results" open><summary>Results (0)</summary><div class="finder-entries"></div></details>
        <details class="finder-unrecognised" hidden><summary>Not recognised types</summary><p class="hidden-help">These listings have no variant choices and name multiple filament types. The actual material cannot be identified reliably.</p><div class="finder-entries"></div></details>
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
  for (const field of [input,listingInput]) EbayVariants.attachQueryFormatting?.(field);
  for (const name of ['variant','listing']) EbayCards.searchHelp?.(root.querySelector(`.${name}-query-help`));
  const syncVariantClear=EbayVariants.attachClearInput?.(input,root.querySelector('.clear-variant-query')) || (()=>{});
  const syncListingClear=EbayVariants.attachClearInput?.(listingInput,root.querySelector('.clear-listing-query')) || (()=>{});
  const validateVariant=EbayVariants.attachQueryValidation?.(input,root.querySelector('#variant-query-error')) || (()=>true);
  const validateListing=EbayVariants.attachQueryValidation?.(listingInput,root.querySelector('#listing-query-error')) || (()=>true);
  const listingFilter = root.querySelector('#listing-filter');
  const addListingFilter = root.querySelector('.add-listing-filter');
  function showListingFilter(visible) {
    listingFilter.hidden = !visible;
    addListingFilter.hidden = visible;
    addListingFilter.setAttribute('aria-expanded', String(visible));
  }
  showListingFilter(false);
  addListingFilter.addEventListener('click', () => {
    showListingFilter(true);
    listingInput.focus();
    persist();
  });
  root.querySelector('.remove-listing-filter').addEventListener('click', () => {
    listingInput.value = '';
    validateListing();
    syncListingClear();
    appliedListingQuery = '';
    showListingFilter(false);
    addListingFilter.focus();
    persist();
    render();
  });
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
  let appliedQuery = '', appliedListingQuery = '';
  let sortTouched = false;
  let userPaused = false, scanMode = 'mixed', visibleJob;
  let cacheLoading=0, scanBatch;
  function registerScanCandidate(listing) {
    if(!scanBatch || (scanBatch.onlyURL&&scanBatch.onlyURL!==listing.url)) return;
    if(!scanBatch.positions.has(listing.url)) scanBatch.positions.set(listing.url,scanBatch.positions.size+1);
  }
  function currentScanProgress(listing) {
    if(!scanBatch) return {current:0,total:0};
    const total=scanBatch.positions.size;
    if(listing) return {current:scanBatch.positions.get(listing.url)||1,total};
    const active=[...scanBatch.active].map(url=>scanBatch.positions.get(url)).filter(Number.isFinite);
    const remaining=[...scanBatch.positions].filter(([url])=>!scanBatch.finished.has(url)).map(([,position])=>position);
    return {current:Math.min(...(active.length ? active : remaining.length ? remaining : [total])),total};
  }
  function updateScanProgress() {
    if(!running) return;
    const progress=currentScanProgress();
    status.textContent=`Scanning ${progress.current} of ${progress.total} listings…`;
  }
  function finishScanCandidate(listing) {
    scanBatch?.active.delete(listing.url);scanBatch?.finished.add(listing.url);updateScanProgress();
  }
  let scanStarted = false, scanParallel = EbaySettings.defaultParallel;
  let showAllCache=false, scopeRefreshPending=false, automaticScan=true, automaticSession=false, startBusy=false;
  const pageListings=new Set(), rememberedMissing=new Set(), rememberedIrrelevant=new Set();
  const cachePreferencesReady=EbayRuntime.local.get(['finder:cache:showAll','finder:automaticScan']).then(saved=>{showAllCache=saved['finder:cache:showAll']===true;automaticScan=saved['finder:automaticScan']!==false;});
  const hiddenKey='finder:hiddenListings';
  let hiddenListings={}, hiddenTimer;
  const hiddenPending=new Set();
  const hiddenReady=EbayRuntime.local.get(hiddenKey).then(saved=>{hiddenListings=saved[hiddenKey] || {};}).catch(()=>{});
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

  const resultsViewport=root.querySelector('.finder-results');
  const virtualView=EbaySearchView.create(resultsViewport,
    row=>EbayCards.entry(row,price,{search:true,clearCache:()=>clearListing(row),refresh:()=>refreshListing(row),hideListing:days=>toggleHidden(row,days)}),
    (entry,row,context,firstListing)=>{
      const actions=entry.querySelector('.listing-cache-actions');
      if(actions) {
        actions.hidden=!firstListing;
        for(const button of actions.querySelectorAll('button')) button.disabled=button.dataset.action==='visibility' ? hiddenPending.has(row.url) : running||listingActions.size>0;
        const duration=actions.querySelector('.hide-duration');if(duration) duration.disabled=hiddenPending.has(row.url);
      }
      EbayCards.updateHidden(entry,hiddenUntil(row.url));
      EbayCards.updateAverage(entry,row.hiddenPreview||row.outOfStock ? null : context.averages.get(row.url),price,context.sortKey);
      for(const field of entry.querySelectorAll('[data-sort-field]')) field.classList.toggle('sort-active',field.dataset.sortField===context.sortKey||field.dataset.sortAlias===context.sortKey);
    });
  let renderGeneration = 0, disposed=false;
  let cacheRevision=0, cacheSyncTimer, cacheSyncBusy=false, cacheSyncAgain=false;
  async function render() {
    if(disposed||!EbayRuntime.active()) return;
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
    let visible=[];
    let sliceStart=performance.now();
    for(const row of [...results,...hiddenPreviews]) {
      if(performance.now()-sliceStart>4) {await EbaySearchView.yieldTurn();if(generation!==renderGeneration)return;sliceStart=performance.now();}
      const matches=(()=>{
      // Hidden listings stay available for management even after filters change.
      if(hiddenUntil(row.url)) return true;
      const checks = [];
      if (words.length) checks.push(EbayVariants.matches(row.label, words));
      if (listingWords.length) checks.push(EbayVariants.matches(row.title || '', listingWords));
      return checks.every(Boolean);
      })();
      if(matches) {if(row.inStock) EbayVariants.spoolEstimate(row);visible.push(row);}
    }
    const groups = new Map();
    for (const row of visible) {
      const key = row.url;
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(row);
    }
    const averages=new Map();
    for(const [key,rows] of groups) {
      averages.set(key,EbayVariants.matchingAverage(rows));
      if(performance.now()-sliceStart>4) {await EbaySearchView.yieldTurn();if(generation!==renderGeneration)return;sliceStart=performance.now();}
    }
    visible=await EbaySearchView.sort(visible,(a,b) => {
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
    },()=>generation===renderGeneration);
    if(!visible || generation!==renderGeneration) return;
    const entries=[],unrecognised=[],outOfStock=[],hiddenRows=new Map();
    for(const row of visible) {
      if(hiddenUntil(row.url)) {
        if(!hiddenRows.has(row.url)||(hiddenRows.get(row.url).outOfStock&&!row.outOfStock)) hiddenRows.set(row.url,row);
      } else if (EbayVariants.ambiguousFilamentTypes(row).length) unrecognised.push(row);
      else (row.outOfStock ? outOfStock : entries).push(row);
      if(performance.now()-sliceStart>4) {await EbaySearchView.yieldTurn();if(generation!==renderGeneration)return;sliceStart=performance.now();}
    }
    const hiddenEntries=[...hiddenRows.values()],showResults=running||results.length>0||hiddenEntries.length>0;
    updateCompactWidth();resultsSection.hidden=!showResults;
    resultsSection.querySelector('summary').textContent=`Results (${entries.length})`;
    const unrecognisedSection=root.querySelector('.finder-unrecognised');
    unrecognisedSection.hidden=!unrecognised.length;
    unrecognisedSection.querySelector('summary').textContent=`Not recognised types (${new Set(unrecognised.map(row=>row.url)).size} listings)`;
    const hiddenSection=root.querySelector('.finder-hidden'),stockSection=root.querySelector('.finder-out-of-stock');
    hiddenSection.hidden=!hiddenEntries.length;hiddenSection.querySelector('summary').textContent=`Hidden (${hiddenEntries.length} listings)`;
    stockSection.hidden=!outOfStock.length;stockSection.querySelector('summary').textContent=`Out of stock variants (${outOfStock.length})`;
    const context={averages,sortKey};
    virtualView.set(resultsSection.querySelector('.finder-entries'),entries,context,!entries.length&&showResults ? EbayCards.emptyState({scanning:running,outOfStock:outOfStock.length>0}) : null);
    virtualView.set(unrecognisedSection.querySelector('.finder-entries'),unrecognised,context);
    virtualView.set(hiddenSection.querySelector('.finder-entries'),hiddenEntries,context);
    virtualView.set(stockSection.querySelector('.finder-entries'),outOfStock,context);
    syncSort(sortKey,ascending);
    persist();
    const failureCount = failures.length ? ` · ${failures.length} couldn't be checked` : '';
    let message = '';
    if(cacheLoading&&!running) message='Loading cached listings…';
    else if (running) {const progress=currentScanProgress();message=`Scanning ${progress.current} of ${progress.total} listings…`;}
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
    if (restored&&!disposed&&EbayRuntime.active()) EbayDock.save({query:appliedQuery,listingQuery:appliedListingQuery,listingFilterVisible:!listingFilter.hidden,appliedQuery,appliedListingQuery,checked,total,running,stopped,
      discoveryVersion:2,allCacheView:showAllCache,pageListingUrls:[...pageListings],resultsOpen:root.querySelector('.results').open});
  }
  const stateReady = Promise.all([EbayDock.ready,hiddenReady,cachePreferencesReady]).then(async ([saved]) => {
    input.value = saved.query || '';
    listingInput.value = saved.listingQuery || '';
    syncVariantClear(); syncListingClear();
    appliedQuery = saved.appliedQuery ?? input.value;
    appliedListingQuery = saved.appliedListingQuery ?? listingInput.value;
    showListingFilter(saved.listingFilterVisible === true || Boolean(listingInput.value || appliedListingQuery));
    const trustedScan = saved.discoveryVersion === 2;
    results = trustedScan ? saved.results || [] : []; failures = trustedScan ? saved.failures || [] : [];
    checked = trustedScan ? saved.checked || 0 : 0; total = trustedScan ? saved.total || 0 : 0;
    if(!trustedScan) EbayDock.save({results:[],failures:[]});
    for(const url of saved.pageListingUrls || []) pageListings.add(url);
    if(!saved.allCacheView) for(const row of [...results,...(saved.restoreListings || [])]) pageListings.add(row.url);
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
    try {
      const current=await listings();for(const listing of current) pageListings.add(listing.url);
      const restoredListings=(saved.restoreListings || []).filter(listing=>showAllCache||pageListings.has(listing.url));
      await loadCached([...restoredListings,...current],showAllCache,false);
    } catch(error) {if(!EbayRuntime.expected(error)) {EbayRuntime.report(error);scanNotice.textContent='Could not load cached results. Reopen this page to retry.';scanNotice.hidden=false;}}
    showFailures(); render();
  });
  // An explicitly opened listing replaces its entire saved variant set.
  // Expired data is also removed from the current results and deduplication set.
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area!=='local') return;
    for(const [key,change] of Object.entries(changes)) if(key.startsWith('finder:cache:missing:')) {
      const url=key.slice('finder:cache:missing:'.length);
      if(change.newValue) rememberedMissing.add(url);
      else if(rememberedMissing.delete(url) && !results.some(row=>row.url===url) && !queue.some(listing=>listing.url===url)) seen.delete(url);
    }
    if(changes['finder:automaticScan']) {
      automaticScan=changes['finder:automaticScan'].newValue!==false;
      if(automaticScan) scheduleDiscovery();
    }
    if(changes['finder:cache:maxAge']) scheduleDiscovery();
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
    if(disposed||!EbayRuntime.active()) return;
    if(running || listingActions.size) return;
    clearTimeout(cacheSyncTimer);
    cacheSyncTimer=setTimeout(()=>refreshFromCache().catch(EbayRuntime.report),100);
  }
  async function refreshFromCache() {
    await stateReady;
    if(disposed||!EbayRuntime.active()||running || listingActions.size) return;
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
        readCacheBatches([...references.keys()],showAllCache),
        EbayRuntime.local.get(hiddenKey)
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
  async function readCacheBatches(urls,all,onBatch) {
    EbayRuntime.assertActive();
    cacheLoading++;
    if(!running) status.textContent='Loading cached listings…';
    try {
      let references=urls.map(url=>({url})),items=[];
      if(all) {
        const index=await EbayRuntime.sendMessage({type:'finder-cache-index'});
        if(!Array.isArray(index?.items)) throw new Error(index?.error || 'Could not read cached listings.');
        references=index.items;
      }
      for(let offset=0;offset<references.length;offset+=12) {
        EbayRuntime.assertActive();
        const batch=references.slice(offset,offset+12),metadata=new Map(batch.map(item=>[item.url,item]));
        const response=await EbayRuntime.sendMessage({type:'finder-cache-read',urls:batch.map(item=>item.url)});
        if(!Array.isArray(response?.items)) throw new Error(response?.error || 'Could not read cached listings.');
        const chunk=response.items.map(item=>({...metadata.get(item.url),...item}));
        EbayRuntime.assertActive();
        if(onBatch) await onBatch(chunk);else items.push(...chunk);
        if(!running) status.textContent=`Loading cached listings… ${Math.min(offset+batch.length,references.length)}/${references.length}`;
        await EbaySearchView.yieldTurn();
      }
      return {items};
    } finally {cacheLoading--;if(!cacheLoading) render();}
  }
  async function loadCached(candidates,all=false,trackPages=true) {
    if(trackPages) for(const listing of candidates) pageListings.add(listing.url);
    const unknown=[...new Map(candidates.filter(listing=>!seen.has(listing.url)).map(listing=>[listing.url,listing])).values()];
    if(!all&&!unknown.length) return;
    const byURL=new Map(candidates.map(listing=>[listing.url,listing]));
    let first=true;
    await readCacheBatches(unknown.map(listing=>listing.url),all,async items=>{
      let count=0;
      for(const item of items) {
        if(item.missing) {rememberedMissing.add(item.url);continue;}
        if(!item.rows?.length || seen.has(item.url)) continue;
        const listing=byURL.get(item.url) || {url:item.url,title:item.title,image:item.image};
        seen.add(item.url);checked++;total++;
        for(const row of item.rows) {
          results.push({...listing,...row,url:item.url,title:row.title||listing.title,image:row.image||listing.image});
          if(++count%150===0) await EbaySearchView.yieldTurn();
        }
      }
      if(first&&results.length) {first=false;EbayCards.setFiltersExpanded(root,true);render();}
    });
    EbayDock.save({results,allCacheView:showAllCache,pageListingUrls:[...pageListings]});
    render();
  }
  async function configureScan() {
    const settings=await EbayRuntime.local.get(['parallelListings','finder:visibleScan','finder:scanMode']).catch(()=>({}));
    scanMode=['background','visible','mixed'].includes(settings['finder:scanMode']) ? settings['finder:scanMode'] : settings['finder:visibleScan']===true ? 'visible' : 'mixed';
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
      const response=await EbayRuntime.sendMessage({type:'finder-hidden-set',url:listing.url,title:listing.title,days:hide ? days : 0});
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
      const response=await EbayRuntime.sendMessage({type:'finder-cache-delete',url:listing.url});
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
      if (seen.has(listing.url)||rememberedMissing.has(listing.url)||rememberedIrrelevant.has(listing.url)) continue;
      seen.add(listing.url);
      queue.push(listing);
      if(running) {registerScanCandidate(listing);updateScanProgress();}
      total++;
    }
  }

  async function start({automatic=false}={}) {
    if (running || startBusy || listingActions.size) return;
    startBusy=true;
    try {
    automaticSession=automatic;
    cacheRevision++;
    scan.disabled = true;
    await stateReady;
    if(automatic && (!automaticScan || userPaused || !EbaySearchHasFilament())) return;
    if(results.length) {
      const urls=[...new Set(results.map(row=>row.url))];
      const response=await EbayRuntime.sendMessage({type:'finder-cache-read',urls});
      const valid=new Set((response?.items || []).filter(item=>item.rows?.length).map(item=>item.url));
      for(const url of urls) if(!valid.has(url)) {seen.delete(url);checked=Math.max(0,checked-1);total=Math.max(checked,total-1);}
      results=results.filter(row=>valid.has(row.url));
      EbayDock.save({results,allCacheView:showAllCache,pageListingUrls:[...pageListings]});
    }
    if (!scanStarted) EbayCards.setFiltersExpanded(root, true);
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
    } finally {startBusy=false;if(!running) scan.disabled=false;}
  }

  async function processQueue(onlyURL) {
    if (running || stopped || !queue.length) return;
    cacheRevision++;
    running = true;
    scanBatch={onlyURL,positions:new Map(),active:new Set(),finished:new Set()};
    for(const listing of queue) registerScanCandidate(listing);
    updateScanProgress();
    scan.disabled = true;
    stop.disabled = false;
    scanNotice.hidden = true;
    updateScanBanner();
    render();
    const fallbacks=[];
    const unreadable=response=>!response?.removed && (response?.error || !Array.isArray(response?.rows));
    const eligible=listing=>!onlyURL || listing.url===onlyURL;
    const hasQueued=()=>queue.some(eligible);
    async function request(listing, visible=scanMode==='visible') {
      registerScanCandidate(listing);scanBatch.active.add(listing.url);updateScanProgress();
      try {
        let response = await EbayRuntime.sendMessage({type:'scan-listing',url:listing.url,title:listing.title,image:listing.image,visible,
          returnToSource:visible && scanMode==='mixed',
          progress:currentScanProgress(listing),forceRefresh:listing.forceRefresh===true});
        if (response?.pending) {
          visibleJob = response.jobId;
          while (response?.pending) {
            if (stopped) await EbayRuntime.sendMessage({type:'visible-scan-cancel'});
            response = await EbayRuntime.sendMessage({type:'visible-scan-poll',jobId:visibleJob});
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
      if(disposed) return false;
      if(response?.removed) {
        finishScanCandidate(listing);
        if(response.missing) rememberedMissing.add(listing.url);
        if(response.irrelevant) rememberedIrrelevant.add(listing.url);
        checked++;
        results=results.filter(row=>row.url!==listing.url);
        failures=failures.filter(row=>row.url!==listing.url);
        EbayDock.save({results,failures,allCacheView:showAllCache,pageListingUrls:[...pageListings]});
        showFailures();render();return !stopped;
      }
      // Preserve completed in-flight work after Stop; unfinished listings resume.
      if (stopped && unreadable(response)) {
        scanBatch.active.delete(listing.url);
        queue.unshift(listing);
        return false;
      }
      if (scanMode !== 'background' && (response?.cancelled || response?.paused || (!response?.skipped && !Array.isArray(response?.rows)))) {
        scanBatch.active.delete(listing.url);
        queue.unshift(listing);
        stopped = userPaused = true;
        scanNotice.textContent = response?.error || 'Visible scan paused. Click Scan to resume.';
        scanNotice.hidden = false;
        return false;
      }
      finishScanCandidate(listing);
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
      if(disposed) return;
      if(fallbacks.length) queue.unshift(...fallbacks);
      running = false;
      scanBatch=undefined;
      if(scopeRefreshPending) scheduleCacheSync();
      scan.disabled = false;
      stop.disabled = true;
      updateScanBanner();
      render();
      // Close the reusable scan tab only when the complete accumulated queue
      // is drained. Cancelled scans retain it so a manual Resume can reuse it.
      if (!onlyURL && !stopped && queue.length) processQueue();
      else if (!stopped && scanMode !== 'background') EbayRuntime.sendMessage({type:'visible-scan-finish'}).catch(() => {});
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
      if (automaticScan && !userPaused && EbaySearchHasFilament() && !running && !startBusy && !listingActions.size) {
        // Recheck cached rows too: a previously loaded listing may have expired.
        const cached=await readCacheBatches(candidates.map(item=>item.url),false);
        const valid=new Set(cached.items.filter(item=>item.rows?.length).map(item=>item.url));
        const expired=new Set(results.filter(row=>candidates.some(item=>item.url===row.url)&&!valid.has(row.url)).map(row=>row.url));
        for(const url of expired) {seen.delete(url);checked=Math.max(0,checked-1);total=Math.max(checked,total-1);}
        results=results.filter(row=>!expired.has(row.url));
        await loadCached(candidates);
        if(candidates.some(item=>!seen.has(item.url)&&!rememberedMissing.has(item.url)&&!rememberedIrrelevant.has(item.url))) {
          await start({automatic:true});
          return;
        }
      } else await loadCached(candidates);
      if(scanStarted && !listingActions.size && (!automaticSession || (automaticScan && EbaySearchHasFilament()))) enqueue(candidates);
    }
    catch { return; }
    // A failed listing ends that scan attempt, not automatic discovery. New
    // candidates resume it; only an explicit Stop keeps processing paused.
    if (!scanStarted || listingActions.size || (automaticSession && (!automaticScan || !EbaySearchHasFilament()))) return;
    if (!userPaused && total > previousTotal) stopped = false;
    if (!stopped && !userPaused) processQueue();
  }
  stateReady.then(()=>{if(automaticScan) scheduleDiscovery();}).catch(EbayRuntime.report);
  const automaticScanTimer=setInterval(()=>{if(automaticScan&&!userPaused) scheduleDiscovery();},60000);
  function scheduleDiscovery() {
    if(disposed||!EbayRuntime.active()) return;
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
  const navigationTimer=setInterval(() => {
    if(!EbayRuntime.active()) return;
    if (location.href !== lastURL) { lastURL = location.href; scheduleDiscovery(); }
  },750);
  function showScanNotice(message) {
    running = false;
    scan.disabled = false;
    scanNotice.textContent = message;
    scanNotice.hidden = false;
    render();
  }
  scan.addEventListener('click',()=>start().catch(EbayRuntime.report));
  function stopScan() {
    if (!running) return;
    userPaused=true; stopped=true; stop.disabled=true;
    updateScanBanner();
    if (scanMode !== 'background') EbayRuntime.sendMessage({type:'visible-scan-cancel'}).catch(() => {});
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
    if (scanMode !== 'background' && (running || visibleJob)) EbayRuntime.sendMessage({type:'visible-scan-cancel'}).catch(() => {});
  });
  function applyFilters() {
    const variantValid=validateVariant();
    const listingValid=listingFilter.hidden || validateListing();
    if (!variantValid || !listingValid) return;
    appliedQuery = input.value;
    appliedListingQuery = listingFilter.hidden ? '' : listingInput.value;
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
  EbayRuntime.onDispose(()=>{
    disposed=true;stopped=true;renderGeneration++;
    clearInterval(navigationTimer);clearInterval(automaticScanTimer);clearTimeout(discoveryTimer);clearTimeout(cacheSyncTimer);clearTimeout(hiddenTimer);
    observer.disconnect();virtualView.dispose();
    scanBanner.remove();scan.disabled=true;stop.disabled=true;
    status.textContent='Extension updated. Reload this eBay page to reconnect.';
  });
  EbayDock.getSort().then(saved => {
    if (!sortTouched) applySavedSort(saved);
  }).catch(EbayRuntime.report);
})();
