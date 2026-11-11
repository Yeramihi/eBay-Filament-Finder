'use strict';
const views = new Map();
let generation = 0;
async function showActive() {
  const current = ++generation;
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (current !== generation) return;
  for (const view of views.values()) view.frame.hidden = true;
  const url = tab?.url ? new URL(tab.url) : null;
  const supported = url && /^https:\/\/(?:www\.)?ebay\.(?:co\.uk|com)$/.test(url.origin);
  const mode = supported && (url.pathname.startsWith('/sch/') ? 'search' : url.pathname.startsWith('/itm/') ? 'listing' : null);
  document.getElementById('hint').hidden = !!mode;
  document.getElementById('views').hidden = !mode;
  if (!mode) return;
  const itemId = mode === 'listing' && url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/)?.[1];
  const panelUrl = itemId ? `${url.origin}/itm/${itemId}` : tab.url;
  let view = views.get(tab.id);
  if (!view || view.url !== panelUrl) {
    view?.frame.remove();
    const frame = document.createElement('iframe');
    frame.title = mode === 'search' ? 'Filament search results' : 'Listing variants';
    frame.src = `${mode === 'search' ? 'search' : 'listing'}-panel.html?${new URLSearchParams({tab:String(tab.id),url:panelUrl})}`;
    document.getElementById('views').append(frame);
    view = {url:panelUrl,frame}; views.set(tab.id,view);
  }
  view.frame.hidden = false;
}
chrome.tabs.onActivated.addListener(showActive);
chrome.tabs.onUpdated.addListener((id,change)=>{if(change.status === 'complete' || change.url) showActive();});
chrome.tabs.onRemoved.addListener(id=>{views.get(id)?.frame.remove();views.delete(id);});
showActive().catch(console.error);
