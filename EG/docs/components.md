# Components inventory

> Implement in `css/components.css` + demo in `design-system.html`

## Checklist

- [x] Button (primary = Navy · **accent = Red، أهم إجراء واحد في الشاشة** · secondary / ghost / danger) — `.btn-primary` / `.btn-accent`
- [x] Icon button
- [x] Text field / textarea / select
- [ ] Date / number inputs
- [x] Checkbox · radio · switch
- [x] Chip · badge · status pill
- [x] Avatar
- [x] Card
- [x] Table (sortable, selectable, sticky header)
- [x] Tabs · segmented control
- [x] Sidebar · top bar · breadcrumbs
- [x] Modal · drawer · bottom sheet
- [x] Toast · banner · inline alert
- [ ] Pagination · page size
- [x] Empty state · skeleton · spinner
- [ ] File upload
- [x] Dropdown / menu
- [ ] Tooltip
- [x] KPI / stat tile
- [x] Progress / pipeline

## مكونات جديدة (2026-11-03)

> Live: `design-system.html#admin` و`#catalog` · Mobile: `mobile.html` · CSS: `components.css` (+ `mobile.css`)

- [x] Role chip (`.role-chip`, `.is-owner`, `.is-external`)
- [x] Permission matrix (`.perm` + `.perm-cb`; `.is-approve` بلون Accent)
- [x] User status chips (نشط / بانتظار التفعيل / معطّل / موقوف) — chips موجودة
- [x] Audit item (`.audit-item`)، Setting row (`.setting-row`)
- [x] Permission-denied state (`.denied`) + زر معطّل بأيقونة قفل
- [x] Pending / Approved badge، Placeholder (`.ph`)
- [x] Unit (`.unit`: pcs · m² · kg) وعملة (`.cur`: ج.م) — الأرقام Latin tabular
- [x] Catalog card (`.cat-card`)، size chip (`.opt-chip`)، finish picker (`.fin-pick`)
- [x] Price tag عام/تاجر (`.price-tag`)، quantity (`.qty`)
- [x] Order steps (`.order-steps`)، timeline (`.timeline`)، share bar (`.share-bar`)
- [x] Mobile kit: `.m-btn-accent` (أهم إجراء) / `.m-btn-primary` (كحلي)، `.m-hold`، `.m-sheet`، `.m-push`، `.m-note`، `.m-banner` ...

### قاعدة الألوان (Approved)

Primary = Navy `#012864`. Accent = Red `#ED1C24` للأزرار المهمة وحالات الانتباه فقط. لا خلفيات حمراء كبيرة ولا نصوص عادية حمراء. **زر Accent واحد في كل شاشة.**

## Per-component template

### Name

- Anatomy:
- Sizes:
- States:
- A11y:
- RTL notes:
- Code class:
