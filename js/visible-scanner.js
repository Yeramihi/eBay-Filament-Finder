// One active listing job, with a reusable extension-owned tab per search page.
// Session storage preserves ownership across MV3 worker restarts.
globalThis.EbayVisibleScanner = (() => {
  const activeKey = 'finder:visibleScan:active';
  const resultKey = source => `finder:visibleScan:result:${source}`;
  const tabKey = source => `finder:visibleScan:tab:${source}`;
  const ownerKey = tab => `finder:visibleScan:owner:${tab}`;
  let pending = Promise.resolve();
  function serial(task) {
    const next = pending.then(task);
    pending = next.catch(() => {});
    return next;
  }
  const get = async key => (await chrome.storage.session.get(key))[key];
  const read = () => get(activeKey);
  const write = job => chrome.storage.session.set({[activeKey]:job});
  function sameItem(value, expected) {
    try {
      const url = new URL(value), target = new URL(expected);
      const id = url.pathname.match(/^\/itm\/(?:[^/]+\/)?(\d+)(?:\/|$)/)?.[1];
      return url.origin === target.origin && id === target.pathname.split('/').pop();
    } catch { return false; }
  }
  function sourceOwns(job, sender) {
    return sender.tab?.id === job.sourceTab && (!job.sourceDocument || sender.documentId === job.sourceDocument);
  }
  function unchanged(tab, owner) {
    return sameItem(tab.url,owner.url) && (!tab.pendingUrl || sameItem(tab.pendingUrl,owner.url));
  }
  async function forget(owner) {
    if (!owner) return;
    await chrome.storage.session.remove(ownerKey(owner.tabId));
    const current=await get(tabKey(owner.sourceTab));
    if (current?.tabId===owner.tabId) await chrome.storage.session.remove(tabKey(owner.sourceTab));
  }
  function notifyStop(owner, jobId) {
    // Target the original document so a stale scan tab cannot stop a new search.
    return chrome.tabs.sendMessage(owner.sourceTab,{type:'visible-scan-stop-source',jobId},
      owner.sourceDocument ? {documentId:owner.sourceDocument} : {}).catch(() => {});
  }
  async function finish(job, result, completed = false) {
    // Commit before releasing the job. The source records this listing, then
    // starts the next URL in the same tab instead of creating another tab.
    await chrome.storage.session.set({[resultKey(job.sourceTab)]:{
      id:job.id, sourceDocument:job.sourceDocument, result
    }});
    await chrome.storage.session.remove(activeKey);
    let tab;
    try {tab=await chrome.tabs.get(job.tabId);} catch {await forget(await get(ownerKey(job.tabId)));return result;}
    chrome.tabs.sendMessage(job.tabId,{type:'visible-scan-ended',jobId:job.id,completed,
      detail:completed?'Listing scanned. Waiting for the next listing…':result.error || 'Scan stopped. You can close this tab.'}).catch(() => {});
    if (completed && unchanged(tab,job) && tab.active && job.returnToSource) {
      await chrome.tabs.update(job.sourceTab,{active:true}).catch(() => {});
    }
    return result;
  }
  function start(url, sender, progress, returnToSource = false) {
    return serial(async () => {
      let existing=await read();
      if (existing && existing.sourceTab===sender.tab.id && existing.sourceDocument && existing.sourceDocument!==sender.documentId) {
        await finish(existing,{cancelled:true,error:'The search page was reloaded. Previous scan stopped; its tab was left open.'});
        existing=null;
      }
      if (existing) {
        if (sourceOwns(existing,sender) && existing.url===url) return {pending:true,jobId:existing.id};
        return {paused:true,error:'Another visible-tab scan is active. Finish or stop it, then click Scan again.'};
      }
      let owner=await get(tabKey(sender.tab.id)), tab, created=false, registered=false;
      if (owner) {
        try {
          const candidate=await chrome.tabs.get(owner.tabId);
          if (sourceOwns(owner,sender) && unchanged(candidate,owner)) tab=candidate;
        } catch { /* Closed tabs are replaced. */ }
        if (!tab) await forget(owner); // Preserve tabs navigated elsewhere.
      }
      try {
        if (!tab) {
          tab=await chrome.tabs.create({url:'about:blank',active:true,openerTabId:sender.tab.id,windowId:sender.tab.windowId});
          created=true;
        }
        const job={id:crypto.randomUUID(),url,sourceTab:sender.tab.id,sourceDocument:sender.documentId,
          tabId:tab.id,progress,returnToSource,status:'loading',detail:'Waiting for listing data…',lastPoll:Date.now()};
        owner={sourceTab:job.sourceTab,sourceDocument:job.sourceDocument,tabId:tab.id,url,lastJobId:job.id};
        await chrome.storage.session.remove(resultKey(sender.tab.id));
        // Establish ownership before navigation, so the new page suppresses its
        // normal sidebar and displays the scan notice from document start.
        await chrome.storage.session.set({[activeKey]:job,[tabKey(job.sourceTab)]:owner,[ownerKey(tab.id)]:owner});
        registered=true;
        await chrome.tabs.update(tab.id,{url,active:true});
        return {pending:true,jobId:job.id};
      } catch (error) {
        await chrome.storage.session.remove(activeKey);
        if (registered) await forget(owner);
        if (created && tab) await chrome.tabs.remove(tab.id).catch(() => {});
        return {paused:true,error:`Could not open scan tab: ${error.message}`};
      }
    });
  }
  function handle(message, sender) {
    return serial(async () => {
      if (sender.id!==chrome.runtime.id || !Number.isInteger(sender.tab?.id)) return {error:'Unsupported scan sender.'};
      const job=await read();
      const ownTab=job && sender.tab.id===job.tabId;
      const ownSource=job && sourceOwns(job,sender);
      if (message.type==='visible-scan-context') {
        return ownTab ? {scan:true,jobId:job.id,url:job.url,progress:job.progress,status:job.status,detail:job.detail} : {scan:false};
      }
      if (message.type==='visible-scan-cancel') {
        if (ownSource) await finish(job,{cancelled:true,error:'Scan stopped. You can close this tab.'});
        return {cancelled:true};
      }
      if (message.type==='visible-scan-finish') {
        // Only close after the whole queue completes, and only if the tab still
        // shows the last listing we put there. Stop deliberately leaves it open.
        const owner=await get(tabKey(sender.tab.id));
        if (!owner || !sourceOwns(owner,sender) || (job && job.sourceTab===sender.tab.id)) return {closed:false};
        let tab;try{tab=await chrome.tabs.get(owner.tabId);}catch{}
        await forget(owner);
        if (tab && unchanged(tab,owner)) {
          await chrome.tabs.remove(owner.tabId).catch(() => {});
          if (tab.active) await chrome.tabs.update(owner.sourceTab,{active:true}).catch(() => {});
          return {closed:true};
        }
        return {closed:false};
      }
      if (message.type==='visible-scan-poll') {
        if (ownSource && job.id===message.jobId) {
          job.lastPoll=Date.now();await write(job);
          return {pending:true,jobId:job.id,status:job.status,detail:job.detail};
        }
        const saved=await get(resultKey(sender.tab.id));
        if (saved?.id===message.jobId && (!saved.sourceDocument || saved.sourceDocument===sender.documentId)) return saved.result;
        return {cancelled:true,error:'The visible scan is no longer available. Click Scan to resume.'};
      }
      if (message.type==='visible-scan-action' && message.action==='stop') {
        // Escape remains effective in the small gap between two listing jobs.
        const owner=await get(ownerKey(sender.tab.id));
        if (!owner) return {error:'This tab does not own a scan.'};
        const current=ownTab ? job : null;
        notifyStop(owner,current?.id || owner.lastJobId);
        if (current) return finish(current,{cancelled:true,error:'Scan stopped. You can close this tab.'});
        return {cancelled:true};
      }
      if (!ownTab || job.id!==message.jobId) return {error:'This tab does not own that scan.'};
      if (Date.now()-job.lastPoll>120000) {
        return finish(job,{cancelled:true,error:'The search page stopped responding. Scan paused; this tab was left open.'});
      }
      if (message.type==='visible-scan-report') {
        if(message.status==='missing') {
          const tab=await chrome.tabs.get(job.tabId);
          if(!sameItem(sender.url,job.url)||!unchanged(tab,job)) return {paused:true,error:'Scan tab no longer shows the expected listing.'};
          return finish(job,await EbayListingCache.markMissing(job.url),true);
        }
        if (message.status==='ready') {
          const tab=await chrome.tabs.get(job.tabId);
          if (!sameItem(sender.url,job.url) || !unchanged(tab,job)) {
            return finish(job,{cancelled:true,error:'Scan tab navigated away. Click Scan to resume.'});
          }
          const rows=message.rows;
          if (!Array.isArray(rows) || !rows.length || rows.some(row=>!row || (!row.inStock && !row.outOfStock))) {
            job.status='paused';job.detail='Listing data could not be verified. Retry, Skip or Stop.';await write(job);
            return {status:job.status,detail:job.detail};
          }
          return finish(job,await EbayListingCache.put(job.url,rows),true);
        }
        job.status=message.status==='paused'?'paused':'loading';
        job.detail=String(message.detail || 'Waiting for listing data…').slice(0,600);
        await write(job);return {status:job.status,detail:job.detail};
      }
      if (message.type==='visible-scan-action') {
        if (message.action==='skip') return finish(job,{skipped:true,error:'Skipped by user.'},true);
        if (message.action==='retry') {
          job.status='loading';job.detail='Retrying this listing…';await write(job);return {status:job.status,detail:job.detail};
        }
      }
      return {error:'Unsupported scan action.'};
    });
  }
  function removed(id) {
    return serial(async () => {
      const job=await read();
      if (job && (job.tabId===id || job.sourceTab===id)) await finish(job,{cancelled:true,error:
        job.tabId===id?'Scan tab closed. Click Scan to resume.':'Search tab closed. Scan stopped; this tab was left open.'});
      await forget(await get(ownerKey(id)));
      await forget(await get(tabKey(id)));
      await chrome.storage.session.remove(resultKey(id));
    });
  }
  function updated(id,change) {
    if (!change.url) return Promise.resolve();
    return serial(async () => {
      const job=await read();
      if (!job) return;
      if (id===job.sourceTab) {
        const url=new URL(change.url);
        if (url.origin!==new URL(job.url).origin || !url.pathname.startsWith('/sch/')) {
          await finish(job,{cancelled:true,error:'Search tab navigated away. Scan stopped.'});
        }
      } else if (id===job.tabId && !sameItem(change.url,job.url)) {
        const url=new URL(change.url);
        if (/(^|\.)ebay\.(co\.uk|com)$/.test(url.hostname) && !url.pathname.startsWith('/itm/')) {
          job.status='paused';job.detail='eBay requires attention. Check this tab, then Retry.';await write(job);
        } else {
          await finish(job,{cancelled:true,error:'Scan tab navigated away. Scan stopped; the tab was left open.'});
          await forget(await get(ownerKey(id)));
        }
      }
    });
  }
  return {start,handle,removed,updated};
})();
