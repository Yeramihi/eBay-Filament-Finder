globalThis.EbayDock = (() => {
  'use strict';
  const mode = location.pathname.startsWith('/itm/') ? 'listing' : 'results';
  const item = location.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/)?.[1];
  const stateKey = `finder-page:${item ? location.origin+'/itm/'+item : location.href}`;
  let state = {}, host, root, collapsed = false, side = 'right', widthPercent = 25, widthTouched = false;
  let compact = false, autoCollapsed, collapseTouched = false, resizeEbay = false, resizeTouched = false;
  const rowsKey = `${stateKey}:rows`, failuresKey = `${stateKey}:failures`;
  let timer, dirty = {}, pending = Promise.resolve();
  const persistentKey = `finder:saved-page:${location.href}`;
  const ready = Promise.all([
    chrome.storage.session.get([stateKey,rowsKey,failuresKey]),
    mode === 'results' ? chrome.storage.local.get(persistentKey) : Promise.resolve({})
  ]).then(async ([saved,persistent]) => {
    const sessionState=saved[stateKey];
    state=sessionState || persistent[persistentKey]?.state || {};
    if (Object.hasOwn(saved,rowsKey)) state.results=saved[rowsKey];
    if (Object.hasOwn(saved,failuresKey)) state.failures=saved[failuresKey];
    if(mode==='results') {
      const oldRows=state.results || [];
      const listings=persistent[persistentKey]?.listings || [];
      const references=new Map(listings.map(listing=>[listing.url,listing]));
      for(const row of oldRows) references.set(row.url,{url:row.url,title:row.title,image:row.image});
      // Let the search view fetch cache rows in small asynchronous batches.
      // The dock's own controls must never wait for a full variant snapshot.
      state.restoreListings=[...references.values()];
      state.results=[];
      // Restoring data does not initiate a scan or restore failed requests.
      state.checked=state.total=new Set((state.results || []).map(row=>row.url)).size;
      state.failures=[];
      state.running=false;
    }
    return state;
  }).catch(() => state);
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!Object.keys(dirty).length) return pending;
    const snapshot = dirty;
    dirty = {};
    pending = pending.then(async () => {
      await chrome.storage.session.set(snapshot);
      if(mode==='results') {
        const {results=[],failures,restoreListings,...preferences}=state;
        const listings=[...new Map(results.map(row=>[row.url,{url:row.url,title:row.title,image:row.image}])).values()];
        await chrome.storage.local.set({[persistentKey]:{state:preferences,listings}});
      }
    }).catch(console.error);
    return pending;
  }
  function save(patch) {
    Object.assign(state,patch);
    // Input changes must never serialize the full scan on every keystroke.
    if ('results' in patch) dirty[rowsKey] = mode==='results' ? [...new Map(patch.results.map(row=>[row.url,{url:row.url,title:row.title,image:row.image}])).values()] : patch.results;
    if ('failures' in patch) dirty[failuresKey] = patch.failures;
    const {results,failures,restoreListings,...preferences} = state;
    dirty[stateKey] = preferences;
    clearTimeout(timer);
    timer = setTimeout(flush,250);
  }
  window.addEventListener('pagehide',flush);
  function update() {
    if (!host) return;
    document.documentElement.setAttribute('data-ebay-finder-side',side);
    host.style.setProperty('left',side === 'left' ? '0' : 'auto','important');
    host.style.setProperty('right',side === 'right' ? '0' : 'auto','important');
    const openWidth = compact ? 'min(320px, 100vw)' : `min(100vw, max(280px, ${widthPercent}vw))`;
    host.style.setProperty('width', collapsed ? '44px' : openWidth, 'important');
    // Overlay mode always protects the rail. Resize mode reserves the full
    // actual dock width, including compact mode and the minimum open width.
    document.documentElement.style.setProperty('--ebay-finder-inset',
      resizeEbay && !collapsed ? openWidth : '44px');
    root.querySelector('.dock').style.flexDirection = side === 'right' ? 'row' : 'row-reverse';
    root.querySelector('.content').hidden = collapsed;
    const resize = root.querySelector('.resize');
    resize.hidden = collapsed || compact;
    resize.setAttribute('aria-valuenow',String(Math.round(Math.min(100,Math.max(widthPercent,280 / innerWidth * 100)))));
    resize.setAttribute('aria-valuetext',`${Math.round(Math.min(100,Math.max(widthPercent,280 / innerWidth * 100)))}% of viewport`);
    const button = root.querySelector('.rail');
    button.setAttribute('aria-expanded',String(!collapsed));
    button.setAttribute('aria-label',`${collapsed ? 'Open' : 'Collapse'} eBay Filament finder`);
    button.textContent = `${collapsed ? 'Open' : 'Close'} · Filament finder ${side === 'right' ? (collapsed ? '‹' : '›') : (collapsed ? '›' : '‹')}`;
  }
  function toggle() { collapseTouched = true; collapsed = !collapsed; chrome.storage.local.set({[`finder:${mode}:collapsed`]:collapsed}).catch(console.error); update(); }
  function mount(element) {
    if (!host) {
      // Reserve a permanent rail gutter, or the full dock in Resize eBay mode.
      // Fixed-position eBay dialogs need the same viewport inset: root margins
      // alone do not constrain their image-gallery close buttons.
      const pageStyle=document.createElement('style');pageStyle.id='ebay-finder-page-layout';
      pageStyle.textContent=`
        html[data-ebay-finder-side] {
          box-sizing:border-box!important;
          width:calc(100% - var(--ebay-finder-inset, 44px))!important;
          min-width:0!important;
          margin-left:var(--ebay-finder-page-left)!important;
          margin-right:var(--ebay-finder-page-right)!important;
        }
        html[data-ebay-finder-side="left"] { --ebay-finder-page-left:var(--ebay-finder-inset, 44px); --ebay-finder-page-right:0px; }
        html[data-ebay-finder-side="right"] { --ebay-finder-page-left:0px; --ebay-finder-page-right:var(--ebay-finder-inset, 44px); }
        html[data-ebay-finder-side] .lightbox-dialog {
          left:var(--ebay-finder-page-left)!important;
          right:var(--ebay-finder-page-right)!important;
          width:calc(100vw - var(--ebay-finder-inset, 44px))!important;
          max-width:calc(100vw - var(--ebay-finder-inset, 44px))!important;
          box-sizing:border-box!important;
        }
        html[data-ebay-finder-side] .lightbox-dialog__window {
          max-width:100%!important;
          box-sizing:border-box!important;
        }
      `;
      document.head.append(pageStyle);
      host = document.createElement('aside'); host.id = 'ebay-finder-dock';
      host.style.cssText = 'all:initial!important;position:fixed!important;top:0!important;bottom:0!important;height:100dvh!important;z-index:2147483647!important;display:block!important;';
      root = host.attachShadow({mode:'open'});
      root.innerHTML = `<style>*{box-sizing:border-box}[hidden]{display:none!important}.dock{display:flex;height:100%;filter:drop-shadow(0 0 8px #0004)}.rail{flex:0 0 44px;width:44px;border:0;background:#17365d;color:white;font:600 14px system-ui;writing-mode:vertical-rl;cursor:pointer;touch-action:manipulation}.rail:focus-visible{outline:3px solid #fbbf24;outline-offset:-4px}.resize{flex:0 0 20px;position:relative;cursor:ew-resize;touch-action:none;background:#e2e8f0;border-inline:1px solid #cbd5e1}.resize::after{content:"⋮";position:absolute;top:50%;left:0;width:100%;text-align:center;color:#475569;font:24px system-ui}.resize:hover,.resize:focus-visible{background:#bfdbfe;outline:2px solid #2563eb;outline-offset:-2px}.content{flex:1;min-width:0;overflow:hidden;overscroll-behavior:contain;background:white;color:#18212f}</style><div class="dock"><div class="resize" role="separator" aria-label="Resize filament finder. Drag or use arrow keys." aria-orientation="vertical" aria-valuemin="1" aria-valuemax="100" tabindex="0"></div><button class="rail" aria-controls="finder-content"></button><div class="content" id="finder-content"></div></div>`;
      document.documentElement.append(host);
      root.querySelector('.rail').addEventListener('click',toggle);
      const resize=root.querySelector('.resize');
      let pointer;
      function setWidth(value){
        widthTouched=true;
        widthPercent=Math.min(100,Math.max(Math.min(280,innerWidth)/innerWidth*100,value));
        update();
      }
      function persistWidth(){chrome.storage.local.set({'finder:widthPercent':widthPercent}).catch(console.error);}
      resize.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;
        event.preventDefault();pointer=event.pointerId;resize.setPointerCapture(pointer);
      });
      resize.addEventListener('pointermove',event=>{
        if(pointer!==event.pointerId)return;
        setWidth((side==='left'?event.clientX:innerWidth-event.clientX)/innerWidth*100);
      });
      function finish(event){if(pointer!==event.pointerId)return;pointer=undefined;persistWidth();}
      resize.addEventListener('pointerup',finish);
      resize.addEventListener('pointercancel',finish);
      resize.addEventListener('lostpointercapture',finish);
      resize.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const direction=(event.key==='ArrowRight'?1:-1)*(side==='left'?1:-1);
        setWidth(event.key==='Home'?0:event.key==='End'?100:widthPercent+direction*2);
        persistWidth();
      });
      window.addEventListener('resize',update);
      root.addEventListener('keydown',event => { if(event.key === 'Escape' && !collapsed) { toggle(); root.querySelector('.rail').focus(); } });
      chrome.storage.local.get(['finder:side','finder:width','finder:widthPercent','finder:resizeEbay',`finder:${mode}:collapsed`]).then(saved => {
        if (!resizeTouched) resizeEbay = saved['finder:resizeEbay'] === true;
        side = saved['finder:side'] === 'left' ? 'left' : 'right';
        if(!widthTouched){
          const savedPercent=Number(saved['finder:widthPercent']);
          widthPercent=Number.isFinite(savedPercent)&&savedPercent>0?Math.min(100,savedPercent):
            Number.isFinite(saved['finder:width'])?Math.min(100,(saved['finder:width']+44)/innerWidth*100):25;
        }
        if (!collapseTouched && autoCollapsed === undefined) collapsed = saved[`finder:${mode}:collapsed`] === true;
        update();
      });
      chrome.storage.onChanged.addListener((changes,area) => {
        if(area !== 'local') return;
        if(changes['finder:resizeEbay']) { resizeTouched = true; resizeEbay = changes['finder:resizeEbay'].newValue === true; }
        if(changes['finder:side']) side = changes['finder:side'].newValue === 'left' ? 'left' : 'right';
        if(changes['finder:widthPercent']) { widthTouched=true; widthPercent=Math.max(1,Math.min(100,Number(changes['finder:widthPercent'].newValue)||25)); }
        update();
      });
    }
    root.querySelector('.content').replaceChildren(element); update();
  }
  return {ready,save,mount,
    isCollapsed: () => collapsed,
    setAutoCollapsed(value) {
      const initial = autoCollapsed === undefined;
      autoCollapsed = value;
      // Later result pages can open a closed finder, but never close an open
      // one. The caller only rechecks when the result titles/navigation change.
      if ((initial && !collapseTouched) || (collapsed && !value)) {
        collapsed = value;
        update();
      }
    },
    setCompact(value) {
      if (compact === value) return;
      compact = value;
      update();
    },
    onSortChange(callback) {
      chrome.storage.onChanged.addListener((changes, area) => {
        const change = changes[`finder:${mode}:sort`];
        if (area === 'local' && change) callback(change.newValue);
      });
    },
    async getSort(){return (await chrome.storage.local.get(`finder:${mode}:sort`))[`finder:${mode}:sort`];},
    saveSort(key,ascending){chrome.storage.local.set({[`finder:${mode}:sort`]:{key,ascending}}).catch(console.error);}
  };
})();
