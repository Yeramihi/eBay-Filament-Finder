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
        <div class="finder-results"><div class="finder-entries"></div></div>
      </section>
    `;

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
  let updateRows, scheduled, savedSignature;
  function refresh(){const rows=readListing();
    if(rows.length && rows.every(row=>row.inStock||row.outOfStock)) {
      const signature=JSON.stringify(rows);
      if(signature!==savedSignature) {
        savedSignature=signature;
        chrome.runtime.sendMessage({type:'finder-cache-refresh',rows}).catch(()=>{savedSignature=undefined;});
      }
    }
    if(updateRows)updateRows(rows);else if(rows.length)updateRows=mount(rows);}
  refresh();
  const observer=new MutationObserver(records=>{
    if(records.every(record=>record.target.closest?.('#ebay-finder-dock')))return;
    clearTimeout(scheduled);scheduled=setTimeout(refresh,500);
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
})();
