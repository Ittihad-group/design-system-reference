/* EG Super Admin prototype — mod-sacct.js  (SA-04 أمان حسابات Super Admin)
   Route: #/users/security — primary + backup account, MFA status/setup, recovery codes (generate/download with Step-up),
   rule "at least 2 active Super Admins", naming the backup account ({Open}: who it is — prototype uses a flagged demo name). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const cfg = () => st.get('settings.superAdmin') || {};
  const NOPERM = 'ليست من صلاحياتك (sa.superadmin.manage)';
  const activeSAs = () => SA.rbac.superAdmins(true);
  const rand = (n) => Array.from({ length: n }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

  function qrSvg() { // decorative QR-like pattern (prototype)
    const cells = []; for (let y = 0; y < 17; y++) for (let x = 0; x < 17; x++) { const finder = (x < 5 && y < 5) || (x > 11 && y < 5) || (x < 5 && y > 11); const on = finder ? (x % 4 === 0 || y % 4 === 0 || x % 4 === 4 || y % 4 === 4 || ((x % 5) === 2 && (y % 5) === 2)) : ((x * 7 + y * 13 + x * y) % 5 < 2); if (on) cells.push('<rect x="' + x + '" y="' + y + '" width="1" height="1"/>'); }
    return h('div.sap-qr', { role: 'img', 'aria-label': 'رمز QR تجريبي', html: '<svg viewBox="0 0 17 17" shape-rendering="crispEdges" fill="currentColor">' + cells.join('') + '</svg>' });
  }
  function setupMfa(user) {
    return new Promise((resolve) => {
      const code = SA.form.field({ name: 'c', label: 'كود التأكيد (6 أرقام)', required: true, hint: 'تجريبي: 123456' });
      const m = SA.modal({ title: 'إعداد MFA — ' + user.name, icon: 'finger', size: 'sm', body: h('div.sap-confirm', {}, h('div.sap-qrbox', {}, qrSvg(), h('div', {}, h('p', {}, 'امسح الرمز بتطبيق المصادقة، أو أدخل المفتاح يدويًا:'), h('code', {}, 'JBSW-Y3DP-EHPK-3PXP'), h('p.t-caption', {}, 'طريقة MFA الفعلية: ', SA.openValue('غير مُحدّدة')))), code.el),
        foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: () => { if (!code.validate()) return; if (code.get().trim() !== '123456') { code.error('الكود غير صحيح'); return; } m.close(true); } }, 'تأكيد وتفعيل')] });
      m.closed.then((r) => resolve(!!r));
    });
  }
  async function enableMfa(user) {
    if (!SA.can('sa.superadmin.manage')) { SA.toast(NOPERM, 'warn'); return false; }
    if (!(await setupMfa(user))) return false; if (!(await SA.stepUp('recovery.generate'))) return false;
    try { await SA.api(() => { st.patch('users', user.id, { mfa: true }); SA.audit('SUPERADMIN.MFA_CHANGED', { target: { type: 'user', id: user.id, label: user.name }, before: { mfa: !!user.mfa }, after: { mfa: true }, reason: 'إعداد MFA', severity: 'critical' }); }); } catch (e) { SA.fail(e); return false; }
    SA.toast('تم تفعيل MFA لـ' + user.name, 'success'); return true;
  }
  async function generateCodes(user) {
    if (!SA.can('sa.superadmin.manage')) { SA.toast(NOPERM, 'warn'); return; }
    const r = await SA.confirm({ title: 'توليد أكواد استرجاع جديدة', danger: true, confirmLabel: 'توليد الأكواد', reasonRequired: true, impact: ['الأكواد القديمة لـ«' + user.name + '» هتبطل فورًا.', 'الأكواد بتظهر مرة واحدة فقط — احفظها في مكان آمن.', 'الحساب الآخر هيتبلّغ (حرج).'] }); if (!r.ok) return;
    if (!(await SA.stepUp('recovery.generate'))) return; let codes;
    try { await SA.api(() => { codes = Array.from({ length: 8 }, () => rand(4) + '-' + rand(4)); st.update('settings.superAdmin', (c) => { c.recoveryCodesGeneratedAt = new Date().toISOString(); c.recoveryCodes = c.recoveryCodes || {}; c.recoveryCodes[user.id] = { at: new Date().toISOString(), count: codes.length }; }); SA.audit('SUPERADMIN.MFA_CHANGED', { target: { type: 'user', id: user.id, label: user.name }, reason: r.reason, after: { recoveryCodes: codes.length, note: 'توليد أكواد استرجاع جديدة' }, severity: 'critical' }); const other = activeSAs().filter((u) => u.id !== user.id).map((u) => u.id); SA.notify({ title: 'تم توليد أكواد استرجاع لحساب ' + user.name, body: 'بواسطة ' + SA.session.user.name + ' — حدث حرج.', level: 'urgent', toUsers: other, to: ['R-10'], link: '#/users/security' }); }); } catch (e) { SA.fail(e); return; }
    const text = 'EG Super Admin — أكواد استرجاع (' + user.name + ')\nتاريخ التوليد: ' + SA.fmt.dt(new Date().toISOString()) + '\nكل كود يُستخدم مرة واحدة. بيانات تجريبية.\n\n' + codes.join('\n') + '\n';
    const m = SA.modal({ title: 'أكواد الاسترجاع (تظهر مرة واحدة)', icon: 'key', size: 'sm', dismissible: false, body: h('div.sap-confirm', {}, SA.alert('warning', 'احفظ الأكواد الآن. لن تظهر مرة أخرى.'), h('ul.sap-codes', {}, codes.map((c) => h('li.num', {}, c)))), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => SA.copy(codes.join('\n')).then(() => SA.toast('تم النسخ', 'success')) }, SA.icon('copy', 'icon-sm'), 'نسخ'), h('button.btn.btn-ghost', { type: 'button', onclick: () => { SA.download('recovery-codes-' + user.id + '.txt', text, 'text/plain'); } }, SA.icon('download', 'icon-sm'), 'تنزيل .txt'), h('button.btn.btn-primary', { type: 'button', onclick: () => m.close() }, 'حفظتها')] });
  }
  function nameBackup() {
    if (!SA.can('sa.superadmin.manage')) { SA.toast(NOPERM, 'warn'); return; }
    const cands = (st.get('users') || []).filter((u) => u.status === 'active' && u.id !== cfg().primaryUserId && u.id !== cfg().backupUserId);
    const sel = SA.form.field({ name: 'u', label: 'الشخص الذي تسميه الإدارة', type: 'select', required: true, options: [['', 'اختر…']].concat(cands.map((u) => [u.id, u.name + ' — ' + SA.roleName(u.roleId)])), onChange: upd });
    const info = h('div'); const mfaBox = h('div'); let mfaOk = false;
    function upd() { SA.clear(info); SA.clear(mfaBox); mfaOk = false; const u = SA.userById(sel.get()); if (!u) return; const r = SA.roleById(u.roleId);
      if (!r.isProtected) info.append(SA.alert('danger', h('b', {}, 'هيتمنح دور Super Admin '), 'بدل «' + r.nameAr + '» — صلاحيات كاملة.'));
      if (u.mfa) mfaOk = true; else { const c = SA.form.field({ name: 'c', label: 'MFA لازم يتفعّل قبل التسمية — كود التأكيد', hint: 'تجريبي: 123456' }); mfaBox.append(SA.alert('warning', 'الحساب بدون MFA. أدخل كود التأكيد لإعداده الآن.'), qrSvg(), c.el); c.input.addEventListener('input', () => { mfaOk = c.get().trim() === '123456'; }); } }
    const why = SA.form.field({ name: 'r', label: 'السبب', type: 'textarea', rows: 2, required: true });
    const m = SA.modal({ title: 'تسمية الحساب الاحتياطي', icon: 'shield', size: 'md', body: h('div.sap-confirm', {}, SA.alert('info', 'مين الشخص نفسه قرار إدارة ', SA.openValue('Open (بند 35)'), '. النموذج يسمح بتجربة التسمية.'), sel.el, info, mfaBox, why.el), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      if (!sel.validate() | !why.validate()) return; if (!mfaOk) { SA.toast('أكمل إعداد MFA أولًا (الكود 123456).', 'warn'); return; }
      const u = SA.userById(sel.get()); if (!(await SA.stepUp('superadmin.backup'))) return; m.setBusy(true);
      try { await SA.api(() => { const old = SA.roleById(u.roleId); if (!old.isProtected) { st.patch('users', u.id, { roleId: 'R-01' }); SA.audit('USER.ROLE_CHANGED', { target: { type: 'user', id: u.id, label: u.name }, before: { role: old.nameAr }, after: { role: SA.roleName('R-01') }, reason: 'تسمية حساب احتياطي: ' + why.get() }); } st.patch('users', u.id, { mfa: true }); const prev = cfg().backupUserId; st.update('settings.superAdmin', (c) => { c.backupUserId = u.id; c.backupDemo = false; }); SA.audit('SUPERADMIN.BACKUP_NAMED', { target: { type: 'user', id: u.id, label: u.name }, before: { backup: prev }, after: { backup: u.id }, reason: why.get(), severity: 'critical' }); SA.notify({ title: 'تم تسمية حساب احتياطي: ' + u.name, body: 'حدث حرج في أمان Super Admin.', level: 'urgent', to: ['R-01', 'R-10'], link: '#/users/security' }); }); m.close(); SA.toast('تم تسمية ' + u.name + ' كحساب احتياطي', 'success'); } catch (e) { m.setBusy(false); SA.fail(e); }
    } }, 'تأكيد التسمية')] });
  }
  async function simulateRecovery() {
    const me = SA.session.user; const target = SA.userById(cfg().primaryUserId);
    const r = await SA.confirm({ title: 'محاكاة: استخدام كود استرجاع (UC-SAC-03)', danger: true, confirmLabel: 'استخدام الكود', impact: ['الحساب الأساسي «' + (target ? target.name : '—') + '» يُفتح قفله/MFA بإجراء موثّق.', 'الحدث حرج ويُبلَّغ الحساب الآخر.'], note: 'للتجربة فقط — بيسجّل SUPERADMIN.RECOVERY_USED.' }); if (!r.ok) return;
    try { await SA.api(() => { if (target && target.status === 'locked') st.patch('users', target.id, { status: 'active', failed: 0 }); st.update('settings.superAdmin', (c) => { c.recoveryUsedAt = new Date().toISOString(); }); SA.audit('SUPERADMIN.RECOVERY_USED', { target: { type: 'user', id: target ? target.id : '-', label: target ? target.name : '-' }, severity: 'critical', reason: 'استرجاع بواسطة ' + me.name }); SA.notify({ title: 'استُخدم كود استرجاع', body: 'بواسطة ' + me.name + ' على حساب ' + (target ? target.name : ''), level: 'urgent', to: ['R-01', 'R-10'], link: '#/audit' }); }); } catch (e) { SA.fail(e); return; }
    SA.toast('تم تسجيل استخدام كود الاسترجاع (حرج)', 'warn');
  }

  function render(root, ctx) {
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'المستخدمون', href: '#/users' }, { label: 'أمان Super Admin' }]);
    const box = h('div'); root.append(box);
    function accountCard(user, kind) {
      if (!user) return h('div.card.sap-sacard.is-empty', {}, h('h3', {}, kind === 'backup' ? 'الحساب الاحتياطي' : 'الحساب الأساسي'), SA.empty({ icon: 'shield', title: 'لم يُسمَّ بعد', text: 'مين الاحتياطي قرار إدارة Open (بند 35).', action: { label: 'تسمية الحساب الاحتياطي', icon: 'userplus', perm: 'sa.superadmin.manage', onClick: nameBackup } }));
      const sess = SA.sessions.forUser(user.id).length; const self = user.id === SA.session.userId; const rec = (cfg().recoveryCodes || {})[user.id];
      return h('div.card.sap-sacard', {}, h('div.sap-sacard-head', {}, h('span.chip.chip-plain.' + (kind === 'backup' ? 'chip-info' : ''), {}, kind === 'backup' ? 'احتياطي' : 'أساسي'), kind === 'backup' && cfg().backupDemo ? SA.demoValue('اسم تجريبي — القرار Open') : null),
        SA.userCell(user, { you: self }),
        SA.kv([['الحالة', SA.statusChip('user', user.status)], ['MFA', user.mfa ? h('span', {}, SA.chip('مفعّل', 'success'), ' الطريقة: ', SA.openValue('غير مُحدّدة')) : SA.chip('غير مفعّل — مطلوب!', 'danger')], ['آخر دخول', SA.fmt.dt(user.lastLogin)], ['جلسات نشطة', h('span.num', {}, sess)], ['أكواد الاسترجاع', rec ? 'تم التوليد ' + SA.fmt.rel(rec.at) + ' (' + rec.count + ' كود)' : 'لم تُولَّد بعد']]),
        h('div.cluster.sap-sacard-actions', {}, user.mfa ? null : SA.btn({ label: 'إعداد MFA', icon: 'finger', kind: 'primary', size: 'sm', perm: 'sa.superadmin.manage', onClick: () => enableMfa(user) }), SA.btn({ label: 'أكواد الاسترجاع', icon: 'key', kind: 'ghost', size: 'sm', perm: 'sa.superadmin.manage', onClick: () => generateCodes(user) }), SA.btn({ label: 'فتح المستخدم', icon: 'user', kind: 'ghost', size: 'sm', perm: 'sa.users.view', onClick: () => SA.nav('users/' + user.id) }), SA.btn({ label: 'تعطيل الحساب', icon: 'userx', kind: 'danger', size: 'sm', perm: 'sa.users.disable', reason: self ? 'لا يمكنك تعطيل حسابك بنفسك' : '', onClick: () => SA.users.disable(user.id) })));
    }
    function draw() {
      SA.clear(box); const c = cfg(); const acts = activeSAs(); const ok = acts.length >= 2; const others = SA.rbac.superAdmins(false).filter((u) => u.id !== c.primaryUserId && u.id !== c.backupUserId);
      box.append(SA.pageHead({ title: 'أمان حسابات Super Admin', desc: 'حساب أساسي وحساب احتياطي محميان بـMFA، عشان النظام عمره ما يتقفل عليك ولا يتسرق.', tags: [SA.tag('pending', 'Pending بند 35'), SA.tag('open', 'الاحتياطي Open')], actions: [SA.btn({ label: 'تسمية/تغيير الحساب الاحتياطي', icon: 'userplus', kind: 'primary', perm: 'sa.superadmin.manage', onClick: nameBackup })] }),
        h('div.sap-rulebar' + (ok ? '.is-ok' : '.is-bad'), { role: 'status' }, SA.icon(ok ? 'checkcircle' : 'alert'), h('div', {}, h('b', {}, ok ? 'حسابان Super Admin نشطان على الأقل ✓' : 'تحذير: أقل من حسابي Super Admin نشطين'), h('small', {}, 'نشط حاليًا: ', h('span.num', {}, acts.length), ' · القاعدة: لا يُترك النظام بأقل من حسابين نشطين، والاحتياطي مربوط بـMFA قبل ما يتفعّل (US-SAC-01).'))),
        h('div.sap-grid-2', {}, accountCard(SA.userById(c.primaryUserId), 'primary'), accountCard(SA.userById(c.backupUserId), 'backup')),
        others.length ? SA.card({ title: 'حسابات Super Admin أخرى', flush: true }, h('div.table-wrap', {}, h('table.table', {}, h('tbody', {}, others.map((u) => h('tr', {}, h('td', {}, SA.userCell(u)), h('td', {}, SA.statusChip('user', u.status)), h('td', {}, u.mfa ? SA.chip('MFA', 'info') : SA.chip('بدون MFA', 'danger')), h('td', {}, SA.btn({ label: 'فتح', kind: 'ghost', size: 'sm', onClick: () => SA.nav('users/' + u.id) })))))))) : null,
        SA.card({ title: 'استرجاع الحساب الأساسي', tags: SA.tag('new') }, h('p.t-muted', {}, 'لو الأساسي موقوف أو فقد MFA، الاحتياطي يدخل ويفك القفل/يعيد MFA بإجراء موثّق (UC-SAC-03). أي استخدام لأكواد الاسترجاع بيتسجّل بخطورة حرجة ويُبلَّغ الحساب الآخر.'), h('div.cluster', {}, SA.btn({ label: 'محاكاة: استخدام كود استرجاع', icon: 'key', kind: 'ghost', size: 'sm', perm: 'sa.superadmin.manage', reason: !Object.keys(c.recoveryCodes || {}).length ? 'ولّد أكواد استرجاع أولًا' : '', onClick: simulateRecovery }), c.recoveryUsedAt ? h('span.t-caption', {}, 'آخر استخدام: ', SA.fmt.rel(c.recoveryUsedAt)) : null)));
    }
    draw(); const offs = ['users', 'settings.superAdmin', 'sessions'].map((p) => st.subscribe(p, draw)); return () => offs.forEach((f) => f());
  }
  SA.register({ id: 'sacct', group: 'access', title: 'أمان Super Admin', icon: 'shield', route: 'users/security', perm: 'sa.superadmin.view', order: 15, desc: 'الحساب الأساسي والاحتياطي وMFA وأكواد الاسترجاع', render });
})();
