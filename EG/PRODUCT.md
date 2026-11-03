# Product — EG (المصرية الألمانية)

> Status: scaffold. Fill every section before design lock.

## Register

- **Company:** المصرية الألمانية لتصنيع منتجات WPC & PVC
- **Plant:** جمصة، الدقهلية — Industrial Zone Phase 3
- **Surfaces:** EG-System (ERP web) · EG-Website (public) · EG-Mobile (Flutter ERP)

## Users

<!-- Describe each persona: role, goals, devices, language, pain -->

- [ ] Plant admin / owner
- [ ] Sales / dealers desk
- [ ] Warehouse / inventory
- [ ] Production floor supervisor
- [ ] Purchasing / suppliers
- [ ] HR
- [ ] Finance
- [ ] Public visitor (website)
- [ ] Dealer / contractor (external)

## Product purpose

Internal operating system for a WPC & PVC manufacturing plant + public brand site.

Success looks like:

- [ ]
- [ ]

## Surfaces

### EG-System (ERP web)

| Module | Arabic | Purpose | Status |
|--------|--------|---------|--------|
| Dashboard | لوحة التحكم | KPIs, open orders, production, activity | stub |
| Products | المنتجات | SKU master (doors, cladding, foam, accessories) | stub |
| Inventory | المخزون | Warehouses FG / RM / WIP, stock & reservations | stub |
| Sales | المبيعات | Sales orders, line items, payment status | stub |
| Production | الإنتاج | Work orders & line progress | stub |
| Customers | العملاء والموزعين | Dealers, contractors, retail | stub |
| Suppliers | الموردين | Raw materials & accessories vendors | stub |
| Purchases | المشتريات | Purchase orders | stub |
| HR | الموارد البشرية | Employees by department | stub |
| Finance | المالية | Receivables, payables, cash, month sales | stub |
| Settings | الإعدادات | Company profile & language | stub |

### EG-Website (public)

| Page | Arabic | Status |
|------|--------|--------|
| Home | الرئيسية | stub |
| About | من نحن | stub |
| Services | خدماتنا | stub |
| Products | المنتجات | stub |
| Careers | الوظائف | stub |
| News | أخبار الشركة | stub |
| Contact | اتصل بنا | stub |

### EG-Mobile (Flutter)

Same ERP modules as EG-System, mobile-first. Demo auth aligned with web.

## Domain facts (seed / content)

- Product lines: WPC doors (D134 / D132), WPC cladding 16×280, PVC foam boards, door accessory kits
- Sample dealer: Al-Adas (Oman)
- Hotline: `15536` · Phone: `+201555515536` · Email: `contact@egerman-upvc.com`

## Demo auth

```
admin@egerman-upvc.com / admin123
sales@egerman-upvc.com / sales123
```

## Brand personality

<!-- tone, voice, visual character -->

-

## Anti-references

-

## Design principles

1.
2.
3.
4.
5.

## Accessibility & language

- Arabic (RTL) first + English
- WCAG 2.2 AA minimum
- Touch targets ≥ 44 (mobile ≥ 48)
- `prefers-reduced-motion`

## Open questions

See `docs/open-questions.md`.
