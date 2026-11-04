# 00 · الأساس (SA-00) والكتالوجات المشتركة

> جزء من [Epic Super Admin](README.md) · الوسوم: **[Approved]** · **[Pending]** · **[Open]** · **[New]** (اقتراح جديد يحتاج اعتماد). **أي قيمة بين `{ }` = لسه Open، مفيش رقم افتراضي.**

---

## SA-00 · هيكل التطبيق والمكونات العامة — P0 · [Pending/New]

**الغرض:** كل شاشات Super Admin بتقف على نفس الهيكل. لازم يخلص قبل أي فيتشر.

### الشاشات والمكونات العامة
| ID | الاسم | النوع | ملاحظات |
|----|-------|-------|---------|
| SCR-GLB-01 | App Shell (قائمة جانبية + Header) | Layout | قائمة مجمّعة (القسم "هيكل التنقل" في README) · Header: breadcrumb، بحث عام، جرس الإشعارات، شارة الدور، قائمة الحساب |
| SCR-GLB-02 | البحث العام | Overlay | يبحث في: مستخدم، دور، إعداد، عميل، مستند؛ النتايج تحترم صلاحيات الباحث |
| SCR-GLB-03 | Step-up (إعادة تحقق) | Dialog | كلمة مرور أو OTP قبل عملية حساسة (القائمة في SA-15) |
| SCR-GLB-04 | Confirm Dialog | Dialog | أثر الإجراء + حقل سبب + سطر "هيتسجل" + زر خطر |
| SCR-GLB-05 | صفحة "غير مصرّح" | Page | النص الموجود في `.denied` |
| SCR-GLB-06 | جلسة منتهية / قفل الخمول | Overlay | يمنع المحتوى ويطلب إعادة تحقق |
| SCR-GLB-07 | بانر تغيّر الصلاحيات | Banner | «تم تحديث صلاحياتك، أعد التحميل» |
| SCR-GLB-08 | صفحات الخطأ / 404 / فاضي | Page | |

### Use Cases
**UC-GLB-01 · دخول Super Admin (مع MFA)** — الممثل: Super Admin · المحفز: فتح `/login`
- شرط مسبق: حساب نشط، MFA مفعّل (**[Pending بند 35]**، الطريقة **[Open]**).
- المسار: 1) بريد + كلمة مرور ← 2) التحقق الثاني ← 3) تحميل الصلاحيات والنطاقات ← 4) landing على `/super-admin`.
- استثناءات: كلمة مرور غلط ← عدّاد محاولات (الحد **{Open}**) ← قفل الحساب (حالة "موقوف") · MFA فاشل ← تسجيل حدث · حساب معطّل ← رسالة عامة من غير كشف السبب.
- Audit: `AUTH.LOGIN_SUCCESS` / `AUTH.LOGIN_FAILED` / `AUTH.MFA_FAILED` / `AUTH.ACCOUNT_LOCKED`.

**UC-GLB-02 · قفل الخمول** — الممثل: النظام · بعد خمول (**30 دقيقة مقترحة [Pending بند 15]**، قابلة للتعديل SA-15) ← تظهر SCR-GLB-06 ← إعادة تحقق أو تسجيل خروج. البيانات اللي على الشاشة تتخفي.

**UC-GLB-03 · Step-up** — قبل عملية من القائمة الحساسة: يظهر SCR-GLB-03 ← نجاح = تنفيذ العملية ويُسجَّل أن التحقق تم · فشل = إلغاء + `AUTH.STEPUP_FAILED`. صلاحية التحقق بعد النجاح: **{Open}** (قيمة من IT).

**UC-GLB-04 · محاولة الوصول لشاشة ممنوعة** — المستخدم يفتح رابط مباشر ← route guard يفحص الصلاحية ← SCR-GLB-05 ← `ACCESS.DENIED` (مستوى معلومة، يتجمّع لو اتكرر).

**UC-GLB-05 · تغيّر الصلاحيات أثناء الجلسة [New]** — الأدمن عدّل دور مستخدم مفتوح عنده الشاشة ← أول طلب للخادم يرجع 403 أو إشارة `permissions_changed` ← بانر SCR-GLB-07 ← إعادة تحميل الصلاحيات.

### User Stories
- **US-GLB-01** كمدير نظام أريد قائمة جانبية مجمّعة وبحث عام لأوصل لأي إعداد في أقل من 3 نقرات.
  - AC: القائمة تعرض فقط ما يسمح به الدور · المسار (breadcrumb) صحيح في كل شاشة · البحث لا يُظهر نتائج خارج الصلاحية.
- **US-GLB-02** كمدير نظام أريد أن أُسأل عن التحقق قبل أي عملية حساسة.
  - AC: كل عملية في القائمة تفتح Step-up · لا يمكن تجاوزه من الـAPI مباشرة (الفحص على الخادم).
- **US-GLB-03** كمستخدم أريد أن أفهم سبب منعي.
  - AC: الزر المعطّل بقفل + سبب · الصفحة الممنوعة بنص موحّد.

### قواعد
- **BR-GLB-01** الواجهة تخفي/تعطّل، **والفحص الحقيقي على الخادم عند كل تنفيذ** (بند 25 Approved).
- **BR-GLB-02** زر Accent واحد في الشاشة.
- **BR-GLB-03** شارات `Pending/Approved/Placeholder` للتوثيق فقط وتُشال من الإنتاج.

---

## كتالوج الصلاحيات (Permission Keys) [New — يحتاج اعتماد]

**الصيغة:** `sa.<resource>.<action>`. المصفوفة (عرض/إضافة/تعديل/حذف/اعتماد/تصدير — **Approved بند 24**) بتتحوّل لمفاتيح `view/create/edit/delete/approve/export`. المفاتيح الإضافية هي **الصلاحيات الحساسة** (SA-03).

| المورد | المفاتيح | ملاحظات |
|--------|----------|---------|
| `sa.users` | view · create · edit · disable · unlock · reset_password · force_logout · export | `disable` منفصلة عن `edit` |
| `sa.roles` | view · create · edit · delete | |
| `sa.sessions` | view · revoke | |
| `sa.dealers` | view · review · suspend · override | `override` = تجاوز قرار المبيعات (بند 32) |
| `sa.company` | view · edit | الحقول الرسمية |
| `sa.departments` | view · create · edit · disable | |
| `sa.modules` | view · toggle | |
| `sa.warehouses` | view · create · edit · disable | |
| `sa.policies.approvals` | view · edit | |
| `sa.policies.numbering` | view · edit | |
| `sa.policies.finance` | view · edit | |
| `sa.policies.security` | view · edit | |
| `sa.approvals` | view · approve · delegate | |
| `sa.audit` | view · export | لا تعديل/حذف |
| `sa.security_center` | view · unlock | |
| `sa.customers` / `sa.suppliers` | view · create · edit · disable · export · import · merge | |
| `sa.reports` | view · export | + نطاق البيانات |
| `sa.settings` | view · edit | عام + إشعارات + تكاملات |
| **حساسة** `data.cost.view` · `data.profit.view` | عرض التكاليف الداخلية / أرباح المصنع | بند 25 [Approved] |
| `data.wages.view` | عرض الأجور | بند 46 [Pending]، General Manager مش تلقائياً |
| `finance.voucher.create` · `.approve` · `.execute` | سند الصرف: ثلاث صلاحيات منفصلة | بند 42 [Pending] |
| `sales.discount.approve` · `sales.order.confirm` | اعتماد الخصم · تأكيد الطلب | بند 25 / 33 |
| `finance.reports.export` | تصدير التقارير المالية | [New] |

**الأدوار المبدئية (Pending بند 5):** Super Admin/Owner · General Manager · Sales Manager · Sales Representative · Production Manager · Warehouse Manager · Accountant · Purchasing Officer · Quality Control. دور **IT/Tech Admin** مش في القائمة ومطلوب لو فيه شخص هيدير الأمان والتكاملات من غير ما يبقى Owner **[New — قرار]**.

**نطاق البيانات:** `own` · `team` · `department` · `all` لكل (دور × مورد). يعتمد على: `user.manager_id`، `user.department_id`، `user.warehouse_ids`، `customer.sales_rep_id`.

---

## كتالوج أحداث التدقيق (Audit Events) [Pending بند 35 — القائمة النهائية Open]

الحقول الثابتة لكل حدث: `id · timestamp · actor · action_code · target_type · target_id · before · after · ip · device · result · severity`. **Append-only**: الواجهة والـAPI بدون تعديل أو حذف. مدة الاحتفاظ **{Open}**.

| الكود | الحدث | الخطورة |
|-------|-------|---------|
| `AUTH.LOGIN_SUCCESS` / `LOGIN_FAILED` / `MFA_FAILED` / `ACCOUNT_LOCKED` / `STEPUP_FAILED` | الدخول والتحقق | معلومة ← عالية (حسب التكرار) |
| `AUTH.PASSWORD_RESET_REQUESTED` / `PASSWORD_CHANGED` | كلمة المرور | متوسطة |
| `USER.CREATED` / `UPDATED` / `ROLE_CHANGED` / `DISABLED` / `ENABLED` / `UNLOCKED` / `FORCE_LOGOUT` | المستخدمون | متوسطة ← عالية |
| `ROLE.CREATED` / `UPDATED` / `DELETED` / `SCOPE_CHANGED` / `SENSITIVE_GRANTED` | الأدوار | عالية |
| `SUPERADMIN.BACKUP_NAMED` / `MFA_CHANGED` / `RECOVERY_USED` | حسابات الإدارة | حرجة |
| `SESSION.REVOKED` / `DEVICE.REVOKED` | الجلسات | متوسطة |
| `DEALER.REQUEST_APPROVED` / `REJECTED` / `NEEDS_INFO` / `SUSPENDED` / `OVERRIDDEN` | التجار | متوسطة ← عالية |
| `COMPANY.UPDATED` / `SEAL_UPLOADED` / `SIGNATURE_UPLOADED` | بيانات رسمية | عالية |
| `DEPT.*` · `MODULE.TOGGLED` · `WAREHOUSE.*` | الهيكل | متوسطة ← عالية (الموديول) |
| `POLICY.APPROVAL_CHANGED` / `NUMBERING_CHANGED` / `FINANCE_CHANGED` / `SECURITY_CHANGED` | السياسات | عالية |
| `APPROVAL.APPROVED` / `REJECTED` / `DELEGATED` / `CHANGES_REQUESTED` | القرارات | عالية |
| `PRICELIST.CHANGED` | قوائم الأسعار | عالية |
| `EXPORT.AUDIT` / `EXPORT.REPORT` / `EXPORT.DATA` | التصدير | عالية |
| `ACCESS.DENIED` | محاولة وصول ممنوعة | معلومة |
| `SETTINGS.CHANGED` / `NOTIFICATION.RULE_CHANGED` / `INTEGRATION.CHANGED` | الإعدادات | متوسطة ← عالية |

---

## الكيانات الأساسية (Data Model — مستوى مفاهيمي)

| الكيان | أهم الحقول | ملاحظات |
|--------|-----------|---------|
| **User** | id · name · email (unique) · phone · role_id · department_id · manager_id · warehouse_ids[] · status · mfa_enabled · locale · last_login_at · created_by | `status`: active · pending · disabled · locked |
| **Role** | id · name_ar · name_en · description · is_system · is_protected | `Super Admin` محمي |
| **RolePermission** | role_id · resource · action(s) · scope | scope: own/team/department/all |
| **SensitiveGrant** | role_id · key | الصلاحيات الحساسة |
| **Department** | id · name · manager_id · parent_id · active | |
| **Module** | key · enabled · locked · phase | `super_admin` locked |
| **Warehouse** | id · code · name · type(FG/RM/WIP) · manager_id · active | |
| **Currency/Unit** | code · symbol · decimals · conversion rules | EGP فقط v1 |
| **ApprovalRule** | id · trigger_type · threshold{Open} · chain[] · escalation{Open} | |
| **ApprovalRequest** | id · type · requester_id · payload · status · current_step · decided_by · reason | |
| **DocumentSequence** | doc_type · prefix · format · last_number · locked_after_first | |
| **DocumentTemplate** | doc_type · language · show_seal · show_signature | 11 قالب |
| **Session / Device** | id · user_id · platform · ip · last_active · push_token_status | |
| **DealerRequest / DealerAccount** | id · company · contact · city · docs[] · status · reviewer · customer_id · price_list_id | حساب خارجي منفصل (بند 34) |
| **Customer / Supplier** | id · code · name · type · city · contacts[] · sales_rep_id · price_list_id · status | الرصيد قراءة فقط |
| **PriceList** | id · name · items[] · assigned_to[] | بند 31 |
| **AuditEntry** | (الحقول الثابتة أعلاه) | append-only |
| **NotificationRule** | event · recipient_role · channel · enabled | معطّلة حتى اعتماد التشغيل |
| **Setting** | key · value · updated_by · updated_at | كل تغيير = Audit |

---

## آلات الحالة (Status Machines)

- **User:** `pending` ─(تفعيل بالرابط)→ `active` ─(محاولات فاشلة)→ `locked` ─(فك قفل)→ `active` · `active` ⇄ `disabled`.
- **DealerRequest:** `pending_review` → `approved` | `rejected` | `needs_info` (← يرجع `pending_review` بعد الاستكمال) · الحساب بعد الاعتماد: `active` ⇄ `suspended`.
- **ApprovalRequest:** `pending` → `approved` | `rejected` | `changes_requested` (← `pending`) | `delegated`.
- **Role:** `draft` → `active` → (حذف مسموح فقط لو 0 مستخدمين).

---

## حالات الواجهة الموحّدة (لكل شاشة)
تحميل (skeleton) · فاضي (+ إجراء) · خطأ (+ إعادة محاولة) · ممنوع · مقفول بسبب · Placeholder · صلاحيات اتغيّرت.
