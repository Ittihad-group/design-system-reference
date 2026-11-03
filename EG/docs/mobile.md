# Mobile app — design reference (aligned with EG-Mobile / Flutter)

Visual reference: `mobile.html` (Step 3 of the presentation flow). Styles: `css/mobile.css`. Behaviours: `js/mobile.js`.
Source of truth for structure and data: the **EG-Mobile** repo (`lib/features/*`, `lib/core/*`) and **EG-System**. This design follows them; every difference is listed in section 1 of `mobile.html` and below.

## 1. What EG-Mobile is today (audited)

- Flutter, Clean Architecture, Cubit. Roles: `admin`, `sales`. Login by **email + password** (demo creds prefilled).
- 8 modules: Dashboard, Products, Inventory, Sales, Production, Customers, Finance, Settings. Bottom bar = 4 tabs (Home, Products, Stock, Sales) + a drawer for all 8. App bar: title + language + logout.
- Statuses (`Formatters.statusLabel`): `draft` مسودة · `confirmed` مؤكد · `production` إنتاج · `shipped` تم الشحن · `queued` في الانتظار · `in_progress` جارٍ · `done` مكتمل · customer types `dealer` موزع · `contractor` مقاول · `retail` تجزئة.
- Widgets: `StatCard`, `StatusChip`, `Card + ListTile`, `LinearProgressIndicator` (work orders), search `TextField` (products), `CircularProgressIndicator`, red `SnackBar` for login errors.
- Seed data: SO-2025-0142…0145, WO-2025-0087…0089, CUS-001…003, products DOOR-D134 / D132, CLAD-16x280, FOAM-18, ACC-DOOR-KIT.
- No notifications, no order detail, no offline banner, no logo asset, Roboto font.

## 2. Differences and decisions

| Area | Current | Design | Status |
| --- | --- | --- | --- |
| Palette | forest `#1A4A36` + brass `#A67C42` | Navy `#012864` primary + Red `#ED1C24` accent (not for large backgrounds or body text) | **Approved** (20) |
| Font | Roboto (no Arabic glyphs) | Somar Rounded → Cairo; Poppins for Latin | fix |
| Logo | brass square "EG" | official seal / wordmark | fix |
| Login | email + password, prefilled, red SnackBar | same fields; inline error; no prefill; phase 2 biometric/PIN | fix |
| Navigation | 4 tabs + drawer | Home · Sales · Production · Stock · More; tabs shown by permission (More = Products, Customers, Finance, notifications settings, language, account, logout) | Pending Confirmation (21) |
| App bar | title + language + logout | screen title + bell | fix |
| Notifications | none | 3 levels with action buttons | new |
| Screen states | spinner / raw error text | skeleton, empty, offline banner, retry | new |
| Order detail | none | detail + progress + "أكّد الأمر" for `draft` | new |
| Roles | no UI difference | RBAC: `sales` has no costs/finance; confirming an order requires an approve permission | Approved rules (25); role matrix Pending (5, 22) |
| Seed data | colours `C205`…; cladding 16×280; foam 18 mm | official 11 finishes; 17×280; foam 4.5–17 mm | fix |
| Text size | 12–14px | min 13px, body 15–17px | fix |

## 3. Flutter mapping

### Colors (`lib/core/theme/app_colors.dart`)

Keep the class and the field names; change values (names no longer describe the hue — rename in a follow-up if desired).

```dart
class AppColors {
  const AppColors._();
  // brand
  static const navy = Color(0xFF012864);        // was forest
  static const navyDeep = Color(0xFF021A43);    // was forestDeep
  static const red = Color(0xFFED1C24);         // was brass (primary action)
  static const redDeep = Color(0xFFB9141B);     // pressed / small red text (AA on white)
  static const background = Color(0xFFEEEEEE);  // was EEF1EF
  static const backgroundSoft = Color(0xFFF3F5F9);
  static const textPrimary = Color(0xFF141414);
  // status (tint / foreground) — always with a text label + dot
  static const successBg = Color(0xFFE3F4EA), successFg = Color(0xFF147A3D);
  static const warningBg = Color(0xFFFDF0DC), warningFg = Color(0xFFA85A00);
  static const infoBg = Color(0xFFE6ECF6),    infoFg = Color(0xFF012864);
  static const neutralBg = Color(0xFFECECEC), neutralFg = Color(0xFF4A4A4A);
  static const dangerBg = Color(0xFFFDE8E9),  dangerFg = Color(0xFFB9141B);
}
```

`StatusChip` mapping: `shipped`/`done` → success · `production`/`in_progress`/`queued` → warning · `confirmed` → info · default → neutral. Add a leading 8px dot.

### Theme (`app_theme.dart`)

- `ColorScheme.fromSeed(seedColor: navy, primary: navy, secondary: red)`.
- `FilledButtonThemeData`: background `red`, foreground white, `minimumSize: Size.fromHeight(52)`, text 19 / w700 (large text → white on red passes 4.38:1), radius 14.
- `InputDecorationTheme`: min height 52, radius 12, 2px border `#C9C9C9`, focused `navy`, error `redDeep` with the message under the field.
- `AppBarTheme`: navy-deep for Home only; other screens white with navy title (matches `mobile.html`).
- `NavigationBarThemeData`: height 64, 5 destinations, indicator `navyTint #E6ECF6`, selected icon/label `navy`, label 13px.
- `fontFamily`: `Cairo` (Arabic) via the `google_fonts` package or bundled assets; Latin numerals use Poppins with `FontFeature.tabularFigures()`.
- Min text 13px, body 15–17px (current code uses 12–14).

### Components

| Design (`css/mobile.css`) | Flutter |
| --- | --- |
| `.m-stat` | `StatCard` (add `unit` suffix, accent: red = sales, green = positive) |
| `.m-chip` | `StatusChip` |
| `.m-rec` | `Card + ListTile` → one shared `RecordCard` |
| `.m-progress` | `LinearProgressIndicator` (navy; green at 100%) |
| `.m-btn-accent` (red) / `.m-btn-primary` (navy) / `.m-btn-ghost` | `FilledButton` (accent = red for the single key action, primary = navy) / `OutlinedButton` / `TextButton` themes |
| `.m-sheet` | `showModalBottomSheet` |
| `.m-toast` | `SnackBar` (floating, navy-deep, action) |
| `.m-empty` / `.m-skel` / `.m-banner` | new `EmptyState`, `SkeletonList`, `ConnectivityBanner` |
| `.m-hold` | new `HoldToConfirmButton` |
| `.m-switch`, `.m-seg` | `Switch`, `SegmentedButton` |
| icons | Material Symbols equivalents: home, point_of_sale, precision_manufacturing, warehouse, menu, notifications, bolt, … |

## 3b. Offline

Limited offline (Pending Confirmation 9): show previously loaded data; record permitted operations locally and sync on reconnect. **Approved:** no financial operations and no sensitive approvals offline — their buttons are disabled with the note «يحتاج اتصالاً».

## 4. Principles (apply to every screen)

1. One primary action per screen (red, bottom). Never two red buttons.
2. A decision is ≤ 2 taps from a notification (push carries the action button).
3. Copy: title ≤ 6 words, body one line (~12 words), button = one verb.
4. Actions in the lower third; sticky action bar does not scroll.
5. Choose, don't type: filters by status, stepper, barcode scan, canned reasons.
6. Offline-tolerant: banner + local queue + sync; never lose typed input on error.

## 5. Tokens (`css/mobile.css` `:root`)

Touch target 48 · primary button 52 (text 19 bold) · in-card button 44 · input 52 (text 16) · app bar 56 (home 72) · bottom nav 64, 5 items · gutter 16 · radius 14/16, sheet 24. Brand corner `28 4 28 4` on the welcome card only. Canvas 360×740.

## 6. Notifications

| Level | Look | Sound | Buttons | Lifespan | Can disable |
| --- | --- | --- | --- | --- | --- |
| `urgent` | red bar + bolt | tone + vibrate, bypasses DND | 1–2 | until acted | no |
| `action` | navy bar + bell | soft tone + short vibrate | ≤ 2 | until acted | outside work hours |
| `info` | grey, no buttons | silent, centre only | none | 7 days then archived | yes |

Proposed events (Pending Confirmation — operations decide): critical stock below `minStock` → urgent · production line down / work order past `dueDate` → urgent · new `draft` sales order or purchase order awaiting approval → action (shown only to users holding the approve permission; the server re-checks permission on every action) · order status update / completion / daily report → info.
Badge on the bell counts unresolved `action` + `urgent` items only. Quiet hours default 22:00–06:00: only `urgent` is audible.

### Payload (FCM / APNs data message)

```json
{
  "id": "ntf_9f3a",
  "level": "action",
  "title": "أمر البيع SO-2025-0145 بانتظار تأكيدك",
  "body": "عميل تجزئة · 14,200 ج.م",
  "ref": { "type": "sales_order", "id": "so4" },
  "deeplink": "eg://sales/so4",
  "actions": [
    { "id": "confirm", "label": "أكّد الأمر", "api": "POST /sales-orders/so4/confirm" },
    { "id": "open", "label": "تفاصيل", "deeplink": "eg://sales/so4" }
  ],
  "created_at": "2026-11-03T09:41:00+02:00",
  "expires_at": null
}
```

One notification per event (idempotent by `id`); the title always carries the reference number; tapping opens the exact screen and marks it read; an action button calls the API directly and replaces the notification with an `info` confirmation (or an error toast with retry). Android channels: `urgent` (HIGH, DND bypass), `action` (HIGH), `info` (LOW). Provider: FCM + APNs (Approved). Sensitive actions from a notification are never executed offline or without a server-side permission check (Approved).

## 7. Auth

Login (email + password, language switch, hotline 15536) → Home. Error under the field, no prefill. Forgot password: self-service by email or reset by Super Admin (Pending Confirmation 15). Auto-lock after inactivity (timeout Open). Phase 2: PIN + biometric. Session length and reset policy await IT. Exceptional states: suspended account, expired session, no permission (e.g. `sales` → Finance), offline. Shared device: logout + local data cleanup (Approved).

## 8. Accessibility

Targets ≥ 48px and ≥ 8px apart · state never colour-only · `aria-label`/`Semantics` on icon-only buttons · hold-to-confirm also activates with Enter/Space (web) or a Semantics `onTap` fallback (Flutter) · reduced-motion disables pulse/spinner · RTL default with mirrored LTR · numbers Latin tabular · the email field is always LTR.

## 9. Open decisions

`docs/open-questions.md` — Approved: 20, 25, 29, 30 · Pending: 5, 9, 15, 16, 18, 19, 21, 22 · Open: 17, 18, 19, 33.
