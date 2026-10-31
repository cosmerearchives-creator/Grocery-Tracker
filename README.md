# Grocery Tracker

A local Windows shopping planner for Meijer, ALDI and Gordon Food Service in Marion, Ohio. The app never places orders.

## Install

Download the installer from [the latest release](https://github.com/cosmerearchives-creator/Grocery-Tracker/releases/latest), or use Check for updates in the installed app. Builds are unsigned. Installed builds check for updates on startup and every four hours, then offer a restart after downloading.

## Version 0.12.0 — shopping list versus store carts

**Your Shopping List** is the reusable set of needs: “Whole Milk, Gallon,” “American cheese — 1 pound,” or “Cereal — 3 boxes.” Each need appears once, with its category and independent Needed amount. Click its name to edit it, or edit Needed directly. General names and requirements remain separate from the retailer’s full product titles and selected quantities. The shared needs remain visible when viewing a single store; only the product columns change.

**Store carts** contain specific selected products. Each saved main or alternative product has its own quantity at each store. Quantity 0 keeps an option saved but excludes it from totals and exports. You can select main products and alternatives together, including products from several stores for the same need.

- **Empty all carts** now resets all active store product quantities to 0. It preserves the shopping list, Needed amounts, categories, saved products, alternatives, prices, thumbnails and links. Its confirmation explains this. The button matches the sidebar styling.
- **Delete** at the top-right of a list entry removes that whole need and its associated store product options. It does not remove unrelated entries with the same name.
- **Add to List** creates one need, not three store-labeled list items. Recognized store/brand prefixes are removed from the suggested general name. Review and edit the name and Needed amount before confirming. Suggestions are not guaranteed to be suitable for every product.
- Detected source and exact-UPC product options are saved at quantity 0. **Use this price** selects the store’s full product title; **Save as alternative** collects an unselected option. Neither changes the general list name. Browser selectors show one choice per list entry, without duplicated store suffixes.
- Existing imported names and search UPCs upgrade without changing selected quantities or full product titles. A timestamped local working-file backup is made before changed data is saved. Saved-list files also support the upgrade when loaded.

### Milk UPC correction

The reference Meijer milk page displays UPC `4125010200`. That displayed value is now retained unchanged for display and retailer searches. The app does not append the image barcode’s check digit to the search value. A separate checksum-valid full GTIN can still be retained for exact-match verification, when confirmed by product metadata or the primary image. Older imported entries with a recorded displayed UPC are repaired automatically.

A live check of the supplied milk link returned general name “Whole Milk, Gallon,” full product title “Meijer Whole Milk, Gallon,” Needed suggestion “1 gallon,” and displayed UPC `4125010200`.

## Adding and choosing products

**Add from link** reads a supported product page, then presents an editable general name and Needed suggestion before adding to the list. Product name, size, price, image and barcode are filled in when available. Unreadable pages still allow a general need to be created, with its source link retained for manual completion.

**Search for Items** opens simultaneous searches at all three retailers in one tabbed store window. Open a product and choose **Add to List** to review its general name in the main app, without requiring an existing list entry. The browser page stays open. To attach a product to an existing need, select that need in the toolbar and use **Use this price** or **Save as alternative**.

When a verified barcode is available, import checks up to three product links at each other store. Searches use the original displayed code. Automatic attachment requires exactly one checked page confirming the same full UPC/GTIN, allowing equivalent leading-zero padding. Matching by a similar name alone is not sufficient. Blocked, missing or ambiguous matches leave a fillable store panel for the existing need; they do not create another list entry. Import has progress and cancellation, and manual edits are preserved.

Select Marion within each retailer. Store sessions are persistent and separate from your normal browser. Retailers may require sign-in, verification or reject automated/background requests. The app does not bypass restrictions. Automatic matching is best effort and does not guarantee another retailer carries a store-brand product.

## Organizing and saving

- **Categories:** choose a suggested or custom category. Linked store options share the list entry’s category. Group by category organizes needs alphabetically, with Uncategorized last.
- **Sidebar:** select a store to show its product options, enable Show comparisons for other stores, or select Total for all product columns. Totals are known estimates, not a guarantee that every need is fulfilled.
- **New / Save / Load list:** named `.grocery.json` files preserve needs, Needed amounts, products, quantities, prices, images and categories. The working copy autosaves locally; external files change only on explicit Save. New/Load confirms switching and backs up the previous working list. Invalid files and cancellation preserve current work.
- **Copy store cart / Save cart checklist:** exports only positive-quantity selections for the chosen store, grouped by category. Paste into Google Docs or Keep for phone use. There is no direct Google account integration.

## Prices and alternatives

Use each product’s own minus/plus control. Automatically detected prices carry Needs review; review or edit a saved product by clicking its full name. Mark reviewed clears its review badge without converting an online estimate into a verified shelf price.

**Gordon Food Service** lists single-item and bulk/case purchase options separately when its page exposes both. Each has its own price and quantity. A case is charged once per selected case, not multiplied again by its contents. Both options remain visible.

**Not available at this store** excludes that store’s selections from its total/export without deleting saved options. Clearing the status restores them.

Price and thumbnail refresh are inside the collapsed **Store websites / sign in** sidebar section. Both use saved product links and existing sessions, preserving visible browser pages. Failed checks retain old data and report the problem. Changed prices need review. A link resolving to a different product/version does not silently replace a saved price. Thumbnail refresh warns that it may take time and does not change prices or quantities. Batch operations include progress and cancellation.

## Limits and privacy

Online prices are estimates, not guaranteed Marion shelf prices. Taxes, conditional coupons, automatic unit conversion/fulfillment calculation, scheduled refresh and general cross-brand matching are not implemented. Needed is an editable planning amount; it is not automatically converted into product quantities.

Cart files, backups and sign-ins stay on this computer and are not bundled in releases. Product images load from HTTPS retailer/image hosts without a referring page URL. There are no analytics, cloud cart sync or app accounts. Readers inspect public product markup and metadata; they do not read passwords, cookies, forms or page storage. Inactive historical Walmart data remains hidden and is not searched or refreshed.

## Development and release

Requires Node.js 24 and pnpm 11.25.0:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
pnpm test
pnpm start
pnpm dist
```

Bump package.json, commit and push the matching version tag. GitHub Actions tests and packages Windows builds; tags publish the installer, blockmap and latest.yml. Main pushes build artifacts without publishing an update. No GitHub token is bundled in the app.

## Validation

61 unit tests cover list/cart separation, quantity reset without deletion, entry-wide Delete, generic naming, requirement independence, saved-file round trips and migration, UPC search versus verified GTIN, safe matching, per-product totals, GFS each/case pricing, refresh protection, and legacy data.

Isolated Windows checks verify legacy backup/migration, editable import previews from links and browser pages, one browser target per need, exact raw milk UPC search URLs, full product titles, zero-quantity product options, Empty/Delete behavior, save/load and restart persistence. A live source-page check verified the milk reference; cross-store matching scenarios use controlled fixtures and are not claimed as guaranteed live matches.

## Far future

User-defined comparison groups remain logged as a far-future idea; their behavior has not been specified.
