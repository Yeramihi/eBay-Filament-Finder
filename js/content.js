(async () => {
  "use strict";

  // The universal scan reader owns extension-created scan tabs. Do not mount
  // the normal listing dock or alter eBay's page width in those tabs.
  try { if ((await chrome.runtime.sendMessage({type:'visible-scan-context'}))?.scan) return; }
  catch { /* Normal browsing remains available if the worker is unavailable. */ }
  const listingUrl = location.href;
  const PANEL_ID = "ebay-variant-prices";
  if (document.getElementById(PANEL_ID)) return;

  const normalise = value => String(value).replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();
  const settle = () => new Promise(resolve => setTimeout(resolve, 20));

  // Use eBay's own option click handlers so its price and basket state update too.
  async function selectVariant(row) {
    if (row.outOfStock) return false;
    const controls = () => Array.from(document.querySelectorAll(
      '.x-sku button[aria-haspopup="listbox"]'
    ));
    if (controls().length !== row.values.length) return false;

    async function waitFor(check) {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        if (check()) return true;
        await settle();
      }
      return false;
    }

    function isSelected(index, value) {
      const button = controls()[index];
      if (!button) return false;
      const list = document.getElementById(button.getAttribute("aria-controls"));
      const selected = list?.querySelector('[role="option"][aria-selected="true"]');
      if (value === null) {
        return normalise(button.value) === "Select" &&
          !selected?.hasAttribute("data-sku-value-name");
      }
      return normalise(button.value) === value;
    }

    async function choose(index, value) {
      // A cleared dependent box may already have been reset by eBay.
      if (isSelected(index, value)) return await waitFor(() => isSelected(index, value));
      let button = controls()[index];
      if (!button || button.disabled) return false;
      if (button.getAttribute("aria-expanded") !== "true") button.click();
      const findOption = () => {
        button = controls()[index];
        const list = document.getElementById(button?.getAttribute("aria-controls"));
        return Array.from(list?.querySelectorAll('[role="option"]') || [])
          .find(option => value === null
            ? !option.hasAttribute("data-sku-value-name") &&
              normalise(option.querySelector(".listbox__value")?.textContent
                .replace(/selected\s*$/, "")) === "Select"
            : normalise(option.getAttribute("data-sku-value-name")) === value);
      };
      if (!await waitFor(() => {
        const option = findOption();
        return option && option.getAttribute("aria-disabled") !== "true";
      })) {
        if (button?.getAttribute("aria-expanded") === "true") button.click();
        return false;
      }
      findOption().click();
      // Yield once for eBay's dependent dropdown updates, without a fixed delay.
      await new Promise(resolve => setTimeout(resolve, 0));
      return await waitFor(() => isSelected(index, value));
    }

    // Clear dependent choices from last to first before selecting a new combination.
    for (let i = row.values.length - 1; i >= 0; i--) {
      if (!await choose(i, null)) return false;
    }
    for (let i = 0; i < row.values.length; i++) {
      if (!await choose(i, normalise(row.values[i]))) return false;
    }
    return controls().every((button, index) =>
      normalise(button.value) === normalise(row.values[index]));
  }

  function mount(rows) {
    const host = document.createElement("div");
    host.id = PANEL_ID;
    host.style.cssText = 'display:block;width:100%';
    const root = host.attachShadow({ mode: "open" });

    root.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        .panel {
          color: #18212f;
          background: white;
          border: 0;
          font: 12px/1.4 system-ui, sans-serif;
        }
        button { font: inherit; cursor: pointer; }
        .filter {
          display: grid;
          grid-template-columns: minmax(0,1fr);
          padding: 8px 9px 4px;
          gap: 12px;
        }
        input {
          width: 100%;
          padding: 5px 7px;
          border: 1px solid #aab7c7;
          border-radius: 6px;
          font: inherit;
        }
        input:focus { outline: 2px solid #86b7fe; }
        input[aria-invalid="true"] { border-color: #c62828; }
        .status {
          padding: 3px 9px 6px;
          font-size: 12px;
          color: #64748b;
        }
        .apply-filters { margin: 0 9px 6px; }
        .status.error { color: #b91c1c; }
        [hidden] { display: none !important; }
      </style>
      <section class="panel finder-layout" aria-label="eBay variant prices">
        <div class="finder-toolbar" id="finder-toolbar">
          <div class="filter">
            <input
              type="text"
              placeholder="Filter variants (all words)"
              aria-label="Filter variant names: all words, in any order"
              autocomplete="off"
              spellcheck="false"
            >
          </div>
          <button class="apply-filters finder-button" type="button">Apply filters</button>
          <div class="status" role="status" aria-live="polite"></div>
        </div>
        <div class="finder-results"><div class="price-change-status status error" role="alert" hidden></div><div class="cache-status status" role="status" aria-live="polite"><span></span> <button type="button" class="cache-retry" hidden>Retry cache save</button></div><div class="finder-entries"></div></div>
      </section>
    `;

    const priceStatus=root.querySelector('.price-change-status');
    updatePriceNotice=message=>{priceStatus.textContent=message;priceStatus.hidden=!message;};
    const cacheStatus=root.querySelector('.cache-status');
    const cacheRetry=root.querySelector('.cache-retry');
    updateCacheNotice=(message,error=false)=>{
      cacheStatus.querySelector('span').textContent=message;
      cacheStatus.classList.toggle('error',error);
      cacheRetry.hidden=!error;
    };
    cacheRetry.addEventListener('click',()=>{
      savedSignature=undefined;
      cacheCandidate=undefined;
      queueCacheSave(readListing());
    });
    const input = root.querySelector("input");
    const status = root.querySelector(".status");
    const syncSort = EbayCards.controls(root,[['label','Variant'],['total','Individual purchase'],['spool','Bulk purchase*']],(key,direction)=>{sortTouched=true;sortKey=key;ascending=direction;EbayDock.saveSort(key,direction);render();});
    const collator = new Intl.Collator(undefined, {
      sensitivity: "base",
      numeric: true
    });

    let sortKey = "total";
    let ascending = true;
    let sortTouched = false;
    let filters = [];
    let selecting = false;

    function formatPrice(row) {
      if (typeof row.amount !== "number") return "Unknown";

      const prefix = row.approximate ? '≈ ' : '';
      try {
        return prefix + EbayVariants.formatCurrency(row.amount,row.currency);
      } catch {
        return prefix + `${row.amount.toFixed(2)} ${row.currency}`.trim();
      }
    }

    const rowElements = new WeakMap();
    let renderGeneration = 0;
    async function render() {
      const generation = ++renderGeneration;
      await new Promise(resolve => setTimeout(resolve,0));
      if (generation !== renderGeneration) return;
      const visible = rows.filter(row => EbayVariants.matches(row.label, filters));

      const average = EbayVariants.matchingAverage(visible);
      visible.sort((a, b) => {
        if (sortKey === 'spool') return EbayVariants.compareSpool(a,b,ascending);
        if (['amount','postage','total'].includes(sortKey)) return EbayVariants.comparePrice(a,b,sortKey,ascending);

        const result = collator.compare(a.label, b.label);
        return (ascending ? result : -result) || collator.compare(a.title || '',b.title || '');
      });

      const entries = [];
      const outOfStock = [];
      const averageUpdates = [];
      let batchStarted=performance.now();
      for(const row of visible){
        if(performance.now()-batchStarted>8){await new Promise(resolve=>setTimeout(resolve,0));if(generation!==renderGeneration)return;batchStarted=performance.now();}
        let entry=rowElements.get(row);
        if(!entry){entry=EbayCards.entry(row,formatPrice,{url:listingUrl,select:async(row,url)=>{
          if(selecting)return;selecting=true;status.textContent=`Selecting ${row.label}…`;
          try{const selected=await selectVariant(row);status.textContent=selected?`Selected: ${row.label}`:'Could not select this combination. ';
            if(!selected){const fallback=document.createElement('a');fallback.href=url.href;fallback.textContent='Open variant with page reload';status.append(fallback);}
          }catch{status.textContent='Selection failed. Please select the dropdowns manually.';}finally{selecting=false;}
        }});rowElements.set(row,entry);}
        averageUpdates.push([entry,row.outOfStock ? null : average]);
        (row.outOfStock ? outOfStock : entries).push(entry);
      }
      if(!entries.length) entries.push(EbayCards.emptyState({outOfStock:outOfStock.length>0}));
      if(generation!==renderGeneration)return;
      for (const [entry,average] of averageUpdates) EbayCards.updateAverage(entry,average,formatPrice,sortKey);
      EbayCards.showEntries(root, entries, outOfStock);
      status.classList.remove('error');
      status.textContent=rows.length===1&&rows[0].singleItem?'Listing information':`${visible.length} of ${rows.length} variants`;
      syncSort(sortKey,ascending);
    }

    function updateFilter() {
      filters = EbayVariants.terms(input.value);
      render();
    }
    function applyFilters() {
      updateFilter();
      EbayDock.save({query:input.value,appliedQuery:input.value});
    }
    root.querySelector('.apply-filters').addEventListener('click',applyFilters);
    input.addEventListener('keydown',event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); applyFilters(); }
    });

    EbayDock.mount(host);
    render();
    EbayDock.ready.then(saved => {
      input.value = saved.query || "";
      filters = EbayVariants.terms(saved.appliedQuery ?? input.value);
      render();
    });
    function applySavedSort(saved) {
      if (!saved || !['label','amount','postage','total','spool'].includes(saved.key) || typeof saved.ascending !== 'boolean') return;
      sortKey = ['amount','postage'].includes(saved.key) ? 'total' : saved.key; ascending = saved.ascending; render();
    }
    EbayDock.onSortChange(saved => {
      sortTouched = true;
      applySavedSort(saved);
    });
    EbayDock.getSort().then(saved => {
      if (!sortTouched) applySavedSort(saved);
    });
    return nextRows => {
      if (JSON.stringify(rows) === JSON.stringify(nextRows)) return;
      rows = nextRows;
      render();
    };
  }

  const readListing = () => EbayListingData();
  let updateRows, scheduled, savedSignature, cacheCandidate, cacheSaveTimer, cacheSaving=false;
  let updateCacheNotice=()=>{}, updatePriceNotice=()=>{};
  let openedVariantId=new URL(listingUrl).searchParams.get('var');
  const reportedPriceChanges=new Map();
  let priceWarning, closedPriceWarning='';
  function money(value,currency) {
    if(!Number.isFinite(value)) return 'unknown';
    try{return EbayVariants.formatCurrency(value,currency);}catch{return `${value.toFixed(2)} ${currency || ''}`;}
  }
  function priceChangeText(change) {
    const parts=[];
    for(const [field,label] of [['item','Item price'],['postage','Postage'],['individual','Individual purchase'],['bulk','Bulk purchase']]) {
      const before=change.before[field], after=change.after[field];
      if(Number.isFinite(before)&&Number.isFinite(after)&&(Math.round(before*100)!==Math.round(after*100)||change.before.currency!==change.after.currency)) {
        parts.push(`${label}: ${money(before,change.before.currency)} → ${money(after,change.after.currency)}`);
      }
    }
    return parts.join('; ');
  }
  function updatePriceWarnings(rows) {
    if(!reportedPriceChanges.size) {updatePriceNotice('');priceWarning?.host.remove();priceWarning=undefined;return;}
    if(!openedVariantId && !rows.some(row=>row.singleItem)) {
      const controls=[...document.querySelectorAll('.x-sku button[aria-haspopup="listbox"]')];
      const selected=controls.length&&rows.find(row=>row.values?.length===controls.length && row.values.every((value,index)=>normalise(value)===normalise(controls[index].value)));
      if(selected?.id!=null) openedVariantId=String(selected.id);
    }
    const openedKey=rows.some(row=>row.singleItem) ? 'single' : openedVariantId ? 'variant:'+openedVariantId : null;
    const change=openedKey&&reportedPriceChanges.get(openedKey);
    const others=[...reportedPriceChanges.values()].filter(item=>item.id!==openedKey);
    updatePriceNotice(others.length ? `Price changes detected for ${others.length} ${openedKey ? 'other ' : ''}variant${others.length===1?'':'s'} since the saved scan. ${others.slice(0,3).map(item=>`${item.label}: ${priceChangeText(item)}`).join(' | ')}${others.length>3?' | More variants also changed.':''}` : '');
    if(!change) return;
    const signature=JSON.stringify(change);
    if(signature===closedPriceWarning || priceWarning?.signature===signature) return;
    priceWarning?.host.remove();
    const host=document.createElement('div');host.id='ebay-finder-price-warning';
    host.style.cssText='all:initial!important;position:fixed!important;top:12px!important;left:56px!important;right:56px!important;z-index:2147483647!important;';
    const shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');style.textContent='section{display:flex;align-items:start;gap:12px;max-width:920px;margin:auto;padding:14px 16px;border:2px solid #b4232c;border-radius:10px;background:#fff1f0;color:#8a1720;box-shadow:0 4px 18px #0003;font:14px/1.5 system-ui}strong{display:block}button{flex:none;margin-left:auto;padding:5px 10px;border:1px solid #b4232c;border-radius:5px;background:white;color:#8a1720;font:13px system-ui;cursor:pointer}';
    const section=document.createElement('section');section.setAttribute('role','alert');
    const text=document.createElement('div'), heading=document.createElement('strong'), detail=document.createElement('span');
    heading.textContent='Price changed since the saved scan';
    detail.textContent=`${change.label}: ${priceChangeText(change)}. Review the current listing before purchasing.`;
    text.append(heading,detail);
    const close=document.createElement('button');close.type='button';close.textContent='Close';close.setAttribute('aria-label','Dismiss price change warning');
    close.addEventListener('click',()=>{closedPriceWarning=signature;host.remove();priceWarning=undefined;});
    section.append(text,close);shadow.append(style,section);document.documentElement.append(host);
    priceWarning={host,signature};
  }
  function queueCacheSave(rows) {
    if(!rows.length) return;
    const signature=JSON.stringify(rows);
    if(signature===savedSignature) return;
    if(cacheCandidate?.signature!==signature) {
      cacheCandidate={signature,rows,attempts:0};
      clearTimeout(cacheSaveTimer);
      updateCacheNotice('Updating saved listing data…');
      // Let eBay finish populating its embedded variant data before replacing
      // the full saved listing. Later data changes get their own save.
      cacheSaveTimer=setTimeout(saveCacheCandidate,750);
    }
  }
  async function saveCacheCandidate() {
    if(cacheSaving || !cacheCandidate || cacheCandidate.signature===savedSignature) return;
    cacheSaving=true;
    const candidate=cacheCandidate;
    candidate.attempts++;
    let saved=false;
    try {
      const response=await chrome.runtime.sendMessage({type:'finder-cache-refresh',rows:candidate.rows});
      for(const change of response?.priceChanges || []) {
        const previous=reportedPriceChanges.get(change.id);
        const combined=previous ? {...change,before:previous.before,previousFetchedAt:previous.previousFetchedAt} : change;
        if(priceChangeText(combined)) reportedPriceChanges.set(change.id,combined);
        else reportedPriceChanges.delete(change.id);
      }
      updatePriceWarnings(candidate.rows);
      if(response?.saved!==true || !Number.isFinite(response.fetchedAt)) throw new Error(response?.error || 'The extension did not confirm the cache update. Reload this listing if the extension was updated.');
      savedSignature=candidate.signature;
      saved=true;
      updateCacheNotice(`Saved to cache: ${new Date(response.fetchedAt).toLocaleString()}`);
    } catch(error) {
      updateCacheNotice(`Could not update saved listing data: ${error.message}`,true);
    } finally {
      cacheSaving=false;
      if(cacheCandidate!==candidate || (!saved && candidate.attempts<3)) {
        clearTimeout(cacheSaveTimer);
        cacheSaveTimer=setTimeout(saveCacheCandidate,1000);
      }
    }
  }
  function refresh(){
    const rows=readListing();
    if(updateRows) updateRows(rows);
    else if(rows.length) updateRows=mount(rows);
    updatePriceWarnings(rows);
    queueCacheSave(rows);
  }
  refresh();
  const observer=new MutationObserver(records=>{
    if(records.every(record=>record.target.closest?.('#ebay-finder-dock')))return;
    clearTimeout(scheduled);scheduled=setTimeout(refresh,500);
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  // Hydration may change script text without an observable child-list update.
  // Re-read briefly after load; unchanged data is never written repeatedly.
  let hydrationReads=0;
  const hydrationTimer=setInterval(()=>{
    refresh();
    if(++hydrationReads>=15) clearInterval(hydrationTimer);
  },1000);
  window.addEventListener('pagehide',()=>clearInterval(hydrationTimer),{once:true});
})();
