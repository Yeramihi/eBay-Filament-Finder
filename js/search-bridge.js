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

  // Opening the finder reads title elements only, including sponsored titles.
  // Discovery below keeps its stricter organic-listing rules.
  globalThis.EbaySearchResultsKey = () => [...document.querySelectorAll(resultLists)]
    .filter(list => !list.closest(secondary))
    .flatMap(list => [...list.querySelectorAll('.s-item .s-item__title, .s-card .s-card__title, .s-item h3, .s-card h3')])
    .filter(title => !title.closest(secondary) && !hidden(title))
    .map(title => `${title.closest('.s-item, .s-card')?.querySelector('a[href*="/itm/"]')?.href || ''}:${title.textContent}`)
    .join('\n');
  globalThis.EbaySearchHasFilament = () => [...document.querySelectorAll(resultLists)].some(list =>
    !list.closest(secondary) && [...list.querySelectorAll('.s-item .s-item__title, .s-card .s-card__title, .s-item h3, .s-card h3')].some(title =>
      !title.closest(secondary) && !hidden(title) && /\bfilament\b/i.test(title.textContent || '')));
  globalThis.EbaySearchQuery = () => {
    const field = document.querySelector('#gh-ac, input[name="_nkw"]');
    return field ? field.value.trim() : (new URL(location.href).searchParams.get('_nkw') || '').trim();
  };
  globalThis.EbaySearchPagination = () => {
    const pagination = [...document.querySelectorAll(
      '#srp-river-results .pagination, .srp-river-results .pagination, #srp-river-main .pagination, .srp-main .pagination'
    // eBay wraps genuine pagination in .srp-river-answer too. That wrapper is
    // excluded for listing discovery, but must remain eligible for navigation.
    )].find(nav => !nav.closest(secondary.replace('.srp-river-answer, ', '')) && !hidden(nav));
    function link(direction) {
      if (!pagination) return null;
      const selector = direction === 'previous'
        ? 'a.pagination__previous[href], a[rel="prev"][href], a[aria-label="Go to previous search page"][href]'
        : 'a.pagination__next[href], a[rel="next"][href], a[aria-label="Go to next search page"][href]';
      return [...pagination.querySelectorAll(selector)].find(anchor => {
        if (hidden(anchor) || anchor.closest('[aria-disabled="true"], [disabled]')) return false;
        const href = anchor.getAttribute('href')?.trim();
        if (!href || href.startsWith('#')) return false;
        try {
          const target = new URL(href, location.href);
          return target.origin === new URL(location.href).origin && target.pathname.startsWith('/sch/');
        } catch { return false; }
      }) || null;
    }
    const selected = pagination?.querySelector('[aria-current="page"], [aria-current="true"]')?.textContent?.trim();
    const value = /^\d+$/.test(selected || '') ? selected : new URL(location.href).searchParams.get('_pgn');
    const page = /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 1;
    return {page, previous:link('previous'), next:link('next')};
  };
  globalThis.EbaySearchListings = listings;
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === 'get-search-listings') respond({ listings: listings() });
    if(message?.type==='parse-listing-relevance' && typeof message.html==='string') {
      const doc=new DOMParser().parseFromString(message.html,'text/html');
      respond(EbayVariants.listingFilamentInfo(doc));
    }
    if (message?.type === 'parse-listing-coupon' && typeof message.html === 'string') {
      // Inert document: listing scripts are never executed or inserted into the page.
      const doc = new DOMParser().parseFromString(message.html,'text/html');
      respond({coupon:EbayVariants.getCoupon(doc)});
    }
  });
})();
