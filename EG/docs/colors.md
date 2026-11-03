# Colors

> Source of truth: `../css/variables.css`  
> Sampled from logo + live CTAs on [egerman-upvc.com](https://egerman-upvc.com/)

## Primitives

| Name | Hex | Notes |
|------|-----|-------|
| `--eg-red` | `#ED1C24` | Site CTA `rgb(237, 28, 36)` · logo E |
| `--eg-red-hot` | `#E63437` | Hover accent on site |
| `--eg-red-deep` | `#C41218` | Pressed / text on tint |
| `--eg-navy` | `#0E2F64` | Logo G / arcs |
| `--eg-navy-deep` | `#081C3C` | Dark bands |
| `--eg-bg` | `#EEEEEE` | Site body background |
| `--eg-bg-soft` | `#F4F5F9` | Soft section band |
| `--eg-surface` | `#FFFFFF` | Cards / sheets |
| `--eg-ink` | `#141414` | Body text |
| `--eg-muted` | `#5C5C5C` | Secondary text |
| `--eg-line` | `#E0E0E0` | Borders |

## Semantic

| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | red | Primary button, catalog FAB, key highlights |
| `--color-secondary` | navy | Headers, links, ERP chrome |
| `--color-bg` | eg-bg | Page canvas |
| `--color-surface` | white | Cards, tables |
| `--color-text` | ink | Body |
| `--color-on-primary` | white | Text on red buttons |

## Status palette

| Status | Token | Notes |
|--------|-------|-------|
| success | `#168A45` | Stock OK / paid |
| warning | `#D97706` | Low stock / due |
| danger | `--eg-red` | Overdue / error |
| info | `#2563EB` | Neutral info |

## Contrast notes

- White text on `#ED1C24` — use for large UI (buttons); verify AA for small text
- Prefer navy text on pale red tints for chips
- Never place red text on navy without checking contrast

## Do / Don't

- Do pair red CTA with navy structure
- Don't introduce a third brand hue without documenting it here
- Don't use pure `#FF0000` — stick to `--eg-red`
