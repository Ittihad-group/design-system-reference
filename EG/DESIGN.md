# Design — EG Design System

> Tokens: `css/variables.css` · Live: `design-system.html` · Assets: `assets/ASSETS.md`  
> Brand sampled from [egerman-upvc.com](https://egerman-upvc.com/) + official logo files.

## Name

EG Design System / نظام تصميم المصرية الألمانية

## Concept

**Seal & dual identity.** The circular EG mark (door frame + E red + G navy) and the split Arabic wordmark (المصرية / الألمانية) encode Egypt × Germany. UI inherits that duality: red for primary action and Egyptian emphasis, navy for structure, chrome, and trust.

## Logo

| Asset | Path |
|-------|------|
| Mark | `assets/images/logo/mark.png` |
| Wordmark color | `assets/images/logo/wordmark-color.png` |
| Wordmark reverse | `assets/images/logo/wordmark-white.png` |
| Favicon | `assets/images/logo/favicon.png` |

Rules: no recoloring · no drop shadows on the seal · clear space ≥ EG letter height · prefer mark alone in tight UI chrome.

## Foundations checklist

- [x] Color primitives + semantic tokens (`css/variables.css`)
- [x] Typography stacks (interim web fonts — swap when licensed files arrive)
- [x] Spacing scale (4pt)
- [x] Radius / touch targets
- [x] Logo assets downloaded
- [ ] Icon set
- [ ] Motion polish
- [ ] Licensed self-hosted fonts in `assets/fonts/`

## Core palette

| Role | Token | Hex |
|------|-------|-----|
| Primary / CTA | `--eg-red` | `#ED1C24` |
| Secondary / structure | `--eg-navy` | `#0E2F64` |
| Background | `--eg-bg` | `#EEEEEE` |
| Surface | `--eg-surface` | `#FFFFFF` |
| Ink | `--eg-ink` | `#141414` |

## Surfaces

| Surface | Density | Notes |
|---------|---------|-------|
| EG-System | Dense ERP | Tables, filters, forms — navy chrome, red primary buttons |
| EG-Website | Marketing | Hero, product cards, catalog CTA (site uses floating red catalog tab) |
| EG-Mobile | Compact ERP | Bottom nav, lists, sheets |

## File map

| Path | Role |
|------|------|
| `css/variables.css` | All tokens |
| `css/components.css` | Reusable UI |
| `js/demo-data.js` | Company / products seed |
| `design-system.html` | Live reference |
| `docs/design-system.md` | Written specification |
| `assets/images/logo/` | Official marks |

## Source of truth

Logo files + `variables.css` win over docs when they disagree — then update the docs.
