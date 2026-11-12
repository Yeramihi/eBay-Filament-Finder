globalThis.EbayCards = (() => {
  'use strict';
  const css = `
    :host{display:block;height:100%}
    .finder-layout{height:100%;display:flex;flex-direction:column;overflow:hidden}
    .finder-toggle-row{position:relative;z-index:1;flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:8px;padding:6px 9px;background:#eef2f7;border-bottom:1px solid #d7e1ed}
    .finder-button{min-height:32px;padding:4px 10px;border:1px solid #aab7c7;border-radius:6px;background:white;color:#17365d;font:600 12px system-ui;cursor:pointer}
    .finder-toggle::after{content:' ▾'}
    .finder-toggle[aria-expanded="false"]::after{content:' ▸'}
    .finder-toolbar{flex:none;max-height:60dvh;overflow:auto;overscroll-behavior:contain}
    .finder-results{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
    .finder-button:hover:not(:disabled){background:#f1f6fc}
    .finder-button:disabled{opacity:.55;cursor:default}
    .finder-sort-menu{flex:none;padding:0;background:#eef2f7;border-bottom:1px solid #d7e1ed}
    .finder-sort{display:flex;align-items:center;gap:8px;padding:6px 9px;font:600 12px system-ui}
    .finder-sort select{font:12px system-ui;min-height:32px;max-width:100%;padding:5px 7px;border:1px solid #aab7c7;border-radius:5px;background:white;color:#18212f;flex:1;min-width:0}
    .finder-out-of-stock{padding:8px 9px}.finder-out-of-stock summary{cursor:pointer;font-weight:600}
    .finder-entries{display:grid;gap:8px;padding:8px}.finder-entry{display:block;min-width:0;min-height:44px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;color:#18212f!important;background:#fff;text-decoration:none!important;font:13px/1.5 system-ui;overflow-wrap:anywhere}
    a.finder-entry:hover{background:#edf5ff;border-color:#174b83}a.finder-entry:focus-visible{outline:3px solid #2563eb}
    .finder-entry img{width:52px;height:52px;object-fit:contain;float:left;margin:0 10px 6px 0;border-radius:5px}
    .finder-entry .field{display:block}.finder-entry .field:first-of-type{font-weight:650}.finder-entries:not(.lines) .field.sort-active,.finder-entries.lines .line-part.sort-active{background:#e5f0e9;border-radius:4px;padding:3px 6px;margin:3px 0;font-weight:650}.finder-entry .estimate{font-style:italic}.finder-entry.out-of-stock{color:#64748b!important}
    .finder-empty{min-width:0;padding:22px 18px 24px;border:1px solid #cbd8e6;border-radius:12px;background:linear-gradient(150deg,#f3f7fc,#fff 75%);text-align:center;color:#17365d;font:13px/1.5 system-ui;white-space:normal;overflow-wrap:anywhere}
    .finder-empty-art{display:block;width:200px;max-width:100%;height:auto;margin:0 auto 10px}.finder-empty-kicker{display:block;font-size:10px;letter-spacing:.1em;font-weight:700;color:#6a7789}.finder-empty h3{margin:8px 0;font-size:18px;line-height:1.3;color:#17365d}.finder-empty p{max-width:360px;margin:9px auto}.finder-empty .finder-empty-hint{font-size:12px;color:#617086;margin-top:14px}
    .finder-info:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
    .experimental-marker{display:inline-block;color:#75511b;background:#fff4d6;border:1px solid #ddc58e;border-radius:4px;padding:0 5px;font-style:normal}
    .experimental-marker:focus-visible{outline:2px solid #2563eb;outline-offset:2px}
    .finder-tooltip{position:fixed;inset:auto;margin:0;box-sizing:border-box;width:340px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:12px 14px;border:1px solid #aab7c7;border-radius:8px;background:#fff;color:#18212f;box-shadow:0 5px 22px #17365d40;font:12px/1.5 system-ui;white-space:normal;overflow-wrap:anywhere;text-align:left}
    .finder-tooltip strong{display:block;color:#17365d}.finder-tooltip p{margin:7px 0}.finder-tooltip strong:not(:first-child){margin-top:12px;padding-top:9px;border-top:1px solid #d7e1ed}
    .listing-content{display:block;color:inherit!important;text-decoration:none!important}
    .listing-content:focus-visible{outline:3px solid #2563eb}
    .listing-cache-actions{display:flex;flex-wrap:wrap;align-items:center;gap:5px;clear:both;margin-top:6px}
    .finder-hidden{padding:8px 9px}.finder-hidden summary{cursor:pointer;font-weight:600}
    .hidden-help{font:11px/1.4 system-ui;color:#64748b;margin:6px 0}
    .hidden-until{display:block;font:11px/1.4 system-ui;color:#64748b;white-space:normal}
    .hide-duration{font:11px/1.4 system-ui;max-width:85px;padding:2px;border:1px solid #aab7c7;border-radius:4px;background:#fff;color:#17365d}
    .listing-cache-actions[hidden]{display:none!important}
    .listing-cache-actions button{font:11px/1.4 system-ui;padding:2px 6px;border:1px solid #aab7c7;border-radius:4px;background:#f4f7fb;color:#17365d;cursor:pointer}
    .listing-cache-actions button:disabled{opacity:.5;cursor:default}
    .finder-entries.lines .listing-content{display:inline}
    .finder-entries.lines .listing-cache-actions{display:inline-flex;margin:0 0 0 8px;vertical-align:middle}
    .finder-entries.finder-virtual-list{display:block;overflow-anchor:none}
    .finder-virtual-list>.finder-entry{margin:0 0 8px}
    .finder-virtual-spacer{display:block;width:1px;pointer-events:none}
    .photo-info,.finder-photo-fallback{display:none}
    .finder-entries.photos-only,.finder-entries.finder-virtual-list.photos-only{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
    .finder-entries.photos-only>.finder-entry{position:relative;box-sizing:border-box;aspect-ratio:1;padding:4px;min-height:0;overflow:hidden;margin:0}
    .photos-only>.finder-entry .listing-content{display:block;height:100%}
    .photos-only>.finder-entry img{display:block;width:100%;height:100%;object-fit:contain;float:none;margin:0;border-radius:4px}
    .photos-only>.finder-entry .field,.photos-only>.finder-entry .line-label,.photos-only>.finder-entry .listing-cache-actions,.photos-only>.finder-entry .hidden-until{display:none!important}
    .photos-only>.finder-entry>.photo-info{position:absolute;display:inline-flex;align-items:center;justify-content:center;top:5px;right:5px;width:24px;height:24px;padding:0;border:1px solid #355779;border-radius:50%;background:#fffffff2;color:#17365d;font:18px/1 system-ui;cursor:help;box-shadow:0 1px 4px #0002}
    .photos-only>.finder-entry::after{display:none}
    .photos-only>.finder-virtual-spacer{grid-column:1/-1}
    .finder-photo-details{box-sizing:border-box;position:fixed;inset:auto;margin:0;width:380px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);padding:10px;border:1px solid #aab7c7;border-radius:10px;background:white;color:#18212f;box-shadow:0 6px 24px #17365d44;overflow:auto;overscroll-behavior:contain;font:13px/1.5 system-ui}
    .photo-details-close{display:block;margin:0 0 8px auto;padding:4px 9px;border:1px solid #aab7c7;border-radius:5px;background:#f4f7fb;color:#17365d;font:12px system-ui;cursor:pointer}
    .finder-entry::after{content:'';display:block;clear:both}.finder-entries.lines{gap:2px;padding:6px 8px}.finder-entries.lines .finder-entry{min-height:0;padding:3px 0;border:0;border-radius:0;background:transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4}.finder-entries.lines a.finder-entry{color:#174b83!important;text-decoration:underline!important;text-underline-offset:2px}.finder-entries.lines a.finder-entry:hover{background:transparent;color:#0f3158!important}.finder-entry .line-label{display:none}.finder-entries.lines .field{display:none}.finder-entries.lines .line-label{display:inline;font-weight:400}.finder-entries.lines img{display:none}.finder-entries.lines .finder-entry::after{display:none}
  `;
  function emptyState({scanning=false,outOfStock=false}={}) {
    const tile=document.createElement('article');
    tile.className='finder-empty';tile.setAttribute('role','status');
    // Static, local vector artwork stays sharp at every dock width.
    tile.innerHTML=`<svg class="finder-empty-art" viewBox="0 0 240 140" aria-hidden="true" focusable="false">
      <ellipse cx="119" cy="125" rx="89" ry="8" fill="#e4ebf3"/>
      <path d="M132 107c21 0 16 17 37 17s21-17 42-10" fill="none" stroke="#d99a38" stroke-width="4" stroke-linecap="round"/>
      <rect x="66" y="36" width="67" height="75" rx="12" fill="#efbe61"/>
      <path d="M76 44v59m9-61v62m10-62v62m10-62v62m10-62v62m9-60v58" stroke="#d39736" stroke-width="3"/>
      <ellipse cx="65" cy="74" rx="24" ry="45" fill="#d6e3ef" stroke="#355779" stroke-width="3"/>
      <ellipse cx="65" cy="74" rx="12" ry="25" fill="#fff" stroke="#355779" stroke-width="3"/>
      <ellipse cx="133" cy="74" rx="24" ry="45" fill="#e7eff7" stroke="#355779" stroke-width="3"/>
      <circle cx="125" cy="67" r="3" fill="#355779"/><circle cx="140" cy="67" r="3" fill="#355779"/>
      <path d="M125 81q8 7 15 0" fill="none" stroke="#355779" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="177" cy="50" r="23" fill="#fff" fill-opacity=".85" stroke="#355779" stroke-width="5"/>
      <path d="m194 68 22 24" stroke="#355779" stroke-width="9" stroke-linecap="round"/>
      <text x="177" y="58" text-anchor="middle" font-family="system-ui,sans-serif" font-size="23" font-weight="700" fill="#b57822">?</text>
      <path d="m37 26 3-7m-14 16-7-2m183-10 5-5" stroke="#d99a38" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
    const eyebrow=document.createElement('span');eyebrow.className='finder-empty-kicker';
    eyebrow.textContent=scanning?'SPOOL SEARCH IN PROGRESS':'404 · FILAMENT NOT FOUND';
    const heading=document.createElement('h3');heading.textContent=scanning?'Still following the filament…':'Well, this is a spool of nothing.';
    const message=document.createElement('p');message.textContent=scanning?
      'Checking listings for matching variants. Our tiny spool detective is on the case.':
      outOfStock?'No matching variants are in stock. Even our spool detective can’t print more stock.':'No matching in-stock variants found. Our spool detective has drawn a blank.';
    const hint=document.createElement('p');hint.className='finder-empty-hint';hint.textContent=scanning?
      'Matches will appear here as the scan continues.':
      'Try fewer filter words or a different material or colour, then click Apply filters or press Enter.';
    tile.append(eyebrow,heading,message,hint);return tile;
  }
  let tooltipId = 0;
  let activeTooltip;
  function tooltip(target,content) {
    const icon=document.createElement('span');
    icon.className='finder-info';icon.textContent='i';icon.dataset.tooltipToggle='true';
    icon.setAttribute('role','button');icon.setAttribute('aria-label','Show information');
    // Inline styling also covers tooltips outside the results shadow root.
    icon.style.cssText='display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:16px;height:16px;margin-left:5px;border:1px solid currentColor;border-radius:50%;color:#355779;font:600 11px/1 system-ui;font-style:normal;vertical-align:middle;cursor:help;text-decoration:none;flex:none';
    icon.addEventListener('pointerdown',event=>event.stopPropagation());
    target.append(icon);
    bindTooltip(icon,content);
  }
  function bindTooltip(target,content) {
    target.removeAttribute('title');
    if (!target.hasAttribute('tabindex') && !target.matches('button,a,input,select,summary')) target.tabIndex=0;
    let popup, timer;
    function hide() {
      clearTimeout(timer);
      if(popup){popup.remove();popup=null;target.removeAttribute('aria-describedby');}
      if(activeTooltip===hide)activeTooltip=null;
    }
    function show() {
      clearTimeout(timer);
      if(popup)return;
      activeTooltip?.();activeTooltip=hide;
      popup=document.createElement('div');popup.className='finder-tooltip';
      popup.style.cssText='position:fixed;inset:auto;margin:0;box-sizing:border-box;width:340px;max-width:calc(100vw - 16px);max-height:calc(100dvh - 16px);overflow:auto;padding:12px 14px;border:1px solid #aab7c7;border-radius:8px;background:#fff;color:#18212f;box-shadow:0 5px 22px #17365d40;font:12px/1.5 system-ui;white-space:normal;text-align:left';
      popup.id=`finder-tooltip-${++tooltipId}`;popup.setAttribute('role','tooltip');
      popup.setAttribute('popover','manual');
      if(typeof content==='function')content(popup);
      else {
        String(content).split(/\n|(?<=\.)\s+(?=[A-Z])/).filter(Boolean).forEach((line,index)=>{
          const paragraph=document.createElement(index===0?'strong':'p');
          // Break long explanations into readable sentences, without interpreting seller HTML.
          paragraph.textContent=line;popup.append(paragraph);
        });
      }
      target.getRootNode().append(popup);popup.showPopover();
      target.setAttribute('aria-describedby',popup.id);
      const rect=target.getBoundingClientRect();
      const width=popup.getBoundingClientRect().width;
      popup.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-width-8))}px`;
      const height=popup.getBoundingClientRect().height;
      popup.style.top=`${Math.max(8,Math.min(rect.bottom+6,innerHeight-height-8))}px`;
      popup.addEventListener('pointerenter',()=>clearTimeout(timer));
      popup.addEventListener('pointerleave',()=>{timer=setTimeout(hide,150);});
    }
    target.addEventListener('pointerenter',show);
    target.addEventListener('pointerleave',()=>{timer=setTimeout(hide,150);});
    target.addEventListener('focus',show);
    target.addEventListener('blur',hide);
    target.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hide();}
      if(target.dataset.tooltipToggle && ['Enter',' '].includes(event.key)){
        event.preventDefault();event.stopPropagation();popup?hide():show();
      }
    });
    if(target.dataset.tooltipToggle)target.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();show();
    });
  }
  let activePhotoPanel;
  const photoAverages=new WeakMap(),photoHidden=new WeakMap();
  function closePhotoPanel() {activePhotoPanel?.close();}
  function photoCard(card,row,format,options) {
    if(options.photoDetail) return card;
    if(card.tagName==='A') {
      const wrapper=document.createElement('article');wrapper.className=card.className;
      card.className='listing-content';wrapper.append(card);card=wrapper;
    }
    const link=card.querySelector('.listing-content');
    if(link) link.setAttribute('aria-label',`Open ${row.title||'listing'}: ${row.label||''}`);
    if(!card.querySelector('img')) {
      const fallback=document.createElement('img');fallback.className='finder-photo-fallback';fallback.src=chrome.runtime.getURL('images/icons/icon-48.png');fallback.alt='';card.prepend(fallback);
    }
    const info=document.createElement('button');info.type='button';info.className='photo-info';info.textContent='ⓘ';
    info.setAttribute('aria-label',`Show details: ${row.label||row.title||'listing'}`);info.setAttribute('aria-haspopup','dialog');info.setAttribute('aria-expanded','false');
    let returningFocus=false;
    function show() {
      if(activePhotoPanel?.target===card) return;
      closePhotoPanel();activeTooltip?.();
      const root=card.getRootNode(),popup=document.createElement('div');popup.className='finder-photo-details';popup.setAttribute('popover','manual');popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Listing details and price calculations');
      const close=document.createElement('button');close.type='button';close.className='photo-details-close';close.textContent='Close';
      const details=entry(row,format,{...options,photoDetail:true});
      const average=photoAverages.get(card);if(average) updateAverage(details,average.average,average.format,average.sortKey);
      updateHidden(details,photoHidden.get(card)||0);
      const sourceButtons=card.querySelectorAll('.listing-cache-actions button'),detailButtons=details.querySelectorAll('.listing-cache-actions button');
      detailButtons.forEach((button,index)=>{button.disabled=sourceButtons[index]?.disabled||false;});
      popup.append(close,details);root.append(popup);popup.showPopover();info.setAttribute('aria-expanded','true');
      const rect=info.getBoundingClientRect(),bounds=popup.getBoundingClientRect();
      popup.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-bounds.width-8))}px`;
      popup.style.top=`${Math.max(8,Math.min(rect.bottom+6,innerHeight-bounds.height-8))}px`;
      function hide() {
        activeTooltip?.();popup.remove();info.setAttribute('aria-expanded','false');
        root.removeEventListener('pointerdown',outside,true);root.removeEventListener('keydown',escape);window.removeEventListener('resize',hide);
        if(activePhotoPanel?.target===card) activePhotoPanel=undefined;
      }
      function outside(event) {
        const path=event.composedPath();
        if(!path.includes(info)&&!path.includes(popup)&&!path.some(node=>node.classList?.contains('finder-tooltip'))) hide();
      }
      function escape(event) {if(event.key==='Escape'&&!event.defaultPrevented) {event.preventDefault();event.stopPropagation();hide();returningFocus=true;info.focus();returningFocus=false;}}
      close.addEventListener('click',()=>{hide();returningFocus=true;info.focus();returningFocus=false;});root.addEventListener('pointerdown',outside,true);root.addEventListener('keydown',escape);window.addEventListener('resize',hide);
      activePhotoPanel={target:card,popup,close:hide};
    }
    info.addEventListener('pointerenter',show);info.addEventListener('focus',()=>{if(!returningFocus)show();});
    info.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();show();activePhotoPanel?.popup.querySelector('.photo-details-close')?.focus();});
    card.append(info);return card;
  }
  globalThis.EbayRuntime?.onDispose?.(closePhotoPanel);
  const averageStates = new WeakMap();
  function updateAverage(item,average,format,sortKey) {
    photoAverages.set(item,{average,format,sortKey});
    const signature = JSON.stringify(average ?? null);
    if (averageStates.get(item) === signature) return;
    averageStates.set(item,signature);
    item.querySelector('.average-price')?.remove();
    item.querySelector('.average-compact')?.remove();
    if(!average)return;
    const field=document.createElement('span');field.className='field average-price';field.dataset.sortField='average';field.classList.toggle('sort-active',sortKey==='average');
    const money=amount=>format({amount,currency:average.currency,approximate:average.approximate});
    const priceText = `${money(average.amount)}${average.offer ? `/item (${average.offer.quantity}-item offer)` : ''}${average.shippingUnknown||average.offer?.shippingUnknown ? ' ⚠' : ''}`;
    field.append(document.createTextNode(`Mixed bulk average: ${priceText} `));

    const marker=document.createElement('span');marker.className='experimental-marker';
    marker.textContent='⚗';marker.setAttribute('aria-hidden','true');
    field.append(marker);
    const details=popup=>{
      const add=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;popup.append(node);};
      add('strong','Mixed bulk average · Experimental');
      add('p',`${average.count} matching, in-stock variant${average.count===1?'':'s'}.`);
      add('p','Each matching variant counts once; stock quantities are ignored.');
      if(average.offer){
        const offer=average.offer;
        add('strong',`With the ${offer.quantity}-item offer`);
        add('p',`Average: ${money(offer.average)}/item`);
        add('p',`Cheapest selection: ${money(offer.cheapest.total)} total · ${money(offer.cheapest.unit)}/item`);
        add('p',`Most expensive selection: ${money(offer.expensive.total)} total · ${money(offer.expensive.unit)}/item`);
        add('p',`Each extreme assumes ${offer.quantity} of the same matching variant.${offer.identical?' Offer requires identical items; variants cannot be mixed.':''}`);
        if(offer.code)add('p',`Requires code ${offer.code}.${offer.maxSaving!==undefined ? ` Maximum saving: ${money(offer.maxSaving)} per order.` : ''}`);
        if(offer.conditional)add('p','Conditional estimate for equally priced eligible items. Check which variants qualify and whether offers and codes combine.');
        if(offer.termsUrl)add('p',`Offer terms: ${offer.termsUrl}`);
        if(offer.coupon)add('p',`Includes recognised ${EbayVariants.couponLabel(offer.coupon)} coupon${offer.coupon.code ? ` (code ${offer.coupon.code})` : ''}; ${Number.isFinite(offer.coupon.amount) ? 'the fixed voucher applies once per order. ' : ''}Check eligibility, limits and whether offers combine.`);
        add('p',offer.shippingUnknown?'Postage is unknown for some variants and is excluded where unknown.':'Recognised postage is added once per selection; actual delivery charges may differ.');
      }else {
        add('p','Mean of each matching variant’s calculated bulk-purchase price, including recognised discounts, coupons, saving caps and known postage.');
        add('p','Each variant counts once. If quantities or offers differ, each estimate uses its own purchase requirement; this is not a quote for one combined basket.');
        for(const coupon of average.coupons || []) add('p',`Includes ${coupon.source==='subtitle'?'advertised':'recognised'} coupon ${EbayVariants.couponLabel(coupon)}${coupon.code?` (code ${coupon.code})`:''}. Any saving cap is applied once to the order used for each variant’s estimate. Check eligibility and whether offers combine.`);
        add('p',average.shippingUnknown ? 'Unknown postage is excluded where unavailable.' : 'Known postage is included in each variant’s purchase estimate.');
      }
      add('p',`Before offers: ${money(average.baseAmount)}/item, excluding coupons and postage.`);
    };
    tooltip(field,details);
    const total=item.querySelector('[data-sort-field="total"]');
    if(total)total.after(field);else item.append(field);
    const compact=item.querySelector('.line-label');
    if(compact){const part=document.createElement('span');part.className='line-part average-compact';part.dataset.sortField='average';part.classList.toggle('sort-active',sortKey==='average');part.textContent=` → Mixed bulk average: ${priceText} ⚗`;compact.append(part);tooltip(part,details); }
  }
  function controls(root,keys,onSort,onFiltersToggle) {
    const style = document.createElement('style'); style.textContent=css; root.append(style);
    const toolbar = root.querySelector('.finder-toolbar');
    const toggleRow = document.createElement('div');
    toggleRow.className = 'finder-toggle-row';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'finder-toggle finder-button';
    toggle.textContent = 'Filters';
    toggle.setAttribute('aria-controls', toolbar.id);
    toggle.setAttribute('aria-expanded', String(!toolbar.hidden));
    toggle.addEventListener('click', () => {
      setFiltersExpanded(root, toolbar.hidden);
      onFiltersToggle?.();
    });
    const settings = document.createElement('button');
    settings.type = 'button';
    settings.className = 'finder-settings finder-button';
    settings.textContent = 'Settings';
    settings.addEventListener('click', event => {
      const rect = settings.getBoundingClientRect();
      const x = event.detail ? event.clientX : rect.left + rect.width / 2;
      const y = event.detail ? event.clientY : rect.bottom;
      EbaySettings.open(x, y);
    });
    const guide = document.createElement('button');
    guide.type = 'button';
    guide.className = 'finder-guide finder-button';
    guide.textContent = 'User guide';
    guide.addEventListener('click', () => {
      EbayRuntime.sendMessage({type:'open-finder-guide'}).catch(EbayRuntime.report);
    });
    toggleRow.append(settings, guide, toggle);
    toolbar.before(toggleRow);

    const entries = root.querySelector('.finder-entries');
    const unavailable = document.createElement('details');
    unavailable.className = 'finder-out-of-stock';
    unavailable.hidden = true;
    const summary = document.createElement('summary');
    summary.textContent = 'Out of stock variants';
    const unavailableEntries = document.createElement('div');
    unavailableEntries.className = 'finder-entries';
    unavailable.append(summary, unavailableEntries);
    root.querySelector('.finder-results').append(unavailable);

    function showDisplay(value) {
      for (const list of [entries, unavailableEntries,...root.querySelectorAll('.finder-hidden .finder-entries')]) {
        list.classList.toggle('lines', value === 'lines');
        list.classList.toggle('photos-only',value==='photos');
      }
    }
    const displayKey = `finder:${globalThis.location?.pathname.startsWith('/itm/') ? 'listing' : 'results'}:display`;
    let displayChanged = false;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[displayKey]) {
        displayChanged = true;
        showDisplay(changes[displayKey].newValue);
      }
    });
    EbayRuntime.local.get([displayKey,'finder:display']).then(saved => {
      if (!displayChanged) showDisplay(saved[displayKey] ?? saved['finder:display']);
    }).catch(EbayRuntime.report);
    const sortMenu = document.createElement('div');
    sortMenu.className = 'finder-sort-menu';
    const label = document.createElement('label');
    label.className = 'finder-sort';label.textContent='Sort by';
    const sort=document.createElement('select');sort.setAttribute('aria-label','Sort by');
    for(const [key,text] of keys) {
      const alphabetic=key==='title'||key==='label';
      sort.append(new Option(`${text} — ${alphabetic?'A–Z':'Low–High'}`,`${key}:true`));
      sort.append(new Option(`${text} — ${alphabetic?'Z–A':'High–Low'}`,`${key}:false`));
    }
    label.append(sort);sortMenu.append(label);toggleRow.after(sortMenu);
    sort.addEventListener('change',()=>{
      const [key,direction]=sort.value.split(':');onSort(key,direction==='true');
    });
    return (key,ascending)=>{
      sort.value=`${key}:${ascending}`;
      for(const field of root.querySelectorAll('.finder-entry [data-sort-field]'))field.classList.toggle('sort-active',field.dataset.sortField===key || field.dataset.sortAlias===key);
    };
  }
  function entry(row,format,{search=false,url,select,clearCache,refresh,hideListing,photoDetail=false}={}){
    const options={search,url,select,clearCache,refresh,hideListing,photoDetail};
    if(row.hiddenPreview && hideListing) {
      const item=document.createElement('article');item.className='finder-entry';
      const link=document.createElement('a');link.className='listing-content';link.href=row.url;
      link.target='_blank';link.rel='noopener noreferrer';link.textContent=row.title;
      const actions=document.createElement('span');actions.className='listing-cache-actions';
      const button=document.createElement('button');button.type='button';button.dataset.action='visibility';button.dataset.listingTitle=row.title;
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();hideListing(0);});
      actions.append(button);
      const note=document.createElement('small');note.className='hidden-until';
      item.append(link,actions,note);
      return photoCard(item,row,format,options);
    }
    const clickable=search || (!row.singleItem&&!row.outOfStock);
    const item=document.createElement(clickable?'a':'article');item.className='finder-entry';
    if(row.outOfStock)item.classList.add('out-of-stock');
    if(clickable){const target=new URL(row.url||url);if(!row.singleItem)target.searchParams.set('var',row.id);item.href=target.href;
      if(search){item.target='_blank';item.rel='noopener noreferrer';}
      else item.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();select(row,target);});}
    const image=row.image;
    if(image){try{const source=new URL(image,location.href);if(source.protocol==='https:'){const img=document.createElement('img');img.src=source.href;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.addEventListener('error',()=>img.remove(),{once:true});item.append(img);}}catch{}}
    else {const icon=document.createElement('img');icon.src=chrome.runtime.getURL('images/icons/icon-48.png');icon.alt='';item.append(icon);}
    const fields=[];
    function field(label,value,tooltip,estimate=false){if(!value)return;const span=document.createElement('span');span.className='field'+(estimate?' estimate':'');span.dataset.sortField=({'Listing':'title','Variant':'label','Individual purchase':'total','Bulk purchase*':'spool'})[label]||'';if(row.singleItem&&label==='Listing')span.dataset.sortAlias='label';span.textContent=`${label}: ${value}`;fields.push(span.textContent+(tooltip&&tooltip!==span.textContent?`\n${tooltip}`:''));if(tooltip)EbayCards.tooltip(span,tooltip);item.append(span);}
    if(search||row.singleItem)field('Listing',row.title||row.label);
    if(!row.singleItem)field('Variant',row.label);
    field('Individual purchase',EbayVariants.displayTotal(row,format),EbayVariants.priceTooltip(row));
    const coupon=EbayVariants.totalEstimate(row).coupon;if(coupon)field(coupon.source==='subtitle' ? 'Advertised coupon' : 'Coupon',`−${EbayVariants.couponLabel(coupon)}`,EbayVariants.priceTooltip(row));
    field('Bulk purchase*',EbayVariants.displaySpool(row,format),EbayVariants.spoolTooltip(row,EbayVariants.spoolEstimate(row)),true);
    field('Offer',EbayVariants.spoolLabel(row),EbayVariants.spoolTooltip(row,EbayVariants.spoolEstimate(row)));
    if(row.cached && Number.isFinite(row.fetchedAt)) {
      const age=Math.max(0,Date.now()-row.fetchedAt);
      const ageText=age<60000?'less than a minute ago':age<3600000?`${Math.floor(age/60000)} min ago`:age<86400000?`${Math.floor(age/3600000)} hours ago`:`${Math.floor(age/86400000)} days ago`;
      field('Cached',`${ageText} · ${new Date(row.fetchedAt).toLocaleString()}`,'Saved data, not retrieved live. Prices and stock may have changed. Open this listing to refresh its saved data.');
    }
    field('Stock',row.outOfStock?'Out of stock':row.inStock?'In stock':'Unknown');
    if(!search&&!row.singleItem&&row.title)fields.unshift(`Listing: ${row.title}`);

    const compact=document.createElement('span');compact.className='line-label';
    for(const [key,text] of [
      ['label',(row.cached?'[Cached] ':'')+(row.label||row.title||'Listing')],
      ['total',EbayVariants.displayTotal(row,format)],
      ['spool',EbayVariants.displaySpool(row,format)]
    ]){
      if(compact.childNodes.length)compact.append(document.createTextNode(' → '));
      const part=document.createElement('span');part.className='line-part';part.dataset.sortField=key;
      part.textContent=text;compact.append(part);
    }
    tooltip(compact,fields.join('\n'));
    item.append(compact);
    if(search && (clearCache || refresh || hideListing)) {
      // Keep buttons outside the listing link for valid keyboard and click behavior.
      const wrapper=document.createElement('article');wrapper.className=item.className;
      item.className='listing-content';
      const actions=document.createElement('span');actions.className='listing-cache-actions';
      for(const [label,handler,description] of [
        ['Clear cache',clearCache,'Remove all saved variants of this listing.'],
        ['Refresh',refresh,'Retrieve this entire listing again, ignoring its saved age.']
      ]) {
        if(!handler) continue;
        const button=document.createElement('button');button.type='button';button.textContent=label;
        button.setAttribute('aria-label',`${label}: ${row.title||'listing'}`);
        tooltip(button,description);
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();handler();});
        actions.append(button);
      }
      if(hideListing) {
        const duration=document.createElement('select');duration.className='hide-duration';
        duration.setAttribute('aria-label',`Hide duration: ${row.title||'listing'}`);
        for(const [days,label] of [[1,'1 day'],[7,'1 week'],[30,'1 month']]) duration.append(new Option(label,String(days)));
        duration.value='30';
        const button=document.createElement('button');button.type='button';button.dataset.action='visibility';
        button.dataset.listingTitle=row.title||'listing';
        button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();hideListing(Number(duration.value));});
        actions.append(button,duration);
      }
      const until=document.createElement('small');until.className='hidden-until';until.hidden=true;
      wrapper.append(item,actions,until);
      return photoCard(wrapper,row,format,options);
    }
    return photoCard(item,row,format,options);
  }
  function updateHidden(entry,expiresAt) {
    photoHidden.set(entry,expiresAt);
    const button=entry.querySelector('[data-action="visibility"]');
    if(!button) return;
    const label=expiresAt ? 'Unhide' : 'Hide from results';
    button.textContent=label;button.setAttribute('aria-label',`${label}: ${button.dataset.listingTitle}`);
    button.title=expiresAt ? 'Restore all variants of this listing to results.' : 'Hide every variant of this listing for the selected duration (1 month = 30 days).';
    const duration=entry.querySelector('.hide-duration');
    if(duration) duration.hidden=!!expiresAt;
    const note=entry.querySelector('.hidden-until');
    if(note) {note.hidden=!expiresAt;note.textContent=expiresAt ? `Hidden until ${new Date(expiresAt).toLocaleString()}` : '';}
  }
  function showEntries(root, entries, outOfStock, hiddenEntries=[]) {
    activeTooltip?.();closePhotoPanel();

    root.querySelector('.finder-entries').replaceChildren(...entries);
    const hidden=root.querySelector('.finder-hidden');
    if(hidden) {
      hidden.hidden=hiddenEntries.length===0;
      hidden.querySelector('summary').textContent=`Hidden (${hiddenEntries.length} listings)`;
      hidden.querySelector('.finder-entries').replaceChildren(...hiddenEntries);
    }
    const section = root.querySelector('.finder-out-of-stock');
    section.hidden = outOfStock.length === 0;
    section.querySelector('summary').textContent = `Out of stock variants (${outOfStock.length})`;
    section.querySelector('.finder-entries').replaceChildren(...outOfStock);
  }

  function setFiltersExpanded(root, expanded) {
    root.querySelector('.finder-toolbar').hidden = !expanded;
    root.querySelector('.finder-toggle').setAttribute('aria-expanded', String(expanded));
  }

  return {closeTooltip:()=>{activeTooltip?.();closePhotoPanel();},emptyState, controls, entry, updateHidden, showEntries, setFiltersExpanded, tooltip, updateAverage};
})();
