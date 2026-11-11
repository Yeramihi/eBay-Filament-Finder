globalThis.EbayVariants = (() => {
"use strict";
  // Extract a JSON object without executing the surrounding JavaScript.
  function extractObject(text, key) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*\\{`, "g");
    let match;

    while ((match = pattern.exec(text))) {
      const start = pattern.lastIndex - 1;
      let depth = 0;
      let inString = false;
      let escaped = false;

      for (let i = start; i < text.length; i++) {
        const char = text[i];

        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }

        if (char === '"') inString = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          try {
            return JSON.parse(text.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }

    return null;
  }

  function originalItemPrice(model, localCurrency) {
    const candidates = new Map();
    function add(amount,currency) {
      if (typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 &&
          /^[A-Z]{3}$/.test(currency || '') && currency !== localCurrency) {
        candidates.set(`${currency}:${amount}`,{amount,currency});
      }
    }
    function visit(value) {
      if (typeof value === 'string') {
        for (const match of value.matchAll(/(GBP|EUR|USD|£|€|US\s*\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/g)) {
          const currency = /GBP|£/.test(match[1]) ? 'GBP' : /EUR|€/.test(match[1]) ? 'EUR' : 'USD';
          add(Number(match[2].replace(/,/g,'')),currency);
        }
      } else if (value && typeof value === 'object') {
        add(value.value,value.currency);
        for (const child of Object.values(value)) visit(child);
      }
    }
    // Scope strictly to this variant's price model. Do not use the currently
    // selected listing price or derive an exchange rate from rounded postage.
    visit(model);
    return candidates.size === 1 ? [...candidates.values()][0] : null;
  }

  function getRows(scripts) {
    for (const text of scripts) {
      if (!text.includes('"variationsMap"')) continue;

      const variations = extractObject(text, "variationsMap");
      const combinations = extractObject(text, "variationCombinations");
      const options = extractObject(text, "menuItemMap");

      if (!variations || !combinations || !options) continue;

      // eBay maps option IDs such as colour to positions in the listing gallery.
      const pictureIndexes = extractObject(text, 'menuItemPictureIndexMap');
      const pictures = pictureIndexes && extractObject(text, 'PICTURE')?.mediaList;
      const rows = [];
      const seen = new Set();

      for (const [combination, variationId] of Object.entries(combinations)) {
        const id = String(variationId);
        if (seen.has(id)) continue;
        seen.add(id);

        const optionIds = combination.split("_");
        const labels = optionIds.map(optionId => {
          const option = options[optionId];
          return option?.valueName ?? option?.displayName ?? optionId;
        });

        const price = variations[id]?.binModel?.price?.value;
        const amount = price?.value;
        const originalPrice = originalItemPrice(variations[id]?.binModel?.price,price?.currency);
        let image = variations[id]?.image?.url || variations[id]?.imageUrl;
        if (!image && Array.isArray(pictures)) {
          for (const optionId of optionIds) {
            const index = pictureIndexes[optionId]?.[0];
            if (!Number.isInteger(index) || index < 0) continue;
            const picture = pictures[index]?.image;
            image = picture?.thumbnail?.URL || picture?.originalImg?.URL;
            if (image) break;
          }
        }

        rows.push({
          id,
          image,
          inStock: variations[id]?.quantity?.outOfStock === false,
          outOfStock: variations[id]?.quantity?.outOfStock === true,
          values: labels.map(label => String(label).replace(/[\u200B-\u200D\uFEFF]/g, "").trim()),
          label: labels
            .map(label => String(label).replace(/[\u200B-\u200D\uFEFF]/g, "").trim())
            .join(" - "),
          amount: typeof amount === "number" && Number.isFinite(amount)
            ? amount
            : null,
          currency: price?.currency || "",
          originalPrice, approximate:!!originalPrice
        });
      }

      if (rows.length) return rows;
    }

    return [];
  }

  function getSingleItemRows(html, listingUrl) {
    // Inspect markup separately: selectors/templates inside scripts aren't dropdowns.
    const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    if (/"(?:variationCombinations|variationsMap)"\s*:\s*\{\s*"/.test(html) ||
        /class\s*=\s*(?:["'][^"']*\bx-sku\b|[^\s>]*\bx-sku\b)/i.test(markup) ||
        /<select\b[^>]*(?:msku|variation)/i.test(markup)) return [];
    const expectedId = new URL(listingUrl).pathname.match(/\/itm\/(\d+)/)?.[1];
    if (!expectedId) return [];
    const products = [];
    function visit(value) {
      if (Array.isArray(value)) { value.forEach(visit); return; }
      if (!value || typeof value !== 'object') return;
      const types = [].concat(value['@type'] || []);
      if (types.some(type => /(?:^|[/#])Product$/.test(type))) products.push(value);
      if (value['@graph']) visit(value['@graph']);
    }
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (!/\btype\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json(?=\s|$))/i.test(match[1])) continue;
      try { visit(JSON.parse(match[2])); } catch { /* Invalid metadata is unverified. */ }
    }
    const identifiesListing = value => {
      try {
        const url = new URL(value, listingUrl);
        return /(?:^|\.)ebay\.(?:co\.uk|com)$/.test(url.hostname) &&
          url.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/)?.[1] === expectedId;
      } catch { return false; }
    };
    // Only use structured Product metadata tied to this exact listing.
    for (const product of products) {
      const offers = [].concat(product.offers || []);
      const identity = [product.url, product['@id'], ...offers.map(offer => offer?.url)];
      if (!identity.some(value => value && identifiesListing(value))) continue;
      if (typeof product.name !== 'string' || !product.name.trim()) continue;
      const validOffers = offers.filter(offer => offer &&
        !offer.offers && offer.lowPrice === undefined && offer.highPrice === undefined &&
        (!offer.url || identifiesListing(offer.url)));
      // Multiple offers can represent variants; do not guess a single price.
      if (validOffers.length !== 1 || offers.length !== 1) continue;
      const offer = validOffers[0];
      const amount = typeof offer.price === 'number' || typeof offer.price === 'string'
        ? Number(offer.price) : NaN;
      const stock = String(offer.availability || '').split(/[/#]/).pop();
      if (!Number.isFinite(amount) || amount < 0 ||
          !/^[A-Z]{3}$/.test(offer.priceCurrency || '') ||
          !['InStock', 'LimitedAvailability', 'OutOfStock', 'SoldOut', 'Discontinued'].includes(stock)) continue;
      const inStock = ['InStock', 'LimitedAvailability'].includes(stock);
      return [{ id: null, singleItem: true, label: product.name.trim(), image: typeof product.image === "string" ? product.image : Array.isArray(product.image) ? product.image[0]?.url || product.image[0] : product.image?.url, values: [],
        amount, currency: offer.priceCurrency, inStock, outOfStock: !inStock }];
    }
    return [];
  }

  // Read only the first shipping summary, never unrelated prices or later options.
  function getPostage(html) {
    const markup = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    const start = /<([a-z][\w-]*)\b[^>]*class\s*=\s*(?:"[^"]*\bux-labels-values--shipping\b[^"]*"|'[^']*\bux-labels-values--shipping\b[^']*'|[^\s>]*\bux-labels-values--shipping\b[^\s>]*)[^>]*>/i.exec(markup);
    if (!start) return null;
    const tags = new RegExp(`<\/?${start[1]}\\b[^>]*>`, 'gi');
    tags.lastIndex = start.index + start[0].length;
    let depth = 1, end = tags.lastIndex, tag;
    while ((tag = tags.exec(markup))) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (!depth) { end = tag.index; break; }
    }
    if (depth) return null;
    const text = markup.slice(start.index + start[0].length, end)
      .replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ')
      .replace(/&(?:pound|#163|#xA3);/gi, '£').replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ').trim();
    const first = /\bFree\b|(?:GBP|US\s*\$|USD|EUR|£|€|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i.exec(text);
    if (!first) return null;
    // A collection-only first option doesn't imply free delivery.
    if (/collection|pickup|pick up/i.test(text.slice(0,first.index))) return null;
    if (/^free$/i.test(first[0])) return {amount:0,currency:null};
    const currency = /£|GBP/i.test(first[0]) ? 'GBP' : /€|EUR/i.test(first[0]) ? 'EUR' : 'USD';
    const postage = {amount:Number(first[1].replace(/,/g,'')),currency};
    // eBay may show the delivery charge in the seller's currency followed by
    // a displayed conversion: EUR 2.02 (approx £1.69). Use only that adjacent
    // conversion, never an amount from a later delivery option.
    const following = text.slice(first.index + first[0].length);
    const conversion = /^\s*\(\s*(?:approx(?:imately)?\.?\s*)?(GBP|US\s*\$|USD|EUR|£|€|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*\)/i.exec(following);
    if (conversion) {
      const convertedCurrency = /£|GBP/i.test(conversion[1]) ? 'GBP' : /€|EUR/i.test(conversion[1]) ? 'EUR' : 'USD';
      postage.converted = {[convertedCurrency]:Number(conversion[2].replace(/,/g,''))};
    }
    return postage;
  }
  function withPostage(rows, postage) {
    return rows.map(row => {
      const shipping = !postage ? null : (!postage.currency || postage.currency === row.currency)
        ? postage.amount : (postage.converted?.[row.currency] ?? null);
      const postageApproximate = shipping !== null && !!postage?.currency && postage.currency !== row.currency;
      return {...row,postage:shipping,postageApproximate,
        originalPostage:postage ? {amount:postage.amount,currency:postage.currency || row.currency} : null,
        totalApproximate:!!row.approximate || postageApproximate,total:typeof row.amount === 'number' && shipping !== null
        ? Math.round((row.amount + shipping) * 100) / 100 : null};
    });
  }
  const currencyFormatters = new Map();
  function formatCurrency(amount,currency) {
    let formatter = currencyFormatters.get(currency);
    if (!formatter) {
      formatter = new Intl.NumberFormat('en-GB',{style:'currency',currency});
      currencyFormatters.set(currency,formatter);
    }
    return formatter.format(amount);
  }
  function applicableCoupon(row) {
    const coupon = row.coupon;
    if(!coupon) return null;
    if(Number.isFinite(coupon.percent) && coupon.percent>0 && coupon.percent<100) return coupon;
    if(Number.isFinite(coupon.amount) && coupon.amount>0 && coupon.currency===row.currency) return coupon;
    return null;
  }
  function couponLabel(coupon) {
    return Number.isFinite(coupon.percent) ? `${coupon.percent}%` : formatCurrency(coupon.amount,coupon.currency);
  }
  function couponSaving(coupon,subtotal) {
    if(!coupon || !Number.isFinite(subtotal) || subtotal<=0) return 0;
    // A fixed-value voucher is deducted once per order, never once per unit.
    return Math.min(subtotal,Number.isFinite(coupon.percent) ? subtotal*coupon.percent/100 : coupon.amount);
  }
  function totalEstimate(row) {
    const coupon = applicableCoupon(row);
    const hasItem = typeof row.amount === 'number' && Number.isFinite(row.amount);
    const hasPostage = typeof row.postage === 'number' && Number.isFinite(row.postage);
    if (!coupon || !hasItem) return {amount:row.total,coupon:null};
    const saving = couponSaving(coupon,row.amount);
    return {amount:Math.round((row.amount - saving + (hasPostage ? row.postage : 0)) * 100) / 100,
      saving,coupon,shippingUnknown:!hasPostage};
  }
  function displayTotal(row, format) {
    const estimate = totalEstimate(row);
    if (estimate.coupon) return format({...row,amount:estimate.amount,approximate:row.totalApproximate || row.approximate}) +
      (estimate.shippingUnknown ? ' ⚠' : '');
    const hasTotal = typeof row.total === 'number' && Number.isFinite(row.total);
    const hasItem = typeof row.amount === 'number' && Number.isFinite(row.amount);
    if (hasTotal) return format({...row,amount:row.total,approximate:row.totalApproximate});
    return format(row) + (hasItem ? ' ⚠' : '');
  }
  function priceTooltip(row) {
    function money(amount,currency,approximate=false) {
      if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'Unknown';
      let text;
      try { text = formatCurrency(amount,currency); }
      catch { text = `${amount.toFixed(2)} ${currency || ''}`.trim(); }
      return (approximate ? '≈ ' : '') + text;
    }
    function pair(amount,currency,approximate,original) {
      const local = money(amount,currency,approximate);
      if (!original || original.currency === currency && original.amount === amount) return local;
      return `${money(original.amount,original.currency)} (${local})`;
    }
    const item = pair(row.amount,row.currency,row.approximate,row.originalPrice);
    const postage = pair(row.postage,row.currency,row.postageApproximate,row.originalPostage);
    let originalTotal = null;
    const originalItem = row.originalPrice || (!row.approximate ? {amount:row.amount,currency:row.currency} : null);
    if (originalItem && row.originalPostage && originalItem.currency === row.originalPostage.currency &&
        typeof originalItem.amount === 'number') {
      originalTotal = {amount:Math.round((originalItem.amount+row.originalPostage.amount)*100)/100,currency:originalItem.currency};
    }
    const estimate = totalEstimate(row);
    if (estimate.coupon) {
      return `Experimental coupon estimate${estimate.coupon.source==='subtitle' ? ' — advertised in the seller’s subtitle; eligible variants and combining offers are unverified' : ''} — check the coupon details on the listing page for limits, minimum spend, expiry and eligibility. Enter the code at checkout and verify manually.\nItem before coupon: ${item}\nCoupon −${couponLabel(estimate.coupon)}${estimate.coupon.code ? ` (code ${estimate.coupon.code})` : ''}: −${money(estimate.saving,row.currency)}\nPostage (not discounted): ${postage}\nIndividual purchase after coupon: ${money(estimate.amount,row.currency,row.totalApproximate || row.approximate)}${estimate.shippingUnknown ? '\n⚠ Postage is unknown and is not included.' : ''}`;
    }
    if (typeof row.total !== 'number' && typeof row.amount === 'number') {
      return `Item: ${item}\nPostage: ${postage}\n⚠ Item price only. Postage price is not recognised; delivery is not included.`;
    }
    return `Item: ${item}\nPostage: ${postage}\nIndividual purchase: ${pair(row.total,row.currency,row.totalApproximate,originalTotal)}`;
  }
  function promotionText(text) {
    return String(text).replace(/<[^>]*>/g,' ').replace(/&pound;|&#163;|&#xA3;/gi,'£').replace(/&euro;|&#8364;|&#x20AC;/gi,'€').replace(/&dollar;|&#36;|&#x24;/gi,'$').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
  }
  function promotionCurrency(symbol) {
    return /£|GBP/i.test(symbol) ? 'GBP' : /€|EUR/i.test(symbol) ? 'EUR' : 'USD';
  }
  function markedPromotionTexts(source,kind) {
    if(typeof source!=='string') {
      const selector=kind==='coupon' ? '#mainContent [data-testid="x-coupon"].x-coupon' : '#mainContent .x-item-title__subTitle';
      return [...new Set(Array.from(source.querySelectorAll(selector),el=>promotionText(el.textContent)))];
    }
    const html=source.replace(/<(script|style|iframe|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,''),stack=[],texts=[];
    let text='';
    for(const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
      const value=token[0];
      if(value.startsWith('<!--')) continue;
      if(!value.startsWith('<')) {if(stack.some(el=>el.marked))text+=value+' ';continue;}
      const end=/^<\/([\w-]+)/.exec(value);
      if(end) {
        let index=stack.length-1;while(index>=0&&stack[index].tag!==end[1].toLowerCase()) index--;
        if(index>=0) {if(stack.slice(index).some(el=>el.marked)) {texts.push(promotionText(text));text='';}stack.length=index;}
        continue;
      }
      const start=/^<([\w-]+)/.exec(value);if(!start) continue;
      const attrs={};
      for(const attr of value.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g)) attrs[attr[1].toLowerCase()]=attr[2]??attr[3]??attr[4];
      const tag=start[1].toLowerCase(),main=attrs.id==='mainContent'||stack.some(el=>el.main),classes=(attrs.class||'').split(/\s+/);
      const marked=main&&(kind==='coupon' ? attrs['data-testid']==='x-coupon'&&classes.includes('x-coupon') : classes.includes('x-item-title__subTitle'));
      if(!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag)&&! /\/\s*>$/.test(value)) stack.push({tag,main,marked});
    }
    return [...new Set(texts)];
  }
  function parseCoupon(text,subtitle=false) {
    const percent=[...text.matchAll(/\b(\d+(?:\.\d+)?)\s*%\s+off\s+(?:with\s+)?code\s*:?\s*([A-Z0-9_-]+)?/gi)];
    const fixed=[...text.matchAll(/(GBP|US\s*\$|USD|EUR|£|€|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s+off\s+(?:with\s+)?code\s*:?\s*([A-Z0-9_-]+)/gi)];
    if(percent.length+fixed.length!==1) return null;
    let coupon;
    if(percent.length) {
      const value=Number(percent[0][1]),code=percent[0][2];
      if(!(value>0&&value<100)||subtitle&&!code) return null;
      coupon={percent:value,...(code ? {code} : {})};
    } else {
      const value=Number(fixed[0][2].replace(/,/g,''));
      if(!(value>0&&Number.isFinite(value))) return null;
      coupon={amount:value,currency:promotionCurrency(fixed[0][1]),code:fixed[0][3]};
    }
    return subtitle ? {...coupon,source:'subtitle',conditional:true} : coupon;
  }
  function getCoupon(source) {
    for(const kind of ['coupon','subtitle']) {
      const coupons=markedPromotionTexts(source,kind).map(text=>parseCoupon(text,kind==='subtitle')).filter(Boolean);
      const distinct=[...new Map(coupons.map(coupon=>[JSON.stringify(coupon),coupon])).values()];
      if(distinct.length) return distinct.length===1 ? distinct[0] : null;
    }
    return null;
  }
  function getBannerOffer(scripts) {
    let model;
    for(const script of scripts) {const found=extractObject(script,'SME_BANNER');if(found?._type==='SMEBannerModule'&&typeof found.htmlMessage==='string') {model=found;break;}}
    if(!model) return null;
    const text=promotionText(model.htmlMessage),match=/\bbuy\s+(\d+)\s*[,;:\-–—]?\s*get\s+(\d+)\s+free\b/i.exec(text);
    if(!match) return null;
    const pay=Number(match[1]),free=Number(match[2]),spools=pay+free;
    if(![pay,free,spools].every(Number.isSafeInteger)||pay<1||free<1) return null;
    const basket=/\badd\s+(\d+)\s+to\s+(?:the\s+)?basket\b/i.exec(text);
    if(basket&&Number(basket[1])!==spools) return null;
    const code=/\bwith\s+(?:code\s*:?\s*)?([A-Z0-9_-]+)\b/i.exec(text)?.[1];
    if(/\bwith\b/i.test(text)&&(!code||/^code$/i.test(code))) return null;
    const cap=/\bmax(?:imum)?\s*(GBP|US\s*\$|USD|EUR|£|€|\$)\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)\s*off\b/i.exec(text);
    if(/\bmax(?:imum)?\b/i.test(text)&&!cap) return null;
    const maxSaving=cap ? Number(cap[2].replace(/,/g,'')) : undefined;
    if(cap&&!(maxSaving>0&&Number.isFinite(maxSaving))) return null;
    let termsUrl;
    try {const url=new URL(model.offerUrl?.action?.URL);if(/^https:\/\/(?:www\.)?ebay\.(?:co\.uk|com)$/.test(url.origin)) termsUrl=url.href;}catch{}
    return {pay,free,spools,factor:pay/spools,...(code?{code}:{}),...(cap?{maxSaving,currency:promotionCurrency(cap[1])}:{}),...(termsUrl?{termsUrl}:{}),source:'banner'};
  }
  function withBannerOffers(rows,scripts) {
    const bannerOffer=getBannerOffer(scripts);
    return bannerOffer ? rows.map(row=>({...row,bannerOffer})) : rows;
  }
  function offerSubtotal(row,offer) {
    if(offer?.free) {
      const saving=Math.min(row.amount*offer.free,offer.maxSaving??Infinity);
      return Math.max(0,row.amount*offer.spools-saving);
    }
    return (offer?.unitPrice??row.amount*(offer?.factor??1))*(offer?.spools||1);
  }
  function withVolumePricing(rows,scripts) {
    let model = null;
    for (const script of scripts) {
      const found = extractObject(script,'VOLUME_PRICING');
      if (found?._type === 'VolumePricingViewModel') { model = found; break; }
    }
    if (!model) return rows;
    return rows.map(row => {
      // Never borrow another variant's tiers or the currently selected variant's price.
      const group = model.mskuVariationMap?.[row.id] || (row.singleItem ? model.mskuDefaultGroup || model.group : null);
      const tiers = (group?.entries || []).map(entry => {
        const data = entry.paramValue;
        return {quantity:data?.quantitySelected,amount:data?.binModel?.price?.value?.value,
          currency:data?.binModel?.price?.value?.currency};
      }).filter(tier => Number.isSafeInteger(tier.quantity) && tier.quantity > 1 &&
        typeof tier.amount === 'number' && Number.isFinite(tier.amount) && tier.amount >= 0 &&
        tier.currency === row.currency && tier.amount < row.amount);
      tiers.sort((a,b) => a.amount - b.amount || a.quantity - b.quantity);
      return tiers.length ? {...row,volumePricing:tiers[0]} : row;
    });
  }
  const spoolEstimates = new WeakMap();
  function spoolEstimate(row) {
    const cached = spoolEstimates.get(row);
    if (cached && cached.title === row.title && cached.base === row.amount && cached.postage === row.postage && cached.total === row.total && cached.coupon === row.coupon && cached.volumePricing === row.volumePricing && cached.bannerOffer === row.bannerOffer) return cached.estimate;
    const title = String(row.title || '').normalize('NFKC');
    const offers = [];
    const separator = /\bbuy\s+(\d+)\s*[,;:\-–—]?\s*(?:pay\s+(\d+)\b|get\s+(\d+)\s+free\b|save\s+(\d+(?:\.\d+)?)\s*%)/gi;
    for (const match of title.matchAll(separator)) {
      const quantity = Number(match[1]);
      if (!Number.isSafeInteger(quantity) || quantity < 1) continue;
      if (match[2] !== undefined) {
        const pay = Number(match[2]);
        if (Number.isSafeInteger(pay) && pay > 0 && pay < quantity) {
          offers.push({factor:pay / quantity,spools:quantity,description:`Buy ${quantity} Pay ${pay}`,formula:`(item price × ${pay} + postage) ÷ ${quantity}`});
        }
      } else if (match[3] !== undefined) {
        const free = Number(match[3]);
        if (Number.isSafeInteger(free) && free > 0 && Number.isSafeInteger(quantity + free)) {
          offers.push({factor:quantity / (quantity + free),spools:quantity + free,description:`Buy ${quantity} Get ${free} Free`,formula:`(item price × ${quantity} + postage) ÷ ${quantity + free}`});
        }
      } else {
        const percent = Number(match[4]);
        if (percent > 0 && percent < 100) {
          offers.push({factor:1 - percent / 100,spools:quantity,description:`Buy ${quantity} Save ${percent}%`,formula:`(item price × ${quantity} × (1 − ${percent}%) + postage) ÷ ${quantity}`});
        }
      }
    }
    let offer = offers.length === 1 ? offers[0] : null;
    const banner=row.bannerOffer;
    if(banner&&Number.isSafeInteger(banner.spools)&&banner.spools>1&&banner.free>0&&(!banner.currency||banner.currency===row.currency)) {
      offer={...banner,description:`Buy ${banner.pay} Get ${banner.free} Free`,
        formula:`(item price × ${banner.spools} − free-item saving${banner.maxSaving!==undefined ? ` capped at ${formatCurrency(banner.maxSaving,banner.currency)}` : ''} + postage) ÷ ${banner.spools}`};
    }
    const volume = row.volumePricing;
    if (volume && volume.currency === row.currency && Number.isSafeInteger(volume.quantity) && volume.quantity > 1 &&
        Number.isFinite(volume.amount) && volume.amount >= 0 && volume.amount < row.amount &&
        (!offer || volume.amount <= offerSubtotal(row,offer)/offer.spools)) {
      // Use one offer, never stack the title offer with eBay volume pricing.
      offer = {unitPrice:volume.amount,spools:volume.quantity,identical:true,description:'eBay multi-buy',
        formula:`(multi-buy unit price × ${volume.quantity} + postage) ÷ ${volume.quantity}`};
    }
    const coupon = offer?.code ? null : applicableCoupon(row);
    const recognised = !!offer || !!coupon;
    const hasPostage = typeof row.postage === 'number' && Number.isFinite(row.postage);
    const hasTotal = typeof row.total === 'number' && Number.isFinite(row.total);
    const base = recognised ? row.amount : hasTotal ? row.total : row.amount;
    const amount = typeof base === 'number' && Number.isFinite(base)
      ? Math.round((recognised ? (() => {
        const spools = offer?.spools || 1;
        const subtotal = offerSubtotal(row,offer);
        const saving = couponSaving(coupon,subtotal);
        return (subtotal - saving + (hasPostage ? row.postage : 0)) / spools;
      })() : base) * 100) / 100 : undefined;
    const estimate = {amount, recognised, offer, coupon,shippingUnknown:recognised ? !hasPostage : !hasTotal};
    spoolEstimates.set(row,{title:row.title,base:row.amount,postage:row.postage,total:row.total,coupon:row.coupon,volumePricing:row.volumePricing,bannerOffer:row.bannerOffer,estimate});
    return estimate;
  }
  function spoolTooltip(row, estimate) {
    const calculation = estimate.offer
      ? `${estimate.offer.description}: ${estimate.offer.formula}. Requires purchase of ${estimate.offer.spools} ${estimate.offer.identical ? 'identical items (same variant; variants cannot be mixed)' : 'items from this listing'}. Assumes all items have this price.`
      : 'No unambiguous supported offer recognised; showing the regular total, including recognised postage.';
    const offerNote=estimate.offer?.source==='banner' ? `\nOffer shown in eBay’s listing banner.${estimate.offer.code ? ` Enter code ${estimate.offer.code} at checkout.` : ''}${estimate.offer.maxSaving!==undefined ? ` Maximum saving: ${formatCurrency(estimate.offer.maxSaving,estimate.offer.currency)} per order.` : ''} Assumes equally priced eligible items; check the offer terms for mixing variants, which items are free and eligibility.${estimate.offer.termsUrl ? ` Terms: ${estimate.offer.termsUrl}` : ''}${row.coupon&&estimate.offer.code ? ' A separate coupon is not stacked with this code-required offer.' : ''}` : '';
    const couponNote = estimate.coupon ? `\nIncludes ${estimate.coupon.source==='subtitle' ? 'seller-advertised' : 'eBay'} coupon: ${couponLabel(estimate.coupon)} off the item subtotal after multi-buy discounts, before postage.${Number.isFinite(estimate.coupon.amount) ? ' The fixed voucher is deducted once from the order total, not from every item.' : ''}${estimate.coupon.code ? ` Code: ${estimate.coupon.code}.` : ''} Check the coupon details on the listing page for maximum savings, minimum spend, expiry, eligibility and whether offers combine. Enter the code at checkout and verify manually.` : '';
    return `Experimental estimate — check the offer, required quantity, eligibility, spool size and delivery manually before buying.\n${estimate.coupon && !estimate.offer ? 'One item at the regular price before coupon.' : calculation}${offerNote}${couponNote}\nRecognised postage is added once after discounts, then divided across the offer quantity. Delivery charges for a multi-item order may differ.`;
  }

  function trimPriceNote(note) {
    note.style.cssText = 'display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;color:#245c3a;font-size:10px;font-style:normal;white-space:nowrap';
    note.title = '';
    if(globalThis.EbayCards) EbayCards.tooltip(note,note.textContent);
  }
  function spoolLabel(row) {
    const estimate = spoolEstimate(row);
    const labels = [];
    if (estimate.offer) labels.push(`Requires ${estimate.offer.spools} ${estimate.offer.identical ? 'identical items' : 'items from this listing'}`);
    if(estimate.offer?.code) labels.push(`Code ${estimate.offer.code}`);
    if(estimate.offer?.maxSaving!==undefined) labels.push(`Max ${formatCurrency(estimate.offer.maxSaving,estimate.offer.currency)} off`);
    if (estimate.coupon) labels.push(`Coupon −${couponLabel(estimate.coupon)}`);
    return labels.join(' · ');
  }
  function displaySpool(row, format) {
    const estimate = spoolEstimate(row);
    if (!estimate.recognised) return displayTotal(row,format);
    return format({...row,amount:estimate.amount,approximate:row.totalApproximate || row.approximate}) +
      (estimate.shippingUnknown && typeof estimate.amount === 'number' ? ' ⚠' : '');
  }
  const spoolSortRows = new WeakMap();
  function compareSpool(a,b,ascending) {
    function sortable(row) {
      const amount = spoolEstimate(row).amount;
      let cached = spoolSortRows.get(row);
      if (!cached || cached.spool !== amount) {
        cached = {spool:amount,currency:row.currency,title:row.title,label:row.label};
        spoolSortRows.set(row,cached);
      }
      return cached;
    }
    return comparePrice(sortable(a),sortable(b),'spool',ascending);
  }
  // The caller supplies the full filtered set, before display sorting or batching.
  function matchingAverage(rows) {
    const available = rows.filter(row => row.inStock && !row.outOfStock &&
      Number.isFinite(row.amount) && row.amount >= 0);
    if (!available.length || new Set(available.map(row => row.currency)).size !== 1) return null;
    const amount = available.reduce((sum,row) => sum + row.amount,0) / available.length;
    const estimates = available.map(row => ({row,estimate:spoolEstimate(row)}));
    const first = estimates[0].estimate;
    const offer = first.offer;
    const compatible = offer && estimates.every(({estimate:e}) => e.offer &&
      e.offer.spools === offer.spools && e.offer.identical === offer.identical &&
      e.offer.description === offer.description && e.offer.code===offer.code && e.offer.maxSaving===offer.maxSaving && e.offer.free===offer.free && e.coupon?.percent === first.coupon?.percent &&
      e.coupon?.amount === first.coupon?.amount && e.coupon?.currency === first.coupon?.currency && e.coupon?.code === first.coupon?.code &&
      Number.isFinite(e.amount));
    const priced = compatible ? estimates.map(({row,estimate}) => {
      const quantity = offer.spools;
      const subtotal = offerSubtotal(row,estimate.offer);
      const total = Math.round((subtotal - couponSaving(estimate.coupon,subtotal) +
        (Number.isFinite(row.postage) ? row.postage : 0)) * 100) / 100;
      return {total,unit:total / quantity};
    }) : [];
    // Display and sorting share the same offer-first price.
    // Sum whole pennies before dividing, then round the displayed unit price
    // once. Summing fractional unit prices can push an exact half-penny below
    // the rounding boundary (e.g. 83.95 / 10 averaged across 14 variants).
    const offerAverage = compatible ? Math.round(
      priced.reduce((sum,p) => sum + Math.round(p.total * 100),0) /
      (priced.length * offer.spools)) / 100 : null;
    return {amount:offerAverage ?? amount,baseAmount:amount,currency:available[0].currency,count:available.length,
      approximate:available.some(row => row.approximate),
      offer:compatible ? {quantity:offer.spools,identical:offer.identical,
        average:offerAverage,
        cheapest:priced.reduce((a,b) => a.total <= b.total ? a : b),
        expensive:priced.reduce((a,b) => a.total >= b.total ? a : b),
        shippingUnknown:estimates.some(({estimate}) => estimate.shippingUnknown),
        coupon:first.coupon,code:offer.code,maxSaving:offer.maxSaving,termsUrl:offer.termsUrl,conditional:offer.source==='banner'||!!first.coupon?.conditional} : null};
  }
  const priceCollator = new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
  function comparePrice(a,b,key,ascending) {
    const av = key === 'total' && applicableCoupon(a) ? totalEstimate(a).amount : a[key];
    const bv = key === 'total' && applicableCoupon(b) ? totalEstimate(b).amount : b[key];
    const known = value => typeof value === 'number' && Number.isFinite(value);
    if (known(av) !== known(bv)) return known(av) ? -1 : 1;
    const order = String(a.currency).localeCompare(String(b.currency)) || (known(av) ? av-bv : 0);
    // Equal prices keep listings grouped alphabetically in either price direction.
    return (ascending ? order : -order) ||
      priceCollator.compare(String(a.title || ''),String(b.title || '')) ||
      priceCollator.compare(String(a.label || ''),String(b.label || ''));
  }
  function terms(query) {
    // Unclosed quotes keep the remainder together while the user is typing.
    const terms = [];
    let term = '', quoted = false;
    for (const char of query.toLocaleLowerCase()) {
      if (char === '"') {
        if (term) terms.push(term);
        term = ''; quoted = !quoted;
      } else if (!quoted && /\s/.test(char)) {
        if (term) terms.push(term);
        term = '';
      } else term += char;
    }
    if (term) terms.push(term);
    return terms;
  }
  function matches(label, words) {
    const text = label.toLocaleLowerCase();
    return words.every(word => text.includes(word));
  }
  function isMissingListing(source) {
    if(typeof source!=='string') {
      const title=source.querySelector('#mainContent [data-testid^="dp-error-banner-container-title-"]');
      return !!title && /^we looked everywhere!?$/i.test(title.textContent.trim()) && /looks like this page is missing\./i.test(title.parentElement?.textContent || '');
    }
    // Match rendered error content only. Translation dictionaries and recently
    // viewed recommendations on this page must never count as listing data.
    const markup=source.replace(/<(script|style|template|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
    const title=/<h[12]\b[^>]*data-testid\s*=\s*(?:"dp-error-banner-container-title-[^"]*"|'dp-error-banner-container-title-[^']*'|dp-error-banner-container-title-[^\s>]+)[^>]*>([\s\S]*?)<\/h[12]\s*>/i.exec(markup);
    return !!title && /^we looked everywhere!?$/i.test(title[1].replace(/<[^>]*>/g,' ').trim()) && /looks like this page is missing\./i.test(markup.slice(title.index,title.index+1500).replace(/<[^>]*>/g,' '));
  }
  return { getBannerOffer,withBannerOffers,isMissingListing, couponLabel, matchingAverage, trimPriceNote, withVolumePricing, spoolLabel, totalEstimate, getCoupon, compareSpool, formatCurrency, spoolEstimate, spoolTooltip, displaySpool, displayTotal, priceTooltip, getPostage, withPostage, comparePrice, getRows, getSingleItemRows, terms, matches };
})();
