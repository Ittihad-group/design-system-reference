# PDF documents

> Live: `../documents.html` · Styles: `../css/print.css` · Samples: `../assets/samples/*.pdf`

## Templates (6) → ~25 document types

| Template | Class hook | Serves |
|----------|-----------|--------|
| invoice | `data-doc="invoice"` | quotation, sales order, invoice, purchase order, cash/payment voucher |
| delivery | `delivery` | delivery note, stock in/out vouchers, goods receipt |
| statement | `statement` | customer / supplier statement, AR aging |
| report | `report` | monthly sales, stock balance, low stock, daily production, treasury, executive summary, attendance |
| workorder | `workorder` | production work order, QC sheet |
| payslip | `payslip` | payslip, official letters |

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
