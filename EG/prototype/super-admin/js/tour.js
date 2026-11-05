/* EG Super Admin prototype — tour.js  (وضع الاختبار / Test Lab)
   Floating button + side panel: missions (auto-detected from audit events / routes / tracked events), persona switcher,
   simulate states (slow, server error, offline, idle lock, permissions change, session expiry), notes capture/export,
   reset demo, documentation-badge toggle, density toggle. API: SA.tour.open/close/toggle */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const T = (SA.tour = {});
  let panel = null, fab = null, tabId = 'missions', body = null, picking = false, pickDraft = '';
  const draft = { text: '', rating: 0, selector: '' };

  /* ───────────────────────── mission engine ───────────────────────── */
  const prog = () => st.get('tour.progress') || {};
  const matchWhere = (e, w) => !w || Object.keys(w).every((k) => e[k] === w[k]);
  function clauseOk(m, c, pr) {
    if (c.audit) { const t0 = new Date(pr.startedAt).getTime(); return (st.get('audit') || []).some((e) => e.code === c.audit && new Date(e.ts).getTime() >= t0 && matchWhere(e, c.where)); }
    if (c.event) return !!(pr.ev && pr.ev[c.event]);
    if (c.route) return !!(pr.ev && pr.ev['route:' + c.route]);
    return false;
  }
  T.state = function (m) { const pr = prog()[m.id]; if (!pr || !pr.startedAt) return { s: 'idle', steps: m.steps.map(() => false) }; return { s: pr.doneAt ? 'done' : 'active', steps: m.steps.map((x) => !!(pr.doneAt || ((x.audit || x.event || x.route) && clauseOk(m, x, pr)))) }; };
  function scan() {
    let changed = false;
    SA.missions.list.forEach((m) => { const pr = prog()[m.id]; if (!pr || !pr.startedAt || pr.doneAt) return; if (m.detect.every((c) => clauseOk(m, c, pr))) { st.update('tour.progress', (p) => { p[m.id].doneAt = new Date().toISOString(); }); changed = true; SA.toast('أنجزت المهمة: ' + m.title, 'success', { ms: 6000 }); } });
    if (changed && body && panel && !panel.hidden) drawBody();
    else if (body && panel && !panel.hidden && tabId === 'missions') drawBody(true);
  }
  SA.on('audit', scan);
  SA.on('track', (e) => { const p = prog(); let any = false; st.update('tour.progress', (pp) => { Object.keys(pp).forEach((id) => { const pr = pp[id]; if (pr.startedAt && !pr.doneAt) { pr.ev = pr.ev || {}; if (!pr.ev[e.name]) { pr.ev[e.name] = e.ts; any = true; } } }); }); if (any) scan(); });
  async function startMission(m) {
    st.update('tour.progress', (p) => { p[m.id] = { startedAt: new Date().toISOString(), ev: {} }; });
    const cur = SA.session.personaId;
    if (m.persona && SA.session.isAuthed && cur !== m.persona) { if (!SA.auth.loginAs(m.persona)) { /* stays as current persona */ } }
    else if (m.persona && !SA.session.isAuthed) { SA.nav('login?as=' + m.persona); close(); SA.toast('سجّل الدخول (' + SA.catalog.personas[m.persona].label + ') لتبدأ المهمة.', 'info'); drawBody(); return; }
    const mod = SA.moduleById(m.route) || null; SA.nav(mod ? mod.route : m.route); drawBody();
  }

  /* ───────────────────────── panel tabs ───────────────────────── */
  function missionsTab(host, soft) {
    const list = SA.missions.list; const done = list.filter((m) => T.state(m).s === 'done').length;
    const areaSel = h('select.select', { 'aria-label': 'تصفية بالمجال', onchange: (e) => { T.area = e.target.value; drawBody(); } }, h('option', { value: '' }, 'كل المجالات'), Object.keys(SA.missions.areas).map((k) => h('option', { value: k, selected: T.area === k }, SA.missions.areas[k])));
    host.append(h('div.sap-tl-progress', {}, h('div', {}, h('b.num', {}, done + ' / ' + list.length), h('span.t-muted', {}, ' مهمة منجزة')), h('div.progress', {}, h('span', { style: { '--value': (list.length ? Math.round(done / list.length * 100) : 0) + '%' } }))), areaSel);
    list.filter((m) => !T.area || m.area === T.area).forEach((m) => {
      const s = T.state(m); const per = SA.catalog.personas[m.persona];
      host.append(h('article.sap-mission.is-' + s.s, {}, h('div.sap-mission-top', {}, h('span.sap-mid', {}, m.id), h('b', {}, m.title)), h('div.cluster.sap-mission-meta', {}, SA.chip(SA.missions.areas[m.area] || m.area, 'info'), per ? h('span.chip.chip-plain', {}, SA.icon('user', 'icon-sm'), per.label) : null, h('span.t-caption', {}, m.est), m.phase2 ? h('span.sap-p2', {}, 'يكتمل بعد Phase 2') : null),
        h('p.t-muted', {}, m.goal), h('ol.sap-msteps', {}, m.steps.map((x, i) => h('li' + (s.steps[i] ? '.is-ok' : ''), {}, SA.icon(s.steps[i] ? 'checkcircle' : 'clock', 'icon-sm'), x.text))),
        h('div.cluster', {}, s.s === 'done' ? h('span.chip.chip-success', {}, 'منجزة') : s.s === 'active' ? h('span.chip.chip-warning', {}, 'جارية — بتتتبع تلقائيًا') : null,
          h('button.btn.btn-sm.' + (s.s === 'idle' ? 'btn-primary' : 'btn-ghost'), { type: 'button', onclick: () => startMission(m) }, SA.icon(s.s === 'idle' ? 'play' : 'refresh', 'icon-sm'), s.s === 'idle' ? 'ابدأ' : s.s === 'done' ? 'أعد المحاولة' : 'متابعة'),
          s.s !== 'idle' ? h('button.sap-linkbtn', { type: 'button', onclick: () => { st.update('tour.progress', (p) => { delete p[m.id]; }); drawBody(); } }, 'تصفير') : null)));
    });
  }
  function personaTab(host) {
    const users = st.get('users') || []; const cur = SA.session.personaId;
    host.append(h('p.t-muted', {}, 'بدّل الشخصية فورًا من غير ما تخرج من التدفق — البيانات كما هي. الحسابات المعطّلة/الموقوفة مش هتدخل.'));
    [['sa', 'Super Admin'], ['hr', 'الموارد البشرية']].forEach((grp) => {
      host.append(h('h4.sap-sub', {}, grp[1]));
      host.append(h('div.sap-persona-list', {}, Object.keys(SA.catalog.personas).filter((pid) => ((SA.catalog.personas[pid].area || 'sa') === grp[0])).map((pid) => { const u = users.find((x) => x.persona === pid); if (!u) return null; const p = SA.catalog.personas[pid];
        return h('button.sap-persona' + (cur === pid ? '.is-picked' : ''), { type: 'button', 'aria-pressed': String(cur === pid), onclick: () => { if (SA.auth.loginAs(pid)) drawBody(); } }, SA.avatar(u.name), h('span', {}, h('b', {}, p.label), h('small', {}, u.name + ' · ' + p.desc), u.status !== 'active' ? h('small.is-bad', {}, u.status === 'disabled' ? 'معطّل' : u.status === 'locked' ? 'موقوف' : 'بانتظار التفعيل') : null), cur === pid ? SA.chip('الحالي', 'success') : null); })));
    });
  }
  function simTab(host) {
    const sw = (label, hint, get, set) => { const inp = h('input', { type: 'checkbox', checked: get(), onchange: (e) => { set(e.target.checked); } }); return h('div.setting-row', {}, h('div', {}, h('b', {}, label), h('small', {}, hint)), h('label.switch', {}, inp, h('span'))); };
    const idle = h('input.input.num', { type: 'number', min: 5, placeholder: 'ثواني (مثلاً 20)', value: st.get('tour.idleOverrideSec') || '', 'aria-label': 'مهلة الخمول التجريبية بالثواني' });
    host.append(h('div.card.card-flush', {}, sw('شبكة بطيئة', 'كل الطلبات المحاكاة تأخذ عدة ثوانٍ (لاختبار الـloading).', () => SA.sim.slow, (v) => { SA.sim.slow = v; SA.toast(v ? 'البطء شغّال' : 'البطء متوقف', 'info'); }), sw('Offline', 'التحميل والتنفيذ يفشلان (شاشة خطأ + إعادة محاولة).', () => SA.sim.offline, (v) => { SA.sim.offline = v; }), sw('خطأ في الإجراء القادم', 'أول إجراء يغيّر بيانات يفشل مرة واحدة برسالة عربي.', () => SA.sim.error, (v) => { SA.sim.error = v; })),
      h('h4.sap-sub', {}, 'حالات الجلسة'),
      h('div.sap-simbtns', {}, SA.btn({ label: 'قفل الخمول الآن', icon: 'lock', kind: 'ghost', onClick: () => { if (!SA.session.isAuthed) { SA.toast('سجّل الدخول أولًا', 'warn'); return; } SA.auth.lock('تم تفعيل قفل الخمول من وضع الاختبار.'); } }),
        SA.btn({ label: 'تغيّر الصلاحيات أثناء الجلسة (UC-GLB-05)', icon: 'shield', kind: 'ghost', onClick: () => { const r = SA.session.role; if (!r) { SA.toast('سجّل الدخول أولًا', 'warn'); return; } SA.rbac.bump(r.id); SA.audit('ROLE.UPDATED', { actor: { id: 'SYSTEM', name: 'محاكاة (Test Lab)', roleId: null }, target: { type: 'role', id: r.id, label: r.nameAr }, reason: 'محاكاة تغيّر صلاحيات أثناء الجلسة', via: 'system' }); SA.toast('اتغيّرت صلاحيات دورك — راجع البانر أعلى الشاشة', 'info'); } }),
        SA.btn({ label: 'انتهاء الجلسة (إنهاء من الإدارة)', icon: 'logout', kind: 'ghost', onClick: () => { const s = SA.session.data; if (!s.sessionId) { SA.toast('سجّل الدخول أولًا', 'warn'); return; } st.patch('sessions', s.sessionId, { status: 'revoked', revokedAt: new Date().toISOString(), revokedBy: 'SYSTEM' }); SA.toast('اتلغت جلستك — هتخرج خلال ثواني', 'warn'); } })),
      h('label.field', {}, h('span.label', {}, 'مهلة الخمول التجريبية (ثواني) — فاضي = السياسة'), h('div.cluster', {}, idle, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { st.set('tour.idleOverrideSec', idle.value ? Number(idle.value) : null); SA.toast(idle.value ? 'الخمول بعد ' + idle.value + ' ثانية' : 'رجعنا لسياسة الأمان', 'info'); } }, 'تطبيق'))),
      SA.alert('info', 'مدة الخمول في السياسة: ', st.get('settings.security.idleMinutes') ? SA.demoValue(st.get('settings.security.idleMinutes') + ' دقيقة') : SA.openValue()));
  }
  function selectorOf(el) {
    if (el.id) return '#' + el.id; const parts = []; let n = el;
    while (n && n.nodeType === 1 && parts.length < 4 && n.tagName !== 'BODY') { let p = n.tagName.toLowerCase(); const c = (n.className && typeof n.className === 'string' ? n.className.trim().split(/\s+/).filter((x) => x && x.indexOf('sap-pick') < 0).slice(0, 2) : []); if (c.length) p += '.' + c.join('.'); parts.unshift(p); if (n.id) break; n = n.parentElement; }
    return parts.join(' > ');
  }
  function startPick() {
    picking = true; panel.classList.add('is-picking'); document.body.classList.add('sap-picking'); let last = null; SA.toast('اضغط على أي عنصر في الشاشة لالتقاطه (Esc للإلغاء)', 'info');
    const inPanel = (e) => panel.contains(e.target) || fab.contains(e.target);
    const mv = (e) => { if (inPanel(e)) return; if (last) last.classList.remove('sap-pick-hl'); last = e.target; last.classList.add('sap-pick-hl'); };
    const stop = () => { picking = false; document.body.classList.remove('sap-picking'); panel.classList.remove('is-picking'); if (last) last.classList.remove('sap-pick-hl'); document.removeEventListener('mouseover', mv, true); document.removeEventListener('click', ck, true); document.removeEventListener('keydown', ky, true); };
    const ck = (e) => { if (inPanel(e)) return; e.preventDefault(); e.stopPropagation(); draft.selector = selectorOf(e.target); stop(); tabId = 'notes'; setPanel(true); };
    const ky = (e) => { if (e.key === 'Escape') { e.stopPropagation(); stop(); setPanel(true); } };
    document.addEventListener('mouseover', mv, true); document.addEventListener('click', ck, true); document.addEventListener('keydown', ky, true); setPanel(false);
  }
  function notesMd(notes) {
    return '# ملاحظات اختبار Super Admin + HR\n\n' + notes.map((n, i) => '## ' + (i + 1) + '. ' + n.route + '\n- الشخصية: ' + n.persona + '\n- التقييم: ' + (n.rating || '—') + '/5\n- الوقت: ' + SA.fmt.iso(n.ts) + '\n' + (n.selector ? '- العنصر: `' + n.selector + '`\n' : '') + '\n' + n.text + '\n').join('\n');
  }
  function notesTab(host) {
    const ta = h('textarea.textarea', { rows: 3, placeholder: 'اكتب ملاحظتك على الشاشة الحالية…', 'aria-label': 'نص الملاحظة', value: draft.text, oninput: (e) => { draft.text = e.target.value; } });
    const stars = h('div.sap-stars', { role: 'radiogroup', 'aria-label': 'التقييم' }, [1, 2, 3, 4, 5].map((n) => h('button.sap-star' + (draft.rating >= n ? '.is-on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(draft.rating === n), 'aria-label': n + ' من 5', onclick: () => { draft.rating = draft.rating === n ? 0 : n; drawBody(); } }, SA.icon('star'))));
    const notes = st.get('tour.notes') || [];
    host.append(h('div.sap-notebox', {}, h('div.sap-note-ctx', {}, h('span', {}, 'الشاشة: ', h('code', {}, location.hash || '#/')), h('span', {}, 'الشخصية: ', h('b', {}, SA.session.user ? SA.session.user.name : 'غير مسجّل'))), ta, h('div.cluster', {}, stars, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: startPick }, SA.icon('cursor', 'icon-sm'), 'التقط عنصرًا')), draft.selector ? h('div.sap-sel', {}, SA.icon('target', 'icon-sm'), h('code', {}, draft.selector), h('button.sap-linkbtn', { type: 'button', onclick: () => { draft.selector = ''; drawBody(); } }, 'إزالة')) : null,
      h('button.btn.btn-primary', { type: 'button', onclick: () => { if (!draft.text.trim()) { SA.toast('اكتب نص الملاحظة', 'warn'); ta.focus(); return; } st.update('tour.notes', (l) => { l.unshift({ id: SA.uid('NT'), ts: new Date().toISOString(), route: location.hash || '#/', persona: SA.session.user ? SA.session.user.name + ' (' + (SA.session.personaId || '-') + ')' : 'غير مسجّل', text: draft.text.trim(), rating: draft.rating, selector: draft.selector }); }); draft.text = ''; draft.rating = 0; draft.selector = ''; SA.toast('تم حفظ الملاحظة', 'success'); drawBody(); } }, 'أضف ملاحظة على هذه الشاشة')),
      h('div.sap-sub-row', {}, h('h4.sap-sub', {}, 'الملاحظات (' + notes.length + ')'), notes.length ? h('div.cluster', {}, h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => SA.download('sa-prototype-notes.md', notesMd(notes), 'text/markdown') }, 'Markdown'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => SA.download('sa-prototype-notes.json', JSON.stringify(notes, null, 2), 'application/json') }, 'JSON'), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => SA.copy(notesMd(notes)).then(() => SA.toast('تم النسخ للحافظة', 'success')) }, SA.icon('copy', 'icon-sm'), 'نسخ')) : null),
      notes.length ? h('ul.sap-notes', {}, notes.map((n) => h('li', {}, h('div.sap-note-top', {}, h('code', {}, n.route), h('span.t-caption', {}, SA.fmt.dt(n.ts)), n.rating ? h('span.sap-rate', {}, '★ ' + n.rating) : null, h('button.sap-x', { type: 'button', 'aria-label': 'حذف الملاحظة', onclick: () => { st.update('tour.notes', (l) => l.filter((x) => x.id !== n.id)); drawBody(); } }, SA.icon('x', 'icon-sm'))), h('p', {}, n.text), h('small.t-muted', {}, n.persona, n.selector ? ' · ' + n.selector : '')))) : h('p.t-muted', {}, 'لا توجد ملاحظات بعد.'));
  }
  function toolsTab(host) {
    const ui = st.get('ui') || {};
    host.append(h('div.card.card-flush', {}, h('div.setting-row', {}, h('div', {}, h('b', {}, 'إظهار شارات التوثيق'), h('small', {}, 'Approved / Pending / Open / New — تُشال من الإنتاج (BR-GLB-03).')), h('label.switch', {}, h('input', { type: 'checkbox', checked: ui.showTags !== false, onchange: (e) => { st.set('ui.showTags', e.target.checked); SA.applyUi(); } }), h('span'))),
      h('div.setting-row', {}, h('div', {}, h('b', {}, 'الكثافة'), h('small', {}, 'مريحة أو مدمجة (للجداول الكبيرة).')), SA.segmented([['comfortable', 'مريحة'], ['compact', 'مدمجة']], ui.density || 'comfortable', (v) => { st.set('ui.density', v); SA.applyUi(); }))),
      h('h4.sap-sub', {}, 'البيانات'), h('div.sap-simbtns', {}, SA.btn({ label: 'إعادة ضبط بيانات النموذج', icon: 'refresh', kind: 'danger', onClick: async () => { const r = await SA.confirm({ title: 'إعادة ضبط كل البيانات؟', danger: true, confirmLabel: 'إعادة الضبط', impact: ['كل الإجراءات والملاحظات وتقدّم المهام هتتمسح.', 'ترجع البيانات التجريبية الأصلية.'] }); if (r.ok) SA.resetDemo(); } })),
      SA.alert('info', 'التخزين: ', st.hasLocalStorage ? 'localStorage (' + 'eg.sa.proto.v1' + ')' : 'ذاكرة فقط (المتصفح يمنع localStorage)', '. لا اتصال بخادم.'), h('p.t-caption', {}, 'اختصارات: Ctrl/⌘+K بحث · ? قائمة الاختصارات · Esc إغلاق.'));
  }
  function drawBody(soft) {
    if (!body) return; const sx = body.scrollTop; SA.clear(body);
    ({ missions: missionsTab, personas: personaTab, sim: simTab, notes: notesTab, tools: toolsTab })[tabId](body, soft); body.scrollTop = sx;
  }
  function build() {
    const tabs = SA.tabs({ label: 'وضع الاختبار', active: tabId, tabs: [{ id: 'missions', label: 'المهام', icon: 'target' }, { id: 'personas', label: 'الشخصيات', icon: 'users' }, { id: 'sim', label: 'محاكاة', icon: 'bolt' }, { id: 'notes', label: 'ملاحظات', icon: 'note' }, { id: 'tools', label: 'أدوات', icon: 'settings' }], onChange: (id) => { tabId = id; drawBody(); } });
    body = h('div.sap-tl-body');
    panel = h('aside.sap-tl-panel', { role: 'complementary', 'aria-label': 'وضع الاختبار', hidden: true }, h('header.sap-tl-head', {}, h('div', {}, h('b', {}, 'وضع الاختبار / Test Lab'), h('small', {}, 'نموذج تجريبي — لا يتصل بخادم')), h('button.sap-x', { type: 'button', 'aria-label': 'إغلاق', onclick: close }, SA.icon('x'))), tabs.el, body);
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !SA.layers.count) { e.stopPropagation(); close(); fab.focus(); } });
    T._tabs = tabs;
  }
  function setPanel(open) { if (!panel) return; panel.hidden = !open; fab.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('sap-tl-open', open); st.set('tour.open', open); if (open) { T._tabs.setActive(tabId); drawBody(); } }
  function close() { setPanel(false); }
  T.open = (tab) => { if (tab) tabId = tab; setPanel(true); }; T.close = close; T.toggle = () => setPanel(panel.hidden);
  T.mount = function () {
    if (fab) return; build();
    fab = h('button.sap-tl-fab', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'وضع الاختبار (Test Lab)', onclick: () => T.toggle() }, SA.icon('flask'), h('span', {}, 'وضع الاختبار'));
    document.body.append(fab, panel);
    SA.on('login', () => { if (!panel.hidden) drawBody(); }); SA.on('missions', () => { if (!panel.hidden) drawBody(); });
    st.subscribe('tour.sim', () => { if (!panel.hidden && tabId === 'sim') drawBody(); });
    if (st.get('tour.open')) setPanel(true);
  };
})();
