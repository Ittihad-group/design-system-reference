/* EG Super Admin prototype — shell.js
   App shell: grouped permission-filtered sidebar (collapsible / mobile drawer), topbar (breadcrumb, global search Ctrl/Cmd+K,
   notification bell with Urgent/Action/Info, persona chip + account menu), route rendering (403 / 404 / error / empty),
   banners (permissions changed UC-GLB-05, offline), shortcuts. API: SA.shell.*, SA.search.register, SA.applyUi */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h;
  const S = (SA.shell = { host: null, main: null, cleanup: null, crumbs: null });

  SA.applyUi = function () {
    const ui = SA.store.get('ui') || {};
    document.body.classList.toggle('sap-hide-tags', ui.showTags === false);
    document.body.classList.toggle('sap-compact', ui.density === 'compact');
  };

  /* ───────────────────────── global search registry ───────────────────────── */
  const providers = [];
  SA.search = {
    /** register({id, label, perm, query(q) → [{title, sub, icon, route}]}) */
    register(p) { const i = providers.findIndex((x) => x.id === p.id); if (i >= 0) providers.splice(i, 1); providers.push(p); },
    run(q) {
      q = q.trim().toLowerCase(); const out = [];
      providers.forEach((p) => { if (p.perm && !SA.can(p.perm)) return; let items = []; try { items = p.query(q) || []; } catch (e) { items = []; } if (items.length) out.push({ label: p.label, items: items.slice(0, 6) }); });
      return out;
    }
  };
  const has = (s, q) => String(s || '').toLowerCase().indexOf(q) >= 0;
  SA.search.register({ id: 'modules', label: 'الشاشات', query: (q) => SA.navModules().filter((m) => !q || has(m.title, q) || has(m.desc, q) || has(m.route, q)).map((m) => ({ title: m.title, sub: (SA.catalog.groups.find((g) => g.id === m.group) || {}).title, icon: m.icon || 'grid', route: m.route })) });
  SA.search.register({ id: 'users', label: 'المستخدمون', perm: 'sa.users.view', query: (q) => (q ? (SA.store.get('users') || []).filter((u) => has(u.name, q) || has(u.email, q)).map((u) => ({ title: u.name, sub: u.email + ' · ' + SA.roleName(u.roleId), icon: 'user', route: 'users/' + u.id })) : []) });
  SA.search.register({ id: 'roles', label: 'الأدوار', perm: 'sa.roles.view', query: (q) => (q ? (SA.store.get('roles') || []).filter((r) => has(r.nameAr, q) || has(r.nameEn, q)).map((r) => ({ title: r.nameAr, sub: r.description, icon: 'key', route: 'roles/' + r.id })) : []) });
  SA.search.register({ id: 'customers', label: 'العملاء', perm: 'sa.customers.view', query: (q) => (q ? SA.scopeFilter('customers', SA.store.get('customers') || [], 'salesRepId').filter((c) => has(c.name, q) || has(c.code, q)).map((c) => ({ title: c.name, sub: c.code + ' · ' + c.city, icon: 'users', route: 'customers?q=' + encodeURIComponent(c.code) })) : []) });
  SA.search.register({ id: 'suppliers', label: 'الموردون', perm: 'sa.suppliers.view', query: (q) => (q ? (SA.store.get('suppliers') || []).filter((c) => has(c.name, q) || has(c.code, q)).map((c) => ({ title: c.name, sub: c.code, icon: 'truck', route: 'suppliers?q=' + encodeURIComponent(c.code) })) : []) });
  SA.search.register({ id: 'docs', label: 'المستندات (الترقيم)', perm: 'sa.policies.numbering.view', query: (q) => (q ? ((SA.store.get('settings.numbering') || []).filter((n) => has(n.labelAr, q) || has(n.prefix, q)).map((n) => ({ title: n.labelAr + ' (' + n.prefix + '-)', sub: 'ترقيم المستند', icon: 'receipt', route: 'policies/numbering' }))) : []) });

  function openSearch() {
    const input = h('input.input.sap-search-input', { type: 'search', placeholder: 'ابحث عن شاشة أو مستخدم أو دور أو عميل…', 'aria-label': 'بحث عام', autocomplete: 'off' });
    const list = h('div.sap-search-results', { role: 'listbox', 'aria-label': 'نتائج البحث' }); let flat = [], idx = 0;
    const m = SA.modal({ title: 'بحث عام', icon: 'search', size: 'md', body: h('div.sap-search', {}, h('div.input-wrap', {}, SA.icon('search'), input), list, h('p.t-caption.sap-search-foot', {}, 'النتائج تحترم صلاحياتك. ', h('kbd', {}, '↑↓'), ' للتنقل · ', h('kbd', {}, 'Enter'), ' للفتح · ', h('kbd', {}, 'Esc'), ' للإغلاق')) });
    const go = (it) => { m.close(); SA.nav(it.route); };
    function draw() {
      SA.clear(list); flat = []; const groups = SA.search.run(input.value);
      if (!groups.length) { list.appendChild(SA.empty({ icon: 'search', title: 'مفيش نتائج', text: 'جرّب كلمة تانية، أو ممكن ما عندكش صلاحية على النتيجة دي.' })); return; }
      groups.forEach((g) => { list.appendChild(h('div.sap-search-group', {}, g.label)); g.items.forEach((it) => { const i = flat.length; flat.push(it); list.appendChild(h('button.sap-search-item', { type: 'button', role: 'option', id: 'sr-' + i, 'aria-selected': 'false', onclick: () => go(it), onmousemove: () => { idx = i; mark(); } }, SA.icon(it.icon || 'grid'), h('span', {}, h('b', {}, it.title), it.sub ? h('small', {}, it.sub) : null))); }); });
      idx = 0; mark();
    }
    function mark() { flat.forEach((_, i) => { const e = document.getElementById('sr-' + i); if (e) { e.classList.toggle('is-active', i === idx); e.setAttribute('aria-selected', i === idx ? 'true' : 'false'); if (i === idx) e.scrollIntoView({ block: 'nearest' }); } }); }
    input.addEventListener('input', draw);
    input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(flat.length - 1, idx + 1); mark(); } else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); mark(); } else if (e.key === 'Enter' && flat[idx]) { e.preventDefault(); go(flat[idx]); } });
    draw(); setTimeout(() => input.focus(), 40);
  }
  S.openSearch = openSearch;
  function openShortcuts() {
    SA.modal({ title: 'اختصارات لوحة المفاتيح', icon: 'keyboard', size: 'sm', body: h('dl.sap-kv.sap-shortcuts', {}, [['Ctrl / ⌘ + K', 'بحث عام'], ['?', 'عرض هذه القائمة'], ['Esc', 'إغلاق النافذة/الدرج/القائمة'], ['Tab / Shift+Tab', 'تنقّل داخل النافذة (محبوس داخلها)'], ['← →', 'التنقل بين التبويبات'], ['Enter', 'فتح الصف المحدد في الجداول']].map((r) => [h('dt', {}, h('kbd', {}, r[0])), h('dd', {}, r[1])])) });
  }
  document.addEventListener('keydown', (e) => {
    if (!SA.session.isAuthed || SA.session.locked) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!SA.layers.count) openSearch(); }
    else if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '') && !SA.layers.count) { e.preventDefault(); openShortcuts(); }
  });

  /* ───────────────────────── bell ───────────────────────── */
  const LV = { urgent: ['عاجل', 'alert', 'is-urgent'], action: ['مطلوب إجراء', 'bolt', 'is-action'], info: ['للعلم', 'info', 'is-info'] };
  function openBell(anchor) {
    SA.closeMenu(); let filter = 'all';
    const pop = h('div.sap-pop.sap-bell-pop', { role: 'dialog', 'aria-label': 'الإشعارات' });
    const draw = () => {
      SA.clear(pop); const all = SA.notifications.forMe(); const list = filter === 'all' ? all : all.filter((n) => n.level === filter);
      pop.appendChild(h('div.sap-pop-head', {}, h('b', {}, 'الإشعارات'), h('button.sap-linkbtn', { type: 'button', onclick: () => { SA.notifications.markAll(); draw(); } }, 'تحديد الكل كمقروء')));
      pop.appendChild(h('div.sap-pop-filter', {}, [['all', 'الكل'], ['urgent', 'عاجل'], ['action', 'إجراء'], ['info', 'للعلم']].map((f) => { const c = f[0] === 'all' ? SA.notifications.unread() : SA.notifications.unread(f[0]); return h('button.sap-fpill' + (filter === f[0] ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(filter === f[0]), onclick: () => { filter = f[0]; draw(); } }, f[1], c ? h('span.sap-count', {}, c) : null); })));
      const body = h('div.sap-pop-list', {}, list.length ? list.map((n) => { const l = LV[n.level] || LV.info; const read = SA.notifications.isRead(n); return h('button.sap-notif.' + l[2] + (read ? '.is-read' : ''), { type: 'button', onclick: () => { SA.notifications.markRead(n.id); closePop(); if (n.link) { SA.nav(n.link); } } }, h('span.sap-notif-ico', {}, SA.icon(l[1])), h('span.sap-notif-body', {}, h('span.sap-notif-top', {}, h('b', {}, n.title), h('em', {}, l[0])), n.body ? h('small', {}, n.body) : null, h('time', {}, SA.fmt.rel(n.ts))), read ? null : h('i.sap-unread', { 'aria-label': 'غير مقروء' })); }) : SA.empty({ icon: 'bell', title: 'لا توجد إشعارات', text: 'مفيش حاجة جديدة هنا.' }));
      pop.appendChild(body);
    };
    const closePop = () => { pop.remove(); document.removeEventListener('mousedown', out, true); document.removeEventListener('keydown', esc, true); anchor.setAttribute('aria-expanded', 'false'); };
    const out = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    const esc = (e) => { if (e.key === 'Escape') { closePop(); anchor.focus(); } };
    draw(); document.body.appendChild(pop); anchor.setAttribute('aria-expanded', 'true');
    const r = anchor.getBoundingClientRect(); const w = pop.offsetWidth; let left = r.left + r.width / 2 - w / 2; left = Math.max(8, Math.min(left, innerWidth - w - 8)); pop.style.left = left + 'px'; pop.style.top = r.bottom + 8 + 'px';
    setTimeout(() => { document.addEventListener('mousedown', out, true); document.addEventListener('keydown', esc, true); }, 0);
  }

  /* ───────────────────────── account menu ───────────────────────── */
  function accountMenu(anchor) {
    const u = SA.session.user;
    SA.menu(anchor, [
      { label: 'حسابي: ' + u.name, icon: 'user', hidden: !SA.can('sa.users.view'), onClick: () => SA.nav('users/' + u.id) },
      { label: 'وضع الاختبار (Test Lab)', icon: 'flask', onClick: () => SA.tour && SA.tour.open() },
      { label: 'اختصارات لوحة المفاتيح', icon: 'keyboard', onClick: openShortcuts },
      { divider: true },
      { label: 'قفل الشاشة', icon: 'lock', onClick: () => SA.auth.lock('قفلت الشاشة يدويًا.') },
      { label: 'تسجيل الخروج', icon: 'logout', danger: true, onClick: () => SA.auth.logout('تم تسجيل الخروج.') }
    ]);
  }

  /* ───────────────────────── shell construction ───────────────────────── */
  let navEl, bellBtn, bellCount, crumbEl, bannerEl, subs = [];
  function spacesBlock() {
    const apps = SA.appsFor(); if (apps.length < 2) return null; const cur = SA.currentApp();
    return h('div.sap-spaces', {}, h('div.sap-nav-label', {}, 'المساحات'), apps.map((a) => h('button.sap-space' + (a.id === cur ? '.is-cur' : ''), { type: 'button', title: a.title, 'aria-pressed': String(a.id === cur), onclick: () => SA.setApp(a.id) }, SA.icon(a.icon), h('span.sap-nav-text', {}, a.title))));
  }
  function buildNav() {
    if (!navEl) return; SA.clear(navEl); const app = SA.currentApp();
    const bs = document.querySelector('.sap-brand small'); if (bs) bs.textContent = app === 'hr' ? 'الموارد البشرية' : 'Super Admin';
    const sp = spacesBlock(); if (sp) navEl.appendChild(sp);
    const mods = SA.navModules(app); const cur = SA.route && SA.route.module;
    SA.catalog.groupsOf(app).forEach((g) => {
      const items = mods.filter((m) => m.group === g.id); if (!items.length) return;
      navEl.appendChild(h('div.sap-nav-group', {}, h('div.sap-nav-label', {}, g.title), items.map((m) => {
        let b = null; try { b = m.badge ? m.badge() : null; } catch (e) { b = null; }
        return h('a.sap-nav-item', { href: '#/' + m.route, title: m.title, 'aria-current': cur && cur.id === m.id ? 'page' : null }, SA.icon(m.icon || 'grid'), h('span.sap-nav-text', {}, m.title), m.stub ? h('span.sap-soon', {}, 'قريبًا') : null, b ? h('span.sap-nav-badge', { 'aria-label': b + ' عنصر' }, b) : null);
      })));
    });
    if (!navEl.querySelector('.sap-nav-group')) navEl.appendChild(h('p.sap-nav-empty', {}, 'لا توجد شاشات متاحة لدورك في هذه المساحة.'));
    if (appSw) drawAppSwitch();
  }
  let appSw = null;
  function drawAppSwitch() {
    SA.clear(appSw); const apps = SA.appsFor(); appSw.hidden = apps.length < 2; const cur = SA.currentApp();
    apps.forEach((a) => appSw.appendChild(h('button.sap-appbtn', { type: 'button', 'aria-pressed': String(a.id === cur), onclick: () => SA.setApp(a.id) }, SA.icon(a.icon, 'icon-sm'), h('span', {}, a.short))));
  }
  function updateBell() {
    if (!bellBtn) return; const n = SA.notifications.unread(); const urg = SA.notifications.unread('urgent');
    bellCount.textContent = n > 9 ? '9+' : n; bellCount.hidden = !n; bellCount.classList.toggle('is-urgent', urg > 0);
    bellBtn.setAttribute('aria-label', 'الإشعارات' + (n ? ' — ' + n + ' غير مقروء' + (urg ? ' منها ' + urg + ' عاجل' : '') : ''));
  }
  function updateBanners() {
    if (!bannerEl) return; SA.clear(bannerEl);
    if (SA.sim.offline) bannerEl.appendChild(h('div.sap-banner.is-offline', { role: 'status' }, SA.icon('wifioff'), h('span.sap-banner-text', {}, 'لا يوجد اتصال (محاكاة). الشاشات قد لا تحمّل ولن تُنفَّذ الإجراءات.'), h('button.sap-linkbtn', { type: 'button', onclick: () => { SA.sim.offline = false; } }, 'إيقاف المحاكاة')));
    if (SA.session.permsStale) bannerEl.appendChild(h('div.sap-banner.is-perms', { role: 'status' }, SA.icon('shield'), h('span.sap-banner-text', {}, h('b', {}, 'تم تحديث صلاحياتك. '), 'الشاشات المعروضة قد تكون قديمة — أعد تحميل الصلاحيات.'), h('button.btn.btn-primary.btn-sm', { type: 'button', onclick: () => { SA.session.reloadPerms(); buildNav(); S.route(SA.route); SA.toast('تم تحميل الصلاحيات الجديدة', 'success'); } }, SA.icon('refresh', 'icon-sm'), 'إعادة تحميل الصلاحيات')));
  }
  function setCrumbs(items) {
    if (!crumbEl) return; SA.clear(crumbEl); const m = SA.route.module; const home = SA.homeRoute();
    const list = items || (m ? [{ label: (SA.catalog.groupsOf(m.app).find((g) => g.id === m.group) || {}).title }, { label: m.title }] : []);
    crumbEl.appendChild(h('li', {}, h('a', { href: '#/' + home }, m && m.app === 'hr' ? 'الموارد البشرية' : 'Super Admin')));
    list.forEach((c, i) => { crumbEl.appendChild(h('li.sap-crumb-sep', { 'aria-hidden': 'true' }, SA.icon('chevron', 'icon-sm icon-flip'))); crumbEl.appendChild(h('li', { 'aria-current': i === list.length - 1 ? 'page' : null }, c.href && i < list.length - 1 ? h('a', { href: c.href }, c.label) : c.label)); });
  }
  S.setCrumbs = setCrumbs;

  S.mount = function (host) {
    const mode = SA.isEss() ? 'ess' : 'shell';
    if (S.host === host && host.firstChild && host.dataset.mode === mode) return;
    if (S.cleanup) { try { S.cleanup(); } catch (e) { /* noop */ } S.cleanup = null; }
    S.host = host; host.dataset.mode = mode; SA.clear(host);
    if (mode === 'ess') return mountEss(host); subs.forEach((f) => f()); subs = [];
    const u = SA.session.user;
    const collapsed = !!(SA.store.get('ui') || {}).sidebarCollapsed;
    navEl = h('nav.sap-nav', { 'aria-label': 'القائمة الرئيسية' });
    bellCount = h('span.sap-bell-count', { hidden: true });
    bellBtn = h('button.sap-iconbtn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: (e) => openBell(e.currentTarget) }, SA.icon('bell'), bellCount);
    crumbEl = h('ol.crumbs.sap-crumbs');
    bannerEl = h('div.sap-banners');
    const app = h('div.sap-app' + (collapsed ? '.is-collapsed' : ''));
    const side = h('aside.sap-side', { id: 'sap-side' },
      h('div.sap-side-head', {}, h('img', { src: '../../assets/images/logo/mark.png', alt: '' }), h('div.sap-brand', {}, h('b', {}, 'EG'), h('small', {}, 'Super Admin')), h('button.sap-side-close', { type: 'button', 'aria-label': 'إغلاق القائمة', onclick: () => app.classList.remove('is-nav-open') }, SA.icon('x'))),
      navEl,
      h('div.sap-side-foot', {}, h('button.sap-collapse', { type: 'button', 'aria-label': 'طي/فرد القائمة', onclick: () => { const c = app.classList.toggle('is-collapsed'); SA.store.set('ui.sidebarCollapsed', c); } }, SA.icon('sidebar'), h('span.sap-nav-text', {}, 'طي القائمة'))));
    const top = h('header.sap-top', {},
      h('button.sap-iconbtn.sap-hamburger', { type: 'button', 'aria-label': 'فتح القائمة', 'aria-controls': 'sap-side', onclick: () => app.classList.add('is-nav-open') }, SA.icon('menu')),
      h('nav.sap-crumb-wrap', { 'aria-label': 'مسار التنقل' }, crumbEl),
      (appSw = h('div.sap-appswitch', { role: 'group', 'aria-label': 'المساحة', hidden: true })),
      h('div.sap-top-actions', {},
        h('button.sap-searchbtn', { type: 'button', onclick: openSearch, 'aria-label': 'بحث عام (Ctrl+K)' }, SA.icon('search'), h('span', {}, 'بحث…'), h('kbd', {}, 'Ctrl K')),
        bellBtn,
        h('button.sap-persona-chip', { type: 'button', 'aria-haspopup': 'menu', onclick: (e) => accountMenu(e.currentTarget) }, SA.avatar(u.name), h('span.sap-pc-text', {}, h('b', {}, u.name), h('small', {}, SA.roleName(u.roleId))), SA.icon('chevdown', 'icon-sm'))));
    S.main = h('main#sap-main.sap-content', { tabindex: '-1' });
    app.append(side, h('div.sap-scrim', { onclick: () => app.classList.remove('is-nav-open') }), h('div.sap-main', {}, top, bannerEl, S.main));
    host.append(h('a.sap-skip', { href: '#sap-main', onclick: (e) => { e.preventDefault(); S.main.focus(); } }, 'تخطي إلى المحتوى'), app);
    S.app = app;
    SA.applyUi();
    ['approvals', 'users', 'notifications', 'roles', 'modules', 'session', 'sessions'].forEach((p) => subs.push(SA.store.subscribe(p, () => { buildNav(); updateBell(); updateBanners(); })));
    subs.push(SA.store.subscribe('tour.sim', updateBanners), SA.store.subscribe('ui', SA.applyUi));
    subs.push(SA.on('modules', buildNav));
    // chip refresh when the user's own record changes
    buildNav(); updateBell(); updateBanners();
  };
  S.unmount = function () { subs.forEach((f) => f()); subs = []; if (S.cleanup) { try { S.cleanup(); } catch (e) { /* noop */ } S.cleanup = null; } S.host = null; };

  /* ───────────────────────── routing into the content area ───────────────────────── */
  function notFound(main, route) { main.appendChild(h('div.denied.sap-denied', {}, h('span.dot', {}, SA.icon('search')), h('strong', {}, 'الصفحة غير موجودة (404)'), h('span.t-muted', {}, 'الرابط ده مش موجود: ' + (route.path || '/')), SA.btn({ label: 'العودة للرئيسية', icon: 'home', kind: 'ghost', onClick: () => SA.nav(SA.homeRoute() || 'start') }))); }
  S.route = function (route) {
    if (!S.main) return;
    if (S.cleanup) { try { S.cleanup(); } catch (e) { console.error(e); } S.cleanup = null; }
    SA.closeMenu(); SA.clear(S.main); const m = route.module; const main = S.main;
    if (S.app) S.app.classList.remove('is-nav-open');
    buildNav(); updateBanners();
    const done = (title) => { document.title = (title ? title + ' — ' : '') + 'Super Admin · نموذج EG'; if (!S.crumbs) setCrumbs(); main.scrollTop = 0; window.scrollTo(0, 0); };
    S.crumbs = null;
    if (!route.segs.length) { const hr = SA.homeRoute(); if (hr) return SA.nav(hr, { replace: true }); main.appendChild(SA.empty({ icon: 'shield', title: 'لا توجد شاشات متاحة', text: 'دورك الحالي ما عندوش صلاحيات في Super Admin. اطلب من مدير النظام.' })); return done('بدون صلاحيات'); }
    if (!m) { notFound(main, route); setCrumbs([{ label: 'غير موجود' }]); S.crumbs = true; return done('404'); }
    if (!SA.canOpen(m)) {
      SA.audit('ACCESS.DENIED', { target: { type: 'route', id: '/' + route.path, label: m.title }, result: 'denied', reason: 'يتطلب ' + m.perm });
      main.appendChild(SA.denied({ perm: m.perm, title: 'هذه الشاشة ليست من صلاحياتك', text: 'شاشة «' + m.title + '» تحتاج صلاحية ' + SA.catalog.permLabel(m.perm) + '. اطلب من مدير النظام إضافتها لدورك. (تم تسجيل المحاولة.)' }));
      setCrumbs([{ label: m.title }, { label: 'ممنوع' }]); S.crumbs = true; return done('ممنوع');
    }
    if (m.app === 'hr' && !SA.appEnabled('hr')) { main.appendChild(h('div.denied.sap-denied', {}, h('span.dot', {}, SA.icon('layers')), h('strong', {}, 'موديول الموارد البشرية معطّل'), h('span.t-muted', {}, 'الإدارة عطّلت الموديول من «الموديولات» (SA-09). فعّله من هناك لتظهر شاشات HR.'), SA.can('sa.modules.toggle') ? SA.btn({ label: 'فتح الموديولات', kind: 'ghost', icon: 'layers', onClick: () => SA.nav('modules') }) : null)); setCrumbs([{ label: m.title }, { label: 'معطّل' }]); S.crumbs = true; return done('معطّل'); }
    const ctx = { path: route.rest, params: route.query, route, module: m, root: main, setCrumbs: (c) => { setCrumbs(c); S.crumbs = true; }, setTitle: (t) => { document.title = t + ' — Super Admin · نموذج EG'; } };
    const showError = (e) => { console.error(e); SA.clear(main); main.appendChild(SA.errorState({ text: SA.errorText(e), onRetry: () => S.route(SA.route) })); };
    try {
      const r = m.render(main, ctx);
      if (r && typeof r.then === 'function') r.then((c) => { if (S.main === main && SA.route === route) S.cleanup = typeof c === 'function' ? c : null; else if (typeof c === 'function') c(); }, showError);
      else S.cleanup = typeof r === 'function' ? r : null;
    } catch (e) { showError(e); }
    done(m.title);
    if (!document.activeElement || document.activeElement === document.body) { /* keep focus management light */ }
  };

  /* ───────────────────────── ESS shell ("خدماتي": simplified shell with big buttons) ───────────────────────── */
  function mountEss(host) {
    const u = SA.session.user;
    bellCount = h('span.sap-bell-count', { hidden: true });
    bellBtn = h('button.sap-iconbtn', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', onclick: (e) => openBell(e.currentTarget) }, SA.icon('bell'), bellCount);
    bannerEl = h('div.sap-banners'); navEl = null; crumbEl = null; appSw = null;
    S.main = h('main#sap-main.sap-content.sap-ess-main', { tabindex: '-1' });
    host.append(h('div.sap-ess', {}, h('header.sap-ess-top', {}, h('a.sap-ess-brand', { href: '#/hr/ess' }, h('img', { src: '../../assets/images/logo/mark.png', alt: '' }), h('span', {}, 'خدماتي')), h('div.sap-top-actions', {}, bellBtn, h('button.sap-persona-chip', { type: 'button', 'aria-haspopup': 'menu', onclick: (e) => accountMenu(e.currentTarget) }, SA.avatar(u.name), h('span.sap-pc-text', {}, h('b', {}, u.name), h('small', {}, SA.roleName(u.roleId))), SA.icon('chevdown', 'icon-sm')))), bannerEl, S.main));
    SA.applyUi(); subs.forEach((f) => f()); subs = [];
    ['approvals', 'notifications', 'roles', 'users', 'session', 'sessions', 'leaveRequests'].forEach((p) => subs.push(SA.store.subscribe(p, () => { updateBell(); updateBanners(); })));
    subs.push(SA.store.subscribe('tour.sim', updateBanners), SA.store.subscribe('ui', SA.applyUi));
    updateBell(); updateBanners();
  }

  /* ───────────────────────── HR navigation catalogue + placeholders (Phase 2 replaces each by SA.register with the SAME id) ───────────────────────── */
  const HR_NAV = [
    ['hr-dashboard', 'hr-dash', 'لوحة HR', 'dashboard', 'hr/dashboard', 'hr.dashboard.view', 'HR-27', 'لوحة HR الرئيسية: مؤشرات + صندوق طلبات تنتظر قراري'],
    ['hr-planning', 'hr-hire', 'الخطة والوظائف', 'building', 'hr/planning', 'hr.planning.view', 'HR-01', 'الوظائف والهيكل التنظيمي'],
    ['hr-requisitions', 'hr-hire', 'طلبات التوظيف', 'userplus', 'hr/requisitions', 'hr.requisitions.view', 'HR-02', 'طلب التوظيف والاعتماد (نوع hiring_requisition في صندوق الاعتمادات)'],
    ['hr-candidates', 'hr-hire', 'المرشحون', 'users', 'hr/candidates', 'hr.candidates.view', 'HR-03', 'الاستقطاب والمقابلات (ATS)'],
    ['hr-offers', 'hr-hire', 'العروض والعقود', 'doc', 'hr/offers', 'hr.offers.view', 'HR-04', 'العرض والكشف الطبي والعقد'],
    ['hr-employees', 'hr-emp', 'الدليل والملفات', 'id', 'hr/employees', 'hr.employees.view', 'HR-06', 'دليل الموظفين وملف الموظف (إخفاء حقلي للأجور/الرقم القومي)'],
    ['hr-onboarding', 'hr-emp', 'التعيين والتجربة', 'check', 'hr/onboarding', 'hr.onboarding.view', 'HR-05', 'التعيين الأول وفترة التجربة'],
    ['hr-changes', 'hr-emp', 'التغييرات الوظيفية', 'swap', 'hr/changes', 'hr.changes.view', 'HR-07', 'نقل/ترقية/تغيير مرتب (salary_change)'],
    ['hr-custody', 'hr-emp', 'العهدة والزي', 'box', 'hr/custody', 'hr.custody.view', 'HR-08', 'العهدة والزي وPPE'],
    ['hr-contractors', 'hr-emp', 'المقاولون', 'truck', 'hr/contractors', 'hr.contractors.view', 'HR-34', 'عمالة المقاولين واليومية'],
    ['hr-shifts', 'hr-time', 'الورديات', 'clock', 'hr/shifts', 'hr.shifts.view', 'HR-09', 'الورديات والجداول'],
    ['hr-attendance', 'hr-time', 'الحضور والاستثناءات', 'activity', 'hr/attendance', 'hr.attendance.view', 'HR-10', 'الحضور والانصراف'],
    ['hr-leave', 'hr-time', 'الإجازات', 'clipboard', 'hr/leave', 'hr.leave.view', 'HR-11', 'الإجازات (HR.LEAVE.*)'],
    ['hr-overtime', 'hr-time', 'الأوفرتايم', 'bolt', 'hr/overtime', 'hr.overtime.view', 'HR-12', 'الأوفرتايم والبدلات'],
    ['hr-salary', 'hr-pay', 'هيكل المرتب', 'coins', 'hr/salary', 'hr.salary_structure.view', 'HR-13', 'هيكل المرتب ومكوناته (T3 — hr.salary.view)'],
    ['hr-payroll', 'hr-pay', 'دورة المرتبات', 'receipt', 'hr/payroll', 'hr.payroll.view', 'HR-14', 'دورة المرتبات PR-2026-10 (تجهيز/اعتماد/إطلاق منفصلة)'],
    ['hr-loans', 'hr-pay', 'السلف والقروض', 'coins', 'hr/loans', 'hr.loans.view', 'HR-15', 'السلف والقروض (advance)'],
    ['hr-payments', 'hr-pay', 'الصرف ومفردات المرتب', 'download', 'hr/payments', 'hr.payments.view', 'HR-16', 'الصرف وملفات البنك'],
    ['hr-gov', 'hr-pay', 'التأمينات والضريبة', 'shield', 'hr/gov', 'hr.gov.view', 'HR-17', 'التأمينات والضريبة والإقرارات'],
    ['hr-performance', 'hr-dev', 'الأداء والتقييم', 'gauge', 'hr/performance', 'hr.performance.view', 'HR-18', 'الأداء'],
    ['hr-training', 'hr-dev', 'التدريب والمهارات', 'star', 'hr/training', 'hr.training.view', 'HR-19', 'التدريب ومصفوفة المهارات'],
    ['hr-disciplinary', 'hr-dev', 'الجزاءات والتظلمات', 'alert', 'hr/disciplinary', 'hr.disciplinary.view', 'HR-20', 'الجزاءات (T4: hr.discipline.view)'],
    ['hr-ohs', 'hr-dev', 'السلامة والصحة المهنية', 'shield', 'hr/ohs', 'hr.ohs.view', 'HR-21', 'الحوادث واللياقة الطبية (T4: hr.medical.view)'],
    ['hr-recognition', 'hr-dev', 'التحفيز والتقدير', 'sparkle', 'hr/recognition', 'hr.recognition.view', 'HR-22', 'التحفيز'],
    ['hr-termination', 'hr-exit', 'الاستقالات والإنهاء', 'logout', 'hr/termination', 'hr.termination.view', 'HR-23', 'الاستقالة وإنهاء الخدمة'],
    ['hr-clearance', 'hr-exit', 'إخلاء الطرف', 'check', 'hr/clearance', 'hr.clearance.view', 'HR-24', 'الإخلاء'],
    ['hr-settlement', 'hr-exit', 'المخالصات النهائية', 'receipt', 'hr/settlement', 'hr.settlement.view', 'HR-25', 'المخالصة (حساب/اعتماد/صرف منفصلة)'],
    ['hr-archive', 'hr-exit', 'الأرشيف', 'inbox', 'hr/archive', 'hr.archive.view', 'HR-26', 'الأرشيف وإعادة التعيين'],
    ['hr-documents', 'hr-docs', 'القوالب وسجل الإصدار', 'doc', 'hr/documents', 'hr.documents.view', 'HR-29', 'مستندات HR وخطاباتها'],
    ['hr-reports', 'hr-docs', 'التقارير', 'list', 'hr/reports', 'hr.reports.view', 'HR-28', 'كتالوج التقارير'],
    ['hr-compliance', 'hr-set', 'الامتثال', 'shield', 'hr/compliance', 'hr.compliance.view', 'HR-30', 'الامتثال والإعدادات القانونية'],
    ['hr-settings', 'hr-set', 'السياسات والإشعارات', 'settings', 'hr/settings', 'hr.settings.view', 'HR-33', 'سياسات HR'],
    ['hr-acl', 'hr-set', 'صلاحيات HR', 'key', 'hr/acl', 'hr.acl.view', 'HR-31', 'الصلاحيات والسرية (قراءة؛ التعديل من SA الأدوار)'],
    ['hr-mss', 'hr-dash', 'فريقي', 'users', 'hr/team', 'hr.mss.use', 'HR-32', 'واجهة المشرف (MSS)']
  ];
  SA.hrNav = HR_NAV.map((r, i) => ({ id: r[0], group: r[1], title: r[2], icon: r[3], route: r[4], perm: r[5], feature: r[6], desc: r[7], order: i }));
  function stubRender(def) {
    return function (root, ctx) {
      ctx.setCrumbs([{ label: (SA.catalog.hrGroups.find((g) => g.id === def.group) || {}).title }, { label: def.title }]);
      root.append(SA.pageHead({ title: def.title, desc: def.desc, tags: [SA.tag('new', def.feature)] }),
        SA.card({}, SA.empty({ icon: def.icon, title: 'الشاشة قيد البناء (' + def.feature + ')', text: 'يبنيها وكيل Phase 2 على نفس الـAPI (SA.register بنفس المعرّف «' + def.id + '»). الصلاحية والتنقل والتدقيق شغّالة من الآن.' })),
        SA.card({ title: 'بيانات مترابطة جاهزة' }, h('p.t-muted', {}, 'البيانات التجريبية موجودة في الـstore: ', h('code', {}, 'employees · positions · leaveRequests · attendance · payrollRuns · loans · requisitions · candidates · salaryChanges · settlements'), '. طلبات HR تظهر في صندوق الاعتمادات المشترك وأحداثها HR.* في سجل التدقيق.')));
    };
  }
  SA.hrNav.forEach((d) => SA.register({ id: d.id, app: 'hr', group: d.group, title: d.title, icon: d.icon, route: d.route, perm: d.perm, order: d.order, desc: d.desc, stub: true, render: stubRender(d) }));

  /* ESS home fallback ("خدماتي") — big buttons. Phase 2 replaces it by registering id 'hr-ess' again. */
  SA.register({ id: 'hr-ess', app: 'hr', group: 'hr-dash', title: 'خدماتي', icon: 'user', route: 'hr/ess', perm: 'hr.ess.use', order: 0, desc: 'الخدمة الذاتية للموظف', stub: true, nav: false,
    render(root) {
      const u = SA.session.user; const emp = (SA.store.get('employees') || []).find((e) => e.userId === u.id);
      const bal = emp ? (SA.store.get('leaveBalances') || []).find((b) => b.employeeId === emp.id && b.type === 'annual') : null;
      const mine = emp ? (SA.store.get('leaveRequests') || []).filter((r) => r.employeeId === emp.id) : [];
      const tiles = [['clipboard', 'طلب إجازة', 'اطلب إجازة واعرف رصيدك'], ['coins', 'مفردات المرتب', 'اطلع على مرتبك الشهري'], ['user', 'بياناتي', 'بياناتك الوظيفية'], ['inbox', 'طلباتي', 'متابعة طلباتك'], ['doc', 'إقراراتي', 'مستندات تنتظر توقيعك'], ['phone', 'تواصل مع HR', 'استفسار أو شكوى']];
      root.append(h('div.sap-ess-hello', {}, h('h1', {}, 'أهلًا يا ' + u.name.split(' ')[0]), h('p.t-muted', {}, emp ? emp.empNo + ' · ' + SA.deptName(emp.departmentId) : 'خدماتي')),
        h('div.sap-ess-stats', {}, h('div.card', {}, h('span.kpi-label', {}, 'رصيد الإجازة السنوية (تجريبي)'), h('b.kpi-value.num', {}, bal ? bal.balanceDays : '—'), h('small.t-muted', {}, 'يوم')), h('div.card', {}, h('span.kpi-label', {}, 'طلبات إجازة'), h('b.kpi-value.num', {}, mine.length), h('small.t-muted', {}, mine.filter((r) => r.status === 'pending').length + ' بانتظار الاعتماد'))),
        h('div.sap-ess-tiles', {}, tiles.map((t) => h('button.sap-ess-tile', { type: 'button', onclick: () => SA.toast('«' + t[1] + '» هتتبني في Phase 2 (HR-32).', 'info') }, SA.icon(t[0], 'icon-lg'), h('b', {}, t[1]), h('small', {}, t[2])))),
        SA.alert('info', 'واجهة مبسطة بأزرار كبيرة. الموظف يرى بياناته فقط (نطاق «ذاتي») — ولا يرى أي شاشة إدارة.'));
    } });
})();
