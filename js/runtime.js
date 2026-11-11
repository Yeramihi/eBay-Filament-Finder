// Content scripts can outlive an extension reload. Stop obsolete work before
// touching Chrome APIs, and treat document/context teardown as cancellation.
globalThis.EbayRuntime=(()=>{
  let disposed=false,suspended=false;
  const cleanup=new Set();
  class Cancelled extends Error {constructor(){super('Extension context invalidated; reload this page.');this.cancelled=true;}}
  const expected=error=>!!error?.cancelled || /extension context invalidated|context has been invalidated|page is unloading/i.test(error?.message || String(error));
  function dispose() {
    if(disposed) return;
    disposed=true;
    for(const callback of cleanup) {try{callback();}catch{}}
    cleanup.clear();
  }
  function active() {
    if(disposed||suspended) return false;
    try {if(!chrome.runtime.id) {dispose();return false;}}catch{dispose();return false;}
    return true;
  }
  function assertActive() {if(!active()) throw new Cancelled();}
  async function call(action) {
    assertActive();
    try {return await action();}
    catch(error) {if(expected(error)) {dispose();throw new Cancelled();}throw error;}
  }
  function report(error) {if(expected(error)) {if(!suspended) dispose();return;}console.error(error);}
  const sendMessage=message=>call(()=>chrome.runtime.sendMessage(message));
  const local={get:keys=>call(()=>chrome.storage.local.get(keys)),set:patch=>call(()=>chrome.storage.local.set(patch)),getBytesInUse:keys=>call(()=>chrome.storage.local.getBytesInUse(keys))};
  const session={
    async get(keys) {
      const response=await sendMessage({type:'finder-page-session-get',keys});
      if(response?.error) throw new Error(response.error);
      return response?.data || {};
    },
    async set(patch) {
      const response=await sendMessage({type:'finder-page-session-set',patch});
      if(response?.error) throw new Error(response.error);
    }
  };
  window.addEventListener('pagehide',event=>{if(event.persisted) suspended=true;else dispose();});
  window.addEventListener('pageshow',()=>{suspended=false;active();});
  window.addEventListener('unhandledrejection',event=>{if(expected(event.reason)) {event.preventDefault();report(event.reason);}});
  return {active,assertActive,expected,report,sendMessage,local,session,onDispose:callback=>{if(disposed)callback();else cleanup.add(callback);}};
})();
