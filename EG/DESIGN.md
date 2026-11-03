# Design — EG Design System

> Status: scaffold. Tokens live in `css/variables.css` once filled. Written spec: `docs/design-system.md`.

## Name

EG Design System / نظام تصميم المصرية الألمانية

## Concept

<!-- one metaphor / visual idea -->

-

## Foundations checklist

- [ ] Color primitives + semantic tokens
- [ ] Typography (AR + EN)
- [ ] Spacing scale (4pt)
- [ ] Radius scale
- [ ] Elevation / borders
- [ ] Icons
- [ ] Motion
- [ ] RTL / i18n rules

## Surfaces

| Surface | Density | Notes |
|---------|---------|-------|
| EG-System | Dense ERP | Data tables, filters, forms |
| EG-Website | Marketing | Hero, story, products, CTA |
| EG-Mobile | Compact ERP | Bottom nav, sheets, lists |

## File map

| Path | Role |
|------|------|
| `css/variables.css` | All tokens (only raw values) |
| `css/components.css` | Reusable UI |
| `css/motion.css` | Motion tokens + classes |
| `js/i18n.js` | AR/EN switching |
| `js/demo-data.js` | Sample plant data |
| `design-system.html` | Live reference |
| `docs/design-system.md` | Written specification |

## Source of truth

When code and docs disagree: fix the docs after updating tokens/CSS.
