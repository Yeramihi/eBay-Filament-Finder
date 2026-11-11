// Shared by the normal listing sidebar and the visible-tab scan reader.
globalThis.EbayListingData = () => {
  const html=document.documentElement.outerHTML;
  const scripts=Array.from(document.scripts,script=>script.textContent||'');
  const variants=EbayVariants.getRows(scripts);
  const itemId=location.pathname.match(/\/itm\/(?:[^/]+\/)?(\d+)/)?.[1];
  const rows=variants.length?variants:EbayVariants.getSingleItemRows(html,itemId?`${location.origin}/itm/${itemId}`:location.href);
  const title=document.querySelector('h1.x-item-title__mainTitle, h1')?.textContent?.trim()||'';
  const image=document.querySelector('meta[property="og:image"]')?.content||document.querySelector('.ux-image-carousel-item img')?.src;
  const coupon=EbayVariants.getCoupon(document);
  return EbayVariants.withPostage(EbayVariants.withVolumePricing(rows,scripts),EbayVariants.getPostage(html))
    .map(row=>({...row,title,coupon,image:row.image||image}));
};
