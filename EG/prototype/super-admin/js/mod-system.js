/* EG Super Admin prototype — mod-system.js  (agent C · SA-24..SA-27 النظام والتكاملات)
   Routes: #/settings (عام) · #/notifications (قواعد الإشعارات) · #/integrations · #/backup (نسخ/تصدير/صحة/صيانة)
   - الإعدادات العامة: لغة/أرقام/تاريخ/دومين (Step-up + تحقق DNS محاكى) · الإشعارات: هيكل بلا قيم نهائية (مسودات) + معاينة تسليم
   - التكاملات: حالات صادقة، لا ادعاء تكامل، لا أسرار في الواجهة أو التدقيق · النسخ/الصحة: فحوصات حقيقية على بيانات النموذج + وضع صيانة يمنع الكتابة لغير Super Admin. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const NOPERM = 'ليست من صلاحياتك';
  const MOD = 'sys';
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? null : o));
  function css(text) { if (document.querySelector('style[data-mod="' + MOD + '"]')) return; const s = document.createElement('style'); s.setAttribute('data-mod', MOD); s.textContent = text; document.head.appendChild(s); }
  css(`
.sap-sys-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:16px;align-items:start}
.sap-sys-prev{font:700 1.1rem var(--font-en);color:var(--eg-navy);direction:ltr;text-align:start;padding:10px 14px;background:var(--color-bg-alt);border-radius:10px;border:1px dashed var(--color-border-strong);display:grid;gap:4px}
.sap-sys-savebar{position:sticky;inset-block-end:0;z-index:5;display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--color-border-strong);border-radius:14px;padding:12px 16px;margin-block-start:16px;box-shadow:0 -6px 20px rgba(2,32,79,.08);flex-wrap:wrap}
.sap-sys-lvl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;margin-block-end:16px}
.sap-sys-lvl>div{border:1px solid var(--color-border);border-radius:12px;padding:12px 14px;background:#fff;border-inline-start-width:4px}.sap-sys-lvl .u{border-inline-start-color:var(--color-danger)}.sap-sys-lvl .a{border-inline-start-color:var(--eg-navy)}.sap-sys-lvl .i{border-inline-start-color:var(--color-text-muted)}.sap-sys-lvl b{display:block}.sap-sys-lvl small{color:var(--color-text-muted)}
.sap-sys-mx td,.sap-sys-mx th{vertical-align:middle}
.sap-sys-chips{display:flex;gap:4px;flex-wrap:wrap}
.sap-sys-push{background:linear-gradient(180deg,#0b2a5b,#02204f);color:#fff;border-radius:18px;padding:12px 14px;max-width:340px;display:grid;gap:3px;box-shadow:0 8px 20px rgba(2,32,79,.25)}.sap-sys-push small{opacity:.7;font-size:11px}.sap-sys-push b{font-size:13px}.sap-sys-push span{font-size:12px;opacity:.92}
.sap-sys-inapp{border:1px solid var(--color-border);border-radius:12px;padding:10px 14px;background:#fff;display:flex;gap:10px;align-items:flex-start}.sap-sys-inapp .d{width:10px;height:10px;border-radius:50%;margin-block-start:5px;flex:none}
.sap-sys-mail{border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;background:#fff;font-size:12px;display:grid;gap:4px}
.sap-sys-int{display:grid;gap:12px}.sap-sys-intc{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:14px;align-items:start;padding:16px 18px;border-block-end:1px solid var(--color-border)}.sap-sys-intc:last-child{border-block-end:0}.sap-sys-intico{width:44px;height:44px;border-radius:12px;background:var(--color-primary-tint);color:var(--eg-navy);display:grid;place-items:center}
.sap-sys-intc h3{margin:0;font-size:1rem}.sap-sys-intc p{margin:4px 0 0;color:var(--color-text-muted);font-size:var(--text-caption)}
.sap-sys-secret{font:600 13px var(--font-en);direction:ltr;display:inline-flex;gap:6px;align-items:center;background:var(--color-bg-alt);padding:3px 10px;border-radius:8px;margin-block-start:6px}
.sap-sys-hc{display:grid;gap:8px}.sap-sys-hc .r{display:flex;gap:12px;align-items:center;border:1px solid var(--color-border);border-radius:10px;padding:10px 14px}.sap-sys-hc .dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:none}.sap-sys-hc .ok .dot{background:var(--color-success-tint);color:var(--color-success)}.sap-sys-hc .warn .dot{background:var(--color-warning-tint,#fff3d6);color:var(--color-warning,#8a5a00)}.sap-sys-hc .fail .dot{background:var(--color-danger-tint);color:var(--color-danger)}.sap-sys-hc small{display:block;color:var(--color-text-muted)}
.sap-sys-maint{position:fixed;inset-block-start:38px;inset-inline-start:50%;transform:translateX(-50%);z-index:45;background:var(--color-danger);color:#fff;border-radius:999px;padding:5px 16px;font-size:12px;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap}
.sap-sys-exp{width:100%}
@media(max-width:640px){.sap-sys-intc{grid-template-columns:40px minmax(0,1fr)}.sap-sys-intc>:nth-child(3){grid-column:2}.sap-sys-maint{font-size:11px;padding:4px 10px}}
`);

  /* ───────────────────────── infra: seed, maintenance mode, helpers ───────────────────────── */
  const isSuper = () => !!(SA.session.role && SA.session.role.isProtected);
  const maint = () => st.get('settings.system.maintenance') || { on: false };
  function ensure() {
    if (!st.get('meta')) return;
    if (!st.get('meta.sysSeeded')) {
      st.update('settings', (s) => { s.system = s.system || { maintenance: { on: false, reason: '', since: null, by: null }, lastExport: null }; s.general = s.general || {}; if (!s.general.dealers) s.general.dealers = { selfRegistration: false, hidePricesFromGuests: true }; if (s.general.catalogDomain === undefined) s.general.catalogDomain = null; s.notifications = s.notifications || { rules: [], quietHours: null }; s.notifications.rules = s.notifications.rules || []; });
      st.update('meta', (m) => { m.sysSeeded = true; });
    }
  }
  let banner = null;
  function drawBanner() {
    const on = maint().on && SA.session.isAuthed;
    if (on && !banner) { banner = h('div.sap-sys-maint', { role: 'status' }, 'وضع الصيانة مفعّل — الكتابة لـSuper Admin فقط'); document.body.appendChild(banner); } else if (!on && banner) { banner.remove(); banner = null; }
  }
  (function patch() {
    if (SA._sysPatched) return; SA._sysPatched = true;
    const api0 = SA.api; SA.api = function (fn, o) { o = o || {}; const m = st.get('settings.system.maintenance'); if (m && m.on && !o.read && !o.maint && !isSuper()) return SA.delay(120, { write: false }).then(() => { throw SA.Err('maintenance', 'maintenance'); }); return api0.call(SA, fn, o); };
    const fail0 = SA.fail; SA.fail = function (e) { if (e && e.code === 'maintenance') { const msg = 'النظام في وضع الصيانة — العمليات الكتابية متاحة لـSuper Admin فقط. لم يتم تنفيذ الإجراء.'; SA.toast(msg, 'warn', { ms: 6000 }); return msg; } return fail0.call(SA, e); };
  })();
  setTimeout(() => { ensure(); drawBanner(); st.subscribe('settings.system', drawBanner); st.subscribe('session', drawBanner); }, 0);
  SA.on('login', () => setTimeout(drawBanner, 50));

  function mount(root, build, opts) {
    opts = opts || {}; ensure(); const host = h('div'); root.append(host); let alive = true, off = null;
    function run() {
      if (typeof off === 'function') { off(); off = null; }
      SA.clear(host); host.append(h('div', { style: { paddingBlock: '8px' } }, SA.skeleton({ kind: opts.skel || 'form', rows: 7 })));
      SA.delay(opts.ms || 220, { write: false }).then(() => { if (!alive) return; SA.clear(host); try { off = build(host, run) || null; } catch (e) { console.error(e); SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); } }, (e) => { if (!alive) return; SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); });
    }
    run(); return () => { alive = false; if (typeof off === 'function') off(); };
  }
  async function commitSettings(o) {
    const rows = SA.diffRows(o.before, o.after).filter((r) => r.changed); if (!rows.length) { SA.toast('لا توجد تغييرات.', 'info'); return false; }
    const r = await SA.confirm({ title: o.title, icon: 'lock', confirmLabel: o.stepUp ? 'متابعة للتحقق' : 'حفظ', extra: SA.diffTable(o.before, o.after), warnings: o.warnings || [], impact: o.impact || [], reasonRequired: !!o.reasonRequired, note: 'هيتسجّل ' + (o.code || 'SETTINGS.CHANGED') + ' بقيمة قبل/بعد.' });
    if (!r.ok) return false; if (o.stepUp && !(await SA.stepUp(o.stepUp))) return false;
    try { await SA.api(() => { o.apply(); SA.audit(o.code || 'SETTINGS.CHANGED', { target: o.target, before: o.before, after: o.after, reason: r.reason || '' }); }); } catch (e) { SA.fail(e); return false; }
    return true;
  }

  /* ═══════════════════════ SA-24 · الإعدادات العامة ═══════════════════════ */
  const EASTERN = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  const toDigits = (s, kind) => (kind === 'hindi' ? String(s).replace(/\d/g, (d) => EASTERN[+d]) : String(s));
  function fmtDate(d, f) { const p = (n) => String(n).padStart(2, '0'); const Y = d.getFullYear(), M = p(d.getMonth() + 1), D = p(d.getDate()); return f === 'YYYY-MM-DD' ? Y + '-' + M + '-' + D : f === 'MM/DD/YYYY' ? M + '/' + D + '/' + Y : D + '/' + M + '/' + Y; }
  const gen = () => st.get('settings.general') || {};
  function generalRender(root, ctx) {
    ctx.setCrumbs([{ label: 'النظام' }, { label: 'الإعدادات العامة' }]);
    return mount(root, (host) => {
      const g0 = clone(gen()); const canEdit = SA.can('sa.settings.edit'); let domainOk = true; let domainChecked = null;
      host.append(SA.pageHead({ title: 'الإعدادات العامة', desc: 'اللغة والأرقام والتواريخ ودومين الكتالوج وإعدادات التجار. الحساس (الدومين) بإعادة تحقق، وكل تغيير بقيمة قبل/بعد.', tags: [SA.tag('approved'), SA.tag('pending', 'Pending قرار 8')] }));
      const F = (o) => SA.form.field(Object.assign({ disabled: !canEdit, onChange: upd, onInput: upd }, o));
      const lang = F({ name: 'language', label: 'اللغة الافتراضية', type: 'radio', value: g0.language, options: [['ar', 'عربي (RTL)'], ['en', 'English (LTR)']] });
      const tz = F({ name: 'timezone', label: 'المنطقة الزمنية [New]', type: 'select', value: g0.timezone, options: [['Africa/Cairo', 'القاهرة (Africa/Cairo)'], ['Asia/Riyadh', 'الرياض (Asia/Riyadh)'], ['Asia/Dubai', 'دبي (Asia/Dubai)'], ['UTC', 'UTC']] });
      const df = F({ name: 'dateFormat', label: 'تنسيق التاريخ [New]', type: 'select', value: g0.dateFormat, options: [['DD/MM/YYYY', 'يوم/شهر/سنة'], ['YYYY-MM-DD', 'سنة-شهر-يوم (ISO)'], ['MM/DD/YYYY', 'شهر/يوم/سنة']] });
      const dg = F({ name: 'digits', label: 'نوع الأرقام [New · قرار 8]', type: 'radio', value: g0.digits, options: [['latin', 'لاتينية (0–9) — المقترح'], ['hindi', 'هندية (٠–٩)']] });
      const dom = F({ name: 'catalogDomain', label: 'دومين الكتالوج [Pending بند 32]', value: g0.catalogDomain || '', dir: 'ltr', placeholder: 'غير مُعدّ — مؤقت', hint: 'مؤقت وقابل للتغيير. التغيير بـStep-up وتحقق DNS.', onInput: () => { domainOk = false; domainChecked = null; drawDom(); upd(); } });
      const domStatus = h('div', { 'aria-live': 'polite' }); const domBtn = SA.btn({ label: 'تحقق من الدومين (DNS)', icon: 'globe', kind: 'ghost', size: 'sm', onClick: verifyDomain });
      function drawDom() { SA.clear(domStatus); const v = dom.get().trim(); if (v === (g0.catalogDomain || '')) { domainOk = true; return; } domStatus.append(domainChecked ? SA.alert(domainChecked.ok ? 'warning' : 'danger', domainChecked.msg) : SA.alert('info', 'غيّرت الدومين — اضغط «تحقق» قبل الحفظ.')); }
      async function verifyDomain() { const v = dom.get().trim(); if (!v) { domainChecked = { ok: true, msg: 'سيُمسح الدومين المؤقت — لن يكون للكتالوج رابط عام.' }; domainOk = true; drawDom(); upd(); return; } if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) { domainChecked = { ok: false, msg: 'صيغة الدومين غير صحيحة (مثال: catalog.example.com).' }; domainOk = false; drawDom(); return; } try { await SA.delay(800, { write: false }); } catch (e) { return SA.fail(e); } domainChecked = { ok: true, msg: 'الصيغة سليمة. فحص DNS محاكى في النموذج (لا اتصال فعلي) — الروابط المشاركة بالدومين القديم هتتوقف بعد التنفيذ.' }; domainOk = true; drawDom(); upd(); }
      const selfReg = F({ name: 'selfRegistration', type: 'switch', label: 'تسجيل ذاتي للتجار', hint: 'مغلق (بند 31): التجار يُسجَّلون بطلب ومراجعة المبيعات فقط.', value: false, disabled: true });
      const hide = F({ name: 'hidePricesFromGuests', type: 'switch', label: 'إخفاء الأسعار عن الزائر', hint: 'الزائر غير المسجّل لا يرى أسعارًا (بند 31).', value: !!(g0.dealers || {}).hidePricesFromGuests });
      const prev = h('div.sap-sys-prev', { 'aria-live': 'polite' }); const impact = h('div');
      function cur() { return { language: lang.get(), timezone: tz.get(), dateFormat: df.get(), digits: dg.get(), catalogDomain: dom.get().trim() || null, dealers: { selfRegistration: false, hidePricesFromGuests: hide.get() } }; }
      function upd() {
        const c = cur(); const d = new Date(); SA.clear(prev); prev.append(h('span', {}, 'التاريخ: ' + toDigits(fmtDate(d, c.dateFormat), c.digits)), h('span', {}, 'رقم: ' + toDigits('1,234,567', c.digits) + ' · ' + toDigits('INV-2026-0188', c.digits)));
        SA.clear(impact); if (c.language !== g0.language) { const chosen = (st.get('users') || []).filter((u) => u.locale && u.locale !== c.language).length; impact.append(SA.alert('info', 'تغيير اللغة الافتراضية لا يغيّر لغة مستخدم اختار لغته: ', h('b.num', {}, chosen), ' مستخدم لغتهم المختارة تختلف عن الافتراضية الجديدة وسيبقون عليها.')); }
        const n = Object.keys(diff().a).length; const el = document.getElementById('sap-sys-dirty'); if (el) el.textContent = n ? 'لديك تغييرات غير محفوظة' : 'لا توجد تغييرات غير محفوظة';
      }
      function diff() { const c = cur(), b = {}, a = {}; Object.keys(c).forEach((k) => { if (JSON.stringify(c[k]) !== JSON.stringify(g0[k] === undefined ? null : g0[k])) { b[k] = g0[k] === undefined ? null : g0[k]; a[k] = c[k]; } }); return { b, a }; }
      async function save() {
        if (!canEdit) return SA.toast(NOPERM + ' (sa.settings.edit)', 'warn'); const d = diff(); if (!Object.keys(d.a).length) return SA.toast('لا توجد تغييرات.', 'info');
        if (d.a.catalogDomain !== undefined && !domainOk) return SA.toast('تحقق من الدومين أولًا.', 'error');
        const sensitive = d.a.catalogDomain !== undefined;
        const ok = await commitSettings({ title: 'مراجعة الإعدادات العامة', code: 'SETTINGS.CHANGED', target: { type: 'settings', id: 'general', label: 'الإعدادات العامة' }, before: d.b, after: d.a, stepUp: sensitive ? 'policy.change' : null, warnings: sensitive ? ['الروابط المشاركة بالدومين القديم هتتوقف.'] : [], apply: () => st.update('settings.general', (g) => { Object.assign(g, cur()); }) });
        if (ok) { SA.toast('تم حفظ الإعدادات', 'success'); Object.assign(g0, clone(gen())); upd(); }
      }
      upd();
      host.append(h('div.sap-sys-grid', {},
        SA.card({ title: 'اللغة والمنطقة' }, lang.el, tz.el, impact), SA.card({ title: 'الأرقام والتواريخ' }, df.el, dg.el, h('div.t-caption', {}, 'معاينة (طبقة العرض في الإنتاج؛ النموذج لا يُحوّل واجهته):'), prev),
        SA.card({ title: 'الخطوط والعلامة' }, SA.kv([['خط العلامة', 'Somar Rounded — بانتظار الملفات المرخصة ' ], ['الخط المؤقت', 'Cairo'], ['الشعار', 'للقراءة فقط — لا يُغيَّر من هنا']]), SA.alert('info', 'بند 2 Open — ملفات Somar Rounded لم تُستلم.')),
        SA.card({ title: 'دومين الكتالوج', actions: [SA.chip('حساس · Step-up', 'warning')] }, dom.el, domBtn, domStatus), SA.card({ title: 'إعدادات التجار' }, selfReg.el, hide.el)));
      if (canEdit) host.append(h('div.sap-sys-savebar', {}, h('span.t-muted', { id: 'sap-sys-dirty' }, 'لا توجد تغييرات غير محفوظة'), h('div.cluster', {}, h('button.btn.btn-ghost', { type: 'button', onclick: () => location.reload() }, 'تراجع'), h('button.btn.btn-accent', { type: 'button', onclick: save }, SA.icon('lock', 'icon-sm'), 'مراجعة وحفظ')))); else host.append(SA.alert('info', 'عرض فقط — ليس لديك ', h('code', {}, 'sa.settings.edit'), '.'));
    });
  }
  SA.register({ id: 'settings', group: 'system', title: 'الإعدادات العامة', icon: 'settings', route: 'settings', perm: 'sa.settings.view', order: 10, desc: 'اللغة والأرقام والتواريخ والدومين', render: generalRender });

  /* ═══════════════════════ SA-25 · الإشعارات ═══════════════════════ */
  const LVL = { urgent: ['عاجل', 'danger'], action: ['مطلوب إجراء', 'info'], info: ['للعلم', 'neutral'] };
  const EVENTS = [
    ['approval.requested', 'طلب اعتماد جديد', 'action', 'طلب اعتماد جديد: {item}', 'من {actor} — بانتظار قرارك.'], ['approval.decided', 'قرار على طلبك (اعتماد/رفض)', 'info', 'تم البتّ في {item}', 'القرار: {decision}.'], ['approval.escalated', 'تصعيد طلب متأخر', 'action', 'طلب متأخر: {item}', 'تجاوز مدة التصعيد {hours} ساعة.'],
    ['security.lockout', 'قفل حساب بعد محاولات فاشلة', 'urgent', 'حساب موقوف: {actor}', 'تم قفل الحساب بعد تجاوز حد المحاولات.'], ['security.recovery', 'استخدام كود استرجاع', 'urgent', 'استُخدم كود استرجاع', 'بواسطة {actor}.'], ['security.superadmin_mfa', 'تغيير MFA لحساب Super Admin', 'urgent', 'تغيير MFA لحساب إدارة', 'حدث حرج في أمان Super Admin.'],
    ['dealer.request', 'طلب تسجيل تاجر جديد', 'action', 'طلب تاجر جديد: {item}', 'بانتظار مراجعة المبيعات.'], ['dealer.override', 'تجاوز قرار المبيعات', 'urgent', 'تجاوز قرار تاجر', 'القرار الأصلي للمبيعات؛ التجاوز بسبب مسجّل.'], ['user.disabled', 'تعطيل مستخدم', 'info', 'تم تعطيل {actor}', 'تنتهي جلساته فورًا.'], ['export.bulk', 'تصدير بيانات', 'info', 'تصدير بيانات: {item}', 'بواسطة {actor}.'],
    ['hr.N-23', 'قطع دورة المرتبات غدًا (N-23)', 'action', 'قطع الدورة غدًا', 'استثناءات غير محلولة: {count}.'], ['hr.N-24', 'كشف المرتبات معتمد (N-24)', 'info', 'الكشف معتمد', 'المفردات جاهزة. (بدون أرقام).'], ['hr.N-29', 'تغيير مرتب ساري (N-29)', 'info', 'تغيير مرتب ساري', 'بدون عرض أرقام للمشرف.'], ['hr.N-15', 'تغيير حقل حساس (N-15)', 'action', 'تغيير حقل حساس', 'على ملف {item}.'], ['hr.N-50', 'تصدير جماعي لبيانات حساسة (N-50)', 'urgent', 'تصدير جماعي حساس', 'بواسطة {actor}.']
  ];
  const CHAN = [['push', 'Push (FCM/APNs)'], ['inapp', 'داخل التطبيق'], ['email', 'بريد [New]']];
  const rules = () => st.get('settings.notifications.rules') || [];
  const ruleOf = (ev) => rules().find((r) => r.event === ev) || null;
  const devices = () => (st.get('sessions') || []).filter((s) => s.platform !== 'web' && s.status === 'active' && s.pushStatus === 'active');
  const sample = (t, ev) => String(t).replace('{actor}', 'ياسر مصطفى').replace('{item}', ev && /approval|dealer/.test(ev[0]) ? 'SO-2026-0412' : 'EMP-0005').replace('{decision}', 'معتمد').replace('{hours}', 'X').replace('{count}', '3');
  function openRule(ev) {
    const canEdit = SA.can('sa.settings.edit'); const r0 = ruleOf(ev[0]); const work = r0 ? clone(r0) : { id: 'NR-' + ev[0], event: ev[0], level: ev[2], roles: [], channels: [], title: ev[3], body: ev[4], status: 'draft' };
    const urgent = ev[2] === 'urgent';
    const roles = SA.form.field({ name: 'roles', label: 'الأدوار المستلمة', type: 'multi', value: work.roles, disabled: !canEdit, options: (st.get('roles') || []).filter((r) => r.status === 'active').map((r) => [r.id, r.nameAr]), onChange: (v) => { work.roles = v; prevDraw(); } });
    const ch = SA.form.field({ name: 'channels', label: 'القنوات', type: 'multi', value: work.channels, disabled: !canEdit, options: CHAN, onChange: (v) => { work.channels = v; prevDraw(); } });
    const lvl = SA.form.field({ name: 'level', label: 'التصنيف [Pending بند 18]', type: 'select', value: work.level, disabled: !canEdit || urgent, options: Object.keys(LVL).map((k) => [k, LVL[k][0]]), hint: urgent ? 'Urgent لا يمكن إيقافه أو خفضه (سلوك النظام).' : '', onChange: (v) => { work.level = v; prevDraw(); } });
    const tt = SA.form.field({ name: 'title', label: 'قالب العنوان', value: work.title, disabled: !canEdit, hint: 'متغيرات: {actor} {item} {decision}', onInput: (v) => { work.title = v; prevDraw(); } });
    const bd = SA.form.field({ name: 'body', label: 'قالب النص', type: 'textarea', rows: 2, value: work.body, disabled: !canEdit, onInput: (v) => { work.body = v; prevDraw(); } });
    const en = SA.form.field({ name: 'enabled', type: 'switch', label: 'تفعيل القاعدة', hint: 'غير متاح — لا قاعدة مفعّلة قبل اعتماد التشغيل (بند 18).', value: false, disabled: true });
    const prev = h('div', { style: { display: 'grid', gap: '10px' } });
    function prevDraw() {
      SA.clear(prev); const us = (st.get('users') || []).filter((u) => u.status === 'active' && work.roles.indexOf(u.roleId) >= 0); const t = sample(work.title, ev), b = sample(work.body, ev);
      prev.append(h('div.t-caption', {}, 'المستلمون المحتملون: ', h('b.num', {}, us.length), us.length ? ' — ' + us.slice(0, 4).map((u) => u.name).join('، ') + (us.length > 4 ? '…' : '') : ' (لم تُحدَّد أدوار)'),
        work.channels.indexOf('push') >= 0 ? h('div.sap-sys-push', {}, h('small', {}, 'EG · الآن'), h('b', {}, t), h('span', {}, b)) : null,
        work.channels.indexOf('inapp') >= 0 ? h('div.sap-sys-inapp', {}, h('span.d', { style: { background: work.level === 'urgent' ? 'var(--color-danger)' : work.level === 'action' ? 'var(--eg-navy)' : 'var(--color-text-muted)' } }), h('div', {}, h('b', {}, t), h('div.t-caption', {}, b))) : null,
        work.channels.indexOf('email') >= 0 ? h('div.sap-sys-mail', {}, h('b', {}, 'الموضوع: ' + t), h('span', {}, b), h('span.t-muted', {}, '— رابط يفتح الشاشة المعنية بعد التحقق')) : null, !work.channels.length ? h('p.t-muted', {}, 'اختر قناة لمعاينة التسليم.') : null,
        SA.alert('info', 'الـBackend هو من يقرر الإشعار والمستلم؛ FCM/APNs ناقلان فقط (بند 17). لا يُنفَّذ أي إجراء حساس من نص الإشعار — يفتح الشاشة ثم يتحقق.'));
    }
    prevDraw();
    const d = SA.drawer({ title: ev[1], subtitle: 'SCR-NTF-02 · ' + ev[0], size: 'md', body: h('div.sap-confirm', {}, urgent ? SA.alert('warning', h('b', {}, 'قاعدة Urgent إلزامية. '), 'لا يمكن إيقافها؛ تُضبط المستلمون والقنوات كمسودة.') : null, SA.alert('info', 'كل القواعد هنا مسودات — لا شيء مفعّل قبل اعتماد التشغيل.'), roles.el, ch.el, lvl.el, tt.el, bd.el, en.el, h('div', {}, h('b', {}, 'معاينة التسليم'), prev)),
      foot: canEdit ? [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', onclick: save }, 'حفظ كمسودة')] : [h('button.btn.btn-primary', { type: 'button', onclick: () => d.close() }, 'إغلاق')] });
    async function save() {
      const after = { roles: work.roles.map(SA.roleName), channels: work.channels, level: work.level, title: work.title, body: work.body }; const before = r0 ? { roles: r0.roles.map(SA.roleName), channels: r0.channels, level: r0.level, title: r0.title, body: r0.body } : { roles: [], channels: [], level: ev[2], title: ev[3], body: ev[4] };
      if (JSON.stringify(after) === JSON.stringify(before)) return SA.toast('لا توجد تغييرات.', 'info');
      try { await SA.api(() => { st.update('settings.notifications.rules', (l) => { const i = l.findIndex((x) => x.event === ev[0]); const rec = Object.assign({}, work, { status: 'draft', updatedAt: new Date().toISOString() }); if (i >= 0) l[i] = rec; else l.push(rec); }); SA.audit('NOTIFICATION.RULE_CHANGED', { target: { type: 'notificationRule', id: ev[0], label: ev[1] }, before, after, reason: 'مسودة — غير مفعّلة' }); }); } catch (e) { return SA.fail(e); }
      d.close(); SA.toast('تم حفظ المسودة', 'success');
    }
  }
  function notificationsRender(root, ctx) {
    ctx.setCrumbs([{ label: 'النظام' }, { label: 'الإشعارات' }]);
    return mount(root, (host, retry) => {
      host.append(SA.pageHead({ title: 'قواعد الإشعارات', desc: 'الهيكل: حدث × دور مستلم × قناة. الأحداث والمستلمون وساعات الهدوء غير مفعّلة حتى اعتماد التشغيل — تُعرض هنا مسودات فقط.', tags: [SA.tag('approved', 'تقنيًا بند 29'), SA.tag('pending', 'التصنيف بند 18'), SA.tag('open', 'الأحداث Open')],
        actions: [SA.btn({ label: 'إرسال إشعار تجريبي لي', icon: 'bell', kind: 'ghost', perm: 'sa.settings.view', onClick: sendTest })] }));
      const devHost = h('div'); const tableHost = h('div');
      host.append(h('div.sap-sys-lvl', {}, h('div.u', {}, h('b', {}, 'عاجل (Urgent)'), h('small', {}, 'أمني/حرج — لا يمكن إيقافه.')), h('div.a', {}, h('b', {}, 'مطلوب إجراء (Action)'), h('small', {}, 'يفتح الشاشة، والتنفيذ بعد التحقق.')), h('div.i', {}, h('b', {}, 'للعلم (Info)'), h('small', {}, 'صامت — بدون صوت.'))), devHost, tableHost);
      function sendTest() { const me = SA.session.user; const hasDev = devices().some((s) => s.userId === me.id); SA.notify({ title: 'إشعار تجريبي من إعدادات الإشعارات', body: 'وصل داخل التطبيق' + (hasDev ? ' وعلى جهازك المسجّل (محاكاة).' : '. لا جهاز مسجّل لحسابك للـpush.'), level: 'info', toUsers: [me.id], link: '#/notifications' }); SA.toast(hasDev ? 'أُرسل تجريبي داخل التطبيق وعلى جهازك (محاكاة)' : 'أُرسل داخل التطبيق فقط — لا جهاز مسجّل للـpush', 'success'); }
      function drawDev() { SA.clear(devHost); const ds = devices(); devHost.append(SA.card({ title: 'حالة الأجهزة (FCM/APNs)', actions: [SA.chip(ds.length + ' جهاز مسجّل', ds.length ? 'success' : 'neutral')] }, ds.length ? h('div.table-wrap', {}, h('table.table', {}, h('tbody', {}, ds.map((s) => h('tr', {}, h('td', {}, SA.userName(s.userId)), h('td', {}, s.device), h('td', {}, s.platform === 'ios' ? 'APNs' : 'FCM'), h('td.t-muted', {}, SA.fmt.rel(s.lastActive))))))) : SA.empty({ icon: 'phone', title: 'لا توجد أجهزة مسجّلة', text: 'تظهر الأجهزة بعد تسجيل دخول EG-Mobile.' }), h('p.t-caption', {}, 'ساعات الهدوء: ', SA.openValue('غير مُعدّة'), ' — بند 18.'))); }
      function drawTable() {
        SA.clear(tableHost); tableHost.append(h('div.card.card-flush.sap-listcard', {}, SA.table({ rowId: 'k', pageSize: 10, caption: 'مصفوفة الإشعارات', rows: () => EVENTS.map((e) => ({ k: e[0], ev: e, rule: ruleOf(e[0]) })), search: { placeholder: 'ابحث عن حدث…', keys: [(r) => r.ev[1], (r) => r.k] }, filters: [{ key: 'lvl', label: 'التصنيف', options: Object.keys(LVL).map((k) => [k, LVL[k][0]]), test: (r, v) => (r.rule ? r.rule.level : r.ev[2]) === v }],
          columns: [{ key: 'ev', label: 'الحدث', value: (r) => r.ev[1], sort: true, render: (r) => h('div', {}, h('b', {}, r.ev[1]), h('div.t-caption', {}, r.k)) }, { key: 'lvl', label: 'التصنيف', render: (r) => { const l = r.rule ? r.rule.level : r.ev[2]; return SA.chip(LVL[l][0], LVL[l][1]); } }, { key: 'roles', label: 'المستلمون', render: (r) => (r.rule && r.rule.roles.length ? h('div.sap-sys-chips', {}, r.rule.roles.map((x) => SA.chip(SA.roleName(x), 'info'))) : SA.openValue('غير مُعدّ')) }, { key: 'ch', label: 'القنوات', render: (r) => (r.rule && r.rule.channels.length ? h('div.sap-sys-chips', {}, r.rule.channels.map((x) => SA.chip((CHAN.find((c) => c[0] === x) || [])[1] || x, 'neutral'))) : h('span.t-muted', {}, '—')) }, { key: 'st', label: 'الحالة', render: (r) => (r.ev[2] === 'urgent' ? SA.chip('إلزامي — سلوك النظام', 'danger') : r.rule ? SA.chip('مسودة — غير مفعّلة', 'warning') : SA.chip('لا قاعدة', 'neutral')) }],
          rowActions: (r) => [{ label: 'تعديل / معاينة', icon: 'edit', onClick: () => openRule(r.ev) }], onRowClick: (r) => openRule(r.ev), onRetry: retry }).el));
      }
      drawDev(); drawTable(); const offs = [st.subscribe('settings.notifications', drawTable), st.subscribe('sessions', drawDev)]; return () => offs.forEach((f) => f());
    }, { skel: 'table' });
  }
  SA.register({ id: 'notif-rules', group: 'system', title: 'الإشعارات', icon: 'bell', route: 'notifications', perm: 'sa.settings.view', order: 20, desc: 'قواعد الإشعارات ومعاينة التسليم', render: notificationsRender });

  /* ═══════════════════════ SA-26 · التكاملات ═══════════════════════ */
  const ISTAT = { not_configured: ['غير مُعدّ', 'neutral'], entered_untested: ['مُدخل — لم يُختبر', 'info'], open_hold: ['Open — التنفيذ مؤجل', 'warning'] };
  const IICON = { einvoice: 'receipt', email: 'mail', sms: 'phone', push: 'bell' };
  const fp = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(16).slice(-4).toUpperCase(); };
  function openSecret(it, rotate) {
    if (!SA.can('sa.settings.edit')) return SA.toast(NOPERM + ' (sa.settings.edit)', 'warn');
    const prov = SA.form.field({ name: 'prov', label: 'المزوّد / المعرّف (غير سري)', value: it.provider || '', hint: 'مثال: اسم المشروع أو المرسل. ليس سرًا.' });
    const key = SA.form.field({ name: 'key', label: rotate ? 'المفتاح الجديد' : 'المفتاح / السر', type: 'password', required: true, rules: [SA.form.rules.min(8)], hint: 'يُخزَّن مشفّرًا ولا يُعرض بعد الحفظ ولا يُسجَّل في التدقيق.' });
    const m = SA.modal({ title: (rotate ? 'تدوير مفتاح — ' : 'إدخال مفتاح — ') + it.label, icon: 'key', size: 'sm', body: h('div.sap-confirm', {}, SA.alert('warning', 'النموذج لا يتصل بخدمة خارجية: الحالة بعد الحفظ «مُدخل — لم يُختبر» ولا تُعتبر تكاملًا فعّالًا.'), prov.el, key.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      if (!key.validate()) return key.focus(); const secret = key.get(); if (!(await SA.stepUp('policy.change', { title: 'إعادة التحقق — مفتاح تكامل' }))) return; m.setBusy(true); const f = fp(secret);
      try { await SA.api(() => { st.update('settings.integrations', (l) => { const x = l.find((y) => y.id === it.id); x.status = 'entered_untested'; x.provider = prov.get().trim(); x.secret = { fingerprint: f, savedAt: new Date().toISOString(), by: SA.session.userId }; }); SA.audit('INTEGRATION.CHANGED', { target: { type: 'integration', id: it.id, label: it.label }, before: { configured: !!it.secret, fingerprint: it.secret ? it.secret.fingerprint : null }, after: { configured: true, fingerprint: f, status: 'entered_untested', provider: prov.get().trim() || null }, reason: rotate ? 'تدوير مفتاح' : 'إدخال مفتاح' }); }); } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast(rotate ? 'تم تدوير المفتاح' : 'تم حفظ المفتاح — لم يُختبر', 'success'); } }, rotate ? 'تدوير' : 'حفظ المفتاح')] });
    key.focus();
  }
  async function removeSecret(it) { const r = await SA.confirm({ title: 'إزالة مفتاح ' + it.label, danger: true, confirmLabel: 'إزالة', reasonRequired: true, impact: ['التكامل يرجع «غير مُعدّ».'] }); if (!r.ok) return; if (!(await SA.stepUp('policy.change'))) return; try { await SA.api(() => { st.update('settings.integrations', (l) => { const x = l.find((y) => y.id === it.id); x.status = 'not_configured'; x.secret = null; }); SA.audit('INTEGRATION.CHANGED', { target: { type: 'integration', id: it.id, label: it.label }, before: { configured: true }, after: { configured: false }, reason: r.reason }); }); } catch (e) { return SA.fail(e); } SA.toast('تمت الإزالة', 'success'); }
  async function testConn(it) { try { await SA.delay(900, { write: false }); } catch (e) { return SA.fail(e); } const m = SA.modal({ title: 'اختبار الاتصال — ' + it.label, icon: 'info', size: 'sm', body: h('div.sap-confirm', {}, SA.alert('warning', h('b', {}, 'غير متاح في النموذج. '), 'الاختبار الفعلي يتم من الـBackend، والنموذج لا يتصل بأي خدمة خارجية — فلا نعرض نتيجة نجاح.'), h('p.t-muted', {}, 'الحالة تبقى «' + ISTAT[it.status][0] + '» حتى تُختبر على بيئة حقيقية.')), foot: [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'فهمت')] }); }
  function integrationsRender(root, ctx) {
    ctx.setCrumbs([{ label: 'النظام' }, { label: 'التكاملات' }]);
    return mount(root, (host) => {
      host.append(SA.pageHead({ title: 'التكاملات', desc: 'حالات صادقة: لا ادعاء تكامل قبل اختبار واعتماد. الأسرار لا تظهر بعد الحفظ ولا تُسجَّل نصًا في التدقيق.', tags: [SA.tag('open', 'بنود 12 و43'), SA.tag('approved', 'لا ادعاء تكامل')] }));
      const body = h('div'); host.append(body);
      function draw() {
        SA.clear(body); const its = st.get('settings.integrations') || []; const canEdit = SA.can('sa.settings.edit');
        body.append(SA.card({ flush: true }, its.map((it) => { const s = ISTAT[it.status] || ISTAT.not_configured; const hold = it.status === 'open_hold';
          return h('div.sap-sys-intc', {}, h('span.sap-sys-intico', {}, SA.icon(IICON[it.id] || 'link')), h('div', {}, h('h3', {}, it.label, ' ', SA.chip(s[0], s[1])), h('p', {}, it.note || (it.id === 'push' ? 'الـBackend هو من يقرر؛ FCM/APNs ناقلان فقط (بند 17/29).' : 'لم يُضبط بعد.')), it.id === 'push' ? h('p', {}, 'أجهزة مسجّلة: ', h('b.num', {}, devices().length)) : null, it.secret ? h('div.sap-sys-secret', {}, SA.icon('lock', 'icon-sm'), 'مفتاح محفوظ ••••' + it.secret.fingerprint, h('span.t-muted', {}, ' · ' + SA.fmt.rel(it.secret.savedAt))) : null, hold ? SA.alert('warning', 'لا تكامل مع مصلحة الضرائب، ولا ادعاء بذلك قبل الاختبار والاعتماد. ملف PDF العادي ليس فاتورة إلكترونية معتمدة.') : null),
            h('div.cluster', {}, hold ? SA.btn({ label: 'مقفول — بانتظار المالية', icon: 'lock', kind: 'ghost', size: 'sm', reason: 'Open — التنفيذ مؤجل (بنود 12 و43)', onClick: () => {} }) : it.secret ? [SA.btn({ label: 'تدوير المفتاح', icon: 'refresh', kind: 'ghost', size: 'sm', perm: 'sa.settings.edit', onClick: () => openSecret(it, true) }), SA.btn({ label: 'اختبار الاتصال', icon: 'activity', kind: 'ghost', size: 'sm', onClick: () => testConn(it) }), SA.btn({ label: 'إزالة', icon: 'trash', kind: 'ghost', size: 'sm', perm: 'sa.settings.edit', onClick: () => removeSecret(it) })] : SA.btn({ label: 'إدخال مفتاح', icon: 'key', kind: 'ghost', size: 'sm', perm: 'sa.settings.edit', onClick: () => openSecret(it, false) }))); }),
          h('div.sap-sys-intc', {}, h('span.sap-sys-intico', {}, SA.icon('link')), h('div', {}, h('h3', {}, 'مفاتيح API / Webhooks ', SA.tag('new'), ' ', SA.chip('غير مخطط', 'neutral')), h('p', {}, 'لو فيه API عام مخطط لاحقًا. لا مفاتيح الآن (Open).')), h('div.cluster', {}, SA.btn({ label: 'إنشاء مفتاح', icon: 'plus', kind: 'ghost', size: 'sm', reason: 'غير مخطط في v1 — Open', onClick: () => {} })))));
        if (!canEdit) body.append(SA.alert('info', 'عرض فقط — ليس لديك ', h('code', {}, 'sa.settings.edit'), '.'));
      }
      draw(); const offs = ['settings.integrations', 'sessions'].map((p) => st.subscribe(p, draw)); return () => offs.forEach((f) => f());
    }, { skel: 'table' });
  }
  SA.register({ id: 'integrations', group: 'system', title: 'التكاملات', icon: 'link', route: 'integrations', perm: 'sa.settings.view', order: 30, desc: 'FCM/APNs والفاتورة الإلكترونية (Open) والبريد والرسائل', render: integrationsRender });

  /* ═══════════════════════ SA-27 · النسخ والتصدير والصحة ═══════════════════════ */
  const ENTS = [['users', 'المستخدمون', 'sa.users.export'], ['departments', 'الأقسام', null], ['warehouses', 'المخازن', null], ['customers', 'العملاء', 'sa.customers.export'], ['suppliers', 'الموردون', 'sa.suppliers.export'], ['approvals', 'الاعتمادات', null], ['employees', 'الموظفون (HR)', 'hr.export.sensitive']];
  const HIDE = ['activationToken', 'failed', 'secret', 'sealData', 'signatureData'];
  const flat = (r) => { const o = {}; Object.keys(r).forEach((k) => { if (HIDE.indexOf(k) >= 0) return; const v = r[k]; o[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(SA.redact(v)) : v; }); return o; };
  function exportEntity(e) {
    if (e[2] && !SA.can(e[2])) return SA.toast(NOPERM + ' (' + e[2] + ')', 'warn'); let rows = (st.get(e[0]) || []).map((r) => flat(SA.redact(r)));
    if (e[0] === 'customers') rows = SA.scopeFilter('customers', st.get('customers') || [], 'salesRepId').map((r) => flat(r));
    if (!rows.length) return SA.toast('لا توجد بيانات للتصدير.', 'info'); const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))); SA.download(e[0] + '-' + new Date().toISOString().slice(0, 10) + '.csv', SA.csv([keys].concat(rows.map((r) => keys.map((k) => r[k])))), 'text/csv');
    SA.audit('EXPORT.DATA', { target: { type: e[0], id: e[0], label: e[1] }, after: { rows: rows.length, format: 'CSV', redacted: e[0] === 'employees' && !SA.canSensitive('hr.salary.view') } }); SA.toast('تم تصدير ' + rows.length + ' سجل', 'success');
  }
  async function exportFull() {
    if (!SA.can('sa.settings.edit')) return SA.toast(NOPERM + ' (sa.settings.edit)', 'warn');
    const r = await SA.confirm({ title: 'تصدير نسخة كاملة من بيانات النموذج', confirmLabel: 'متابعة', danger: true, reasonRequired: true, impact: ['ملف JSON فيه كل مجموعات البيانات.', 'كلمات المرور والأسرار والصور الرسمية مستبعدة.', 'الأجور/التكاليف تُحجب لو لا تملك صلاحيتها.'] }); if (!r.ok) return; if (!(await SA.stepUp('audit.export', { force: true, title: 'تصدير حساس — إعادة تحقق' }))) return;
    const snap = clone(st.get('')); delete snap.creds; delete snap.session; delete snap.tour; snap.settings.integrations.forEach((i) => { i.secret = i.secret ? { configured: true } : null; }); if (snap.settings.company) { delete snap.settings.company.sealData; delete snap.settings.company.signatureData; }
    const out = SA.redact(snap); const txt = JSON.stringify(out, null, 2);
    try { await SA.api(() => { SA.download('eg-demo-export-' + new Date().toISOString().slice(0, 10) + '.json', txt, 'application/json'); st.update('settings.system', (s) => { s.lastExport = { at: new Date().toISOString(), by: SA.session.userId, bytes: txt.length, scope: 'full' }; }); SA.audit('EXPORT.DATA', { target: { type: 'system', id: 'full', label: 'نسخة كاملة' }, after: { scope: 'full', bytes: txt.length, collections: Object.keys(out).length }, reason: r.reason }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم تصدير النسخة (' + Math.round(txt.length / 1024) + ' KB)', 'success');
  }
  function healthChecks() {
    const R = []; const add = (id, label, status, detail) => R.push({ id, label, status, detail });
    const bytes = JSON.stringify(st.get('')).length * 2; const pct = Math.round(bytes / (5 * 1024 * 1024) * 100); add('storage', 'مساحة تخزين المتصفح', pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'fail', Math.round(bytes / 1024) + ' KB تقريبًا من ~5 MB (' + pct + '%) — حد تقديري للمتصفح');
    const ids = (c) => new Set((st.get(c) || []).map((x) => x.id)); const U = ids('users'), RL = ids('roles'), D = ids('departments'), PL = ids('priceLists'), C = ids('customers'), W = ids('warehouses');
    const cnt = (arr, fn) => arr.filter(fn).length;
    const bad1 = cnt(st.get('users') || [], (u) => !RL.has(u.roleId)); add('u-role', 'كل مستخدم له دور صالح', bad1 ? 'fail' : 'ok', bad1 ? bad1 + ' مستخدم بدور غير موجود' : 'سليم');
    const bad2 = cnt(st.get('users') || [], (u) => u.departmentId && !D.has(u.departmentId)); add('u-dept', 'قسم كل مستخدم موجود', bad2 ? 'fail' : 'ok', bad2 ? bad2 + ' مستخدم بقسم غير موجود' : 'سليم');
    const bad3 = cnt(st.get('users') || [], (u) => u.managerId && !U.has(u.managerId)); add('u-mgr', 'المدير المباشر موجود', bad3 ? 'warn' : 'ok', bad3 ? bad3 + ' مستخدم بمدير غير موجود' : 'سليم');
    const bad4 = cnt(st.get('customers') || [], (c) => (c.salesRepId && !U.has(c.salesRepId)) || (c.priceListId && !PL.has(c.priceListId))); add('c-ref', 'مرجعية العملاء (مندوب/قائمة أسعار)', bad4 ? 'fail' : 'ok', bad4 ? bad4 + ' عميل بمرجع مكسور' : 'سليم');
    const bad5 = cnt(st.get('priceLists') || [], (p) => (p.assignedTo || []).some((x) => /^C-/.test(x) && !C.has(x))); add('pl-ref', 'قوائم الأسعار تشير لعملاء موجودين', bad5 ? 'fail' : 'ok', bad5 ? bad5 + ' قائمة بتعيين مكسور' : 'سليم');
    const bad6 = cnt(st.get('warehouses') || [], (w) => w.managerId && !U.has(w.managerId)); add('w-mgr', 'مسؤولو المخازن موجودون', bad6 ? 'fail' : 'ok', bad6 ? bad6 + ' مخزن بمسؤول غير موجود' : 'سليم');
    const bad7 = cnt(st.get('departments') || [], (d) => (d.managerId && !U.has(d.managerId)) || (d.parentId && !D.has(d.parentId))); add('d-ref', 'مرجعية الأقسام (مدير/أب)', bad7 ? 'fail' : 'ok', bad7 ? bad7 + ' قسم بمرجع مكسور' : 'سليم');
    const bad8 = cnt(st.get('approvals') || [], (a) => a.requesterId && !U.has(a.requesterId)); add('a-ref', 'مقدّمو الاعتمادات موجودون', bad8 ? 'warn' : 'ok', bad8 ? bad8 + ' طلب بمقدّم غير موجود' : 'سليم');
    const bad9 = cnt(st.get('employees') || [], (e) => !D.has(e.departmentId)); add('e-dept', 'أقسام الموظفين (HR) صالحة', bad9 ? 'fail' : 'ok', bad9 ? bad9 + ' موظف بقسم غير موجود' : 'سليم');
    const au = st.get('audit') || []; const dupAu = au.length - new Set(au.map((x) => x.id)).size; add('audit', 'سجل التدقيق: معرّفات فريدة', dupAu ? 'fail' : 'ok', dupAu ? dupAu + ' معرّف مكرر' : au.length + ' حدث — سليم');
    const sas = SA.rbac.superAdmins(true).length; add('sa-min', 'حسابان Super Admin نشطان على الأقل', sas >= 2 ? 'ok' : 'fail', 'نشط حاليًا: ' + sas);
    const sam = (st.get('modules') || []).find((m) => m.key === 'super_admin'); add('mod-sa', 'موديول Super Admin مفعّل', sam && sam.enabled ? 'ok' : 'fail', sam && sam.enabled ? 'مفعّل ومقفول' : 'معطّل!');
    const nsa = SA.rbac.superAdmins(true).filter((u) => !u.mfa).length; add('mfa', 'MFA لحسابات Super Admin', nsa ? 'fail' : 'ok', nsa ? nsa + ' حساب بدون MFA' : 'كلها مفعّلة');
    const sec = st.get('settings.security') || {}; add('sec', 'سياسة الأمان', sec.idleDemo || sec.lockoutDemo ? 'warn' : 'ok', sec.idleDemo || sec.lockoutDemo ? 'قيم تجريبية لم تُعتمد (بند 15)' : 'معتمدة');
    const rd = SA.company && SA.company.readiness ? SA.company.readiness() : null; if (rd) add('company', 'جاهزية بيانات الشركة', rd.ok ? 'ok' : 'warn', rd.ok ? 'مكتملة' : 'ناقص ' + rd.missing.length + ': ' + rd.missing.map((m) => m.label).join('، '));
    const ints = st.get('settings.integrations') || []; add('integ', 'التكاملات', 'warn', ints.filter((i) => i.status === 'not_configured').length + ' غير مُعدّة · الفاتورة الإلكترونية Open'); add('backend', 'الخادم والنسخ الاحتياطي التلقائي', 'warn', 'EG-System Frontend-only — لا Backend ولا نسخ تلقائي (Open: قرار البنية)');
    return R;
  }
  function backupRender(root, ctx) {
    ctx.setCrumbs([{ label: 'النظام' }, { label: 'النسخ والتصدير والصحة' }]);
    return mount(root, (host) => {
      host.append(SA.pageHead({ title: 'النسخ والتصدير وصحة النظام', desc: 'EG-System حاليًا Frontend-only: لا نسخ احتياطي تلقائي ولا خادم. يعتمد على قرار Backend/البنية. المتاح هنا تصدير حقيقي لبيانات النموذج وفحوصات سلامة فعلية ووضع صيانة.', tags: [SA.tag('new'), SA.tag('open', 'البنية Open')] }));
      const body = h('div.sap-sys-grid'); host.append(body); let results = healthChecks(); let running = false;
      function draw() {
        SA.clear(body); const sys = st.get('settings.system') || {}; const mt = maint(); const le = sys.lastExport; const warn = results.filter((r) => r.status === 'warn').length, fail = results.filter((r) => r.status === 'fail').length;
        const mSw = h('input', { type: 'checkbox', checked: !!mt.on, disabled: !SA.can('sa.settings.edit'), 'aria-label': 'وضع الصيانة' });
        mSw.addEventListener('change', async () => { const want = mSw.checked; mSw.checked = !want; const r = await SA.confirm({ title: want ? 'تفعيل وضع الصيانة' : 'إيقاف وضع الصيانة', danger: want, confirmLabel: want ? 'تفعيل الصيانة' : 'إيقاف', reasonRequired: true, impact: want ? ['العمليات الكتابية تُرفض لكل المستخدمين عدا Super Admin.', 'يظهر شريط «وضع الصيانة» أعلى الشاشة.', 'الجلسات الحالية لا تُنهى.'] : ['تعود الكتابة لكل المستخدمين.'] }); if (!r.ok) return; if (!(await SA.stepUp('policy.change'))) return; try { await SA.api(() => { const before = clone(maint()); st.update('settings.system', (s) => { s.maintenance = { on: want, reason: r.reason, since: want ? new Date().toISOString() : null, by: SA.session.userId }; }); SA.audit('SYSTEM.MAINTENANCE_TOGGLED', { target: { type: 'system', id: 'maintenance', label: 'وضع الصيانة' }, before: { on: !!before.on }, after: { on: want }, reason: r.reason }); SA.notify({ title: want ? 'تم تفعيل وضع الصيانة' : 'تم إيقاف وضع الصيانة', body: r.reason, level: want ? 'urgent' : 'info', to: ['R-01', 'R-10'], link: '#/backup' }); }, { maint: true }); } catch (e) { return SA.fail(e); } SA.toast(want ? 'وضع الصيانة مفعّل' : 'تم إيقاف الصيانة', want ? 'warn' : 'success'); });
        body.append(
          SA.card({ title: 'آخر نسخة / تصدير', actions: [SA.btn({ label: 'تصدير نسخة كاملة (JSON)', icon: 'download', kind: 'accent', perm: 'sa.settings.edit', onClick: exportFull })] }, le ? SA.kv([['الوقت', SA.fmt.dt(le.at)], ['بواسطة', SA.userName(le.by)], ['الحجم', Math.round(le.bytes / 1024) + ' KB'], ['النطاق', 'كامل (بدون أسرار)']]) : SA.empty({ icon: 'server', title: 'لا توجد نسخة', text: 'لا نسخ احتياطي تلقائي في النموذج. صدّر نسخة يدويًا.' }), SA.alert('info', 'النسخ التلقائي والاحتفاظ والجدولة: Open — يعتمد على Backend/البنية.')),
          SA.card({ title: 'وضع الصيانة', actions: [SA.chip(mt.on ? 'مفعّل' : 'متوقف', mt.on ? 'danger' : 'neutral')] }, h('label.sap-switch-line', {}, h('span', {}, h('b', {}, 'تفعيل وضع الصيانة'), h('small', {}, mt.on ? 'منذ ' + SA.fmt.dt(mt.since) + ' — ' + (mt.reason || '') : 'يمنع الكتابة لغير Super Admin ويعرض شريطًا تنبيهيًا.')), h('span.switch', {}, mSw, h('span'))), h('p.t-caption', {}, 'تفعيله/إيقافه بـStep-up وسبب ويُسجَّل SYSTEM.MAINTENANCE_TOGGLED.')),
          h('div', { style: { gridColumn: '1 / -1' } }, SA.card({ title: 'تصدير حسب الكيان', flush: true }, h('div.table-wrap', {}, h('table.table.sap-sys-exp', {}, h('thead', {}, h('tr', {}, ['الكيان', 'عدد السجلات', 'الصلاحية', ''].map((t) => h('th', {}, t)))), h('tbody', {}, ENTS.map((e) => { const ok = !e[2] || SA.can(e[2]); return h('tr', {}, h('td', {}, h('b', {}, e[1])), h('td.num', {}, (st.get(e[0]) || []).length), h('td', {}, e[2] ? h('code', {}, e[2]) : h('span.t-muted', {}, 'بدون مفتاح مخصص')), h('td', {}, SA.btn({ label: 'CSV', icon: 'download', kind: 'ghost', size: 'sm', reason: ok ? '' : NOPERM + ' (' + e[2] + ')', onClick: () => exportEntity(e) }))); })))), h('p.t-caption', { style: { padding: '0 16px 12px' } }, 'الأجور والتكاليف تُحجب لمن لا يملك صلاحيتها. سجل التدقيق يُصدَّر من شاشة التدقيق بـStep-up (EXPORT.AUDIT).'))),
          h('div', { style: { gridColumn: '1 / -1' } }, SA.card({ title: 'فحوصات الصحة', actions: [h('span.t-caption', {}, fail ? fail + ' فشل · ' : '', warn + ' تنبيه'), SA.btn({ label: running ? 'جارٍ الفحص…' : 'إعادة الفحص', icon: 'refresh', kind: 'ghost', size: 'sm', reason: running ? 'الفحص يعمل' : '', onClick: rerun })] }, h('div.sap-sys-hc', {}, results.map((r) => h('div.r.' + r.status, {}, h('span.dot', {}, SA.icon(r.status === 'ok' ? 'check' : r.status === 'warn' ? 'alert' : 'x', 'icon-sm')), h('div', {}, h('b', {}, r.label), h('small', {}, r.detail))))))));
      }
      async function rerun() { running = true; draw(); try { await SA.delay(700, { write: false }); } catch (e) { running = false; draw(); return SA.fail(e); } results = healthChecks(); running = false; draw(); SA.toast('اكتمل الفحص', 'success'); }
      draw(); const off = st.subscribe('settings.system', draw); return () => off();
    });
  }
  SA.register({ id: 'backup', group: 'system', title: 'النسخ والصحة', icon: 'server', route: 'backup', perm: 'sa.settings.view', order: 40, desc: 'تصدير وصحة وصيانة', render: backupRender });
  SA.catalog.addAudit('SYSTEM.MAINTENANCE_TOGGLED', 'تفعيل/إيقاف وضع الصيانة', 'high', 'settings');

  /* ───────────────────────── Test Lab missions ───────────────────────── */
  SA.missions.add({ id: 'M-C13', area: 'system', title: 'غيّر دومين الكتالوج بتحقق وStep-up', persona: 'owner', route: 'settings', est: '3 د', goal: 'غيّر الدومين، اضغط «تحقق»، راجع تحذير الروابط، واحفظ بـStep-up.', steps: [{ text: 'اكتب دومين جديد وتحقق ثم احفظ', route: 'settings', audit: 'SETTINGS.CHANGED' }], detect: [{ audit: 'SETTINGS.CHANGED' }] });
  SA.missions.add({ id: 'M-C14', area: 'system', title: 'صمّم قاعدة إشعار كمسودة وشوف معاينة التسليم', persona: 'owner', route: 'notifications', est: '3 د', goal: 'افتح حدثًا، اختر الأدوار والقنوات، شاهد معاينة push/داخل التطبيق/بريد، واحفظ كمسودة (التفعيل مقفول).', steps: [{ text: 'افتح حدثًا وعدّل القاعدة', route: 'notif-rules', audit: 'NOTIFICATION.RULE_CHANGED' }], detect: [{ audit: 'NOTIFICATION.RULE_CHANGED' }] });
  SA.missions.add({ id: 'M-C15', area: 'system', title: 'أدخل مفتاح FCM — ولا سر في السجل', persona: 'it', route: 'integrations', est: '3 د', goal: 'كـIT أدخل مفتاحًا، لاحظ «مُدخل — لم يُختبر» وإخفاء السر، ثم راجع حدث التدقيق: بدون السر.', steps: [{ text: 'أدخل مفتاح FCM بـStep-up', audit: 'INTEGRATION.CHANGED' }, { text: 'راجع السجل: بصمة فقط', route: 'audit' }], detect: [{ audit: 'INTEGRATION.CHANGED' }] });
  SA.missions.add({ id: 'M-C16', area: 'system', title: 'فعّل وضع الصيانة وجرّب الكتابة كمستخدم عادي', persona: 'owner', route: 'backup', est: '5 د', goal: 'فعّل الصيانة بسبب وStep-up. اخرج وادخل كمدير مبيعات وجرّب أي إجراء كتابي: يُرفض. ارجع كصاحب الشركة وأوقفها.', steps: [{ text: 'فعّل وضع الصيانة', route: 'backup', audit: 'SYSTEM.MAINTENANCE_TOGGLED' }, { text: 'كمدير مبيعات جرّب إجراء كتابيًا (مرفوض)' }, { text: 'أوقف الصيانة كصاحب الشركة', audit: 'SYSTEM.MAINTENANCE_TOGGLED' }], detect: [{ audit: 'SYSTEM.MAINTENANCE_TOGGLED' }] });
})();
