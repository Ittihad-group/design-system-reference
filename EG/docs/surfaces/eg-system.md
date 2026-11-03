# Surface — EG-System (ERP Web)

## Purpose

Internal plant ERP for WPC & PVC manufacturing.

## Stack target

React + Vite + React Router (see EG-System repo)

## Shell

- Sidebar modules — تظهر حسب صلاحيات المستخدم (RBAC)، وSuper Admin أول موديول
- Top bar: search / user / language
- Content: pages + tables + forms

## Modules

See `../modules/*.md`

### Super Admin (أول موديول — Approved)

موديول صاحب الشركة والمصنع لإدارة النظام بالكامل: المستخدمون · الأدوار والصلاحيات (RBAC: View / Create / Edit / Delete / Approve / Export) · الأقسام والموديولات · إعدادات الشركة والمصنع · المخازن والعملات (EGP فقط في v1) · العملاء والموردون · النشاط (Audit) · التقارير العامة · إعدادات النظام. التفاصيل: `../../PRODUCT.md` (قسم 2 و3).

### الكتالوج وبوابة التاجر (Approved)

جزء من النظام: Public Catalog (رابط قابل للمشاركة) + زر «أنشئ طلبك» + Customer / Dealer Portal. يظهر طلب التاجر في موديول المبيعات للمراجعة والتأكيد ولا يُؤكَّد تلقائياً. الـflow في `../flows.md`.

## Density

High — prioritize scanability of numbers, SKUs, statuses.

## Notes

-
