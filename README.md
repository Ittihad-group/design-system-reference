# Design System Reference — Ittihad Group

مجلد مرجعي فيه أكتر من ديزاين سيستم. كل منتج/براند في فولدر لوحده.

Parent folder for multiple design-system packages. Each product lives in its own directory.

## Packages

| Folder | Product | Surfaces |
|--------|---------|----------|
| [`EG/`](./EG/) | المصرية الألمانية (WPC & PVC) | EG-System · EG-Website · EG-Mobile |

### صفحات حزمة EG (افتح `EG/index.html` وابدأ من السايد بار)

| # | الصفحة | المحتوى |
|---|--------|---------|
| 1 | `brand.html` | الهوية والمقاسات |
| 2 | `design-system.html` | المكونات (ERP · RBAC · الكتالوج · المالية والـHR) |
| 3 | `super-admin.html` | Super Admin: المستخدمون، RBAC، الأمان والتدقيق، الإعدادات |
| 4 | `catalog.html` | الكتالوج العام، أنشئ طلبك (ديناميكي)، بوابة التاجر، مراجعة المبيعات |
| 5 | `finance-hr.html` | الفواتير والتحصيل والسندات، الحضور والمرتبات، وإعداداتهما |
| 6 | `mobile.html` | EG-Mobile: الدخول والمكونات والشاشات والإشعارات |
| 7 | `documents.html` | 11 قالب PDF |

القرارات والأسئلة: `EG/docs/open-questions.md` (Approved / Pending Confirmation / Open).

<!-- Add new rows as packages are added -->

## Add a new package

1. Create a sibling folder next to `EG/` (e.g. `BrandName/`)
2. Mirror the EG scaffold: `css/`, `js/`, `docs/`, `screens/`, `PRODUCT.md`, `DESIGN.md`
3. Link it in this README table

## Related product repos

| Package | Repos |
|---------|-------|
| EG | [EG-System](https://github.com/Ittihad-group/EG-System) · [EG-Website](https://github.com/Ittihad-group/EG-Website) · [EG-Mobile](https://github.com/Ittihad-group/EG-Mobile) |
