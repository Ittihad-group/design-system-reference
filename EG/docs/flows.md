# Key flows

> Status: scaffold — diagram each flow before UI polish

## Auth

1. Login (بريد + كلمة مرور) → session → landing حسب الدور (RBAC)
2. نسيت كلمة السر → استعادة ذاتية بالبريد أو طلب إعادة تعيين من Super Admin (Pending Confirmation)
3. خمول → قفل تلقائي → إعادة تحقق (بصمة/PIN لاحقاً)

## Sales order

1. Customer select → lines → submit → **مراجعة** → confirm (بصلاحية الاعتماد) → payment status
2. خصم أو طلب كبير → اعتماد بصلاحية محددة قبل التأكيد

## Create Your Order (Public Catalog → Dealer Portal) — Approved

1. Public Catalog → زر «أنشئ طلبك»
2. تسجيل الدخول — تاجر مسجل يدخل بحسابه · عميل جديد ينشئ حساباً ويرسل طلب تسجيل كتاجر (يوافق عليه فريق المبيعات)
3. إضافة المنتجات → تحديد الكمية والمقاس واللون
4. مراجعة الطلب → إرسال
5. يُنشأ طلب جديد في النظام ويظهر في موديول المبيعات للمراجعة والتأكيد (لا تأكيد تلقائي)
6. التاجر يتابع الحالة، يعيد الطلب من سابق، يرى عروض الأسعار والفواتير المسموحة له

## Inventory reservation

1.

## Production work order

1. Create WO → assign line → progress → complete → FG stock

## Purchase order

1.

## Website lead / contact

1.

## Mobile quick actions

1. إشعار (FCM/APNs) → زر الإجراء → **تحقق من الصلاحية** → تنفيذ أو رفض برسالة واضحة
2. بدون اتصال: العرض والعمليات المسموحة فقط تُسجَّل محلياً ثم تُزامَن؛ العمليات المالية والاعتماد الحساس غير متاحة
