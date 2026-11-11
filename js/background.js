importScripts('variants.js');

const cache = new Map();
const MAX_AGE = 30 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, respond) => {
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
    let pageCache = cache.get(sourceTab);
    if (!pageCache) { pageCache = new Map(); cache.set(sourceTab,pageCache); }
    const key = url.origin + url.pathname;
    const cached = pageCache.get(key);
    if (cached && Date.now() - cached.time < MAX_AGE) return cached.result;
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
    // A request started before a page reload must not refill the new page's cache.
    if (cache.get(sourceTab) === pageCache) {
      pageCache.set(key, { time: Date.now(), result });
    }
    return result;
  })().then(result => respond(result), error => respond({ error: error.message }));
  return true;
});

chrome.tabs.onUpdated.addListener((id,change) => { if (change.status === 'loading') cache.delete(id); });
chrome.tabs.onRemoved.addListener(id => { cache.delete(id); });

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
  if (info.menuItemId === SETTINGS_MENU) openSettings(tab).catch(console.error);
  if (info.menuItemId === WHATS_NEW_MENU) openReleaseNotes().catch(console.error);
});
