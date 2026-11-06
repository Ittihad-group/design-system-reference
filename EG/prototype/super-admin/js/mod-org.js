/* EG Super Admin prototype — mod-org.js  (agent C · SA-07..SA-11 المنظمة)
   Routes: #/company (?tab=seal) · #/departments · #/modules · #/warehouses · #/currency
   SA-07 بيانات الشركة (Placeholder + جاهزية + ختم/توقيع + Step-up للرسمي) · SA-08 الأقسام (لا تعطيل بمستخدمين نشطين، تغيير المدير يحدّث نطاق الفريق)
   SA-09 الموديولات (حوار أثر + سبب + Step-up؛ موديول HR يخفي مساحة HR فعليًا عبر SA.appEnabled) · SA-10 المخازن (لا تعطيل برصيد) · SA-11 العملة والوحدات (EGP فقط، التحويل معطّل). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const NOPERM = 'ليست من صلاحياتك';
  const MOD = 'org';

  function css(text) {
    if (document.querySelector('style[data-mod="' + MOD + '"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', MOD); s.textContent = text; document.head.appendChild(s);
  }
  css(`
.sap-org-ready{display:flex;gap:14px;align-items:center;padding:14px 18px;border-radius:14px;border:1px solid;margin-block-end:16px;flex-wrap:wrap}
.sap-org-ready.is-bad{background:var(--color-warning-tint,#fff6e0);border-color:color-mix(in srgb,var(--color-warning,#b7791f) 35%,transparent)}
.sap-org-ready.is-ok{background:var(--color-success-tint);border-color:color-mix(in srgb,var(--color-success) 30%,transparent)}
.sap-org-ready-main{flex:1;min-width:220px}.sap-org-ready-main b{display:block;font-size:1rem}.sap-org-ready-main span{font-size:var(--text-caption);color:var(--color-text-muted)}
.sap-org-meter{display:flex;gap:4px;margin-block-start:8px}.sap-org-meter i{flex:1;height:6px;border-radius:3px;background:var(--color-border)}.sap-org-meter i.on{background:var(--color-success)}
.sap-org-fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:4px 28px}
.sap-org-f{padding:12px 0;border-block-end:1px solid var(--color-border)}.sap-org-f dt{font-size:var(--text-caption);color:var(--color-text-muted);margin-block-end:4px}.sap-org-f dd{margin:0;font-weight:600;min-height:24px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sap-org-ph{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--color-warning,#8a5a00);background:var(--color-warning-tint,#fff3d6);border:1px dashed currentColor;border-radius:999px;padding:2px 10px}
.sap-org-note{font-size:var(--text-caption);color:var(--color-text-muted);font-weight:400}
.sap-org-savebar{position:sticky;inset-block-end:0;z-index:5;display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--color-border-strong);border-radius:14px;padding:12px 16px;margin-block-start:16px;box-shadow:0 -6px 20px rgba(2,32,79,.08);flex-wrap:wrap}
.sap-org-drop{border:2px dashed var(--color-border-strong);border-radius:14px;padding:22px;text-align:center;background:var(--color-bg-alt);cursor:pointer;display:grid;gap:8px;justify-items:center;min-height:170px;align-content:center;transition:border-color .15s,background .15s}
.sap-org-drop:hover,.sap-org-drop:focus-visible,.sap-org-drop.is-over{border-color:var(--eg-navy);background:var(--color-primary-tint);outline:none}
.sap-org-drop.is-ph .sap-org-phimg{opacity:.55}
.sap-org-phimg{width:96px;height:96px;border-radius:50%;border:3px dashed var(--color-border-strong);display:grid;place-items:center;color:var(--color-text-muted);font-size:12px;font-weight:700}
.sap-org-drop img{max-width:160px;max-height:120px;object-fit:contain}
.sap-org-a4{background:#fff;border:1px solid var(--color-border-strong);border-radius:6px;aspect-ratio:210/297;max-width:340px;width:100%;margin-inline:auto;padding:18px;position:relative;display:flex;flex-direction:column;gap:8px;font-size:11px;box-shadow:0 8px 24px rgba(2,32,79,.1);overflow:hidden}
.sap-org-a4 .wm{position:absolute;inset:0;display:grid;place-items:center;font-size:44px;font-weight:800;color:rgba(2,32,79,.06);transform:rotate(-24deg);pointer-events:none;white-space:nowrap}
.sap-org-a4 .ln{height:7px;background:var(--color-border);border-radius:3px}.sap-org-a4 .ln.s{width:60%}.sap-org-a4 .ln.m{width:80%}
.sap-org-a4 .sig{margin-block-start:auto;display:flex;justify-content:space-between;gap:10px;align-items:flex-end}
.sap-org-a4 .slot{width:42%;height:70px;border:1px dashed var(--color-border-strong);border-radius:6px;display:grid;place-items:center;color:var(--color-text-muted);text-align:center;font-size:10px}
.sap-org-a4 .slot img{max-width:100%;max-height:64px}
.sap-org-modrow{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:14px 18px;border-block-end:1px solid var(--color-border)}
.sap-org-modrow:last-child{border-block-end:0}.sap-org-modico{width:44px;height:44px;border-radius:12px;background:var(--color-primary-tint);color:var(--eg-navy);display:grid;place-items:center}
.sap-org-modrow.is-off .sap-org-modico{background:var(--color-bg-alt);color:var(--color-text-muted)}
.sap-org-modrow h3{margin:0;font-size:1rem}.sap-org-modrow p{margin:2px 0 0;font-size:var(--text-caption);color:var(--color-text-muted)}
.sap-org-deps{display:flex;gap:6px;flex-wrap:wrap;margin-block-start:6px}
.sap-org-depchip{font-size:11px;padding:2px 8px;border-radius:999px;background:var(--color-bg-alt);color:var(--color-text-muted);border:1px solid var(--color-border)}
.sap-org-depchip.is-off{color:var(--color-danger);border-color:currentColor}
.sap-org-indent{display:inline-block;color:var(--color-text-muted);margin-inline-end:6px}
.sap-org-impact{display:grid;gap:10px;margin-block:8px}.sap-org-impact section{border:1px solid var(--color-border);border-radius:10px;padding:10px 12px;background:var(--color-bg-alt)}.sap-org-impact h4{margin:0 0 6px;font-size:var(--text-dense)}.sap-org-impact ul{margin:0;padding-inline-start:18px;font-size:var(--text-caption)}
.sap-org-units{width:100%}.sap-org-locked{opacity:.65}
.sap-org-fmt{font:700 1.4rem var(--font-en);color:var(--eg-navy);direction:ltr;text-align:start}
.sap-org-checks{display:grid;gap:8px}.sap-org-check{display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--color-border);border-radius:10px}
.sap-org-check .dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;flex:none}.sap-org-check.ok .dot{background:var(--color-success-tint);color:var(--color-success)}.sap-org-check.bad .dot{background:var(--color-danger-tint);color:var(--color-danger)}
.sap-org-check small{display:block;color:var(--color-text-muted)}
@media(max-width:640px){.sap-org-modrow{grid-template-columns:40px minmax(0,1fr);}.sap-org-modrow>:nth-child(n+3){grid-column:2}}
`);

  /* ───────────────────────── helpers ───────────────────────── */
  const clone = (o) => JSON.parse(JSON.stringify(o == null ? null : o));
  const usersOf = (deptId) => (st.get('users') || []).filter((u) => u.departmentId === deptId);
  const activeUsers = () => (st.get('users') || []).filter((u) => u.status === 'active');
  const unitLabel = { pcs: 'قطعة', 'm²': 'م²', kg: 'كجم' };

  /** one-time, idempotent demo extensions (never touches seed.js) */
  function ensure() {
    if (!st.get('meta') || st.get('meta.orgSeeded')) return;
    st.update('settings.company', (c) => { ['hotline', 'plantLocation'].forEach((k) => { if (c[k] == null) c[k] = ''; }); });
    st.update('warehouses', (l) => { const demo = { 'W-01': [1840, 'pcs'], 'W-02': [22600, 'kg'], 'W-03': [410, 'pcs'] }; l.forEach((w) => { if (!w.stock) { const d = demo[w.id]; w.stock = d ? { qty: d[0], unit: d[1], demo: true } : { qty: 0, unit: w.type === 'RM' ? 'kg' : 'pcs', demo: true }; } }); });
    st.update('settings.general', (g) => { if (!g.currencyFormat) g.currencyFormat = { decimals: 0, thousands: ',', symbolPosition: 'after' }; });
    st.update('meta', (m) => { m.orgSeeded = true; });
  }
  setTimeout(ensure, 0);

  /** skeleton → build → (error state with retry); returns the cleanup for render() */
  function mount(root, build, opts) {
    opts = opts || {}; const host = h('div'); root.append(host); let alive = true, off = null;
    function run() {
      if (typeof off === 'function') { off(); off = null; }
      SA.clear(host); host.append(h('div', { style: { paddingBlock: '8px' } }, SA.skeleton({ kind: opts.skel || 'form', rows: 7 })));
      SA.delay(opts.ms || 220, { write: false }).then(() => { if (!alive) return; SA.clear(host); try { off = build(host, run) || null; } catch (e) { console.error(e); SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); } },
        (e) => { if (!alive) return; SA.clear(host); host.append(SA.errorState({ text: SA.errorText(e), onRetry: run })); });
    }
    ensure(); run();
    return () => { alive = false; if (typeof off === 'function') off(); };
  }
  const fieldLabel = { nameAr: 'الاسم (عربي)', nameEn: 'الاسم (English)', taxId: 'الرقم الضريبي', commercialReg: 'السجل التجاري', address: 'العنوان الرسمي', hotline: 'الخط الساخن', email: 'البريد', website: 'الموقع الإلكتروني', plantLocation: 'موقع المصنع' };

  /* ═══════════════════════ SA-07 · بيانات الشركة والمصنع ═══════════════════════ */
  const REQ = [['taxId', 'الرقم الضريبي', 'المالية · بند 11'], ['commercialReg', 'السجل التجاري', 'المالية · بند 11'], ['address', 'العنوان الرسمي', 'المالية · بند 11'], ['seal', 'الختم', 'العميل · بند 13'], ['signature', 'التوقيع', 'العميل · بند 13']];
  function readiness(c) {
    c = c || st.get('settings.company') || {};
    const items = REQ.map((r) => ({ key: r[0], label: r[1], src: r[2], ok: r[0] === 'seal' ? !!c.sealUploaded : r[0] === 'signature' ? !!c.signatureUploaded : !!String(c[r[0]] || '').trim() }));
    return { items, missing: items.filter((i) => !i.ok), ok: items.every((i) => i.ok), done: items.filter((i) => i.ok).length, total: items.length };
  }
  SA.company = Object.assign(SA.company || {}, { readiness });

  const FIELDS = [
    { k: 'nameAr', req: true, ph: (v) => !v || /تجريبي/.test(v), phNote: 'اسم تجريبي — بانتظار الاسم الرسمي' },
    { k: 'nameEn', req: true, dir: 'ltr', ph: (v) => !v, phNote: 'بانتظار الاسم الإنجليزي الرسمي' },
    { k: 'taxId', req: true, dir: 'ltr', ph: (v) => !v, phNote: 'بانتظار الرقم الرسمي من المالية (بند 11). صيغة التحقق Open.' },
    { k: 'commercialReg', req: true, dir: 'ltr', ph: (v) => !v, phNote: 'بانتظار البيانات الرسمية (بند 11). صيغة التحقق Open.' },
    { k: 'address', req: true, type: 'textarea', ph: (v) => !v, phNote: 'منقول من الموقع ولم يُؤكَّد كعنوان رسمي (بند 11).' },
    { k: 'hotline', dir: 'ltr', type: 'tel', ph: (v) => !v },
    { k: 'email', dir: 'ltr', type: 'email', ph: (v) => !v },
    { k: 'website', dir: 'ltr', ph: (v) => !v },
    { k: 'plantLocation', ph: (v) => !v, hint: 'يظهر في الترويسة وبيانات الشحن.' }
  ];

  function pngTransparency(dataUrl) {
    return new Promise((res) => { const im = new Image(); im.onload = () => { try { const c = document.createElement('canvas'); c.width = Math.min(im.width, 200); c.height = Math.min(im.height, 200); const x = c.getContext('2d'); x.drawImage(im, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data; let t = false; for (let i = 3; i < d.length; i += 4) { if (d[i] < 250) { t = true; break; } } res({ ok: true, transparent: t, w: im.width, h: im.height }); } catch (e) { res({ ok: true, transparent: null }); } }; im.onerror = () => res({ ok: false }); im.src = dataUrl; });
  }

  function companyRender(root, ctx) {
    ctx.setCrumbs([{ label: 'المنظمة' }, { label: 'الشركة والمصنع' }]);
    return mount(root, (host) => {
      let tab = ctx.params.tab === 'seal' ? 'seal' : 'data'; let editing = false; let draft = {}; const staged = {};
      const head = h('div'), tabsHost = h('div'), bannerHost = h('div'), body = h('div');
      host.append(head, bannerHost, tabsHost, body);
      const canEdit = () => SA.can('sa.company.edit');
      const cur = () => st.get('settings.company') || {};
      const tabs = SA.tabs({ tabs: [{ id: 'data', label: 'بيانات الشركة', icon: 'building' }, { id: 'seal', label: 'الختم والتوقيع', icon: 'edit' }], active: tab, label: 'أقسام بيانات الشركة', onChange: (id) => { if (editing && id !== 'data') { SA.toast('احفظ تعديلاتك أو تراجع عنها أولًا.', 'warn'); tabs.setActive('data'); return; } tab = id; history.replaceState(null, '', '#/company' + (id === 'seal' ? '?tab=seal' : '')); drawBody(); } });
      tabsHost.append(tabs.el);

      function drawHead() {
        SA.clear(head);
        head.append(SA.pageHead({ title: 'بيانات الشركة والمصنع', desc: 'المرجع الرسمي لكل مستند صادر. أي حقل لم يصل بعد يحمل علامة Placeholder ويُحتسب ناقصًا في الجاهزية.', tags: [SA.tag('approved'), SA.tag('open', 'القيم Open — بند 11 و13')],
          actions: [SA.btn({ label: 'سجل التغييرات', icon: 'history', kind: 'ghost', perm: 'sa.audit.view', onClick: () => SA.nav('audit', { query: { q: 'COMPANY' } }) }), tab === 'data' && !editing ? SA.btn({ label: 'تعديل البيانات', icon: 'edit', kind: 'accent', perm: 'sa.company.edit', onClick: () => { editing = true; draft = clone(cur()); drawAll(); } }) : null] }));
      }
      function drawBanner(c) {
        SA.clear(bannerHost); const r = readiness(c || cur());
        const meter = h('div.sap-org-meter', { 'aria-hidden': 'true' }, r.items.map((i) => h('i', { class: i.ok ? 'on' : '' })));
        bannerHost.append(h('div.sap-org-ready' + (r.ok ? '.is-ok' : '.is-bad'), { role: 'status' }, SA.icon(r.ok ? 'checkcircle' : 'alert', 'icon-lg'),
          h('div.sap-org-ready-main', {}, h('b', {}, r.ok ? 'جاهزية المستندات: مكتملة' : 'جاهزية المستندات: ناقص ' + r.missing.length + ' من ' + r.total + ' عناصر'),
            h('span', {}, r.ok ? 'البيانات الرسمية والختم والتوقيع مكتملة — يمكن تفعيل إصدار المستندات الحقيقية.' : 'لن يُسمح بإصدار مستندات حقيقية (فواتير، أذون، سندات) قبل الاكتمال. ناقص: ' + r.missing.map((m) => m.label).join('، ') + '.'), meter),
          SA.btn({ label: 'تفاصيل الجاهزية', icon: 'list', kind: 'ghost', size: 'sm', onClick: openReadiness })));
      }
      function openReadiness() {
        const c = cur(); const r = readiness(c);
        const issuing = !!c.officialIssuingEnabled;
        const sw = h('input', { type: 'checkbox', checked: issuing, disabled: !r.ok || !canEdit(), 'aria-describedby': 'sap-org-issue-help' });
        sw.addEventListener('change', async () => {
          const want = sw.checked; sw.checked = !want;
          if (!canEdit()) return SA.toast(NOPERM + ' (sa.company.edit)', 'warn');
          if (want && !readiness().ok) return SA.toast('البيانات غير مكتملة — لا يمكن التفعيل.', 'error');
          const rr = await SA.confirm({ title: want ? 'تفعيل إصدار مستندات حقيقية' : 'إيقاف إصدار المستندات الحقيقية', danger: want, confirmLabel: want ? 'تفعيل الإصدار' : 'إيقاف', reasonRequired: true, impact: want ? ['المبيعات والمالية هتقدر تصدر فواتير وأذون وسندات بالبيانات الرسمية.', 'ملف PDF العادي ليس فاتورة إلكترونية معتمدة ولا يُوصف كذلك.'] : ['المستندات الجديدة هتتحفظ كمسودة فقط ولا يمكن إصدارها.'] });
          if (!rr.ok) return; if (!(await SA.stepUp('company.official'))) return;
          try { await SA.api(() => { const before = !!cur().officialIssuingEnabled; st.update('settings.company', (x) => { x.officialIssuingEnabled = want; }); SA.audit('COMPANY.UPDATED', { target: { type: 'company', id: 'company', label: 'إصدار المستندات الحقيقية' }, before: { officialIssuingEnabled: before }, after: { officialIssuingEnabled: want }, reason: rr.reason }); }); } catch (e) { return SA.fail(e); }
          SA.toast(want ? 'تم تفعيل إصدار المستندات الحقيقية' : 'تم إيقاف الإصدار', 'success'); d.close(); openReadiness();
        });
        const d = SA.drawer({ title: 'لوحة جاهزية المستندات', subtitle: r.ok ? 'مكتملة' : 'ناقص ' + r.missing.length + ' من ' + r.total, size: 'md', body: h('div', {},
          h('div.sap-org-checks', {}, r.items.map((i) => h('div.sap-org-check ' + (i.ok ? 'ok' : 'bad'), {}, h('span.dot', {}, SA.icon(i.ok ? 'check' : 'x', 'icon-sm')), h('div', {}, h('b', {}, i.label), h('small', {}, i.ok ? 'مكتمل' : 'ناقص — ' + i.src))))),
          h('div', { style: { marginBlockStart: '16px' } }, SA.alert(r.ok ? 'success' : 'warning', r.ok ? 'كل العناصر مكتملة.' : 'الحقول المطلوبة للجاهزية اقتراح [New] ويحتاج اعتماد المالية.')),
          h('label.sap-switch-line', { style: { marginBlockStart: '14px' } }, h('span', {}, h('b', {}, 'تفعيل إصدار مستندات حقيقية'), h('small#sap-org-issue-help', {}, r.ok ? 'يُسجَّل بحدث تدقيق ويطلب Step-up.' : 'غير متاح حتى اكتمال الجاهزية.')), h('span.switch', {}, sw, h('span'))),
          h('p.sap-hint', { style: { marginBlockStart: '14px' } }, SA.icon('info', 'icon-sm'), h('span', {}, 'محاولة إصدار قبل الاكتمال (من المبيعات/المالية) تُرفض ويُحفظ المستند كمسودة فقط.'))), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => d.close() }, 'إغلاق')] });
      }

      /* — data tab — */
      function drawData() {
        SA.clear(body); const c = editing ? draft : cur();
        if (!editing) {
          body.append(SA.card({ title: 'البيانات الرسمية', actions: [h('span.t-caption', {}, 'تظهر على ترويسة كل مستند صادر · الحفظ يتطلب إعادة تحقق')] },
            h('dl.sap-org-fields', {}, FIELDS.map((f) => { const v = c[f.k]; const ph = f.ph(v); return h('div.sap-org-f', {}, h('dt', {}, fieldLabel[f.k], f.req ? h('span.req', { 'aria-hidden': 'true' }, ' *') : null), h('dd', { dir: f.dir || null }, ph && f.phNote ? [v ? h('span', {}, v) : null, h('span.sap-org-ph', { title: f.phNote }, 'Placeholder'), h('span.sap-org-note', {}, f.phNote)] : (v ? v : h('span.t-muted', {}, 'غير مُدخل')))); })),
            !canEdit() ? SA.alert('info', 'عرض فقط — ليس لديك مفتاح ', h('code', {}, 'sa.company.edit'), '. الحقول للقراءة والحفظ معطّل.') : null),
            SA.card({ title: 'الشعار ولغة المستند' }, h('div.sap-formgrid', {},
              h('div', {}, h('b', {}, 'الشعار الرسمي'), h('p.t-muted', {}, 'للقراءة فقط — الشعار الرسمي لا يُرفع ولا يُغيَّر من هنا (Design Principle 2). التعديل عبر فريق الهوية.'), h('img', { src: '../../assets/images/logo/mark.png', alt: 'الشعار الرسمي', style: { height: '54px' } })),
              h('div', {}, h('b', {}, 'لغة المستند'), h('p.t-muted', {}, 'تُضبط لكل قالب مستند من «الترقيم والقوالب» (UC-CMP-04).'), SA.btn({ label: 'فتح قوالب المستندات', icon: 'doc', kind: 'ghost', size: 'sm', perm: 'sa.policies.numbering.view', onClick: () => SA.nav('policies/templates') })))));
          return;
        }
        const group = []; const map = {};
        FIELDS.forEach((f) => {
          const fld = SA.form.field({ name: f.k, label: fieldLabel[f.k] + (f.req ? ' *' : ''), type: f.type === 'textarea' ? 'textarea' : (f.type || 'text'), value: c[f.k] || '', hint: f.hint || (f.phNote && f.ph(c[f.k]) ? f.phNote : ''), dir: f.dir, rules: rulesFor(f.k),
            onInput: (v) => { draft[f.k] = v; drawBanner(draft); dirty(); } });
          group.push(fld); map[f.k] = fld;
        });
        const fg = SA.form.group(group);
        const bar = h('div.sap-org-savebar', {}, h('span.t-muted', { id: 'sap-org-dirty' }, 'لا توجد تغييرات غير محفوظة'), h('div.cluster', {}, h('button.btn.btn-ghost', { type: 'button', onclick: () => { editing = false; drawAll(); } }, 'تراجع'),
          h('button.btn.btn-accent', { type: 'button', id: 'sap-org-save', onclick: () => save(fg) }, SA.icon('lock', 'icon-sm'), 'حفظ التغييرات')));
        function dirty() { const n = changes().length; const el = bar.querySelector('#sap-org-dirty'); if (el) el.textContent = n ? 'لديك ' + n + ' تغيير غير محفوظ' : 'لا توجد تغييرات غير محفوظة'; }
        body.append(SA.card({ title: 'تعديل البيانات الرسمية', actions: [h('span.t-caption', {}, 'الحفظ يتطلب إعادة تحقق (Step-up)')] }, h('div.sap-formgrid', {}, group.map((f) => f.el))), bar);
        setTimeout(() => group[0].focus(), 30);
      }
      function rulesFor(k) {
        const trim = (v) => String(v || '').trim();
        if (k === 'email') return [SA.form.rules.email];
        if (k === 'website') return [(v) => (!trim(v) || /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/.*)?$/i.test(trim(v)) ? null : 'صيغة الموقع غير صحيحة')];
        if (k === 'hotline') return [SA.form.rules.phone];
        if (k === 'taxId' || k === 'commercialReg') return [(v) => (!trim(v) ? null : trim(v).length < 3 || trim(v).length > 40 ? 'الطول بين 3 و40 حرفًا (الصيغة الدقيقة Open — بند 11)' : /[<>;"']/.test(v) ? 'رموز غير مسموحة' : null)];
        return [];
      }
      const changes = () => { const c = cur(); return FIELDS.filter((f) => String(draft[f.k] || '').trim() !== String(c[f.k] || '').trim()).map((f) => ({ k: f.k, before: c[f.k] || '', after: String(draft[f.k] || '').trim() })); };
      async function save(fg) {
        if (!canEdit()) return SA.toast(NOPERM + ' (sa.company.edit)', 'warn');
        if (!fg.validate()) return SA.toast('راجع الحقول المظلّلة.', 'error');
        const ch = changes(); if (!ch.length) return SA.toast('لا توجد تغييرات للحفظ.', 'info');
        const tbl = h('div.table-wrap', {}, h('table.table.sap-diff', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحقل'), h('th', {}, 'قبل'), h('th', {}, 'بعد'))), h('tbody', {}, ch.map((x) => h('tr.is-changed', {}, h('td', {}, fieldLabel[x.k]), h('td.sap-diff-before', {}, x.before || 'Placeholder'), h('td.sap-diff-after', {}, x.after || 'Placeholder'))))));
        const r = await SA.confirm({ title: 'تأكيد حفظ البيانات الرسمية', icon: 'lock', confirmLabel: 'متابعة للتحقق', extra: tbl, impact: ['البيانات تظهر على ترويسة المستندات الجديدة فقط — المستندات الصادرة لا تتغير.'], note: 'هيتسجّل COMPANY.UPDATED بقيمة قبل/بعد (خطورة عالية).' });
        if (!r.ok) return; if (!(await SA.stepUp('company.official'))) return;
        try {
          await SA.api(() => { const before = {}, after = {}; ch.forEach((x) => { before[x.k] = x.before; after[x.k] = x.after; }); st.update('settings.company', (c) => { ch.forEach((x) => { c[x.k] = x.after; }); }); SA.audit('COMPANY.UPDATED', { target: { type: 'company', id: 'company', label: 'بيانات الشركة' }, before, after, reason: 'تعديل بيانات رسمية' }); });
        } catch (e) { return SA.fail(e); }
        SA.notify({ title: 'تم تعديل بيانات الشركة الرسمية', body: ch.map((x) => fieldLabel[x.k]).join('، '), level: 'info', to: ['R-01', 'R-07'], link: '#/company' });
        SA.toast('تم حفظ البيانات الرسمية', 'success'); editing = false; drawAll();
      }

      /* — seal tab — */
      function dropzone(kind) {
        const isSeal = kind === 'seal'; const key = isSeal ? 'seal' : 'signature'; const label = isSeal ? 'الختم' : 'التوقيع';
        const c = cur(); const uploaded = isSeal ? c.sealUploaded : c.signatureUploaded; const data = isSeal ? c.sealData : c.signatureData; const meta = isSeal ? c.sealMeta : c.signatureMeta;
        const input = h('input', { type: 'file', accept: 'image/png', hidden: true, 'aria-label': 'اختيار ملف ' + label });
        const msg = h('div.sap-field-error', { role: 'alert', hidden: true });
        const zone = h('div.sap-org-drop' + (uploaded || staged[key] ? '' : '.is-ph'), { tabindex: '0', role: 'button', 'aria-label': 'رفع ' + label + ' — اسحب ملف PNG أو اضغط للاختيار' });
        const stg = staged[key];
        const shown = stg ? stg.data : (uploaded && data ? data : null);
        zone.append(shown ? h('img', { src: shown, alt: 'معاينة ' + label }) : h('div.sap-org-phimg', {}, 'Placeholder'),
          h('b', {}, shown ? (stg ? 'جاهز للحفظ: ' + stg.name : (meta && meta.name) || label + ' مرفوع') : 'اسحب صورة ' + label + ' هنا أو اختر ملفًا'),
          h('span.t-caption', {}, 'PNG بخلفية شفافة · الحد الأقصى للحجم ', SA.openValue('غير مُعدّ'), ' · حد تقني للنموذج ', SA.demoValue('300KB')));
        const pick = () => { if (!canEdit()) return SA.toast(NOPERM + ' (sa.company.edit)', 'warn'); input.click(); };
        zone.addEventListener('click', pick); zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
        ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('is-over'); }));
        ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('is-over'); }));
        zone.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
        input.addEventListener('change', () => { if (input.files[0]) handle(input.files[0]); });
        async function handle(f) {
          msg.hidden = true;
          if (f.type !== 'image/png' && !/\.png$/i.test(f.name)) { msg.hidden = false; msg.textContent = 'الملف لازم يكون PNG بخلفية شفافة. جرّب ملفًا آخر.'; return; }
          if (f.size > 300 * 1024) { msg.hidden = false; msg.textContent = 'الملف أكبر من الحد التقني للنموذج (300KB). الحد الرسمي Open.'; return; }
          const fr = new FileReader(); fr.onload = async () => { const info = await pngTransparency(fr.result); if (!info.ok) { msg.hidden = false; msg.textContent = 'تعذّرت قراءة الصورة — الملف تالف أو ليس PNG.'; return; } staged[key] = { data: fr.result, name: f.name, size: f.size, transparent: info.transparent }; drawBody(); }; fr.onerror = () => { msg.hidden = false; msg.textContent = 'تعذّرت قراءة الملف.'; }; fr.readAsDataURL(f);
        }
        const actions = h('div.cluster', {}, stg ? [SA.btn({ label: 'حفظ ' + label, icon: 'lock', kind: 'primary', size: 'sm', perm: 'sa.company.edit', onClick: () => commitImg(kind) }), SA.btn({ label: 'إلغاء', kind: 'ghost', size: 'sm', onClick: () => { delete staged[key]; drawBody(); } })] : uploaded ? [SA.btn({ label: 'استبدال', icon: 'upload', kind: 'ghost', size: 'sm', perm: 'sa.company.edit', onClick: pick }), SA.btn({ label: 'حذف', icon: 'trash', kind: 'danger', size: 'sm', perm: 'sa.company.edit', onClick: () => removeImg(kind) })] : [SA.btn({ label: 'اختيار ملف', icon: 'upload', kind: 'ghost', size: 'sm', perm: 'sa.company.edit', onClick: pick })]);
        return SA.card({ title: label, actions: [uploaded ? SA.chip('مرفوع', 'success') : SA.chip('لم يُرفع — Placeholder', 'warning')] }, zone, input, msg,
          stg && stg.transparent === false ? SA.alert('warning', 'الصورة بدون شفافية — ممكن تغطّي محتوى المستند. الأفضل PNG شفاف.') : null, h('div', { style: { marginBlockStart: '12px' } }, actions));
      }
      async function commitImg(kind) {
        const isSeal = kind === 'seal'; const key = isSeal ? 'seal' : 'signature'; const s = staged[key]; if (!s) return;
        if (!(await SA.stepUp('company.official'))) return;
        try { await SA.api(() => { const code = isSeal ? 'COMPANY.SEAL_UPLOADED' : 'COMPANY.SIGNATURE_UPLOADED'; st.update('settings.company', (c) => { if (isSeal) { c.sealUploaded = true; c.sealData = s.data; c.sealMeta = { name: s.name, size: s.size, at: new Date().toISOString() }; } else { c.signatureUploaded = true; c.signatureData = s.data; c.signatureMeta = { name: s.name, size: s.size, at: new Date().toISOString() }; } }); SA.audit(code, { target: { type: 'company', id: kind, label: isSeal ? 'ختم الشركة' : 'توقيع' }, before: { uploaded: false }, after: { uploaded: true, file: s.name, bytes: s.size }, reason: 'رفع ملف رسمي' }); }); } catch (e) { return SA.fail(e); }
        delete staged[key]; SA.toast('تم حفظ ' + (isSeal ? 'الختم' : 'التوقيع'), 'success'); drawBanner(); drawBody();
      }
      async function removeImg(kind) {
        const isSeal = kind === 'seal'; const r = await SA.confirm({ title: 'حذف ' + (isSeal ? 'الختم' : 'التوقيع'), danger: true, confirmLabel: 'حذف', reasonRequired: true, impact: ['هيرجع الحقل Placeholder ويُحتسب ناقصًا في الجاهزية.', 'لو إصدار المستندات الحقيقية مفعّل هيتوقف تلقائيًا.'] }); if (!r.ok) return;
        if (!(await SA.stepUp('company.official'))) return;
        try { await SA.api(() => { st.update('settings.company', (c) => { if (isSeal) { c.sealUploaded = false; c.sealData = null; c.sealMeta = null; } else { c.signatureUploaded = false; c.signatureData = null; c.signatureMeta = null; } c.officialIssuingEnabled = false; }); SA.audit(isSeal ? 'COMPANY.SEAL_UPLOADED' : 'COMPANY.SIGNATURE_UPLOADED', { target: { type: 'company', id: kind, label: isSeal ? 'ختم الشركة' : 'توقيع' }, before: { uploaded: true }, after: { uploaded: false }, reason: r.reason }); }); } catch (e) { return SA.fail(e); }
        SA.toast('تم الحذف', 'success'); drawBanner(); drawBody();
      }
      function drawSeal() {
        SA.clear(body); const c = cur(); const s1 = staged.seal ? staged.seal.data : c.sealUploaded ? c.sealData : null; const s2 = staged.signature ? staged.signature.data : c.signatureUploaded ? c.signatureData : null;
        const a4 = h('div.sap-org-a4', { 'aria-label': 'معاينة مستند A4' }, h('span.wm', {}, 'معاينة — غير رسمي'), h('b', {}, c.nameAr || '—'), h('div.t-caption', {}, 'فاتورة · INV-2026-0001 (عينة)'), h('div.ln'), h('div.ln.m'), h('div.ln.s'), h('div.ln.m'), h('div.ln'),
          h('div.t-caption', {}, 'الرقم الضريبي: ', c.taxId || 'Placeholder'), h('div.sig', {}, h('div.slot', {}, s2 ? h('img', { src: s2, alt: 'التوقيع' }) : 'مكان التوقيع (لم يُرفع)'), h('div.slot', {}, s1 ? h('img', { src: s1, alt: 'الختم' }) : 'مكان الختم (لم يُرفع)')));
        body.append(h('div.sap-grid-2', {}, h('div', { style: { display: 'grid', gap: '16px' } }, dropzone('seal'), dropzone('signature'),
          SA.alert('warning', h('b', {}, 'الصور الرسمية لم تُستلم (بند 13). '), 'لا ختم أو توقيع تجريبي على أي مستند قابل للاستخدام. الختم والتوقيع يبقيان ضمن العناصر الناقصة حتى رفع الملفات الرسمية.')),
          SA.card({ title: 'معاينة على A4', actions: [h('span.t-caption', {}, 'عينة غير رسمية')] }, a4)));
      }
      function drawBody() { drawHead(); tab === 'data' ? drawData() : drawSeal(); }
      function drawAll() { drawBanner(); drawBody(); }
      drawAll();
      const off = st.subscribe('settings.company', () => { if (!editing) { drawBanner(); drawHead(); if (tab === 'data') drawData(); } });
      return () => off();
    });
  }
  SA.register({ id: 'company', group: 'org', title: 'الشركة والمصنع', icon: 'building', route: 'company', perm: 'sa.company.view', order: 10, desc: 'البيانات الرسمية والختم والتوقيع وجاهزية المستندات', render: companyRender });

  /* ═══════════════════════ SA-08 · الأقسام ═══════════════════════ */
  function deptTree() {
    const all = st.get('departments') || []; const out = []; const kids = (pid) => all.filter((d) => (d.parentId || null) === pid);
    (function walk(pid, lvl) { kids(pid).forEach((d) => { out.push(Object.assign({}, d, { level: lvl })); walk(d.id, lvl + 1); }); })(null, 0);
    all.forEach((d) => { if (!out.find((x) => x.id === d.id)) out.push(Object.assign({}, d, { level: 0 })); }); // orphans
    return out;
  }
  const descendants = (id) => { const all = st.get('departments') || []; const s = new Set(); (function w(p) { all.filter((d) => d.parentId === p).forEach((d) => { if (!s.has(d.id)) { s.add(d.id); w(d.id); } }); })(id); return s; };
  const deptCounts = (id) => { const us = usersOf(id); return { users: us.length, active: us.filter((u) => u.status !== 'disabled').length, employees: (st.get('employees') || []).filter((e) => e.departmentId === id && e.status !== 'terminated').length, children: (st.get('departments') || []).filter((d) => d.parentId === id && d.active).length }; };
  function wouldCycle(userId, mgrId) { let c = mgrId, n = 0; while (c && n++ < 50) { if (c === userId) return true; const m = SA.userById(c); c = m ? m.managerId : null; } return false; }

  function openDeptForm(dept) {
    const isNew = !dept; if (!SA.can(isNew ? 'sa.departments.create' : 'sa.departments.edit')) return SA.toast(NOPERM + ' (sa.departments.' + (isNew ? 'create' : 'edit') + ')', 'warn');
    const d0 = dept || { name: '', managerId: '', parentId: null, active: true };
    const bad = descendants(d0.id || '__none'); if (d0.id) bad.add(d0.id);
    const name = SA.form.field({ name: 'name', label: 'اسم القسم', value: d0.name, required: true, rules: [(v) => ((st.get('departments') || []).some((x) => x.id !== d0.id && x.name.trim() === String(v).trim()) ? 'اسم القسم مستخدم من قبل' : null)] });
    const mgr = SA.form.field({ name: 'managerId', label: 'مدير القسم', type: 'select', value: d0.managerId || '', options: [['', 'بدون مدير']].concat(activeUsers().map((u) => [u.id, u.name + ' — ' + (u.jobTitle || SA.roleName(u.roleId))])), hint: 'تغيير المدير يحدّث نطاق «الفريق» للمرؤوسين.' });
    const par = SA.form.field({ name: 'parentId', label: 'القسم الأب [New]', type: 'select', value: d0.parentId || '', options: [['', 'بدون (قسم رئيسي)']].concat((st.get('departments') || []).filter((x) => x.active && !bad.has(x.id)).map((x) => [x.id, x.name])) });
    const cascade = SA.form.field({ name: 'cascade', type: 'checkbox', label: 'انقل المرؤوسين المباشرين للمدير الجديد (نطاق الفريق)', value: true });
    const impactBox = h('div'); function drawImpact() { SA.clear(impactBox); if (isNew) return; const nm = mgr.get() || null; if ((d0.managerId || null) === nm) return; const subs = usersOf(d0.id).filter((u) => u.managerId === d0.managerId && u.id !== nm && d0.managerId); impactBox.append(SA.alert('info', h('b', {}, 'أثر تغيير المدير: '), subs.length ? subs.length + ' مستخدم مرؤوس مباشر للمدير الحالي (' + subs.slice(0, 4).map((u) => u.name).join('، ') + (subs.length > 4 ? '…' : '') + ') — نطاق «الفريق» لهم هيتبع المدير الجديد.' : 'لا يوجد مرؤوسون مباشرون يتأثرون.'), subs.length ? cascade.el : null); }
    mgr.input.addEventListener('change', drawImpact);
    const m = SA.modal({ title: isNew ? 'قسم جديد' : 'تعديل القسم — ' + d0.name, icon: 'building', size: 'sm', body: h('div.sap-confirm', {}, name.el, mgr.el, par.el, impactBox), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, isNew ? 'إنشاء القسم' : 'حفظ')] });
    async function save() {
      if (!name.validate()) return name.focus(); const v = { name: name.get().trim(), managerId: mgr.get() || null, parentId: par.get() || null };
      if (!isNew && (d0.managerId || null) !== v.managerId) {
        const subs = usersOf(d0.id).filter((u) => u.managerId === d0.managerId && u.id !== v.managerId && d0.managerId);
        const move = cascade.get() && subs.length;
        const r = await SA.confirm({ title: 'تغيير مدير «' + d0.name + '»', confirmLabel: 'تأكيد التغيير', impact: ['المدير: ' + SA.userName(d0.managerId) + ' ← ' + (v.managerId ? SA.userName(v.managerId) : 'بدون مدير'), move ? subs.length + ' مرؤوس هيتحوّلوا للمدير الجديد (نطاق الفريق).' : 'لن يتغير المدير المباشر لأي مستخدم.'] }); if (!r.ok) return;
      }
      m.setBusy(true);
      try {
        await SA.api(() => {
          if (isNew) { const id = st.nextId('departments', 'D', 2); st.insert('departments', { id, name: v.name, managerId: v.managerId, parentId: v.parentId, active: true }); SA.audit('DEPT.CREATED', { target: { type: 'department', id, label: v.name }, after: v }); return; }
          const before = { name: d0.name, managerId: d0.managerId, parentId: d0.parentId }; let moved = 0;
          st.patch('departments', d0.id, v);
          if (before.managerId !== v.managerId && v.managerId && cascade.get()) { usersOf(d0.id).forEach((u) => { if (u.managerId === before.managerId && u.id !== v.managerId && !wouldCycle(u.id, v.managerId)) { st.patch('users', u.id, { managerId: v.managerId }); moved++; } }); }
          SA.audit('DEPT.UPDATED', { target: { type: 'department', id: d0.id, label: v.name }, before, after: Object.assign({}, v, moved ? { subordinatesMoved: moved } : {}) });
          if (before.managerId !== v.managerId) SA.notify({ title: 'تغيير مدير قسم «' + v.name + '»', body: 'المدير الجديد: ' + (v.managerId ? SA.userName(v.managerId) : 'بدون') + (moved ? ' — تم نقل ' + moved + ' مرؤوس.' : ''), level: 'info', to: ['R-01'], toUsers: [v.managerId, before.managerId].filter(Boolean), link: '#/departments' });
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast(isNew ? 'تم إنشاء القسم' : 'تم حفظ القسم', 'success');
    }
    name.focus();
  }
  function blockedDisable(d, c) {
    const lines = []; if (c.active) lines.push(h('li', {}, h('b.num', {}, c.active), ' مستخدم نشط/غير معطّل'));
    if (c.employees) lines.push(h('li', {}, h('b.num', {}, c.employees), ' موظف على رأس العمل (HR)')); if (c.children) lines.push(h('li', {}, h('b.num', {}, c.children), ' قسم فرعي مفعّل'));
    const m = SA.modal({ title: 'لا يمكن تعطيل «' + d.name + '»', icon: 'alert', danger: true, size: 'sm', body: h('div.sap-confirm', {}, SA.alert('danger', 'القسم غير فاضي. انقل أو عطّل التالي أولًا:'), h('ul', {}, lines)), foot: [c.active ? h('button.btn.btn-ghost', { type: 'button', onclick: () => { m.close(); SA.nav('users', { query: { dept: d.id } }); } }, 'عرض المستخدمين') : null, h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'فهمت')] });
  }
  async function toggleDept(d) {
    if (!SA.can('sa.departments.disable')) return SA.toast(NOPERM + ' (sa.departments.disable)', 'warn');
    const c = deptCounts(d.id);
    if (d.active) {
      if (c.active || c.employees || c.children) return blockedDisable(d, c);
      const r = await SA.confirm({ title: 'تعطيل قسم «' + d.name + '»', danger: true, confirmLabel: 'تعطيل القسم', reasonRequired: true, impact: ['القسم هيختفي من قوائم الاختيار (مستخدمون/أدوار).', 'مفيش حذف — ممكن تفعّله تاني.'] }); if (!r.ok) return;
      try { await SA.api(() => { st.patch('departments', d.id, { active: false }); SA.audit('DEPT.DISABLED', { target: { type: 'department', id: d.id, label: d.name }, before: { active: true }, after: { active: false }, reason: r.reason }); }); } catch (e) { return SA.fail(e); }
      SA.toast('تم تعطيل القسم', 'success');
    } else {
      try { await SA.api(() => { st.patch('departments', d.id, { active: true }); SA.audit('DEPT.ENABLED', { target: { type: 'department', id: d.id, label: d.name }, before: { active: false }, after: { active: true } }); }); } catch (e) { return SA.fail(e); }
      SA.toast('تم تفعيل القسم', 'success');
    }
  }
  function departmentsRender(root, ctx) {
    ctx.setCrumbs([{ label: 'المنظمة' }, { label: 'الأقسام' }]);
    return mount(root, (host, retry) => {
      const head = h('div'), listHost = h('div'); host.append(head, listHost);
      head.append(SA.pageHead({ title: 'الأقسام', desc: 'الهيكل التنظيمي المشترك بين الإدارة والموارد البشرية. التعطيل ممنوع لو فيه مستخدمين أو موظفين نشطين.', tags: [SA.tag('approved')], actions: [SA.btn({ label: 'قسم جديد', icon: 'plus', kind: 'accent', perm: 'sa.departments.create', onClick: () => openDeptForm(null) })] }));
      let table = null;
      function build() {
        table = SA.table({ rowId: 'id', pageSize: 25, caption: 'قائمة الأقسام', rows: () => deptTree(), search: { placeholder: 'ابحث باسم القسم أو المدير…', keys: [(r) => r.name, (r) => SA.userName(r.managerId)] },
          filters: [{ key: 'active', label: 'الحالة', options: [['1', 'مفعّل'], ['0', 'معطّل']], test: (r, v) => (v === '1') === !!r.active }],
          columns: [
            { key: 'name', label: 'القسم', render: (d) => h('span', {}, d.level ? h('span.sap-org-indent', { 'aria-hidden': 'true' }, '└ '.repeat(1)) : null, h('b', {}, d.name), d.parentId ? h('small.t-muted', { style: { marginInlineStart: '8px' } }, 'تابع لـ ' + SA.deptName(d.parentId)) : null) },
            { key: 'managerId', label: 'المدير', render: (d) => (d.managerId && SA.userById(d.managerId) ? SA.userCell(SA.userById(d.managerId)) : h('span.t-muted', {}, 'بدون مدير')) },
            { key: 'users', label: 'المستخدمون', value: (d) => deptCounts(d.id).users, render: (d) => { const c = deptCounts(d.id); return h('a', { href: SA.href('users') + '?dept=' + d.id, title: 'عرض مستخدمي القسم' }, h('b.num', {}, c.active), h('span.t-muted', {}, ' نشط من ' + c.users)); } },
            { key: 'employees', label: 'الموظفون (HR)', value: (d) => deptCounts(d.id).employees, render: (d) => h('span.num', {}, deptCounts(d.id).employees) },
            { key: 'active', label: 'الحالة', render: (d) => SA.chip(d.active ? 'مفعّل' : 'معطّل', d.active ? 'success' : 'neutral') }],
          rowActions: (d) => [{ label: 'تعديل', icon: 'edit', onClick: () => openDeptForm(d), disabled: SA.can('sa.departments.edit') ? false : NOPERM }, { label: 'عرض المستخدمين', icon: 'users', onClick: () => SA.nav('users', { query: { dept: d.id } }) }, { divider: true }, d.active ? { label: 'تعطيل', icon: 'userx', danger: true, onClick: () => toggleDept(d), disabled: SA.can('sa.departments.disable') ? false : NOPERM } : { label: 'تفعيل', icon: 'check', onClick: () => toggleDept(d), disabled: SA.can('sa.departments.disable') ? false : NOPERM }],
          onRowClick: (d) => openDeptForm(d), empty: { icon: 'building', title: 'لا توجد أقسام', text: 'ابدأ بإنشاء أول قسم.', action: { label: 'قسم جديد', perm: 'sa.departments.create', onClick: () => openDeptForm(null) } }, onRetry: retry });
        SA.clear(listHost); listHost.append(h('div.card.card-flush.sap-listcard', {}, table.el));
      }
      build();
      const offs = ['departments', 'users', 'employees'].map((p) => st.subscribe(p, () => table && table.refresh()));
      return () => offs.forEach((f) => f());
    }, { skel: 'table' });
  }
  SA.register({ id: 'departments', group: 'org', title: 'الأقسام', icon: 'building', route: 'departments', perm: 'sa.departments.view', order: 20, desc: 'هيكل الأقسام والمديرون', render: departmentsRender });

  /* ═══════════════════════ SA-09 · الموديولات ═══════════════════════ */
  const DEPS = { sales: ['customers', 'products', 'inventory'], customers: [], products: [], inventory: ['products'], manufacturing: ['inventory', 'products'], purchasing: ['inventory', 'products'], finance: ['sales', 'purchasing'], hr: [], quality: ['manufacturing'], super_admin: [], exec: [], crm: ['sales'], logistics: ['sales', 'inventory'], care: [], expo: ['crm'], portal: ['sales', 'products'] };
  const MODICON = { sales: 'cart', customers: 'users', products: 'box', inventory: 'warehouse', manufacturing: 'factory', purchasing: 'truck', finance: 'coins', hr: 'id', quality: 'clipboard', super_admin: 'shield', exec: 'gauge', crm: 'users', logistics: 'truck', care: 'wrench', expo: 'calendar', portal: 'globe' };
  const modName = (k) => ((st.get('modules') || []).find((m) => m.key === k) || {}).nameAr || k;
  const modOn = (k) => { const m = (st.get('modules') || []).find((x) => x.key === k); return !!(m && m.enabled); };
  function modStatus(m) { if (m.enabled) return ['مفعّل', 'success']; if (m.phase === 'v2') return ['مخطط', 'info']; return ['مخفي', 'neutral']; }
  function impactOf(m, enable) {
    const mods = st.get('modules') || []; const res = [];
    const rolesWith = (st.get('roles') || []).filter((r) => r.matrix && r.matrix[m.key] && r.matrix[m.key].view); const roleIds = new Set(rolesWith.map((r) => r.id));
    const users = (st.get('users') || []).filter((u) => roleIds.has(u.roleId) && u.status !== 'disabled');
    const dependents = mods.filter((x) => x.enabled && (DEPS[x.key] || []).indexOf(m.key) >= 0);
    const missing = (DEPS[m.key] || []).filter((k) => !modOn(k));
    const extra = [];
    if (m.key === 'hr') { const emp = (st.get('employees') || []).filter((e) => e.status !== 'terminated').length; const ap = (st.get('approvals') || []).filter((a) => a.area === 'hr' && a.status === 'pending').length; const hrRoles = (st.get('roles') || []).filter((r) => r.homeApp === 'hr'); const hrUsers = (st.get('users') || []).filter((u) => hrRoles.some((r) => r.id === u.roleId) && u.status !== 'disabled'); extra.push(emp + ' موظف و' + (ap ? ap + ' طلب اعتماد HR معلّق' : 'لا طلبات HR معلّقة') + ' — ' + (enable ? 'يعودون للظهور.' : 'مساحة HR كلها هتتقفل (القائمة والمبدّل والروابط).'), hrUsers.length + ' مستخدم بدور HR هيفقدوا الدخول لمساحتهم الأساسية.'); }
    return { users, rolesWith, dependents, missing, extra };
  }
  async function toggleModule(m) {
    if (!SA.can('sa.modules.toggle')) { SA.toast(NOPERM + ' (sa.modules.toggle)', 'warn'); return false; }
    if (m.locked) { SA.toast('«' + m.nameAr + '» موديول مقفول ولا يمكن تعطيله.', 'warn'); return false; }
    const enable = !m.enabled; const im = impactOf(m, enable);
    if (enable && im.missing.length) { SA.toast('لا يمكن تفعيل «' + m.nameAr + '» — يعتمد على موديولات مخفية: ' + im.missing.map(modName).join('، ') + '. فعّلها أولًا.', 'error', { ms: 7000 }); return false; }
    const extra = h('div.sap-org-impact', {},
      h('section', {}, h('h4', {}, 'من يتأثر'), h('ul', {}, h('li', {}, h('b.num', {}, im.users.length), ' مستخدم نشط بصلاحية عرض «' + m.nameAr + '» (' + im.rolesWith.length + ' دور)'), im.extra.map((t) => h('li', {}, t)))),
      !enable && im.dependents.length ? h('section', {}, h('h4', {}, 'تبعيات'), h('ul', {}, im.dependents.map((x) => h('li', {}, h('b', {}, x.nameAr), ' يعتمد عليه — هيشتغل بوظائف ناقصة (لن يُعطَّل تلقائيًا).')))) : null,
      h('section', {}, h('h4', {}, 'السلوك'), h('ul', {}, h('li', {}, enable ? 'يظهر في القائمة لمن لهم صلاحية.' : 'يختفي من القائمة ويُقفل للجميع — حتى بالرابط المباشر.'), h('li', {}, 'يُسجَّل MODULE.TOGGLED (خطورة عالية) ويُرسل إشعار للإدارة.'))));
    const r = await SA.confirm({ title: (enable ? 'تفعيل موديول «' : 'إخفاء موديول «') + m.nameAr + '»', danger: !enable, icon: 'layers', confirmLabel: enable ? 'تفعيل الموديول' : 'إخفاء الموديول', reasonRequired: true, reasonLabel: 'سبب ' + (enable ? 'التفعيل' : 'الإخفاء'), extra, impact: [] });
    if (!r.ok) return false; if (!(await SA.stepUp('module.toggle'))) return false;
    return r;
  }
  function modulesRender(root, ctx) {
    ctx.setCrumbs([{ label: 'المنظمة' }, { label: 'الموديولات' }]);
    return mount(root, (host) => {
      const head = h('div'), listHost = h('div'); host.append(head, listHost);
      head.append(SA.pageHead({ title: 'تفعيل وإخفاء الموديولات', desc: 'الموديول المخفي لا يظهر في القائمة ولا يُفتح بالرابط المباشر. كل تغيير بسبب وإعادة تحقق.', tags: [SA.tag('approved'), SA.tag('pending', 'تبعيات للتأكيد')] }));
      async function doToggle(m, sw) {
        const res = await toggleModule(m);
        if (!res) { sw.checked = m.enabled; return; }
        const enable = !m.enabled;
        try { await SA.api(() => { st.update('modules', (l) => { const x = l.find((y) => y.key === m.key); if (x) x.enabled = enable; }); SA.audit('MODULE.TOGGLED', { target: { type: 'module', id: m.key, label: m.nameAr }, before: { enabled: m.enabled }, after: { enabled: enable }, reason: res.reason }); }); } catch (e) { sw.checked = m.enabled; return SA.fail(e); }
        SA.notify({ title: (enable ? 'تفعيل' : 'إخفاء') + ' موديول: ' + m.nameAr, body: 'السبب: ' + res.reason, level: 'info', to: ['R-01', 'R-10'], link: '#/modules' });
        SA.emit('modules'); SA.toast((enable ? 'تم تفعيل ' : 'تم إخفاء ') + m.nameAr + (m.key === 'hr' ? (enable ? ' — مساحة HR عادت.' : ' — مساحة HR اختفت من القائمة.') : ''), 'success');
      }
      function draw() {
        SA.clear(listHost); const mods = st.get('modules') || [];
        listHost.append(SA.card({ flush: true }, mods.map((m) => {
          const [stl, k] = modStatus(m); const lockReason = m.locked ? 'مقفول: لا يمكن تعطيله' : (m.phase === 'v2' && !m.enabled ? 'خارج v1 — ' + (m.note || 'غير متاح') : !SA.can('sa.modules.toggle') ? NOPERM + ' (sa.modules.toggle)' : '');
          const sw = h('input', { type: 'checkbox', checked: !!m.enabled, disabled: !!lockReason, 'aria-label': (m.enabled ? 'إخفاء ' : 'تفعيل ') + m.nameAr });
          sw.addEventListener('change', () => doToggle(m, sw));
          const deps = DEPS[m.key] || [];
          return h('div.sap-org-modrow' + (m.enabled ? '' : '.is-off'), {}, h('span.sap-org-modico', {}, SA.icon(MODICON[m.key] || 'layers')),
            h('div', {}, h('h3', {}, m.nameAr, ' ', h('code.t-caption', {}, m.key), ' ', h('span.chip', {}, m.phase === 'v1' ? 'v1' : m.phase === 'p2' ? 'P2' : 'v2')), m.note ? h('p', {}, m.note) : null,
              deps.length ? h('div.sap-org-deps', {}, h('span.t-caption', {}, 'يعتمد على:'), deps.map((dk) => h('span.sap-org-depchip' + (modOn(dk) ? '' : '.is-off'), {}, modName(dk)))) : null),
            SA.chip(stl, k), h('label.switch', { title: lockReason || null }, sw, h('span')));
        })), SA.alert('info', h('b', {}, 'موديول الموارد البشرية: '), 'إخفاؤه يخفي مساحة HR كاملة (القائمة والمبدّل والروابط hr/*) فعليًا في هذا النموذج — جرّب ثم افتح «لوحة HR».'), h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'التبعيات المعروضة اقتراح للنموذج (Pending) — تأكيد خريطة الاعتماد بين الموديولات مع فريق المنتج.')));
      }
      draw(); const off = st.subscribe('modules', draw); return () => off();
    }, { skel: 'table' });
  }
  SA.register({ id: 'modules', group: 'org', title: 'الموديولات', icon: 'layers', route: 'modules', perm: 'sa.modules.view', order: 30, desc: 'تفعيل وإخفاء الموديولات مع حوار الأثر', render: modulesRender });

  /* ═══════════════════════ SA-10 · المخازن ═══════════════════════ */
  const WTYPE = { FG: 'منتجات تامة (FG)', RM: 'خامات (RM)', WIP: 'تحت التشغيل (WIP)' };
  const whUsers = (id) => (st.get('users') || []).filter((u) => (u.warehouseIds || []).indexOf(id) >= 0);
  function syncWarehouseScope(wid, managerId, allowed) {
    const keep = new Set(allowed || []); if (managerId) keep.add(managerId);
    st.update('users', (l) => { l.forEach((u) => { const has = (u.warehouseIds || []).indexOf(wid) >= 0; if (keep.has(u.id) && !has) u.warehouseIds = (u.warehouseIds || []).concat([wid]); else if (!keep.has(u.id) && has) u.warehouseIds = u.warehouseIds.filter((x) => x !== wid); }); });
  }
  function openWhForm(w) {
    const isNew = !w; if (!SA.can(isNew ? 'sa.warehouses.create' : 'sa.warehouses.edit')) return SA.toast(NOPERM + ' (sa.warehouses.' + (isNew ? 'create' : 'edit') + ')', 'warn');
    const w0 = w || { code: '', name: '', type: 'FG', managerId: '', active: true };
    const code = SA.form.field({ name: 'code', label: 'كود المخزن', value: w0.code, required: true, hint: 'حروف إنجليزية كبيرة وأرقام وشرطة، مثل WH-FG2', dir: 'ltr', rules: [(v) => (!/^[A-Z0-9-]{2,12}$/.test(String(v).trim()) ? 'الكود: 2–12 حرفًا إنجليزيًا كبيرًا/أرقام/شرطة' : (st.get('warehouses') || []).some((x) => x.id !== w0.id && x.code === String(v).trim()) ? 'الكود مستخدم لمخزن آخر' : null)] });
    const name = SA.form.field({ name: 'name', label: 'اسم المخزن', value: w0.name, required: true });
    const type = SA.form.field({ name: 'type', label: 'النوع', type: 'select', value: w0.type, options: Object.keys(WTYPE).map((k) => [k, WTYPE[k]]) });
    const mgr = SA.form.field({ name: 'managerId', label: 'المسؤول', type: 'select', value: w0.managerId || '', required: true, options: [['', 'اختر…']].concat(activeUsers().map((u) => [u.id, u.name + ' — ' + SA.roleName(u.roleId)])), hint: 'نطاق مدير المخزن بيتحدّث تلقائيًا.' });
    const curAllowed = w0.id ? whUsers(w0.id).map((u) => u.id).filter((id) => id !== w0.managerId) : [];
    const allowed = SA.form.field({ name: 'allowed', label: 'مستخدمون مسموحون [New]', type: 'multi', value: curAllowed, options: activeUsers().map((u) => [u.id, u.name, SA.roleName(u.roleId)]) });
    const m = SA.modal({ title: isNew ? 'مخزن جديد' : 'تعديل المخزن — ' + w0.name, icon: 'warehouse', size: 'md', body: h('div.sap-confirm', {}, h('div.sap-formgrid', {}, code.el, name.el), h('div.sap-formgrid', {}, type.el, mgr.el), h('div', { style: { maxHeight: '220px', overflow: 'auto' } }, allowed.el)), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, isNew ? 'إنشاء المخزن' : 'حفظ')] });
    async function save() {
      if (!SA.form.group([code, name, mgr]).validate()) return;
      const v = { code: code.get().trim(), name: name.get().trim(), type: type.get(), managerId: mgr.get() }; const al = allowed.get();
      m.setBusy(true);
      try {
        await SA.api(() => {
          if (isNew) { const id = st.nextId('warehouses', 'W', 2); st.insert('warehouses', Object.assign({ id, active: true, hasStock: false, stock: { qty: 0, unit: v.type === 'RM' ? 'kg' : 'pcs', demo: true } }, v)); syncWarehouseScope(id, v.managerId, al); SA.audit('WAREHOUSE.CREATED', { target: { type: 'warehouse', id, label: v.name }, after: Object.assign({}, v, { allowedUsers: al.length }) }); return; }
          const before = { code: w0.code, name: w0.name, type: w0.type, managerId: w0.managerId, allowedUsers: curAllowed.length };
          st.patch('warehouses', w0.id, v); syncWarehouseScope(w0.id, v.managerId, al);
          SA.audit('WAREHOUSE.UPDATED', { target: { type: 'warehouse', id: w0.id, label: v.name }, before, after: Object.assign({}, v, { allowedUsers: al.length }) });
          if (w0.managerId !== v.managerId) SA.notify({ title: 'تغيير مسؤول مخزن «' + v.name + '»', body: 'المسؤول الجديد: ' + SA.userName(v.managerId) + ' — نطاق المخازن لديه اتحدّث.', level: 'info', to: ['R-01'], toUsers: [v.managerId, w0.managerId].filter(Boolean), link: '#/warehouses' });
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast(isNew ? 'تم إنشاء المخزن' : 'تم حفظ المخزن', 'success');
    }
    code.focus();
  }
  async function toggleWh(w) {
    if (!SA.can('sa.warehouses.disable')) return SA.toast(NOPERM + ' (sa.warehouses.disable)', 'warn');
    if (w.active) {
      const qty = (w.stock && w.stock.qty) || 0;
      if (qty > 0) { const m = SA.modal({ title: 'لا يمكن تعطيل «' + w.name + '»', icon: 'alert', danger: true, size: 'sm', body: h('div.sap-confirm', {}, SA.alert('danger', 'فيه رصيد في المخزن: ', h('b.num', {}, SA.fmt.num(qty)), ' ' + (unitLabel[w.stock.unit] || w.stock.unit), ' (بيانات تجريبية).'), h('p.t-muted', {}, 'انقل الرصيد لمخزن آخر أو صفّره بإذن مخزني (ST-) ثم عطّل المخزن.')), foot: [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'فهمت')] }); return; }
      const r = await SA.confirm({ title: 'تعطيل مخزن «' + w.name + '»', danger: true, confirmLabel: 'تعطيل المخزن', reasonRequired: true, impact: ['المخزن هيختفي من قوائم الاختيار في الحركات الجديدة.', 'الرصيد صفر — لا أثر على الأرصدة.'] }); if (!r.ok) return;
      try { await SA.api(() => { st.patch('warehouses', w.id, { active: false }); SA.audit('WAREHOUSE.DISABLED', { target: { type: 'warehouse', id: w.id, label: w.name }, before: { active: true }, after: { active: false }, reason: r.reason }); }); } catch (e) { return SA.fail(e); }
      SA.toast('تم تعطيل المخزن', 'success');
    } else {
      try { await SA.api(() => { st.patch('warehouses', w.id, { active: true }); SA.audit('WAREHOUSE.ENABLED', { target: { type: 'warehouse', id: w.id, label: w.name }, before: { active: false }, after: { active: true } }); }); } catch (e) { return SA.fail(e); }
      SA.toast('تم تفعيل المخزن', 'success');
    }
  }
  function warehousesRender(root, ctx) {
    ctx.setCrumbs([{ label: 'المنظمة' }, { label: 'المخازن' }]);
    return mount(root, (host, retry) => {
      host.append(SA.pageHead({ title: 'المخازن', desc: 'منتجات تامة وخامات وتحت التشغيل. المسؤول ونطاق المستخدمين المسموحين بيتحدّثوا تلقائيًا، ولا تعطيل لمخزن فيه رصيد.', tags: [SA.tag('approved')], actions: [SA.btn({ label: 'مخزن جديد', icon: 'plus', kind: 'accent', perm: 'sa.warehouses.create', onClick: () => openWhForm(null) })] }));
      const table = SA.table({ rowId: 'id', pageSize: 10, caption: 'قائمة المخازن', rows: () => st.get('warehouses') || [], search: { placeholder: 'ابحث بالكود أو الاسم…', keys: ['code', 'name'] },
        filters: [{ key: 'type', label: 'النوع', options: Object.keys(WTYPE).map((k) => [k, WTYPE[k]]) }, { key: 'active', label: 'الحالة', options: [['1', 'مفعّل'], ['0', 'معطّل']], test: (r, v) => (v === '1') === !!r.active }],
        columns: [{ key: 'code', label: 'الكود', sort: true, render: (w) => h('code', {}, w.code) }, { key: 'name', label: 'المخزن', sort: true, render: (w) => h('b', {}, w.name) }, { key: 'type', label: 'النوع', sort: true, render: (w) => SA.chip(WTYPE[w.type] || w.type, 'info') },
          { key: 'managerId', label: 'المسؤول', render: (w) => (SA.userById(w.managerId) ? SA.userCell(SA.userById(w.managerId)) : '—') }, { key: 'users', label: 'مستخدمون مسموحون', value: (w) => whUsers(w.id).length, render: (w) => h('span.num', {}, whUsers(w.id).length) },
          { key: 'stock', label: 'الرصيد', value: (w) => (w.stock && w.stock.qty) || 0, sort: true, render: (w) => (w.stock && w.stock.qty > 0 ? h('span', {}, h('b.num', {}, SA.fmt.num(w.stock.qty)), ' ', unitLabel[w.stock.unit] || w.stock.unit, SA.demoValue('تجريبي')) : h('span.t-muted', {}, 'فارغ')) }, { key: 'active', label: 'الحالة', render: (w) => SA.chip(w.active ? 'مفعّل' : 'معطّل', w.active ? 'success' : 'neutral') }],
        rowActions: (w) => [{ label: 'تعديل', icon: 'edit', onClick: () => openWhForm(w), disabled: SA.can('sa.warehouses.edit') ? false : NOPERM }, { divider: true }, w.active ? { label: 'تعطيل', icon: 'userx', danger: true, onClick: () => toggleWh(w), disabled: SA.can('sa.warehouses.disable') ? false : NOPERM } : { label: 'تفعيل', icon: 'check', onClick: () => toggleWh(w), disabled: SA.can('sa.warehouses.disable') ? false : NOPERM }],
        onRowClick: (w) => openWhForm(w), empty: { icon: 'warehouse', title: 'لا توجد مخازن', text: 'أنشئ أول مخزن.', action: { label: 'مخزن جديد', perm: 'sa.warehouses.create', onClick: () => openWhForm(null) } }, onRetry: retry });
      host.append(h('div.card.card-flush.sap-listcard', {}, table.el));
      const offs = ['warehouses', 'users'].map((p) => st.subscribe(p, () => table.refresh())); return () => offs.forEach((f) => f());
    }, { skel: 'table' });
  }
  SA.register({ id: 'warehouses', group: 'org', title: 'المخازن', icon: 'warehouse', route: 'warehouses', perm: 'sa.warehouses.view', order: 40, desc: 'المخازن والمسؤولون والأرصدة', render: warehousesRender });

  /* ═══════════════════════ SA-11 · العملة والوحدات ═══════════════════════ */
  function fmtMoney(n, f) {
    f = f || {}; const d = f.decimals == null ? 0 : f.decimals; const sep = f.thousands === 'none' ? '' : (f.thousands || ','); const parts = Math.abs(n).toFixed(d).split('.'); parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep || '');
    const s = parts.join('.'); return f.symbolPosition === 'before' ? 'ج.م ' + s : s + ' ج.م';
  }
  function currencyRender(root, ctx) {
    ctx.setCrumbs([{ label: 'المنظمة' }, { label: 'العملة والوحدات' }]);
    return mount(root, (host) => {
      host.append(SA.pageHead({ title: 'العملة والوحدات', desc: 'جنيه مصري فقط في v1. المبالغ تُخزَّن مع كود العملة والرمز يُعرض في طبقة العرض، فالهيكل يسمح بعملات لاحقًا.', tags: [SA.tag('approved', 'EGP Approved'), SA.tag('pending', 'الوحدات Pending بند 6')] }));
      const f0 = (st.get('settings.general') || {}).currencyFormat || { decimals: 0, thousands: ',', symbolPosition: 'after' };
      const dec = SA.form.field({ name: 'decimals', label: 'الخانات العشرية', type: 'select', value: String(f0.decimals), options: [['0', '0 — بدون كسور'], ['2', '2 — قرشان']] });
      const th = SA.form.field({ name: 'thousands', label: 'فاصل الآلاف', type: 'select', value: f0.thousands, options: [[',', 'فاصلة (,)'], ['.', 'نقطة (.)'], [' ', 'مسافة'], ['none', 'بدون']] });
      const pos = SA.form.field({ name: 'symbolPosition', label: 'مكان الرمز', type: 'select', value: f0.symbolPosition, options: [['after', 'بعد الرقم'], ['before', 'قبل الرقم']] });
      const prev = h('div.sap-org-fmt', { 'aria-live': 'polite' }); const cur = () => ({ decimals: +dec.get(), thousands: th.get(), symbolPosition: pos.get() });
      const upd = () => { prev.textContent = fmtMoney(1234567.891, cur()); saveBtn.disabled = JSON.stringify(cur()) === JSON.stringify(((st.get('settings.general') || {}).currencyFormat) || f0); };
      const saveBtn = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
        if (!SA.can('sa.company.edit')) return SA.toast(NOPERM + ' (sa.company.edit)', 'warn'); const before = clone((st.get('settings.general') || {}).currencyFormat); const after = cur();
        try { await SA.api(() => { st.update('settings.general', (g) => { g.currencyFormat = after; }); SA.audit('SETTINGS.CHANGED', { target: { type: 'settings', id: 'currencyFormat', label: 'تنسيق العملة' }, before, after }); }); } catch (e) { return SA.fail(e); } SA.toast('تم حفظ التنسيق', 'success'); upd();
      } }, 'حفظ التنسيق');
      [dec, th, pos].forEach((f) => (f.input.addEventListener('change', upd))); upd();
      host.append(h('div.sap-grid-2', {},
        SA.card({ title: 'العملة', actions: [SA.chip('EGP · جنيه مصري', 'success')] }, h('p.t-muted', {}, 'العملة الوحيدة في v1 (Approved — بند 7). إضافة عملة غير متاحة الآن لكن الهيكل جاهز لها.'), h('div.sap-formgrid', {}, dec.el, th.el, pos.el), h('p.t-caption', {}, 'معاينة: '), prev, h('div.cluster', { style: { marginBlockStart: '12px' } }, saveBtn, SA.btn({ label: 'إضافة عملة', icon: 'plus', kind: 'ghost', reason: 'غير متاح في v1 — العملة EGP فقط (بند 7)', onClick: () => {} }))),
        SA.card({ title: 'الوحدات', actions: [SA.tag('pending', 'Pending بند 6')] }, h('div.table-wrap', {}, h('table.table.sap-org-units', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الكود'), h('th', {}, 'الاسم'), h('th', {}, 'الاستخدام'))), h('tbody', {}, [['pcs', 'قطعة', 'أبواب وإكسسوارات'], ['m²', 'متر مربع', 'بالمساحة (تجاليد…)'], ['kg', 'كيلوجرام', 'خامات']].map((u) => h('tr', {}, h('td', {}, h('code', {}, u[0])), h('td', {}, u[1]), h('td', {}, u[2])))))))),
        SA.card({ title: 'قواعد تحويل الوحدات', class: 'sap-org-locked', actions: [SA.tag('open', 'Open بند 6'), SA.chip('معطّلة', 'neutral')] }, SA.alert('info', 'جدول لكل منتج (م² ↔ قطعة للتجاليد مثلًا). القواعد Open (بند 6) — الهيكل فقط حتى تُحسم.'),
          h('div.table-wrap', {}, h('table.table', { 'aria-disabled': 'true' }, h('thead', {}, h('tr', {}, ['المنتج', 'من وحدة', 'إلى وحدة', 'معامل التحويل'].map((t) => h('th', {}, t)))), h('tbody', {}, h('tr', {}, h('td', { colspan: 4 }, SA.empty({ icon: 'swap', title: 'لا توجد قواعد تحويل', text: 'متاحة بعد حسم بند 6 مع التشغيل.' })))))), h('div', { style: { marginBlockStart: '10px' } }, SA.btn({ label: 'إضافة قاعدة تحويل', icon: 'plus', kind: 'ghost', size: 'sm', reason: 'معطّلة حتى حسم بند 6', onClick: () => {} }))));
    }, { skel: 'form' });
  }
  SA.register({ id: 'currency', group: 'org', title: 'العملة والوحدات', icon: 'coins', route: 'currency', perm: 'sa.company.view', order: 50, desc: 'EGP والوحدات وقواعد التحويل', render: currencyRender });

  /* ───────────────────────── Test Lab missions ───────────────────────── */
  SA.missions.add({ id: 'M-C1', area: 'org', title: 'أنشئ قسمًا وغيّر مديره', persona: 'owner', route: 'departments', est: '3 د', goal: 'أنشئ قسمًا جديدًا ثم غيّر مديره وشوف أثر «نطاق الفريق»، وجرّب تعطيل قسم فيه مستخدمين (ممنوع بالعدد).',
    steps: [{ text: 'افتح الأقسام وأنشئ قسمًا جديدًا', route: 'departments', audit: 'DEPT.CREATED' }, { text: 'عدّل مدير قسم قائم وأكّد نقل المرؤوسين', audit: 'DEPT.UPDATED' }, { text: 'جرّب تعطيل «المبيعات» لترى الرفض بالعدد' }], detect: [{ audit: 'DEPT.CREATED' }, { audit: 'DEPT.UPDATED' }] });
  SA.missions.add({ id: 'M-C2', area: 'org', title: 'أخفِ موديول HR وشوف المساحة تختفي ثم أعدها', persona: 'owner', route: 'modules', est: '4 د', goal: 'من الموديولات أخفِ «الموارد البشرية» بسبب وStep-up، لاحظ اختفاء مساحة HR، افتح #/hr/dashboard لترى «الموديول معطّل»، ثم فعّله من جديد.',
    steps: [{ text: 'أخفِ موديول الموارد البشرية', route: 'modules', audit: 'MODULE.TOGGLED' }, { text: 'افتح لوحة HR بالرابط المباشر وشوف الحجب', route: 'hr-dashboard' }, { text: 'فعّل الموديول من جديد' }], detect: [{ audit: 'MODULE.TOGGLED' }, { route: 'hr-dashboard' }] });
  SA.missions.add({ id: 'M-C3', area: 'org', title: 'أكمل بيانات الشركة وارفع الختم', persona: 'owner', route: 'company', est: '4 د', goal: 'عدّل البيانات الرسمية (Step-up)، ارفع PNG كختم، وراقب لوحة الجاهزية.',
    steps: [{ text: 'عدّل الرقم الضريبي والعنوان واحفظ', route: 'company', audit: 'COMPANY.UPDATED' }, { text: 'من تبويب الختم ارفع ملف PNG', audit: 'COMPANY.SEAL_UPLOADED' }], detect: [{ audit: 'COMPANY.UPDATED' }, { audit: 'COMPANY.SEAL_UPLOADED' }] });
  SA.missions.add({ id: 'M-C4', area: 'org', title: 'عطّل مخزنًا (فيه رصيد ثم فاضي)', persona: 'owner', route: 'warehouses', est: '3 د', goal: 'جرّب تعطيل مخزن فيه رصيد (ممنوع)، ثم أنشئ مخزنًا جديدًا وعطّله.',
    steps: [{ text: 'جرّب تعطيل «مخزن المنتج التام»' }, { text: 'أنشئ مخزنًا جديدًا', audit: 'WAREHOUSE.CREATED' }, { text: 'عطّل المخزن الجديد', audit: 'WAREHOUSE.DISABLED' }], detect: [{ audit: 'WAREHOUSE.CREATED' }, { audit: 'WAREHOUSE.DISABLED' }] });
})();
