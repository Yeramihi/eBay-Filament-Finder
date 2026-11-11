# eBay Filament Finder

Chrome extension for finding in-stock filament variants across eBay search results and comparing listing variations on eBay UK and US.

## Baseline

The initial source import is the published **version 1.3**, extracted from `ebay-filament-finder-1.3.zip`. The `v1.3` tag preserves this baseline.

## Version 1.4 development

Version 1.4 is prepared on `work/1.4`; `main` and the `v1.3` tag retain the published 1.3 baseline until the update is reviewed and merged.

Changes include automatic sidebar opening from listing titles, search-derived filters, Previous/Next navigation, accumulated and deduplicated pagination scans, optional eBay resizing, and revised price labels. Scanning supports Background, Visible tabs and Mixed modes, with a reusable visible tab, verification recovery controls and an Escape-to-stop notice. Mixed uses the saved parallel count in the background, drains active requests after the first error, handles failed listings serially in the visible tab, and then resumes parallel background work. Only Visible tabs fixes the parallel count at 1.

A persistent listing cache loads matching saved results on search pages and skips valid entries during scans. Settings allow retention of 1 day, 1 week (default), 1 month (30 days), or indefinitely. Cached results show retrieval timestamps; opening a listing refreshes its saved data. Per-listing Clear cache and Refresh controls act on all variants of that listing. Hide from results hides an entire listing for 1 day, 1 week or 30 days (default), across searches and browser restarts. A collapsed Hidden section between Results and Out of stock shows one tile per hidden listing, its expiry and an Unhide button; hidden listings remain accessible there regardless of the current variant filter. Hiding is independent of cache age and never deletes listing data.

The bundled guide has not yet been updated for scanning modes and persistent caching. Existing test files are included, but tests and browser checks have not been run for this prepared update at the user's request. This branch is for review and manual testing, not a published release.

## Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select the folder containing `manifest.json`.
5. Open an eBay UK or US search results or listing page.

Requires Chrome 114 or later.

The normal listing sidebar confirms cache saves with the saved timestamp, retries transient failures, and offers Retry cache save when persistence fails. Unknown stock status no longer silently prevents saving fresh listing data; unknown values remain unknown.

The extension requests `unlimitedStorage` so its persistent listing cache can exceed Chrome’s normal local-storage quota. Existing stored data needs no migration. Retention settings and per-listing cache deletion still apply; this does not remove disk-space limits.
