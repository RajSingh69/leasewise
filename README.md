# Leasewise

Private research platform for UK short-lease flat investments, starting with Woking, Surrey. It takes a listing from discovery through comparable sales, lease-extension cost, a full financial model and a conservative risk verdict, then helps you act with property-specific correspondence and tasks.

Leasewise gives research estimates, not financial, legal or valuation advice.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # domain unit tests (Vitest)
npm run build      # type-check + production build to dist/
```

With no Firebase variables set, the app runs in **local mode**: data stays in this browser (`localStorage` key `leasewise-v2`). Use Settings → Export backup regularly. Settings → Import backup also accepts the v1 prototype's `leasewise-backup.json`.

## What works

| Area | What it does | Data source |
| --- | --- | --- |
| Discover | Paste a listing URL + text; extracts price, lease, ground rent, service charge, bedrooms, floor area, postcode, retirement / shared-ownership / auction wording. De-duplicates by portal listing ID, URL and normalised address. CSV import. Saved searches open pre-filled portal searches and filter tracked properties. | User-supplied |
| Comparables | Completed flat sales near the postcode, restated to today with UK HPI, sized with EPC floor areas where an address match is reliable, scored and selected with reasons. Value with current lease vs long lease, confidence level and a plain-English explanation. | HM Land Registry Price Paid + UK HPI (SPARQL), postcodes.io, EPC register (optional) |
| Lease | Lease banding, marriage value, mortgageability notes, extension routes, legal-status register (in force / not commenced / proposed / uncertain). Indicative premium range using the 1993 Act structure (term + reversion + 50% marriage value). | legislation.gov.uk, GOV.UK, LEASE |
| Money | Acquisition (with effective-dated SDLT), extension, works, holding, sale, rental, refinance. Best / base / worst scenarios, sensitivity, provenance on every figure. | Your inputs + planning allowances |
| Risk | Statuses: worth investigating / more information needed / high risk / unaffordable. Explained flags with actions. Unknown critical costs never produce a positive verdict. | — |
| Letters | 10 templates populated from the deal; copy, email draft, download, log, follow-up tasks. | — |
| Professionals | Your own verified shortlist with register links (SRA, RICS, FCA, etc.), quotes, comparison, "use in model". | User-entered |
| Next Actions | Tasks, viewings, deadlines, auctions, and suggested next steps from each deal's risk flags. | — |

Every figure is tagged **Verified / Quote / Agent claim / Calculated / Your estimate / Assumption / Missing**.

## Not implemented (deliberately)

- **No portal scraping.** Rightmove and Zoopla have no open listing API and prohibit scraping. Automatic discovery needs a licensed feed; the adapter interface is in `functions/src/providers.ts` and the scheduled runner in `functions/src/index.ts`.
- Land Registry data has no bedrooms, condition or lease length. Lease status of each comparable must be verified by you; until then valuations are capped at low confidence.
- Rental estimates, EPC floor areas (needs an EPC API key), professional directory feeds, email sending, payments and subscriptions.
- The premium is indicative. Relativity uses an approximate published-graph band. Always get a specialist RICS valuation.

## How valuations work

1. **Evidence**: completed flat sales from HM Land Registry (standard transactions only; asking prices are never used).
2. **Time adjustment**: each price × (UK HPI now ÷ HPI at sale), using the local-authority flat/maisonette series with a trailing 3-month average (falls back to all-property, South East, England). No future growth is assumed.
3. **Floor area**: EPC certificates are matched to sales only on the same postcode **and** flat number **and** building. Weaker matches are shown as uncertain and used only if you approve; ambiguous ones are never used automatically.
4. **Exclusions**: new builds, non-flats, sales you mark as short leases, and statistical outliers (Tukey fences on price or £/m²), each with a stated reason.
5. **Selection**: quality score (distance, recency, type, size similarity, verified long lease). The best ≤10 sales scoring 45+ are used; with fewer than 3, the best available are used as **provisional**; with fewer than 3 at all, no valuation is produced.
6. **Range**: weighted 25th–75th percentile of £/m² (× this flat's area) or of adjusted price, widened to at least ±5–12.5% for small samples.
7. **Confidence**: good / moderate / low / provisional / insufficient. Unverified comparable leases cap it at *low*, and a weak automated valuation keeps the property at **More information needed** whatever the profit figure says. Worst-case resale uses the bottom of the range. A professional valuation (Money → Resale value, basis Quote/Verified) always replaces the automated figure.

### EPC floor areas (optional, free)

The EPC register API needs a free token and blocks browser requests, so Leasewise calls it through a proxy:

1. Sign in at <https://get-energy-performance-data.communities.gov.uk> with GOV.UK One Login and copy your bearer token from *My account*.
2. Local: add `EPC_API_TOKEN=...` to `.env.local` (no `VITE_` prefix, so it's never bundled) and restart `npm run dev`.
3. Production: `firebase functions:secrets:set EPC_API_TOKEN`; set the `ALLOWED_EMAILS` param; deploy. Hosting routes `/api/epc/**` to the `epcProxy` function, which only serves signed-in allow-listed users.

Public lookups are cached in the browser (Price Paid 24 h, HPI 7 days, EPC 7–30 days, postcodes 30 days). Each run is capped at 25 EPC postcode searches and 60 certificate fetches.

Live API checks: `LIVE=1 npx vitest run src/providers`.

### Lease lengths of comparables

HM Land Registry's **Registered Leases** dataset has the date and term of every registered lease, but only as a monthly bulk CSV for account holders. It's free for personal / non-commercial use; business use needs a commercial licence. There's no API. Settings → *Lease lengths* streams the downloaded CSV in the browser, keeps only the chosen postcode districts (IndexedDB) and parses the free-text term. Comparables are matched with the same strict address rules as EPC. Only the lease in force at the sale date counts: 90+ years = long, under 80 = short. Uncertain matches need your approval; unreadable terms are shown, never guessed. Without the file, mark sales long or short yourself and record how you checked.

### Search coverage

postcodes.io returns at most 100 postcodes per lookup, so the search area is tiled and only saturated tiles are subdivided, nearest first, within 30 lookups. Sales are queried in chunks; the 150 best-matched are kept, and the valuation still uses only the strongest few.

## Discovery

Every source produces listing records that go through one `ingest()` path (`src/domain/discovery.ts`): de-duplication against tracked deals and the inbox (portal ID, URL, normalised address), new-listing and price-change detection (with history), short-lease signals (lease length plus wording such as "cash buyers only"), saved-search matching and provenance/timestamps.

| Source | Status |
| --- | --- |
| Paste one listing | Working |
| Paste a portal / auction **alert email** (your own email) | Working — extracts every listing link with nearby price/address |
| CSV export (re-import detects price changes) | Working |
| Licensed feed on the server (`functions/src/providers.ts`) | Interface ready; writes to `users/{uid}/incoming`, ingested on next load. No provider connected (no free, authorised listing API exists). |

Dismissed listings come back to the inbox if their price drops.

## Firebase (optional, private beta)

1. Create a Firebase project, enable Google sign-in and Firestore.
2. Copy `.env.example` to `.env.local` and fill in the `VITE_FIREBASE_*` values and `VITE_ALLOWED_EMAILS`.
3. Put the same email(s) in `firestore.rules`.
4. Copy `.firebaserc.example` to `.firebaserc` with your project ID, then run `npm run build`, then `firebase deploy`.

Data model: `users/{uid}` (settings) with subcollections `deals`, `tasks`, `professionals`, `quotes`, `letters`, `searches` and a server-written `inbox`. Every record carries `ownerId`, so shared workspaces can be added later without a rewrite.

## Layout

```
src/domain/     pure, tested logic: sdlt, lease, comparables, finance, risk, letters, listing
src/data/       store, local + Firestore repositories, v1 migration
src/providers/  Land Registry, postcodes.io, listing sources / CSV
src/pages/      Home, Discover, Deals, Deal (tabs in pages/deal/), Actions, Professionals, Settings
functions/      Cloud Functions: scheduled saved-search runner + licensed provider adapters
legacy/         the original single-file prototype
```

Legal and tax tables were last reviewed on 14 Oct 2026 (`LEGAL_CHECKED`, `SDLT_CHECKED`). Re-check them when the law changes.
