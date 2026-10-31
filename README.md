# Grocery Tracker

A Windows grocery planner for Meijer, ALDI, and Gordon Food Service in Marion, Ohio. Each store has its own cart. The app never places orders.

## Install

Download the `.exe` from [the latest release](https://github.com/cosmerearchives-creator/Grocery-Tracker/releases/latest). This preview is unsigned, so Windows may display an unknown-publisher message.

## Version 0.10.0

- **Add from link.** Paste a supported store product URL to create linked entries in all three carts at quantity one. The app fills in the name, package size, price, thumbnail and UPC when readable. Missing prices or unreadable pages still produce entries ready for manual completion, with the source link retained. Imported prices carry Needs review. Package size/count stays separate from shopping quantity; GFS case options retain their own zero starting quantity.
- **Verified UPC lookup.** If a checksum-valid barcode is found, the app searches the other stores and checks up to three visible product links per store. It fills an entry only when exactly one checked product page confirms the same UPC/GTIN (including equivalent leading-zero padding). Similar names, missing barcodes and ambiguous results do not count as matches. Blocked or unmatched stores keep their entries and a status explaining what needs filling in. Progress and cancellation are included; cancel retains items already added. Existing manual edits made during matching are preserved. List switching and other batch operations wait until import finishes or is canceled.
- **Meijer shortened codes.** The supplied Meijer cheese page displays `71928313546`. Its main product image independently identifies the full UPC `719283135469`; the reader completes this kind of shortened Meijer code only when the checksum-valid image barcode confirms it. Both the displayed code and the verified full code are retained. A live check confirmed this page’s name, 8 oz size, price, thumbnail and full UPC. This does not guarantee another store carries a Meijer-branded product.
- **Search for Items.** Enter a name or UPC to open all three store searches without an existing cart item. In the store toolbar, Add as new item imports the current product through the same link-import process. Store pages stay open so browsing can continue. Use this price and Save as alternative still work for an existing selected item. Automatic matching uses separate readers with existing store sessions and does not navigate the visible store pages.
- **Compact cart controls.** Removed the static refresh explanation and view-description text. Empty all carts and Show comparisons share the refresh toolbar. The cart starts below a sidebar-green divider with centered Your shopping cart text. Refresh/import progress is shown only when there is an operation to report.

### Sidebar navigation

- **Sidebar carts and totals.** Meijer, ALDI, Gordon Food Service and Total are four clickable sidebar buttons. The first three show the chosen store’s cart; Total opens All carts with comparisons enabled and shows the combined known subtotal. Amounts update when quantities, prices or availability change. The selected cart is highlighted. Selection, price-coverage and review details remain available in the store button’s tooltip.
- **Simpler main area.** Removed the large dashboard store-summary cards and the “Your products, your quantities” instruction banner. List name / New / Save / Load now sit in the header between the introduction and checklist export controls. The duplicate cart tabs in the main area are removed. Store websites and sign-in remain available in an expandable sidebar section. The sidebar scrolls when necessary, and the header adapts to smaller windows.

### Gordon pricing

- **Gordon Food Service single and bulk pricing.** The reader checks the product’s own each/case purchase panels, matching their reorder number to the product URL so recommendation prices are excluded. When both exist, Use this price saves both: the single item is selected initially, while a new case option starts at zero. Save as alternative collects both at zero without replacing the main selection. Both purchase cards stay visible with their own quantity controls and explicit price-per-tub/bag/case labels. Prices are per purchase unit: a case price is counted once per case, without multiplying by the case contents.
- **Refresh and manual lookup.** Price and thumbnail refresh match the saved single/case option individually. Missing or unavailable options retain the previous price and display a review warning. Manual product-link lookup also saves both prices when detected. Saved lists and exports retain the unit labels. A live check of the reported whipped-topping page detected both $5.49/tub and $60.99/case; these are store-session estimates and may change.

### Named lists and categories

- **Shopping list files.** Name the working list, then use Save list to create a `.grocery.json` file containing all store carts, product choices, alternatives, quantities, prices, thumbnail links and categories. New list starts empty; Load list restores a saved file. Working changes continue to autosave locally; saved files change only when explicitly saved again. Save list can also save a copy under another filename.
- **Safe list switching.** New/Load asks for confirmation and saves the previous working list under the app-data `list-backups` directory; the backup path appears beneath the list buttons and can be opened through Load list. Cancel, unreadable files and invalid data leave the current list intact. Older cart JSON files are supported through migration. Store sessions remain signed in. Open store tabs close on a list switch so they cannot save products against the previous list.
- **Categories.** Assign suggested or custom categories on creation or on any item. Linked store rows share the category; quantities and product choices stay independent. Group by category organizes every view alphabetically, with Uncategorized last, and can be toggled off. Store checklists also group the selected products by category. Existing lists start uncategorized.
- **Simpler item cards.** The per-item name/search dropdown and Alternatives & UPC button are removed. Search buttons use the main UPC when supplied, otherwise the item name. Saved product alternatives and their quantities remain available under each store.

### Product images and all-store additions

- **Add to all stores.** The add-item row no longer asks for a cart. New items appear in all three stores with independent quantities, prices and availability. All carts groups each new item once. Existing items are unchanged.
- **Empty all carts.** One button clears every active cart's items, products, alternatives, prices and images after an explicit confirmation. Cancel leaves carts intact. Store sign-ins are retained.
- **Product thumbnails.** Price capture also saves the product image when available. Each main and alternative card shows its own thumbnail beside its details. Existing products can acquire images through refresh.
- **Refresh thumbnails.** Checks saved product links across all carts, including quantity-zero alternatives, after a warning that it may take some time. It has progress and cancellation, retains old images on failures, and does not change prices, selections or quantities. Image reads use product metadata, page-level product images and Meijer’s labeled main gallery, excluding arbitrary recommendation images. Failed/mismatched pages are reported.

### Cart views and prices

- **Store-only cart views.** Clicking a store tab or View cart shows only that store's rows and product options. Show comparisons toggles the side-by-side panels for those same rows. Clicking another specific store returns to store-only mode.
- **All carts.** The button beside the store tabs shows every active store's items with comparisons automatically enabled. Linked rows are grouped once; unrelated items with the same name remain separate. Store membership is labeled. Removing a row from this view names the store being affected. Totals, quantities and exports remain owned by their respective stores.
- **Refresh all prices.** Rechecks saved product URLs across all active carts, including main products, selected alternatives and quantity-zero alternatives. It uses the existing store sessions and separate background readers, preserving the pages open in the store window. Progress, cancellation and a completion summary are included. Items without saved links are reported as skipped.
- **Refresh safeguards.** Quantities and product roles remain unchanged. Changed prices are flagged Needs review. Failed checks retain the previous price, show a per-product error and retain the last successful check time. Links showing a different named product/version are flagged for review rather than silently changing its price. Products edited or removed during the run are skipped. Inactive Walmart rows are never requested. A blocked store stops receiving further requests for that run; other stores continue. No store access restrictions are bypassed.

### Existing cart features

- **Individual quantities.** Every main product and saved alternative has its own minus/quantity/plus control at each store. Main and alternative products can both have positive quantities, as can the same product at multiple stores. Quantity zero keeps an option saved without adding it to the shopping list or total. The universal row-level quantity control is removed.
- **Save as alternative.** The store toolbar has a separate button beside Use this price. It saves the detected product under that item/store at quantity zero, without replacing the main product or changing its quantity. The store tab stays open so you can continue browsing. Use this price saves a main selection and closes only that store tab.
- **Expandable alternatives.** Alternatives (N) reveals saved product cards, prices, package-price differences, review badges and individual quantity controls. A selected-count indicator remains visible when collapsed.
- **Not available at this store.** Each store card can be explicitly marked unavailable. Its selections are excluded from that store's total and export checklist, while an unavailable diagnostic is exported. Clearing the status restores its previously saved quantities. Missing prices and unavailable items remain distinct.
- **ALDI search correction.** Names, UPCs and alternative searches now use `/store/aldi/s?k=...`, preserving the query rather than redirecting with an empty `k`.

- **Comparisons on demand.** Linked prices from Meijer, ALDI and Gordon Food Service appear side by side when Show comparisons is enabled or All carts is selected. Each store retains its own cart and quantities.
- **UPC search.** Add an optional 8, 12, 13 or 14 digit barcode, keeping leading zeros. Search buttons use the main UPC when supplied, for all three stores or just one store. Retailers may vary in barcode search support; a UPC search does not guarantee an exact match.
- **Acceptable alternatives.** Add alternative product names and optional UPCs when creating an item. Existing search details are preserved in saved files. Enter one alternative per line, optionally followed by `| UPC`. Store product alternatives can also be collected using Save as alternative.
- **Saved product options.** Each saved product retains its own price, quantity and review state. Use this price makes a main option; Save as alternative collects an unselected option. Products with positive quantities all count in totals and exports. Removing one price preserves other saved options.
- **Walmart removed.** Walmart is excluded from visible store lists, searches and exports. Previously saved Walmart rows remain stored locally, readable by the upgraded app but inactive.

- **Independent store carts.** New items are added to all three stores. Subsequent products, quantities, sizes and removals apply only to their respective store. The dashboard shows each cart's own subtotal and price coverage. Different carts are not ranked as identical baskets.
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

Online prices are estimates, not guaranteed Marion shelf prices. No invented prices are supplied. Unpriced items stay out of known subtotals and are marked missing. Prices exclude taxes and conditional coupons. Automatic cross-store matching is limited to confirmed UPC/GTIN matches during link imports. General name/brand matching, unit-price normalization, scheduled price refresh, and loyalty-coupon calculation are not implemented. Exact/equivalent matching preferences are stored as guidance for selecting products.

Refresh is a manual batch check, not a guarantee that every website can be read. Retailers may require sign-in or reject background requests. Open the store tab to sign in, or try later; unreadable prices stay saved and flagged. Manually named products whose names do not match the linked product/version need review before an automatic price replacement. Exported selected products with failed checks are labeled PRICE NOT REFRESHED.

## Privacy

Cart files, backups, and retailer sessions stay in the local app-data folder. They are not included in the repository or installers. Product thumbnails are loaded over HTTPS from retailer/image hosts without a referring page URL. No analytics, app account or cloud cart sync is included. The reader examines public product metadata and product-page markup; it does not read passwords, forms, cookies or page storage. Signing into a retailer shares information with that retailer as usual.

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

The v0.6 checks also cover store-only versus comparison views, deduplicated All carts, refresh changes/failures/skips, cancellation, edits during refresh, preservation of existing store pages, blocked-store request suppression, and continued checks at other stores. A live Kraft page was successfully refreshed; a subsequent Meijer request was denied by the retailer and safely retained/flagged. The app reports that restriction rather than trying to bypass it.

The v0.7 checks cover adding linked rows to all three stores, grouping, empty-cart cancellation/confirmation, thumbnail capture and metadata selection, a live Meijer main-gallery fallback, retaining images on failures, and image-only refresh without repricing main or alternative products.

The v0.9 UI checks cover all four sidebar navigation buttons, live store and combined totals after quantity changes, store-only/All carts behavior, removed summary/banner elements, relocated list controls, sign-in links and a 980 × 700 window without horizontal overflow.

The v0.8.1 checks cover Gordon purchase-panel isolation, independent single/case quantities and totals, case-only to dual-option updates, refresh matching and missing-option retention, alternative saving, and both toolbar/manual lookup flows.

The v0.8 checks cover full saved-file round trips, two independent list files, older-format loading, invalid/oversized file rejection, cancellation and working-list backup recovery, category grouping and linked-store edits, removed controls, and restart persistence.

The v0.10 checks cover checksum and leading-zero barcode handling, Meijer shortened-code verification, source-link details and placeholders, exact/false/ambiguous cross-store matches, imports from the current browser page without a selected item, cancellation, blocked/no-UPC pages, preservation of browser tabs, and compact main/store toolbar layouts. The live Meijer source reader was verified; cross-store success/failure scenarios were checked with controlled store-page fixtures, not claimed as guaranteed live matches.

## Far future

User-defined comparison groups are logged as a far-future idea. Their behavior remains unspecified and is not part of this release.
