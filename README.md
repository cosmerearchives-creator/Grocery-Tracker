# Grocery Tracker

A Windows grocery planner for Meijer, ALDI, Walmart, and Gordon Food Service in Marion, Ohio. Each store has its own cart. The app never places orders.

## Install

Download the `.exe` from [the latest release](https://github.com/cosmerearchives-creator/Grocery-Tracker/releases/latest). This preview is unsigned, so Windows may display an unknown-publisher message.

## Version 0.3.0

- **Independent store carts.** Select a store before adding an item. Products, quantities, sizes and removals apply only to that store. The dashboard shows each cart's own subtotal and price coverage. Different carts are not ranked as identical baskets.
- **Use this price saves automatically.** Open a product in a store tab and click the button. Its detected product, package, URL and price save directly to that store's cart, one package per cart quantity. The main cart updates without a confirmation dialog or being brought forward.
- **Needs review.** Automatically saved prices enter totals immediately and carry a badge. Review/edit the price later or click Mark reviewed. Marking reviewed does not turn an online estimate into a verified shelf price. Exports include review flags.
- **Only the used tab closes.** Saving a price closes that store's tab and preserves the other pages and their sessions. The store window stays open even after the final tab is completed. A new search reopens all four tabs. Failed lookup or saving leaves the tab open.
- **Meijer main-price fallback.** When selected-option or product-price metadata is absent, the reader checks the main Product pricing information panel associated with Add to Cart. It excludes header totals, recommendations, unit prices and crossed-out prices. Tested on the live Bob's Red Mill Nutritional Yeast, 5 oz page at $7.79 and Kraft Singles, 24 slices / 16 oz at $4.89. Prices can change or vary by store.
- **Separate exports.** Choose a store and copy its checklist into Docs/Keep, or save a text file. Other stores' items are excluded. There is no direct Google account integration.
- **Automatic app updates.** Installed Windows builds check GitHub Releases on startup and every four hours, download updates, and offer a restart to install. Manual checking is included. Failed checks do not block the cart.

## Searching stores

Search all 4 stores opens four concurrent searches in one window. Select Marion within each retailer; the app does not override store location. Each tab has its own persistent sign-in session, separate from your normal browser. Back and Reload are included. Stores may restrict embedded sign-in or require verification; the app does not bypass those restrictions.

The toolbar identifies the cart item being searched. Clicking Use this price on a different retailer creates an independent entry in that retailer's cart, or updates that item's previously created entry there. It does not create empty entries in every store. Quantities can then be edited independently. Use this price counts as accepting that retailer's currently selected product version; no checkout button on the store site is clicked.

You can also enter or edit a price manually. The price dialog allows package-count adjustment, source selection, and a product-link lookup. Manually saved/reviewed prices clear the review badge.

## Upgrading an older cart

The app automatically converts the old shared list into independent store entries. Existing priced entries are split into their respective stores with product details and quantities intact. Unpriced shared rows are kept once in Meijer's cart. A timestamped `cart.json.before-store-carts-*` backup preserves the original file in the app's local data folder. Sign-in sessions are unchanged.

## Limits

Online prices are estimates, not guaranteed Marion shelf prices. No invented prices are supplied. Unpriced items stay out of known subtotals and are marked missing. Prices exclude taxes and conditional coupons. Automatic cross-store product matching, unit-price normalization, scheduled price refresh, and loyalty-coupon calculation are not implemented. Exact/equivalent matching preferences are stored as guidance for selecting products.

## Privacy

Cart files, backups, and retailer sessions stay in the local app-data folder. They are not included in the repository or installers. No analytics, app account or cloud cart sync is included. The reader examines public product metadata and product-page markup; it does not read passwords, forms, cookies or page storage. Signing into a retailer shares information with that retailer as usual.

## Development and release

Requires Node.js 24 and pnpm 11.25.0:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm test
pnpm start
pnpm dist
```

Change the version in package.json, commit, and push a matching version tag. The Windows workflow runs tests and publishes the installer, blockmap and latest.yml through GitHub Releases. Main-branch pushes produce build artifacts without publishing an update. No GitHub token is bundled with the app. Update checking and downloads have been verified from an older packaged build; the final restart/install step has not yet been tested end to end.

## Validation

Unit tests cover migration, store isolation, totals, exports, review state, variant selection and Meijer fallback safeguards. Windows UI checks cover automatic saving, tab-only closure (including the last tab), failed-lookup behavior, independent quantities and exports, review clearing, restart persistence, and upgrading an actual old-format cart with an untouched backup.

## Far future

User-defined comparison groups are logged as a far-future idea. Their behavior remains unspecified and is not part of this release.
