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
    'finder:results:sort': {key:'total', ascending:true},
    'finder:listing:sort': {key:'total', ascending:true}
  };

  function bind(root, viewport, close) {
    const side = root.getElementById('side');
    const width = root.getElementById('width');
    const display = root.getElementById('display');
    const resizeEbay = root.getElementById('resize-ebay');
    const parallel = root.getElementById('parallel');
    const scanMode = root.getElementById('scan-mode');
    const cacheAge = root.getElementById('cache-age');
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
          await chrome.storage.local.set(patch);
          showStatus('Saved automatically.');
          return true;
        } catch {
          showStatus('Could not save. Change the setting again to retry.', true);
          return false;
        }
      });
      return pendingSave;
    }

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
      updateScanControls();
      showStatus('Settings reset to defaults.');
    });
    done.addEventListener('click', async () => {
      if (parallel.willValidate && !parallel.reportValidity()) return;
      if (await pendingSave) close();
    });

    const onChange = (changes, area) => {
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

    chrome.storage.local.get([
      'finder:side', 'finder:widthPercent', 'finder:width', 'finder:display', 'finder:resizeEbay', 'parallelListings', 'finder:visibleScan', 'finder:scanMode', 'finder:cache:maxAge'
    ]).then(saved => {
      cacheAge.value = ['day','week','month','never'].includes(saved['finder:cache:maxAge']) ? saved['finder:cache:maxAge'] : 'week';
      side.value = saved['finder:side'] === 'left' ? 'left' : 'right';
      showWidth(saved['finder:widthPercent'], saved['finder:width']);
      resizeEbay.checked = saved['finder:resizeEbay'] === true;
      display.value = saved['finder:display'] === 'lines' ? 'lines' : 'tiles';
      scanMode.value = ['background','visible','mixed'].includes(saved['finder:scanMode']) ? saved['finder:scanMode'] : saved['finder:visibleScan'] === true ? 'visible' : 'background';
      const count = saved.parallelListings;
      backgroundParallel = validParallel(count) ? count : defaults.parallelListings;
      updateScanControls();
      preferences.disabled = scanning.disabled = reset.disabled = false;
      showStatus('Changes save automatically.');
    }).catch(() => showStatus('Could not load settings. Reopen this window to retry.', true));

    return () => chrome.storage.onChanged.removeListener(onChange);
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
      const assets = await chrome.runtime.sendMessage({type:'get-finder-settings-view'});
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
