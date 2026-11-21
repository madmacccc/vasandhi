# Golden Ledger — Pawn Management

A Supabase-backed pawn billing application for Sri Vasanthi Jewellery Pawn Broker, with a local SQLite cache and offline write queue. The interface provides Tamil/English switching, a pawn-entry form with a live A4 receipt preview, searchable ticket ledger, payment collection/history, full-settlement redemption, and JSON backup/restore.

The pawn-ticket form also captures the receipt's estimated article value and the customer's declared average monthly income. It includes a signature pad; saving requires the customer's consent. Signature images are encrypted with AES-256-GCM using a random key stored in the operating-system credential store in Tauri or IndexedDB in the browser, and are decrypted only to print a receipt. The thumbprint option shown on the paper form is not captured digitally. If the key is removed or lost, a previously encrypted signature cannot be recovered.

> **Scope and readiness:** This is not yet a production-complete shop system. Supabase Auth and sync are implemented for customers, pawn tickets, payments, shop settings and audit records. Browser and Tauri installations each maintain a device-local SQLite cache/outbox; pending changes sync when the signed-in user reconnects. User/role administration, customer photo/ID management, thermal-printer integration, advanced report/export formats, and Windows installer verification are not implemented. A4 black-and-white pawn receipts can be printed from the preview or ledger. JSON restore requires an empty local ledger and should be used only after confirming the cloud ledger is empty. Test and retain backups independently before relying on them. The interface follows the supplied admin reference, and the traditional receipt is a responsive reconstruction rather than a pixel-exact copy. Do not use this build as the sole record system for real financial operations until the remaining security controls and acceptance testing have been completed.

## Requirements

- Node.js 20.19+ or 22.12+
- Rust stable, Cargo and the platform prerequisites for Tauri 2
- On Windows, Visual Studio C++ Build Tools and WebView2 Runtime
- Supabase project with email/password authentication enabled

## Run locally

```sh
npm install
npm run test
npm run tauri dev
```

`npm run dev` starts the browser version at `http://localhost:5173`. Browser records are cached as SQLite (sql.js/WebAssembly) in IndexedDB for the same browser profile and origin. Tauri saves `gold-pawn-pro.db` in its application data directory. Each installation keeps its own offline cache; Supabase is the shared source of truth and pending local changes are synchronized after sign-in and when connectivity returns. Use the app's JSON backup and restore controls for manual transfers.

The browser version encrypts signatures with Web Crypto and stores its non-exportable key in IndexedDB; it requires HTTPS or localhost. This protects the signature value at rest from casual inspection but does not protect it from malicious scripts running in that browser origin. Clearing browser site data, changing profiles, or changing the origin removes access to the local records and encryption key. Back up browser data before clearing site storage. Browser storage quotas and eviction are controlled by the browser.

## Financial calculation behavior

Money is stored as integer paise. Gold weights are stored to three decimal places in grams. Each ticket records the annual rate agreed for that ticket; the initial shop default is 16% p.a. The interest helpers support:

- Daily simple interest using an explicit 360- or 365-day basis.
- Monthly simple interest prorated within actual calendar months.
- Annual simple interest prorated within actual calendar years.

The initial default is daily/365. These are explicit calculation options, not a claim that one method or rounding rule is legally or commercially universal. Have the shop approve the applicable method, day-count basis, payment allocation and rounding terms before use. Current payment allocation applies accrued interest first and then principal. A settlement must match the displayed balance; SQLite validates the local write and the Supabase function records payment plus redemption atomically.

## Supabase setup

1. Create a Supabase project and review the RLS policies in `supabase/schema.sql` with the shop's data-protection and access-control requirements.
2. Apply migrations in order: `20261116000000_initial_schema.sql`, `20261116000100_record_payment.sql`, then `20261121000000_fix_bootstrap_shop.sql`. Alternatively, apply the full `supabase/schema.sql` to a new project.
3. Enable email/password in Supabase Auth. Configure email confirmation according to the shop's onboarding needs.
4. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` and the project's **anon/publishable** key. Never add a service-role key to this repository, frontend, or desktop bundle.
5. Start the app and create the first account. It creates a shop and admin membership; sign in with that account on other devices to access the same cloud ledger.

The local SQLite outbox tracks customer, ticket, payment and audit changes. Payment plus redemption is sent through a database function so settlement and ticket closure are atomic. Cloud errors are shown in the app; queued changes remain on that device until sync succeeds. A device cache is pinned to one shop to prevent one account from uploading another shop's offline data. The local cache and signature-encryption key are device/profile-specific, so signatures encrypted on one device cannot be decrypted on another.

## Windows installer

On a Windows machine with Rust and Tauri prerequisites installed:

```powershell
npm install
npm run test
npm run tauri build
```

Tauri is configured to emit NSIS and MSI bundles under `src-tauri/target/release/bundle/`. Installer signing, icon assets, reliable migration/upgrade testing, thermal-printer models and end-to-end Windows acceptance are still required before distribution.

## Privacy

The current customer form deliberately does not collect Aadhaar or other government ID numbers; secure encrypted ID storage and key management have not been implemented. The local SQLite cache is not encrypted. Restrict access to the device account and make verified backups; do not treat the local file as protected customer-data storage.
