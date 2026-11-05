/* EG Super Admin prototype — mod-users.js  (SA-01 المستخدمون + SA.users / SA.sessions APIs)
   Route: #/users (list) · #/users/new (wizard) · #/users/:id (drawer, tabs: data | role | sessions | activity)
   Query filters: ?status=locked&role=R-04&dept=D-02&mfa=yes|no&q=text */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const me = () => SA.session.user;
  const NOPERM = 'ليست من صلاحياتك';
  const permReason = (k) => (SA.can(k) ? '' : NOPERM + ' (' + k + ')');
  const activeSAs = (exceptId) => SA.rbac.superAdmins(true).filter((u) => u.id !== exceptId);
  const isSA = (u) => { const r = SA.roleById(u.roleId); return !!(r && r.isProtected); };
  const roleOptions = () => (st.get('roles') || []).filter((r) => r.status === 'active').map((r) => [r.id, r.nameAr]);
  const deptOptions = (onlyActive) => (st.get('departments') || []).filter((d) => !onlyActive || d.active).map((d) => [d.id, d.name]);
  const mgrOptions = (exceptId) => [['', 'بدون مدير مباشر']].concat((st.get('users') || []).filter((u) => u.status === 'active' && u.id !== exceptId).map((u) => [u.id, u.name]));
  function wouldCycle(userId, mgrId) { let c = mgrId, n = 0; while (c && n++ < 50) { if (c === userId) return true; const m = SA.userById(c); c = m ? m.managerId : null; } return false; }

  /* ───────────────────────── sessions API ───────────────────────── */
  function revokeSessionsOf(userId, reason, auditEach) {
    const list = (st.get('sessions') || []).filter((s) => s.userId === userId && s.status === 'active'); const now = new Date().toISOString(); const by = me() ? me().id : 'SYSTEM';
    st.update('sessions', (l) => { l.forEach((s) => { if (s.userId === userId && s.status === 'active') { s.status = 'revoked'; s.revokedAt = now; s.revokedBy = by; if (s.platform !== 'web') s.pushStatus = 'revoked'; } }); });
    if (auditEach) list.forEach((s) => SA.audit(s.platform === 'web' ? 'SESSION.REVOKED' : 'DEVICE.REVOKED', { target: { type: 'session', id: s.id, label: SA.userName(userId) + ' — ' + s.device }, reason, after: { status: 'revoked' } }));
    return list.length;
  }
  SA.sessions = {
    forUser(userId, all) { return (st.get('sessions') || []).filter((s) => s.userId === userId && (all || s.status === 'active')).sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive)); },
    /** Revoke one session / device. Resolves true when done. */
    async revoke(sessionId, o) {
      o = o || {}; const s = st.find('sessions', sessionId); if (!s) return false;
      if (!SA.can('sa.sessions.revoke') && !SA.can('sa.users.force_logout')) { SA.toast(NOPERM + ' (sa.sessions.revoke)', 'warn'); return false; }
      if (s.id === SA.session.data.sessionId) { SA.toast('دي جلستك الحالية — استخدم «تسجيل الخروج» من قائمة الحساب.', 'warn'); return false; }
      const mobile = s.platform !== 'web';
      const r = await SA.confirm({ title: mobile ? 'إلغاء الجهاز' : 'إنهاء الجلسة', danger: true, confirmLabel: mobile ? 'إلغاء الجهاز' : 'إنهاء الجلسة', impact: [mobile ? 'هيتوقف الـpush ويتسجّل خروج الجهاز: ' + s.device : 'هتفقد الجلسة الوصول في أول طلب: ' + s.device, 'المستخدم: ' + SA.userName(s.userId)], reasonRequired: false });
      if (!r.ok) return false;
      try { await SA.api(() => { st.patch('sessions', s.id, { status: 'revoked', revokedAt: new Date().toISOString(), revokedBy: me().id, pushStatus: mobile ? 'revoked' : s.pushStatus }); SA.audit(mobile ? 'DEVICE.REVOKED' : 'SESSION.REVOKED', { target: { type: 'session', id: s.id, label: SA.userName(s.userId) + ' — ' + s.device }, reason: r.reason, before: { status: 'active' }, after: { status: 'revoked' } }); }); SA.toast(mobile ? 'تم إلغاء الجهاز' : 'تم إنهاء الجلسة', 'success'); return true; } catch (e) { SA.fail(e); return false; }
    },
    /** Revoke every active session of a user (Step-up). */
    async revokeAll(userId) { return SA.users.forceLogout(userId); }
  };

  /* ───────────────────────── users API ───────────────────────── */
  function disableCheck(u, verb) {
    if (u.id === me().id) return 'لا يمكنك ' + verb + ' حسابك بنفسك (حتى لا تُقفل نفسك خارج النظام).';
    if (u.status === 'active' && isSA(u) && activeSAs(u.id).length < 1) return 'ده آخر Super Admin نشط — لا يمكن ' + verb + 'ه (US-USR-03).';
    return '';
  }
  function saWarnings(u) { return u.status === 'active' && isSA(u) && activeSAs(u.id).length === 1 ? ['هيفضل حساب Super Admin نشط واحد بس. القاعدة المطلوبة حسابان نشطان على الأقل (UC-SAC-04).'] : []; }
  function applyDisable(u, reason) {
    const sess = revokeSessionsOf(u.id, 'تعطيل المستخدم', true);
    const pend = (st.get('approvals') || []).filter((a) => a.requesterId === u.id && a.status === 'pending').length;
    st.update('approvals', (l) => l.forEach((a) => { if (a.requesterId === u.id && a.status === 'pending') a.requesterDisabled = true; }));
    st.patch('users', u.id, { status: 'disabled', disabledReason: reason, disabledAt: new Date().toISOString() });
    SA.audit('USER.DISABLED', { target: { type: 'user', id: u.id, label: u.name }, reason, before: { status: u.status }, after: { status: 'disabled', sessionsEnded: sess, pendingApprovals: pend } });
  }
  const U = (SA.users = {
    open: (id) => SA.nav('users/' + id),
    async disable(id) {
      const u = SA.userById(id); if (!u) return false;
      if (!SA.can('sa.users.disable')) { SA.toast(NOPERM + ' (sa.users.disable)', 'warn'); return false; }
      const blk = disableCheck(u, 'تعطيل'); if (blk) { SA.toast(blk, 'error', { ms: 6500 }); return false; }
      const pend = (st.get('approvals') || []).filter((a) => a.requesterId === u.id && a.status === 'pending').length;
      const r = await SA.confirm({ title: 'تعطيل «' + u.name + '»', danger: true, confirmLabel: 'تعطيل المستخدم', reasonRequired: true, reasonLabel: 'سبب التعطيل', impact: ['هتنتهي جلساته وأجهزته فورًا (' + SA.sessions.forUser(u.id).length + ' جلسة نشطة).', 'مش هيقدر يدخل النظام (رسالة عامة من غير كشف السبب).', 'مفيش حذف نهائي — التعطيل قابل للتراجع (BR-USR-01).'].concat(pend ? ['عنده ' + pend + ' طلب اعتماد معلّق — هيتعلّم «مقدّم الطلب معطّل» [New].'] : []), warnings: saWarnings(u) });
      if (!r.ok) return false;
      if (!(await SA.stepUp(isSA(u) ? 'user.superadmin' : 'user.disable'))) return false;
      try { await SA.api(() => applyDisable(u, r.reason)); } catch (e) { SA.fail(e); return false; }
      SA.notify({ title: 'تم تعطيل مستخدم: ' + u.name, body: 'السبب: ' + r.reason, level: 'info', to: ['R-01', 'R-10'], link: '#/users/' + u.id });
      SA.toast('تم تعطيل ' + u.name, 'success', { undo: () => { st.patch('users', u.id, { status: 'active', disabledReason: '', disabledAt: null }); SA.audit('USER.ENABLED', { target: { type: 'user', id: u.id, label: u.name }, reason: 'تراجع عن التعطيل', before: { status: 'disabled' }, after: { status: 'active' } }); } });
      return true;
    },
    async enable(id) {
      const u = SA.userById(id); if (!u) return false;
      if (!SA.can('sa.users.disable')) { SA.toast(NOPERM + ' (sa.users.disable)', 'warn'); return false; }
      const r = await SA.confirm({ title: 'تفعيل «' + u.name + '»', confirmLabel: 'تفعيل المستخدم', reason: true, impact: ['هيقدر يسجّل دخول من جديد بكلمة المرور الحالية.', 'الجلسات القديمة لا تعود.'] });
      if (!r.ok) return false;
      try { await SA.api(() => { st.patch('users', u.id, { status: 'active', disabledReason: '', disabledAt: null, failed: 0 }); SA.audit('USER.ENABLED', { target: { type: 'user', id: u.id, label: u.name }, reason: r.reason, before: { status: 'disabled' }, after: { status: 'active' } }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم تفعيل ' + u.name, 'success'); return true;
    },
    async unlock(id) {
      const u = SA.userById(id); if (!u) return false;
      if (!SA.can('sa.users.unlock') && !SA.can('sa.security_center.unlock')) { SA.toast(NOPERM + ' (sa.users.unlock)', 'warn'); return false; }
      if (u.status !== 'locked') { SA.toast('الحساب مش موقوف.', 'info'); return false; }
      const r = await SA.confirm({ title: 'فك قفل «' + u.name + '»', confirmLabel: 'فك القفل', reasonRequired: true, reasonLabel: 'سبب فك القفل', impact: ['الحالة هترجع «نشط» ويُصفَّر عدّاد المحاولات الفاشلة.', 'يُنصح بإعادة تعيين كلمة المرور لو في شك في الحساب.'] });
      if (!r.ok) return false;
      try { await SA.api(() => { st.patch('users', u.id, { status: 'active', failed: 0, lockedAt: null }); SA.audit('USER.UNLOCKED', { target: { type: 'user', id: u.id, label: u.name }, reason: r.reason, before: { status: 'locked' }, after: { status: 'active' } }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم فك القفل عن ' + u.name, 'success'); return true;
    },
    async forceLogout(id) {
      const u = SA.userById(id); if (!u) return false;
      if (!SA.can('sa.users.force_logout') && !SA.can('sa.sessions.revoke')) { SA.toast(NOPERM + ' (sa.users.force_logout)', 'warn'); return false; }
      if (u.id === me().id) { SA.toast('استخدم «تسجيل الخروج» لحسابك.', 'warn'); return false; }
      const n = SA.sessions.forUser(u.id).length;
      const r = await SA.confirm({ title: 'خروج إجباري: ' + u.name, danger: true, confirmLabel: 'إنهاء كل الجلسات', reasonRequired: true, impact: ['هتنتهي ' + n + ' جلسة/جهاز فورًا ويحتاج تسجيل دخول جديد.', 'الإجراء مش بيعطّل الحساب.'] });
      if (!r.ok) return false;
      if (!(await SA.stepUp('sessions.revoke_all'))) return false;
      try { await SA.api(() => { const c = revokeSessionsOf(u.id, r.reason, false); SA.audit('USER.FORCE_LOGOUT', { target: { type: 'user', id: u.id, label: u.name }, reason: r.reason, after: { sessionsEnded: c } }); }); } catch (e) { SA.fail(e); return false; }
      SA.toast('تم إنهاء كل جلسات ' + u.name, 'success'); return true;
    },
    async resetPassword(id) {
      const u = SA.userById(id); if (!u) return false;
      if (!SA.can('sa.users.reset_password')) { SA.toast(NOPERM + ' (sa.users.reset_password)', 'warn'); return false; }
      const r = await SA.confirm({ title: 'إعادة تعيين كلمة المرور: ' + u.name, confirmLabel: 'إنشاء رابط مؤقت', reasonRequired: true, impact: ['هيتولّد رابط مؤقت للبريد المسجّل (' + u.email + ') — بند 15.', 'الأدمن مش بيشوف كلمة المرور الجديدة.'], extra: h('p.t-caption', {}, 'صلاحية الرابط: ', SA.openValue('غير مُعدّة')) });
      if (!r.ok) return false;
      if (!(await SA.stepUp('user.reset_password'))) return false;
      let token; try { await SA.api(() => { token = 'rst-' + Math.random().toString(36).slice(2, 10); st.patch('users', u.id, { resetToken: { token, at: new Date().toISOString() } }); SA.audit('AUTH.PASSWORD_RESET_REQUESTED', { target: { type: 'user', id: u.id, label: u.name }, reason: r.reason }); }); } catch (e) { SA.fail(e); return false; }
      showLink('رابط إعادة التعيين المؤقت', 'النموذج لا يرسل بريدًا حقيقيًا. في الإنتاج يصل الرابط لبريد ' + u.email + '.', '#/reset/' + token); return true;
    },
    async resendActivation(id) {
      const u = SA.userById(id); if (!u || u.status !== 'pending') return false;
      if (!SA.can('sa.users.create') && !SA.can('sa.users.edit')) { SA.toast(NOPERM + ' (sa.users.edit)', 'warn'); return false; }
      const token = 'act-' + Math.random().toString(36).slice(2, 10);
      try { await SA.api(() => { st.patch('users', u.id, { activationToken: token }); SA.audit('USER.UPDATED', { target: { type: 'user', id: u.id, label: u.name }, reason: 'إعادة إرسال رابط التفعيل' }); }); } catch (e) { SA.fail(e); return false; }
      showLink('رابط التفعيل', 'تم إنشاء رابط تفعيل جديد (الرابط القديم لم يعد صالحًا).', '#/activate/' + token); return true;
    },
    /** Change role (UC-USR-02): own role / last Super Admin blocked, diff shown, reason required, Step-up for Super Admin. */
    async changeRole(id, newRoleId) {
      const u = SA.userById(id), nr = SA.roleById(newRoleId); if (!u || !nr) return false;
      if (!SA.can('sa.users.edit')) { SA.toast(NOPERM + ' (sa.users.edit)', 'warn'); return false; }
      if (u.id === me().id) { SA.toast('لا يمكنك تغيير دورك بنفسك (BR-USR-02).', 'error'); return false; }
      if (u.roleId === nr.id) { SA.toast('ده نفس الدور الحالي.', 'info'); return false; }
      const old = SA.roleById(u.roleId);
      if (old && old.isProtected && !nr.isProtected && u.status === 'active' && activeSAs(u.id).length < 1) { SA.toast('ده آخر Super Admin نشط — لا يمكن تخفيض دوره.', 'error', { ms: 6500 }); return false; }
      const diff = SA.rbac.sentences(SA.rbac.diff(SA.rbac.permsOf(old), SA.rbac.permsOf(nr)));
      const warn = []; if (nr.isProtected) warn.push('الدور الجديد Super Admin: صلاحيات كاملة وأثره حرج.'); if (old && old.isProtected && activeSAs(u.id).length === 1) warn.push('هيفضل حساب Super Admin نشط واحد بس (المطلوب حسابان).');
      const r = await SA.confirm({ title: 'تغيير دور ' + u.name, confirmLabel: 'تغيير الدور', danger: !!nr.isProtected, reasonRequired: true, reasonLabel: 'سبب التغيير', text: 'من «' + (old ? old.nameAr : '—') + '» إلى «' + nr.nameAr + '».', impact: ['الجلسات النشطة هتتحدّث (بانر «تم تحديث صلاحياتك»).'], warnings: warn, extra: h('div.sap-difflist', {}, h('b', {}, 'فرق الصلاحيات (' + diff.length + ')'), diff.length ? h('ul', {}, diff.slice(0, 14).map((d) => h('li.is-' + d.kind + (d.danger ? '.is-danger' : ''), {}, d.text)).concat(diff.length > 14 ? [h('li', {}, '… و' + (diff.length - 14) + ' تغيير آخر')] : [])) : h('p.t-muted', {}, 'نفس الصلاحيات.')) });
      if (!r.ok) return false;
      if ((nr.isProtected || (old && old.isProtected)) && !(await SA.stepUp('user.superadmin'))) return false;
      try { await SA.api(() => { st.patch('users', u.id, { roleId: nr.id }); SA.audit('USER.ROLE_CHANGED', { target: { type: 'user', id: u.id, label: u.name }, reason: r.reason, before: { role: old ? old.nameAr : '—', roleId: u.roleId }, after: { role: nr.nameAr, roleId: nr.id } }); }); } catch (e) { SA.fail(e); return false; }
      SA.notify({ title: 'تم تغيير دورك إلى ' + nr.nameAr, body: 'أعد تحميل الصلاحيات لتطبيق التغيير.', level: 'info', toUsers: [u.id], link: '' });
      SA.toast('تم تغيير الدور', 'success'); return true;
    }
  });
  function showLink(title, text, href) {
    const full = location.href.split('#')[0] + href; const m = SA.modal({ title, icon: 'link', size: 'sm', body: h('div.sap-confirm', {}, h('p', {}, text), h('div.share-bar', {}, h('code', {}, full), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => SA.copy(full).then(() => SA.toast('تم النسخ', 'success')) }, SA.icon('copy', 'icon-sm'), 'نسخ')), h('p.t-caption', {}, 'صلاحية الرابط: ', SA.openValue('غير مُعدّة'))), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إغلاق'), h('button.btn.btn-primary', { type: 'button', onclick: () => { m.close(); window.open(href, '_blank'); } }, SA.icon('external', 'icon-sm'), 'افتح الرابط (تجربة)')] });
  }

  /* ───────────────────────── row / drawer actions ───────────────────────── */
  function userActions(u, inDrawer) {
    const self = u.id === me().id; const items = [];
    const can = (k, extra) => permReason(k) || extra || false;
    if (!inDrawer) items.push({ label: 'عرض التفاصيل', icon: 'eye', onClick: () => U.open(u.id) });
    items.push({ label: 'تعديل البيانات', icon: 'edit', disabled: can('sa.users.edit'), onClick: () => (inDrawer ? inDrawer.edit() : SA.nav('users/' + u.id + '?edit=1')) });
    items.push({ label: 'تغيير الدور', icon: 'swap', disabled: can('sa.users.edit', self ? 'لا يمكنك تغيير دورك بنفسك' : ''), onClick: () => (inDrawer ? inDrawer.tab('role') : SA.nav('users/' + u.id + '?tab=role')) });
    items.push({ divider: true });
    if (u.status === 'disabled') items.push({ label: 'تفعيل المستخدم', icon: 'checkcircle', disabled: can('sa.users.disable'), onClick: () => U.enable(u.id) });
    else items.push({ label: 'تعطيل المستخدم', icon: 'userx', danger: true, disabled: can('sa.users.disable', disableCheck(u, 'تعطيل')), onClick: () => U.disable(u.id) });
    if (u.status === 'locked') items.push({ label: 'فك القفل', icon: 'unlock', disabled: SA.can('sa.users.unlock') || SA.can('sa.security_center.unlock') ? false : NOPERM + ' (sa.users.unlock)', onClick: () => U.unlock(u.id) });
    if (u.status === 'pending') items.push({ label: 'إعادة إرسال التفعيل', icon: 'mail', disabled: can('sa.users.edit'), onClick: () => U.resendActivation(u.id) });
    items.push({ label: 'إعادة تعيين كلمة المرور', icon: 'key', disabled: can('sa.users.reset_password'), onClick: () => U.resetPassword(u.id) });
    items.push({ label: 'خروج إجباري', icon: 'logout', danger: true, disabled: can('sa.users.force_logout', self ? 'استخدم تسجيل الخروج لحسابك' : ''), onClick: () => U.forceLogout(u.id) });
    return items;
  }

  /* ───────────────────────── drawer ───────────────────────── */
  const PLAT = { web: ['مستعرض ويب', 'globe'], ios: ['iPhone', 'phone'], android: ['Android', 'phone'] };
  function openUserDrawer(userId, opts, onClosed) {
    let tab = opts.tab || 'data'; let editing = !!opts.edit; let leaving = false;
    let u0 = SA.userById(userId);
    const bodyHost = h('div.sap-drawer-inner'); const tabsHost = h('div.sap-drawer-tabs'); const headHost = h('div.sap-drawer-user');
    const t = SA.tabs({ label: 'أقسام المستخدم', tabs: [{ id: 'data', label: 'البيانات', icon: 'id' }, { id: 'role', label: 'الدور والنطاق', icon: 'key' }, { id: 'sessions', label: 'الجلسات والأجهزة', icon: 'phone' }, { id: 'activity', label: 'النشاط', icon: 'history' }], active: tab, onChange: (id) => { tab = id; editing = false; draw(); } });
    tabsHost.appendChild(t.el);
    const d = SA.drawer({ title: u0 ? u0.name : 'مستخدم', subtitle: u0 ? u0.email : '', size: 'lg', tabs: tabsHost, body: h('div', {}, headHost, bodyHost), onClose: () => { unsub(); if (!leaving) onClosed(); } });
    const api = { edit() { tab = 'data'; t.setActive('data'); editing = true; draw(); }, tab(id) { tab = id; editing = false; t.setActive(id); draw(); }, close() { leaving = true; d.close(); } };
    function draw() {
      const u = SA.userById(userId); SA.clear(headHost); SA.clear(bodyHost);
      if (!u) { bodyHost.appendChild(SA.empty({ icon: 'user', title: 'المستخدم غير موجود', text: 'ممكن الرابط قديم.' })); return; }
      d.setTitle(u.name, u.email);
      headHost.append(h('div.sap-user-head', {}, SA.avatar(u.name, 'lg'), h('div.sap-user-head-main', {}, h('div.cluster', {}, SA.statusChip('user', u.status), SA.roleChip(u.roleId), u.mfa ? SA.chip('MFA مفعّل', 'info') : SA.chip('بدون MFA', 'neutral')), h('small.t-muted', {}, u.jobTitle || '—', ' · ', SA.deptName(u.departmentId))), h('button.btn.btn-ghost.btn-sm', { type: 'button', 'aria-haspopup': 'menu', onclick: (e) => SA.menu(e.currentTarget, userActions(u, api)) }, 'إجراءات', SA.icon('chevdown', 'icon-sm'))));
      if (u.status === 'locked') headHost.appendChild(SA.alert('danger', h('b', {}, 'الحساب موقوف '), 'بعد محاولات فاشلة (', u.failed || 0, ' محاولة). ', SA.btn({ label: 'فك القفل', icon: 'unlock', size: 'sm', kind: 'ghost', perm: SA.can('sa.security_center.unlock') ? null : 'sa.users.unlock', onClick: () => U.unlock(u.id) })));
      if (u.status === 'disabled') headHost.appendChild(SA.alert('warning', h('b', {}, 'الحساب معطّل. '), u.disabledReason ? 'السبب: ' + u.disabledReason : ''));
      if (u.status === 'pending') headHost.appendChild(SA.alert('info', 'بانتظار التفعيل — المستخدم لم يضبط كلمة مروره بعد.'));
      ({ data: drawData, role: drawRole, sessions: drawSessions, activity: drawActivity })[tab](u, bodyHost);
    }
    function drawData(u, host) {
      if (!editing) {
        host.append(h('div.sap-section-head', {}, h('h3', {}, 'بيانات المستخدم'), SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'sa.users.edit', onClick: () => { editing = true; draw(); } })),
          SA.kv([['الاسم', u.name], ['البريد الإلكتروني', h('span', {}, h('span.num', { dir: 'ltr' }, u.email), h('small.t-muted', {}, ' · غير قابل للتغيير بعد التفعيل'))], ['الهاتف', h('span.num', { dir: 'ltr' }, u.phone || '—')], ['المسمى الوظيفي', u.jobTitle], ['اللغة', u.locale === 'ar' ? 'العربية' : 'English'], ['القسم', SA.deptName(u.departmentId)], ['المدير المباشر', u.managerId ? SA.userName(u.managerId) : 'بدون مدير (تنبيه: لن يظهر في أي فريق)'], u.warehouseIds && u.warehouseIds.length ? ['المخازن', u.warehouseIds.map((w) => (st.find('warehouses', w) || {}).name || w).join('، ')] : null, ['آخر دخول', SA.fmt.dt(u.lastLogin)], ['تاريخ الإنشاء', SA.fmt.date(u.createdAt) + ' · بواسطة ' + SA.userName(u.createdBy)]]));
        return;
      }
      const f = { name: SA.form.field({ name: 'name', label: 'الاسم', required: true, value: u.name }), phone: SA.form.field({ name: 'phone', label: 'الهاتف', type: 'tel', value: u.phone, rules: [SA.form.rules.phone] }), jobTitle: SA.form.field({ name: 'jobTitle', label: 'المسمى الوظيفي', value: u.jobTitle }), locale: SA.form.field({ name: 'locale', label: 'اللغة', type: 'select', options: [['ar', 'العربية'], ['en', 'English']], value: u.locale }), departmentId: SA.form.field({ name: 'departmentId', label: 'القسم', type: 'select', options: deptOptions(true), value: u.departmentId, required: true }), managerId: SA.form.field({ name: 'managerId', label: 'المدير المباشر', type: 'select', options: mgrOptions(u.id), value: u.managerId || '', hint: 'لا يمكن اختيار المستخدم نفسه أو من يتبعه (حلقة).' }) };
      const wh = SA.form.field({ name: 'warehouseIds', label: 'المخازن المسندة', type: 'multi', options: (st.get('warehouses') || []).filter((w) => w.active).map((w) => [w.id, w.name]), value: u.warehouseIds || [] });
      const grp = SA.form.group(Object.values(f));
      const save = h('button.btn.btn-primary', { type: 'button', onclick: async () => {
        if (!grp.validate()) return; const v = grp.get(); const mgr = v.managerId || null;
        if (mgr && wouldCycle(u.id, mgr)) { f.managerId.error('اختيار ده هيعمل حلقة في الهيكل'); return; }
        const before = {}, after = {}; ['name', 'phone', 'jobTitle', 'locale', 'departmentId'].forEach((k) => { if ((u[k] || '') !== (v[k] || '')) { before[k] = u[k]; after[k] = v[k]; } });
        if ((u.managerId || null) !== mgr) { before.managerId = u.managerId; after.managerId = mgr; }
        const w = wh.get(); if (JSON.stringify(u.warehouseIds || []) !== JSON.stringify(w)) { before.warehouseIds = u.warehouseIds; after.warehouseIds = w; }
        if (!Object.keys(after).length) { editing = false; draw(); return; }
        save.disabled = true;
        try { await SA.api(() => { st.patch('users', u.id, { name: v.name, phone: v.phone, jobTitle: v.jobTitle, locale: v.locale, departmentId: v.departmentId, managerId: mgr, warehouseIds: w }); SA.audit('USER.UPDATED', { target: { type: 'user', id: u.id, label: v.name }, before, after }); }); editing = false; SA.toast('تم حفظ البيانات', 'success'); draw(); } catch (e) { save.disabled = false; SA.fail(e); }
      } }, 'حفظ التعديلات');
      host.append(h('div.sap-section-head', {}, h('h3', {}, 'تعديل البيانات')), h('div.sap-formgrid', {}, f.name.el, f.phone.el, f.jobTitle.el, f.locale.el, f.departmentId.el, f.managerId.el), wh.el, SA.alert('info', 'البريد غير قابل للتغيير بعد التفعيل — تغييره عملية منفصلة [New].'), h('div.cluster', {}, save, h('button.btn.btn-ghost', { type: 'button', onclick: () => { editing = false; draw(); } }, 'إلغاء')));
    }
    function drawRole(u, host) {
      const role = SA.roleById(u.roleId); const sum = role ? SA.rbac.summary(role) : null; const self = u.id === me().id;
      host.append(h('div.sap-section-head', {}, h('h3', {}, 'الدور الحالي'), role && SA.can('sa.roles.view') ? h('a.sap-linkbtn', { href: SA.link.role(role.id) }, 'فتح الدور في شاشة الأدوار') : null),
        role ? h('div.sap-rolecard', {}, h('div.cluster', {}, SA.roleChip(role.id), role.tag ? SA.tag(role.tag) : null), h('p.t-muted', {}, role.description), h('div.sap-statrow', {}, h('span', {}, h('b.num', {}, sum.resources), ' موديول'), h('span', {}, h('b.num', {}, sum.cells), ' صلاحية'), h('span', {}, h('b.num', {}, sum.sensitive), ' حساسة'), h('span', {}, h('b.num', {}, sum.sa), ' إدارة'))) : null);
      const rows = SA.catalog.resources.filter((r) => role && role.matrix[r.id] && role.matrix[r.id].view);
      host.append(h('h4.sap-sub', {}, 'نطاق البيانات (الدور × الموديول)'), rows.length ? h('div.table-wrap', {}, h('table.table.sap-mini', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الموديول'), h('th', {}, 'النطاق'), h('th', {}, 'العمليات'))), h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.label), h('td', {}, r.scoped ? SA.chip(SA.rbac.scopeLabel(role.scope[r.id] || 'own'), 'info') : 'الكل'), h('td', {}, SA.catalog.actions.filter((a) => role.matrix[r.id][a[0]]).map((a) => a[1]).join('، ')))))))
        : h('p.t-muted', {}, 'لا توجد موديولات بعرض مفعّل لهذا الدور.'),
        h('h4.sap-sub', {}, 'صلاحيات حساسة'), role && role.sensitive.length ? h('div.cluster', {}, (role.sensitive[0] === '*' ? SA.catalog.sensitive.map((s) => s.key) : role.sensitive).map((k) => SA.chip(SA.rbac.sensLabel(k), 'warning'))) : h('p.t-muted', {}, 'لا يملك صلاحيات حساسة.'));
      // change role
      const canEdit = SA.can('sa.users.edit'); const reason = !canEdit ? NOPERM + ' (sa.users.edit)' : self ? 'لا يمكنك تغيير دورك بنفسك (BR-USR-02)' : '';
      const sel = SA.form.field({ name: 'roleId', label: 'الدور الجديد', type: 'select', options: roleOptions(), value: u.roleId, disabled: !!reason });
      const prev = h('div.sap-difflist');
      const upd = () => { SA.clear(prev); if (sel.get() === u.roleId) return; const nr = SA.roleById(sel.get()); const s = SA.rbac.sentences(SA.rbac.diff(SA.rbac.permsOf(role), SA.rbac.permsOf(nr))); prev.append(h('b', {}, 'الفرق عن الدور الحالي (' + s.length + ')'), s.length ? h('ul', {}, s.slice(0, 12).map((x) => h('li.is-' + x.kind + (x.danger ? '.is-danger' : ''), {}, x.text)).concat(s.length > 12 ? [h('li', {}, '… و' + (s.length - 12) + ' آخر')] : [])) : h('p.t-muted', {}, 'نفس الصلاحيات.')); };
      sel.input.addEventListener('change', upd);
      host.append(h('h4.sap-sub', {}, 'تغيير الدور'), reason ? SA.alert('warning', reason) : null, h('div.sap-formgrid', {}, sel.el), prev, h('div.cluster', {}, SA.btn({ label: 'تغيير الدور…', icon: 'swap', kind: 'primary', reason, onClick: () => { if (sel.get() === u.roleId) { SA.toast('اختر دورًا مختلفًا أولًا', 'info'); return; } U.changeRole(u.id, sel.get()); } })));
    }
    function drawSessions(u, host) {
      const act = SA.sessions.forUser(u.id), all = SA.sessions.forUser(u.id, true).filter((s) => s.status !== 'active').slice(0, 5);
      const row = (s) => { const p = PLAT[s.platform] || PLAT.web; const cur = s.id === SA.session.data.sessionId; return h('li.sap-sess', {}, h('span.sap-sess-ico', {}, SA.icon(p[1])), h('div', {}, h('b', {}, s.device, cur ? h('span.sap-you', {}, 'جلستك الحالية') : null), h('small', {}, p[0], ' · IP ', h('span.num', {}, s.ip), ' · آخر نشاط ', SA.fmt.rel(s.lastActive), s.platform !== 'web' ? ' · push: ' + (s.pushStatus === 'active' ? 'نشط' : 'ملغى') : '')), s.status === 'active' ? SA.btn({ label: s.platform === 'web' ? 'إنهاء' : 'إلغاء الجهاز', kind: 'ghost', size: 'sm', perm: SA.can('sa.users.force_logout') ? null : 'sa.sessions.revoke', reason: cur ? 'دي جلستك الحالية' : '', onClick: () => SA.sessions.revoke(s.id) }) : SA.statusChip('session', s.status)); };
      host.append(h('div.sap-section-head', {}, h('h3', {}, 'الجلسات والأجهزة النشطة (' + act.length + ')'), SA.btn({ label: 'إنهاء كل الجلسات', icon: 'logout', kind: 'danger', size: 'sm', reason: permReason('sa.users.force_logout') || (u.id === me().id ? 'استخدم تسجيل الخروج لحسابك' : '') || (act.length ? '' : 'لا توجد جلسات نشطة'), onClick: () => U.forceLogout(u.id) })),
        act.length ? h('ul.sap-sess-list', {}, act.map(row)) : SA.empty({ icon: 'phone', title: 'لا توجد جلسات نشطة', text: 'المستخدم غير متصل حاليًا.' }),
        all.length ? [h('h4.sap-sub', {}, 'جلسات سابقة'), h('ul.sap-sess-list.is-past', {}, all.map(row))] : null);
    }
    function drawActivity(u, host) {
      const ev = (st.get('audit') || []).filter((e) => e.actor.id === u.id || (e.target && e.target.id === u.id)).slice(0, 25);
      host.append(h('div.sap-section-head', {}, h('h3', {}, 'نشاط المستخدم (' + ev.length + ')'), SA.can('sa.audit.view') ? h('a.sap-linkbtn', { href: SA.link.audit('user=' + u.id) }, 'فتح في سجل التدقيق') : null),
        ev.length ? h('div.audit.sap-audit-mini', {}, ev.map((e) => { const warn = e.severity === 'high' || e.severity === 'critical'; return h('div.audit-item', {}, h('span.audit-ico' + (e.result !== 'success' ? '.is-bad' : warn ? '.is-warn' : ''), {}, SA.icon(e.code.indexOf('AUTH') === 0 ? 'lock' : e.code.indexOf('ROLE') >= 0 ? 'key' : 'history')), h('div', {}, h('b', {}, SA.auditLabel(e.code)), h('small', {}, (e.actor.id === u.id ? 'نفّذه المستخدم' : 'بواسطة ' + e.actor.name) + (e.target && e.target.id !== u.id ? ' · ' + e.target.label : '') + (e.reason ? ' · ' + e.reason : ''))), h('time', {}, SA.fmt.rel(e.ts))); })) : SA.empty({ icon: 'history', title: 'لا يوجد نشاط مسجّل' }));
    }
    const unsub = (function () { const offs = ['users', 'sessions', 'audit', 'roles'].map((p) => st.subscribe(p, () => { if (document.body.contains(d.el)) draw(); })); return () => offs.forEach((f) => f()); })();
    draw();
    return { close: () => { leaving = true; d.close(); }, drawer: d };
  }

  /* ───────────────────────── wizard ───────────────────────── */
  function renderWizard(root, ctx) {
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'المستخدمون', href: '#/users' }, { label: 'مستخدم جديد' }]);
    const den = SA.guard('sa.users.create'); if (den) { root.appendChild(den); return; }
    let step = 0; const data = {};
    const F = SA.form.field;
    const f1 = { name: F({ name: 'name', label: 'الاسم الكامل', required: true, placeholder: 'مثال: سارة أحمد' }), email: F({ name: 'email', label: 'البريد الإلكتروني (فريد)', type: 'email', required: true, rules: [SA.form.rules.email, (v) => ((st.get('users') || []).some((u) => u.email.toLowerCase() === String(v).trim().toLowerCase()) ? 'البريد ده مستخدم لمستخدم تاني' : null)], hint: 'لا يمكن تغييره بعد التفعيل.' }), phone: F({ name: 'phone', label: 'الهاتف', type: 'tel', rules: [SA.form.rules.phone], placeholder: '+20 …' }), jobTitle: F({ name: 'jobTitle', label: 'المسمى الوظيفي' }), locale: F({ name: 'locale', label: 'اللغة', type: 'select', options: [['ar', 'العربية'], ['en', 'English']], value: 'ar' }) };
    const roleBox = h('div.sap-rolepreview'); const whBox = h('div');
    const f2 = { roleId: F({ name: 'roleId', label: 'الدور', type: 'select', required: true, options: [['', 'اختر الدور…']].concat(roleOptions()), onChange: () => { roleInfo(); whToggle(); } }), departmentId: F({ name: 'departmentId', label: 'القسم', type: 'select', required: true, options: [['', 'اختر القسم…']].concat(deptOptions(true)), hint: 'الأقسام المعطّلة غير ظاهرة.' }), managerId: F({ name: 'managerId', label: 'المدير المباشر', type: 'select', options: mgrOptions(), hint: 'مطلوب لنطاق «الفريق».' }) };
    const wh = F({ name: 'warehouseIds', label: 'المخازن المسندة', type: 'multi', options: (st.get('warehouses') || []).filter((w) => w.active).map((w) => [w.id, w.name]) });
    function roleInfo() { SA.clear(roleBox); const r = SA.roleById(f2.roleId.get()); if (!r) return; const s = SA.rbac.summary(r); roleBox.append(h('div.sap-rolecard', {}, h('div.cluster', {}, SA.roleChip(r.id), h('span.t-muted', {}, s.resources + ' موديول · ' + s.cells + ' صلاحية · ' + s.sensitive + ' حساسة')), h('p.t-muted', {}, r.description)), r.isProtected ? SA.alert('danger', h('b', {}, 'تحذير: '), 'دور Super Admin يمنح كل الصلاحيات، وسيُطلب Step-up عند الإرسال.') : null); }
    function whToggle() { SA.clear(whBox); const r = SA.roleById(f2.roleId.get()); if (r && (r.id === 'R-06' || (r.matrix.inventory && r.matrix.inventory.edit))) whBox.appendChild(wh.el); }
    const stepsEl = h('div.sap-wiz-steps'); const panel = h('div.sap-wiz-panel'); const foot = h('div.sap-wiz-foot');
    const g1 = SA.form.group(Object.values(f1)), g2 = SA.form.group(Object.values(f2));
    function review() { const v = Object.assign({}, g1.get(), g2.get(), { warehouseIds: wh.get() }); const r = SA.roleById(v.roleId); return h('div', {}, SA.kv([['الاسم', v.name], ['البريد', h('span.num', { dir: 'ltr' }, v.email)], ['الهاتف', v.phone], ['المسمى', v.jobTitle], ['اللغة', v.locale === 'ar' ? 'العربية' : 'English'], ['الدور', SA.roleChip(v.roleId)], ['القسم', SA.deptName(v.departmentId)], ['المدير المباشر', v.managerId ? SA.userName(v.managerId) : 'بدون'], whBox.firstChild && v.warehouseIds.length ? ['المخازن', v.warehouseIds.map((w) => (st.find('warehouses', w) || {}).name).join('، ')] : null]), r && r.isProtected ? SA.alert('danger', 'سيُنشأ حساب Super Admin — Step-up مطلوب، وMFA يُضبط عند التفعيل.') : null, SA.alert('info', 'هيتبعت رابط تفعيل للبريد؛ الحساب بيبقى «بانتظار التفعيل» لحد ما المستخدم يضبط كلمة مروره.')); }
    function draw() {
      SA.clear(stepsEl); stepsEl.appendChild(SA.stepper(['البيانات الأساسية', 'الدور والقسم', 'مراجعة وإرسال'], step));
      SA.clear(panel); SA.clear(foot);
      if (step === 0) panel.append(h('h2.sap-h2', {}, 'البيانات الأساسية'), h('div.sap-formgrid', {}, f1.name.el, f1.email.el, f1.phone.el, f1.jobTitle.el, f1.locale.el));
      else if (step === 1) { panel.append(h('h2.sap-h2', {}, 'الدور والقسم'), h('div.sap-formgrid', {}, f2.roleId.el, f2.departmentId.el, f2.managerId.el), roleBox, whBox); roleInfo(); whToggle(); }
      else panel.append(h('h2.sap-h2', {}, 'مراجعة وإرسال'), review());
      foot.append(step > 0 ? h('button.btn.btn-ghost', { type: 'button', onclick: () => { step--; draw(); } }, SA.icon('arrowright', 'icon-sm'), 'السابق') : h('a.btn.btn-ghost', { href: '#/users' }, 'إلغاء'),
        step < 2 ? h('button.btn.btn-primary', { type: 'button', onclick: () => { if ((step === 0 ? g1 : g2).validate()) { step++; draw(); } } }, 'التالي', SA.icon('arrowleft', 'icon-sm')) : h('button.btn.btn-accent', { type: 'button', id: 'wiz-submit', onclick: submit }, SA.icon('mail', 'icon-sm'), 'إنشاء وإرسال رابط التفعيل'));
    }
    async function submit() {
      const v = Object.assign({}, g1.get(), g2.get(), { warehouseIds: wh.get() }); const r = SA.roleById(v.roleId);
      if (r.isProtected && !(await SA.stepUp('user.superadmin', { text: 'إنشاء حساب Super Admin عملية حرجة. أعد التحقق للمتابعة.' }))) return;
      const btn = SA.$('#wiz-submit'); if (btn) btn.disabled = true; let rec;
      try { await SA.api(() => { const id = st.nextId('users', 'U', 2); rec = { id, name: v.name.trim(), email: v.email.trim().toLowerCase(), phone: v.phone, roleId: v.roleId, departmentId: v.departmentId, managerId: v.managerId || null, warehouseIds: v.warehouseIds, status: 'pending', mfa: false, locale: v.locale, jobTitle: v.jobTitle, lastLogin: null, createdAt: new Date().toISOString(), createdBy: me().id, persona: null, failed: 0, activationToken: 'act-' + Math.random().toString(36).slice(2, 10) }; st.insert('users', rec); st.update('creds', (c) => { c[id] = 'Demo@1234'; }); SA.audit('USER.CREATED', { target: { type: 'user', id, label: rec.name }, after: { name: rec.name, email: rec.email, role: r.nameAr, department: SA.deptName(rec.departmentId), status: 'pending' } }); }); } catch (e) { if (btn) btn.disabled = false; SA.fail(e); return; }
      SA.notify({ title: 'مستخدم جديد بانتظار التفعيل: ' + rec.name, body: 'الدور: ' + r.nameAr, level: 'info', to: ['R-01'], link: '#/users/' + rec.id });
      success(rec, r);
    }
    function success(rec, r) {
      SA.clear(stepsEl); SA.clear(foot); SA.clear(panel); const href = '#/activate/' + rec.activationToken; const full = location.href.split('#')[0] + href;
      panel.append(h('div.sap-success', {}, h('span.sap-state-ico.is-ok', {}, SA.icon('checkcircle', 'icon-lg')), h('h2', {}, 'تم إنشاء ' + rec.name), h('p.t-muted', {}, 'الحالة: بانتظار التفعيل · الدور: ' + r.nameAr), h('div.share-bar', {}, h('code', {}, full), h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => SA.copy(full).then(() => SA.toast('تم النسخ', 'success')) }, SA.icon('copy', 'icon-sm'), 'نسخ')), h('p.t-caption', {}, 'النموذج لا يرسل بريدًا؛ افتح الرابط لتجربة صفحة التفعيل (UC-USR-07). صلاحية الرابط: ', SA.openValue('غير مُعدّة'))));
      foot.append(h('a.btn.btn-ghost', { href: '#/users/' + rec.id }, 'فتح المستخدم'), h('a.btn.btn-ghost', { href: href, target: '_blank' }, SA.icon('external', 'icon-sm'), 'جرّب صفحة التفعيل'), h('a.btn.btn-primary', { href: '#/users' }, 'العودة للقائمة'));
    }
    root.append(SA.pageHead({ title: 'مستخدم جديد', desc: 'ثلاث خطوات: البيانات ← الدور والقسم ← مراجعة وإرسال رابط التفعيل.', back: { href: '#/users', label: 'المستخدمون' } }), h('div.card.sap-wizard', {}, stepsEl, panel, foot));
    draw();
  }

  /* ───────────────────────── list ───────────────────────── */
  function renderList(root, ctx) {
    const q = ctx.params; const openId = ctx.path[0] && ctx.path[0] !== 'new' ? ctx.path[0] : null; let drawerRef = null; let leaving = false;
    ctx.setCrumbs([{ label: 'الوصول' }, { label: 'المستخدمون', href: openId ? '#/users' : null }].concat(openId ? [{ label: (SA.userById(openId) || {}).name || openId }] : []));
    const head = h('div'); const host = h('div'); root.append(head, host);
    let table = null; let state = 'loading';
    const rows = () => st.get('users') || [];
    const counts = () => { const c = { all: 0 }; rows().forEach((u) => { c.all++; c[u.status] = (c[u.status] || 0) + 1; }); return c; };
    function exportCsv(list) { if (!SA.can('sa.users.export')) { SA.toast(NOPERM + ' (sa.users.export)', 'warn'); return; } const data = [['المعرّف', 'الاسم', 'البريد', 'الدور', 'القسم', 'الحالة', 'MFA', 'آخر دخول']].concat(list.map((u) => [u.id, u.name, u.email, SA.roleName(u.roleId), SA.deptName(u.departmentId), (SA.catalog.status.user[u.status] || [u.status])[0], u.mfa ? 'نعم' : 'لا', SA.fmt.iso(u.lastLogin)])); SA.download('users-' + new Date().toISOString().slice(0, 10) + '.csv', SA.csv(data), 'text/csv'); SA.audit('EXPORT.DATA', { target: { type: 'users', id: 'users', label: 'قائمة المستخدمين' }, after: { rows: list.length, format: 'CSV' } }); SA.toast('تم تصدير ' + list.length + ' مستخدم', 'success'); }
    async function bulkDisable(list) {
      const ok = [], skipped = [];
      list.forEach((u) => { const b = u.status === 'disabled' ? 'معطّل بالفعل' : disableCheck(u, 'تعطيل'); if (b) skipped.push(u.name + ' — ' + b); else ok.push(u); });
      if (!ok.length) { SA.toast('لا يوجد مستخدم قابل للتعطيل ضمن المحدد.' + (skipped[0] ? ' ' + skipped[0] : ''), 'error', { ms: 6500 }); return; }
      const sas = ok.filter(isSA); const left = activeSAs(null).filter((x) => !ok.some((o) => o.id === x.id)).length;
      if (sas.length && left < 1) { SA.toast('التعطيل الجماعي هيشيل كل حسابات Super Admin النشطة — ممنوع.', 'error', { ms: 6500 }); return; }
      const r = await SA.confirm({ title: 'تعطيل ' + ok.length + ' مستخدم', danger: true, confirmLabel: 'تعطيل الكل', reasonRequired: true, impact: ['هتنتهي جلسات وأجهزة كل المحدد فورًا.', 'الأسماء: ' + ok.slice(0, 5).map((u) => u.name).join('، ') + (ok.length > 5 ? ' … و' + (ok.length - 5) : '')], warnings: skipped.length ? ['اتخطّينا ' + skipped.length + ': ' + skipped.join(' | ')] : [] });
      if (!r.ok) return; if (!(await SA.stepUp(sas.length ? 'user.superadmin' : 'user.disable'))) return;
      try { await SA.api(() => ok.forEach((u) => applyDisable(u, r.reason))); } catch (e) { SA.fail(e); return; }
      SA.notify({ title: 'تعطيل جماعي: ' + ok.length + ' مستخدم', body: 'السبب: ' + r.reason, level: 'info', to: ['R-01', 'R-10'], link: '#/users' }); table.clearSelection(); SA.toast('تم تعطيل ' + ok.length + ' مستخدم', 'success');
    }
    async function bulkMove(list) {
      const sel = SA.form.field({ name: 'd', label: 'القسم الجديد', type: 'select', required: true, options: [['', 'اختر…']].concat(deptOptions(true)) });
      const m = SA.modal({ title: 'نقل ' + list.length + ' مستخدم إلى قسم', icon: 'building', size: 'sm', body: h('div.sap-confirm', {}, sel.el, SA.alert('info', 'المستخدمون على نطاق «الفريق» قد يتأثر ظهورهم — راجع المدير المباشر بعد النقل.')), foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!sel.validate()) return; m.setBusy(true); try { await SA.api(() => list.forEach((u) => { st.patch('users', u.id, { departmentId: sel.get() }); SA.audit('USER.UPDATED', { target: { type: 'user', id: u.id, label: u.name }, before: { departmentId: u.departmentId }, after: { departmentId: sel.get() }, reason: 'نقل جماعي' }); })); m.close(); table.clearSelection(); SA.toast('تم نقل ' + list.length + ' مستخدم', 'success'); } catch (e) { m.setBusy(false); SA.fail(e); } } }, 'نقل')] });
    }
    function build() {
      SA.clear(head); SA.clear(host); const c = counts();
      head.append(SA.pageHead({ title: 'المستخدمون', desc: 'إنشاء المستخدمين وربطهم بدور وقسم والتحكم في دورة حياة حساباتهم. تعطيل فقط — لا حذف نهائي.', tags: [SA.tag('approved'), SA.tag('pending', 'دورة الحياة Pending')], actions: [SA.btn({ label: 'مستخدم جديد', icon: 'userplus', kind: 'accent', perm: 'sa.users.create', onClick: () => SA.nav('users/new') })] }),
        h('div.sap-statrow.sap-pills', {}, [['', 'الكل', c.all], ['active', 'نشط', c.active || 0], ['pending', 'بانتظار التفعيل', c.pending || 0], ['locked', 'موقوف', c.locked || 0], ['disabled', 'معطّل', c.disabled || 0]].map((p) => h('button.sap-pill', { type: 'button', onclick: () => table && table.setFilter('status', p[0]) }, p[1], h('b.num', {}, p[2])))));
      table = SA.table({
        id: 'users', rowId: 'id', selectable: true, pageSize: 10, caption: 'قائمة المستخدمين', state,
        initial: { q: q.q || '', filters: { status: q.status || '', roleId: q.role || '', departmentId: q.dept || '', mfa: q.mfa || '' } },
        rows: () => rows(),
        search: { placeholder: 'ابحث بالاسم أو البريد أو المسمى…', keys: ['name', 'email', 'jobTitle'] },
        filters: [{ key: 'roleId', label: 'الدور', options: roleOptions() }, { key: 'departmentId', label: 'القسم', options: deptOptions() }, { key: 'status', label: 'الحالة', options: Object.keys(SA.catalog.status.user).map((k) => [k, SA.catalog.status.user[k][0]]) }, { key: 'mfa', label: 'MFA', options: [['yes', 'مفعّل'], ['no', 'غير مفعّل']], test: (r, v) => (v === 'yes') === !!r.mfa }],
        columns: [
          { key: 'name', label: 'المستخدم', sort: true, render: (u) => SA.userCell(u, { you: u.id === me().id }) },
          { key: 'roleId', label: 'الدور', sort: true, value: (u) => SA.roleName(u.roleId), render: (u) => SA.roleChip(u.roleId) },
          { key: 'departmentId', label: 'القسم', sort: true, value: (u) => SA.deptName(u.departmentId), render: (u) => SA.deptName(u.departmentId) },
          { key: 'status', label: 'الحالة', sort: true, render: (u) => SA.statusChip('user', u.status) },
          { key: 'mfa', label: 'MFA', sort: true, value: (u) => (u.mfa ? 1 : 0), render: (u) => (u.mfa ? SA.chip('مفعّل', 'info') : isSA(u) ? SA.chip('غير مفعّل!', 'danger') : SA.chip('غير مفعّل', 'neutral')) },
          { key: 'lastLogin', label: 'آخر دخول', sort: (a, b) => new Date(a.lastLogin || 0) - new Date(b.lastLogin || 0), render: (u) => h('span.t-muted', { title: SA.fmt.dt(u.lastLogin) }, SA.fmt.rel(u.lastLogin)) }
        ],
        bulk: [{ label: 'تعطيل', icon: 'userx', danger: true, perm: 'sa.users.disable', run: bulkDisable }, { label: 'نقل لقسم', icon: 'building', perm: 'sa.users.edit', run: bulkMove }, { label: 'تصدير CSV', icon: 'download', perm: 'sa.users.export', run: exportCsv }],
        rowActions: (u) => userActions(u, null), onRowClick: (u) => U.open(u.id),
        empty: { icon: 'users', title: 'لا يوجد مستخدمون', text: 'ابدأ بإنشاء أول مستخدم.', action: { label: 'مستخدم جديد', icon: 'userplus', perm: 'sa.users.create', onClick: () => SA.nav('users/new') } },
        toolbar: [SA.btn({ label: 'تصدير القائمة', icon: 'download', kind: 'ghost', perm: 'sa.users.export', onClick: () => exportCsv(table.filteredRows()) })],
        onRetry: load, onChange: (s) => { const qs = []; if (s.q) qs.push('q=' + encodeURIComponent(s.q)); const m = { status: 'status', roleId: 'role', departmentId: 'dept', mfa: 'mfa' }; Object.keys(m).forEach((k) => { if (s.filters[k]) qs.push(m[k] + '=' + encodeURIComponent(s.filters[k])); }); if (!openId) history.replaceState(null, '', '#/users' + (qs.length ? '?' + qs.join('&') : '')); }
      });
      host.appendChild(h('div.card.card-flush.sap-listcard', {}, table.el));
    }
    function load() {
      state = 'loading'; if (table) table.setState('loading');
      SA.delay(280, { write: false }).then(() => { state = 'ready'; build(); }, (e) => { state = 'error'; build(); if (table) { table.setState('error'); } });
    }
    build(); load();
    const unsub = st.subscribe('users', () => { if (state === 'ready' && table) { // refresh counts + table without losing state
      const c = counts(); SA.$$('.sap-pill b', head).forEach((b, i) => { b.textContent = [c.all, c.active || 0, c.pending || 0, c.locked || 0, c.disabled || 0][i]; }); table.refresh(); } });
    if (openId) {
      if (!SA.userById(openId)) { SA.toast('المستخدم غير موجود', 'error'); history.replaceState(null, '', '#/users'); }
      else drawerRef = openUserDrawer(openId, { tab: q.tab, edit: q.edit === '1' }, () => { if (!leaving) SA.nav('users', { replace: true }); });
    }
    return () => { leaving = true; unsub(); if (drawerRef) drawerRef.close(); };
  }

  SA.register({
    id: 'users', group: 'access', title: 'المستخدمون', icon: 'users', route: 'users', perm: 'sa.users.view', order: 10, desc: 'إنشاء وتعطيل وإدارة المستخدمين',
    render(root, ctx) { return ctx.path[0] === 'new' ? renderWizard(root, ctx) : renderList(root, ctx); }
  });
})();
