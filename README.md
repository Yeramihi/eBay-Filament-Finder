# eBay Filament Finder

Chrome extension for finding in-stock filament variants across eBay search results and comparing listing variations on eBay UK and US.

## Baseline

The initial source import is the published **version 1.3**, extracted from `ebay-filament-finder-1.3.zip`. The `v1.3` tag preserves this baseline.

## Version 1.4 development

Version 1.4 is prepared on `work/1.4`; `main` and the `v1.3` tag retain the published 1.3 baseline until the update is reviewed and merged.

Changes include automatic sidebar opening from listing titles, manual results filters, Previous/Next navigation, accumulated and deduplicated pagination scans, optional eBay resizing, and revised price labels. Scanning supports Background, Visible tabs and Mixed modes, with a reusable visible tab, verification recovery controls and an Escape-to-stop notice. Mixed uses the saved parallel count in the background, drains active requests after the first error, handles failed listings serially in the visible tab, and then resumes parallel background work. Only Visible tabs fixes the parallel count at 1.

A persistent listing cache loads matching saved results on search pages and skips valid entries during scans. Settings allow retention of 1 day, 1 week (default), 1 month (30 days), or indefinitely. Cached results show retrieval timestamps; opening a listing refreshes its saved data. Per-listing Clear cache and Refresh controls act on all variants of that listing. Hide from results hides an entire listing for 1 day, 1 week or 30 days (default), across searches and browser restarts. A collapsed Hidden section between Results and Out of stock shows one tile per hidden listing, its expiry and an Unhide button; hidden listings remain accessible there regardless of the current variant filter. Hiding is independent of cache age and never deletes listing data.

The bundled guide has not yet been updated for scanning modes and persistent caching. Automated regression tests and live Chrome reload/cache/filter/scroll checks have now been run following the user’s later authorization to test. This branch is for review and manual testing, not a published release.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the folder containing `manifest.json`.
5. Open an eBay UK or US search results or listing page.

Requires Chrome 114 or later.

The normal listing sidebar confirms cache saves with the saved timestamp, retries transient failures, and offers Retry cache save when persistence fails. Unknown stock status no longer silently prevents saving fresh listing data; unknown values remain unknown.

The extension requests `unlimitedStorage` so its persistent listing cache can exceed Chrome’s normal local-storage quota. Existing stored data needs no migration. Retention settings and per-listing cache deletion still apply; this does not remove disk-space limits.

Settings shows live local-storage usage and a Purge all cache button. Purging removes persistent listing data and local/session scan snapshots, preserving preferences and hidden-list choices. Active scans and opened listings may save fresh data after a purge.

Price parsing supports single-item multi-buy groups alongside variant-specific tiers, plus percentage and fixed-currency vouchers. Fixed vouchers are applied once to an order subtotal after multi-buy pricing, capped at that subtotal, before postage. Coupon codes and amounts appear in price explanations; eligibility and combining offers still require checking at checkout.

Settings includes Always show all cached data (off by default). Enabling it loads all unexpired cached listings for the current eBay marketplace on any search page, without starting a scan or fetching listings. Filters, sorting, cached timestamps, hiding and retention still apply. Turning it off restores results accumulated from the pages visited in the current search. Large search snapshots store listing references rather than duplicating variant arrays in session storage.

When a user opens a listing, fresh item prices, postage and individual/bulk estimates are compared with the previous cached variant data before replacement. Changes to the originally opened variant show a persistent top-of-page warning with a Close button; changes to other variants appear in red in the listing sidebar. Variant IDs (or single-item identity) match rows; added variants and unknown-to-known prices are not treated as price changes.

Price-change sidebar messages show only the changed-variant count. Decreases use green, increases red, and mixed directions (or changed currencies) black; the top banner uses the opened variant’s direction and the sidebar uses the listing’s aggregate direction. Each opened document retains one initial cache baseline, waits for stable fully loaded data before saving, and cannot overwrite cache data supplied by a newer listing tab.

The explicit eBay “We looked everywhere! / Looks like this page is missing” page removes its listing from cache and saved search references automatically during normal browsing or scanning. Missing listings do not pause the scan. Older tabs cannot restore an invalidated listing; a later successfully parsed fresh listing can be cached again. Verification pages and generic server errors do not trigger deletion.

Confirmed missing listing IDs are remembered indefinitely and skipped before background or visible-tab scanning, including ghost search results. Settings provides Clear remembered missing listings to forget all such IDs at once. Retention expiry and Purge all cache preserve missing records. Manually opening a listing that is readable again saves its fresh data and removes its missing record.

Large caches load in small asynchronous listing batches, with progress in the sidebar. Filtering and sorting work on all in-memory rows and yield between short processing slices. The results, Hidden and Out of stock lists window their DOM to roughly two viewport heights; scrolling replaces off-screen tiles while spacers retain the complete scrollbar range. Closed sections defer tile creation. No new network requests or scans are needed to scroll or filter cached data.

While scanning, progress shows “Scanning X of Y listings” for the current scan batch only, excluding preloaded cache entries. New candidates discovered during a scan extend that batch. Parallel scans show the earliest active queue position; retries and visible-tab fallback keep the same position. Subsequent batches and individual refreshes start their own counters.

Content scripts stop obsolete cache requests, observers and timers after an extension reload or document teardown, with a reconnect message instead of uncaught context errors. Page session snapshots are read and written through the background worker, since Chrome restricts direct content-script access to session storage.

Promotions are also read from eBay’s structured SME_BANNER and the listing subtitle. Buy-N-get-M-free banners retain their code, required basket quantity, maximum saving and terms URL; duplicate title/banner offers are not stacked. Subtitle codes are labelled advertised/conditional, with eligibility and combining offers unverified. A code-required banner is not combined with a second coupon code. Savings caps apply once per basket before postage, including in mixed-bulk estimates.

Coupon maximum-saving limits are read from the marked coupon block or subtitle and shown in coupon labels/tooltips. Percentage and fixed vouchers are capped once per order after any recognized multi-buy discount and before postage. A £699 item with 20% off capped at £75 is estimated at £624. Caps with incompatible currencies or unrecognized maximum-limit text are not applied as uncapped discounts.
