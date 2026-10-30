# Grocery Tracker

A Windows grocery comparison cart for Meijer, ALDI, Walmart, and Gordon Food Service in Marion, Ohio. Your cart is visual only: the app never submits an order.

## Install

Download the **Grocery Tracker Setup** `.exe` from [Releases](https://github.com/cosmerearchives-creator/Grocery-Tracker/releases/latest). Run the installer, then open Grocery Tracker. This first release is unsigned; Windows may display a publisher/reputation warning.

## Version 0.2

### 0.2.2 product autofill

The store window now has **Use this product** instead of copying a link. Search from a cart item, open a product in a store tab, and click the button: the app detects the displayed price, brings the cart forward, and fills that item's price dialog with the product, package, URL and detected price. Review and save to include it in totals. A cart-item selector in the store toolbar lets you change which item receives the result. Failed lookup leaves existing cart prices unchanged.

### 0.2.1 lookup fix

Meijer pages with prices in visible selected-version controls are now supported even when product-price JSON-LD is absent. The reader matches the selected controls to the page's product ID, excludes other flavors/sizes and struck-through prices, and includes the selected package size. Lookup preserves an already-open identical product URL and retries missing data for up to 12 seconds while the page loads. Verified on the live Kraft Singles 24-slice / 16-ounce page at $4.89; prices remain store-dependent estimates.

- Starter cart: Kraft American Singles, regular Red Bull 16 fl oz, gallon Vitamin D whole milk, and sharp cheddar shredded cheese.
- Add/remove groceries, adjust quantities and sizes, and choose exact-brand or comparable-brand matching. Matching preferences are recorded for your comparison; automatic cross-store product matching is not implemented yet.
- Enter each store's package price and number of packages needed per cart quantity. This accounts for different package sizes. Unit-price normalization is planned, not implemented yet.
- See four store subtotals and price coverage. Only complete carts can receive the lowest-total badge. Estimates exclude tax and conditional coupons.
- **Search all 4 stores** on each cart item opens concurrent searches in one store window, with Meijer, ALDI, Walmart, and Gordon Food Service tabs. These are the stores' own search results, not automatically matched price results. Each tab keeps its own persistent browser session, separate from your normal browser. Use **Sign in / choose Marion** to select your local store. Embedded sign-in or store automation may be blocked by the retailer; there is no bypass.
- Store tabs include Back, Reload and **Use this product**. Find a product and click the button to detect its price and autofill the selected cart item's price dialog. You can still paste product links manually in a price dialog.
- Experimental product lookup uses the default version on the linked page. It distinguishes variants using product/offer links, the primary product name, selected options, or product-specific current-price metadata. It never chooses an arbitrary first or cheapest size. If the default cannot be identified, enter the displayed price manually. It does not read passwords, credentials, cookies or browser storage. You must confirm product, package count, availability and Marion location before saving.
- Copy a full shopping checklist to paste into Google Docs/Keep, or save a text file. Direct Google account integration is not included.
- Cart saves automatically on your computer.
- Installed Windows app checks GitHub Releases on startup and every four hours, downloads updates, and offers **Save & restart to update**. Manual update check is also included. Update failures do not block the cart.

## First-version limits

There are **no prefilled or invented local prices**. A fetched website price is an online estimate, not proof of a Marion shelf price. Consolidated search results inside the cart, scheduled price refresh, automatic equivalents, loyalty coupons, and guaranteed access to every store are not implemented. Store searches may require sign-in, location selection, or verification before showing results. If lookup cannot identify the default available version, enter the price manually. Store locations and package sizes must be checked on the actual store page. Changing an item's size or matching preference clears previous offers to avoid stale comparisons.

The first published release supplies the update feed. Development runs do not update themselves. Publishing code alone does not release an update. Release filenames use explicit hyphens so GitHub upload names match the updater metadata. Verification: packaged v0.1.0 successfully discovered and downloaded the published v0.1.1 installer and displayed the restart action. The final restart/install step has not yet been tested end to end.

## Privacy

Cart data and store browser sessions live in Electron's local user-data folder (normally `%APPDATA%/Grocery Tracker`). Neither is included in this repository or release packages. No analytics, app account, checkout integration or cloud cart sync is included. Signing into a store shares information with that store as usual. Do not commit browser profiles, cookies, receipts, credentials or personal carts.

## Development

Requires Node.js 24 and pnpm 11.25.0:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm test
pnpm start
pnpm dist
```

## Release updates

1. Change `version` in `package.json` and update the lockfile if dependencies changed.
2. Push the code and a matching tag, e.g. `v0.1.1`.
3. The Windows workflow tests, packages and publishes the installer, blockmap and `latest.yml` to GitHub Releases using the workflow's built-in token. No GitHub token is bundled in the app.
4. Confirm the release assets exist and test an older installed version updating to it. Keep the installer, blockmap and metadata from the same build together.

Main-branch pushes also produce downloadable Windows build artifacts without publishing an app update.

## Later

Reliable automated local prices and refresh, unit-price comparison, richer equivalent-product matching, and convenient checklist exports. Far future: user-defined comparison groups; behavior remains unspecified until the user describes it.
