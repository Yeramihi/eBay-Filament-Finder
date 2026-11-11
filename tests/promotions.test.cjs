const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const context={URL,Intl,Map,Set,WeakMap,console};
vm.runInNewContext(fs.readFileSync(`${__dirname}/../js/variants.js`,'utf8'),context);
const api=context.EbayVariants;
const row=(amount=10,extra={})=>({id:'1',label:'PLA',title:'Filament',amount,currency:'GBP',postage:0,total:amount,inStock:true,...extra});
function banner(text) {return [JSON.stringify({SME_BANNER:{_type:'SMEBannerModule',htmlMessage:text,offerUrl:{action:{URL:'https://www.ebay.co.uk/str/example?_tab=sales'}}}})];}
function subtitle(text) {return `<main id=mainContent><h1>Filament</h1><div class=x-item-title__subTitle>${text}</div></main>`;}
test('coded buy-four-get-one banner captures quantity, code and saving cap',()=>{
  const rows=api.withBannerOffers([row(9.99)],banner('BUY 4, GET 1 <span>FREE</span> WITH <span>UKCREA3DPRINT25</span> (Max £100 off)'));
  const estimate=api.spoolEstimate(rows[0]);
  assert.equal(estimate.offer.spools,5);assert.equal(estimate.offer.code,'UKCREA3DPRINT25');assert.equal(estimate.offer.maxSaving,100);
  assert.equal(estimate.amount,7.99);assert.equal(api.totalEstimate(rows[0]).amount,9.99);
  assert.match(api.spoolTooltip(rows[0],estimate),/Maximum saving: £100.00 per order/);
  assert.match(api.spoolLabel(rows[0]),/UKCREA3DPRINT25/);
});
test('banner saving cap is applied once and carried through mixed averages',()=>{
  const rows=api.withBannerOffers([row(250)],banner('BUY 4, GET 1 FREE WITH CAP100 (Max £100 off)'));
  assert.equal(api.spoolEstimate(rows[0]).amount,230);
  const average=api.matchingAverage(rows);assert.equal(average.amount,230);assert.equal(average.offer.cheapest.total,1150);
});
test('JAYO title and banner describe one offer; subtitle code gives a conditional 48 percent price',()=>{
  const coupon=api.getCoupon(subtitle('🎁20% off Code: FRIGHTNIGHT20✅PLA Classic-Black £15.99'));
  assert.equal(coupon.percent,20);assert.equal(coupon.code,'FRIGHTNIGHT20');assert.equal(coupon.source,'subtitle');
  const rows=api.withBannerOffers([row(10,{title:'【Buy 5 Pay 3】 JAYO PLA',coupon})],banner('BUY 3, GET 2 <span>FREE</span> (add 5 to basket)'));
  assert.equal(api.spoolEstimate(rows[0]).amount,4.8);
  assert.equal(api.totalEstimate(rows[0]).amount,8);
  assert.equal(api.matchingAverage(rows).amount,4.8);
  assert.equal(api.spoolEstimate(rows[0]).offer.spools,5);
  assert.match(api.priceTooltip(rows[0]),/seller’s subtitle/);
  assert.match(api.spoolTooltip(rows[0],api.spoolEstimate(rows[0])),/whether offers combine/);
});
test('same subtitle copied twice deduplicates, and purchase-panel coupon takes precedence',()=>{
  const markup=subtitle('20% off Code: FRIGHTNIGHT20');
  assert.equal(api.getCoupon(markup+markup).percent,20);
  const main='<main id="mainContent"><div data-testid="x-coupon" class="x-coupon">£5.00 off with code SAVE5</div><div class="x-item-title__subTitle">20% off Code: FRIGHTNIGHT20</div></main>';
  assert.equal(api.getCoupon(main).amount,5);assert.equal(api.getCoupon(main).code,'SAVE5');
});
test('DOM and worker subtitle paths agree',()=>{
  const text='🎁20% off Code: FRIGHTNIGHT20✅PLA Classic-Black £15.99';
  const dom={querySelectorAll:selector=>selector.includes('subTitle')?[{textContent:text}]:[]};
  assert.deepEqual(JSON.parse(JSON.stringify(api.getCoupon(dom))),JSON.parse(JSON.stringify(api.getCoupon(subtitle(text)))));
});
test('unmarked descriptions, recommendations and scripts cannot supply a coupon',()=>{
  assert.equal(api.getCoupon('<div class="x-item-title__subTitle">20% off Code: FALSE</div>'),null);
  assert.equal(api.getCoupon('<main id=mainContent><script>20% off Code: FALSE</script><div>20% off Code: FALSE</div></main>'),null);
  assert.equal(api.getCoupon(subtitle('20% off Code: ONE and 30% off Code: TWO')),null);
});
test('an additional coupon is not stacked with a code-required banner offer',()=>{
  const rows=api.withBannerOffers([row(10,{coupon:{percent:20,code:'ANOTHER'}})],banner('BUY 4, GET 1 FREE WITH CODE5'));
  assert.equal(api.spoolEstimate(rows[0]).amount,8);assert.equal(api.spoolEstimate(rows[0]).coupon,null);
});
test('invalid basket quantities, ambiguous caps and unrelated banners are ignored',()=>{
  assert.equal(api.getBannerOffer(banner('BUY 3, GET 2 FREE (add 4 to basket)')),null);
  assert.equal(api.getBannerOffer(banner('BUY 4, GET 1 FREE (Max unknown off)')),null);
  assert.equal(api.getBannerOffer(banner('UP TO 5% OFF WITH MULTI-BUY')),null);
  assert.equal(api.getBannerOffer(banner('BUY 4, GET 1 FREE WITH CODE (Max £100 off)')),null);
});
test('legacy percentage and fixed vouchers still work with missing or explicit codes',()=>{
  const html=text=>`<main id=mainContent><div class=x-coupon data-testid=x-coupon>${text}</div></main>`;
  assert.equal(api.getCoupon(html('10% off with code TEN')).percent,10);
  assert.equal(api.getCoupon(html('10% off with code')).percent,10);
  const coupon=api.getCoupon(html('£5.00 off with code FIVE'));
  assert.equal(api.spoolEstimate(row(10,{title:'Buy 5 Pay 3',coupon})).amount,5);
});
