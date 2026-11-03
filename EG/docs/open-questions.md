# Open questions

| # | Topic | Question | Owner | Decision |
|---|-------|----------|-------|----------|
| 1 | Brand | Navy hex | — | **resolved** `#012864`, measured from logo pixels + site theme |
| 2 | Fonts | Official Arabic face is **Somar Rounded** — need licensed files (Poppins is Google, fine) | Client | pending |
| 3 | Stats | “1” on the site is the pre-animation value; real: 25+ yrs / 100+ workers / 5000 clients / 500 projects | Client | **partly resolved** — confirm the figures are accurate |
| 4 | ERP | Which modules ship in v1? | Product | pending |
| 5 | Auth | Roles & permissions matrix? | Product | pending |
| 6 | Units | Stock units (pcs / m² / kg)? | Ops | pending |
| 7 | Currency | EGP only or multi-currency (Oman / GCC)? | Finance | pending |
| 8 | Catalog | PDF / ecommerce depth vs ERP SKUs? | Sales | pending |
| 9 | Mobile | Offline requirements? | Mobile | pending |
| 10 | Badges | Meaning of badges | — | **resolved** ISO 14001 · ISO 9001 · Made-in-Egypt quality mark |
| 11 | Documents | Tax registration no. + commercial register no. for the PDF header (placeholders now) | Finance | pending |
| 12 | Documents | Is e-invoicing (tax authority QR) required on invoices? Template reserves a QR slot | Finance | pending |
| 13 | Documents | Official stamp / signature images, and whether documents are Arabic-only or bilingual | Client | pending |
| 14 | Documents | Numbering scheme (INV-/DN-/WO-/ST-/PS- prefixes used in samples are placeholders) | Ops | pending |
| 15 | Mobile auth | Login id: keep email + password (current EG-Mobile) or switch to phone / employee code? Who resets a password, and do we add self-service recovery? | Product / IT | pending |
| 16 | Mobile auth | Is biometric / PIN quick-unlock (phase 2) allowed on all devices? Session length and auto-lock timeout? | IT | pending |
| 17 | Mobile notifications | Push provider: FCM (+ APNs for iOS) for the Flutter app? Affects channels and notification action buttons | Mobile | pending |
| 18 | Mobile notifications | Which events are `urgent` vs `action` vs `info` (business decision, per module)? Quiet-hours default | Ops | pending |
| 19 | Mobile | Supervisor devices: Android-only or iOS too? Minimum OS version; shared devices between shifts? | Ops | pending |
| 20 | Mobile palette | EG-Mobile and EG-System use forest-green `#1A4A36` + brass `#A67C42`; the logo is red `#ED1C24` + navy `#012864`. Adopt the brand palette in both apps (recommended)? | Client / Design | **decision needed** |
| 21 | Mobile nav | Bottom bar: Home · Sales · Production · Stock · More (recommended) vs current 4 tabs + drawer? | Product | **decision needed** |
| 22 | Mobile roles | Roles `admin` / `sales`: hide cost + finance from `sales`? Can `sales` confirm orders from a notification? | Product | pending (see 5) |
