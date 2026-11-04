# Module — super-admin (Super Admin)

> Status: **Approved** كأول موديول · Live: `../../super-admin.html` · مكونات: `../../design-system.html#admin` · المتطلبات: `../../PRODUCT.md` (قسم 2 و3)

> **المرجع الكامل للتنفيذ (Epic):** [`../super-admin/README.md`](../super-admin/README.md) — 28 فيتشر · 84 شاشة · 113 Use Case · سجل متطلبات.
> ملخص الفيتشرز ومواصفات الـDesign System: [`super-admin-features.md`](super-admin-features.md)

## Purpose

موديول صاحب الشركة والمصنع لإدارة النظام بالكامل.

## Users

Super Admin / Owner (وفق الأدوار المبدئية — Pending Confirmation). General Manager يرى أجزاء بصلاحيات محددة.

## Primary screens

| Screen | Anchor in `super-admin.html` | Notes |
|--------|-------------------------------|-------|
| نظرة عامة | `#overview` | KPIs، طلبات الاعتماد، آخر النشاط |
| المستخدمون | `#users` | جدول بفلاتر، حالات: نشط / بانتظار التفعيل / معطّل / موقوف |
| الأدوار والصلاحيات | `#roles` | RBAC: مصفوفة موديول × (عرض · إضافة · تعديل · حذف · اعتماد · تصدير) |
| الأقسام والموديولات | `#modules` | تفعيل/إخفاء الموديولات؛ Super Admin مغلق على التفعيل |
| الشركة والمصنع | `#company` | حقول رسمية (Placeholders)، ختم وتوقيع، ترقيم المستندات |
| المخازن والعملات | `#warehouses` | EGP فقط في v1، وحدات pcs / m² / kg |
| العملاء والموردون | `#customers` | + طلبات تسجيل التجار من الكتالوج |
| النشاط والتقارير | `#activity` | Audit Log + تقارير عامة |
| إعدادات النظام | `#system` | لغة، إشعارات FCM/APNs، جلسة |

## Components (جديدة في `css/components.css`)

`.role-chip` · `.perm` + `.perm-cb` (مصفوفة، `.is-approve` للاعتماد بلون Accent) · `.audit` / `.audit-item` · `.denied` · `.setting-row` · `.unit` / `.cur` · `.ph` (Placeholder) · `.pending-badge` / `.approved-badge` · `.split` / `.role-item`.

## Rules

- **Pending (الإدارة / IT، بند 35):** حساب Super Admin أساسي + حساب احتياطي لشخص تسميه الإدارة، MFA، إمكانية تعطيل الحسابات، وAudit Log إلزامي للأحداث الحساسة (المستخدم، الوقت، الإجراء، القيم قبل/بعد) للقراءة فقط بلا تعديل أو حذف من الواجهة. مدة الاحتفاظ Open.
- **Pending (الإدارة، بند 33):** حدود الخصم والاعتماد **إعدادات** بلا أرقام ثابتة؛ سلسلة الاعتماد Sales Manager ← General Manager.
- **Pending (المبيعات، بند 32):** طلبات فتح حساب التاجر تُراجَع وتُعتمد من المبيعات، ولا تفعيل تلقائي.
- **Pending (المالية/التشغيل، بند 47):** البادئات قابلة للتعديل، بلا تكرار وبتسلسل لكل نوع مستند؛ اللغة والختم والتوقيع لكل نوع مستند إعدادات.
- **Pending (بند 34):** موديول الجودة خارج v1 حتى يعتمده فريق المنتج.
- RBAC قابل للتعديل من Super Admin؛ لا أدوار ثابتة فقط. «عرض» شرط لباقي العمليات في المصفوفة.
- موظف المبيعات لا يرى التكاليف الداخلية ولا التقارير المالية ولا أرباح المصنع.
- لا تأكيد ولا اعتماد مالي دون الصلاحية المطلوبة؛ الزر يُعطَّل مع سبب واضح (أيقونة قفل).
- زر Accent واحد في كل شاشة؛ الباقي Primary (كحلي).

## Statuses

| Status | Meaning | Chip |
|--------|---------|------|
| active | مستخدم نشط | success |
| pending | بانتظار التفعيل / الموافقة | warning |
| disabled | معطّل | neutral |
| locked | موقوف بعد محاولات فاشلة | danger |

## Empty / error / permission states

`.denied`: «هذه الشاشة ليست من صلاحياتك — اطلب من مدير النظام إضافتها لدورك».

## Open questions

بنود 5 و33 و34 و35 في `../open-questions.md` (الأدوار، حدود الاعتماد، Quality Control، وراثة Super Admin وAudit Log).
