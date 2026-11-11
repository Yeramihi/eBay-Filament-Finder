importScripts('variants.js', 'listing-cache.js', 'visible-scanner.js');


let hiddenChanges=Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'finder-hidden-set' && sender.id === chrome.runtime.id) {
    const task=hiddenChanges.then(async()=>{
      const url=EbayListingCache.canonical(message.url);
      const source=new URL(sender.url);
      if(source.origin!==new URL(url).origin || !source.pathname.startsWith('/sch/')) throw new Error('Unsupported listing URL.');
      if(![0,1,7,30].includes(message.days)) throw new Error('Choose 1 day, 1 week or 1 month.');
      const key='finder:hiddenListings';
      const saved=await chrome.storage.local.get(key);
      const hidden=Object.fromEntries(Object.entries(saved[key] || {}).filter(([,entry])=>Number.isFinite(entry?.expiresAt)&&entry.expiresAt>Date.now()));
      if(message.days===0) delete hidden[url];
      else hidden[url]={expiresAt:Date.now()+message.days*86400000,title:String(message.title || 'Hidden listing').slice(0,1000)};
      await chrome.storage.local.set({[key]:hidden});
      return {hidden};
    });
    hiddenChanges=task.catch(()=>{});
    task.then(respond,error=>respond({error:error.message}));
    return true;
  }
  if (message?.type === 'finder-cache-read' && sender.id === chrome.runtime.id) {
    Promise.all((message.urls || []).map(async url => {
      try {return {url,...await EbayListingCache.get(url)};} catch {return {url};}
    })).then(items=>respond({items}),()=>respond({items:[]}));
    return true;
  }
  if (message?.type === 'finder-cache-delete' && sender.id === chrome.runtime.id) {
    (async()=>{
      const url=EbayListingCache.canonical(message.url);
      if(new URL(sender.url).origin!==new URL(url).origin) throw new Error('Unsupported listing URL.');
      await EbayListingCache.remove(url);
      return {removed:true};
    })().then(respond,error=>respond({error:error.message}));
    return true;
  }
  if (message?.type === 'finder-cache-refresh' && sender.id === chrome.runtime.id) {
    (async()=>{
      const url=EbayListingCache.canonical(sender.url);
      if (!Array.isArray(message.rows) || !message.rows.length || message.rows.some(row=>!row || (!row.inStock&&!row.outOfStock))) return {};
      return EbayListingCache.put(url,message.rows);
    })().then(respond,()=>respond({}));
    return true;
  }
  if (message?.type === 'open-finder-guide' && sender.id === chrome.runtime.id) {
    chrome.tabs.create({url:chrome.runtime.getURL('html/guide.html')})
      .then(() => respond({opened:true}), () => respond({opened:false}));
    return true;
  }
  if (message?.type === 'get-finder-settings-view' && sender.id === chrome.runtime.id) {
    Promise.all(['html/settings.html', 'css/settings.css'].map(async path => {
      const response = await fetch(chrome.runtime.getURL(path));
      if (!response.ok) throw new Error('Settings asset unavailable.');
      return response.text();
    })).then(([html, css]) => respond({html, css}), error => {
      console.error(error);
      respond(null);
    });
    return true;
  }
  if (message?.type?.startsWith('visible-scan-')) {
    EbayVisibleScanner.handle(message,sender).then(respond,error=>respond({error:error.message}));
    return true;
  }
  if (message?.type !== 'scan-listing') return;
  (async () => {
    const url = new URL(message.url);
    const senderUrl = new URL(sender.url);
    if (sender.id !== chrome.runtime.id ||
        !/^https:\/\/(?:www\.)?ebay\.(?:co\.uk|com)$/.test(url.origin) ||
        senderUrl.origin !== url.origin || !senderUrl.pathname.startsWith('/sch/') ||
        !/^\/itm\/\d+$/.test(url.pathname)) throw new Error('Unsupported listing URL.');
    const sourceTab = sender.tab?.id;
    if (!Number.isInteger(sourceTab)) throw new Error('Missing source tab.');
    const key = url.origin + url.pathname;
    const cached = message.forceRefresh === true ? null : await EbayListingCache.get(key);
    if (cached) return cached;
    if (message.visible === true) return EbayVisibleScanner.start(key,sender,message.progress,message.returnToSource === true);
    const response = await fetch(key, { credentials: 'include', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`eBay returned HTTP ${response.status}.`);
    const html = await response.text();
    if (/<(?:title|h1)\b[^>]*>[^<]*(?:captcha|verify you are human|pardon our interruption|security measure)/i.test(html) &&
        !html.includes('"variationCombinations"')) {
      throw new Error('eBay verification page; scan stopped.');
    }
    // Parse embedded JSON only. Never execute listing scripts.
    const variants = EbayVariants.getRows([html]);
    const rows = variants.length ? variants : EbayVariants.getSingleItemRows(html, key);
    if (!rows.length) throw new Error('No readable variant or single-item data; could not verify this listing.');
    if (rows.some(row => !row.inStock && !row.outOfStock)) throw new Error('Stock status is missing; could not verify this listing.');
    let coupon;
    try {
      const parsed = await chrome.tabs.sendMessage(sourceTab,{type:'parse-listing-coupon',html});
      coupon = parsed && 'coupon' in parsed ? parsed.coupon : EbayVariants.getCoupon(html);
    } catch {
      coupon = EbayVariants.getCoupon(html);
    }
    const result = { rows: EbayVariants.withPostage(EbayVariants.withVolumePricing(rows,[html]), EbayVariants.getPostage(html)).map(row => ({...row,coupon})) };
    return EbayListingCache.put(key,result.rows);
  })().then(result => respond(result), error => respond({ error: error.message }));
  return true;
});

chrome.tabs.onUpdated.addListener((id,change) => { EbayVisibleScanner.updated(id,change).catch(console.error); });
chrome.tabs.onRemoved.addListener(id => { EbayVisibleScanner.removed(id).catch(console.error); });

// Release notes are bundled with the extension and can be revisited from its icon.
const SETTINGS_MENU = 'finder-settings';
let settingsWindow;
let openingSettings;
async function openSettings(tab) {
  if (Number.isInteger(tab?.id)) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {type:'show-finder-settings'});
      if (response?.opened) return;
    } catch { /* Other tabs use the standalone settings window. */ }
  }
  return openSettingsWindow(tab);
}
function openSettingsWindow(tab) {
  if (!openingSettings) {
    openingSettings = (async () => {
      if (settingsWindow !== undefined) {
        try {
          await chrome.windows.update(settingsWindow, {focused:true});
          return;
        } catch { settingsWindow = undefined; }
      }
      const url = new URL(chrome.runtime.getURL('html/settings.html'));
      if (tab?.width > 0) url.searchParams.set('viewport', tab.width);
      const bounds = Number.isInteger(tab?.windowId) ? await chrome.windows.get(tab.windowId).catch(() => null) : null;
      const position = bounds ? {
        left: bounds.left + Math.max(0, bounds.width - 480),
        top: bounds.top + 36
      } : {};
      const popup = await chrome.windows.create({url:url.href,type:'popup',width:460,height:560,...position});
      settingsWindow = popup.id;
    })().finally(() => { openingSettings = undefined; });
  }
  return openingSettings;
}
chrome.windows.onRemoved.addListener(id => {
  if (id === settingsWindow) settingsWindow = undefined;
});

const GUIDE_MENU = 'finder-guide';
const WHATS_NEW_MENU = 'finder-whats-new';
function openReleaseNotes() {
  return chrome.tabs.create({url:chrome.runtime.getURL('html/whats-new.html')});
}
async function handleInstallation(details) {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id:SETTINGS_MENU,title:'Settings',contexts:['action']}, () => {
    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
  });
  chrome.contextMenus.create({id:WHATS_NEW_MENU,title:'What’s new',contexts:['action']}, () => {
    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
  });
  chrome.contextMenus.create({id:GUIDE_MENU,title:'User guide',contexts:['action']}, () => {
    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError.message);
  });
  const version = chrome.runtime.getManifest().version;
  // Unpacked reloads and browser upgrades should not open another release tab.
  if (details.reason !== 'update' || details.previousVersion === version) return;
  const saved = await chrome.storage.local.get('lastReleaseNotesVersion');
  if (saved.lastReleaseNotesVersion === version) return;
  await openReleaseNotes();
  await chrome.storage.local.set({lastReleaseNotesVersion:version});
}
chrome.runtime.onInstalled.addListener(details => {
  handleInstallation(details).catch(console.error);
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === GUIDE_MENU) chrome.tabs.create({url:chrome.runtime.getURL('html/guide.html')}).catch(console.error);
  if (info.menuItemId === SETTINGS_MENU) openSettings(tab).catch(console.error);
  if (info.menuItemId === WHATS_NEW_MENU) openReleaseNotes().catch(console.error);
});
