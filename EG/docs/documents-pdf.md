# PDF documents

> Live: `../documents.html` (عربي) · `../documents-en.html` (English) · Styles: `../css/print.css` · Samples: `../assets/samples/*.pdf` و`../assets/samples/en/*.pdf`

## Templates (11) → ~30 document types

| Template | Class hook | Serves |
|----------|-----------|--------|
| invoice | `data-doc="invoice"` | quotation, sales order, invoice, purchase order, cash/payment voucher |
| delivery | `delivery` | delivery note, stock in/out vouchers, goods receipt |
| statement | `statement` | customer / supplier statement, AR aging |
| report | `report` | monthly sales, stock balance, low stock, daily production, treasury, executive summary, attendance |
| workorder | `workorder` | production work order, QC sheet |
| payslip | `payslip` | payslip, official letters |
| quotation | `quotation` | عرض سعر (صلاحية، شروط، موافقة العميل) |
| voucher | `voucher` | سند قبض / سند صرف (المبلغ، طريقة الدفع، توزيع على الفواتير) |
| payroll | `payroll` | كشف مرتبات الشهر (سري، اعتماد HR + حسابات + مدير عام) |
| aging | `aging` | أعمار الديون (شريط تراكمي + جدول عملاء × فترات + إجراءات تحصيل) |
| proforma | `proforma` | فاتورة مبدئية للتاجر: تتكوّن ديناميكياً في الكتالوج، وتحمل «سيتصل بك ممثل المبيعات لتأكيد الطلب». ليست فاتورة ضريبية |

## Spec

A4 210×297mm · margins 14mm · header (logo + title pill + number/date/status) · footer (company data, ISO badges, page n/N) · body 9.5pt, tables 9pt, min 8pt · light table headers, solid navy only for title pill and grand total · numbers Latin tabular · placeholders (`.ph`) for tax / commercial register until Settings supplies them.

## Generate a PDF

Browser: open `documents.html` → "طباعة / حفظ PDF" (prints only that template).
Headless: `chrome --headless=new --no-pdf-header-footer --virtual-time-budget=10000 --print-to-pdf=out.pdf "file:///…/documents.html?doc=invoice"`
In production render the same HTML server-side with real data and the same `print.css`.

## الترقيم والفاتورة الإلكترونية

- الترقيم المبدئي (Pending Confirmation، قابل للتعديل من إعدادات النظام): `INV-` Invoice · `DN-` Delivery Note · `WO-` Work Order · `ST-` Stock Transfer · `PS-` Purchase Order. العينات: كشف الحساب `SOA-` وكشف المرتب `PAY-` (Placeholders لتفادي التعارض مع ST- وPS-)؛ التقرير `RP-`.
- **Approved:** حقول الرقم الضريبي والسجل التجاري والعنوان الرسمي والتواصل قابلة للتعديل (Placeholders حالياً)، وأماكن الختم والتوقيع، ودعم العربية والثنائية.
- **Approved:** ملف PDF العادي **ليس** فاتورة إلكترونية معتمدة. الفاتورة الإلكترونية (QR) Pending Confirmation ومفصولة عن إصدار الفاتورة الداخلية.

### بادئات القوالب الإضافية (مقترحة — Pending، بنود 14 و47)

`QT-` عرض سعر · `RV-` سند قبض · `PV-` سند صرف · `PR-` كشف مرتبات · `AG-` أعمار الديون · `PF-` فاتورة مبدئية. مرتبطة بالصفحة `../finance-hr.html` (ديمو المالية والـHR).

> **تنبيه:** الضريبة (نسبة نموذجية 14%)، والأسعار، والأرقام في كل قوالب العينات توضيحية وغير معتمدة (بنود 37 و38). ملف PDF العادي ليس فاتورة إلكترونية معتمدة (Approved، بند 28)، وتكامل مصلحة الضرائب تنفيذه Open (بنود 12 و43).


## النسخة الإنجليزية (EN · LTR)

النظام يُصدر المستندات والتقارير **بالعربية والإنجليزية**، فلكل قالب نسخة إنجليزية بنفس الشبكة والترويسة والتذييل والألوان، معكوسة لاتجاه القراءة من اليسار لليمين (الأقواس `lang="en" dir="ltr"` والـCSS يعتمد خصائص منطقية `inline-start/end` فينقلب التخطيط تلقائياً).

| | العربي (RTL) | الإنجليزي (LTR) |
|---|---|---|
| قوالب المالية (11) | `documents.html` → `assets/samples/<id>.pdf` | `documents-en.html` → `assets/samples/en/<id>.pdf` |
| قوالب HR (17) | `hr-documents.html` → `assets/samples/hr/<id>.pdf` | `hr-documents-en.html` → `assets/samples/en/hr/<id>.pdf` |
| كل القوالب معاً | `assets/samples/all-templates.pdf` | `assets/samples/en/all-templates.pdf` |

**قواعد النسخة الإنجليزية**

- **نفس الهيكل بالضبط:** نفس الوسوم والـclasses وعدد الصفوف والأعمدة؛ تتغير النصوص فقط. الأرقام والتواريخ (`YYYY-MM-DD`) ومعرّفات المستند والـSKU لاتينية كما هي.
- **الترويسة:** شارة العنوان بالإنجليزية، وتحتها العنوان العربي كعنوان فرعي صغير (ثنائي اللغة). الحقول: No. · Date · Status (· Confidentiality في HR). الأرقام الضريبية والسجل التجاري Placeholders كما في العربي (Tax ID · C.R.).
- **التذييل:** `shortName.en` و`address.en` من `js/demo-data.js` + Hotline + شارات ISO.
- **العملة والمبلغ كتابةً:** «جنيه مصري» → EGP، والمبلغ بالحروف الإنجليزية (مثال: *Sixty-three thousand two hundred and three Egyptian pounds and eighty-eight piasters only*).
- **الأسماء التجريبية:** تُنقحر لاتينياً بشكل ثابت (مقاولات النيل → Nile Contracting).
- **القاموس:** الحالات (Draft · Confirmed · Partial · Paid · Approved · Awaiting signature …) ودرجات السرية (Confidential · Strictly confidential · Restricted) موحّدة في كل القوالب.
- **عقود العمل:** العقد المكتوب يبقى **بالعربية** (يُوقَّع 4 نسخ)؛ النسخة الإنجليزية نسخة مجاملة للاطلاع، والنصوص القانونية ما زالت Pending مراجعة المستشار (نفس حالة العربي).
- **لا تضيف/تحذف صفوفاً** في أي لغة: أي تعديل على قالب يُطبَّق على النسختين معاً.

**التوليد:** نفس الأمر لكن على صفحة `-en`:

```
chrome --headless=new --no-pdf-header-footer --virtual-time-budget=10000 \
  --print-to-pdf=assets/samples/en/invoice.pdf "file:///…/documents-en.html?doc=invoice"
chrome … --print-to-pdf=assets/samples/en/hr/offer.pdf "file:///…/hr-documents-en.html?doc=offer"
chrome … --print-to-pdf=assets/samples/en/all-templates.pdf "file:///…/documents-en.html"   # الـ11 صفحة
```

> الإنتاج: يُرندَر نفس القالب من الخادم بلغة المستند (`ar` أو `en`) مع نفس `print.css`؛ لغة المستند خاصية على المستند لا على واجهة المستخدم (Pending Confirmation: هل يُصدَر العميل الأجنبي دائماً بالإنجليزية؟ — بند مفتوح).
