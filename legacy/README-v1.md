# Leasewise — private beginner property research app

A **fresh-start prototype**, designed around a guided property workflow instead of disconnected notepad-style tools.

## Run
Open `index.html` in a browser, or use VS Code Live Server. No build tools needed.

## What works
- Beginner-first home, discovery, deal analysis, contacts and preferences.
- Live external property *search links* (Google site-search of Rightmove/Zoopla and auctions).
- Save a listing, analyse all-in project costs, affordability and key risks.
- Prepared estate-agent, solicitor and surveyor enquiry drafts using saved property details.
- Browser localStorage persistence and JSON export.

## What is NOT implemented
- No authenticated live listing feed, scheduled search, property auto-import, automated comparables, property images, verified valuations, or solicitor directory API.
- No Firebase, cloud sync, user accounts, email sending, background alerts, or mortgage quotations.
- Lease-extension premiums are **not computed**: enter a professional estimate or consult the official LEASE calculator.
- SDLT must be calculated independently and entered; zero is treated as a missing check.
- Deposit percentages are scenario assumptions, not lender eligibility checks.

## Recommended next engineering phase
1. Vite + TypeScript frontend, Firebase Auth (private allowlist), Firestore, Cloud Functions.
2. Server-side authorised listing provider adapters; ingestion records source URL, licence, observed time and verification status.
3. Comparable sales: HM Land Registry Price Paid data with match-quality scoring and adjustments; never claim an automatic market valuation from unmatched data.
4. Scheduled search jobs with duplicate detection and notification preferences.
5. Property-specific evidence files, solicitor/surveyor directories, quote requests and follow-up reminders.
6. Proper SDLT engine with effective-date tables and transaction circumstances; unit tests and disclaimer.

## References
- https://www.lease-advice.org/lease-extension-calculator/
- https://www.lease-advice.org/lease-extension/flats/getting-started/
- https://developers.zoopla.co.uk/ (public listings API unavailable)
- https://use-land-property-data.service.gov.uk/api-documentation

No personal data or secrets should be committed to GitHub.
