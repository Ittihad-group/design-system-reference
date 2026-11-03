# Mobile app — essentials (technical reference)

Visual reference: `mobile.html` (Step 3 of the presentation flow). Styles: `css/mobile.css`. Behaviours: `js/mobile.js`.
Scope: **auth, component kit, notifications only**. No business screens — the screens on the page are structural samples.

## 1. Principles (apply to every screen)

1. One primary action per screen (red, bottom, `.m-btn-primary`). Never two red buttons.
2. A decision is ≤ 2 taps from a notification (push carries the action button).
3. Copy: title ≤ 6 words, body one line (~12 words), button = one verb (اعتمد / استلمت / أرسل).
4. Actions in the lower third (thumb zone); sticky `.m-actionbar` does not scroll.
5. Choose, don't type: lists, stepper, barcode scan, canned reasons. Right keyboard type per field.
6. Offline-tolerant: banner + local queue + sync; never lose typed input on error.

## 2. Tokens (`css/mobile.css` `:root`)

| Token | Value | Note |
| --- | --- | --- |
| `--m-touch` | 48px | min touch target |
| `--m-btn-h` / `--m-btn-h-sm` | 52 / 44px | primary / in-card |
| `--m-input-h` | 52px | input text **16px** (prevents iOS zoom) |
| `--m-appbar-h` / `--m-nav-h` | 56 (home 72) / 64px | bottom nav max 4 items |
| `--m-gutter` | 16px | |
| `--m-radius` / `--m-radius-sheet` | 14 / 24px | brand corner `28 4 28 4` only on the hero card |

Design canvas 360×740. Primary button text is 19px bold = WCAG "large text" → white on `#ED1C24` (4.38:1) passes. Smaller red-text on white must use `--eg-red-deep` `#B9141B`.

## 3. Components

`.m-appbar` (`.is-brand` for home) · `.m-nav` · `.m-btn(-primary|-secondary|-ghost|-soft-danger|-text|-sm)` · `.m-field/.m-input/.m-error` · `.m-stepper` · `.m-dots` + `.m-keypad` (PIN) · `.m-otp` · `.m-chip(.is-ok|warn|bad|info)` · `.m-filters/.m-fchip` · `.m-search` · `.m-card(.is-urgent|is-action|is-hero)` · `.m-list/.m-row` · `.m-tiles/.m-tile` · `.m-hold` (press-and-hold confirm) · `.m-sheet/.m-scrim` · `.m-banner` · `.m-empty` · `.m-skel` · `.m-toast` · `.m-switch` · `.m-push` · `.m-note`.

Status is always dot + colour + text label. Icons: `EG.icon(name)` or `<i data-i="name">` (replaced by `js/mobile.js`).

## 4. Auth flow

Splash → (no session) Login → OTP (forgot only) → set PIN (first time) → Home.
Returning: Splash → Lock (biometric, PIN fallback) → Home.

Proposed policy (needs sign-off, see open-questions 15–16):

- Full login every 30 days or on a new device; auto-lock after 2 min in background.
- 5 failed attempts → account locked, admin unlocks.
- One active device per account.
- Errors sit under the offending field, say what to do next, never clear the phone number.
- Exceptional states: locked account, expired session, no permission, offline (all use `.m-empty`/`.m-banner`).

## 5. Notifications

| Level | Look | Sound | Buttons | Lifespan | Can disable |
| --- | --- | --- | --- | --- | --- |
| `urgent` | red bar + bolt | tone + vibrate, bypasses DND | 1–2 | until acted | no |
| `action` | navy bar + bell | soft tone + short vibrate | ≤ 2 (primary + details) | until acted | outside work hours |
| `info` | grey, no buttons | silent, centre only | none | 7 days then archived | yes |

Badge on the Notifications tab counts **`action` + `urgent` items that are unresolved**, not `info`.
Quiet hours (default 22:00–06:00): only `urgent` is delivered audibly.

### Payload (FCM / APNs data message)

```json
{
  "id": "ntf_9f3a",
  "level": "action",
  "title": "طلب رقم 1043 ينتظر اعتمادك",
  "body": "من م. سامي · موعد اليوم 14:00",
  "ref": { "type": "order", "id": "1043" },
  "deeplink": "eg://orders/1043",
  "actions": [
    { "id": "approve", "label": "اعتمد", "api": "POST /orders/1043/approve" },
    { "id": "open", "label": "تفاصيل", "deeplink": "eg://orders/1043" }
  ],
  "created_at": "2026-11-03T09:41:00+02:00",
  "expires_at": null
}
```

Rules: one notification per event (idempotent by `id`); title always carries the reference number; tapping opens the exact screen (deep link) and marks it read; action buttons call the API directly and replace the notification with an `info` confirmation (or an error toast with retry).
Android channels: `urgent` (importance HIGH, DND bypass), `action` (HIGH), `info` (LOW). Provide an in-app settings screen: 3 switches + quiet hours; `urgent` locked on.

## 6. Accessibility

- Targets ≥ 48px, spacing ≥ 8px; state never colour-only.
- Screen-reader labels on icon-only buttons (`aria-label`); hold-to-confirm also activates with Enter/Space.
- `prefers-reduced-motion` disables pulse/spinner animation.
- RTL default; use logical properties only; numbers wrapped in `.num` (Latin tabular).

## 7. Open decisions

Tracked in `docs/open-questions.md` items 15–19.
