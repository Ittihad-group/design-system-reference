# Surface — EG-Mobile (Flutter)

## Design essentials

Auth, component kit, screen skeletons and notification system: see [`docs/mobile.md`](../mobile.md) and the visual reference `mobile.html`.

## Purpose

Companion mobile ERP for plant staff.

## Modules (aligned with EG-System)

Login · Dashboard · Products · Inventory · Sales · Production · Customers · Finance · Settings

## Navigation

شريط سفلي (Pending Confirmation): Home · Sales · Production · Stock · More. تظهر التبويبات حسب صلاحيات المستخدم، وباقي الوحدات (Products, Customers, Finance, Settings) داخل More.

## Offline / sync

Pending Confirmation: Offline محدود (عرض البيانات المحمّلة + تسجيل عمليات مسموحة + مزامنة). **Approved:** لا عمليات مالية ولا اعتماد حساس دون اتصال.

## Auth & security

بريد + كلمة مرور، إعادة تعيين، استعادة ذاتية، قفل تلقائي بعد خمول (Pending Confirmation). بصمة/PIN لاحقاً. تسجيل الخروج وحماية البيانات على الجهاز المشترك (Approved).

## Push

FCM + APNs (Approved). تصنيف Urgent / Action / Info (Pending Confirmation). لا إجراء حساس من إشعار دون التحقق من الصلاحية (Approved).

## Notes

-
