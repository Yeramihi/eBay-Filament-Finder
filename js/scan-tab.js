(async () => {
  'use strict';
  let context;
  try { context=await chrome.runtime.sendMessage({type:'visible-scan-context'}); } catch { return; }
  if (!context?.scan) return;
  const host=document.createElement('div');host.id='ebay-finder-scan-tab';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
    :host{all:initial;position:fixed;left:12px;right:12px;top:12px;z-index:2147483647;font:14px/1.4 system-ui;color:#17365d}
    section{display:flex;align-items:center;flex-wrap:wrap;gap:10px;padding:14px 18px;background:#f4f7fb;border:2px solid #17365d;border-radius:10px;box-shadow:0 4px 20px #0003}
    p{flex:1;min-width:220px;margin:0}strong{display:block}.escape-hint{display:block;margin-top:5px;font-weight:750;color:#17365d}kbd{font:inherit;border:1px solid #aab7c7;border-radius:4px;padding:1px 5px;background:white}button{font:inherit;padding:7px 12px;background:white;color:#17365d;border:1px solid #aab7c7;border-radius:6px;cursor:pointer}button:disabled{opacity:.5;cursor:default}[hidden]{display:none!important}
  </style><section aria-label="Visible listing scan"><p><strong>Filament finder · visible scan</strong><span role="status" aria-live="polite"></span><span class="escape-hint">Press <kbd>Escape (Esc)</kbd> to stop the scan.</span></p><button class="retry" hidden>Retry</button><button class="skip" hidden>Skip</button><button class="stop">Stop</button></section>`;
  if (context.progress) root.querySelector('strong').textContent = `Filament finder · listing ${context.progress.current} of ${context.progress.total}`;
  if(document.documentElement)document.documentElement.append(host);
  else document.addEventListener('DOMContentLoaded',()=>document.documentElement.append(host),{once:true});
  const status=root.querySelector('[role=status]'),retry=root.querySelector('.retry'),skip=root.querySelector('.skip'),stop=root.querySelector('.stop');
  let ended=false,waiting=false,busy=false,paused=false,deadline=Date.now()+45000,lastSignature='',stableSince=0,lastReport=0;
  function show(text,attention=false){status.textContent=text;paused=attention;retry.hidden=skip.hidden=!attention;root.querySelector('.escape-hint').hidden=ended;}
  function challenge() {
    const heading=[document.title,...Array.from(document.querySelectorAll('h1'),el=>el.textContent)].join(' ');
    if (/captcha|pardon our interruption|verify (?:that )?you(?:'re| are) (?:a )?human|security (?:check|measure)|access denied/i.test(heading) || /\/(?:splashui\/)?(?:captcha|challenge)(?:\/|$)/i.test(location.pathname)) return true;
    return [...document.querySelectorAll('iframe[src*="captcha"], form[action*="captcha"]')].some(el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden');
  }
  function expectedItem() {
    const url=new URL(context.url);
    return location.origin===url.origin && location.pathname.match(/^\/itm\/(?:[^/]+\/)?(\d+)(?:\/|$)/)?.[1]===url.pathname.split('/').pop();
  }
  async function report(message) {
    return chrome.runtime.sendMessage({type:'visible-scan-report',jobId:context.jobId,...message});
  }
  async function pause(text) {
    show(text,true);await report({status:'paused',detail:text});lastReport=Date.now();
  }
  async function attempt() {
    if (ended || waiting || busy || stopping) return;
    busy=true;
    try {
      if (paused) {
        // Keep the worker/job alive while a person handles a challenge. No
        // requests to eBay and no automatic challenge retries are made here.
        if(Date.now()-lastReport>15000){await report({status:'paused',detail:status.textContent});lastReport=Date.now();}
        return;
      }
      if (challenge()) {await pause('eBay requires verification. Complete the check on this page, then click Retry.');return;}
      if (!expectedItem()) {await pause('eBay opened another page, possibly sign-in. Complete it, then click Retry on the listing.');return;}
      let rows;
      try {rows=globalThis.EbayListingData?.();} catch {rows=null;}
      const valid=Array.isArray(rows)&&rows.length&&rows.every(row=>row.inStock||row.outOfStock);
      if (valid && document.readyState==='complete') {
        const signature=JSON.stringify(rows);
        if(signature!==lastSignature){lastSignature=signature;stableSince=Date.now();}
        if(Date.now()-stableSince>=1500){
          show(`Saving ${rows.length} variants…`);
          const response=await report({status:'ready',rows});
          if(response?.rows && !ended){waiting=true;clearInterval(timer);show('Listing scanned. Waiting for the next listing…');}
          else if(response?.status==='paused')show(response.detail,true);
          else if(response?.cancelled){ended=true;show(response.error);clearInterval(timer);}
          return;
        }
      } else {lastSignature='';stableSince=0;}
      if(Date.now()>deadline){await pause('Listing data could not be verified. Retry to reload this listing, Skip it, or Stop the scan.');return;}
      show('Loading this listing and waiting for its data…');
    } catch {show('The extension connection was interrupted. Stop the scan and refresh the search page.',true);}
    finally {busy=false;}
  }
  retry.addEventListener('click',async()=>{
    if(ended||busy)return;
    retry.disabled=true;
    try {
      const response=await chrome.runtime.sendMessage({type:'visible-scan-action',jobId:context.jobId,action:'retry'});
      if(response?.error){show(response.error,true);return;}
      if(challenge()){await pause('Complete eBay’s verification first, then click Retry.');return;}
      let rows;try{rows=globalThis.EbayListingData?.();}catch{}
      const verified=Array.isArray(rows)&&rows.length&&rows.every(row=>row.inStock||row.outOfStock);
      if(expectedItem() && !verified){location.reload();return;}
      deadline=Date.now()+45000;lastSignature='';stableSince=0;show('Retrying this listing…');await attempt();
    }catch{show('Could not retry. Return to the search page and click Scan.',true);}
    finally{retry.disabled=false;}
  });
  let stopping = false;
  async function action(value){
    if(ended || stopping)return;
    stopping = true;
    try{await chrome.runtime.sendMessage({type:'visible-scan-action',jobId:context.jobId,action:value});}
    catch{stopping=false;show('Could not contact the extension. Return to the search page to stop the scan.',true);return;}
    ended=true;clearInterval(timer);show(value==='stop'?'Scan stopped. You can close this tab.':'Listing skipped.');retry.hidden=skip.hidden=true;stop.disabled=true;
  }
  window.addEventListener('keydown',event=>{
    if(event.key !== 'Escape' || event.isComposing || ended)return;
    event.preventDefault();event.stopImmediatePropagation();action('stop');
  },true);
  skip.addEventListener('click',()=>action('skip'));stop.addEventListener('click',()=>action('stop'));
  chrome.runtime.onMessage.addListener((message,sender)=>{
    if(sender.id===chrome.runtime.id&&message.type==='visible-scan-ended'&&message.jobId===context.jobId){
      waiting=message.completed===true;ended=!waiting;clearInterval(timer);show(message.detail);retry.hidden=skip.hidden=true;stop.disabled=ended;
    }
  });
  show(context.detail || 'Loading this listing…',context.status==='paused');
  const timer=setInterval(attempt,750);
  attempt();
})();
