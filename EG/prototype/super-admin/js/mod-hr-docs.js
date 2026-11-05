/* EG HR prototype — mod-hr-docs.js  (HR-29 مركز المستندات · HR-28 التقارير)
   Routes : #/hr/documents (templates · log · settings, ?tab=)  ·  #/hr/reports (hub)  ·  #/hr/reports/RPT-HR-02 … (viewer)
   Specs  : docs/hr/08-documents-reports.md · docs/documents-audit.md · visual targets hr-documents.html, reports.html
   Depends on mod-hr-exit.js (loaded just before) for SA.hrUtil (tafqit, numbering, date helpers).

   COLLECTIONS (guarded, idempotent — meta.hrDocsSeeded):
     issuedDocs[]   append-only issuance log: { id, number|null, type, templateName, templateVersion, employeeId, subjectName, tier, status:draft|pending_approval|issued|cancelled|superseded,
                    purpose, addressee, snapshot (frozen JSON of fields + employee data at issue time), hash (SHA-256), preparedBy, approvedBy, issuedBy, issuedAt, official:false, printLog[], cancel*, supersedes… }
     reportViews[]  saved report views { id, reportId, name, filters, ownerId }     ·    hrComplianceItems[] (DEMO expiries — only if no other module owns expiry data)

   PUBLIC API — other modules MUST call this so their documents appear in the issuance log:
     SA.hrDocs.issue({ type, employeeId, fields, purpose?, addressee?, docNo?, refs?, approved?, approvedBy?, status? }) → record | null
         type ∈ offer | contract | confirmation | warning | deduction | leave | overtime | loan | salary_cert | experience_cert | resignation_accept | clearance | final_settlement | incident | attendance_sheet | regulations_ack | custody_receipt
         docNo : number owned by the source module (e.g. leave id 'LV-2026-0002', settlement 'FS-2026-0001') — otherwise the number is allocated atomically from settings.numbering (never re-used).
         approved:true when the caller already ran the approval (no second preparer≠approver step). Templates that require approval return status 'pending_approval' (no number, DRAFT watermark) until an approver ≠ preparer approves in the log.
         Returns null (with a toast) when the user lacks hr.documents.issue or the tier gate (T3 hr.salary.view · T4 hr.discipline.view).
     SA.hrDocs.open({ type, employeeId, fields, docNo?, draft?, purpose?, refs? }) → A4 preview modal (print / issue)      SA.hrDocs.view(issuedId) → viewer of the immutable copy
     SA.hrDocs.templates · SA.hrDocs.log() · SA.hrDocs.approve(id) · SA.hrDocs.cancel(id) · SA.hrDocs.print(node, label)
   Print: window.print() + print stylesheet (only the A4 sheet is printed). A plain PDF/print is NOT an official e-document (بند 28).
   Reports: SA.hrReports.list · SA.hrReports.run(code, filters). Export needs hr.reports.export (+ hr.salary.view for wage columns, + hr.export.sensitive & Step-up when wages are included), audited as EXPORT.REPORT / HR.EXPORT.SENSITIVE. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store; const U = SA.hrUtil;
  if (!U) { console.error('[mod-hr-docs] mod-hr-exit.js must load first (SA.hrUtil missing)'); return; }
  const { tafqit, ymd, parse, addDays, addMonths, diffDays, nextNumber, r2, nf } = U; const money = (n) => nf(n) + ' ج.م';
  const today = () => ymd(); const num = (t) => h('span.num', {}, t);
  const me = () => SA.session.user; const emp = (id) => st.find('employees', id); const dept = (id) => SA.deptName(id);
  const canSal = () => SA.canSensitive('hr.salary.view'); const canT4 = () => SA.canSensitive('hr.discipline.view');
  const isApprover = () => { const u = me(); return !!u && (u.roleId === 'R-11' || u.roleId === 'R-01'); };
  const chip = (t, k) => SA.chip(t, k); const uname = (id) => (id ? SA.userName(id) : '—');
  const gate = (perm) => (SA.can(perm) ? '' : 'ليست من صلاحياتك (' + perm + ')');
  const dnum = (s) => (s ? num(s) : h('span.sap-dash', {}, '—'));
  const reg = (def) => { const old = SA.moduleById(def.id); if (old) { def.order = old.order; def.group = old.group; def.icon = def.icon || old.icon; } return SA.register(def); };
  const pageDeny = (root, perm) => { const d = SA.guard(perm); if (d) { root.append(d); return true; } return false; };
  const specLink = (href, label) => h('a.sap-linkbtn', { href: '../../' + href, target: '_blank', rel: 'noopener' }, (label || 'المواصفة الكاملة') + ' ↗');
  const simulateState = (root, build) => { const host = h('div'); root.append(host); let dead = false, cleanup = null; const go = () => { SA.clear(host); host.append(SA.skeleton({ kind: 'table', rows: 6 })); SA.delay(260, { write: false }).then(() => { if (dead) return; SA.clear(host); cleanup = build(host); }, (e) => { if (dead) return; SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: go })); }); }; go(); return () => { dead = true; if (typeof cleanup === 'function') cleanup(); }; };
  function modalForm(o) { const grp = SA.form.group(o.fields.filter(Boolean)); let m; const submit = h('button.btn.' + (o.danger ? 'btn-accent' : 'btn-primary'), { type: 'button', onclick: async () => { if (!grp.validate()) return; if (o.validate) { const er = o.validate(grp.get()); if (er) { SA.toast(er, 'error'); return; } } m.setBusy(true); let ok = true; try { ok = await o.onSubmit(grp.get()); } catch (e) { SA.fail(e); ok = false; } m.setBusy(false); if (ok !== false) m.close(true); } }, o.submitLabel || 'حفظ'); m = SA.modal({ title: o.title, subtitle: o.subtitle, icon: o.icon || 'edit', size: o.size || 'md', danger: o.danger, body: h('div.sap-confirm', {}, o.intro || null, o.fields.filter(Boolean).map((f) => f.el), o.extra || null, h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), o.note || 'هيتسجّل في سجل التدقيق باسمك مع الوقت.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), submit] }); return m; }

  /* ───────────────────────── SHA-256 (immutable copy fingerprint) ───────────────────────── */
  function sha256(str) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const bytes = Array.from(unescape(encodeURIComponent(str))).map((c) => c.charCodeAt(0)); const l = bytes.length * 8; bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (l >>> (i * 8)) & 255);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]; const rr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      const w = new Array(64); for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++) { const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[i] + w[i]) | 0, S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) | 0; hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + hh) | 0;
    }
    return H.map((x) => ('00000000' + (x >>> 0).toString(16)).slice(-8)).join('');
  }

  /* ───────────────────────── catalog ───────────────────────── */
  [['HR.DOC.DRAFT_SAVED', 'حفظ مسودة مستند', 'info'], ['HR.DOC.REQUESTED', 'طلب مستند', 'info'], ['HR.DOC.APPROVED', 'اعتماد مستند', 'high'], ['HR.DOC.ISSUED', 'إصدار مستند (حجز رقم + بصمة)', 'high'], ['HR.DOC.CANCELLED', 'إلغاء مستند صادر', 'high'], ['HR.DOC.SUPERSEDED', 'استبدال مستند صادر', 'high'], ['HR.DOC.DOWNLOADED', 'تنزيل مستند', 'info'], ['HR.DOC.REPRINTED', 'طباعة / إعادة طباعة مستند', 'medium'], ['HR.DOC.ACCESS_DENIED', 'محاولة وصول لمستند مقيّد', 'info'], ['HR.REPORT.SAVED_VIEW', 'حفظ عرض تقرير', 'info']].forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'hr'));

  /* tiers: T1 داخلي · T2 مقيّد · T3 سري (hr.salary.view) · T4 سري جدًا (hr.discipline.view) */
  const TIER = { T1: ['T1 · داخلي', 'neutral'], T2: ['T2 · مقيّد', 'info'], T3: ['T3 · سري', 'warning'], T4: ['T4 · سري جدًا', 'danger'] };
  const tierGate = (t) => (t === 'T3' && !canSal() ? 'يتطلب hr.salary.view (T3)' : t === 'T4' && !canT4() ? 'يتطلب hr.discipline.view (T4)' : '');
  const f = (k, label, type, o) => Object.assign({ k, label, type: type || 'text' }, o || {});
  const TEMPLATES = [
    { key: 'offer', docNo: 'DOC-HR-04', name: 'خطاب عرض العمل', en: 'Offer Letter', prefix: 'OFR', tier: 'T3', cat: 'hire', issuer: 'HR Officer (إعداد)', approver: 'HR Manager', lang: 'عربي', approval: 'manager', ready: [], fields: [f('position', 'الوظيفة', 'text', { req: 1 }), f('startDate', 'تاريخ البدء المقترح', 'date', { req: 1 }), f('probation', 'فترة التجربة (أشهر)', 'number', { hint: 'حتى 3 أشهر مرة واحدة [Law]' }), f('basic', 'الأجر الأساسي', 'number', { req: 1, wage: 1 }), f('allowances', 'البدلات', 'number', { wage: 1 }), f('validUntil', 'صلاحية العرض حتى', 'date', { req: 1 })] },
    { key: 'contract', docNo: 'DOC-HR-07', name: 'عقد عمل (غير محدد المدة)', en: 'Employment Contract', prefix: 'CTR', tier: 'T3', cat: 'hire', issuer: 'HR Officer', approver: 'HR Manager ثم المفوّض بالتوقيع (D14)', lang: 'عربي إلزامي (م.89)', approval: 'manager', ready: ['المفوّض بالتوقيع {Open — D14}'], fields: [f('position', 'الوظيفة', 'text', { req: 1 }), f('startDate', 'تاريخ البدء', 'date', { req: 1 }), f('basic', 'الأجر الأساسي', 'number', { req: 1, wage: 1 }), f('allowances', 'البدلات', 'number', { wage: 1 }), f('hours', 'ساعات العمل الأسبوعية', 'number', { hint: 'الحد القانوني Pending' })] },
    { key: 'confirmation', docNo: 'DOC-HR-15', name: 'خطاب تثبيت بعد التجربة', en: 'Probation Confirmation Letter', prefix: 'CNF', tier: 'T3', cat: 'hire', issuer: 'HR Officer', approver: 'HR Manager', lang: 'عربي', approval: 'manager', ready: [], isNew: 1, fields: [f('position', 'الوظيفة', 'text', { req: 1 }), f('confirmDate', 'تاريخ التثبيت', 'date', { req: 1 })] },
    { key: 'warning', docNo: 'DOC-HR-31', name: 'إنذار كتابي', en: 'Written Warning', prefix: 'WRN', tier: 'T4', cat: 'discipline', issuer: 'HR Manager (يقرّر ويصدر)', approver: 'GM لو الجزاء أشد {Open}', lang: 'عربي', approval: 'none', ready: ['بند اللائحة {Open — D10}'], fields: [f('violation', 'المخالفة المنسوبة', 'textarea', { req: 1 }), f('violationDate', 'تاريخ المخالفة', 'date', { req: 1 }), f('hearingDate', 'تاريخ جلسة السماع', 'date', { req: 1 }), f('clause', 'بند اللائحة', 'text', { hint: '{Open — D10}' })] },
    { key: 'deduction', docNo: 'DOC-HR-24', name: 'إخطار خصم (جزاء مالي)', en: 'Deduction Notice', prefix: 'DED', tier: 'T4', cat: 'discipline', issuer: 'HR Manager', approver: 'GM عند تجاوز الصلاحية {3 أيام Pending}', lang: 'عربي', approval: 'none', ready: ['الأسقف Pending (م.143)'], wage: 1, fields: [f('days', 'عدد أيام الخصم', 'number', { req: 1, hint: 'الأسقف {5 أيام} للمخالفة و{5} شهريًا — Pending' }), f('reason', 'سبب الخصم', 'textarea', { req: 1 })] },
    { key: 'leave', docNo: 'DOC-HR-16', name: 'طلب إجازة / إذن اعتماد', en: 'Leave Request & Approval Slip', prefix: 'LV', tier: 'T2', cat: 'time', issuer: 'النظام (تلقائي)', approver: 'المشرف المباشر ثم HR', lang: 'عربي', approval: 'none', ready: [], fields: [f('leaveType', 'نوع الإجازة', 'select', { req: 1, opts: [['annual', 'اعتيادية'], ['sick', 'مرضية'], ['casual', 'عارضة']] }), f('from', 'من', 'date', { req: 1 }), f('to', 'إلى', 'date', { req: 1 }), f('days', 'عدد الأيام', 'number', { req: 1 })] },
    { key: 'overtime', docNo: 'DOC-HR-18', name: 'إذن عمل ساعات إضافية', en: 'Overtime Authorisation', prefix: 'OT', tier: 'T2', cat: 'time', issuer: 'المشرف (طلب)', approver: 'مدير الإنتاج + إخطار الجهة خلال 7 أيام', lang: 'عربي', approval: 'manager', ready: ['إجراء إخطار الجهة Unverified'], fields: [f('date', 'تاريخ العمل الإضافي', 'date', { req: 1 }), f('hours', 'عدد الساعات', 'number', { req: 1 }), f('reason', 'سبب العمل الإضافي', 'textarea', { req: 1 })] },
    { key: 'loan', docNo: 'DOC-HR-22', name: 'عقد سلفة وجدول سداد', en: 'Advance / Loan Agreement', prefix: 'LN', tier: 'T3', cat: 'pay', issuer: 'HR Officer', approver: 'المالية ≠ من أنشأ', lang: 'عربي', approval: 'manager', ready: ['أساس سقف 10% {Open}'], fields: [f('amount', 'مبلغ السلفة', 'number', { req: 1, wage: 1 }), f('installments', 'عدد الأقساط', 'number', { req: 1 }), f('startMonth', 'بداية الخصم (YYYY-MM)', 'text', { req: 1 })] },
    { key: 'salary_cert', docNo: 'DOC-HR-46', name: 'شهادة مرتب (تعريف بالراتب)', en: 'Salary Certificate', prefix: 'CER', tier: 'T3', cat: 'pay', issuer: 'HR Officer', approver: 'HR Manager (يعتمد ويوقّع)', lang: 'ثنائي: عربي + إنجليزي', approval: 'manager', ready: ['الختم وQR [New]'], needPurpose: true, fields: [f('withSalary', 'إظهار الراتب (بموافقة الموظف)', 'checkbox'), f('validDays', 'مدة الصلاحية', 'number', { hint: '{Open}' })] },
    { key: 'experience_cert', docNo: 'DOC-HR-45', name: 'شهادة خبرة', en: 'Certificate of Service', prefix: 'CER', tier: 'T2', cat: 'exit', issuer: 'HR Officer', approver: 'HR Manager', lang: 'عربي', approval: 'manager', ready: ['الختم'], needPurpose: true, fields: [f('from', 'تاريخ البدء', 'date', { req: 1 }), f('to', 'تاريخ الانتهاء', 'date'), f('position', 'نوع العمل / الوظيفة', 'text', { req: 1 }), f('withSalary', 'إظهار الأجر — بطلب الموظف فقط', 'checkbox'), f('withReason', 'إظهار سبب الإنهاء — بطلب الموظف فقط', 'checkbox')] },
    { key: 'resignation_accept', docNo: 'DOC-HR-38', name: 'قبول استقالة', en: 'Resignation Acceptance', prefix: 'RSG', tier: 'T4', cat: 'exit', issuer: 'HR Officer', approver: 'HR Manager', lang: 'عربي', approval: 'manager', ready: ['إجراء التصديق غير مؤكد'], isNew: 1, fields: [f('letterDate', 'تاريخ خطاب الاستقالة', 'date', { req: 1 }), f('acceptedOn', 'تاريخ القبول', 'date', { req: 1 }), f('lastWorkingDay', 'آخر يوم عمل', 'date')] },
    { key: 'clearance', docNo: 'DOC-HR-42', name: 'إخلاء طرف', en: 'Clearance Form', prefix: 'CLR', tier: 'T3', cat: 'exit', issuer: 'HR Officer', approver: 'كل قسم يوقّع بنده', lang: 'عربي', approval: 'none', ready: [], fields: [f('lastWorkingDay', 'آخر يوم عمل', 'date')] },
    { key: 'final_settlement', docNo: 'DOC-HR-43', name: 'مخالصة نهائية', en: 'Final Settlement Statement', prefix: 'FS', tier: 'T3', cat: 'exit', issuer: 'Payroll Officer (حساب)', approver: 'HR Manager → المالية (صرف)', lang: 'عربي', approval: 'none', ready: ['نص الإبراء Pending'], fields: [f('lastWorkingDay', 'آخر يوم عمل', 'date')] },
    { key: 'incident', docNo: 'DOC-HR-36', name: 'محضر حادث / إصابة عمل', en: 'Incident Report', prefix: 'INC', tier: 'T4', cat: 'safety', issuer: 'OHS Officer', approver: 'Plant Manager + HR', lang: 'عربي', approval: 'manager', ready: ['نموذج التأمينات Unverified'], fields: [f('date', 'تاريخ ووقت الحادث', 'date', { req: 1 }), f('place', 'المكان', 'text', { req: 1 }), f('description', 'وصف الحادث', 'textarea', { req: 1 }), f('severity', 'الجسامة', 'select', { opts: [['minor', 'بسيطة'], ['lti', 'إصابة مع فقد وقت'], ['major', 'جسيمة']] })] },
    { key: 'attendance_sheet', docNo: 'DOC-HR-53', name: 'كشف حضور شهري', en: 'Monthly Attendance Sheet', prefix: 'ATT', tier: 'T1', cat: 'time', issuer: 'HR Officer / المشرف', approver: 'مدير الإنتاج + HR', lang: 'عربي (أفقي)', approval: 'manager', ready: [], isNew: 1, land: true, fields: [f('month', 'الشهر (YYYY-MM)', 'text', { req: 1 })] },
    { key: 'regulations_ack', docNo: 'DOC-HR-10', name: 'إقرار الاطلاع على لائحة تنظيم العمل', en: 'Work Regulations Acknowledgement', prefix: 'ACK', tier: 'T2', cat: 'hire', issuer: 'HR Officer', approver: 'لا اعتماد (توقيع العامل وشاهد HR)', lang: 'عربي', approval: 'none', ready: ['اعتماد اللائحة {Open — D10}'], isNew: 1, fields: [f('version', 'نسخة اللائحة', 'text', { hint: '{Open — D10}' })] },
    { key: 'custody_receipt', docNo: 'DOC-HR-12', name: 'إيصال تسليم عهدة وزي ووقاية', en: 'Custody & PPE Handover', prefix: 'CUH', tier: 'T2', cat: 'safety', issuer: 'أمين المخزن', approver: 'OHS Officer لقطع الوقاية + HR', lang: 'عربي', approval: 'none', ready: [], isNew: 1, fields: [f('items', 'الأصناف (سطر لكل صنف: الاسم × الكمية)', 'textarea', { req: 1 })] }
  ];
  const CATS = [['all', 'الكل'], ['hire', 'التوظيف'], ['time', 'الوقت والإجازات'], ['pay', 'المرتبات والسلف'], ['discipline', 'الانضباط'], ['exit', 'الإنهاء'], ['safety', 'السلامة']];
  const tplOf = (k) => TEMPLATES.find((t) => t.key === k) || null;
  const company = () => st.get('settings.company') || {};
  const companyReady = () => { const c = company(); const miss = []; if (!c.taxId) miss.push('الرقم الضريبي'); if (!c.commercialReg) miss.push('السجل التجاري'); if (!c.sealUploaded) miss.push('صورة الختم'); if (!c.signatureUploaded) miss.push('التوقيع المعتمد'); return miss; };
  const issuedAll = () => st.get('issuedDocs') || [];

  /* ───────────────────────── css (A4 sheet + module) ───────────────────────── */
  function css() {
    if (document.querySelector('style[data-mod="hr-docs"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'hr-docs');
    s.textContent = `
.sap-a4-scroll{background:#e7ecf4;padding:16px;overflow:auto;border-radius:12px;max-height:68vh}
.sap-a4{width:210mm;min-height:297mm;height:297mm;padding:14mm;margin:0 auto;background:#fff;color:var(--eg-ink,#14213d);position:relative;overflow:hidden;display:flex;flex-direction:column;gap:5mm;font-size:9.5pt;line-height:1.55;box-shadow:0 2px 16px rgba(2,26,67,.18);box-sizing:border-box}
.sap-a4.is-land{width:297mm;min-height:210mm;height:210mm}
.sap-a4 *,.sap-a4 *::before{box-sizing:border-box}.sap-a4 .num{font-family:var(--font-en);font-variant-numeric:tabular-nums;direction:ltr;unicode-bidi:isolate}
.sap-a4 .d-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding-block-end:4mm;position:relative;border-block-end:1.2mm solid var(--eg-navy)}
.sap-a4 .d-head::after{content:"";position:absolute;inset-inline-start:0;inset-block-end:-1.2mm;width:34mm;height:1.2mm;background:var(--eg-red)}
.sap-a4 .d-brand img{height:15mm;width:auto}.sap-a4 .d-brand small{display:block;margin-block-start:1mm;font-size:8pt;color:var(--eg-muted)}
.sap-a4 .d-title{text-align:end;display:flex;flex-direction:column;align-items:flex-end;gap:1.5mm}
.sap-a4 .d-pill{display:inline-block;background:var(--eg-navy);color:#fff;font-weight:700;font-size:13pt;padding:1mm 7mm;border-radius:99px}
.sap-a4 .d-en{font-family:var(--font-en);font-size:8pt;color:var(--eg-muted);letter-spacing:.04em;text-transform:uppercase;direction:ltr}
.sap-a4 .d-meta{display:grid;grid-template-columns:auto auto;gap:0 4mm;font-size:8.5pt;margin:0}.sap-a4 .d-meta dt{color:var(--eg-muted)}.sap-a4 .d-meta dd{margin:0;font-weight:700}
.sap-a4 .d-conf{display:inline-block;background:var(--eg-ink,#14213d);color:#fff;font-size:7.5pt;font-weight:700;padding:.4mm 3mm;border-radius:99px}
.sap-a4 .d-body{flex:1;display:flex;flex-direction:column;gap:4.5mm;min-height:0}
.sap-a4 .d-h{margin:0;font-size:10.5pt;font-weight:700;color:var(--eg-navy)}.sap-a4 p{margin:0}
.sap-a4 .d-box{border:.3mm solid var(--eg-line-strong,#cfd6e4);border-radius:2mm;padding:3mm 4mm}
.sap-a4 .d-kv{display:grid;grid-template-columns:34mm 1fr;gap:.8mm 3mm;font-size:9pt;margin:0}.sap-a4 .d-kv dt{color:var(--eg-muted)}.sap-a4 .d-kv dd{margin:0;font-weight:600}
.sap-a4 table.d-table{width:100%;border-collapse:collapse;font-size:9pt}.sap-a4 .d-table th{background:var(--eg-navy-tint,#e6ecf7);color:var(--eg-navy);text-align:start;font-size:8.5pt;padding:1.6mm 2.2mm;border-block:.3mm solid var(--eg-navy)}
.sap-a4 .d-table td{padding:1.6mm 2.2mm;border-block-end:.2mm solid var(--eg-line,#e3e8f1);vertical-align:top}.sap-a4 .d-table .e{text-align:end}.sap-a4 .d-table tr.tot td{font-weight:700;background:var(--eg-bg-soft,#f6f8fb)}.sap-a4 .d-table tr.net td{background:var(--eg-navy);color:#fff;font-weight:700}
.sap-a4 .d-table.dense{font-size:7.8pt}.sap-a4 .d-table.dense th,.sap-a4 .d-table.dense td{padding:.8mm 1mm;text-align:center}.sap-a4 .d-table.dense td:first-child,.sap-a4 .d-table.dense th:first-child{text-align:start}
.sap-a4 .d-words{border-inline-start:1.2mm solid var(--eg-red);padding:1.5mm 3mm;background:var(--eg-bg-soft,#f6f8fb);font-size:9pt}
.sap-a4 .d-sign{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:6mm;margin-block-start:auto;padding-block-start:3mm}
.sap-a4 .d-sign>div{border-block-start:.3mm solid var(--eg-ink,#14213d);padding-block-start:1.5mm;text-align:center;font-size:8pt;color:var(--eg-muted);min-height:18mm}
.sap-a4 .d-slot{border:.4mm dashed var(--eg-line-strong,#cfd6e4);border-radius:2mm;display:grid;place-items:center;text-align:center;font-size:7.5pt;color:#9aa4b8;padding:2mm;min-height:20mm}
.sap-a4 .d-row{display:flex;gap:5mm;align-items:flex-end;justify-content:space-between}
.sap-a4 .d-foot{display:flex;justify-content:space-between;align-items:center;gap:6mm;padding-block-start:2.5mm;border-block-start:.3mm solid var(--eg-navy);font-size:7.8pt;color:var(--eg-muted)}.sap-a4 .d-foot b{color:var(--eg-ink,#14213d)}
.sap-a4 .d-band{background:var(--color-warning-tint,#fff4d6);border:.3mm solid #e0b84a;padding:1.5mm 3mm;border-radius:2mm;font-size:8.5pt;font-weight:700;color:#8a5a00}
.sap-a4 .d-wm{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:2}
.sap-a4 .d-wm span{font-size:64pt;font-weight:800;color:rgba(2,26,67,.07);transform:rotate(-28deg);white-space:nowrap;letter-spacing:.04em}
.sap-a4 .d-wm.is-demo span{font-size:34pt;color:rgba(2,26,67,.05)}.sap-a4 .d-wm.is-void span{color:rgba(237,28,36,.12)}
.sap-a4 .d-ltr{direction:ltr;text-align:left}
.sap-d-head{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.sap-d-info{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:16px}@media(max-width:1000px){.sap-d-info{grid-template-columns:1fr}}
.sap-d-lock{display:inline-flex;gap:6px;align-items:center;color:var(--eg-muted)}
.sap-d-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-block-end:14px}
.sap-d-fchips{display:flex;gap:8px;flex-wrap:wrap;margin-block:10px}.sap-d-fchip{border:1px solid var(--color-border-strong);background:#fff;border-radius:999px;padding:6px 14px;min-height:36px;cursor:pointer;font:600 var(--text-dense) var(--font-body)}.sap-d-fchip[aria-pressed="true"]{background:var(--eg-navy);color:#fff;border-color:var(--eg-navy)}
.sap-d-tpl{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
.sap-d-tpl>article{border:1px solid var(--sap-hair);border-radius:14px;background:#fff;padding:14px;display:grid;gap:8px}.sap-d-tpl h3{margin:0;font-size:1rem}.sap-d-tpl small{color:var(--eg-muted)}
.sap-d-fields{display:grid;gap:10px;grid-template-columns:1fr 1fr}@media(max-width:700px){.sap-d-fields{grid-template-columns:1fr}}
.sap-d-r-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin-block-end:12px}.sap-d-r-filters .field{min-width:170px;margin:0}
.sap-d-rep{width:100%;border-collapse:collapse}.sap-d-rep th{background:var(--eg-bg-soft,#f6f8fb);text-align:start;font-size:var(--text-caption);padding:9px 10px;border-block-end:1px solid var(--sap-hair);position:sticky;inset-block-start:0}
.sap-d-rep td{padding:9px 10px;border-block-end:1px solid var(--sap-hair)}.sap-d-rep .e{text-align:end}.sap-d-rep tr.tot td{font-weight:700;background:var(--eg-bg-soft,#f6f8fb);border-block-start:2px solid var(--eg-navy)}
.sap-d-rcards{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}.sap-d-rcards>a,.sap-d-rcards>div{display:grid;gap:8px;padding:16px;border:1px solid var(--sap-hair);border-radius:14px;background:#fff;color:inherit;text-decoration:none}
.sap-d-rcards>a:hover{border-color:var(--color-primary);box-shadow:var(--sap-shadow-2)}.sap-d-rcards .is-locked{background:var(--eg-bg-soft,#f6f8fb);color:var(--eg-muted)}
.sap-d-check{display:flex;gap:8px;align-items:flex-start;padding:6px 0}.sap-d-check b{color:var(--color-success)}.sap-d-check.is-bad b{color:var(--color-danger)}
.sap-d-bar{display:flex;align-items:center;gap:8px}.sap-d-bar i{display:block;height:8px;border-radius:99px;background:var(--eg-navy);min-width:2px}
#sap-print-root{display:none}
@media print{
  body.sap-printing{background:#fff!important}
  body.sap-printing>*:not(#sap-print-root){display:none!important}
  body.sap-printing #sap-print-root{display:block!important}
  body.sap-printing .sap-a4{box-shadow:none!important;margin:0!important;break-after:page}
  body.sap-printing .sap-a4.is-land{page:sapland}
  @page{size:A4;margin:0}@page sapland{size:A4 landscape;margin:0}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}`;
    document.head.appendChild(s);
  }

  /* ───────────────────────── A4 renderer ───────────────────────── */
  const bdi = (t) => h('bdi', {}, t == null || t === '' ? '—' : t);
  const kvl = (rows) => h('dl.d-kv', {}, rows.filter(Boolean).map((r) => [h('dt', {}, r[0]), h('dd', {}, r[1] == null || r[1] === '' ? '—' : r[1])]));
  const para = (t) => h('p', {}, t);
  const box = (title, ...kids) => h('div.d-box', {}, title ? h('h4.d-h', { style: { marginBlockEnd: '1.5mm', fontSize: '8.5pt' } }, title) : null, kids);
  const tbl = (head, rows, o) => h('table.d-table' + (o && o.dense ? '.dense' : ''), {}, h('thead', {}, h('tr', {}, head.map((x, i) => h('th', { class: o && o.endCols && o.endCols.indexOf(i) >= 0 ? 'e' : '' }, x)))), h('tbody', {}, rows.map((r) => h('tr', { class: r.cls || '' }, (r.cells || r).map((c, i) => h('td', { class: o && o.endCols && o.endCols.indexOf(i) >= 0 ? 'e' : '', colspan: r.span && i === 0 ? r.span : null }, c))))));
  const slot = (label) => h('div.d-slot', {}, label);
  const sign = (labels) => h('div.d-sign', {}, labels.map((l) => h('div', {}, l)));
  const wageVal = (v, ctx) => (ctx.canWage ? num(nf(+v || 0)) : '••• (سري)');
  function wageAllowed(tpl, ctx) { return ctx.canWage; }

  function bodyOf(tpl, c) { // c = {fields, emp, pos, deptName, number, status, canWage}
    const F = c.fields || {}; const e = c.emp || {}; const nm = bdi(e.name); const pos = F.position || (c.pos && c.pos.title) || '';
    const wm = (w) => (c.canWage ? num(nf(+w || 0)) : '••• (سري)');
    switch (tpl.key) {
      case 'offer': { const tot = (+F.basic || 0) + (+F.allowances || 0); return [para(['السيد/ة ', h('b', {}, nm), '، تحية طيبة وبعد: يسر الشركة أن تعرض عليكم العمل بوظيفة «', bdi(pos), '» اعتبارًا من ', num(F.startDate || '—'), ' وفق الشروط التالية (ليس عقد عمل):']), box('مكونات الأجر الشهري', tbl(['البند', 'المبلغ (ج.م)'], [['الأجر الأساسي', wm(F.basic)], ['البدلات', wm(F.allowances)], { cls: 'tot', cells: ['الإجمالي الشهري', wm(tot)] }], { endCols: [1] })), kvl([['فترة التجربة', F.probation ? F.probation + ' أشهر (مرة واحدة)' : '{Open}'], ['شروط السريان', 'كشف طبي + استكمال المستندات'], ['صلاحية العرض حتى', num(F.validUntil || '—')]]), c.canWage ? h('p.d-words', {}, 'الإجمالي كتابةً: فقط ' + tafqit(tot) + ' لا غير') : null, sign(['مدير الموارد البشرية', 'قبول المرشح (توقيع وتاريخ)'])]; }
      case 'contract': return [para('إنه في يوم ' + today() + ' تحرر هذا العقد بين شركة «' + (company().nameAr || 'الشركة') + '» (صاحب العمل) والسيد/ة ' + (e.name || '') + ' (العامل) على ما يلي (م.89 — الحقول الإلزامية Pending مراجعة قانونية):'), tbl(['البند', 'التفاصيل'], [['1 — الوظيفة', bdi(pos)], ['2 — تاريخ البدء', num(F.startDate || '—')], ['3 — الأجر الأساسي', wm(F.basic)], ['4 — البدلات', wm(F.allowances)], ['5 — ساعات العمل الأسبوعية', num(F.hours || '{Open}')], ['6 — فترة التجربة', 'مرة واحدة حتى 3 أشهر [Law]'], ['7 — الإجازات', 'وفق القانون وسياسة الشركة'], ['8 — الإخطار', '{Open — م.156/157}'], ['9 — مكان العمل', 'مصنع الشركة'], ['10 — بيانات التأمينات', 'حسب المنظومة'], ['11 — اللغة الحاكمة', 'العربية'], ['12 — عدد النسخ', '4 (صاحب العمل · العامل · مكتب التأمينات · الجهة الإدارية المختصة)']]), sign(['صاحب العمل (ختم + توقيع)', 'العامل (توقيع)'])];
      case 'confirmation': return [para(['السيد/ة ', h('b', {}, nm), ' — بعد اجتيازكم فترة التجربة بنجاح تقرر تثبيتكم في وظيفة «', bdi(pos), '» اعتبارًا من ', num(F.confirmDate || '—'), '.']), sign(['مدير الموارد البشرية'])];
      case 'warning': return [para(['إلى السيد/ة ', h('b', {}, nm), ' (', e.empNo || '', ') — ', 'نفيدكم بأنه ثبت ارتكابكم المخالفة التالية بعد سماع أقوالكم بتاريخ ', num(F.hearingDate || '—'), ':']), box('وصف المخالفة', para(bdi(F.violation)), kvl([['تاريخ المخالفة', num(F.violationDate || '—')], ['البند المخالَف من اللائحة', F.clause || '{Open — D10}']])), para('وعليه يُوجَّه إليكم إنذار كتابي. الاستلام لا يعني الموافقة.'), sign(['مدير الموارد البشرية', 'المشرف المبلّغ', 'إقرار استلام العامل'])];
      case 'deduction': { const day = ((+(e.salary || {}).basic || 0) / (U.dayDiv || 30)); const amt = r2(day * (+F.days || 0)); return [para(['إخطار بخصم ', h('b', {}, (F.days || 0) + ' يوم'), ' من أجر السيد/ة ', h('b', {}, nm), ' بسبب: ', bdi(F.reason)]), kvl([['أجر اليوم (الأساسي ÷ 30)', wm(day)], ['قيمة الخصم', wm(amt)], ['السقف', '≤ {5 أيام} للمخالفة و{5} في الشهر [Pending]']]), sign(['مدير الموارد البشرية', 'استلام العامل'])]; }
      case 'leave': return [kvl([['الموظف', nm], ['نوع الإجازة', ({ annual: 'اعتيادية', sick: 'مرضية', casual: 'عارضة' })[F.leaveType] || F.leaveType], ['من', num(F.from || '—')], ['إلى', num(F.to || '—')], ['عدد الأيام', num(F.days || '—')]]), box('الاعتمادات (توقيع إلكتروني مع الطابع الزمني)', para('المشرف المباشر ← HR (مصفوفة الاعتماد {Open}). لا ختم.')), sign(['المشرف المباشر', 'الموارد البشرية', 'الموظف'])];
      case 'overtime': return [kvl([['الموظف', nm], ['التاريخ', num(F.date || '—')], ['الساعات', num(F.hours || '—')], ['السبب', bdi(F.reason)]]), para('إخطار الجهة الإدارية خلال 7 أيام [Law · الإجراء Unverified].'), sign(['المشرف', 'مدير الإنتاج', 'موافقة العامل'])];
      case 'loan': { const n = +F.installments || 1; const per = r2((+F.amount || 0) / n); const cap = r2(((e.salary ? (+e.salary.basic + +e.salary.allowances) : 0)) * 0.1); return [kvl([['الموظف', nm], ['مبلغ السلفة', wm(F.amount)], ['عدد الأقساط', num(n)], ['القسط الشهري', wm(per)], ['بداية الخصم', num(F.startMonth || '—')], ['سقف القسط (10% — Open)', wm(cap) , c.canWage && per > cap ? ' ⚠ يتجاوز السقف' : '']]), tbl(['#', 'الشهر', 'القسط'], Array.from({ length: Math.min(n, 12) }, (_, i) => [num(i + 1), num(addMonths((F.startMonth || today().slice(0, 7)) + '-01', i).slice(0, 7)), wm(per)]), { endCols: [2], dense: true }), sign(['العامل (موافقة كتابية على الخصم)', 'الموارد البشرية', 'المالية'])]; }
      case 'salary_cert': return [h('div.d-row', {}, para(['تشهد شركة «' + (company().nameAr || '') + '» بأن السيد/ة ', h('b', {}, nm), ' يعمل لديها بوظيفة «', bdi(pos), '» منذ ', num(e.hireDate || '—'), F.withSalary && c.canWage ? ' ويتقاضى راتبًا شهريًا إجماليًا قدره ' : '', F.withSalary && c.canWage ? h('b', {}, num(nf(((e.salary || {}).basic || 0) + ((e.salary || {}).allowances || 0)))) : '', F.withSalary && c.canWage ? ' ج.م.' : '.', ' وقد أُعطيت هذه الشهادة بناءً على طلبه لتقديمها إلى: ', bdi(c.addressee || '—'), ' (الغرض: ', bdi(c.purpose || '—'), ').']), slot('QR تحقق [New] — ' + (c.token || '—'))), h('p.d-ltr', {}, 'This is to certify that ' + (e.name || '') + ' is employed at the Company since ' + (e.hireDate || '') + (F.withSalary && c.canWage ? ' with a gross monthly salary of EGP ' + nf(((e.salary || {}).basic || 0) + ((e.salary || {}).allowances || 0)) : '') + '. The Arabic text prevails.'), sign(['مدير الموارد البشرية'])];
      case 'experience_cert': return [para(['تشهد شركة «' + (company().nameAr || '') + '» بأن السيد/ة ', h('b', {}, nm), ' عمل لديها بوظيفة «', bdi(F.position || pos), '» في الفترة من ', num(F.from || e.hireDate || '—'), ' إلى ', num(F.to || '—'), '.']), F.withSalary && c.canWage ? para(['آخر أجر شهري إجمالي: ', num(nf(((e.salary || {}).basic || 0) + ((e.salary || {}).allowances || 0))), ' ج.م (بطلب العامل).']) : null, F.withReason ? para('سبب انتهاء الخدمة: بطلب العامل.') : null, para('وقد أُعطيت هذه الشهادة بناءً على طلبه دون أي مسؤولية أخرى على الشركة.'), h('div.d-row', {}, sign(['مدير الموارد البشرية']), slot('QR تحقق [New] — ' + (c.token || '—')))];
      case 'resignation_accept': return [para(['إلى السيد/ة ', h('b', {}, nm), ' — بالإشارة إلى خطاب استقالتكم بتاريخ ', num(F.letterDate || '—'), ' نفيدكم بقبول الاستقالة بتاريخ ', num(F.acceptedOn || '—'), '، وآخر يوم عمل لكم هو ', num(F.lastWorkingDay || '—'), '.']), para('لا استقالة موقّعة مسبقًا — الخطاب بتاريخه وإقرار الموظف (م.167).'), sign(['مدير الموارد البشرية', 'إقرار استلام العامل'])];
      case 'clearance': { const items = F.items || []; const done = items.length && items.every((i) => i.signed); return [kvl([['الموظف', nm], ['آخر يوم عمل', num(F.lastWorkingDay || '—')], ['الحالة', F.status || '—']]), tbl(['القسم', 'البند', 'الحالة', 'توقيع'], items.map((i) => [i.dept, i.label, i.status, i.signed ? '✓' : '—'])), done ? null : h('div.d-band', {}, 'نموذج غير مكتمل — لا يُعتد به قبل توقيع كل الأقسام'), para('ردّ أوراق الموظف وشهاداته الأصلية يتم فور الطلب (م.175) ولا يُحتجز كضمان.'), sign(['HR Manager (قفل الإخلاء)'])]; }
      case 'final_settlement': { const L = F.lines || []; const E = L.filter((l) => l.kind === 'E'), D = L.filter((l) => l.kind === 'D'); const row = (l) => [h('span.num', {}, l.code), l.label + (l.on === false ? ' (مغلق)' : ''), h('span.num', {}, l.basis), l.source + ' · ' + l.status, c.canWage ? num(nf(l.amount)) : '•••']; return [kvl([['الموظف', nm], ['السيناريو', F.scenario || '—'], ['آخر يوم عمل', num(F.lastWorkingDay || '—')]]), F.projected ? h('div.d-band', {}, 'تقديرية — قبل آخر يوم عمل') : null, tbl(['الكود', 'البند', 'الأساس', 'المصدر/الحالة', 'المبلغ'], E.map(row).concat([{ cls: 'tot', cells: ['', 'إجمالي المستحقات', '', '', c.canWage ? num(nf(F.gross)) : '•••'] }]).concat(D.map(row)).concat([{ cls: 'tot', cells: ['', 'إجمالي الخصومات', '', '', c.canWage ? num(nf(F.deductions)) : '•••'] }, { cls: 'net', cells: ['', 'الصافي المستحق', '', '', c.canWage ? num(nf(F.net)) : '•••'] }]), { endCols: [4] }), c.canWage ? h('p.d-words', {}, F.words) : null, c.canWage && F.receivable > 0 ? para('مطالبة متبقية غير مخصومة: ' + nf(F.receivable) + ' ج.م') : null, box('إقرار الموظف', para('نص الإبراء [Pending] من المستشار القانوني — لا يُعد إبراءً قبل اعتماده.')), sign(['Payroll (حساب)', 'HR Manager (اعتماد)', 'المالية (صرف)', 'المدير العام', 'إقرار العامل'])]; }
      case 'incident': return [kvl([['المصاب/المبلّغ', nm], ['التاريخ', num(F.date || '—')], ['المكان', bdi(F.place)], ['الجسامة', ({ minor: 'بسيطة', lti: 'إصابة مع فقد وقت', major: 'جسيمة' })[F.severity] || '—']]), box('وصف الحادث', para(bdi(F.description))), para('التشخيص الطبي T4 لا يظهر في النسخة العامة. إخطار التأمينات عن إصابة العمل فورًا [م.63 · Unverified].'), sign(['المبلّغ', 'المشرف', 'مسؤول السلامة', 'مدير المصنع'])];
      case 'attendance_sheet': { const month = F.month || today().slice(0, 7); const days = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate(); const att = (st.get('attendance') || []); const emps = (st.get('employees') || []).filter((x) => x.status !== 'terminated').slice(0, 14); const L = { present: 'ح', late: 'ت', absent: 'غ', leave: 'إ' }; return [para('كشف حضور شهر ' + month + ' — الحالة بحرف: ح حضور · ت تأخير · غ غياب · إ إجازة (العيّنة 5 أيام فقط في النموذج).'), tbl(['الموظف'].concat(Array.from({ length: days }, (_, i) => String(i + 1))), emps.map((x) => [x.name].concat(Array.from({ length: days }, (_, i) => { const d = month + '-' + String(i + 1).padStart(2, '0'); const r = att.find((a) => a.employeeId === x.id && a.date === d); return r ? L[r.status] : ''; }))), { dense: true }), sign(['المشرف', 'HR', 'مدير الإنتاج'])]; }
      case 'regulations_ack': return [para(['أقرّ أنا ', h('b', {}, nm), ' (', e.empNo || '', ') بأنني اطلعت على لائحة تنظيم العمل (النسخة: ', bdi(F.version || '{Open — D10}'), ') وفهمت ما جاء بها.']), sign(['العامل', 'شاهد من HR'])];
      case 'custody_receipt': return [kvl([['المستلم', nm]]), tbl(['الصنف', 'الكمية'], String(F.items || '').split('\n').filter(Boolean).map((l) => { const p = l.split('×'); return [bdi(p[0].trim()), num((p[1] || '1').trim())]; }), { endCols: [1] }), sign(['أمين المخزن', 'المستلم', 'مسؤول السلامة'])];
      default: return [para('—')];
    }
  }
  /** Build the A4 sheet node. o = {tpl, employeeId, fields, number, status:'draft|pending_approval|issued|cancelled|superseded', purpose, addressee, token, preparedBy, approvedBy, issuedAt, hash, printedBy} */
  function a4(o) {
    const tpl = tplOf(o.type) || tplOf(o.tpl); const e = emp(o.employeeId) || {}; const pos = st.find('positions', e.positionId) || {};
    const c = { fields: o.fields || {}, emp: e, pos, number: o.number, status: o.status, canWage: o.canWage != null ? o.canWage : canSal(), purpose: o.purpose, addressee: o.addressee, token: o.token };
    const status = o.status || 'draft'; const draft = status === 'draft' || status === 'pending_approval'; const wm = status === 'cancelled' || status === 'superseded' ? ['ملغي', 'is-void'] : draft ? ['مسودة', ''] : ['نموذج تجريبي', 'is-demo'];
    const conf = tpl.tier === 'T3' || tpl.tier === 'T4';
    return h('div.sap-a4' + (tpl.land ? '.is-land' : ''), { dataset: { tpl: tpl.key } },
      h('div.d-wm' + (wm[1] ? '.' + wm[1] : ''), {}, h('span', {}, wm[0])),
      h('header.d-head', {}, h('div.d-brand', {}, h('img', { src: '../../assets/images/logo/mark.png', alt: '' }), h('small', {}, company().nameAr || 'الشركة')), h('div.d-title', {}, h('span.d-pill', {}, tpl.name), h('span.d-en', {}, tpl.en), conf ? h('span.d-conf', {}, TIER[tpl.tier][0]) : h('span.d-conf', { style: { background: '#5b6b86' } }, TIER[tpl.tier][0])), h('dl.d-meta', {}, h('dt', {}, 'الرقم'), h('dd.num', {}, o.number || 'مسودة — لا رقم'), h('dt', {}, 'التاريخ'), h('dd.num', {}, (o.issuedAt || new Date().toISOString()).slice(0, 10)), h('dt', {}, 'الحالة'), h('dd', {}, ({ draft: 'مسودة', pending_approval: 'بانتظار الاعتماد', issued: 'صادر', cancelled: 'ملغي', superseded: 'مستبدل' })[status] || status))),
      h('div.d-body', {}, bodyOf(tpl, c)),
      h('div.d-row', {}, draft ? h('div.d-slot', {}, 'لا ختم على المسودة') : slot('مكان الختم — Placeholder (صورة من إعدادات الشركة · بند 28)'), slot('التوقيع المعتمد — Placeholder'), h('div', { style: { fontSize: '7.5pt', color: 'var(--eg-muted)', maxWidth: '70mm' } }, 'ملف PDF العادي أو المطبوع ليس مستندًا إلكترونيًا رسميًا معتمدًا ولا توقيعًا رقميًا (بند 28). رمز التحقق يطابق سجل الشركة فقط.')),
      h('footer.d-foot', {}, h('span', {}, h('b', {}, company().nameAr || 'الشركة'), ' · ', company().address || 'العنوان الرسمي {Open — بند 11}'), h('span', {}, h('b.num', {}, o.number || 'DRAFT'), ' · القالب ', h('span.num', {}, tpl.docNo + ' v1.0'), conf ? ' · سري — لا يُتداول خارج المخوّلين' : ''), h('span', {}, 'طُبع بواسطة ', bdi(o.printedBy || (me() ? me().name : '')), ' · ', h('span.num', {}, new Date().toISOString().slice(0, 16).replace('T', ' '))), h('span.num', {}, 'صفحة 1 / 1')));
  }
  /** scale an A4 node to the available width (preview only) */
  function fitScroll(node, land) { const wrap = h('div.sap-a4-scroll', {}, node); setTimeout(() => { const w = wrap.clientWidth - 32; const full = land ? 1123 : 794; if (w > 0 && w < full) node.style.zoom = String(Math.max(0.35, w / full)); }, 60); return wrap; }

  /* ───────────────────────── print (window.print with a print stylesheet) ───────────────────────── */
  function printNode(node, label) {
    css(); let root = document.getElementById('sap-print-root'); if (!root) { root = h('div#sap-print-root'); document.body.appendChild(root); }
    SA.clear(root); const clone = node.cloneNode(true); clone.style.zoom = ''; root.appendChild(clone); document.body.classList.add('sap-printing');
    const done = () => { document.body.classList.remove('sap-printing'); SA.clear(root); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done); SA.track('hr.doc.printed', { label });
    try { window.print(); } catch (err) { done(); SA.toast('تعذّرت الطباعة في هذا المتصفح', 'error'); }
    setTimeout(() => { if (document.body.classList.contains('sap-printing')) done(); }, 4000);
  }

  /* ───────────────────────── issuance log: engine ───────────────────────── */
  const NOTIFY_APPROVERS = ['R-11'];
  function snapshotOf(o, tpl) { const e = emp(o.employeeId) || {}; return SA.clone({ fields: o.fields || {}, employee: { id: e.id, name: e.name, empNo: e.empNo, positionId: e.positionId, departmentId: e.departmentId, hireDate: e.hireDate, endDate: e.endDate, salary: tpl.tier === 'T3' || (o.fields && (o.fields.withSalary || o.fields.basic != null)) ? e.salary : undefined }, company: { nameAr: company().nameAr }, purpose: o.purpose, addressee: o.addressee }); }
  function insertRecord(o, tpl, status, number, by) {
    const id = SA.store.nextId('issuedDocs', 'DI', 4); const e = emp(o.employeeId) || {}; const snap = snapshotOf(o, tpl); const token = 'V' + sha256(id + JSON.stringify(snap)).slice(0, 10).toUpperCase();
    const rec = { id, number, docNo: o.docNo || null, type: tpl.key, templateName: tpl.name, templateNo: tpl.docNo, templateVersion: 'v1.0', employeeId: o.employeeId || null, subjectName: e.name || o.subjectName || '', tier: tpl.tier, status, purpose: o.purpose || '', addressee: o.addressee || '', snapshot: snap, hash: sha256(JSON.stringify(snap) + (number || '')), token, preparedBy: by, approvedBy: o.approvedBy || null, issuedBy: status === 'issued' ? by : null, issuedAt: status === 'issued' ? new Date().toISOString() : null, createdAt: new Date().toISOString(), official: false, refs: o.refs || {}, printLog: [], supersedes: o.supersedes || null };
    st.insert('issuedDocs', rec, true); return rec;
  }
  function issue(o) {
    const tpl = tplOf(o.type); if (!tpl) { SA.toast('قالب غير معروف: ' + o.type, 'error'); return null; }
    if (!SA.can('hr.documents.issue')) { SA.audit('HR.DOC.ACCESS_DENIED', { target: { type: 'template', id: tpl.key, label: tpl.name }, result: 'denied' }); SA.toast(gate('hr.documents.issue'), 'warn'); return null; }
    const tg = tierGate(tpl.tier); if (tg) { SA.audit('HR.DOC.ACCESS_DENIED', { target: { type: 'template', id: tpl.key, label: tpl.name }, result: 'denied', reason: tg }); SA.toast('القالب ' + TIER[tpl.tier][0] + ' — ' + tg, 'warn'); return null; }
    if (o.docNo) { const ex = issuedAll().find((d) => d.docNo === o.docNo && d.type === tpl.key && ['issued', 'pending_approval'].indexOf(d.status) >= 0); if (ex) return ex; }
    const by = me().id; const pending = tpl.approval === 'manager' && !o.approved && o.status !== 'draft'; const asDraft = o.status === 'draft';
    if (asDraft) { const r = insertRecord(o, tpl, 'draft', null, by); SA.audit('HR.DOC.DRAFT_SAVED', { target: { type: 'document', id: r.id, label: tpl.name + ' — ' + r.subjectName }, after: { status: 'draft' } }); return r; }
    if (pending) { const r = insertRecord(o, tpl, 'pending_approval', null, by); SA.audit('HR.DOC.DRAFT_SAVED', { target: { type: 'document', id: r.id, label: tpl.name + ' — ' + r.subjectName }, after: { status: 'pending_approval' } }); SA.notify({ title: 'مستند بانتظار الاعتماد: ' + tpl.name, body: r.subjectName + ' — أعدّه ' + me().name + ' (المُعدّ ≠ المعتمِد).', level: 'action', to: NOTIFY_APPROVERS, link: '#/hr/documents?tab=log' }); return r; }
    const number = o.docNo || nextNumber(tpl.prefix); const r = insertRecord(o, tpl, 'issued', number, by); if (o.approved) st.patch('issuedDocs', r.id, { approvedBy: o.approvedBy || by });
    SA.audit('HR.DOC.ISSUED', { target: { type: 'document', id: number, label: tpl.name + ' — ' + r.subjectName }, after: { number, template: tpl.docNo + ' v1.0', hash: r.hash.slice(0, 16), tier: tpl.tier }, severity: tpl.tier === 'T4' ? 'high' : undefined }); SA.track('hr.doc.issued', { number });
    return st.find('issuedDocs', r.id);
  }
  async function approve(id) {
    const d = st.find('issuedDocs', id); if (!d || d.status !== 'pending_approval') return false; const tpl = tplOf(d.type);
    if (!isApprover()) { SA.toast('الاعتماد لـHR Manager فقط', 'warn'); return false; }
    if (d.preparedBy === me().id) { SA.toast('فصل المهام: المُعدّ لا يعتمد مستنده — يعتمده مستخدم آخر (HR Manager آخر أو Super Admin).', 'error', { ms: 6500 }); return false; }
    const tg = tierGate(tpl.tier); if (tg) { SA.toast(tg, 'warn'); return false; }
    const r = await SA.confirm({ title: 'اعتماد وإصدار ' + tpl.name, text: 'سيُحجز الرقم ويُجمَّد النسخة بلقطة بيانات وبصمة SHA-256. لا تعديل بعد الإصدار — التغيير = استبدال برقم جديد.', impact: ['المستند: ' + d.subjectName, 'السرية: ' + TIER[tpl.tier][0]], confirmLabel: 'اعتماد وإصدار' }); if (!r.ok) return false;
    if (tpl.tier !== 'T1' && tpl.tier !== 'T2' && !(await SA.stepUp('approval.decide', { force: true }))) return false;
    try { await SA.api(() => { const number = d.docNo || nextNumber(tpl.prefix); const now = new Date().toISOString(); const hash = sha256(JSON.stringify(d.snapshot) + number); st.patch('issuedDocs', id, { status: 'issued', number, approvedBy: me().id, issuedBy: me().id, issuedAt: now, hash }); SA.audit('HR.DOC.APPROVED', { target: { type: 'document', id: number, label: tpl.name + ' — ' + d.subjectName }, after: { approvedBy: me().name }, stepUp: true }); SA.audit('HR.DOC.ISSUED', { target: { type: 'document', id: number, label: tpl.name + ' — ' + d.subjectName }, after: { number, hash: hash.slice(0, 16) } }); SA.notify({ title: 'صدر المستند ' + number, body: tpl.name + ' — ' + d.subjectName, level: 'info', toUsers: [d.preparedBy], link: '#/hr/documents?tab=log' }); SA.track('hr.doc.issued', { number }); }); SA.toast('اعتُمد وصدر المستند', 'success'); return true; } catch (e) { SA.fail(e); return false; }
  }
  async function cancel(id, supersede) {
    const d = st.find('issuedDocs', id); if (!d || d.status !== 'issued') return false; if (!isApprover()) { SA.toast('الإلغاء/الاستبدال لـHR Manager فقط', 'warn'); return false; }
    const r = await SA.confirm({ title: supersede ? 'استبدال المستند ' + d.number : 'إلغاء المستند ' + d.number, danger: true, reasonRequired: true, impact: ['الرقم محفوظ ولا يُعاد استخدامه', 'تبقى النسخة الأصلية في السجل بعلامة «ملغي»'], confirmLabel: supersede ? 'استبدال' : 'إلغاء المستند' }); if (!r.ok) return false;
    try { await SA.api(() => { st.patch('issuedDocs', id, { status: supersede ? 'superseded' : 'cancelled', cancelReason: r.reason, cancelledBy: me().id, cancelledAt: new Date().toISOString() }); SA.audit(supersede ? 'HR.DOC.SUPERSEDED' : 'HR.DOC.CANCELLED', { target: { type: 'document', id: d.number, label: d.templateName + ' — ' + d.subjectName }, reason: r.reason, after: { status: supersede ? 'superseded' : 'cancelled' } }); }); SA.toast(supersede ? 'عُلّم كمستبدل — أصدر النسخة الجديدة الآن' : 'أُلغي المستند والرقم محفوظ', 'success'); if (supersede) startWizard({ type: d.type, employeeId: d.employeeId, fields: d.snapshot.fields, purpose: d.purpose, addressee: d.addressee, supersedes: d.id }); return true; } catch (e) { SA.fail(e); return false; }
  }
  function visibleRow(d) { const tg = tierGate(d.tier); return !tg; }
