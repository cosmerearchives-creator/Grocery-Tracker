# Grocery Tracker

A Windows grocery planner for Meijer, ALDI, and Gordon Food Service in Marion, Ohio. Each store has its own cart. The app never places orders.

## Install

Download the `.exe` from [the latest release](https://github.com/cosmerearchives-creator/Grocery-Tracker/releases/latest). This preview is unsigned, so Windows may display an unknown-publisher message.

## Version 0.5.0

- **Individual quantities.** Every main product and saved alternative has its own minus/quantity/plus control at each store. Main and alternative products can both have positive quantities, as can the same product at multiple stores. Quantity zero keeps an option saved without adding it to the shopping list or total. The universal row-level quantity control is removed.
- **Save as alternative.** The store toolbar has a separate button beside Use this price. It saves the detected product under that item/store at quantity zero, without replacing the main product or changing its quantity. The store tab stays open so you can continue browsing. Use this price saves a main selection and closes only that store tab.
- **Expandable alternatives.** Alternatives (N) reveals saved product cards, prices, package-price differences, review badges and individual quantity controls. A selected-count indicator remains visible when collapsed.
- **Not available at this store.** Each store card can be explicitly marked unavailable. Its selections are excluded from that store's total and export checklist, while an unavailable diagnostic is exported. Clearing the status restores its previously saved quantities. Missing prices and unavailable items remain distinct.
- **ALDI search correction.** Names, UPCs and alternative searches now use `/store/aldi/s?k=...`, preserving the query rather than redirecting with an empty `k`.

- **Every remaining store option is visible on each item.** Linked prices from Meijer, ALDI and Gordon Food Service appear side by side. Each store retains its own cart and quantities. Empty options do not add items to another store until a price is saved there.
- **UPC search.** Add an optional 8, 12, 13 or 14 digit barcode, keeping leading zeros. Select the UPC from the item's search menu to search all three stores, or just one store. Retailers may vary in barcode search support; a UPC search does not guarantee an exact match.
- **Acceptable alternatives.** Add alternative product names and optional UPCs when creating an item, or use Alternatives & UPC on an existing item. Enter one alternative per line, optionally followed by `| UPC`. Choose which name or UPC to search from the item's menu.
- **Saved product options.** Each saved product retains its own price, quantity and review state. Use this price makes a main option; Save as alternative collects an unselected option. Products with positive quantities all count in totals and exports. Removing one price preserves other saved options.
- **Walmart removed.** Walmart is excluded from visible store lists, searches and exports. Previously saved Walmart rows remain stored locally, readable by the upgraded app but inactive.

- **Independent store carts.** Select a store before adding an item. Products, quantities, sizes and removals apply only to that store. The dashboard shows each cart's own subtotal and price coverage. Different carts are not ranked as identical baskets.
- **Use this price saves automatically.** Open a product in a store tab and click the button. Its detected product, package, URL and price save directly to that store's cart, one package per cart quantity. The main cart updates without a confirmation dialog or being brought forward.
- **Needs review.** Automatically saved products carry a badge. Positive quantities enter totals immediately; quantity-zero alternatives do not. Review/edit any product later or click Mark reviewed on that product. Marking reviewed does not turn an online estimate into a verified shelf price. Exports include review flags for selected products.
- **Only the used tab closes.** Use this price closes that store's tab and preserves the other pages and their sessions; Save as alternative keeps the tab open. The store window stays open even after the final tab is completed. A new search reopens all three tabs. Failed lookup or saving leaves the tab open.
- **Meijer main-price fallback.** When selected-option or product-price metadata is absent, the reader checks the main Product pricing information panel associated with Add to Cart. It excludes header totals, recommendations, unit prices and crossed-out prices. Tested on the live Bob's Red Mill Nutritional Yeast, 5 oz page at $7.79 and Kraft Singles, 24 slices / 16 oz at $4.89. Prices can change or vary by store.
- **Separate exports.** Choose a store and copy its checklist into Docs/Keep, or save a text file. Other stores' items are excluded. There is no direct Google account integration.
- **Automatic app updates.** Installed Windows builds check GitHub Releases on startup and every four hours, download updates, and offer a restart to install. Manual checking is included. Failed checks do not block the cart.

## Searching stores

Search all 3 stores opens concurrent searches in one window. Select Marion within each retailer; the app does not override store location. Each tab has its own persistent sign-in session, separate from your normal browser. Back and Reload are included. Stores may restrict embedded sign-in or require verification; the app does not bypass those restrictions.

The toolbar identifies the cart item being searched. Clicking Use this price on a different retailer creates an independent entry there, or updates that item's main product. Existing alternative quantities remain independent. When replacing a main product with a new main product, the previous main becomes an alternative at zero quantity. You can then select both using their individual controls. No checkout button on the store site is clicked.

You can also enter or edit a price manually. The price dialog allows package-count adjustment, source selection, and a product-link lookup. Manually saved/reviewed prices clear the review badge.

## Upgrading an older cart

The app automatically upgrades old shared or independent-store lists. Previously selected products keep their existing quantities; other saved options become alternatives at zero quantity so they are not accidentally added to the budget. Existing unpriced planned quantities are retained. Old shared rows are split by store, with unpriced rows kept once in Meijer's cart. A timestamped `cart.json.before-store-carts-*` backup preserves the original file. Inactive Walmart data and sign-in sessions are preserved.

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

Unit tests cover migration, independent product quantities and totals, store isolation, exports, unavailable status, review state, variant selection, Meijer fallback safeguards, and the ALDI name/UPC route. Windows UI checks cover Save as alternative, expansion/collapse, simultaneous main/alternative and multi-store quantities, quantity-zero export exclusion, unavailable/clear behavior, tab-only closure, restart persistence, and upgrading an actual v0.4 cart with an untouched backup.

## Far future

User-defined comparison groups are logged as a far-future idea. Their behavior remains unspecified and is not part of this release.
