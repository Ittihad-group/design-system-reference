# Colors

> Source of truth: `../css/variables.css`  
> Measured from the logo PNG pixels and cross-checked with the live site theme ([egerman-upvc.com](https://egerman-upvc.com/))

## القرار المعتمد (Approved)

اعتماد ألوان العلامة في **EG-System** و**EG-Mobile**: Primary Navy `#012864` + Brand Red `#ED1C24`. تُستبدل Forest Green `#1A4A36` وBrass `#A67C42` نهائياً (أي مرجع لهما في الكود يُعتبر قديماً).

**قاعدة استخدام الأحمر:** لون Accent فقط — الأزرار المهمة والحالات التي تحتاج انتباهاً (عاجل، متأخر، خطأ). لا خلفيات حمراء كبيرة، ولا نصوص عادية حمراء (للنص الأحمر الصغير استخدم `--eg-red-deep`، وللحالات فقط). الكحلي هو اللون الأساسي للهيكل والعناوين والروابط والأزرار الثانوية. ألوان النجاح والتحذير والخطأ والحالات التشغيلية تبقى.

## Primitives

| Name | Hex | Notes |
|------|-----|-------|
| `--eg-red` | `#ED1C24` | Site CTA `rgb(237, 28, 36)` · logo E |
| `--eg-red-hot` | `#E63437` | Hover accent on site |
| `--eg-red-deep` | `#C41218` | Pressed / text on tint |
| `--eg-navy` | `#012864` | Logo G / arcs — **corrected** from `#0E2F64` (measured: 27,501 px in mark.png; site theme uses it 24×) |
| `--eg-navy-glass` | `#345383` | Door-glass tone inside the seal |
| `--eg-navy-deep` | `#021A43` | Sidebar / dark bands |
| `--eg-navy-soft` | `#0D3779` | Hover on navy (site) |
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
| success | `#147A3D` | Stock OK / shipped (AA on tint) |
| warning | `#A85A00` | Low stock / in production |
| danger | `#C41218` | Out of stock / cancelled / error |
| info | `#345383` | Confirmed / neutral info |

Every status is a chip with a dot **and** a text label.

## Product finishes

11 shared finishes (C132, C160, C021, C198, C182, C115, C091, C173, C102, C3003, C8001) — swatch colors approximated from the printed catalog; tokens `--finish-c###`. Replace with lab-measured values if the factory supplies them.

## Contrast notes

- White text on `#ED1C24` — use for large UI (buttons); verify AA for small text
- Prefer navy text on pale red tints for chips
- Never place red text on navy without checking contrast

## Do / Don't

- Do: الأحمر Accent (زر مهم، حالة عاجلة) · Don't: الأحمر كخلفية كبيرة أو نص عادي
- Do pair red CTA with navy structure
- Don't introduce a third brand hue without documenting it here
- Don't use pure `#FF0000` — stick to `--eg-red`
