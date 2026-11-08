/* EG Super Admin prototype — mod-roles.js  (SA-02 الأدوار والصلاحيات)
   Route: #/roles (list+detail) · #/roles/R-03?tab=matrix|scope|sensitive|sa|members · #/roles/compare?a=R-03&b=R-04
   Shared (also used by mod-scope.js): SA.rbac.draft(roleId) / dirty / touch / onDraft / reset / commit / renderMatrix / viewAs / compareView */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store, C = SA.catalog, R = SA.rbac;
  const NOPERM = 'ليست من صلاحياتك';

  /* ───────────────────────── drafts (unsaved edits shared between role tabs and the scope screen) ───────────────────────── */
  const drafts = {}; const listeners = [];
  R.onDraft = (cb) => { listeners.push(cb); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; };
  R.touch = (roleId) => listeners.slice().forEach((f) => f(roleId));
  /** Draft {roleId, version, base, cur} for a role (recreated when someone else saved a newer version). */
  R.draft = function (roleId) {
    const role = SA.roleById(roleId); if (!role) return null; let d = drafts[roleId];
    if (!d || d.version !== (role.version || 1)) { d = drafts[roleId] = { roleId, version: role.version || 1, base: R.permsOf(role), cur: R.permsOf(role) }; }
    return d;
  };
  R.draftDiff = (roleId) => { const d = R.draft(roleId); return d ? R.diff(d.base, d.cur) : { total: 0, matrix: [], scope: [], sensitive: [], sa: [] }; };
  R.dirty = (roleId) => R.draftDiff(roleId).total > 0;
  R.dirtyRoles = () => Object.keys(drafts).filter((id) => SA.roleById(id) && R.dirty(id));
  R.reset = (roleId) => { delete drafts[roleId]; R.touch(roleId); };
  const readonlyReason = (role) => (role.isProtected ? 'دور Super Admin محمي (is_protected): للعرض فقط — لا تعديل ولا حذف (BR-ROL-01).' : !SA.can('sa.roles.edit') ? NOPERM + ' (sa.roles.edit)' : '');
  R.readonlyReason = readonlyReason;
  const flatCells = (list) => { const o = {}; list.forEach((c) => { o[R.resLabel(c.res) + ' · ' + R.actLabel(c.action)] = c.to ? 'مفعّل' : 'غير مفعّل'; }); return o; };

  /** Save a draft: diff dialog → (reason if sensitive) → Step-up → apply → audit → notify members. Resolves true when saved. */
  R.commit = async function (roleId) {
    const role = SA.roleById(roleId), d = R.draft(roleId); if (!role || !d) return false;
    const why = readonlyReason(role); if (why) { SA.toast(why, 'warn'); return false; }
    const diff = R.diff(d.base, d.cur); if (!diff.total) { SA.toast('لا توجد تغييرات للحفظ', 'info'); return false; }
    const sent = R.sentences(diff); const members = R.members(roleId).filter((u) => u.status === 'active');
    const sections = [['matrix', 'المصفوفة'], ['scope', 'نطاق البيانات'], ['sensitive', 'الصلاحيات الحساسة'], ['sa', 'صلاحيات الإدارة']];
    const reasonEl = h('textarea.textarea', { rows: 2, placeholder: diff.sensitive.length ? 'سبب منح/سحب الصلاحية الحساسة (إلزامي)…' : 'سبب التعديل (اختياري)…', 'aria-label': 'سبب التعديل' });
    const need = diff.sensitive.length > 0; let okBtn;
    const body = h('div.sap-diffsum', {}, h('p', {}, 'راجع الفروقات قبل الحفظ على دور ', h('b', {}, role.nameAr), '. ', members.length ? 'هيتأثر ' + members.length + ' مستخدم نشط فورًا (بانر «تم تحديث صلاحياتك»).' : 'لا يوجد مستخدمون نشطون على الدور حاليًا.'),
      sections.map((s) => { const items = sent.filter((x) => x.section === s[0]); return items.length ? h('div.sap-diffgroup', {}, h('h4', {}, s[1], h('span.sap-count', {}, items.length)), h('ul', {}, items.map((x) => h('li.is-' + x.kind + (x.danger ? '.is-danger' : ''), {}, h('span.sap-dd', {}, x.kind === 'add' ? '+' : x.kind === 'remove' ? '−' : '↔'), x.text)))) : null; }),
      diff.sensitive.some((x) => x.to) ? SA.alert('warning', h('b', {}, 'تنبيه: '), diff.sensitive.filter((x) => x.to).map((x) => (C.sensitive.find((s) => s.key === x.key) || {}).warn).join(' ')) : null,
      h('label.field', {}, h('span.label', {}, 'السبب', need ? h('span.req', {}, '*') : null), reasonEl), h('p.sap-audit-note', {}, SA.icon('lock', 'icon-sm'), 'هيطلب Step-up بعد التأكيد (UC-ROL-02) ويتسجّل في سجل التدقيق بقبل/بعد.'));
    const res = await new Promise((resolve) => {
      const m = SA.modal({ title: 'ملخص الفروقات قبل الحفظ (' + diff.total + ')', icon: 'compare', size: 'md', body,
        foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'رجوع للتعديل'), okBtn = h('button.btn.btn-primary', { type: 'button', onclick: () => { if (need && reasonEl.value.trim().length < 3) { reasonEl.focus(); reasonEl.classList.add('is-invalid'); SA.toast('اكتب سبب منح/سحب الصلاحية الحساسة', 'warn'); return; } m.close(true); } }, SA.icon('check', 'icon-sm'), 'تأكيد وطلب التحقق')] });
      m.closed.then((r) => resolve(!!r));
    });
    if (!res) return false; const reason = reasonEl.value.trim();
    const list = st.get('settings.security.stepUpActions') || [];
    const key = need && list.indexOf('role.sensitive') >= 0 ? 'role.sensitive' : 'role.update';
    if (!(await SA.stepUp(key, { text: 'تعديل صلاحيات «' + role.nameAr + '» عملية حساسة. أعد التحقق للمتابعة.' }))) return false;
    try {
      await SA.api(() => {
        const nowIso = new Date().toISOString(); const before = R.permsOf(role);
        st.update('roles', (l) => { const r = l.find((x) => x.id === roleId); r.matrix = SA.clone(d.cur.matrix); r.scope = Object.assign({}, d.cur.scope); r.sensitive = d.cur.sensitive.slice(); r.sa = d.cur.sa.slice(); r.version = (r.version || 1) + 1; r.updatedAt = nowIso; });
        const tgt = { type: 'role', id: roleId, label: role.nameAr };
        if (diff.matrix.length || diff.sa.length) { const bf = flatCells(diff.matrix.map((c) => Object.assign({}, c, { to: c.from }))); const af = flatCells(diff.matrix); diff.sa.forEach((c) => { bf[C.permLabel(c.key)] = c.from ? 'مفعّل' : 'غير مفعّل'; af[C.permLabel(c.key)] = c.to ? 'مفعّل' : 'غير مفعّل'; }); SA.audit('ROLE.UPDATED', { target: tgt, before: bf, after: af, reason, stepUp: true }); }
        if (diff.scope.length) { const bf = {}, af = {}; diff.scope.forEach((c) => { bf[R.resLabel(c.res)] = R.scopeLabel(c.from); af[R.resLabel(c.res)] = R.scopeLabel(c.to); }); SA.audit('ROLE.SCOPE_CHANGED', { target: tgt, before: bf, after: af, reason }); }
        if (diff.sensitive.length) { const bf = {}, af = {}; diff.sensitive.forEach((c) => { bf[c.key] = c.from; af[c.key] = c.to; }); SA.audit('ROLE.SENSITIVE_GRANTED', { target: tgt, before: bf, after: af, reason, severity: 'high' }); }
        delete drafts[roleId];
        if (members.length) SA.notify({ title: 'تم تحديث صلاحيات دور ' + role.nameAr, body: members.length + ' مستخدم تأثّروا. أعد تحميل الصلاحيات لتطبيق التغيير.', level: 'info', toUsers: members.map((u) => u.id), link: '' });
        SA.notify({ title: 'تعديل صلاحيات دور: ' + role.nameAr, body: diff.total + ' تغيير' + (need ? ' (يشمل صلاحية حساسة)' : ''), level: need ? 'action' : 'info', to: ['R-01', 'R-10'], link: '#/audit' });
      });
    } catch (e) { SA.fail(e); return false; }
    R.touch(roleId); SA.toast('تم حفظ صلاحيات «' + role.nameAr + '» (' + diff.total + ' تغيير)', 'success'); return true;
  };

  /* ───────────────────────── matrix component ───────────────────────── */
  /** R.renderMatrix(role, draft, opts{readonly}) → Node. Honors "view is a prerequisite", accent approve column, per-row scope selector. */
  R.renderMatrix = function (role, d, o) {
    o = o || {}; const ro = !!o.readonly; const mods = st.get('modules') || [];
    const head = h('thead', {}, h('tr', {}, h('th', {}, 'الموديول'), h('th', {}, 'النطاق'), C.actions.map((a) => h('th', { class: a[0] === 'approve' ? 'is-approve' : null }, a[1]))));
    const rows = []; let lastGroup = '';
    C.resources.forEach((r) => {
      if (r.group !== lastGroup) { lastGroup = r.group; rows.push(h('tr.perm-group', {}, h('td', { colspan: 8 }, r.group))); }
      const mod = mods.find((m) => m.key === r.moduleKey); const off = mod && !mod.enabled;
      if (r.locked) { rows.push(h('tr.is-off', {}, h('td', {}, h('div.mod', {}, h('b', {}, r.label), h('small', {}, r.sub))), h('td', { colspan: 7 }, h('span.sap-lockwhy', {}, SA.icon('lock', 'icon-sm'), r.locked)))); return; }
      const row = d.cur.matrix[r.id] || (d.cur.matrix[r.id] = R.emptyRow()); const baseRow = d.base.matrix[r.id] || R.emptyRow();
      const tr = h('tr', { class: off ? 'is-off' : null, dataset: { res: r.id } });
      const scopeCell = h('td', {});
      const drawScope = () => {
        SA.clear(scopeCell); const row2 = d.cur.matrix[r.id];
        if (!r.scoped) { scopeCell.append(h('span.sap-dash', {}, 'الكل')); return; }
        if (!row2.view) { scopeCell.append(h('span.sap-dash', {}, '—')); return; }
        const sel = h('select.select.sap-scopesel' + ((d.cur.scope[r.id] || 'own') !== (d.base.scope[r.id] || 'own') ? '.is-changed' : ''), { 'aria-label': 'نطاق ' + r.label, disabled: ro, title: C.scopeHelp[d.cur.scope[r.id] || 'own'], onchange: (e) => { d.cur.scope[r.id] = e.target.value; drawScope(); R.touch(role.id); } }, C.scopes.map((s) => h('option', { value: s[0], selected: (d.cur.scope[r.id] || 'own') === s[0] }, s[1])));
        scopeCell.append(sel);
      };
      tr.append(h('td', {}, h('div.mod', {}, h('b', {}, r.label, off ? h('span.sap-offtag', {}, 'الموديول معطّل') : null), h('small', {}, r.sub))), scopeCell);
      const boxes = {};
      C.actions.forEach((a) => {
        const act = a[0]; const inp = h('input', { type: 'checkbox', checked: !!row[act], disabled: ro || (act !== 'view' && !row.view), 'aria-label': r.label + ': ' + a[1], title: act !== 'view' && !row.view ? 'فعّل «عرض» أولًا — عرض شرط للباقي' : null, onchange: (e) => {
          const res = R.setCell(d.cur, r.id, act, e.target.checked);
          if (res.cleared.length) SA.toast('اتلغت تلقائيًا: ' + res.cleared.map(R.actLabel).join('، ') + ' (عرض شرط للباقي)', 'info');
          drawAll(); drawScope(); R.touch(role.id);
        } });
        boxes[act] = inp; tr.appendChild(h('td', { class: (!!row[act] !== !!baseRow[act]) ? 'is-changed' : null, dataset: { act } }, h('label.perm-cb' + (act === 'approve' ? '.is-approve' : ''), {}, inp, h('span'))));
      });
      function drawAll() { const rw = d.cur.matrix[r.id]; C.actions.forEach((a) => { const b = boxes[a[0]]; b.checked = !!rw[a[0]]; b.disabled = ro || (a[0] !== 'view' && !rw.view); b.title = a[0] !== 'view' && !rw.view ? 'فعّل «عرض» أولًا — عرض شرط للباقي' : ''; b.closest('td').classList.toggle('is-changed', !!rw[a[0]] !== !!baseRow[a[0]]); }); }
      drawScope(); rows.push(tr);
    });
    return h('div.sap-matrix', {}, h('div.table-wrap', {}, h('table.table.perm', { 'aria-label': 'مصفوفة الصلاحيات: ' + role.nameAr }, head, h('tbody', {}, rows))),
      h('div.perm-legend', {}, h('span', {}, h('i', { style: { background: 'var(--eg-navy)' } }), 'مفعّل'), h('span', {}, h('i', { style: { background: 'var(--color-accent)' } }), 'اعتماد (حساس)'), h('span', {}, h('i', { style: { background: 'var(--color-warning-tint)', border: '1px solid var(--color-warning)' } }), 'تغيير غير محفوظ'), h('span', {}, SA.icon('info', 'icon-sm'), ' إلغاء «عرض» يلغي ما بعده تلقائيًا')));
  };

  /* ───────────────────────── view-as-role + compare ───────────────────────── */
  /** "شوف كأنك دور": shows the sidebar/screens/sensitive data a role would get — without impersonating anyone. */
  R.viewAs = function (roleId) {
    const role = SA.roleById(roleId); if (!role) return; SA.track('roles.viewas');
    const allowed = (p, act) => SA.roleCan(role, pk(p, act || 'view'));
    const nav = h('nav.sap-vnav', { 'aria-label': 'قائمة الدور (معاينة)' }); let shown = 0, hidden = [];
    C.apps.forEach((app) => {
      const appItems = C.permsOf(app.id).filter((p) => p.actions.some((a) => a[0] === 'view' || a[0] === 'use')); const okApp = appItems.filter((p) => allowed(p, p.actions[0][0])); appItems.filter((p) => !allowed(p, p.actions[0][0])).forEach((p) => hidden.push(p.label));
      if (!okApp.length) return; nav.append(h('div.sap-vapp', {}, SA.icon(app.icon, 'icon-sm'), app.title));
      C.groupsOf(app.id).forEach((g) => {
        const ok = okApp.filter((p) => p.group === g.id); if (!ok.length) return; shown += ok.length;
        nav.append(h('div.sap-vgroup', {}, h('div.sap-nav-label', {}, g.title), ok.map((p) => { const extra = p.actions.filter((a) => a[0] !== 'view' && a[0] !== 'use' && allowed(p, a[0])); return h('div.sap-vitem', {}, h('b', {}, p.label), h('small', {}, extra.length ? 'عرض + ' + extra.map((a) => a[1]).join('، ') : 'عرض فقط')); })));
      });
    });
    if (!shown) nav.append(h('p.sap-nav-empty', {}, 'هذا الدور لا يرى أي شاشة في Super Admin.'));
    const matrix = C.resources.filter((r) => role.matrix[r.id] && role.matrix[r.id].view);
    const m = SA.modal({ title: 'معاينة كأنك: ' + role.nameAr, subtitle: 'معاينة فقط — بدون انتحال هوية أي مستخدم وبدون تنفيذ أي إجراء (UC-ROL-05).', icon: 'eye', size: 'xl',
      body: h('div.sap-viewas', {}, SA.alert('info', 'ده اللي هيظهر للدور في القائمة الجانبية وأزرار الشاشات. الأزرار الممنوعة بتظهر مقفولة بسبب مكتوب.'),
        h('div.sap-viewas-grid', {}, h('div.sap-vframe', {}, h('div.sap-vhead', {}, SA.icon('shield'), 'Super Admin'), nav, h('p.t-caption.sap-vhidden', {}, hidden.length ? 'مخفية عن الدور: ' + hidden.join('، ') : 'لا شاشات مخفية')),
          h('div', {}, h('h4.sap-sub', {}, 'بيانات الموديولات (المصفوفة × النطاق)'), matrix.length ? h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الموديول'), h('th', {}, 'النطاق'), h('th', {}, 'العمليات'))), h('tbody', {}, matrix.map((r) => h('tr', {}, h('td', {}, r.label), h('td', {}, r.scoped ? R.scopeLabel(role.scope[r.id] || 'own') : 'الكل'), h('td', {}, C.actions.filter((a) => role.matrix[r.id][a[0]]).map((a) => a[1]).join('، ')))))))
            : h('p.t-muted', {}, 'لا بيانات أعمال ظاهرة.'),
            h('h4.sap-sub', {}, 'ما يظهر وما يُحجب (الصلاحيات الحساسة)'), h('ul.sap-sens-list', {}, C.sensitive.map((s) => { const on = SA.roleSensitive(role, s.key); return h('li' + (on ? '.is-on' : ''), {}, SA.icon(on ? 'eye' : 'eyeoff', 'icon-sm'), h('span', {}, s.label), h('em', {}, on ? 'ظاهر' : 'محجوب — يُحذف من الاستجابة')); }))))),
      foot: [h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'إغلاق المعاينة')] });
  };
  function compareView(root, ctx) {
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'الأدوار', href: '#/roles' }, { label: 'مقارنة دورين' }]);
    const opts = (st.get('roles') || []).map((r) => [r.id, r.nameAr]); const a = SA.form.field({ name: 'a', label: 'الدور (أ)', type: 'select', options: opts, value: ctx.params.a || 'R-03' }), b = SA.form.field({ name: 'b', label: 'الدور (ب)', type: 'select', options: opts, value: ctx.params.b || 'R-04' });
    const out = h('div');
    const draw = () => {
      SA.clear(out); const ra = SA.roleById(a.get()), rb = SA.roleById(b.get()); if (!ra || !rb) return; if (ra.id === rb.id) { out.append(SA.alert('info', 'اختر دورين مختلفين.')); return; }
      const d = R.diff(R.permsOf(ra), R.permsOf(rb)); if (!d.total) { out.append(SA.empty({ icon: 'checkcircle', title: 'الدوران متطابقان', text: 'نفس الصلاحيات والنطاق.' })); return; }
      const byRes = {}; d.matrix.forEach((c) => { (byRes[c.res] = byRes[c.res] || { a: [], b: [] })[c.from ? 'a' : 'b'].push(c.action); });
      const chips = (arr, k) => (arr.length ? h('div.cluster', {}, arr.map((x) => h('span.chip.chip-' + k + '.chip-plain', {}, R.actLabel(x)))) : h('span.t-muted', {}, '—'));
      out.append(h('p.t-muted', {}, 'مفقود = موجود في دور وغير موجود في الآخر. ', h('b', {}, d.total), ' فرق.'),
        Object.keys(byRes).length ? h('div.card.card-flush', {}, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الموديول'), h('th', {}, ra.nameAr + ' فقط'), h('th', {}, rb.nameAr + ' فقط'))), h('tbody', {}, Object.keys(byRes).map((k) => h('tr', {}, h('td', {}, R.resLabel(k)), h('td', {}, chips(byRes[k].a, 'info')), h('td', {}, chips(byRes[k].b, 'success')))))))) : null,
        d.scope.length ? SA.card({ title: 'نطاق مختلف' }, h('ul.sap-plain', {}, d.scope.map((c) => h('li', {}, R.resLabel(c.res) + ': ' + ra.nameAr + ' «' + R.scopeLabel(c.from) + '» ← ' + rb.nameAr + ' «' + R.scopeLabel(c.to) + '»')))) : null,
        d.sensitive.length ? SA.card({ title: 'صلاحيات حساسة' }, h('ul.sap-plain', {}, d.sensitive.map((c) => h('li', {}, R.sensLabel(c.key) + ': ' + (c.from ? ra.nameAr + ' فقط' : rb.nameAr + ' فقط'))))) : null,
        d.sa.length ? SA.card({ title: 'صلاحيات الإدارة (Super Admin)' }, h('div.cluster', {}, d.sa.map((c) => h('span.chip.chip-plain.chip-' + (c.from ? 'info' : 'success'), { title: c.from ? ra.nameAr + ' فقط' : rb.nameAr + ' فقط' }, C.permLabel(c.key))))) : null);
    };
    a.input.addEventListener('change', draw); b.input.addEventListener('change', draw);
    root.append(SA.pageHead({ title: 'مقارنة دورين', desc: 'الفروق جنب بعض: مضاف / مفقود / مختلف النطاق.', tags: [SA.tag('new')], back: { href: '#/roles', label: 'الأدوار' } }), h('div.card.sap-compare-pick', {}, h('div.sap-formgrid', {}, a.el, b.el)), out); draw();
  }

  /* ───────────────────────── dialogs: create / rename / delete / move members ───────────────────────── */
  function createRole() {
    const nameAr = SA.form.field({ name: 'nameAr', label: 'اسم الدور بالعربية', required: true, rules: [(v) => ((st.get('roles') || []).some((r) => r.nameAr.trim() === String(v).trim()) ? 'اسم الدور موجود قبل كده' : null)] }), nameEn = SA.form.field({ name: 'nameEn', label: 'Name (English)' }), desc = SA.form.field({ name: 'desc', label: 'الوصف', type: 'textarea', rows: 2 });
    const mode = SA.form.field({ name: 'mode', label: 'البداية من', type: 'radio', value: 'copy', options: [['scratch', 'من الصفر', 'بدون أي صلاحيات'], ['copy', 'نسخ من دور موجود', 'ينسخ المصفوفة والنطاق والحساسة والإدارة']], onChange: (v) => { src.el.hidden = v !== 'copy'; } });
    const src = SA.form.field({ name: 'src', label: 'الدور المصدر', type: 'select', options: (st.get('roles') || []).map((r) => [r.id, r.nameAr]), value: 'R-04' });
    const grp = SA.form.group([nameAr, nameEn, desc]);
    const m = SA.modal({ title: 'دور جديد', icon: 'plus', size: 'md', body: h('div.sap-confirm', {}, nameAr.el, nameEn.el, desc.el, mode.el, src.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      if (!grp.validate()) return; m.setBusy(true); let id;
      try { await SA.api(() => { id = st.nextId('roles', 'R', 2); const s = mode.get() === 'copy' ? SA.roleById(src.get()) : null; const p = s ? R.permsOf(s) : { matrix: {}, scope: {}, sensitive: [], sa: [] }; if (s && p.sa[0] === '*') p.sa = C.permKeys.slice(); if (s && p.sensitive[0] === '*') p.sensitive = C.sensitive.map((x) => x.key); C.resources.forEach((r) => { if (!p.matrix[r.id]) p.matrix[r.id] = R.emptyRow(); });
        st.insert('roles', { id, nameAr: nameAr.get().trim(), nameEn: nameEn.get().trim(), description: desc.get(), isSystem: false, isProtected: false, isNew: true, tag: 'new', status: 'active', version: 1, matrix: p.matrix, scope: p.scope, sensitive: p.sensitive, sa: p.sa, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        SA.audit('ROLE.CREATED', { target: { type: 'role', id, label: nameAr.get().trim() }, after: { nameAr: nameAr.get().trim(), copiedFrom: s ? s.nameAr : 'من الصفر' } }); }); } catch (e) { m.setBusy(false); SA.fail(e); return; }
      m.close(); SA.toast('تم إنشاء الدور', 'success'); SA.nav('roles/' + id);
    } }, 'إنشاء الدور')] });
    src.el.hidden = false;
  }
  async function deleteRole(role) {
    const n = R.members(role.id).length; if (role.isProtected) { SA.toast('دور Super Admin محمي ولا يُحذف.', 'error'); return; } if (n) { SA.toast('الدور مستخدَم بواسطة ' + n + ' مستخدم — انقلهم لدور آخر أولًا.', 'error', { ms: 6000 }); return; }
    const r = await SA.confirm({ title: 'حذف دور «' + role.nameAr + '»', danger: true, confirmLabel: 'حذف الدور', reasonRequired: true, impact: ['لا مستخدمين على الدور — الحذف آمن.', 'لا يمكن التراجع بعد التأكيد.'] }); if (!r.ok) return; if (!(await SA.stepUp('role.update'))) return;
    try { await SA.api(() => { st.remove('roles', role.id); delete drafts[role.id]; SA.audit('ROLE.DELETED', { target: { type: 'role', id: role.id, label: role.nameAr }, reason: r.reason, before: { nameAr: role.nameAr } }); }); } catch (e) { SA.fail(e); return; }
    SA.toast('تم حذف الدور', 'success'); SA.nav('roles');
  }
  function editMeta(role) {
    const nameAr = SA.form.field({ name: 'a', label: 'اسم الدور بالعربية', required: true, value: role.nameAr }), nameEn = SA.form.field({ name: 'e', label: 'Name (English)', value: role.nameEn }), desc = SA.form.field({ name: 'd', label: 'الوصف', type: 'textarea', rows: 2, value: role.description });
    const m = SA.modal({ title: 'تعديل بيانات الدور', icon: 'edit', size: 'sm', body: h('div.sap-confirm', {}, nameAr.el, nameEn.el, desc.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!nameAr.validate()) return; m.setBusy(true); try { await SA.api(() => { st.patch('roles', role.id, { nameAr: nameAr.get().trim(), nameEn: nameEn.get().trim(), description: desc.get() }); SA.audit('ROLE.UPDATED', { target: { type: 'role', id: role.id, label: role.nameAr }, before: { nameAr: role.nameAr, description: role.description }, after: { nameAr: nameAr.get().trim(), description: desc.get() } }); }); m.close(); SA.toast('تم الحفظ', 'success'); } catch (e) { m.setBusy(false); SA.fail(e); } } }, 'حفظ')] });
  }
  function moveMembers(role) {
    const mem = R.members(role.id); if (!mem.length) { SA.toast('لا يوجد أعضاء لنقلهم', 'info'); return; }
    const picks = SA.form.field({ name: 'p', label: 'المستخدمون', type: 'multi', options: mem.map((u) => [u.id, u.name + (u.id === SA.session.userId ? ' (أنت — غير مسموح)' : ''), u.email, u.id === SA.session.userId ? 'disabled' : null]) });
    const target = SA.form.field({ name: 't', label: 'الدور البديل', type: 'select', required: true, options: [['', 'اختر…']].concat((st.get('roles') || []).filter((r) => r.id !== role.id && r.status === 'active').map((r) => [r.id, r.nameAr])) });
    const reason = SA.form.field({ name: 'r', label: 'السبب', type: 'textarea', rows: 2, required: true });
    const m = SA.modal({ title: 'نقل أعضاء من «' + role.nameAr + '»', icon: 'swap', size: 'md', body: h('div.sap-confirm', {}, picks.el, target.el, reason.el, SA.alert('info', 'كل نقل بيتسجّل USER.ROLE_CHANGED لكل مستخدم.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      const ids = picks.get(); if (!ids.length) { picks.error('اختر مستخدمًا واحدًا على الأقل'); return; } if (!target.validate() | !reason.validate()) return;
      const nr = SA.roleById(target.get()); const saLeft = R.superAdmins(true).filter((u) => ids.indexOf(u.id) < 0).length;
      if (role.isProtected && !nr.isProtected && saLeft < 1) { SA.toast('النقل هيشيل آخر Super Admin نشط — ممنوع.', 'error', { ms: 6000 }); return; }
      if ((role.isProtected || nr.isProtected) && !(await SA.stepUp('user.superadmin'))) return; m.setBusy(true);
      try { await SA.api(() => ids.forEach((id) => { const u = SA.userById(id); st.patch('users', id, { roleId: nr.id }); SA.audit('USER.ROLE_CHANGED', { target: { type: 'user', id, label: u.name }, reason: reason.get(), before: { role: role.nameAr, roleId: role.id }, after: { role: nr.nameAr, roleId: nr.id } }); })); m.close(); SA.toast('تم نقل ' + ids.length + ' مستخدم', 'success'); } catch (e) { m.setBusy(false); SA.fail(e); }
    } }, 'نقل')] });
  }

  /* ───────────────────────── "sa" keys tab ───────────────────────── */
  const pk = (p, act) => (p.app || 'sa') + '.' + p.res + '.' + act;
  function renderSaKeys(role, d, ro) {
    const wrap = h('div.sap-sakeys', {}, h('p.t-muted', {}, 'مفاتيح الدخول لشاشات Super Admin والموارد البشرية وإجراءاتها (', h('code', {}, 'sa.<resource>.<action>'), ' · ', h('code', {}, 'hr.<resource>.<action>'), '). «عرض» شرط لباقي إجراءات نفس الشاشة. المفاتيح الحساسة (الأجور…) في تبويب «الصلاحيات الحساسة».'));
    C.apps.forEach((app) => {
      wrap.append(h('h3.sap-apphead', {}, SA.icon(app.icon), app.title));
      C.groupsOf(app.id).forEach((g) => {
        const items = C.permsOf(app.id).filter((p) => p.group === g.id); if (!items.length) return;
        wrap.append(h('div.sap-sagroup', {}, h('h4', {}, g.title), items.map((p) => {
          const line = h('div.sap-saline', {}, h('div.sap-saname', {}, h('b', {}, p.label), p.tag ? SA.tag(p.tag) : null), h('div.sap-sachips', {}));
          const draw = () => { const box = line.lastChild; SA.clear(box); const set = d.cur.sa[0] === '*' ? C.permKeys : d.cur.sa; const hasView = p.actions.some((a) => a[0] === 'view'); const viewOn = !hasView || set.indexOf(pk(p, 'view')) >= 0;
            p.actions.forEach((a) => { const key = pk(p, a[0]); const on = set.indexOf(key) >= 0; const baseOn = (d.base.sa[0] === '*' ? C.permKeys : d.base.sa).indexOf(key) >= 0; const dis = ro || (a[0] !== 'view' && !viewOn);
              box.appendChild(h('button.sap-keychip' + (on ? '.is-on' : '') + (on !== baseOn ? '.is-changed' : ''), { type: 'button', 'aria-pressed': String(on), disabled: dis, title: dis && !ro ? 'فعّل «عرض» أولًا' : key, onclick: () => { const res = R.setSaKey(d.cur, key, !on); if (res.cleared.length) SA.toast('اتلغت تلقائيًا ' + res.cleared.length + ' صلاحية (عرض شرط للباقي)', 'info'); draw(); R.touch(role.id); } }, on ? SA.icon('check', 'icon-sm') : null, a[1])); }); };
          draw(); return line;
        })));
      });
    });
    return wrap;
  }

  /* ───────────────────────── roles screen ───────────────────────── */
  function renderRoles(root, ctx) {
    if (ctx.path[0] === 'compare') { compareView(root, ctx); return; }
    let selId = ctx.path[0] && ctx.path[0] !== 'new' ? ctx.path[0] : null; let tab = ctx.params.tab || 'matrix'; const roles = () => st.get('roles') || [];
    if (!selId && roles()[0]) selId = SA.roleById('R-03') ? 'R-03' : roles()[0].id;
    if (ctx.path[0] === 'new') { setTimeout(createRole, 0); }
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'الأدوار والصلاحيات' }].concat(selId && SA.roleById(selId) ? [{ label: SA.roleById(selId).nameAr }] : []));
    const listHost = h('aside.sap-rolelist', { 'aria-label': 'قائمة الأدوار' }); const detail = h('section.sap-roledetail'); const headHost = h('div');
    root.append(headHost, h('div.sap-split', {}, listHost, detail));
    let state = 'loading'; let barHost = null; let unOn = null;
    headHost.append(SA.pageHead({ title: 'الأدوار والصلاحيات', desc: 'مصفوفة موديول × 6 عمليات مع نطاق البيانات والصلاحيات الحساسة. التعديل يمر بملخص فروقات ثم Step-up.', tags: [SA.tag('approved'), SA.tag('pending', 'الأدوار Pending (بند 5)')], actions: [SA.btn({ label: 'مقارنة دورين', icon: 'compare', kind: 'ghost', onClick: () => SA.nav('roles/compare' + (selId ? '?a=' + selId : '')) }), SA.btn({ label: 'دور جديد', icon: 'plus', kind: 'accent', perm: 'sa.roles.create', onClick: createRole })] }));
    function drawList() {
      SA.clear(listHost);
      roles().forEach((r) => { const n = R.members(r.id).length; const s = R.summary(r); listHost.appendChild(h('a.sap-roleitem' + (r.id === selId ? '.is-sel' : ''), { href: '#/roles/' + r.id + (tab !== 'matrix' ? '?tab=' + tab : ''), 'aria-current': r.id === selId ? 'true' : null }, h('div.sap-roleitem-top', {}, h('b', {}, r.nameAr), r.isProtected ? SA.icon('lock', 'icon-sm') : null, R.dirty(r.id) ? h('span.sap-dirtydot', { title: 'تغييرات غير محفوظة' }) : null), h('div.sap-roleitem-meta', {}, h('span', {}, n + ' مستخدم'), h('span', {}, s.cells + ' صلاحية'), r.isNew ? SA.tag('new') : r.tag === 'pending' ? SA.tag('pending') : null))); });
    }
    function drawDetail() {
      SA.clear(detail); const role = SA.roleById(selId);
      if (state === 'loading') { detail.appendChild(SA.skeleton({ kind: 'form', rows: 9 })); return; }
      if (state === 'error') { detail.appendChild(SA.errorState({ onRetry: load, text: 'تعذّر تحميل الأدوار.' })); return; }
      if (!role) { detail.appendChild(SA.empty({ icon: 'key', title: 'اختر دورًا', text: 'اختر دورًا من القائمة لعرض صلاحياته.' })); return; }
      const d = R.draft(role.id); const why = readonlyReason(role); const ro = !!why; const members = R.members(role.id);
      const actions = h('div.sap-actions', {}, SA.btn({ label: 'شوف كأنك هذا الدور', icon: 'eye', kind: 'ghost', size: 'sm', onClick: () => R.viewAs(role.id) }),
        h('button.btn.btn-ghost.btn-sm.btn-icon', { type: 'button', 'aria-label': 'المزيد', 'aria-haspopup': 'menu', onclick: (e) => SA.menu(e.currentTarget, [
          { label: 'تعديل الاسم والوصف', icon: 'edit', disabled: role.isProtected ? 'دور محمي' : (SA.can('sa.roles.edit') ? false : NOPERM), onClick: () => editMeta(role) },
          { label: 'نسخ كدور جديد', icon: 'copy', disabled: SA.can('sa.roles.create') ? false : NOPERM, onClick: createRole },
          { label: 'نقل الأعضاء لدور آخر', icon: 'swap', disabled: SA.can('sa.users.edit') ? false : NOPERM, onClick: () => moveMembers(role) },
          { divider: true },
          { label: 'حذف الدور', icon: 'trash', danger: true, disabled: role.isProtected ? 'دور Super Admin محمي — لا يُحذف' : members.length ? 'الدور مستخدَم بواسطة ' + members.length + ' مستخدم — انقلهم أولًا' : (SA.can('sa.roles.delete') ? false : NOPERM + ' (sa.roles.delete)'), onClick: () => deleteRole(role) }]) }, SA.icon('dots')));
      detail.append(h('div.sap-rolehead', {}, h('div', {}, h('h2.sap-h2', {}, role.nameAr, role.isProtected ? SA.icon('lock', 'icon-sm') : null, role.isNew ? SA.tag('new') : null), h('p.t-muted', {}, role.description || '—'), h('small.t-caption', {}, 'آخر تعديل: ', SA.fmt.dt(role.updatedAt), ' · الإصدار ', h('span.num', {}, role.version || 1))), actions));
      if (ro) detail.appendChild(h('div.sap-banner.is-lock', {}, SA.icon('lock'), h('span.sap-banner-text', {}, why)));
      const tabs = SA.tabs({ label: 'أقسام الدور', active: tab, tabs: [{ id: 'matrix', label: 'المصفوفة', icon: 'grid' }, { id: 'scope', label: 'النطاق', icon: 'layers' }, { id: 'sensitive', label: 'الصلاحيات الحساسة', icon: 'lock' }, { id: 'sa', label: 'صلاحيات الإدارة', icon: 'key' }, { id: 'members', label: 'الأعضاء', icon: 'users', badge: members.length }], onChange: (id) => { tab = id; history.replaceState(null, '', '#/roles/' + role.id + '?tab=' + id); drawPanel(); drawList(); } });
      const panel = h('div.sap-rolepanel', { role: 'tabpanel' }); barHost = h('div.sap-unsaved-host');
      detail.append(tabs.el, panel, barHost);
      function drawPanel() {
        SA.clear(panel); panel.id = 'panel-' + tab; panel.setAttribute('aria-labelledby', 'tab-' + tab);
        if (tab === 'matrix') panel.append(R.renderMatrix(role, d, { readonly: ro }));
        else if (tab === 'scope') panel.append(SA.scope ? SA.scope.renderTab(role, d, ro) : SA.empty({ title: 'النطاق غير متاح' }));
        else if (tab === 'sensitive') panel.append(SA.scope ? SA.scope.renderSensitive(role, d, ro) : SA.empty({ title: 'غير متاح' }));
        else if (tab === 'sa') panel.append(renderSaKeys(role, d, ro));
        else panel.append(renderMembers(role, members));
        drawBar();
      }
      function drawBar() {
        SA.clear(barHost); const df = R.draftDiff(role.id); if (!df.total) return;
        barHost.append(h('div.sap-unsaved', { role: 'region', 'aria-label': 'تغييرات غير محفوظة' }, SA.icon('alert'), h('span.sap-unsaved-text', {}, h('b.num', {}, df.total), ' تغيير غير محفوظ على ', h('b', {}, role.nameAr)), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { R.reset(role.id); drawDetail(); drawList(); } }, SA.icon('history', 'icon-sm'), 'تراجع عن الكل'), SA.btn({ label: 'مراجعة الفروقات وحفظ', icon: 'check', kind: 'primary', size: 'sm', onClick: async () => { if (await R.commit(role.id)) { drawDetail(); drawList(); } } })));
      }
      if (unOn) unOn(); unOn = R.onDraft((id) => { if (id === role.id && document.body.contains(detail)) { drawBar(); drawList(); } });
      drawPanel();
    }
    function renderMembers(role, mem) {
      if (!mem.length) return SA.empty({ icon: 'users', title: 'لا يوجد مستخدمون على هذا الدور', text: 'يمكنك حذف الدور (لو غير محمي) أو إسناده من شاشة المستخدمين.' });
      return h('div.card.card-flush', {}, h('div.table-wrap', {}, h('table.table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'المستخدم'), h('th', {}, 'القسم'), h('th', {}, 'الحالة'), h('th', {}, 'آخر دخول'))), h('tbody', {}, mem.map((u) => h('tr', {}, h('td', {}, h('a', { href: '#/users/' + u.id }, SA.userCell(u))), h('td', {}, SA.deptName(u.departmentId)), h('td', {}, SA.statusChip('user', u.status)), h('td.t-muted', {}, SA.fmt.rel(u.lastLogin))))))), h('div.sap-card-foot', {}, SA.btn({ label: 'نقل الأعضاء لدور آخر', icon: 'swap', kind: 'ghost', size: 'sm', perm: 'sa.users.edit', onClick: () => moveMembers(role) })));
    }
    function load() { state = 'loading'; drawDetail(); SA.delay(260, { write: false }).then(() => { state = 'ready'; drawList(); drawDetail(); }, () => { state = 'error'; drawDetail(); }); }
    drawList(); load();
    const un = st.subscribe('roles', () => { if (state === 'ready') { drawList(); drawDetail(); } }); const un2 = st.subscribe('users', () => { if (state === 'ready') drawList(); });
    return () => { un(); un2(); if (unOn) unOn(); const dirty = R.dirtyRoles(); if (dirty.length) SA.toast('عندك تغييرات غير محفوظة على: ' + dirty.map((id) => SA.roleName(id)).join('، ') + ' (محفوظة مؤقتًا في هذه الجلسة).', 'warn', { ms: 6000 }); };
  }

  SA.register({ id: 'roles', group: 'access', title: 'الأدوار والصلاحيات', icon: 'key', route: 'roles', perm: 'sa.roles.view', order: 20, desc: 'مصفوفة الصلاحيات والنطاق والحساسة', render: renderRoles });
})();
