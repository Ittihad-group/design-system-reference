/* EG Super Admin prototype — core.js
   Defines the global `SA` namespace: DOM builder, store (persisted), event bus, catalogs, session/permissions,
   audit + notifications, simulation switches, router + module registry, RBAC helpers.
   Classic script (no modules, no fetch) so it works from file://. Everything is documented in docs/super-admin/prototype-guide.md */
(function (global) {
  'use strict';
  const SA = (global.SA = global.SA || {});
  SA.version = '1.0.0';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ───────────────────────── utils ───────────────────────── */
  SA.clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  SA.deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  SA.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  SA.debounce = (fn, ms) => { let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(() => fn.apply(c, a), ms); }; };
  SA.uid = (prefix) => (prefix || 'ID') + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  SA.$ = (sel, root) => (root || document).querySelector(sel);
  SA.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  SA.clear = (el) => { while (el && el.firstChild) el.removeChild(el.firstChild); return el; };
  SA.pick = (obj, keys) => { const o = {}; keys.forEach((k) => { if (obj && k in obj) o[k] = obj[k]; }); return o; };
  SA.isMobile = () => global.matchMedia && global.matchMedia('(max-width: 900px)').matches;

  /* ───────────────────────── hyperscript ───────────────────────── */
  const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'required', 'readOnly', 'multiple', 'indeterminate', 'open', 'tabIndex', 'autofocus', 'htmlFor']);
  function parseTag(tag) {
    const m = /^([a-zA-Z][\w-]*)?((?:[.#][\w-]+)*)$/.exec(tag);
    if (!m) return { name: tag, cls: [], id: null };
    const cls = []; let id = null;
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') cls.push(v); else id = v; });
    return { name: m[1] || 'div', cls, id };
  }
  function append(el, c) {
    if (c == null || c === false || c === true) return;
    if (Array.isArray(c)) { c.forEach((x) => append(el, x)); return; }
    if (c instanceof Node) { el.appendChild(c); return; }
    el.appendChild(document.createTextNode(String(c)));
  }
  /** SA.h('button.btn.btn-primary', {onclick: fn, 'aria-label': 'x'}, 'text', childNode, [more]) */
  SA.h = function (tag, attrs) {
    const t = parseTag(tag);
    const el = document.createElement(t.name);
    if (t.id) el.id = t.id;
    if (t.cls.length) el.className = t.cls.join(' ');
    let children = Array.prototype.slice.call(arguments, 2);
    if (attrs && (attrs instanceof Node || typeof attrs === 'string' || typeof attrs === 'number' || Array.isArray(attrs))) { children = [attrs].concat(children); attrs = null; }
    const deferred = [];
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class' || k === 'className') {
          const cs = Array.isArray(v) ? v.filter(Boolean).join(' ') : typeof v === 'object' ? Object.keys(v).filter((x) => v[x]).join(' ') : v;
          el.className = (el.className ? el.className + ' ' : '') + cs;
        } else if (k === 'style') {
          if (typeof v === 'string') el.style.cssText = v; else Object.keys(v).forEach((s) => (s.indexOf('--') === 0 ? el.style.setProperty(s, v[s]) : (el.style[s] = v[s])));
        } else if (k === 'dataset') Object.keys(v).forEach((d) => (el.dataset[d] = v[d]));
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'ref' && typeof v === 'function') deferred.push(() => v(el));
        else if (PROPS.has(k)) deferred.push(() => { el[k === 'htmlFor' ? 'htmlFor' : k] = v; });
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      });
    }
    append(el, children);
    deferred.forEach((f) => f());
    return el;
  };
  /* Safety net: Element.append(null|undefined|false) would print "null" — skip falsy args and flatten arrays (prototype-wide). */
  (function () {
    const native = Element.prototype.append;
    Element.prototype.append = function () {
      const out = []; const flat = (a) => a.forEach((x) => { if (Array.isArray(x)) flat(x); else if (x != null && x !== false && x !== true) out.push(x); });
      flat(Array.prototype.slice.call(arguments)); return native.apply(this, out);
    };
  })();
  /** SVG icon from the sprite: SA.icon('users', 'icon-sm') */
  SA.icon = function (name, cls) {
    const s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('class', 'icon' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(SVG_NS, 'use');
    u.setAttribute('href', '#i-' + name);
    s.appendChild(u);
    return s;
  };
  SA.icons = {
    _sprite: null,
    add(name, inner) {
      if (!this._sprite) {
        this._sprite = document.createElementNS(SVG_NS, 'svg');
        this._sprite.setAttribute('style', 'display:none'); this._sprite.setAttribute('aria-hidden', 'true');
        document.body.insertBefore(this._sprite, document.body.firstChild);
      }
      if (document.getElementById('i-' + name)) return;
      const sym = document.createElementNS(SVG_NS, 'symbol');
      sym.setAttribute('id', 'i-' + name); sym.setAttribute('viewBox', '0 0 24 24'); sym.innerHTML = inner;
      this._sprite.appendChild(sym);
    },
    addMany(map) { Object.keys(map).forEach((k) => this.add(k, map[k])); }
  };

  /* ───────────────────────── event bus ───────────────────────── */
  const bus = {};
  SA.on = (ev, fn) => { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = (bus[ev] || []).filter((f) => f !== fn); }; };
  SA.emit = (ev, data) => { (bus[ev] || []).slice().forEach((f) => { try { f(data); } catch (e) { console.error('[SA.emit]', ev, e); } }); };
  /** Record a test-lab trackable event (missions can detect `{event:'name'}`). */
  SA.track = (name, data) => { SA.emit('track', { name, data, ts: Date.now() }); };

  /* ───────────────────────── store ───────────────────────── */
  const LS_KEY = 'eg.sa.proto.v1';
  const SEED_VERSION = 4;
  let state = null, memCopy = null, saveTimer = null;
  const subs = [];
  let pendingCbs = new Set(), flushQueued = false;
  const LS = (function () { try { const s = global.localStorage; const k = '__sa_t'; s.setItem(k, '1'); s.removeItem(k); return s; } catch (e) { return null; } })();
  function readRaw() { try { return LS ? LS.getItem(LS_KEY) : memCopy; } catch (e) { return memCopy; } }
  function writeRaw() {
    const s = JSON.stringify(state);
    try { if (LS) LS.setItem(LS_KEY, s); else memCopy = s; } catch (e) { memCopy = s; }
  }
  function segs(path) { return path === '' || path == null ? [] : String(path).split('.'); }
  function getIn(root, path) { let c = root; for (const k of segs(path)) { if (c == null) return undefined; c = c[k]; } return c; }
  function related(a, b) { // a,b are dotted paths; related if one is a prefix (segment aware) of the other
    if (a === '' || b === '') return true;
    return a === b || a.indexOf(b + '.') === 0 || b.indexOf(a + '.') === 0;
  }
  function notify(path) {
    subs.forEach((s) => { if (related(s.path, path)) pendingCbs.add(s.cb); });
    if (!flushQueued) {
      flushQueued = true;
      Promise.resolve().then(() => {
        flushQueued = false; const cbs = Array.from(pendingCbs); pendingCbs = new Set();
        cbs.forEach((cb) => { try { cb(); } catch (e) { console.error('[SA.store]', e); } });
      });
    }
    clearTimeout(saveTimer); saveTimer = setTimeout(writeRaw, 60);
  }
  SA.store = {
    /** Load persisted state or build the seed. `factory` = SA.seed.build */
    init(factory) {
      let s = null;
      try { const raw = readRaw(); s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
      if (!s || !s.meta || s.meta.v !== SEED_VERSION) { s = factory(); s.meta = s.meta || {}; s.meta.v = SEED_VERSION; }
      state = s; writeRaw(); return state;
    },
    /** Live reference (do NOT mutate directly — use set/update). path '' = whole state. */
    get(path) { return getIn(state, path); },
    set(path, value) {
      const ks = segs(path);
      if (!ks.length) { state = value; notify(''); return value; }
      let c = state; for (let i = 0; i < ks.length - 1; i++) { if (c[ks[i]] == null) c[ks[i]] = {}; c = c[ks[i]]; }
      c[ks[ks.length - 1]] = value; notify(path); return value;
    },
    /** update(path, draft => { mutate draft }) or update(path, v => newValue) */
    update(path, fn) { const cur = getIn(state, path); const r = fn(cur); const val = r === undefined ? cur : r; return this.set(path, val); },
    /** subscribe('users', cb) — cb fires (batched, async) when 'users' or any child/parent path changes. Returns unsubscribe. */
    subscribe(path, cb) { const s = { path: path || '', cb }; subs.push(s); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; },
    find(coll, id) { return (state[coll] || []).find((x) => x.id === id) || null; },
    /** patch('users','U-1',{status:'disabled'}) → merged record */
    patch(coll, id, patch) { let out = null; this.update(coll, (list) => { const r = list.find((x) => x.id === id); if (r) { Object.assign(r, typeof patch === 'function' ? patch(r) : patch); out = r; } }); return out; },
    insert(coll, rec, atStart) { this.update(coll, (list) => { if (atStart) list.unshift(rec); else list.push(rec); }); return rec; },
    remove(coll, id) { this.update(coll, (list) => list.filter((x) => x.id !== id)); },
    flush() { clearTimeout(saveTimer); writeRaw(); },
    hasLocalStorage: !!LS,
    reset() { try { if (LS) LS.removeItem(LS_KEY); } catch (e) { /* noop */ } memCopy = null; },
    /** Next sequential id: nextId('U') → 'U-25' (based on max numeric suffix in the collection) */
    nextId(coll, prefix, width) {
      const list = state[coll] || []; let max = 0;
      list.forEach((r) => { const m = new RegExp('^' + prefix + '-(\\d+)$').exec(r.id || ''); if (m) max = Math.max(max, +m[1]); });
      return prefix + '-' + String(max + 1).padStart(width || 2, '0');
    }
  };
  global.addEventListener('beforeunload', () => { try { writeRaw(); } catch (e) { /* noop */ } });
  /** Wipe persisted demo data and reload (Test Lab → "إعادة ضبط") */
  SA.resetDemo = function () { SA.store.reset(); try { sessionStorage.clear(); } catch (e) { /* noop */ } location.hash = '#/start'; location.reload(); };

  /* ───────────────────────── formatting ───────────────────────── */
  const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const p2 = (n) => String(n).padStart(2, '0');
  SA.fmt = {
    date(iso) { if (!iso) return '—'; const d = new Date(iso); return p2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); },
    time(iso) { if (!iso) return '—'; const d = new Date(iso); return p2(d.getHours()) + ':' + p2(d.getMinutes()); },
    dt(iso) { return iso ? SA.fmt.date(iso) + ' · ' + SA.fmt.time(iso) : '—'; },
    iso(iso) { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); },
    rel(iso) {
      if (!iso) return 'لم يسجّل دخولًا بعد';
      const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
      if (s < 45) return 'الآن';
      const m = Math.round(s / 60); if (m < 60) return 'منذ ' + (m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : m <= 10 ? m + ' دقائق' : m + ' دقيقة');
      const h = Math.round(m / 60); if (h < 24) return 'منذ ' + (h === 1 ? 'ساعة' : h === 2 ? 'ساعتين' : h <= 10 ? h + ' ساعات' : h + ' ساعة');
      const d = Math.round(h / 24); if (d < 30) return 'منذ ' + (d === 1 ? 'يوم' : d === 2 ? 'يومين' : d <= 10 ? d + ' أيام' : d + ' يومًا');
      return SA.fmt.date(iso);
    },
    num(n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('en-US'); },
    money(n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('en-US') + ' ج.م'; },
    initials(name) { const p = String(name || '?').trim().split(/\s+/); return (p[0][0] || '') + (p[1] ? p[1][0] : ''); }
  };

  /* ───────────────────────── catalogs ───────────────────────── */
  const C = (SA.catalog = {});
  C.groups = [
    { id: 'overview', title: 'نظرة عامة', order: 1 },
    { id: 'access', title: 'الوصول', order: 2 },
    { id: 'org', title: 'المنظمة', order: 3 },
    { id: 'policies', title: 'السياسات', order: 4 },
    { id: 'data', title: 'البيانات', order: 5 },
    { id: 'oversight', title: 'الرقابة', order: 6 },
    { id: 'reports', title: 'التقارير', order: 7 },
    { id: 'system', title: 'النظام', order: 8 }
  ];
  /** Apps ("المساحات"): sa = Super Admin, hr = الموارد البشرية. Modules register with app:'sa'|'hr'. */
  C.apps = [{ id: 'sa', title: 'Super Admin', icon: 'shield', short: 'الإدارة' }, { id: 'hr', title: 'الموارد البشرية', icon: 'id', short: 'HR' }];
  /** HR nav groups (docs/hr/README.md §5). Module `group` for HR modules ∈ these ids. */
  C.hrGroups = [
    { id: 'hr-dash', title: 'لوحة HR', order: 1 }, { id: 'hr-hire', title: 'التوظيف', order: 2 }, { id: 'hr-emp', title: 'الموظفون', order: 3 }, { id: 'hr-time', title: 'الوقت', order: 4 },
    { id: 'hr-pay', title: 'المرتبات', order: 5 }, { id: 'hr-dev', title: 'التطوير والحماية', order: 6 }, { id: 'hr-exit', title: 'الإنهاء', order: 7 }, { id: 'hr-docs', title: 'المستندات والتقارير', order: 8 }, { id: 'hr-set', title: 'الإعدادات', order: 9 }
  ];
  C.groupsOf = (app) => (app === 'hr' ? C.hrGroups : C.groups);
  C.actions = [['view', 'عرض'], ['create', 'إضافة'], ['edit', 'تعديل'], ['delete', 'حذف'], ['approve', 'اعتماد'], ['export', 'تصدير']];
  C.scopes = [['own', 'ذاتي'], ['team', 'الفريق'], ['department', 'القسم'], ['all', 'الكل']];
  C.scopeHelp = { own: 'سجلاته هو فقط', team: 'سجلاته وسجلات مرؤوسيه (حسب المدير المباشر)', department: 'كل سجلات قسمه', all: 'كل السجلات' };
  /** Business modules shown in the role matrix (resource × 6 actions). moduleKey links to `modules` collection. */
  C.resources = [
    { id: 'sales', label: 'المبيعات', sub: 'عروض الأسعار والطلبات', group: 'المبيعات والعملاء', moduleKey: 'sales', scoped: true },
    { id: 'customers', label: 'العملاء', sub: 'قوائم العملاء والأسعار', group: 'المبيعات والعملاء', moduleKey: 'customers', scoped: true },
    { id: 'products', label: 'المنتجات', sub: 'الكتالوج والمواصفات', group: 'المنتجات والمخزون', moduleKey: 'products', scoped: false },
    { id: 'inventory', label: 'المخزون', sub: 'الأرصدة والحركات', group: 'المنتجات والمخزون', moduleKey: 'inventory', scoped: true },
    { id: 'manufacturing', label: 'التصنيع', sub: 'أوامر التشغيل', group: 'التصنيع والمشتريات', moduleKey: 'manufacturing', scoped: true },
    { id: 'purchasing', label: 'المشتريات', sub: 'الموردون وأوامر الشراء', group: 'التصنيع والمشتريات', moduleKey: 'purchasing', scoped: true },
    { id: 'finance', label: 'المالية', sub: 'الفواتير والتحصيل', group: 'المالية والموارد', moduleKey: 'finance', scoped: true },
    { id: 'hr', label: 'الموارد البشرية', sub: 'الموظفون والمرتبات', group: 'المالية والموارد', moduleKey: 'hr', scoped: true },
    { id: 'quality', label: 'الجودة', sub: 'الفحوص والعيوب', group: 'الجودة', moduleKey: 'quality', scoped: false, locked: 'خارج v1 قبل اعتماد فريق المنتج (BR-ROL-03 · بند 34)' }
  ];
  /** Sensitive permission keys (SA-03). `warn` is the wording shown before granting. */
  C.sensitive = [
    { key: 'data.cost.view', label: 'عرض التكاليف الداخلية', desc: 'تكلفة الإنتاج والشراء وهوامش الأصناف.', warn: 'هتفتح بيانات سرية: التكاليف الداخلية. موظف المبيعات لا يجب أن يراها (بند 25).', tag: 'approved' },
    { key: 'data.profit.view', label: 'عرض أرباح المصنع', desc: 'الأرباح والهوامش الإجمالية للمصنع.', warn: 'هتفتح بيانات سرية: أرباح المصنع. موظف المبيعات لا يجب أن يراها (بند 25).', tag: 'approved' },
    { key: 'hr.salary.view', alias: 'data.wages.view', label: 'عرض الأجور (hr.salary.view)', desc: 'الأجور والبدلات والسلف. HR ومن تمنحه الإدارة صراحةً — General Manager ليس تلقائيًا (بند 46). نفس المفتاح data.wages.view في كتالوج SA.', warn: 'هتفتح بيانات سرية: أجور الموظفين (بند 46). هيتسجّل أي اطلاع عليها.', tag: 'pending' },
    { key: 'finance.voucher.create', label: 'إنشاء سند صرف', desc: 'تجهيز سند الصرف فقط.', warn: 'إنشاء السند منفصل عن اعتماده وتنفيذه. نفس الشخص لا يعتمد ما أنشأه.', tag: 'pending' },
    { key: 'finance.voucher.approve', label: 'اعتماد سند صرف', desc: 'اعتماد سند الصرف قبل التنفيذ.', warn: 'عملية مالية: لا تمنحها لمن يملك إنشاء أو تنفيذ نفس السند.', tag: 'pending' },
    { key: 'finance.voucher.execute', label: 'تنفيذ سند صرف', desc: 'الصرف الفعلي بعد الاعتماد.', warn: 'عملية مالية: لا تمنحها لمن يملك إنشاء أو اعتماد نفس السند.', tag: 'pending' },
    { key: 'sales.discount.approve', label: 'اعتماد الخصم', desc: 'اعتماد خصومات تتجاوز حد المندوب.', warn: 'هتسمح باعتماد خصومات تؤثر على الإيراد. الحدود نفسها {Open} (بند 33).', tag: 'approved' },
    { key: 'sales.order.confirm', label: 'تأكيد الطلب', desc: 'تأكيد طلبات البيع الكبيرة.', warn: 'هتسمح بتأكيد طلبات بيع. لا تأكيد مالي دون صلاحية (بند 25).', tag: 'approved' },
    { key: 'hr.medical.view', label: 'عرض السجلات الطبية', desc: 'T4 — OHS وHR Manager فقط.', warn: 'هتفتح بيانات طبية (T4 سري جدًا).', tag: 'new', app: 'hr' },
    { key: 'hr.discipline.view', label: 'عرض الجزاءات والتحقيقات', desc: 'T4 — الجزاءات والتحقيقات والتظلمات.', warn: 'هتفتح بيانات تأديبية (T4).', tag: 'new', app: 'hr' },
    { key: 'hr.legal.view', label: 'عرض القضايا', desc: 'T4 — القضايا العمالية.', warn: 'هتفتح بيانات قانونية (T4).', tag: 'new', app: 'hr' },
    { key: 'hr.pii.reveal', label: 'كشف الرقم القومي/الحساب البنكي كاملًا', desc: 'T2 — كل كشف يُسجَّل.', warn: 'هتسمح بكشف بيانات شخصية كاملة. كل كشف بيتسجّل.', tag: 'new', app: 'hr' },
    { key: 'hr.export.sensitive', label: 'تصدير بيانات حساسة (T2+)', desc: 'تصدير بيانات T2 فأعلى (بند 25/46).', warn: 'هتفتح تصدير بيانات حساسة خارج النظام.', tag: 'new', app: 'hr' },
    { key: 'hr.payroll.prepare', label: 'تجهيز كشف المرتبات (maker)', desc: 'تجهيز الكشف فقط — منفصل عن الاعتماد والإطلاق.', warn: 'فصل مهام: لا تمنحها لمن يملك اعتماد أو إطلاق نفس الكشف.', tag: 'pending', app: 'hr' },
    { key: 'hr.payroll.approve', label: 'اعتماد كشف المرتبات', desc: 'مراجعة/اعتماد الكشف.', warn: 'فصل مهام: لا تمنحها لمن يجهّز نفس الكشف.', tag: 'pending', app: 'hr' },
    { key: 'hr.payroll.release', label: 'إطلاق/صرف كشف المرتبات', desc: 'إطلاق الصرف بعد الاعتماد (سند PV-).', warn: 'عملية مالية: منفصلة عن التجهيز والاعتماد.', tag: 'pending', app: 'hr' },
    { key: 'hr.final_settlement.calculate', label: 'حساب المخالصة النهائية', desc: 'من يحسب غير من يصرف.', warn: 'فصل مهام: منفصلة عن الاعتماد والصرف.', tag: 'new', app: 'hr' },
    { key: 'hr.final_settlement.approve', label: 'اعتماد المخالصة النهائية', desc: 'اعتماد قيمة المخالصة.', warn: 'فصل مهام.', tag: 'new', app: 'hr' },
    { key: 'hr.final_settlement.pay', label: 'صرف المخالصة النهائية', desc: 'الصرف الفعلي.', warn: 'فصل مهام.', tag: 'new', app: 'hr' },
    { key: 'hr.salary.change.request', label: 'طلب تغيير مرتب', desc: 'منفصل عن الاعتماد.', warn: 'من ينشئ تغيير مرتب لا يعتمده.', tag: 'new', app: 'hr' },
    { key: 'hr.salary.change.approve', label: 'اعتماد تغيير مرتب', desc: 'منفصل عن الطلب.', warn: 'من ينشئ تغيير مرتب لا يعتمده.', tag: 'new', app: 'hr' },
    { key: 'finance.reports.export', label: 'تصدير التقارير المالية', desc: 'تنزيل ملفات تقارير مالية.', warn: 'هتفتح تصدير بيانات مالية خارج النظام.', tag: 'new' }
  ];
  /** Super Admin permission keys `sa.<res>.<action>` (docs/00 catalogue). tag: new = not in the reference yet */
  C.perms = [
    { res: 'overview', label: 'النظرة العامة', group: 'overview', tag: 'new', actions: [['view', 'عرض']] },
    { res: 'users', label: 'المستخدمون', group: 'access', actions: [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل'], ['disable', 'تعطيل/تفعيل'], ['unlock', 'فك القفل'], ['reset_password', 'إعادة تعيين كلمة المرور'], ['force_logout', 'خروج إجباري'], ['export', 'تصدير']] },
    { res: 'roles', label: 'الأدوار والصلاحيات', group: 'access', actions: [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل'], ['delete', 'حذف']] },
    { res: 'superadmin', label: 'أمان حسابات Super Admin', group: 'access', tag: 'new', actions: [['view', 'عرض'], ['manage', 'إدارة']] },
    { res: 'sessions', label: 'الجلسات والأجهزة', group: 'access', actions: [['view', 'عرض'], ['revoke', 'إنهاء']] },
    { res: 'dealers', label: 'حسابات التجار', group: 'access', actions: [['view', 'عرض'], ['review', 'مراجعة'], ['suspend', 'إيقاف'], ['override', 'تجاوز قرار المبيعات']] },
    { res: 'company', label: 'الشركة والمصنع', group: 'org', actions: [['view', 'عرض'], ['edit', 'تعديل']] },
    { res: 'departments', label: 'الأقسام', group: 'org', actions: [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل'], ['disable', 'تعطيل']] },
    { res: 'modules', label: 'الموديولات', group: 'org', actions: [['view', 'عرض'], ['toggle', 'تفعيل/إخفاء']] },
    { res: 'warehouses', label: 'المخازن', group: 'org', actions: [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل'], ['disable', 'تعطيل']] },
    { res: 'policies.approvals', label: 'سياسة الاعتماد والخصم', group: 'policies', actions: [['view', 'عرض'], ['edit', 'تعديل']] },
    { res: 'policies.numbering', label: 'الترقيم والقوالب', group: 'policies', actions: [['view', 'عرض'], ['edit', 'تعديل']] },
    { res: 'policies.finance', label: 'إعدادات المالية', group: 'policies', actions: [['view', 'عرض'], ['edit', 'تعديل']] },
    { res: 'policies.security', label: 'سياسة الأمان', group: 'policies', actions: [['view', 'عرض'], ['edit', 'تعديل']] },
    { res: 'customers', label: 'العملاء وقوائم الأسعار', group: 'data', actions: [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل'], ['disable', 'تعطيل'], ['export', 'تصدير'], ['import', 'استيراد'], ['merge', 'دمج']] },
    { res: 'suppliers', label: 'الموردون', group: 'data', actions: [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل'], ['disable', 'تعطيل'], ['export', 'تصدير'], ['import', 'استيراد'], ['merge', 'دمج']] },
    { res: 'approvals', label: 'صندوق الاعتمادات', group: 'oversight', actions: [['view', 'عرض'], ['approve', 'اعتماد'], ['delegate', 'تفويض']] },
    { res: 'audit', label: 'سجل التدقيق', group: 'oversight', actions: [['view', 'عرض'], ['export', 'تصدير']] },
    { res: 'security_center', label: 'مركز الأمان', group: 'oversight', actions: [['view', 'عرض'], ['unlock', 'فك القفل']] },
    { res: 'access_log', label: 'سجل الاطلاع على الحساس', group: 'oversight', tag: 'new', actions: [['view', 'عرض']] },
    { res: 'reports', label: 'التقارير العامة', group: 'reports', actions: [['view', 'عرض'], ['export', 'تصدير']] },
    { res: 'settings', label: 'الإعدادات العامة والإشعارات والتكاملات', group: 'system', actions: [['view', 'عرض'], ['edit', 'تعديل']] }
  ];
  const V = [['view', 'عرض']], VE = [['view', 'عرض'], ['edit', 'تعديل']], VCE = [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل']], VCA = [['view', 'عرض'], ['create', 'إنشاء'], ['approve', 'اعتماد']];
  const hp = (res, label, group, actions, feat) => ({ app: 'hr', res, label, group, actions, feat });
  /** HR permission keys `hr.<res>.<action>` (docs/hr/README.md §7.1). Sensitive HR keys (hr.salary.view, hr.payroll.prepare …) live in C.sensitive. */
  C.perms.push(
    hp('dashboard', 'لوحة HR', 'hr-dash', V, 'HR-27'), hp('planning', 'الخطة والوظائف', 'hr-hire', VE, 'HR-01'), hp('requisitions', 'طلبات التوظيف', 'hr-hire', VCA, 'HR-02'), hp('candidates', 'المرشحون', 'hr-hire', VCE, 'HR-03'), hp('offers', 'العروض والعقود', 'hr-hire', VCA, 'HR-04'),
    hp('employees', 'دليل الموظفين وملفاتهم', 'hr-emp', [['view', 'عرض'], ['create', 'إنشاء'], ['edit', 'تعديل'], ['export', 'تصدير']], 'HR-06'), hp('onboarding', 'التعيين والتجربة', 'hr-emp', VE, 'HR-05'), hp('changes', 'التغييرات الوظيفية', 'hr-emp', VCA, 'HR-07'), hp('custody', 'العهدة والزي', 'hr-emp', VE, 'HR-08'), hp('contractors', 'المقاولون', 'hr-emp', VE, 'HR-34'),
    hp('shifts', 'الورديات والجداول', 'hr-time', VE, 'HR-09'), hp('attendance', 'الحضور والاستثناءات', 'hr-time', [['view', 'عرض'], ['edit', 'تعديل'], ['approve', 'اعتماد']], 'HR-10'), hp('leave', 'الإجازات', 'hr-time', VCA, 'HR-11'), hp('overtime', 'الأوفرتايم والبدلات', 'hr-time', VCA, 'HR-12'),
    hp('salary_structure', 'هيكل المرتب', 'hr-pay', VE, 'HR-13'), hp('payroll', 'دورة المرتبات', 'hr-pay', V, 'HR-14'), hp('loans', 'السلف والقروض', 'hr-pay', VCA, 'HR-15'), hp('payments', 'الصرف ومفردات المرتب', 'hr-pay', [['view', 'عرض'], ['export', 'تصدير']], 'HR-16'), hp('gov', 'التأمينات والضريبة', 'hr-pay', VE, 'HR-17'),
    hp('performance', 'الأداء والتقييم', 'hr-dev', VE, 'HR-18'), hp('training', 'التدريب والمهارات', 'hr-dev', VE, 'HR-19'), hp('disciplinary', 'الجزاءات والتظلمات', 'hr-dev', VCA, 'HR-20'), hp('ohs', 'السلامة والصحة المهنية', 'hr-dev', VE, 'HR-21'), hp('recognition', 'التحفيز والتقدير', 'hr-dev', VE, 'HR-22'),
    hp('termination', 'الاستقالات والإنهاء', 'hr-exit', VCA, 'HR-23'), hp('clearance', 'إخلاء الطرف', 'hr-exit', VE, 'HR-24'), hp('settlement', 'المخالصات النهائية', 'hr-exit', V, 'HR-25'), hp('archive', 'الأرشيف وإعادة التعيين', 'hr-exit', V, 'HR-26'),
    hp('documents', 'مستندات HR وقوالبها', 'hr-docs', [['view', 'عرض'], ['issue', 'إصدار']], 'HR-29'), hp('reports', 'تقارير HR', 'hr-docs', [['view', 'عرض'], ['export', 'تصدير']], 'HR-28'),
    hp('compliance', 'الامتثال والإعدادات القانونية', 'hr-set', VE, 'HR-30'), hp('settings', 'سياسات HR والإشعارات', 'hr-set', VE, 'HR-33'), hp('acl', 'صلاحيات HR والسرية', 'hr-set', V, 'HR-31'),
    hp('ess', 'خدماتي (خدمة ذاتية للموظف)', 'hr-dash', [['use', 'استخدام']], 'HR-32'), hp('mss', 'فريقي (المشرف)', 'hr-dash', [['use', 'استخدام']], 'HR-32')
  );
  C.permKeys = []; C.perms.forEach((p) => p.actions.forEach((a) => C.permKeys.push((p.app === 'hr' ? 'hr.' : 'sa.') + p.res + '.' + a[0])));
  C.permsOf = (app) => C.perms.filter((p) => (p.app || 'sa') === app);
  /** Sensitive keys that other docs spell differently map to ONE key. data.wages.view (SA catalogue) ≡ hr.salary.view (HR contract). */
  C.alias = { 'data.wages.view': 'hr.salary.view' };
  C.canon = (k) => C.alias[k] || k;
  C.permLabel = (key) => {
    const m = /^(sa|hr)\.(.+)\.([a-z_]+)$/.exec(key); if (!m) return key;
    const p = C.perms.find((x) => x.res === m[2] && (x.app || 'sa') === m[1]); if (!p) return key;
    m[2] = m[3];
    const a = p.actions.find((x) => x[0] === m[2]);
    return (p.app === 'hr' ? 'HR · ' : '') + p.label + ' — ' + (a ? a[1] : m[2]);
  };
  /** Audit-event catalogue (docs/00). severity: info|medium|high|critical */
  const AE = [
    ['auth', 'دخول وتحقق', [['AUTH.LOGIN_SUCCESS', 'تسجيل دخول ناجح', 'info'], ['AUTH.LOGIN_FAILED', 'محاولة دخول فاشلة', 'info'], ['AUTH.MFA_FAILED', 'فشل التحقق الثاني (MFA)', 'medium'], ['AUTH.ACCOUNT_LOCKED', 'قفل حساب بعد محاولات فاشلة', 'high'], ['AUTH.STEPUP_FAILED', 'فشل إعادة التحقق (Step-up)', 'high'], ['AUTH.PASSWORD_RESET_REQUESTED', 'طلب إعادة تعيين كلمة مرور', 'medium'], ['AUTH.PASSWORD_CHANGED', 'تغيير كلمة المرور', 'medium']]],
    ['user', 'المستخدمون', [['USER.CREATED', 'إنشاء مستخدم', 'medium'], ['USER.UPDATED', 'تعديل بيانات مستخدم', 'medium'], ['USER.ROLE_CHANGED', 'تغيير دور مستخدم', 'high'], ['USER.DISABLED', 'تعطيل مستخدم', 'high'], ['USER.ENABLED', 'تفعيل مستخدم', 'medium'], ['USER.UNLOCKED', 'فك قفل حساب', 'medium'], ['USER.FORCE_LOGOUT', 'خروج إجباري لمستخدم', 'high']]],
    ['role', 'الأدوار', [['ROLE.CREATED', 'إنشاء دور', 'high'], ['ROLE.UPDATED', 'تعديل صلاحيات دور', 'high'], ['ROLE.DELETED', 'حذف دور', 'high'], ['ROLE.SCOPE_CHANGED', 'تغيير نطاق بيانات دور', 'high'], ['ROLE.SENSITIVE_GRANTED', 'منح/سحب صلاحية حساسة', 'high']]],
    ['superadmin', 'حسابات الإدارة', [['SUPERADMIN.BACKUP_NAMED', 'تسمية الحساب الاحتياطي', 'critical'], ['SUPERADMIN.MFA_CHANGED', 'تغيير MFA / أكواد الاسترجاع', 'critical'], ['SUPERADMIN.RECOVERY_USED', 'استخدام كود استرجاع', 'critical']]],
    ['session', 'الجلسات', [['SESSION.REVOKED', 'إنهاء جلسة', 'medium'], ['DEVICE.REVOKED', 'إلغاء جهاز', 'medium']]],
    ['dealer', 'التجار', [['DEALER.REQUEST_APPROVED', 'اعتماد طلب تاجر', 'medium'], ['DEALER.REQUEST_REJECTED', 'رفض طلب تاجر', 'medium'], ['DEALER.REQUEST_NEEDS_INFO', 'طلب استكمال بيانات تاجر', 'medium'], ['DEALER.SUSPENDED', 'إيقاف حساب تاجر', 'high'], ['DEALER.OVERRIDDEN', 'تجاوز قرار المبيعات في طلب تاجر', 'critical']]],
    ['company', 'بيانات رسمية', [['COMPANY.UPDATED', 'تعديل بيانات الشركة', 'high'], ['COMPANY.SEAL_UPLOADED', 'رفع ختم الشركة', 'high'], ['COMPANY.SIGNATURE_UPLOADED', 'رفع توقيع', 'high']]],
    ['org', 'الهيكل', [['DEPT.CREATED', 'إنشاء قسم', 'medium'], ['DEPT.UPDATED', 'تعديل قسم', 'medium'], ['DEPT.DISABLED', 'تعطيل قسم', 'high'], ['DEPT.ENABLED', 'تفعيل قسم', 'medium'], ['MODULE.TOGGLED', 'تفعيل/إخفاء موديول', 'high'], ['WAREHOUSE.CREATED', 'إنشاء مخزن', 'medium'], ['WAREHOUSE.UPDATED', 'تعديل مخزن', 'medium'], ['WAREHOUSE.DISABLED', 'تعطيل مخزن', 'high'], ['WAREHOUSE.ENABLED', 'تفعيل مخزن', 'medium']]],
    ['policy', 'السياسات', [['POLICY.APPROVAL_CHANGED', 'تغيير قاعدة اعتماد', 'high'], ['POLICY.NUMBERING_CHANGED', 'تغيير ترقيم مستند', 'high'], ['POLICY.FINANCE_CHANGED', 'تغيير إعدادات المالية', 'high'], ['POLICY.SECURITY_CHANGED', 'تغيير سياسة الأمان', 'high']]],
    ['approval', 'الاعتمادات', [['APPROVAL.APPROVED', 'اعتماد طلب', 'high'], ['APPROVAL.REJECTED', 'رفض طلب', 'high'], ['APPROVAL.DELEGATED', 'تفويض طلب', 'high'], ['APPROVAL.CHANGES_REQUESTED', 'طلب تعديل على طلب', 'medium']]],
    ['pricelist', 'قوائم الأسعار', [['PRICELIST.CHANGED', 'تغيير قائمة أسعار', 'high']]],
    ['export', 'التصدير', [['EXPORT.AUDIT', 'تصدير سجل التدقيق', 'high'], ['EXPORT.REPORT', 'تصدير تقرير', 'high'], ['EXPORT.DATA', 'تصدير بيانات', 'high']]],
    ['access', 'وصول', [['ACCESS.DENIED', 'محاولة وصول ممنوعة', 'info']]],
    ['hr', 'الموارد البشرية (HR.<AREA>.<ACTION>)', [['HR.EMPLOYEE.CREATED', 'تعيين/إنشاء ملف موظف', 'medium'], ['HR.EMPLOYEE.UPDATED', 'تعديل ملف موظف', 'medium'], ['HR.EMPLOYEE.PII_REVEALED', 'كشف بيانات شخصية كاملة', 'high'], ['HR.SALARY.VIEWED', 'اطلاع على الأجور (T3)', 'medium'], ['HR.SALARY.CHANGE_REQUESTED', 'طلب تغيير مرتب', 'high'], ['HR.SALARY.CHANGE_APPROVED', 'اعتماد تغيير مرتب', 'high'], ['HR.REQUISITION.CREATED', 'طلب توظيف جديد', 'medium'], ['HR.REQUISITION.APPROVED', 'اعتماد طلب توظيف', 'high'], ['HR.REQUISITION.REJECTED', 'رفض طلب توظيف', 'medium'], ['HR.CANDIDATE.STAGE_CHANGED', 'تغيير مرحلة مرشح', 'info'], ['HR.OFFER.APPROVED', 'اعتماد عرض وظيفي', 'high'], ['HR.LEAVE.REQUESTED', 'طلب إجازة', 'info'], ['HR.LEAVE.APPROVED', 'اعتماد إجازة', 'medium'], ['HR.LEAVE.REJECTED', 'رفض إجازة', 'medium'], ['HR.ATTENDANCE.ADJUSTED', 'تعديل سجل حضور', 'medium'], ['HR.PAYROLL.PREPARED', 'تجهيز كشف المرتبات', 'high'], ['HR.PAYROLL.APPROVED', 'اعتماد كشف المرتبات', 'high'], ['HR.PAYROLL.RELEASED', 'إطلاق كشف المرتبات', 'critical'], ['HR.ADVANCE.REQUESTED', 'طلب سلفة', 'medium'], ['HR.ADVANCE.APPROVED', 'اعتماد سلفة', 'high'], ['HR.DISCIPLINE.RECORDED', 'تسجيل جزاء', 'high'], ['HR.OHS.INCIDENT_RECORDED', 'تسجيل حادث سلامة', 'high'], ['HR.TERMINATION.REQUESTED', 'طلب إنهاء خدمة', 'high'], ['HR.SETTLEMENT.CALCULATED', 'حساب مخالصة نهائية', 'high'], ['HR.SETTLEMENT.APPROVED', 'اعتماد مخالصة نهائية', 'critical'], ['HR.SETTLEMENT.PAID', 'صرف مخالصة نهائية', 'critical'], ['HR.EXPORT.SENSITIVE', 'تصدير بيانات HR حساسة', 'high']]],
    ['settings', 'الإعدادات', [['SETTINGS.CHANGED', 'تغيير إعدادات عامة', 'medium'], ['NOTIFICATION.RULE_CHANGED', 'تغيير قاعدة إشعار', 'medium'], ['INTEGRATION.CHANGED', 'تغيير تكامل', 'high']]]
  ];
  C.auditCategories = AE.map((g) => ({ id: g[0], label: g[1] }));
  C.audit = []; C.auditByCode = {};
  AE.forEach((g) => g[2].forEach((e) => { const r = { code: e[0], label: e[1], severity: e[2], category: g[0] }; C.audit.push(r); C.auditByCode[e[0]] = r; }));
  /** Phase-2 modules can add their own HR.<AREA>.<ACTION> codes: SA.catalog.addAudit('HR.LOAN.CLOSED','إغلاق سلفة','medium','hr') */
  C.addAudit = (code, label, severity, category) => { if (C.auditByCode[code]) return; const r = { code, label, severity: severity || 'info', category: category || (code.indexOf('HR.') === 0 ? 'hr' : 'settings') }; C.audit.push(r); C.auditByCode[code] = r; };
  /** Approval types (SA inbox is shared by both areas). area:'sa'|'hr'. */
  C.approvalTypes = {
    discount: { label: 'خصم يتجاوز الحد', area: 'sa', icon: 'receipt' }, large_order: { label: 'طلب كبير', area: 'sa', icon: 'cart' }, price_list: { label: 'قائمة أسعار', area: 'sa', icon: 'list' }, payment_voucher: { label: 'سند صرف', area: 'sa', icon: 'coins' }, dealer_override: { label: 'تجاوز تسجيل تاجر', area: 'sa', icon: 'shield' },
    payroll_run: { label: 'كشف مرتبات', area: 'hr', icon: 'coins' }, salary_change: { label: 'تغيير مرتب', area: 'hr', icon: 'edit' }, final_settlement: { label: 'مخالصة نهائية', area: 'hr', icon: 'doc' }, hiring_requisition: { label: 'طلب توظيف', area: 'hr', icon: 'userplus' }, advance: { label: 'سلفة', area: 'hr', icon: 'coins' }, leave: { label: 'إجازة', area: 'hr', icon: 'clock' }
  };
  C.severity = { info: { label: 'معلومة', kind: 'info' }, medium: { label: 'متوسطة', kind: 'warning' }, high: { label: 'عالية', kind: 'danger' }, critical: { label: 'حرجة', kind: 'danger' } };
  C.status = {
    user: { active: ['نشط', 'success'], pending: ['بانتظار التفعيل', 'warning'], disabled: ['معطّل', 'neutral'], locked: ['موقوف', 'danger'] },
    approval: { pending: ['بانتظار القرار', 'warning'], approved: ['معتمد', 'success'], rejected: ['مرفوض', 'danger'], changes_requested: ['مطلوب تعديل', 'info'], delegated: ['مُفوَّض', 'info'] },
    dealer: { pending_review: ['قيد المراجعة', 'warning'], approved: ['معتمد', 'success'], rejected: ['مرفوض', 'danger'], needs_info: ['مطلوب استكمال', 'info'], active: ['نشط', 'success'], suspended: ['موقوف', 'danger'] },
    session: { active: ['نشطة', 'success'], revoked: ['مُنهاة', 'neutral'] }
  };
  C.personas = {
    owner: { label: 'صاحب الشركة / Super Admin', desc: 'كل الصلاحيات · MFA إلزامي', icon: 'shield' },
    backup: { label: 'Super Admin احتياطي', desc: 'الاسترجاع والاستمرارية · MFA إلزامي', icon: 'lock' },
    gm: { label: 'General Manager', desc: 'اعتمادات وتقارير · لا أجور تلقائيًا', icon: 'user' },
    salesmgr: { label: 'Sales Manager', desc: 'يعتمد طلبات التجار والخصم (الخطوة الأولى)', icon: 'users' },
    rep: { label: 'Sales Representative', desc: 'عملاؤه فقط · بدون تكاليف/أرباح', icon: 'user' },
    acct: { label: 'Accountant', desc: 'المالية والتحصيل', icon: 'coins' },
    wh: { label: 'Warehouse Manager', desc: 'المخازن', icon: 'warehouse' },
    hr: { label: 'HR Manager', desc: 'بدون صلاحيات Super Admin تقريبًا: جرّب الشاشات الممنوعة', icon: 'id' },
    it: { label: 'IT / Tech Admin', desc: 'الأمان والتكاملات [New]', icon: 'settings' },
    hrofficer: { label: 'HR Officer', desc: 'تشغيل HR اليومي: ملفات وحضور وإجازات', icon: 'id', area: 'hr' },
    payroll: { label: 'Payroll Officer', desc: 'يجهّز كشف المرتبات (maker) · يرى الأجور', icon: 'coins', area: 'hr' },
    supervisor: { label: 'Line Supervisor', desc: 'يعتمد إجازات فريقه ويطلب أوفرتايم وتوظيف', icon: 'users', area: 'hr' },
    ohs: { label: 'OHS Officer', desc: 'السلامة والصحة المهنية · الطبي (T4)', icon: 'shield', area: 'hr' },
    employee: { label: 'موظف (خدماتي)', desc: 'واجهة ESS مبسطة بأزرار كبيرة: إجازة، مرتب، طلباتي', icon: 'user', area: 'hr', ess: true }
  };
  C.personas.hr.area = 'hr';
  /** Step-up action keys (docs/03 SA-15 UC-SEC-02: configurable list). */
  C.stepUp = [
    ['role.update', 'تعديل صلاحيات دور'], ['role.sensitive', 'منح صلاحية حساسة'], ['user.disable', 'تعطيل مستخدم'], ['user.superadmin', 'إنشاء/ترقية Super Admin'], ['user.reset_password', 'إعادة تعيين كلمة المرور'],
    ['sessions.revoke_all', 'إنهاء كل جلسات مستخدم'], ['approval.decide', 'اعتماد طلب'], ['voucher.execute', 'صرف'], ['audit.export', 'تصدير سجل التدقيق'], ['dealer.override', 'تجاوز قرار المبيعات'],
    ['policy.change', 'تغيير سياسة'], ['recovery.generate', 'أكواد استرجاع / MFA'], ['superadmin.backup', 'تسمية الحساب الاحتياطي'], ['module.toggle', 'تفعيل/إخفاء موديول'], ['company.official', 'تعديل بيانات رسمية']
  ];

  /* ───────────────────────── session / permissions ───────────────────────── */
  function liveSnapshot(user) {
    if (!user) return null;
    const role = SA.store.find('roles', user.roleId);
    if (!role) return { roleId: user.roleId, version: 0, sa: [], sensitive: [], scope: {}, matrix: {}, roleName: '—' };
    return { roleId: role.id, roleName: role.nameAr, version: role.version || 1, sa: role.sa === '*' || (role.sa && role.sa[0] === '*') ? '*' : (role.sa || []).slice(), sensitive: role.sensitive && role.sensitive[0] === '*' ? '*' : (role.sensitive || []).slice(), scope: Object.assign({}, role.scope), matrix: SA.clone(role.matrix) };
  }
  SA.session = {
    get data() { return SA.store.get('session') || {}; },
    get isAuthed() { const s = this.data; return !!(s.userId && s.mfaOk !== false && !s.pending); },
    get user() { const s = this.data; return s.userId ? SA.store.find('users', s.userId) : null; },
    get userId() { return this.data.userId || null; },
    get personaId() { const u = this.user; return u ? u.persona || null : null; },
    get role() { const u = this.user; return u ? SA.store.find('roles', u.roleId) : null; },
    get snapshot() { return this.data.snap || null; },
    get locked() { return !!this.data.locked; },
    get device() { return { ip: '192.0.2.10', ua: /Mac/i.test(navigator.userAgent) ? 'Chrome · macOS' : /Win/i.test(navigator.userAgent) ? 'Chrome · Windows' : 'متصفح ويب' }; },
    /** true when live role differs from the snapshot taken at login (UC-GLB-05) */
    get permsStale() { const s = this.snapshot, u = this.user; if (!s || !u) return false; const live = liveSnapshot(u); return live.roleId !== s.roleId || live.version !== s.version; },
    /** re-read permissions from the role (the "إعادة تحميل الصلاحيات" button) */
    reloadPerms() { const u = this.user; if (u) SA.store.set('session.snap', liveSnapshot(u)); SA.emit('perms'); SA.track('perms.reloaded'); },
    takeSnapshot(user) { return liveSnapshot(user); }
  };
  /** SA.can('sa.users.edit') — based on the permission snapshot of the logged-in user. */
  SA.can = function (key /*, scopeCtx */) {
    const s = SA.session.snapshot; if (!s) return false;
    if (!key) return true;
    key = C.canon(key);
    if (C.sensitive.some((x) => x.key === key)) return SA.canSensitive(key);
    if (s.sa === '*') return true;
    return s.sa.indexOf(key) >= 0;
  };
  SA.canAny = (keys) => keys.some((k) => SA.can(k));
  SA.canSensitive = function (key) { const s = SA.session.snapshot; if (!s) return false; key = C.canon(key); return s.sensitive === '*' || s.sensitive.indexOf(key) >= 0; };
  /** Scope ('own'|'team'|'department'|'all') the current user has on a business resource (matrix scope). */
  SA.scopeOf = function (res) { const s = SA.session.snapshot; if (!s) return 'own'; if (s.sa === '*') return 'all'; return (s.scope && s.scope[res]) || 'own'; };
  /** Filter rows by the current user's scope on `res`; ownerField = field holding a user id (e.g. 'salesRepId'). */
  SA.scopeFilter = function (res, rows, ownerField) {
    const sc = SA.scopeOf(res), me = SA.session.user; if (!me || sc === 'all') return rows;
    const users = SA.store.get('users') || [];
    return rows.filter((r) => {
      const owner = r[ownerField || 'ownerId']; if (!owner) return false;
      if (sc === 'own') return owner === me.id;
      const ou = users.find((u) => u.id === owner); if (!ou) return false;
      if (sc === 'team') return ou.id === me.id || ou.managerId === me.id;
      if (sc === 'department') return ou.departmentId === me.departmentId;
      return true;
    });
  };
  /** Does the permission set of an arbitrary role contain `key`? (used by role preview / compare) */
  SA.roleCan = function (role, key) { if (!role) return false; key = C.canon(key); if (C.sensitive.some((x) => x.key === key)) return SA.roleSensitive(role, key); const sa = role.sa || []; return sa[0] === '*' || sa.indexOf(key) >= 0; };
  SA.roleSensitive = function (role, key) { if (!role) return false; const s = role.sensitive || []; return s[0] === '*' || s.indexOf(C.canon(key)) >= 0; };

  /* ───────────────────────── audit ───────────────────────── */
  /** SA.audit('USER.CREATED', { target:{type,id,label}, before, after, reason, severity, result, via, actor }) — append-only. */
  SA.audit = function (code, o) {
    o = o || {};
    const cat = C.auditByCode[code]; const u = SA.session.user;
    const seq = (SA.store.get('meta.auditSeq') || 100) + 1; SA.store.set('meta.auditSeq', seq);
    const dev = SA.session.device;
    const entry = {
      id: 'AU-' + String(seq).padStart(4, '0'), ts: new Date().toISOString(),
      actor: o.actor || (u ? { id: u.id, name: u.name, roleId: u.roleId } : { id: 'SYSTEM', name: 'النظام', roleId: null }),
      code, target: o.target || null, before: o.before === undefined ? null : o.before, after: o.after === undefined ? null : o.after,
      reason: o.reason || '', severity: o.severity || (cat && cat.severity) || 'info', result: o.result || 'success',
      ip: o.ip || dev.ip, device: o.device || dev.ua, via: o.via || 'web', count: 1,
      area: code.indexOf('HR.') === 0 ? 'hr' : (o.area || 'sa'),
      stepUp: !!(SA.lastStepUp && Date.now() - SA.lastStepUp() < 120000 && code.indexOf('AUTH.') !== 0)
    };
    // ACCESS.DENIED is aggregated (same actor + same target within 10 minutes → count++), BR in docs/00 UC-GLB-04
    if (code === 'ACCESS.DENIED') {
      const list = SA.store.get('audit'); const k = entry.target && entry.target.id;
      const prev = list.find((e) => e.code === code && e.actor.id === entry.actor.id && e.target && e.target.id === k && Date.now() - new Date(e.ts).getTime() < 600000);
      if (prev) { SA.store.update('audit', () => { prev.count = (prev.count || 1) + 1; prev.ts = entry.ts; }); SA.emit('audit', prev); return prev; }
    }
    SA.store.update('audit', (list) => { list.unshift(entry); });
    SA.emit('audit', entry);
    return entry;
  };
  SA.auditLabel = (code) => (C.auditByCode[code] ? C.auditByCode[code].label : code);

  /* ───────────────────────── notifications ───────────────────────── */
  /** SA.notify({title, body, level:'urgent'|'action'|'info', to:[roleIds], toUsers:[userIds], link:'#/approvals/AP-1'}) */
  SA.notify = function (n) {
    const seq = (SA.store.get('meta.notifySeq') || 100) + 1; SA.store.set('meta.notifySeq', seq);
    const rec = { id: 'N-' + seq, ts: new Date().toISOString(), title: n.title, body: n.body || '', level: n.level || 'info', to: n.to || [], toUsers: n.toUsers || [], link: n.link || '', readBy: [] };
    SA.store.update('notifications', (l) => { l.unshift(rec); });
    SA.emit('notify', rec); return rec;
  };
  SA.notifications = {
    forMe() {
      const u = SA.session.user; if (!u) return [];
      return (SA.store.get('notifications') || []).filter((n) => (!n.to.length && !n.toUsers.length) || n.to.indexOf(u.roleId) >= 0 || n.toUsers.indexOf(u.id) >= 0);
    },
    isRead(n) { const u = SA.session.user; return !!u && n.readBy.indexOf(u.id) >= 0; },
    unread(level) { return this.forMe().filter((n) => !this.isRead(n) && (!level || n.level === level)).length; },
    markRead(id) { const u = SA.session.user; if (!u) return; SA.store.update('notifications', (l) => { const n = l.find((x) => x.id === id); if (n && n.readBy.indexOf(u.id) < 0) n.readBy.push(u.id); }); },
    markAll() { const u = SA.session.user; if (!u) return; SA.store.update('notifications', (l) => { l.forEach((n) => { if (n.readBy.indexOf(u.id) < 0) n.readBy.push(u.id); }); }); }
  };

  /* ───────────────────────── simulation switches ───────────────────────── */
  SA.Err = function (code, msg) { const e = new Error(msg || code); e.code = code; e.isSA = true; return e; };
  SA.sim = {
    get slow() { return !!SA.store.get('tour.sim.slow'); }, set slow(v) { SA.store.set('tour.sim.slow', !!v); },
    get error() { return !!SA.store.get('tour.sim.error'); }, set error(v) { SA.store.set('tour.sim.error', !!v); },
    get offline() { return !!SA.store.get('tour.sim.offline'); }, set offline(v) { SA.store.set('tour.sim.offline', !!v); }
  };
  /** Simulated latency. ms default 250–500. Rejects with SA.Err('offline') when offline; with {write:true} rejects ONCE with SA.Err('server') when sim.error is armed. */
  SA.delay = function (ms, o) {
    o = o || {};
    const base = ms == null ? 250 + Math.random() * 250 : ms;
    const t = SA.sim.slow ? Math.max(base, 300) * 7 : base;
    if (SA.sim.slow) SA.track('sim.used', { kind: 'slow' });
    return new Promise((res, rej) => setTimeout(() => {
      if (SA.sim.offline) { SA.track('sim.used', { kind: 'offline' }); return rej(SA.Err('offline', 'offline')); }
      if (o.write && SA.sim.error) { SA.sim.error = false; SA.track('sim.used', { kind: 'error' }); return rej(SA.Err('server', 'server')); }
      res();
    }, t));
  };
  /** Run a mutation through the simulated server: await SA.api(() => doIt()). Options {ms, read:true} */
  SA.api = function (fn, o) { o = o || {}; return SA.delay(o.ms, { write: !o.read }).then(fn); };
  /** Show a standard Arabic toast for a failed SA.api/SA.delay; returns the message. */
  SA.fail = function (e) {
    const msg = e && e.code === 'offline' ? 'لا يوجد اتصال بالإنترنت (محاكاة). لم يتم تنفيذ الإجراء.' : e && e.code === 'server' ? 'حصل خطأ في الخادم (محاكاة). لم يتم تنفيذ الإجراء، جرّب مرة أخرى.' : 'تعذّر تنفيذ الإجراء. جرّب مرة أخرى.';
    if (!e || !e.isSA) console.error(e);
    if (SA.toast) SA.toast(msg, 'error');
    return msg;
  };
  SA.errorText = (e) => (e && e.code === 'offline' ? 'لا يوجد اتصال (محاكاة)' : e && e.code === 'server' ? 'خطأ في الخادم (محاكاة)' : 'حصل خطأ غير متوقع');

  /* ───────────────────────── module registry + router ───────────────────────── */
  const modules = [];
  /** SA.register({ id, group, title, icon, route, perm, order, badge(), render(root, ctx), nav:true, desc }) */
  SA.register = function (def) {
    if (!def || !def.id || !def.route || typeof def.render !== 'function') { console.error('[SA.register] invalid module', def); return null; }
    const i = modules.findIndex((m) => m.id === def.id); if (i >= 0) modules.splice(i, 1);
    def.app = def.app || (def.route.indexOf('hr/') === 0 || def.route === 'hr' ? 'hr' : 'sa'); def.nav = def.nav !== false; def.order = def.order == null ? 50 : def.order; def._segs = def.route.split('/').filter(Boolean);
    modules.push(def); SA.emit('modules'); return def;
  };
  Object.defineProperty(SA, 'modules', { get() { return modules.slice().sort((a, b) => a.order - b.order); } });
  SA.moduleById = (id) => modules.find((m) => m.id === id) || null;
  function parseHash(h) {
    h = (h == null ? location.hash : h) || '';
    const raw = h.replace(/^#\/?/, '');
    const qi = raw.indexOf('?'); const p = qi >= 0 ? raw.slice(0, qi) : raw; const q = qi >= 0 ? raw.slice(qi + 1) : '';
    const query = {}; q.split('&').filter(Boolean).forEach((kv) => { const a = kv.split('='); query[decodeURIComponent(a[0])] = decodeURIComponent((a[1] || '').replace(/\+/g, ' ')); });
    const sg = p.split('/').filter(Boolean).map(decodeURIComponent);
    let best = null;
    modules.forEach((m) => { if (m._segs.length <= sg.length && m._segs.every((s, i) => sg[i] === s) && (!best || m._segs.length > best._segs.length)) best = m; });
    return { raw: h, path: sg.join('/'), segs: sg, query, module: best, rest: best ? sg.slice(best._segs.length) : sg };
  }
  SA.route = parseHash('');
  const routeCbs = [];
  SA.router = {
    parse: parseHash,
    onChange(cb) { routeCbs.push(cb); },
    start() { const go = () => { SA.route = parseHash(); SA.track('route:' + (SA.route.module ? SA.route.module.id : SA.route.segs[0] || '')); routeCbs.forEach((cb) => cb(SA.route)); }; global.addEventListener('hashchange', go); go(); },
    refresh() { SA.route = parseHash(); routeCbs.forEach((cb) => cb(SA.route)); }
  };
  /** Navigate: SA.nav('users/U-12'), SA.nav('#/roles/R-3?tab=scope'), SA.nav('users', {query:{status:'locked'}}). */
  SA.nav = function (route, opts) {
    opts = opts || {};
    let r = String(route || '').replace(/^#\/?/, '');
    if (opts.query) { const qs = Object.keys(opts.query).filter((k) => opts.query[k] != null && opts.query[k] !== '').map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(opts.query[k])).join('&'); if (qs) r += (r.indexOf('?') >= 0 ? '&' : '?') + qs; }
    const h = '#/' + r;
    if (opts.replace) { history.replaceState(null, '', h); SA.router.refresh(); } else if (location.hash === h) SA.router.refresh(); else location.hash = h;
  };
  SA.href = (route) => '#/' + String(route || '').replace(/^#\/?/, '');
  /** Cross-links used by every module: SA.link.user('U-1') → '#/users/U-1' */
  SA.link = {
    user: (id) => '#/users/' + id, role: (id, tab) => '#/roles/' + id + (tab ? '?tab=' + tab : ''), approval: (id) => '#/approvals/' + id,
    audit: (q) => '#/audit' + (q ? '?' + q : ''), dealer: (id) => '#/dealers/requests/' + id
  };
  /** Is the HR/SA area switched on in the `modules` collection (SA-09)? */
  SA.appEnabled = function (app) { if (app !== 'hr') return true; const m = (SA.store.get('modules') || []).find((x) => x.key === 'hr'); return !m || m.enabled; };
  /** Modules the user can see in the nav (permission-filtered), optionally for one app ('sa'|'hr'). */
  SA.navModules = function (app) { return SA.modules.filter((m) => m.nav && (!app || m.app === app) && (!m.perm || SA.can(m.perm)) && SA.appEnabled(m.app)); };
  /** Apps (areas) the logged-in user can enter. ESS-only personas (hr.ess.use without anything else) only get 'hr'. */
  SA.appsFor = function () { return C.apps.filter((a) => SA.navModules(a.id).length > 0); };
  SA.isEss = function () { const u = SA.session.user; if (!u) return false; const hasEss = SA.can('hr.ess.use'); return hasEss && SA.navModules('sa').length === 0 && SA.navModules('hr').filter((m) => m.id !== 'hr-ess').length === 0; };
  /** Current area: from the open route, else the stored preference, else the role's home app. */
  SA.currentApp = function () {
    const m = SA.route && SA.route.module; if (m && SA.appsFor().some((a) => a.id === m.app)) return m.app;
    const pref = SA.store.get('ui.app'); const apps = SA.appsFor(); if (pref && apps.some((a) => a.id === pref)) return pref;
    const r = SA.session.role; const home = (r && r.homeApp) || 'sa'; return apps.some((a) => a.id === home) ? home : (apps[0] ? apps[0].id : 'sa');
  };
  SA.homeRoute = function (app) {
    if (SA.isEss() && !arguments.length) return 'hr/ess';
    if (!app) { const r = SA.session.role; const ap = SA.appsFor().map((x) => x.id); app = r && r.homeApp && ap.indexOf(r.homeApp) >= 0 ? r.homeApp : ap[0] || 'sa'; }
    const order = [app].concat(C.apps.map((a) => a.id).filter((x) => x !== app));
    for (const a of order) { const list = SA.navModules(a); if (!list.length) continue; const pref = list.find((m) => m.id === (a === 'hr' ? (SA.isEss() ? 'hr-ess' : 'hr-dashboard') : 'overview')); return (pref || list[0]).route; }
    return '';
  };
  /** Switch area: remembers it and opens that area's home. */
  SA.setApp = function (app) { SA.store.set('ui.app', app); SA.nav(SA.homeRoute(app)); };
  /** Is the module permitted for the current user? (perm null = any logged-in user with at least one sa.* key) */
  SA.canOpen = (m) => !m.perm || SA.can(m.perm);

  /* ───────────────────────── RBAC helpers (shared by users / roles / scope / preview) ───────────────────────── */
  const R = (SA.rbac = {});
  R.letters = { v: 'view', c: 'create', e: 'edit', d: 'delete', a: 'approve', x: 'export' };
  R.emptyRow = () => ({ view: false, create: false, edit: false, delete: false, approve: false, export: false });
  /** Expand compact 'vcea' strings into a matrix row. */
  R.row = (letters) => { const r = R.emptyRow(); String(letters || '').split('').forEach((l) => { if (R.letters[l]) r[R.letters[l]] = true; }); return r; };
  R.resLabel = (id) => { const r = C.resources.find((x) => x.id === id); return r ? r.label : id; };
  R.actLabel = (a) => { const x = C.actions.find((y) => y[0] === a); return x ? x[1] : a; };
  R.scopeLabel = (s) => { const x = C.scopes.find((y) => y[0] === s); return x ? x[1] : s || '—'; };
  R.sensLabel = (k) => { const x = C.sensitive.find((y) => y.key === k); return x ? x.label : k; };
  /** Permission payload of a role (the part that can be drafted/compared). */
  R.permsOf = (role) => ({ matrix: SA.clone(role.matrix || {}), scope: Object.assign({}, role.scope || {}), sensitive: (role.sensitive || []).slice(), sa: (role.sa || []).slice() });
  /** Toggle one matrix cell honouring "view is a prerequisite". Returns {cleared:[actions auto-removed]} */
  R.setCell = function (perms, res, action, value) {
    const row = (perms.matrix[res] = perms.matrix[res] || R.emptyRow()); const cleared = [];
    if (action === 'view' && !value) { C.actions.forEach((a) => { if (a[0] !== 'view' && row[a[0]]) { row[a[0]] = false; cleared.push(a[0]); } }); }
    row[action] = !!value;
    if (value && !perms.scope[res] && C.resources.find((r) => r.id === res && r.scoped)) perms.scope[res] = 'own';
    return { cleared };
  };
  /** Toggle an SA key honouring view prerequisite per resource. */
  R.setSaKey = function (perms, key, value) {
    const m = /^((?:sa|hr)\.(.+))\.([a-z_]+)$/.exec(key); const base = m[1]; const act = m[3]; const set = new Set(perms.sa); const cleared = [];
    if (value) { set.add(key); if (act !== 'view' && C.permKeys.indexOf(base + '.view') >= 0) set.add(base + '.view'); }
    else { set.delete(key); if (act === 'view') { Array.from(set).forEach((k) => { if (k.indexOf(base + '.') === 0 && k !== key) { set.delete(k); cleared.push(k); } }); } }
    perms.sa = Array.from(set); return { cleared };
  };
  /** Diff two perm payloads → {matrix:[{res,action,from,to}], scope:[{res,from,to}], sensitive:[{key,from,to}], sa:[{key,from,to}], total} */
  R.diff = function (a, b) {
    const d = { matrix: [], scope: [], sensitive: [], sa: [] };
    C.resources.forEach((r) => {
      C.actions.forEach((ac) => { const f = !!(a.matrix[r.id] && a.matrix[r.id][ac[0]]), t = !!(b.matrix[r.id] && b.matrix[r.id][ac[0]]); if (f !== t) d.matrix.push({ res: r.id, action: ac[0], from: f, to: t }); });
      const fs = a.scope[r.id] || null, ts = b.scope[r.id] || null; if (fs !== ts && (fs || ts) && ((a.matrix[r.id] && a.matrix[r.id].view) || (b.matrix[r.id] && b.matrix[r.id].view))) d.scope.push({ res: r.id, from: fs, to: ts });
    });
    const sa1 = a.sa[0] === '*' ? C.permKeys : a.sa, sa2 = b.sa[0] === '*' ? C.permKeys : b.sa;
    C.sensitive.forEach((s) => { const f = a.sensitive[0] === '*' || a.sensitive.indexOf(s.key) >= 0, t = b.sensitive[0] === '*' || b.sensitive.indexOf(s.key) >= 0; if (f !== t) d.sensitive.push({ key: s.key, from: f, to: t }); });
    C.permKeys.forEach((k) => { const f = sa1.indexOf(k) >= 0, t = sa2.indexOf(k) >= 0; if (f !== t) d.sa.push({ key: k, from: f, to: t }); });
    d.total = d.matrix.length + d.scope.length + d.sensitive.length + d.sa.length;
    return d;
  };
  /** Human sentences for a diff: [{kind:'add'|'remove'|'change', section, text, danger}] */
  R.sentences = function (d) {
    const out = [];
    d.matrix.forEach((c) => out.push({ kind: c.to ? 'add' : 'remove', section: 'matrix', danger: c.to && c.action === 'approve', text: (c.to ? 'هتضيف: ' : 'هتشيل: ') + R.actLabel(c.action) + ' — ' + R.resLabel(c.res) }));
    d.scope.forEach((c) => out.push({ kind: 'change', section: 'scope', text: 'نطاق ' + R.resLabel(c.res) + ': من «' + R.scopeLabel(c.from) + '» إلى «' + R.scopeLabel(c.to) + '»', danger: false }));
    d.sensitive.forEach((c) => out.push({ kind: c.to ? 'add' : 'remove', section: 'sensitive', danger: c.to, text: (c.to ? 'هتفتح بيانات/عملية حساسة: ' : 'هتسحب صلاحية حساسة: ') + R.sensLabel(c.key) }));
    d.sa.forEach((c) => out.push({ kind: c.to ? 'add' : 'remove', section: 'sa', danger: false, text: (c.to ? 'هتضيف (إدارة): ' : 'هتشيل (إدارة): ') + C.permLabel(c.key) }));
    return out;
  };
  /** Effective summary of a role in a few numbers: {cells, resources, sa, sensitive} */
  R.summary = function (role) {
    let cells = 0, res = 0; C.resources.forEach((r) => { const row = role.matrix && role.matrix[r.id]; if (row && row.view) res++; C.actions.forEach((a) => { if (row && row[a[0]]) cells++; }); });
    const sa = role.sa && role.sa[0] === '*' ? C.permKeys.length : (role.sa || []).length;
    const sens = role.sensitive && role.sensitive[0] === '*' ? C.sensitive.length : (role.sensitive || []).length;
    return { cells, resources: res, sa, sensitive: sens };
  };
  R.members = (roleId) => (SA.store.get('users') || []).filter((u) => u.roleId === roleId);
  R.superAdmins = (onlyActive) => (SA.store.get('users') || []).filter((u) => { const r = SA.store.find('roles', u.roleId); return r && r.isProtected && (!onlyActive || u.status === 'active'); });
  /** Mark that effective permissions changed for these roles (bumps role.version → banner UC-GLB-05 for logged-in members). */
  R.bump = (roleId) => SA.store.update('roles', (l) => { const r = l.find((x) => x.id === roleId); if (r) r.version = (r.version || 1) + 1; });

  /* ───────────────────────── approvals (shared SA + HR inbox) ───────────────────────── */
  /** Create an approval request in the shared inbox (SA-16). Used by HR flows (payroll run, salary change, final settlement, requisition, advance, leave) and SA flows.
      SA.requestApproval({type:'payroll_run', title, requesterId?, amount?, discountPct?, chain:[roleId | {roleId,label}], context:[[label,value]], ref:{type,id}, area?}) → record */
  SA.requestApproval = function (o) {
    const t = C.approvalTypes[o.type] || { label: o.type, area: o.area || 'sa' };
    const id = SA.store.nextId('approvals', 'AP', 4); const now = new Date().toISOString();
    const chain = o.chain.map((c, i) => { const rid = typeof c === 'string' ? c : c.roleId; return { step: i + 1, roleId: rid, label: (typeof c === 'object' && c.label) || SA.roleName(rid), status: i === 0 ? 'pending' : 'waiting', decidedBy: null, decidedAt: null, reason: '' }; });
    const rec = { id, type: o.type, area: o.area || t.area || 'sa', title: o.title, requesterId: o.requesterId || SA.session.userId, amount: o.amount == null ? null : o.amount, discountPct: o.discountPct == null ? null : o.discountPct, currency: 'EGP', status: 'pending', chain, currentStep: 1, createdAt: now, updatedAt: now, context: o.context || [], ref: o.ref || null };
    SA.store.insert('approvals', rec, true);
    SA.notify({ title: 'طلب اعتماد جديد: ' + t.label, body: o.title, level: 'action', to: [chain[0].roleId, 'R-01'], link: '#/approvals/' + id });
    return rec;
  };

  /* ───────────────────────── tags / open values ───────────────────────── */
  /** SA.tag('approved'|'pending'|'open'|'new', text?) → documentation badge (hidden via Test Lab toggle) */
  SA.tag = function (kind, text) {
    const map = { approved: ['approved-badge', 'Approved'], pending: ['pending-badge', 'Pending'], open: ['open-badge', 'Open'], new: ['new-badge', 'New'] };
    const m = map[kind] || map.new;
    return SA.h('span', { class: [m[0], 'sap-doc-tag'], title: 'شارة توثيق — تُشال من الإنتاج' }, text || m[1]);
  };
  /** Value that is still {Open} → "غير مُعدّ" placeholder (never invent numbers). */
  SA.openValue = function (label) { return SA.h('span', { class: 'sap-open', title: 'قيمة لم تُحسم بعد (Open) — لا قيمة افتراضية' }, label || 'غير مُعدّ', SA.tag('open')); };
  /** Prototype-only default (e.g. lock threshold 5) flagged as demo. */
  SA.demoValue = function (text) { return SA.h('span', { class: 'sap-demo-val', title: 'قيمة تجريبية للنموذج — القرار الفعلي Open' }, text, SA.h('em', 'قيمة تجريبية')); };

  /* ───────────────────────── escape / misc ───────────────────────── */
  SA.userById = (id) => SA.store.find('users', id);
  SA.roleById = (id) => SA.store.find('roles', id);
  SA.userName = (id) => { const u = SA.userById(id); return u ? u.name : id || '—'; };
  SA.roleName = (id) => { const r = SA.roleById(id); return r ? r.nameAr : id || '—'; };
  SA.deptName = (id) => { const d = SA.store.find('departments', id); return d ? d.name : '—'; };
  /** Download text as a file (CSV/MD/JSON). Works on file://. */
  SA.download = function (filename, text, mime) {
    const blob = new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };
  SA.csv = function (rows) { return rows.map((r) => r.map((c) => { const s = String(c == null ? '' : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\n'); };
  SA.copy = function (text) { try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true, () => fb()); } catch (e) { /* fallthrough */ } return Promise.resolve(fb()); function fb() { const t = document.createElement('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } document.body.removeChild(t); return ok; } };
})(window);
