/* EG Super Admin prototype — mod-policies.js  (agent C · SA-12..SA-15 السياسات)
   Routes: #/policies/approvals · #/policies/numbering · #/policies/templates · #/policies/finance · #/policies/security
   لا قيم افتراضية للقيم Open (عتبات الاعتماد، الضريبة، مدة التأخير…). كل تعديل = مراجعة قبل/بعد + Step-up (policy.change) + تدقيق.
   سياسة الأمان تكتب settings.security التي يقرؤها auth.js (الخمول، حد القفل) و SA.stepUp (قائمة Step-up) مباشرة → الأثر حيّ. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const NOPERM = 'ليست من صلاحياتك';
  const MOD = 'pol';
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? null : o));
  function css(text) { if (document.querySelector('style[data-mod="' + MOD + '"]')) return; const s = document.createElement('style'); s.setAttribute('data-mod', MOD); s.textContent = text; document.head.appendChild(s); }
  css(`
.sap-pol-chain{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.sap-pol-chain .arr{color:var(--color-text-muted)}
.sap-pol-sw{display:inline-flex}.sap-pol-steps{display:grid;gap:8px;margin-block:8px}
.sap-pol-step{display:flex;gap:10px;align-items:center;border:1px solid var(--color-border);border-radius:10px;padding:8px 12px;background:#fff}.sap-pol-step .n{width:26px;height:26px;border-radius:50%;background:var(--color-primary-tint);color:var(--eg-navy);display:grid;place-items:center;font:700 12px var(--font-en);flex:none}.sap-pol-step b{flex:1}
.sap-pol-sim{display:grid;gap:12px}.sap-pol-simres{border:1px solid var(--color-border-strong);border-radius:12px;padding:14px;background:var(--color-bg-alt)}.sap-pol-simres h4{margin:0 0 8px}
.sap-pol-pill{display:inline-flex;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;background:var(--color-primary-tint);color:var(--eg-navy)}
.sap-pol-prev{font:700 1.5rem var(--font-en);letter-spacing:.02em;color:var(--eg-navy);direction:ltr;text-align:start;padding:10px 14px;background:var(--color-bg-alt);border-radius:10px;border:1px dashed var(--color-border-strong)}
.sap-pol-a4{background:#fff;border:1px solid var(--color-border-strong);border-radius:6px;aspect-ratio:210/297;max-width:300px;width:100%;margin-inline:auto;padding:16px;position:relative;display:flex;flex-direction:column;gap:7px;font-size:11px;box-shadow:0 8px 24px rgba(2,32,79,.1);overflow:hidden}
.sap-pol-a4 .ln{height:6px;background:var(--color-border);border-radius:3px}.sap-pol-a4 .ln.s{width:55%}.sap-pol-a4 .slots{margin-block-start:auto;display:flex;justify-content:space-between;gap:8px}.sap-pol-a4 .slot{flex:1;height:54px;border:1px dashed var(--color-border-strong);border-radius:6px;display:grid;place-items:center;color:var(--color-text-muted);font-size:10px;text-align:center}.sap-pol-a4 .slot.on{border-style:solid;color:var(--eg-navy);background:var(--color-primary-tint)}
.sap-pol-a4 .wm{position:absolute;inset:0;display:grid;place-items:center;font-size:36px;font-weight:800;color:rgba(2,32,79,.06);transform:rotate(-24deg);pointer-events:none;white-space:nowrap}
.sap-pol-sec{display:grid;gap:16px}.sap-pol-live{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 14px;border:1px solid var(--color-border);border-radius:12px;background:var(--color-bg-alt);margin-block-start:10px}.sap-pol-live b{color:var(--eg-navy)}
.sap-pol-su{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:8px}.sap-pol-su label{display:flex;gap:12px;align-items:center;justify-content:space-between;border:1px solid var(--color-border);border-radius:10px;padding:10px 14px;background:#fff;min-height:48px}.sap-pol-su label.is-locked{background:var(--color-bg-alt)}.sap-pol-su small{display:block;color:var(--color-text-muted)}
.sap-pol-savebar{position:sticky;inset-block-end:0;z-index:5;display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--color-border-strong);border-radius:14px;padding:12px 16px;margin-block-start:16px;box-shadow:0 -6px 20px rgba(2,32,79,.08);flex-wrap:wrap}
.sap-pol-fin{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr));gap:16px;align-items:start}
.sap-pol-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.sap-pol-list li{display:flex;gap:10px;align-items:center;justify-content:space-between;border:1px solid var(--color-border);border-radius:10px;padding:8px 12px}
.sap-pol-hold{border:1px dashed var(--color-border-strong);border-radius:12px;padding:14px;background:var(--color-bg-alt);display:flex;gap:12px;align-items:flex-start}
`);

  /* ───────────────────────── helpers ───────────────────────── */
  function mount(root, build, opts) {
    opts = opts || {}; const host = h('div'); root.append(host); let alive = true, off = null;
    function run() {
      if (typeof off === 'function') { off(); off = null; }
      SA.clear(host); host.append(h('div', { style: { paddingBlock: '8px' } }, SA.skeleton({ kind: opts.skel || 'form', rows: 7 })));
      SA.delay(opts.ms || 220, { write: false }).then(() => { if (!alive) return; SA.clear(host); try { off = build(host, run) || null; } catch (e) { console.error(e); SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); } }, (e) => { if (!alive) return; SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); });
    }
    run(); return () => { alive = false; if (typeof off === 'function') off(); };
  }
  /** review (before/after) → Step-up → apply + audit. Returns true when committed. */
  async function commit(o) {
    const tbl = SA.diffTable(o.before, o.after); const rows = SA.diffRows(o.before, o.after).filter((r) => r.changed);
    if (!rows.length) { SA.toast('لا توجد تغييرات للحفظ.', 'info'); return false; }
    const r = await SA.confirm({ title: o.title || 'مراجعة التغييرات', icon: 'lock', confirmLabel: 'متابعة للتحقق', extra: tbl, impact: o.impact || [], reasonRequired: !!o.reasonRequired, note: 'هيتسجّل ' + o.code + ' بقيمة قبل/بعد.' });
    if (!r.ok) return false; if (!(await SA.stepUp('policy.change'))) return false;
    try { await SA.api(() => { o.apply(); SA.audit(o.code, { target: o.target, before: o.before, after: o.after, reason: r.reason || o.reason || '' }); }); } catch (e) { SA.fail(e); return false; }
    return true;
  }
  const roleChip = (id) => h('span.chip.chip-info', {}, SA.roleName(id));
  const chainNode = (chain) => h('span.sap-pol-chain', {}, (chain || []).map((id, i) => [i ? h('span.arr', { 'aria-hidden': 'true' }, '←') : null, roleChip(id)]));
  const sw = (checked, disabledReason, onChange, label) => { const i = h('input', { type: 'checkbox', checked: !!checked, disabled: !!disabledReason, 'aria-label': label }); i.addEventListener('change', () => onChange(i)); return h('label.switch', { title: disabledReason || null }, i, h('span')); };
  const saveBar = (txtId, onSave, onReset, label) => h('div.sap-pol-savebar', {}, h('span.t-muted', { id: txtId }, 'لا توجد تغييرات غير محفوظة'), h('div.cluster', {}, h('button.btn.btn-ghost', { type: 'button', onclick: onReset }, 'تراجع'), h('button.btn.btn-accent', { type: 'button', onclick: onSave }, SA.icon('lock', 'icon-sm'), label || 'مراجعة وحفظ')));

  /* ═══════════════════════ SA-12 · مصفوفة الاعتماد + المحاكي ═══════════════════════ */
  const TRIG = { discount_pct: { label: 'نسبة خصم', unit: '%', hint: 'يُفعَّل لو الخصم المطلوب أعلى من العتبة.', max: 100 }, order_value: { label: 'قيمة طلب', unit: 'ج.م', hint: 'يُفعَّل لو قيمة الطلب أعلى من العتبة.' }, exception: { label: 'طلب استثنائي', unit: null, hint: 'بدون عتبة — يُفعَّل لو الطلب معلَّم استثنائيًا.' } };
  const rules = () => st.get('settings.approvalRules') || [];
  const approverRoles = () => (st.get('roles') || []).filter((r) => r.status === 'active' && (r.isProtected || SA.roleCan(r, 'sa.approvals.approve')));
  const thrText = (r) => (TRIG[r.trigger] && TRIG[r.trigger].unit ? (r.threshold == null ? SA.openValue('عتبة غير مُعدّة') : h('b.num', {}, SA.fmt.num(r.threshold) + ' ' + TRIG[r.trigger].unit)) : h('span.t-muted', {}, 'بدون عتبة'));
  function ruleProblem(r) { if (!r.enabled) return ''; if (TRIG[r.trigger] && TRIG[r.trigger].unit && (r.threshold == null || r.threshold <= 0)) return 'لا يمكن تفعيل قاعدة بعتبة فاضية — حدّد العتبة أولًا.'; if (!r.chain || !r.chain.length) return 'السلسلة فاضية — أضف خطوة اعتماد واحدة على الأقل.'; return ''; }

  function openRuleEditor(rule) {
    const isNew = !rule; if (!SA.can('sa.policies.approvals.edit')) return SA.toast(NOPERM + ' (sa.policies.approvals.edit)', 'warn');
    const r0 = rule ? clone(rule) : { id: null, trigger: 'discount_pct', label: '', threshold: null, chain: ['R-03'], escalationHours: null, enabled: false };
    const work = clone(r0);
    const trig = SA.form.field({ name: 'trigger', label: 'المحفّز', type: 'select', value: work.trigger, options: Object.keys(TRIG).map((k) => [k, TRIG[k].label]), onChange: (v) => { work.trigger = v; if (!TRIG[v].unit) work.threshold = null; drawThr(); } });
    const label = SA.form.field({ name: 'label', label: 'اسم القاعدة', value: work.label, required: true, onInput: (v) => { work.label = v; } });
    const thrHost = h('div'); const thr = { f: null };
    function drawThr() { SA.clear(thrHost); const t = TRIG[work.trigger]; thr.f = SA.form.field({ name: 'threshold', label: 'العتبة' + (t.unit ? ' (' + t.unit + ')' : ''), type: 'number', value: work.threshold, min: 0, max: t.max, hint: t.unit ? 'فاضية = غير مُعدّة. ' + t.hint : t.hint, disabled: !t.unit, onInput: (v) => { work.threshold = v === '' ? null : Number(v); } }); thrHost.append(thr.f.el); }
    drawThr();
    const esc = SA.form.field({ name: 'esc', label: 'مدة التصعيد عند التأخير (ساعات) [New]', type: 'number', value: work.escalationHours, min: 1, hint: 'Open — فاضية = لا تصعيد. التصعيد يبعت للخطوة التالية/تنبيه (UC-APR-03).', onInput: (v) => { work.escalationHours = v === '' ? null : Number(v); } });
    const en = SA.form.field({ name: 'enabled', type: 'switch', label: 'القاعدة مفعّلة', hint: 'القاعدة غير المفعّلة لا تؤثر على أي طلب.', value: work.enabled, onChange: (v) => { work.enabled = v; } });
    const chainHost = h('div'); const err = h('div.sap-field-error', { role: 'alert', hidden: true });
    function drawChain() {
      SA.clear(chainHost); const avail = approverRoles().filter((x) => work.chain.indexOf(x.id) < 0);
      const add = h('select.select', { 'aria-label': 'إضافة خطوة اعتماد' }, h('option', { value: '' }, 'إضافة خطوة…'), avail.map((x) => h('option', { value: x.id }, x.nameAr)));
      add.addEventListener('change', () => { if (add.value) { work.chain.push(add.value); drawChain(); } });
      chainHost.append(h('div.sap-pol-steps', {}, work.chain.length ? work.chain.map((id, i) => h('div.sap-pol-step', {}, h('span.n', {}, i + 1), h('b', {}, SA.roleName(id)), SA.btn({ iconOnly: true, icon: 'chevup', kind: 'ghost', size: 'sm', label: 'تقديم', reason: i === 0 ? 'أول خطوة' : '', onClick: () => { work.chain.splice(i - 1, 0, work.chain.splice(i, 1)[0]); drawChain(); } }), SA.btn({ iconOnly: true, icon: 'chevdown', kind: 'ghost', size: 'sm', label: 'تأخير', reason: i === work.chain.length - 1 ? 'آخر خطوة' : '', onClick: () => { work.chain.splice(i + 1, 0, work.chain.splice(i, 1)[0]); drawChain(); } }), SA.btn({ iconOnly: true, icon: 'trash', kind: 'ghost', size: 'sm', label: 'حذف الخطوة', onClick: () => { work.chain.splice(i, 1); drawChain(); } }))) : h('p.t-muted', {}, 'لا توجد خطوات بعد.')), avail.length ? add : null);
    }
    drawChain();
    const d = SA.drawer({ title: isNew ? 'قاعدة اعتماد جديدة' : 'تعديل القاعدة — ' + r0.label, subtitle: 'SCR-APR-02', size: 'md', body: h('div.sap-confirm', {}, label.el, trig.el, thrHost, h('div', {}, h('b', {}, 'سلسلة الاعتماد'), h('p.t-caption', {}, 'الترتيب = ترتيب القرار. الخطوة الأولى تتلقى الطلب أولًا.'), chainHost), esc.el, en.el, err, SA.alert('info', 'التغيير لا يؤثر على الطلبات المقدّمة قبله — كل طلب يُقيَّم بقاعدة وقت تقديمه (US-APR-02).')),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, 'مراجعة وحفظ')] });
    async function save() {
      if (!label.validate()) return label.focus(); work.label = label.get().trim();
      if (TRIG[work.trigger].unit && work.threshold != null && (isNaN(work.threshold) || work.threshold <= 0 || (TRIG[work.trigger].max && work.threshold > TRIG[work.trigger].max))) { thr.f.error('أدخل رقمًا صحيحًا أكبر من صفر' + (TRIG[work.trigger].max ? ' وحتى ' + TRIG[work.trigger].max : '')); return; }
      const p = ruleProblem(work); if (p) { err.hidden = false; err.textContent = p; return; } err.hidden = true;
      const id = r0.id || 'AR-' + (rules().reduce((m, x) => Math.max(m, +String(x.id).replace(/\D/g, '') || 0), 0) + 1);
      const after = Object.assign({}, work, { id }); const beforeV = isNew ? {} : r0;
      const ok = await commit({ title: 'مراجعة قاعدة الاعتماد', code: 'POLICY.APPROVAL_CHANGED', target: { type: 'approvalRule', id, label: after.label }, before: beforeV, after, apply: () => { st.update('settings.approvalRules', (l) => { const i = l.findIndex((x) => x.id === id); if (i >= 0) l[i] = after; else l.push(after); }); }, impact: ['لا أثر على الطلبات القائمة.'] });
      if (ok) { d.close(); SA.toast('تم حفظ القاعدة', 'success'); }
    }
  }

  function openSimulator() {
    SA.track('approval.simulated');
    const disc = SA.form.field({ name: 'disc', label: 'نسبة الخصم المطلوبة (%)', type: 'number', min: 0, max: 100, value: '' });
    const val = SA.form.field({ name: 'val', label: 'قيمة الطلب (ج.م)', type: 'number', min: 0, value: '' });
    const exc = SA.form.field({ name: 'exc', type: 'checkbox', label: 'طلب استثنائي', value: false });
    const over = {}; const res = h('div.sap-pol-simres', { 'aria-live': 'polite' });
    const whatif = h('div.sap-pol-sim', {}, rules().map((r) => {
      const t = TRIG[r.trigger]; if (!t.unit) return null; over[r.id] = { use: false, v: null };
      const on = h('input', { type: 'checkbox' }); const num = h('input.input.num', { type: 'number', min: 0, placeholder: 'عتبة افتراضية للتجربة', disabled: true, 'aria-label': 'عتبة افتراضية لـ' + r.label, style: { maxWidth: '180px' } });
      on.addEventListener('change', () => { over[r.id].use = on.checked; num.disabled = !on.checked; run(); }); num.addEventListener('input', () => { over[r.id].v = num.value === '' ? null : Number(num.value); run(); });
      return h('div.cluster', { style: { alignItems: 'center', gap: '10px', flexWrap: 'wrap' } }, h('label.check', {}, on, r.label + ' ' + (r.threshold == null ? '(غير مُعدّة)' : '(' + SA.fmt.num(r.threshold) + t.unit + ')')), num);
    }));
    function run() {
      const i = { disc: disc.get() === '' ? null : Number(disc.get()), val: val.get() === '' ? null : Number(val.get()), exc: exc.get() }; SA.clear(res);
      const fired = [], idle = [];
      rules().forEach((r) => {
        const o = over[r.id]; const useOver = o && o.use && o.v != null && o.v > 0; const thrV = useOver ? o.v : r.threshold; const active = useOver || (r.enabled && (thrV != null || !TRIG[r.trigger].unit));
        if (!active) { idle.push(r); return; }
        let hit = false; if (r.trigger === 'discount_pct') hit = i.disc != null && i.disc > thrV; else if (r.trigger === 'order_value') hit = i.val != null && i.val > thrV; else if (r.trigger === 'exception') hit = !!i.exc;
        if (hit) fired.push({ r, thr: thrV, temp: useOver && !(r.enabled && r.threshold != null) });
      });
      const chain = []; fired.forEach((f) => f.r.chain.forEach((c) => { if (chain.indexOf(c) < 0) chain.push(c); }));
      res.append(h('h4', {}, 'النتيجة'), h('span.sap-pol-pill', {}, 'محاكاة فقط — لا يُنشأ طلب'));
      if (!fired.length) res.append(h('p', {}, i.disc == null && i.val == null && !i.exc ? 'أدخل قيمًا لتشغيل المحاكاة.' : 'لا تنطبق أي قاعدة مفعّلة — الطلب يمر بدون اعتماد إضافي.'), idle.length ? h('p.t-caption', {}, 'قواعد غير مفعّلة/غير مُعدّة لا تؤثر: ' + idle.map((x) => x.label).join('، ')) : null);
      else res.append(h('p', {}, 'القواعد المنطبقة: ', fired.map((f) => f.r.label + (f.temp ? ' (عتبة افتراضية للتجربة)' : '')).join('، ')), h('div.sap-pol-steps', {}, chain.map((c, k) => h('div.sap-pol-step', {}, h('span.n', {}, k + 1), h('b', {}, SA.roleName(c)), h('span.t-caption', {}, k === 0 ? 'يستلم أولًا' : 'بعد الخطوة السابقة')))));
    }
    [disc, val].forEach((f) => f.input.addEventListener('input', run)); exc.input.addEventListener('change', run); run();
    const m = SA.modal({ title: 'محاكاة قاعدة اعتماد', subtitle: 'SCR-APR-03 · «طلب بخصم X% وقيمة Y، هيروح لمين؟»', icon: 'flask', size: 'md', body: h('div.sap-confirm', {}, h('div.sap-formgrid', {}, disc.el, val.el), exc.el, h('details', {}, h('summary', { style: { cursor: 'pointer', fontWeight: 600 } }, 'افتراض عتبات للتجربة فقط (لا تُحفظ)'), h('p.t-caption', {}, 'كل العتبات الفعلية Open، فلو لسه غير مُعدّة افترض قيمة هنا لترى كيف يسير الطلب.'), whatif), res), foot: [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'إغلاق')] });
  }

  function approvalsRender(root, ctx) {
    ctx.setCrumbs([{ label: 'السياسات' }, { label: 'الاعتماد والخصم' }]);
    return mount(root, (host, retry) => {
      const head = h('div'), listHost = h('div'); host.append(head, listHost);
      head.append(SA.pageHead({ title: 'قواعد الاعتماد وحدود الخصم', desc: 'محفّز ← سلسلة اعتماد. كل العتبات فارغة (Open بند 33) ولا تفعيل لقاعدة بدون عتبة. أي تعديل بإعادة تحقق وقيمة قبل/بعد.', tags: [SA.tag('pending', 'Pending بند 33'), SA.tag('open', 'العتبات Open')],
        actions: [SA.btn({ label: 'محاكاة قاعدة', icon: 'flask', kind: 'ghost', onClick: openSimulator }), SA.btn({ label: 'قاعدة جديدة', icon: 'plus', kind: 'accent', perm: 'sa.policies.approvals.edit', onClick: () => openRuleEditor(null) })] }));
      async function toggle(r, input) {
        if (!SA.can('sa.policies.approvals.edit')) { input.checked = r.enabled; return SA.toast(NOPERM + ' (sa.policies.approvals.edit)', 'warn'); }
        const next = Object.assign({}, clone(r), { enabled: input.checked }); const p = ruleProblem(next);
        if (p) { input.checked = r.enabled; SA.toast(p, 'error', { ms: 6000 }); return openRuleEditor(r); }
        const ok = await commit({ title: (input.checked ? 'تفعيل' : 'إيقاف') + ' القاعدة «' + r.label + '»', code: 'POLICY.APPROVAL_CHANGED', target: { type: 'approvalRule', id: r.id, label: r.label }, before: { enabled: r.enabled }, after: { enabled: input.checked }, apply: () => st.update('settings.approvalRules', (l) => { const x = l.find((y) => y.id === r.id); if (x) x.enabled = input.checked; }) });
        if (!ok) input.checked = r.enabled; else SA.toast('تم الحفظ', 'success');
      }
      function draw() {
        SA.clear(listHost);
        const none = !rules().some((r) => r.enabled);
        listHost.append(none ? SA.alert('info', h('b', {}, 'لا توجد قواعد مفعّلة. '), 'كل الطلبات تمر حسب الإعداد الحالي بدون سلسلة مبنية على قواعد حتى تحدّد العتبات وتفعّل القواعد.') : null,
          h('div.card.card-flush.sap-listcard', {}, SA.table({ rowId: 'id', pageSize: 10, caption: 'قواعد الاعتماد', rows: rules, columns: [
            { key: 'label', label: 'القاعدة', render: (r) => h('div', {}, h('b', {}, r.label), h('div.t-caption', {}, TRIG[r.trigger] ? TRIG[r.trigger].label : r.trigger)) },
            { key: 'threshold', label: 'العتبة', render: (r) => thrText(r) },
            { key: 'chain', label: 'السلسلة', render: (r) => chainNode(r.chain) },
            { key: 'escalationHours', label: 'التصعيد', render: (r) => (r.escalationHours == null ? SA.openValue('غير مُعدّ') : h('span.num', {}, r.escalationHours + ' ساعة')) },
            { key: 'enabled', label: 'مفعّلة', render: (r) => h('span.sap-pol-sw', {}, sw(r.enabled, SA.can('sa.policies.approvals.edit') ? '' : NOPERM, (i) => toggle(r, i), 'تفعيل ' + r.label)) }],
          rowActions: (r) => [{ label: 'تعديل', icon: 'edit', onClick: () => openRuleEditor(r) }], onRowClick: (r) => openRuleEditor(r), empty: { icon: 'list', title: 'لا توجد قواعد', text: 'أضف قاعدة جديدة.' }, onRetry: retry }).el),
          h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'قابل للتوسع لاحقًا لسند الصرف (بند 42) والمرتبات (بند 44). المحاكي لا ينشئ طلبًا.')));
      }
      draw(); const off = st.subscribe('settings.approvalRules', draw); return () => off();
    }, { skel: 'table' });
  }
  SA.register({ id: 'pol-approvals', group: 'policies', title: 'الاعتماد والخصم', icon: 'clipboard', route: 'policies/approvals', perm: 'sa.policies.approvals.view', order: 10, desc: 'قواعد الاعتماد وحدود الخصم والمحاكي', render: approvalsRender });

  /* ═══════════════════════ SA-13 · الترقيم والقوالب ═══════════════════════ */
  const numbering = () => st.get('settings.numbering') || [];
  const pad = (n, w) => String(n).padStart(w || 4, '0');
  function fmtNo(e, n, year) { year = year || new Date().getFullYear(); return e.prefix + '-' + (e.includeYear ? year + '-' : '') + pad(n, e.pad); }
  SA.numbering = Object.assign(SA.numbering || {}, {
    preview(type) { const e = numbering().find((x) => x.type === type); if (!e) return null; const y = new Date().getFullYear(); const base = e.yearlyReset && e.lastYear && e.lastYear !== y ? 0 : e.last; return fmtNo(e, base + 1, y); },
    /** atomic, gap-free per type (UC-NUM-04): returns the issued number and locks the format after the first document */
    next(type) { let out = null; st.update('settings.numbering', (l) => { const e = l.find((x) => x.type === type); if (!e) return; const y = new Date().getFullYear(); if (e.yearlyReset && e.lastYear && e.lastYear !== y) e.last = 0; e.last += 1; e.issued += 1; e.lastYear = y; e.locked = true; out = fmtNo(e, e.last, y); }); return out; }
  });
  const GROUPS = { fin: ['INV', 'DN', 'WO', 'ST', 'PS', 'QT', 'RV', 'PV', 'PR', 'AG', 'SOA', 'PAY', 'PF', 'SO'] };
  const grpOf = (e) => (/HR/.test(e.source || '') ? 'hr' : 'ops');
  const tag = (e) => (e.source && /HR/.test(e.source) ? SA.tag('pending', 'Pending · ' + e.source) : e.tag === 'new' ? SA.tag('new', e.source) : SA.tag(e.tag || 'pending', e.source));

  function openNumberEditor(entry) {
    if (!SA.can('sa.policies.numbering.edit')) return SA.toast(NOPERM + ' (sa.policies.numbering.edit)', 'warn');
    const e0 = clone(entry); const locked = !!(e0.locked || e0.issued > 0); const work = clone(e0);
    const prefix = SA.form.field({ name: 'prefix', label: 'البادئة', value: work.prefix, required: true, dir: 'ltr', hint: 'حروف إنجليزية كبيرة 1–5. لا بادئتين متطابقتين.', rules: [(v) => (!/^[A-Z]{1,5}$/.test(String(v).trim().toUpperCase()) ? 'حروف إنجليزية فقط (1–5)' : (numbering().find((x) => x.type !== e0.type && x.prefix === String(v).trim().toUpperCase()) ? 'البادئة مستخدمة لنوع «' + numbering().find((x) => x.type !== e0.type && x.prefix === String(v).trim().toUpperCase()).labelAr + '»' : null))], onInput: (v) => { work.prefix = String(v).trim().toUpperCase(); upd(); prefix.validate(); } });
    const yr = SA.form.field({ name: 'includeYear', type: 'switch', label: 'إظهار السنة في الرقم', value: work.includeYear, disabled: locked, onChange: (v) => { work.includeYear = v; upd(); } });
    const rs = SA.form.field({ name: 'yearlyReset', type: 'switch', label: 'تصفير التسلسل سنويًا', value: work.yearlyReset, disabled: locked, onChange: (v) => { work.yearlyReset = v; upd(); } });
    const pd = SA.form.field({ name: 'pad', label: 'عدد الخانات (الأصفار)', type: 'select', value: String(work.pad), disabled: locked, options: [3, 4, 5, 6].map((n) => [String(n), n + ' خانات']), onChange: (v) => { work.pad = +v; upd(); } });
    const prev = h('div.sap-pol-prev', { 'aria-live': 'polite' });
    function upd() { prev.textContent = fmtNo(work, e0.last + 1); }
    upd();
    const d = SA.drawer({ title: 'محرر الترقيم — ' + e0.labelAr, subtitle: 'SCR-NUM-02 · ' + e0.type, size: 'md', body: h('div.sap-confirm', {},
      locked ? SA.alert('warning', h('b', {}, 'الشكل مقفول. '), 'صدر ' + e0.issued + ' مستند من هذا النوع، فالشكل (السنة/التصفير/الخانات) لا يتغير. تغيير البادئة لا يعيد ترقيم المستندات القديمة.') : SA.alert('info', 'الشكل يتقفل بعد أول مستند صادر من النوع.'),
      prefix.el, h('div.sap-formgrid', {}, yr.el, rs.el), pd.el, h('div', {}, h('div.t-caption', {}, 'معاينة الرقم التالي'), prev), e0.source ? h('p.t-caption', {}, 'المصدر: ', tag(e0)) : null, e0.type === 'SO' ? SA.alert('warning', 'SO- مستخدمة في الديمو وغير مدرجة في الاعتماد (قرار 7).') : null),
      foot: [SA.btn({ label: 'إصدار رقم تجريبي', icon: 'play', kind: 'ghost', perm: 'sa.policies.numbering.edit', onClick: async () => { const r = await SA.confirm({ title: 'إصدار رقم تجريبي (' + e0.type + ')', confirmLabel: 'إصدار', impact: ['يُولّد الرقم التالي ويزيد العدّاد (UC-NUM-04) — لا يُنشئ مستندًا حقيقيًا.', 'بعد أول رقم يتقفل شكل هذا النوع.'] }); if (!r.ok) return; const n = SA.numbering.next(e0.type); SA.toast('تم توليد الرقم: ' + n, 'success'); d.close(); } }),
        h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, 'مراجعة وحفظ')] });
    async function save() {
      if (!prefix.validate()) return prefix.focus(); work.prefix = prefix.get().trim().toUpperCase();
      const pick = (e) => ({ prefix: e.prefix, includeYear: e.includeYear, yearlyReset: e.yearlyReset, pad: e.pad, sample: fmtNo(e, e0.last + 1) });
      const ok = await commit({ title: 'مراجعة ترقيم «' + e0.labelAr + '»', code: 'POLICY.NUMBERING_CHANGED', target: { type: 'numbering', id: e0.type, label: e0.labelAr }, before: pick(e0), after: pick(work), impact: locked ? ['الأرقام القديمة تبقى كما هي.'] : [], apply: () => st.update('settings.numbering', (l) => { const x = l.find((y) => y.type === e0.type); if (x) Object.assign(x, { prefix: work.prefix, includeYear: work.includeYear, yearlyReset: work.yearlyReset, pad: work.pad }); }) });
      if (ok) { d.close(); SA.toast('تم حفظ الترقيم', 'success'); }
    }
    prefix.focus();
  }

  function numberingRender(root, ctx) {
    ctx.setCrumbs([{ label: 'السياسات' }, { label: 'الترقيم' }]);
    return mount(root, (host, retry) => {
      host.append(SA.pageHead({ title: 'ترقيم المستندات', desc: 'الشكل في الديمو PREFIX-YYYY-NNNN. البادئات الحالية غير نهائية قبل اعتماد المالية والتشغيل، ولا يتكرر رقم أبدًا. بادئات HR مقترحة (Pending).', tags: [SA.tag('pending', 'Pending بنود 14 و47'), SA.tag('new', 'قفل بعد أول مستند')], actions: [SA.btn({ label: 'قوالب المستندات', icon: 'doc', kind: 'ghost', perm: 'sa.policies.numbering.view', onClick: () => SA.nav('policies/templates') })] }));
      const table = SA.table({ rowId: 'type', pageSize: 10, caption: 'جدول الترقيم', rows: numbering, search: { placeholder: 'ابحث بالنوع أو البادئة…', keys: ['type', 'labelAr', 'prefix'] },
        filters: [{ key: 'grp', label: 'المجموعة', options: [['ops', 'مالية وتشغيل'], ['hr', 'الموارد البشرية']], test: (r, v) => grpOf(r) === v }, { key: 'locked', label: 'القفل', options: [['1', 'مقفول'], ['0', 'قابل للتعديل']], test: (r, v) => (v === '1') === !!(r.locked || r.issued > 0) }],
        columns: [{ key: 'labelAr', label: 'المستند', sort: true, render: (e) => h('div', {}, h('b', {}, e.labelAr), h('div.t-caption', {}, tag(e))) }, { key: 'prefix', label: 'البادئة', sort: true, render: (e) => h('code', {}, e.prefix + '-') }, { key: 'next', label: 'الرقم التالي', value: (e) => SA.numbering.preview(e.type), render: (e) => h('span.num', { dir: 'ltr' }, SA.numbering.preview(e.type)) }, { key: 'issued', label: 'الصادر', sort: true, render: (e) => h('span.num', {}, SA.fmt.num(e.issued)) },
          { key: 'locked', label: 'الشكل', render: (e) => (e.locked || e.issued > 0 ? h('span', {}, SA.chip('مقفول', 'warning')) : SA.chip('قابل للتعديل', 'success')) }],
        rowActions: (e) => [{ label: 'تعديل', icon: 'edit', onClick: () => openNumberEditor(e), disabled: SA.can('sa.policies.numbering.edit') ? false : NOPERM }], onRowClick: (e) => openNumberEditor(e), onRetry: retry });
      host.append(h('div.card.card-flush.sap-listcard', {}, table.el), SA.alert('info', 'ملف PDF العادي ', h('b', {}, 'ليس'), ' فاتورة إلكترونية معتمدة ولا يُوصف كذلك (US-NUM-02).'));
      const off = st.subscribe('settings.numbering', () => table.refresh()); return () => off();
    }, { skel: 'table' });
  }
  SA.register({ id: 'pol-numbering', group: 'policies', title: 'الترقيم', icon: 'list', route: 'policies/numbering', perm: 'sa.policies.numbering.view', order: 20, desc: 'بادئات وأشكال ترقيم المستندات', render: numberingRender });

  /* — templates — */
  const tmpl = (type) => Object.assign({ lang: 'ar', seal: false, signature: false }, (st.get('settings.docTemplates') || {})[type] || {});
  function openTemplateEditor(e) {
    if (!SA.can('sa.policies.numbering.edit')) return SA.toast(NOPERM + ' (sa.policies.numbering.edit)', 'warn');
    const co = st.get('settings.company') || {}; const t0 = tmpl(e.type); const work = clone(t0);
    const lang = SA.form.field({ name: 'lang', label: 'لغة المستند', type: 'radio', value: work.lang, options: [['ar', 'عربي', 'الافتراضي الموصى به'], ['bi', 'ثنائي اللغة', 'عربي + English']], onChange: (v) => { work.lang = v; upd(); } });
    const seal = SA.form.field({ name: 'seal', type: 'switch', label: 'إظهار الختم', hint: co.sealUploaded ? '' : 'الختم لم يُرفع بعد — ارفعه من «الشركة والمصنع».', value: work.seal && !!co.sealUploaded, disabled: !co.sealUploaded, onChange: (v) => { work.seal = v; upd(); } });
    const sig = SA.form.field({ name: 'signature', type: 'switch', label: 'إظهار التوقيع', hint: co.signatureUploaded ? '' : 'التوقيع لم يُرفع بعد.', value: work.signature && !!co.signatureUploaded, disabled: !co.signatureUploaded, onChange: (v) => { work.signature = v; upd(); } });
    const a4 = h('div.sap-pol-a4', { 'aria-label': 'معاينة A4' });
    function upd() { SA.clear(a4); a4.append(h('span.wm', {}, 'معاينة'), h('b', {}, (co.nameAr || '—')), work.lang === 'bi' ? h('div.t-caption', { dir: 'ltr' }, co.nameEn || 'Company name (placeholder)') : null, h('div.t-caption', {}, e.labelAr + ' · ' + fmtNo(e, e.last + 1)), h('div.ln'), h('div.ln.s'), h('div.ln'), h('div.ln.s'), h('div.slots', {}, h('div.slot' + (work.signature && co.signatureUploaded ? '.on' : ''), {}, work.signature && co.signatureUploaded ? 'التوقيع' : '—'), h('div.slot' + (work.seal && co.sealUploaded ? '.on' : ''), {}, work.seal && co.sealUploaded ? 'الختم' : '—'))); }
    upd();
    const d = SA.drawer({ title: 'قالب «' + e.labelAr + '»', subtitle: 'SCR-NUM-03 · ' + e.type, size: 'md', body: h('div.sap-confirm', {}, e.source && /HR/.test(e.source) ? SA.alert('info', 'بادئة HR مقترحة (Pending) — القالب إعداد مسبق.') : null, lang.el, seal.el, sig.el, h('div', {}, h('div.t-caption', {}, 'معاينة A4'), a4), SA.alert('info', 'ملف PDF العادي ليس فاتورة إلكترونية معتمدة.')),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, 'مراجعة وحفظ')] });
    async function save() {
      const ok = await commit({ title: 'مراجعة قالب «' + e.labelAr + '»', code: 'SETTINGS.CHANGED', target: { type: 'template', id: e.type, label: 'قالب ' + e.labelAr }, before: t0, after: work, apply: () => st.update('settings', (s) => { s.docTemplates = s.docTemplates || {}; s.docTemplates[e.type] = work; }) });
      if (ok) { d.close(); SA.toast('تم حفظ القالب', 'success'); }
    }
  }
  function templatesRender(root, ctx) {
    ctx.setCrumbs([{ label: 'السياسات' }, { label: 'قوالب المستندات' }]);
    return mount(root, (host, retry) => {
      host.append(SA.pageHead({ title: 'قوالب المستندات', desc: 'لكل نوع مستند: اللغة وإظهار الختم والتوقيع مع معاينة A4. لا ختم أو توقيع تجريبي على مستند قابل للاستخدام.', tags: [SA.tag('pending', 'Pending بند 13')], actions: [SA.btn({ label: 'جدول الترقيم', icon: 'list', kind: 'ghost', onClick: () => SA.nav('policies/numbering') })] }));
      const co = () => st.get('settings.company') || {};
      host.append(!co().sealUploaded || !co().signatureUploaded ? SA.alert('warning', 'الختم/التوقيع غير مرفوعين — خيارات الإظهار معطّلة. ', h('a', { href: SA.href('company') + '?tab=seal' }, 'ارفعهما من بيانات الشركة'), '.') : null);
      const table = SA.table({ rowId: 'type', pageSize: 10, caption: 'قوالب المستندات', rows: numbering, search: { placeholder: 'ابحث…', keys: ['type', 'labelAr'] }, filters: [{ key: 'grp', label: 'المجموعة', options: [['ops', 'مالية وتشغيل'], ['hr', 'الموارد البشرية']], test: (r, v) => grpOf(r) === v }],
        columns: [{ key: 'labelAr', label: 'المستند', sort: true, render: (e) => h('div', {}, h('b', {}, e.labelAr), h('div.t-caption', {}, tag(e))) }, { key: 'prefix', label: 'البادئة', render: (e) => h('code', {}, e.prefix + '-') }, { key: 'lang', label: 'اللغة', render: (e) => SA.chip(tmpl(e.type).lang === 'bi' ? 'ثنائي اللغة' : 'عربي', 'info') }, { key: 'seal', label: 'الختم', render: (e) => (tmpl(e.type).seal ? SA.chip('يظهر', 'success') : h('span.t-muted', {}, 'لا')) }, { key: 'sig', label: 'التوقيع', render: (e) => (tmpl(e.type).signature ? SA.chip('يظهر', 'success') : h('span.t-muted', {}, 'لا')) }],
        rowActions: (e) => [{ label: 'تعديل القالب', icon: 'edit', onClick: () => openTemplateEditor(e) }], onRowClick: (e) => openTemplateEditor(e), onRetry: retry });
      host.append(h('div.card.card-flush.sap-listcard', {}, table.el));
      const offs = ['settings.docTemplates', 'settings.company', 'settings.numbering'].map((p) => st.subscribe(p, () => table.refresh())); return () => offs.forEach((f) => f());
    }, { skel: 'table' });
  }
  SA.register({ id: 'pol-templates', group: 'policies', title: 'قوالب المستندات', icon: 'doc', route: 'policies/templates', perm: 'sa.policies.numbering.view', order: 25, desc: 'لغة وختم وتوقيع كل قالب', render: templatesRender });

  /* ═══════════════════════ SA-14 · إعدادات المالية ═══════════════════════ */
  const fin = () => st.get('settings.finance') || {};
  const none = (t) => SA.openValue(t || 'غير مُعدّ');
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  /** generic finance editor: fields → modal → review → commit */
  function editFin(o) {
    if (!SA.can('sa.policies.finance.edit')) return SA.toast(NOPERM + ' (sa.policies.finance.edit)', 'warn');
    const flds = o.fields(); const m = SA.modal({ title: o.title, subtitle: o.sub, icon: 'coins', size: o.size || 'sm', body: h('div.sap-confirm', {}, o.note ? SA.alert('info', o.note) : null, flds.map((f) => f.el)), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!SA.form.group(flds).validate()) return; const v = SA.form.group(flds).get(); const { before, after, apply } = o.build(v); m.close(); const ok = await commit({ title: o.title, code: 'POLICY.FINANCE_CHANGED', target: { type: 'finance', id: o.id, label: o.title }, before, after, apply, impact: ['تغيير الضريبة/السياسة لا يعدّل فواتير صادرة (US-FIN-01).'] }); if (ok) SA.toast('تم الحفظ', 'success'); } }, 'مراجعة وحفظ')] });
    if (flds[0]) flds[0].focus();
  }
  function financeRender(root, ctx) {
    ctx.setCrumbs([{ label: 'السياسات' }, { label: 'المالية' }]);
    return mount(root, (host) => {
      host.append(SA.pageHead({ title: 'إعدادات المالية', desc: 'كل القيم «غير مُعدّ» حتى تصلنا من المحاسب القانوني والمالية. لا ضريبة ولا حساب بنكي مكتوب. تُعرض هنا وتُنفَّذ بصلاحية المالية (قرار 5 Pending).', tags: [SA.tag('pending', 'Pending بنود 38–42'), SA.tag('open', 'القيم Open')] }));
      const body = h('div.sap-pol-fin'); host.append(body);
      const editBtn = (fn) => SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'sa.policies.finance.edit', onClick: fn });
      function draw() {
        SA.clear(body); const f = fin(); const pm = f.paymentMethods || {}; const banks = f.banks || [];
        body.append(
          SA.card({ title: 'الضريبة', actions: [editBtn(editTax)] }, SA.kv([['النسبة', f.taxRate == null ? none('نسبة غير مُعدّة — المحاسب القانوني') : h('b.num', {}, f.taxRate + '%')], ['شاملة / غير شاملة', f.taxInclusive == null ? none('غير محدد') : f.taxInclusive ? 'الأسعار شاملة الضريبة' : 'الأسعار غير شاملة'], ['إعفاءات أصناف', (f.taxExemptions || []).length ? (f.taxExemptions || []).join('، ') : h('span.t-muted', {}, 'لا توجد')]]), h('p.t-caption', {}, '14% في الديمو قيمة تجريبية وليست إعدادًا. تغيير الضريبة لا يعدّل فواتير صادرة.')),
          SA.card({ title: 'طرق الدفع والشيكات', actions: [editBtn(editPay)] }, h('ul.sap-pol-list', {}, [['cash', 'نقدًا'], ['transfer', 'تحويل'], ['cheque', 'شيك'], ['card', 'بطاقة']].map((k) => h('li', {}, h('span', {}, k[1]), SA.chip(pm[k[0]] ? 'مفعّلة' : 'غير مفعّلة', pm[k[0]] ? 'success' : 'neutral')))), h('div', { style: { marginBlockStart: '10px' } }, h('div.t-caption', {}, 'حالات الشيك'), h('div.cluster', {}, ['مستلم', 'تحت التحصيل', 'محصَّل', 'مرتد', 'ملغى'].map((s) => SA.chip(s, 'info'))))),
          SA.card({ title: 'البنوك والخزائن', actions: [SA.btn({ label: 'إضافة', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'sa.policies.finance.edit', onClick: () => editBank(null) })] }, banks.length ? h('ul.sap-pol-list', {}, banks.map((b) => h('li', {}, h('span', {}, h('b', {}, b.name), ' ', h('span.t-caption', {}, b.kind === 'treasury' ? 'خزينة' : 'بنك'), b.last4 ? h('span.t-caption.num', { dir: 'ltr' }, ' ••••' + b.last4) : null), h('span.cluster', {}, SA.chip(b.active ? 'نشط' : 'معطّل', b.active ? 'success' : 'neutral'), SA.btn({ label: 'تعديل', kind: 'ghost', size: 'sm', perm: 'sa.policies.finance.edit', onClick: () => editBank(b) }))))) : SA.empty({ icon: 'coins', title: 'لا توجد حسابات بنكية أو خزائن', text: 'غير مُعدّ — لا حساب مكتوب قبل اعتماد المالية.' }), h('p.t-caption', {}, 'صلاحيات إنشاء/اعتماد/تنفيذ السند منفصلة (SA-03). لا يُخزَّن رقم حساب كامل — آخر 4 أرقام فقط.')),
          SA.card({ title: 'السنة المالية والحسابات', actions: [editBtn(editFiscal)] }, SA.kv([['بداية السنة المالية', f.fiscalYearStart ? f.fiscalYearStart.day + ' ' + MONTHS[f.fiscalYearStart.month - 1] : none()], ['شجرة الحسابات', h('span.t-muted', {}, 'بدون ربط بدفتر خارجي (بند 40)')], ['تصنيفات المصروفات', (f.expenseCategories || []).length ? h('div.cluster', {}, f.expenseCategories.map((c) => SA.chip(c, 'info'))) : none('لا توجد تصنيفات')]])),
          SA.card({ title: 'سياسة التأخير', actions: [editBtn(editOverdue)] }, SA.kv([['مدة التأخير (أيام)', f.overdueDays == null ? none() : h('b.num', {}, f.overdueDays)], ['الإجراء', f.overdueAction ? ({ alert: 'تنبيه فقط', review: 'تحويل الحالة لمراجعة المبيعات/المالية' }[f.overdueAction]) : none('غير مُحدّد')]]), h('p.t-caption', {}, 'تنبيه ثم مراجعة — ', h('b', {}, 'بدون إيقاف تلقائي'), ' بمدة افتراضية (بند 41).')),
          h('section.card.sap-card', {}, h('div.card-head', {}, h('h2.sap-card-title', {}, 'الفاتورة الإلكترونية ', SA.tag('open'))), h('div.sap-card-body', {}, h('div.sap-pol-hold', {}, SA.icon('lock'), h('div', {}, h('b', {}, 'Open — التنفيذ مؤجل'), h('p.t-muted', {}, 'لا يوجد تكامل مع مصلحة الضرائب، ولا ادعاء بذلك قبل الاختبار والاعتماد (بنود 12 و43). ملف PDF العادي ليس فاتورة إلكترونية معتمدة.'), SA.btn({ label: 'حالة التكاملات', icon: 'link', kind: 'ghost', size: 'sm', perm: 'sa.settings.view', onClick: () => SA.nav('integrations') }))))));
      }
      const numF = (name, label, val, o) => SA.form.field(Object.assign({ name, label, type: 'number', value: val, min: 0 }, o || {}));
      function editTax() { const f = fin(); editFin({ id: 'tax', title: 'الضريبة', sub: 'SCR-FIN-01', note: 'القيمة Open — المحاسب القانوني. اتركها فاضية لو لم تُحسم.', fields: () => [numF('rate', 'نسبة الضريبة (%)', f.taxRate, { max: 100, hint: 'فاضية = غير مُعدّة' }), SA.form.field({ name: 'incl', label: 'شاملة / غير شاملة', type: 'select', value: f.taxInclusive == null ? '' : f.taxInclusive ? 'in' : 'ex', options: [['', 'غير محدد'], ['in', 'الأسعار شاملة الضريبة'], ['ex', 'الأسعار غير شاملة']] }), SA.form.field({ name: 'ex', label: 'إعفاءات أصناف (سطر لكل صنف)', type: 'textarea', value: (f.taxExemptions || []).join('\n') })],
        build: (v) => { const a = { taxRate: v.rate, taxInclusive: v.incl === '' ? null : v.incl === 'in', taxExemptions: v.ex.split('\n').map((x) => x.trim()).filter(Boolean) }; return { before: { taxRate: f.taxRate, taxInclusive: f.taxInclusive, taxExemptions: f.taxExemptions || [] }, after: a, apply: () => st.update('settings.finance', (x) => Object.assign(x, a)) }; } }); }
      function editPay() { const pm = clone(fin().paymentMethods || {}); editFin({ id: 'payment-methods', title: 'طرق الدفع', sub: 'SCR-FIN-02', fields: () => [['cash', 'نقدًا'], ['transfer', 'تحويل'], ['cheque', 'شيك'], ['card', 'بطاقة']].map((k) => SA.form.field({ name: k[0], type: 'switch', label: k[1], value: !!pm[k[0]] })), build: (v) => ({ before: pm, after: v, apply: () => st.update('settings.finance', (x) => { x.paymentMethods = v; }) }) }); }
      function editFiscal() { const f = fin(); const fy = f.fiscalYearStart || {}; editFin({ id: 'fiscal', title: 'السنة المالية والحسابات', sub: 'SCR-FIN-04', note: 'بدون افتراض ربط بدفتر خارجي (بند 40).', fields: () => [SA.form.field({ name: 'month', label: 'شهر بداية السنة المالية', type: 'select', value: fy.month ? String(fy.month) : '', options: [['', 'غير مُعدّ']].concat(MONTHS.map((m, i) => [String(i + 1), m])) }), numF('day', 'اليوم', fy.day || null, { min: 1, max: 31 }), SA.form.field({ name: 'cats', label: 'تصنيفات المصروفات (سطر لكل تصنيف)', type: 'textarea', value: (f.expenseCategories || []).join('\n') })],
        build: (v) => { const a = { fiscalYearStart: v.month ? { month: +v.month, day: v.day || 1 } : null, expenseCategories: v.cats.split('\n').map((x) => x.trim()).filter(Boolean) }; return { before: { fiscalYearStart: f.fiscalYearStart || null, expenseCategories: f.expenseCategories || [] }, after: a, apply: () => st.update('settings.finance', (x) => Object.assign(x, a)) }; } }); }
      function editOverdue() { const f = fin(); editFin({ id: 'overdue', title: 'سياسة التأخير', sub: 'SCR-FIN-05', note: 'المدة Open (بند 41) — لا إيقاف تلقائي بمدة افتراضية.', fields: () => [numF('days', 'مدة التأخير (أيام)', f.overdueDays, { min: 1, hint: 'فاضية = غير مُعدّة' }), SA.form.field({ name: 'act', label: 'الإجراء', type: 'select', value: f.overdueAction || '', options: [['', 'غير مُحدّد'], ['alert', 'تنبيه فقط'], ['review', 'تنبيه ثم تحويل الحالة لمراجعة المبيعات/المالية']] })],
        build: (v) => { const a = { overdueDays: v.days, overdueAction: v.act || null }; return { before: { overdueDays: f.overdueDays, overdueAction: f.overdueAction }, after: a, apply: () => st.update('settings.finance', (x) => Object.assign(x, a)) }; } }); }
      function editBank(b) { const b0 = b || { id: null, name: '', kind: 'bank', last4: '', active: true }; editFin({ id: 'banks', title: b ? 'تعديل «' + b.name + '»' : 'بنك/خزينة جديد', sub: 'SCR-FIN-03', fields: () => [SA.form.field({ name: 'name', label: 'الاسم', value: b0.name, required: true }), SA.form.field({ name: 'kind', label: 'النوع', type: 'select', value: b0.kind, options: [['bank', 'حساب بنكي'], ['treasury', 'خزينة']] }), SA.form.field({ name: 'last4', label: 'آخر 4 أرقام من الحساب (اختياري)', value: b0.last4, rules: [(v) => (v && !/^\d{4}$/.test(v) ? '4 أرقام بالضبط' : null)], hint: 'لا يُخزَّن رقم الحساب كاملًا.' }), SA.form.field({ name: 'active', type: 'switch', label: 'نشط', value: b0.active })],
        build: (v) => { const list = clone(fin().banks || []); const id = b0.id || 'BK-' + (list.reduce((m, x) => Math.max(m, +String(x.id).replace(/\D/g, '') || 0), 0) + 1); const rec = { id, name: v.name.trim(), kind: v.kind, last4: v.last4, active: v.active }; const i = list.findIndex((x) => x.id === id); const next = list.slice(); if (i >= 0) next[i] = rec; else next.push(rec); return { before: { banks: (fin().banks || []).map((x) => x.name + (x.active ? '' : ' (معطّل)')) }, after: { banks: next.map((x) => x.name + (x.active ? '' : ' (معطّل)')), changed: rec.name }, apply: () => st.update('settings.finance', (x) => { x.banks = next; }) }; } }); }
      draw(); const off = st.subscribe('settings.finance', draw); return () => off();
    });
  }
  SA.register({ id: 'pol-finance', group: 'policies', title: 'المالية', icon: 'coins', route: 'policies/finance', perm: 'sa.policies.finance.view', order: 30, desc: 'الضريبة وطرق الدفع والبنوك والسنة المالية والتأخير', render: financeRender });

  /* ═══════════════════════ SA-15 · سياسة الأمان ═══════════════════════ */
  const LOCKED_SU = ['policy.change', 'recovery.generate', 'superadmin.backup', 'user.superadmin'];
  const sec = () => st.get('settings.security') || {};
  function securityRender(root, ctx) {
    ctx.setCrumbs([{ label: 'السياسات' }, { label: 'الأمان' }]);
    return mount(root, (host) => {
      host.append(SA.pageHead({ title: 'سياسة الأمان', desc: 'مدة الخمول وحد القفل وعمليات Step-up تُطبَّق فورًا على الدخول والجلسات في هذا النموذج. القيم المقترحة مُعلَّمة تجريبية والباقي Open.', tags: [SA.tag('pending', 'Pending بنود 15 و35'), SA.tag('open', 'القيم Open')] }));
      const canEdit = SA.can('sa.policies.security.edit'); const s0 = clone(sec());
      const F = (o) => SA.form.field(Object.assign({ disabled: !canEdit, onInput: dirty, onChange: dirty }, o));
      const idle = F({ name: 'idleMinutes', label: 'مدة الخمول حتى قفل الجلسة (دقيقة)', type: 'number', min: 1, max: 480, value: s0.idleMinutes, required: true, hint: '30 دقيقة قيمة مقترحة (بند 15) قابلة للتعديل.' });
      const lock = F({ name: 'lockoutThreshold', label: 'حد المحاولات الفاشلة قبل القفل', type: 'number', min: 1, max: 20, value: s0.lockoutThreshold, required: true, hint: 'قيمة تجريبية — القرار Open.' });
      const lockMin = F({ name: 'lockoutMinutes', label: 'مدة القفل (دقيقة) [Open]', type: 'number', min: 1, value: s0.lockoutMinutes, hint: 'فاضية = القفل يستمر حتى فكّه يدويًا. (التطبيق بالمدة في الإنتاج؛ النموذج يفك يدويًا فقط.)' });
      const suMin = F({ name: 'stepUpValidMinutes', label: 'صلاحية التحقق بعد Step-up (دقيقة) [Open]', type: 'number', min: 1, value: s0.stepUpValidMinutes, hint: 'فاضية = كل عملية حساسة تطلب تحقق جديد.' });
      const pwLen = F({ name: 'passwordMinLength', label: 'أقل طول لكلمة المرور [Open: IT]', type: 'number', min: 6, max: 64, value: s0.passwordMinLength });
      const pwCx = F({ name: 'passwordComplexity', label: 'تعقيد كلمة المرور [Open: IT]', type: 'select', value: s0.passwordComplexity || '', options: [['', 'غير مُعدّ'], ['basic', 'حروف وأرقام'], ['strong', 'حروف كبيرة وصغيرة وأرقام ورموز']] });
      const pwExp = F({ name: 'passwordExpiryDays', label: 'انتهاء كلمة المرور (يوم) [Open: IT]', type: 'number', min: 1, value: s0.passwordExpiryDays });
      const reset = F({ name: 'resetLinkMinutes', label: 'صلاحية رابط إعادة التعيين (دقيقة) [Open]', type: 'number', min: 1, value: s0.resetLinkMinutes });
      const mfaFor = F({ name: 'mfaRequiredFor', label: 'نطاق إلزام MFA', type: 'select', value: s0.mfaRequiredFor || 'superadmin', options: [['superadmin', 'Super Admin (الأساسي والاحتياطي) — الحد الأدنى'], ['admins', 'كل أدوار الإدارة'], ['all', 'كل المستخدمين']], hint: 'لا يمكن إلغاء MFA لحسابات Super Admin (US-SEC-01).' });
      const mfaM = F({ name: 'mfaMethod', label: 'طريقة MFA [Open]', type: 'select', value: s0.mfaMethod || '', options: [['', 'غير مُحدّدة'], ['totp', 'تطبيق مصادقة (TOTP)'], ['sms', 'رسالة نصية'], ['email', 'بريد إلكتروني']] });
      const fields = [idle, lock, lockMin, suMin, pwLen, pwCx, pwExp, reset, mfaFor, mfaM];
      const su = new Set(s0.stepUpActions || []); const suHost = h('div.sap-pol-su');
      function drawSu() { SA.clear(suHost); SA.catalog.stepUp.forEach((a) => { const lockd = LOCKED_SU.indexOf(a[0]) >= 0; const i = h('input', { type: 'checkbox', checked: su.has(a[0]), disabled: lockd || !canEdit }); i.addEventListener('change', () => { if (i.checked) su.add(a[0]); else su.delete(a[0]); dirty(); }); suHost.append(h('label' + (lockd ? '.is-locked' : ''), { title: lockd ? 'لا يمكن إيقافه — حماية حسابات Super Admin والسياسات' : null }, h('span', {}, h('b', {}, a[1]), h('small', {}, a[0], lockd ? ' · إلزامي' : '')), h('span.switch', {}, i, h('span')))); }); }
      drawSu();
      const liveBox = h('div.sap-pol-live', { 'aria-live': 'polite' });
      function drawLive() { SA.clear(liveBox); const s = sec(); liveBox.append(SA.icon('clock'), h('span', {}, 'الأثر الحالي المطبّق: قفل بعد ', h('b.num', {}, s.idleMinutes || '—'), ' دقيقة خمول، وقفل الحساب بعد ', h('b.num', {}, s.lockoutThreshold || '—'), ' محاولات فاشلة، وطلب Step-up لـ', h('b.num', {}, (s.stepUpActions || []).length), ' عملية.', s.idleDemo ? SA.demoValue('الخمول تجريبي') : null, s.lockoutDemo ? SA.demoValue('الحد تجريبي') : null), SA.btn({ label: 'جرّب قفل الجلسة الآن', icon: 'lock', kind: 'ghost', size: 'sm', onClick: () => { SA.toast('سيُقفل المتصفح كما لو انتهت مدة الخمول.', 'info'); setTimeout(() => SA.auth.lock('معاينة سياسة الخمول (من سياسة الأمان)'), 500); } })); }
      drawLive();
      const ipSw = h('label.sap-switch-line', {}, h('span', {}, h('b', {}, 'قيود IP / ساعات الدخول'), h('small', {}, 'P2 اختياري [New] — غير متاح الآن.')), h('span.switch', {}, h('input', { type: 'checkbox', disabled: true }), h('span')));
      host.append(h('div.sap-pol-sec', {},
        SA.card({ title: 'الجلسة وقفل الحساب', actions: [SA.chip('يُطبَّق فورًا', 'success')] }, h('div.sap-formgrid', {}, idle.el, lock.el, lockMin.el, suMin.el), liveBox),
        SA.card({ title: 'عمليات تتطلب Step-up', actions: [h('span.t-caption', {}, 'قائمة قابلة للتعديل — تُطبَّق على كل شاشة فورًا')] }, suHost, h('p.t-caption', {}, 'العمليات الإلزامية محمية حتى لا يُغلَق الباب على نفسك أو تُفتح حسابات Super Admin بلا تحقق.')),
        SA.card({ title: 'MFA وكلمة المرور' }, h('div.sap-formgrid', {}, mfaFor.el, mfaM.el, pwLen.el, pwCx.el, pwExp.el, reset.el), ipSw),
        canEdit ? null : SA.alert('info', 'عرض فقط — ليس لديك ', h('code', {}, 'sa.policies.security.edit'), '.')));
      const bar = saveBar('sap-pol-dirty', save, reset0, 'مراجعة وحفظ'); if (canEdit) host.append(bar);
      function collect() { const v = {}; fields.forEach((f) => { const x = f.get(); v[f.name] = f.name === 'passwordComplexity' || f.name === 'mfaMethod' ? (x || null) : x === '' ? null : x; }); v.stepUpActions = SA.catalog.stepUp.map((a) => a[0]).filter((k) => su.has(k)); v.ipRestrictions = false; return v; }
      function diffNow() { const v = collect(); const keys = Object.keys(v); const b = {}, a = {}; keys.forEach((k) => { const bv = s0[k] === undefined ? null : s0[k]; if (JSON.stringify(bv) !== JSON.stringify(v[k])) { b[k] = bv; a[k] = v[k]; } }); return { b, a, n: Object.keys(a).length }; }
      function dirty() { const el = document.getElementById('sap-pol-dirty'); if (el) { const n = diffNow().n; el.textContent = n ? 'لديك ' + n + ' تغيير غير محفوظ' : 'لا توجد تغييرات غير محفوظة'; } }
      function reset0() { location.reload(); }
      async function save() {
        if (!SA.form.group([idle, lock]).validate()) return SA.toast('راجع الحقول المطلوبة.', 'error');
        const d = diffNow(); if (!d.n) return SA.toast('لا توجد تغييرات.', 'info');
        const warns = []; if (d.a.idleMinutes != null && d.a.idleMinutes > 60) warns.push('مدة خمول طويلة تقلل الحماية على الأجهزة المشتركة.'); if (d.a.stepUpActions && d.b.stepUpActions && d.a.stepUpActions.length < d.b.stepUpActions.length) warns.push('تقليل عمليات Step-up يخفض مستوى التحقق على عمليات حساسة.');
        const markDemo = {}; if (d.a.idleMinutes !== undefined) markDemo.idleDemo = false; if (d.a.lockoutThreshold !== undefined) markDemo.lockoutDemo = false;
        const r = await SA.confirm({ title: 'مراجعة سياسة الأمان', icon: 'lock', confirmLabel: 'متابعة للتحقق', extra: h('div', {}, SA.diffTable(d.b, d.a)), warnings: warns, impact: ['التغييرات تسري فورًا على الدخول والجلسات الحالية.'], note: 'هيتسجّل POLICY.SECURITY_CHANGED بقيمة قبل/بعد.' });
        if (!r.ok) return; if (!(await SA.stepUp('policy.change'))) return;
        try { await SA.api(() => { const v = collect(); st.update('settings.security', (x) => { Object.keys(v).forEach((k) => { x[k] = v[k]; }); Object.assign(x, markDemo); }); SA.audit('POLICY.SECURITY_CHANGED', { target: { type: 'security', id: 'security', label: 'سياسة الأمان' }, before: d.b, after: d.a }); }); } catch (e) { return SA.fail(e); }
        SA.notify({ title: 'تغيير في سياسة الأمان', body: Object.keys(d.a).join('، '), level: 'info', to: ['R-01', 'R-10'], link: '#/policies/security' });
        SA.toast('تم حفظ سياسة الأمان — سارية فورًا', 'success'); Object.assign(s0, clone(sec())); drawLive(); dirty();
      }
      const off = st.subscribe('settings.security', drawLive); return () => off();
    });
  }
  SA.register({ id: 'pol-security', group: 'policies', title: 'الأمان', icon: 'shield', route: 'policies/security', perm: 'sa.policies.security.view', order: 40, desc: 'مدة الخمول وحد القفل وقائمة Step-up وMFA', render: securityRender });

  /* ───────────────────────── Test Lab missions ───────────────────────── */
  SA.missions.add({ id: 'M-C5', area: 'policies', title: 'فعّل قاعدة اعتماد ثم اختبرها بالمحاكي', persona: 'owner', route: 'policies/approvals', est: '4 د', goal: 'جرّب تفعيل قاعدة بعتبة فاضية (ممنوع)، حدّد عتبة وسلسلة واحفظ بـStep-up، ثم شغّل المحاكي لترى لمن يروح الطلب.',
    steps: [{ text: 'جرّب تفعيل قاعدة الخصم بدون عتبة', route: 'pol-approvals' }, { text: 'حدّد العتبة والسلسلة واحفظ', audit: 'POLICY.APPROVAL_CHANGED' }, { text: 'شغّل المحاكي', event: 'approval.simulated' }], detect: [{ audit: 'POLICY.APPROVAL_CHANGED' }, { event: 'approval.simulated' }] });
  SA.missions.add({ id: 'M-C6', area: 'policies', title: 'ولّد رقمًا تجريبيًا وشوف الشكل يتقفل', persona: 'owner', route: 'policies/numbering', est: '3 د', goal: 'افتح نوعًا لم يصدر منه مستند (مثل QT)، ولّد رقمًا تجريبيًا، ثم افتحه تاني: الشكل مقفول.',
    steps: [{ text: 'افتح «عرض سعر» وولّد رقمًا تجريبيًا', route: 'pol-numbering' }, { text: 'افتحه مرة أخرى وراجع قفل الشكل' }], detect: [{ route: 'pol-numbering' }] });
  SA.missions.add({ id: 'M-C7', area: 'policies', title: 'شدّد سياسة الخمول والقفل وراقب الأثر الحيّ', persona: 'it', route: 'policies/security', est: '4 د', goal: 'كـIT غيّر مدة الخمول وحد القفل وقائمة Step-up، ثم افتح «جرّب قفل الجلسة الآن»، وجرّب الدخول بكلمة غلط للتأكد من الحد الجديد.',
    steps: [{ text: 'عدّل المدة وحد القفل واحفظ', audit: 'POLICY.SECURITY_CHANGED' }, { text: 'جرّب القفل الفوري', event: 'idle.locked' }], detect: [{ audit: 'POLICY.SECURITY_CHANGED' }, { event: 'idle.locked' }] });
  SA.missions.add({ id: 'M-C8', area: 'policies', title: 'اضبط الضريبة من «غير مُعدّ»', persona: 'acct', route: 'policies/finance', est: '3 د', goal: 'كمحاسب افتح إعدادات المالية، لاحظ كل القيم «غير مُعدّ»، ثم ضع قيمة تجريبية للضريبة واحفظ بـStep-up.',
    steps: [{ text: 'عدّل الضريبة', audit: 'POLICY.FINANCE_CHANGED' }], detect: [{ audit: 'POLICY.FINANCE_CHANGED' }] });
})();
