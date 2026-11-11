(() => {
'use strict';
  const resultLists = '#srp-river-results, .srp-river-results, #srp-river-main ul.srp-results, #srp-river-main ol.srp-results';
  const secondary = '.srp-river-answer, .srp-river-recommendation, [data-testid*="carousel"], [role="complementary"], aside, [data-testid*="recommend"], [data-testid*="recently-viewed"]';
  function sponsored(card) {
    if (card.matches('[data-sponsored="true"], [data-promoted="true"]') ||
        card.querySelector('[data-sponsored="true"], [data-promoted="true"], .s-item__ad-badge, .s-card__ad-badge')) return true;
    // eBay sometimes splits the Sponsored label across individual spans.
    for (const badge of card.querySelectorAll('span, [aria-label], [title]')) {
      for (const value of [badge.getAttribute('aria-label'), badge.getAttribute('title'), badge.textContent]) {
        const text = (value || '').replace(/[\s\u200B-\u200D\uFEFF]/g,'');
        if (/^sponsored(?:(?:listing|result))?$/i.test(text)) return true;
      }
    }
    return false;
  }
  function hidden(element) {
    for (let node=element; node && node!==document.documentElement; node=node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return true;
      const style=getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true;
    }
    return false;
  }
  function listings() {
    const found = new Map();
    // Fail closed when the main search river cannot be identified. Never scan
    // page-wide cards: recommendations reuse the same classes as real results.
    const lists=[...document.querySelectorAll(resultLists)];
    for (const list of lists) {
      if (list.closest(secondary)) continue;
      let recommendations=false;
      for (const child of list.children) {
        // Secondary result groups can be siblings of ordinary cards in the river.
        if (!child.matches('.s-item, .s-card')) {
          const heading=child.querySelector('h2, h3, [role="heading"]');
          const text=(heading?.textContent || child.textContent || '').replace(/\s+/g,' ').trim();
          if (/^(?:results matching fewer words|results for fewer words|more results|explore more|you may also like|recommended for you|recently viewed|for you|related (?:items|results|searches))/i.test(text)) recommendations=true;
          continue;
        }
        const card=child;
        if (recommendations || card.closest(secondary) || hidden(card) || sponsored(card)) continue;
        const link = card.querySelector('a.s-item__link[href*="/itm/"], a.s-card__link[href*="/itm/"], a[href*="/itm/"]');
        if (!link) continue;
        let url;
        try { url = new URL(link.href, location.href); } catch { continue; }
        const id = url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/)?.[1];
        if (!id || id === '123456' || url.origin !== location.origin || found.has(id)) continue;
        const title = (card.querySelector('.s-item__title, .s-card__title, h3')?.textContent || link.textContent).replace(/Opens in a new window or tab/g, '').trim();
        if (!title || /shop on ebay/i.test(title)) continue;
        found.set(id, { title, image:card.querySelector('img')?.src, url: `${url.origin}/itm/${id}` });
      }
    }
    return [...found.values()];
  }

  globalThis.EbaySearchListings = listings;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'get-search-listings') respond({ listings: listings() });
    if (message?.type === 'parse-listing-coupon' && typeof message.html === 'string') {
      // Inert document: listing scripts are never executed or inserted into the page.
      const doc = new DOMParser().parseFromString(message.html,'text/html');
      respond({coupon:EbayVariants.getCoupon(doc)});
    }
  });
})();
