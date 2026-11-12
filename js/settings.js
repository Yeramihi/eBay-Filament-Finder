globalThis.EbaySettings = (() => {
  'use strict';

  const defaults = {
    'finder:side': 'right',
    'finder:widthPercent': 25,
    'finder:display': 'tiles',
    'finder:resizeEbay': false,
    parallelListings: 5,
    'finder:visibleScan': false,
    'finder:scanMode': 'background',
    'finder:cache:maxAge': 'week',
    'finder:cache:showAll': false,
    'finder:results:sort': {key:'total', ascending:true},
    'finder:listing:sort': {key:'total', ascending:true}
  };

  function bind(root, viewport, close) {
    let activeHelp, pinnedHelp=false, helpTimer;
    function hideHelp() {
      clearTimeout(helpTimer);
      if(!activeHelp) return;
      activeHelp.popup.hidePopover();
      activeHelp.button.setAttribute('aria-expanded','false');
      activeHelp=undefined;pinnedHelp=false;
    }
    function showHelp(button,pin=false) {
      clearTimeout(helpTimer);
      if(activeHelp?.button===button) {pinnedHelp=pinnedHelp||pin;return;}
      hideHelp();
      const popup=root.getElementById(button.dataset.help);
      activeHelp={button,popup};pinnedHelp=pin;
      popup.showPopover();button.setAttribute('aria-expanded','true');
      const anchor=button.getBoundingClientRect(), bounds=popup.getBoundingClientRect();
      popup.style.left=`${Math.max(8,Math.min(anchor.left,innerWidth-bounds.width-8))}px`;
      const top=anchor.bottom+6+bounds.height<=innerHeight-8 ? anchor.bottom+6 : anchor.top-bounds.height-6;
      popup.style.top=`${Math.max(8,Math.min(top,innerHeight-bounds.height-8))}px`;
    }
    const leaveHelp=()=>{if(!pinnedHelp) helpTimer=setTimeout(hideHelp,180);};
    for(const button of root.querySelectorAll('.settings-info')) {
      const popup=root.getElementById(button.dataset.help);
      button.addEventListener('pointerenter',()=>showHelp(button));
      button.addEventListener('pointerleave',leaveHelp);
      button.addEventListener('focus',()=>showHelp(button));
      button.addEventListener('blur',leaveHelp);
      button.addEventListener('click',()=>{
        if(activeHelp?.button===button&&pinnedHelp) hideHelp();
        else showHelp(button,true);
      });
      popup.addEventListener('pointerenter',()=>clearTimeout(helpTimer));
      popup.addEventListener('pointerleave',leaveHelp);
    }
    function dismissHelp(event) {
      if(activeHelp&&!event.composedPath().includes(activeHelp.button)&&!event.composedPath().includes(activeHelp.popup)) hideHelp();
    }
    function escapeHelp(event) {
      if(event.key==='Escape'&&activeHelp) {event.preventDefault();event.stopImmediatePropagation();hideHelp();}
    }
    function scrollHelp(event) {if(activeHelp&&!activeHelp.popup.contains(event.target)) hideHelp();}
    root.addEventListener('pointerdown',dismissHelp,true);
    root.addEventListener('focusin',dismissHelp,true);
    root.addEventListener('keydown',escapeHelp,true);
    root.addEventListener('scroll',scrollHelp,true);
    window.addEventListener('resize',hideHelp);
    const side = root.getElementById('side');
    const width = root.getElementById('width');
    const display = root.getElementById('display');
    const resizeEbay = root.getElementById('resize-ebay');
    const parallel = root.getElementById('parallel');
    const scanMode = root.getElementById('scan-mode');
    const cacheAge = root.getElementById('cache-age');
    const allCached=root.getElementById('all-cached');
    const storageSize=root.getElementById('storage-size');
    const purgeCache=root.getElementById('purge-cache');
    const clearMissing=root.getElementById('clear-missing');
    const storageStatus=root.getElementById('storage-status');
    let storageTimer, disposed=false, storageReading=false, storageAgain=false;
    async function updateStorageSize() {
      if(disposed) return;
      if(storageReading) {storageAgain=true;return;}
      storageReading=true;
      try {
        const bytes=await EbayRuntime.local.getBytesInUse(null);
        if(disposed) return;
        const units=['bytes','KB','MB','GB','TB'];let amount=bytes,index=0;
        while(amount>=1000&&index<units.length-1) {amount/=1000;index++;}
        storageSize.textContent=`${index ? amount.toFixed(2) : amount} ${units[index]}`;
        storageSize.title=`${bytes.toLocaleString()} bytes stored locally by this extension`;
      } catch {if(!disposed) storageSize.textContent='Size unavailable';}
      finally {
        storageReading=false;
        if(storageAgain&&!disposed) {storageAgain=false;scheduleStorageSize();}
      }
    }
    function scheduleStorageSize() {
      if(disposed || storageTimer) return;
      storageTimer=setTimeout(()=>{storageTimer=undefined;updateStorageSize();},500);
    }
    purgeCache.addEventListener('click',async()=>{
      purgeCache.disabled=true;
      storageStatus.classList.remove('error');storageStatus.textContent='Purging cache…';
      try {
        await pendingSave;
        const response=await EbayRuntime.sendMessage({type:'finder-cache-purge'});
        if(!response?.purged) throw new Error(response?.error || 'Could not purge the cache. Try again.');
        storageStatus.textContent='Cache purged. Preferences and hidden-list choices kept.';
      } catch(error) {storageStatus.textContent=error.message;storageStatus.classList.add('error');}
      finally {purgeCache.disabled=false;await updateStorageSize();}
    });
    clearMissing.addEventListener('click',async()=>{
      clearMissing.disabled=true;
      storageStatus.classList.remove('error');storageStatus.textContent='Clearing remembered missing listings…';
      try {
        const response=await EbayRuntime.sendMessage({type:'finder-missing-clear'});
        if(!response?.cleared) throw new Error(response?.error || 'Could not clear missing listings. Try again.');
        storageStatus.textContent=`Cleared ${response.count} remembered missing listings. Future scans can try those IDs again.`;
      } catch(error) {storageStatus.textContent=error.message;storageStatus.classList.add('error');}
      finally {clearMissing.disabled=false;await updateStorageSize();}
    });
    updateStorageSize();
    const reset = root.getElementById('reset');
    const confirmation = root.getElementById('reset-confirmation');
    const no = root.getElementById('reset-no');
    const preferences = root.getElementById('preferences');
    const scanning = root.getElementById('scanning');
    const warning = root.getElementById('warning');
    const status = root.getElementById('status');
    const done = root.getElementById('done');
    const version = chrome.runtime.getManifest().version;
    root.getElementById('feedback').href =
      'mailto:ebay.filament.finder@yeramihi.com?subject=' +
      encodeURIComponent(`eBay Filament finder ${version} — Feedback`);

    function showWidth(percent, legacyPixels) {
      width.querySelector('[data-custom]')?.remove();
      if (!Number.isFinite(percent) && Number.isFinite(legacyPixels)) {
        if (viewport > 0) percent = (legacyPixels + 44) / viewport * 100;
        else {
          const legacy = new Option(`${legacyPixels}px (saved)`, 'legacy');
          legacy.dataset.custom = '';
          legacy.disabled = true;
          width.append(legacy);
          width.value = legacy.value;
          return;
        }
      }
      const value = String(Math.min(100, Math.max(1, percent || 25)));
      if (![...width.options].some(option => option.value === value)) {
        const custom = new Option(`${Math.round(Number(value))}% (custom)`, value);
        custom.dataset.custom = '';
        width.append(custom);
      }
      width.value = value;
    }

    let backgroundParallel = defaults.parallelListings;
    const validParallel = count => Number.isInteger(count) && count >= 1 && count <= 999;
    function updateScanControls() {
      const background = scanMode.value !== 'visible';
      // Visible tabs only override the display, never the saved parallel count.
      parallel.value = background ? backgroundParallel : 1;
      parallel.disabled = !background;
      warning.hidden = !background || !(parallel.valueAsNumber > 20);
    }

    function showStatus(message, error = false) {
      status.textContent = message;
      status.classList.toggle('error', error);
    }

    let pendingSave = Promise.resolve(true);
    function save(patch) {
      pendingSave = pendingSave.then(async () => {
        try {
          await EbayRuntime.local.set(patch);
          showStatus('Saved automatically.');
          return true;
        } catch {
          showStatus('Could not save. Change the setting again to retry.', true);
          return false;
        }
      });
      return pendingSave;
    }

    allCached.addEventListener('change',()=>save({'finder:cache:showAll':allCached.checked}));
    cacheAge.addEventListener('change', () => save({'finder:cache:maxAge':cacheAge.value}));
    side.addEventListener('change', () => save({'finder:side': side.value}));
    width.addEventListener('change', () => save({'finder:widthPercent': Number(width.value)}));
    resizeEbay.addEventListener('change', () => save({'finder:resizeEbay': resizeEbay.checked}));
    display.addEventListener('change', () => save({'finder:display': display.value}));
    scanMode.addEventListener('change', () => {updateScanControls();save({'finder:scanMode':scanMode.value});});
    parallel.addEventListener('input', () => {
      if (scanMode.value === 'visible') return;
      if (validParallel(parallel.valueAsNumber)) backgroundParallel = parallel.valueAsNumber;
      warning.hidden = !(parallel.valueAsNumber > 20);
    });
    parallel.addEventListener('change', () => {
      if (scanMode.value === 'visible') return;
      if (parallel.reportValidity()) {
        backgroundParallel = parallel.valueAsNumber;
        save({'parallelListings': backgroundParallel});
      }
      else showStatus('Enter a whole number from 1 to 999.', true);
    });
    reset.addEventListener('click', () => {
      confirmation.showModal();
      no.focus();
    });
    no.addEventListener('click', () => confirmation.close());
    confirmation.addEventListener('close', () => done.focus());
    root.getElementById('reset-yes').addEventListener('click', async () => {
      confirmation.close();
      preferences.disabled = scanning.disabled = reset.disabled = true;
      const saved = await save(defaults);
      preferences.disabled = scanning.disabled = reset.disabled = false;
      if (!saved) return;
      side.value = defaults['finder:side'];
      showWidth(defaults['finder:widthPercent']);
      display.value = defaults['finder:display'];
      resizeEbay.checked = defaults['finder:resizeEbay'];
      backgroundParallel = defaults.parallelListings;
      scanMode.value = defaults['finder:scanMode'];
      cacheAge.value = defaults['finder:cache:maxAge'];
      allCached.checked=defaults['finder:cache:showAll'];
      updateScanControls();
      showStatus('Settings reset to defaults.');
    });
    done.addEventListener('click', async () => {
      if (parallel.willValidate && !parallel.reportValidity()) return;
      if (await pendingSave) close();
    });

    const onChange = (changes, area) => {
      if(area==='local') scheduleStorageSize();
      if(area==='local'&&changes['finder:cache:showAll']) allCached.checked=changes['finder:cache:showAll'].newValue===true;
      if (area === 'local' && changes.parallelListings) {
        const count = changes.parallelListings.newValue;
        backgroundParallel = validParallel(count) ? count : defaults.parallelListings;
        updateScanControls();
      }
      if(area==='local'&&changes['finder:cache:maxAge']) cacheAge.value=changes['finder:cache:maxAge'].newValue || 'week';
      if (area === 'local' && changes['finder:scanMode']) {scanMode.value = ['background','visible','mixed'].includes(changes['finder:scanMode'].newValue) ? changes['finder:scanMode'].newValue : 'background';updateScanControls();}
      if (area === 'local' && changes['finder:resizeEbay']) resizeEbay.checked = changes['finder:resizeEbay'].newValue === true;
      if (area === 'local' && changes['finder:widthPercent']) {
        showWidth(changes['finder:widthPercent'].newValue);
      }
    };
    chrome.storage.onChanged.addListener(onChange);

    EbayRuntime.local.get([
      'finder:side', 'finder:widthPercent', 'finder:width', 'finder:display', 'finder:resizeEbay', 'parallelListings', 'finder:visibleScan', 'finder:scanMode', 'finder:cache:maxAge', 'finder:cache:showAll'
    ]).then(saved => {
      allCached.checked=saved['finder:cache:showAll']===true;
      cacheAge.value = ['day','week','month','never'].includes(saved['finder:cache:maxAge']) ? saved['finder:cache:maxAge'] : 'week';
      side.value = saved['finder:side'] === 'left' ? 'left' : 'right';
      showWidth(saved['finder:widthPercent'], saved['finder:width']);
      resizeEbay.checked = saved['finder:resizeEbay'] === true;
      display.value = ['tiles','lines','photos'].includes(saved['finder:display']) ? saved['finder:display'] : 'tiles';
      scanMode.value = ['background','visible','mixed'].includes(saved['finder:scanMode']) ? saved['finder:scanMode'] : saved['finder:visibleScan'] === true ? 'visible' : 'background';
      const count = saved.parallelListings;
      backgroundParallel = validParallel(count) ? count : defaults.parallelListings;
      updateScanControls();
      preferences.disabled = scanning.disabled = reset.disabled = false;
      showStatus('Changes save automatically.');
    }).catch(() => showStatus('Could not load settings. Reopen this window to retry.', true));

    return () => {
      disposed=true;clearTimeout(storageTimer);hideHelp();
      root.removeEventListener('pointerdown',dismissHelp,true);
      root.removeEventListener('focusin',dismissHelp,true);
      root.removeEventListener('keydown',escapeHelp,true);
      root.removeEventListener('scroll',scrollHelp,true);
      window.removeEventListener('resize',hideHelp);
      chrome.storage.onChanged.removeListener(onChange);
    };
  }

  let activeDialog;

  async function open(x, y) {
    if (activeDialog) return;
    const host = document.createElement('div');
    const root = host.attachShadow({mode:'closed'});
    const style = document.createElement('style');
    style.textContent = `
      .settings-modal {
        position:fixed; inset:auto; margin:0; width:min(460px, calc(100vw - 24px));
        max-height:calc(100dvh - 24px); padding:0; border:1px solid #acbdd0;
        border-radius:12px; background:#f4f7fb; color:#18283b;
        box-shadow:0 12px 40px #0004; font:14px/1.45 system-ui,sans-serif;
        overscroll-behavior:contain;
      }
      .settings-modal::backdrop { background:#172a4380; }
      .settings-modal header { cursor:grab; touch-action:none; user-select:none; }
      .settings-modal header::after { content:'⠿'; margin-left:auto; color:#52647a; font-size:20px; }
      .settings-modal header:active { cursor:grabbing; }
      .settings-loading { padding:16px; }
    `;
    const dialog = document.createElement('dialog');
    dialog.className = 'settings-modal';
    dialog.setAttribute('aria-label', 'Filament finder settings');
    dialog.innerHTML = '<div class="settings-loading"><p role="status">Loading settings…</p><button type="button">Close</button></div>';
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    root.append(style, dialog);
    document.documentElement.append(host);
    activeDialog = dialog;

    let position;
    function place() {
      const bounds = dialog.getBoundingClientRect();
      const left = Math.max(12, Math.min(position?.left ?? x - bounds.width / 2, innerWidth - bounds.width - 12));
      const top = Math.max(12, Math.min(position?.top ?? y + 8, innerHeight - bounds.height - 12));
      dialog.style.left = `${left}px`;
      dialog.style.top = `${top}px`;
    }

    let unbind;
    dialog.addEventListener('close', () => {
      unbind?.();
      window.removeEventListener('resize', place);
      host.remove();
      activeDialog = undefined;
    }, {once:true});
    dialog.addEventListener('wheel', event => {
      if (event.target === dialog) event.preventDefault();
    }, {passive:false});
    dialog.showModal();
    place();
    window.addEventListener('resize', place);

    try {
      const assets = await EbayRuntime.sendMessage({type:'get-finder-settings-view'});
      if (!dialog.open) return;
      if (!assets?.html || !assets?.css) throw new Error('Settings view unavailable.');
      // These assets come from the extension package, never from the page.
      const page = new DOMParser().parseFromString(assets.html, 'text/html');
      const main = page.querySelector('main');
      main.querySelector('img').src = chrome.runtime.getURL('images/icons/icon-48.png');
      const settingsStyle = document.createElement('style');
      settingsStyle.textContent = assets.css;
      root.prepend(settingsStyle);
      dialog.replaceChildren(main);
      const header = main.querySelector('header');
      if(globalThis.EbayCards) EbayCards.tooltip(header,'Drag to move Settings');
      header.querySelector('img').draggable = false;
      let drag;
      header.addEventListener('pointerdown', event => {
        if (event.button !== 0 || drag) return;
        const bounds = dialog.getBoundingClientRect();
        drag = {id:event.pointerId, x:event.clientX - bounds.left, y:event.clientY - bounds.top};
        header.setPointerCapture(event.pointerId);
      });
      header.addEventListener('pointermove', event => {
        if (drag?.id !== event.pointerId) return;
        position = {left:event.clientX - drag.x, top:event.clientY - drag.y};
        place();
      });
      header.addEventListener('lostpointercapture', () => { drag = undefined; });
      unbind = bind(root, innerWidth, () => dialog.close());
      place();
      root.getElementById('done').focus();
    } catch {
      if (dialog.open) dialog.querySelector('[role="status"]').textContent = 'Could not open Settings. Close this popup and try again.';
    }
  }

  if (location.protocol === 'chrome-extension:') {
    bind(document, Number(new URLSearchParams(location.search).get('viewport')), () => window.close());
  } else {
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (sender.id !== chrome.runtime.id || message?.type !== 'show-finder-settings') return;
      // The toolbar menu provides no pointer coordinates. Open by the top right of the tab.
      open(innerWidth, 8);
      respond({opened:true});
    });
  }
  return {open, defaultParallel:defaults.parallelListings};
})();
