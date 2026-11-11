globalThis.EbayDock = (() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const mode = location.pathname.includes('search-panel') ? 'results' : 'listing';
  const url = new URL(params.get('url'));
  const itemId = mode === 'listing' && url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/)?.[1];
  const stateUrl = itemId ? `${url.origin}/itm/${itemId}` : params.get('url');
  const key = `finder-tab:${params.get('tab')}:${stateUrl}`;
  let state = {};
  let pending = Promise.resolve();
  const rowsKey = `${key}:rows`;
  const failuresKey = `${key}:failures`;
  const ready = chrome.storage.session.get([key,rowsKey,failuresKey]).then(saved => {
    state = saved[key] || {};
    if (saved[rowsKey]) state.results = saved[rowsKey];
    if (saved[failuresKey]) state.failures = saved[failuresKey];
    return state;
  });
  let timer;
  let dirty = {};
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    const snapshot = dirty;
    dirty = {};
    pending = pending.then(() => chrome.storage.session.set(snapshot)).catch(console.error);
    return pending;
  }
  function save(patch) {
    Object.assign(state, patch);
    // Keep large scan arrays separate so typing only saves small UI preferences.
    if ('results' in patch) dirty[rowsKey] = patch.results;
    if ('failures' in patch) dirty[failuresKey] = patch.failures;
    const {results,failures,...preferences} = state;
    dirty[key] = preferences;
    clearTimeout(timer);
    timer = setTimeout(flush,250);
  }
  window.addEventListener('pagehide',flush);
  return {
    ready, save,
    mount: element => document.body.append(element),
    async getSort() {
      await ready;
      return state.sort || (await chrome.storage.local.get(`finder:${mode}:sort`))[`finder:${mode}:sort`];
    },
    saveSort(key,ascending) {
      save({sort:{key,ascending}});
      chrome.storage.local.set({[`finder:${mode}:sort`]:{key,ascending}}).catch(console.error);
    }
  };
})();
