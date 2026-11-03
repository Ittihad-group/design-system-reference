# Typography

## Families

| Role | Family | Notes |
|------|--------|-------|
| Arabic UI / marketing | **Somar Rounded** (official, per live site `@font-face`) → Cairo fallback | Licensed — not bundled. Add files to `assets/fonts/` and uncomment the `url()` in `css/fonts.css` |
| Latin | Poppins (matches live site body stack) | |
| SKUs / codes | system ui-monospace / tabular | D134, D132 |

## Scale

| Token | rem | Weight |
|-------|-----|--------|
| Display | 2.25 | 700 |
| H1 | 1.75 | 700 |
| H2 | 1.375 | 700 |
| H3 | 1.125 | 600 |
| Body | 1 | 400 |
| Dense (ERP) | 0.875 | 400–600 |
| Caption | 0.8125 | 500 |

## Arabic rules

- Line-height ≈ 1.7
- Avoid positive letter-spacing on Arabic
- Numerals: Latin tabular in both languages for prices/SKU

## English rules

- Line-height ≈ 1.55
- Headings slight tracking tighten OK (−0.01em)

## ERP density

Body drops to 14px in tables/forms; nothing below 13px.
