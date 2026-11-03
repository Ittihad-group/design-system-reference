# EG Design System — Written Spec

> Live page: `../design-system.html` · Tokens: `../css/variables.css` · Status: scaffold

## 0. File map

| Path | Role | Status |
|------|------|--------|
| `css/variables.css` | Tokens only | empty |
| `css/reset.css` | Reset | empty |
| `css/fonts.css` | @font-face | empty |
| `css/typography.css` | Type roles | empty |
| `css/layout.css` | Layout primitives | empty |
| `css/components.css` | Components | empty |
| `css/pages.css` | Page compositions | empty |
| `css/motion.css` | Motion | empty |
| `css/responsive.css` | Breakpoints | empty |
| `css/main.css` | Entry imports | wired |
| `js/*.js` | Behaviour | empty stubs |

## 1. Foundations

### 1.1 Color

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | TBD | |
| `--color-primary-ink` | TBD | |
| `--color-navy` / brand | TBD | |
| `--color-bg` | TBD | |
| `--color-surface` | TBD | |
| `--color-text` | TBD | |
| `--color-muted` | TBD | |
| `--color-border` | TBD | |
| `--color-success` | TBD | |
| `--color-warning` | TBD | |
| `--color-danger` | TBD | |
| `--color-info` | TBD | |

Rules:

- [ ] Semantic tokens only in components (no raw hex outside variables.css)
- [ ] Contrast AA documented
- [ ] Status = color + icon/text

### 1.2 Typography

| Role | Size | Weight | Line-height | Notes |
|------|------|--------|-------------|-------|
| Display | TBD | | | |
| H1 | TBD | | | |
| H2 | TBD | | | |
| H3 | TBD | | | |
| Title | TBD | | | |
| Body | TBD | | | |
| Secondary | TBD | | | |
| Caption | TBD | | | |

Fonts:

- Arabic:
- Latin:
- Numerals: Latin tabular in both langs

### 1.3 Spacing & shape

- Scale (4pt):
- Radius:
- Border:
- Shadow policy:
- Touch target:

### 1.4 Icons

-

## 2. Components

| Component | Sizes | States | Notes |
|-----------|-------|--------|-------|
| Button | | default / hover / focus / disabled / loading | |
| Input | | | |
| Select | | | |
| Checkbox / Radio / Switch | | | |
| Chip / Badge | | | |
| Table | | | ERP-critical |
| Card | | | |
| Tabs | | | |
| Sidebar / Nav | | | |
| Modal / Sheet | | | |
| Toast | | | |
| Pagination | | | |
| Empty / Error / Loading | | | |

## 3. Patterns

- Filter + table + row actions
- Form wizard / multi-step
- KPI strip
- Status pipeline (order / work order)
- Bilingual toggle

## 4. Motion

- Duration scale:
- Easing:
- Enter / exit:
- Reduced motion:

## 5. RTL & i18n

- Logical properties only (`inline-start/end`)
- `js/i18n.js` owns `lang` / `dir`
- Numbers / currency / dates rules:

## 6. Accessibility

- Focus ring:
- Landmarks:
- Tables headers:
- Forms labels:

## 7. Surfaces divergence

See `surfaces/eg-system.md`, `surfaces/eg-website.md`, `surfaces/eg-mobile.md`.
