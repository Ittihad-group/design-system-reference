# EG Design System — Written Spec

> Live: `../design-system.html` · Tokens: `../css/variables.css` · Brand site: https://egerman-upvc.com/

## 0. File map

| Path | Role | Status |
|------|------|--------|
| `assets/images/logo/*` | Official mark / wordmarks | filled |
| `css/variables.css` | Tokens | filled (v0 foundations) |
| `css/components.css` | Starter components | partial |
| `js/demo-data.js` | Company + products seed | filled |
| `docs/brand.md` · `colors.md` · `typography.md` | Specs | filled |

## 1. Foundations

### 1.1 Color

| Token | Hex | Usage |
|-------|-----|-------|
| `--eg-red` / primary | `#ED1C24` | CTA, catalog, logo E |
| `--eg-navy` / secondary | `#0E2F64` | Structure, logo G |
| `--eg-bg` | `#EEEEEE` | Canvas (live site body) |
| `--eg-surface` | `#FFFFFF` | Cards |
| `--eg-ink` | `#141414` | Text |

Rules: semantic tokens in components only · status = color + label · white-on-red for large controls.

### 1.2 Typography

- AR interim: Cairo · EN: Poppins (live Latin stack)
- Scale: Display 2rem → Caption 0.75rem
- LH AR 1.7 / EN 1.55 · Latin tabular numerals

### 1.3 Spacing & shape

4pt scale · radius 4/8/12 · touch 44/48 · float shadow for overlays only

### 1.4 Logo

See `../assets/ASSETS.md` and `brand.md`.

## 2. Components (starter shipped)

Button primary/secondary/ghost · status chip · logo cards · product cards (in live page)

Remaining inventory: see `components.md`.

## 3–7

Patterns / motion / RTL / a11y / surfaces — scaffolds remain; follow tokens above when implementing.
