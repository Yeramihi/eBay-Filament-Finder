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
        <details class="failures" hidden><summary></summary><ul></ul></details>
      </div>
    </section>`;
  EbayDock.setCompact(true);
  EbayDock.mount(host);
  const syncSort = EbayCards.controls(root,[['title','Listing'],['label','Variant'],['total','Total'],['spool','Price per item*'],['average','Average matching price']],(key,direction)=>{sortTouched=true;sortKey=key;ascending=direction;EbayDock.saveSort(key,direction);render();}, updateCompactWidth);
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
  const collator = new Intl.Collator(undefined, { numeric:true, sensitivity:'base' });

  function updateCompactWidth() {
    const filtersCollapsed = root.querySelector('.finder-toolbar').hidden;
    EbayDock.setCompact(!running && results.length === 0 && filtersCollapsed);
  }

  async function listings() {
    return globalThis.EbaySearchListings();
  }

  const rowElements = new WeakMap();
  let renderGeneration = 0;
  async function render() {
    const generation = ++renderGeneration;
    // Let the browser paint typed text before filtering and building rows.
    await new Promise(resolve => setTimeout(resolve,0));
    if (generation !== renderGeneration) return;
    const words = EbayVariants.terms(appliedQuery);
    const listingWords = EbayVariants.terms(appliedListingQuery);
    const visible = results.filter(row => {
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
    const averageUpdates = [];
    let batchStarted = performance.now();
    for (const row of visible) {
      if(performance.now()-batchStarted>8){await new Promise(resolve=>setTimeout(resolve,0));if(generation!==renderGeneration)return;batchStarted=performance.now();}
      let entry=rowElements.get(row);
      if(!entry){entry=EbayCards.entry(row,price,{search:true});rowElements.set(row,entry);}
      averageUpdates.push([entry,row.outOfStock ? null : averages.get(row.url)]);
      (row.outOfStock ? outOfStock : entries).push(entry);
    }
    const showResults = running || results.length > 0;
    if(!entries.length && showResults) entries.push(EbayCards.emptyState({scanning:running,outOfStock:outOfStock.length>0}));
    if(generation!==renderGeneration)return;
    updateCompactWidth();
    resultsSection.hidden = !showResults;
    // Commit average fields and their sort styling together, after all yielding work.
    for (const [entry,average] of averageUpdates) EbayCards.updateAverage(entry,average,price,sortKey);
    EbayCards.showEntries(root, entries, outOfStock);
    syncSort(sortKey,ascending);
    persist();
    const failureCount = failures.length ? ` · ${failures.length} couldn't be checked` : '';
    let message = '';
    if (running) message = `Scanning ${checked}/${total} listings…`;
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
      discoveryVersion:2,resultsOpen:root.querySelector('.results').open});
  }
  const stateReady = EbayDock.ready.then(saved => {
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
    stopped = !!(saved.stopped || saved.running);
    root.querySelector('.results').open = saved.resultsOpen !== false;
    if (results.length) EbayCards.setFiltersExpanded(root, true);
    restored = true; showFailures(); render();
  });
  root.querySelector('.results').addEventListener('toggle',persist);
  async function start() {
    if (running) return;
    running=true; scan.disabled=true;
    updateCompactWidth();
    scanNotice.hidden = true;
    const [settings] = await Promise.all([
      chrome.storage.local.get('parallelListings').catch(() => ({})),
      stateReady
    ]);
    const parallel = settings.parallelListings;
    const scanParallel = Number.isInteger(parallel) && parallel >= 1 && parallel <= 999 ? parallel : EbaySettings.defaultParallel;
    let queue;
    try { queue = await listings(); }
    catch {
      showScanNotice('Refresh the eBay search page, then try Scan again.');
      return;
    }
    if (!queue.length) {
      showScanNotice('No visible organic search results found in the main results list. Sponsored and recommended items are excluded.');
      return;
    }
    running=true; stopped=false; results=[]; failures=[]; checked=0; total=queue.length;
    EbayDock.save({results,failures});
    scan.disabled=true; stop.disabled=false; showFailures(); render();
    let next = 0;
    let recovering = false;
    const retryListings = [];
    async function request(listing) {
      try { return await chrome.runtime.sendMessage({type:'scan-listing',url:listing.url}); }
      catch (error) { return {error:error.message}; }
    }
    function recordSuccess(listing,response) {
      checked++;
      results.push(...response.rows.map(row => ({...row,...listing,image:row.image||listing.image})));
      EbayDock.save({results});
      render();
    }
    async function worker() {
      while (!stopped && !recovering && next < queue.length) {
        const listing = queue[next++];
        const response = await request(listing);
        if (stopped) return;
        if (response?.error || !response?.rows) {
          // Drain requests already in flight before restarting at the failed listings.
          recovering = true;
          retryListings.push(listing);
        } else recordSuccess(listing,response);
      }
    }
    try {
      await Promise.all(Array.from({length:Math.min(scanParallel,queue.length)}, () => worker()));
      if (recovering && !stopped) {
        await new Promise(resolve => setTimeout(resolve,3000));
        const remaining = [...retryListings,...queue.slice(next)];
        for (const listing of remaining) {
          if (stopped) break;
          const response = await request(listing);
          if (stopped) break;
          if (response?.error || !response?.rows) {
            checked++;
            failures.push({...listing,error:response?.error || 'No response from extension.'});
            stopped = true;
            EbayDock.save({failures});
            showFailures();
            break;
          }
          recordSuccess(listing,response);
        }
      }
    } finally {running=false; scan.disabled=false; stop.disabled=true; render();}
  }
  function showScanNotice(message) {
    running = false;
    scan.disabled = false;
    scanNotice.textContent = message;
    scanNotice.hidden = false;
    render();
  }
  scan.addEventListener('click',start);
  stop.addEventListener('click',()=>{stopped=true; stop.disabled=true;});
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
