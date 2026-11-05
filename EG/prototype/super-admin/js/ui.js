/* EG Super Admin prototype — ui.js
   Shared UI building blocks on top of SA.h: layers (modal/drawer), toast, confirm, step-up, menu, buttons, chips,
   page header, tabs, stepper, empty/denied/error/skeleton states, forms, data table, SA.live. */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h;
  SA.icons.addMany({
    key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M16 7l3 3M14 9l2 2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2M12 15v2"/>',
    dots: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    arrowleft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    arrowright: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sort: '<path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    compare: '<path d="M8 3 4 7l4 4M4 7h12M16 21l4-4-4-4M20 17H8"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3"/><path d="M7.5 15h9"/>',
    note: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 13h8M8 17h5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    play: '<path d="M7 4.5v15l12-7.5z"/>',
    external: '<path d="M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h3M20 17v4"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5M3 17.5l9 5 9-5"/>',
    activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
    inbox: '<path d="M3 13h5l1.5 3h5l1.5-3h5M3 13l3-8h12l3 8v6H3z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    chevdown: '<path d="m6 9 6 6 6-6"/>',
    chevup: '<path d="m6 15 6-6 6 6"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h7M9 8h3"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    pin: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    cursor: '<path d="m5 3 14 8-6 2-2 6z"/>',
    download2: '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 16V5M7 9l5-5 5 5M4 20h16"/>',
    swap: '<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
    userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5M19 8v6M16 11h6"/>',
    userx: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5M16 8l5 5M21 8l-5 5"/>',
    checkcircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    xcircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/>',
    keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
    gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'
  });

  const body = () => document.body;

  /* ───────────────────────── layers: modal + drawer ───────────────────────── */
  const layers = [];
  function focusables(root) { return SA.$$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', root).filter((e) => e.offsetParent !== null || e === document.activeElement); }
  document.addEventListener('keydown', (e) => {
    const top = layers[layers.length - 1]; if (!top) return;
    if (e.key === 'Escape') { if (top.dismissible !== false) { e.stopPropagation(); top.close(null); } return; }
    if (e.key === 'Tab') {
      const f = focusables(top.panel); if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || !top.panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !top.panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
  }, true);
  function openLayer(kind, o) {
    const prevFocus = document.activeElement; const titleId = SA.uid('t'); let resolve; const closed = new Promise((r) => (resolve = r));
    const closeBtn = h('button.sap-x', { type: 'button', 'aria-label': 'إغلاق', onclick: () => api.close(null) }, SA.icon('x'));
    const head = h('header.sap-layer-head', {}, h('div.sap-layer-title', {}, o.icon ? h('span.sap-layer-ico' + (o.danger ? '.is-danger' : ''), {}, SA.icon(o.icon)) : null, h('div', {}, h('h2', { id: titleId }, o.title || ''), o.subtitle ? h('p.sap-layer-sub', {}, o.subtitle) : null)), h('div.sap-layer-head-actions', {}, o.headActions || null, closeBtn));
    const bodyEl = h('div.' + (kind === 'modal' ? 'modal-body' : 'sap-drawer-body'), {}, o.body || null);
    const footEl = o.foot && (Array.isArray(o.foot) ? o.foot.length : true) ? h('div.' + (kind === 'modal' ? 'modal-foot' : 'sap-drawer-foot'), {}, o.foot) : null;
    const panel = kind === 'modal'
      ? h('div.modal.sap-modal.sap-size-' + (o.size || 'md'), { role: o.role || 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, head, bodyEl, footEl)
      : h('aside.sap-drawer.sap-size-' + (o.size || 'md'), { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }, head, o.tabs || null, bodyEl, footEl);
    const root = kind === 'modal'
      ? h('div.sap-layer.sap-layer-modal', {}, h('div.modal-backdrop', { onmousedown: (e) => { if (e.target === e.currentTarget && o.dismissible !== false) api.close(null); } }, panel))
      : h('div.sap-layer.sap-layer-drawer', {}, h('div.sap-scrim', { onmousedown: () => { if (o.dismissible !== false) api.close(null); } }), panel);
    const api = {
      el: panel, root, body: bodyEl, foot: footEl, head, closed, dismissible: o.dismissible, panel,
      close(result) {
        const i = layers.indexOf(api); if (i < 0) return; layers.splice(i, 1);
        root.classList.add('is-closing');
        setTimeout(() => { if (root.parentNode) root.parentNode.removeChild(root); }, SA.reducedMotion ? 0 : 160);
        if (!layers.length) body().classList.remove('sap-lock');
        try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); } catch (e) { /* noop */ }
        if (o.onClose) o.onClose(result); resolve(result);
      },
      setTitle(t, s) { const hh = head.querySelector('h2'); if (hh) hh.textContent = t; const sp = head.querySelector('.sap-layer-sub'); if (sp && s != null) sp.textContent = s; },
      setBusy(b) { panel.classList.toggle('is-busy', !!b); panel.setAttribute('aria-busy', b ? 'true' : 'false'); SA.$$('button', footEl || panel).forEach((x) => { if (!x.classList.contains('sap-x')) x.disabled = !!b; }); }
    };
    layers.push(api); body().classList.add('sap-lock'); body().appendChild(root);
    setTimeout(() => { const f = o.focus ? (typeof o.focus === 'string' ? SA.$(o.focus, panel) : o.focus) : (focusables(bodyEl)[0] || focusables(panel).filter((x) => !x.classList.contains('sap-x'))[0] || closeBtn); if (f) f.focus(); }, 30);
    return api;
  }
  SA.reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  SA.layers = { get count() { return layers.length; }, closeAll() { layers.slice().forEach((l) => l.close(null)); } };
  /** SA.modal({title, subtitle, icon, body:Node, foot:[nodes], size:'sm|md|lg|xl', dismissible, onClose, danger}) → {el, body, foot, close(result), closed:Promise, setBusy} */
  SA.modal = (o) => openLayer('modal', o);
  /** SA.drawer({title, subtitle, body, foot, tabs:Node, size:'md|lg', headActions}) — slides from the inline-end edge. */
  SA.drawer = (o) => openLayer('drawer', o);
  /** Standard modal footer buttons: SA.modalActions(modalRefFn, [{label, kind, onClick(close), close:true}]) */

  /* ───────────────────────── toast ───────────────────────── */
  let toastBox = null;
  /** SA.toast('تم الحفظ', 'success'|'error'|'warn'|'info', {undo: fn, ms}) */
  SA.toast = function (msg, type, o) {
    o = o || {}; type = type || 'info';
    if (!toastBox) { toastBox = h('div#sap-toasts.sap-toasts', { 'aria-live': 'polite', role: 'status' }); body().appendChild(toastBox); }
    const icon = { success: 'checkcircle', error: 'alert', warn: 'alert', info: 'info' }[type] || 'info';
    let timer; const t = h('div.sap-toast.is-' + type, {}, SA.icon(icon), h('span.sap-toast-msg', {}, msg));
    const close = () => { clearTimeout(timer); t.classList.add('is-out'); setTimeout(() => t.remove(), 180); };
    if (o.undo) t.appendChild(h('button.sap-toast-btn', { type: 'button', onclick: () => { close(); o.undo(); } }, 'تراجع'));
    t.appendChild(h('button.sap-toast-x', { type: 'button', 'aria-label': 'إغلاق', onclick: close }, SA.icon('x', 'icon-sm')));
    toastBox.appendChild(t); while (toastBox.children.length > 4) toastBox.firstChild.remove();
    timer = setTimeout(close, o.ms || (o.undo ? 7000 : 4500));
    return { close };
  };

  /* ───────────────────────── buttons / chips / avatar ───────────────────────── */
  /** SA.btn({label, icon, kind:'primary|accent|ghost|danger', size:'sm|lg', perm:'sa.x.y', reason, onClick, iconOnly, type, title, attrs}) —
      with `perm` not granted (or `reason` set) the button stays focusable but locked, shows a lock icon + tooltip with the reason. */
  SA.btn = function (o) {
    const lockedReason = o.reason || (o.perm && !SA.can(o.perm) ? 'ليست من صلاحياتك' + (o.perm ? ' (' + o.perm + ')' : '') : '');
    const cls = ['btn', 'btn-' + (o.kind || 'primary'), o.size ? 'btn-' + o.size : '', o.iconOnly ? 'btn-icon' : '', lockedReason ? 'sap-locked' : '', o.class || ''];
    const b = h('button', Object.assign({ type: o.type || 'button', class: cls, title: lockedReason || o.title || null, 'aria-label': o.iconOnly ? (o.label || o.title) : null, 'aria-disabled': lockedReason ? 'true' : null, 'data-tip': lockedReason || null }, o.attrs || {}),
      lockedReason ? SA.icon('lock', 'icon-sm') : o.icon ? SA.icon(o.icon, o.size === 'sm' ? 'icon-sm' : '') : null, o.iconOnly ? null : o.label);
    b.addEventListener('click', (e) => {
      if (lockedReason) { e.preventDefault(); e.stopPropagation(); SA.toast(lockedReason, 'warn'); return; }
      if (o.onClick) o.onClick(e, b);
    });
    return b;
  };
  /** Colour + dot + text status chip. kind: success|warning|danger|info|neutral */
  SA.chip = (text, kind) => h('span.chip' + (kind && kind !== 'neutral' ? '.chip-' + kind : ''), {}, text);
  SA.statusChip = (type, status) => { const m = (SA.catalog.status[type] || {})[status]; return SA.chip(m ? m[0] : status, m ? m[1] : 'neutral'); };
  SA.severityChip = (sev) => { const m = SA.catalog.severity[sev] || SA.catalog.severity.info; return SA.chip(m.label, m.kind); };
  SA.roleChip = function (roleId) {
    const r = SA.roleById(roleId); if (!r) return h('span.role-chip.is-external', {}, '—');
    return h('span.role-chip' + (r.isProtected ? '.is-owner' : ''), { title: r.nameEn || '' }, r.isProtected ? SA.icon('shield') : null, r.nameAr, r.isNew ? SA.tag('new') : null);
  };
  const AV_COLORS = ['#012864', '#345383', '#0d3779', '#5a4a8a', '#1f6b5a', '#8a5a1f', '#6a3d3d', '#2d5a7a'];
  SA.avatar = function (name, size) {
    const code = String(name || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return h('span.avatar.sap-avatar' + (size ? '.is-' + size : ''), { style: { background: AV_COLORS[code % AV_COLORS.length] }, 'aria-hidden': 'true' }, SA.fmt.initials(name));
  };
  SA.userCell = function (u, opts) {
    opts = opts || {};
    return h('div.sap-usercell', {}, SA.avatar(u.name), h('div', {}, h('b', {}, u.name, opts.you ? h('span.sap-you', {}, 'أنت') : null), h('small', {}, opts.sub || u.email)));
  };
  SA.kv = function (rows) { return h('dl.sap-kv', {}, rows.filter(Boolean).map((r) => [h('dt', {}, r[0]), h('dd', {}, r[1] == null || r[1] === '' ? '—' : r[1])])); };

  /* ───────────────────────── page chrome ───────────────────────── */
  /** SA.pageHead({title, desc, tags:[Node], actions:[Node], back:{label, href}}) — ONE accent button per screen. */
  SA.pageHead = function (o) {
    return h('div.sap-pagehead', {},
      o.back ? h('a.sap-back', { href: o.back.href }, SA.icon('arrowright', 'icon-sm icon-flip'), o.back.label || 'رجوع') : null,
      h('div.sap-pagehead-row', {}, h('div', {}, h('h1.sap-h1', {}, o.title, o.tags ? h('span.sap-h1-tags', {}, o.tags) : null), o.desc ? h('p.sap-desc', {}, o.desc) : null), h('div.sap-actions', {}, o.actions || null)));
  };
  SA.card = (o, ...kids) => h('section.card.sap-card' + (o.flush ? '.card-flush' : ''), { class: o.class || null }, o.title ? h('div.card-head', {}, h('h2.sap-card-title', {}, o.title, o.tags ? o.tags : null), o.actions ? h('div.sap-actions', {}, o.actions) : null) : null, o.flush ? kids : h('div.sap-card-body', {}, kids));
  SA.kpi = (label, value, o) => { o = o || {}; return h((o.href ? 'a' : 'div') + '.card.kpi.sap-kpi' + (o.accent ? '.is-accent' : ''), o.href ? { href: o.href } : {}, h('span.kpi-label', {}, label), h('span.kpi-value.num', {}, value), o.sub ? h('span.kpi-delta', {}, o.sub) : null); };
  /** SA.tabs({tabs:[{id,label,icon,badge}], active, onChange(id), label}) → {el, setActive(id), active} — arrow-key navigation. */
  SA.tabs = function (o) {
    let active = o.active || o.tabs[0].id; const el = h('div.tabs.sap-tabs', { role: 'tablist', 'aria-label': o.label || 'تبويبات' });
    const btns = {};
    o.tabs.forEach((t) => {
      const b = h('button.tab', { type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-selected': 'false', tabindex: '-1', 'aria-controls': 'panel-' + t.id, onclick: () => set(t.id, true) }, t.icon ? SA.icon(t.icon, 'icon-sm') : null, t.label, t.badge != null ? h('span.sap-count', {}, t.badge) : null);
      btns[t.id] = b; el.appendChild(b);
    });
    el.addEventListener('keydown', (e) => {
      const ids = o.tabs.map((t) => t.id); const i = ids.indexOf(active); let n = -1;
      const rtl = document.dir === 'rtl' || document.documentElement.dir === 'rtl';
      if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) n = (i + 1) % ids.length; else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) n = (i - 1 + ids.length) % ids.length; else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = ids.length - 1;
      if (n >= 0) { e.preventDefault(); set(ids[n], true); btns[ids[n]].focus(); }
    });
    function set(id, fire) { active = id; Object.keys(btns).forEach((k) => { btns[k].setAttribute('aria-selected', k === id ? 'true' : 'false'); btns[k].tabIndex = k === id ? 0 : -1; }); if (fire && o.onChange) o.onChange(id); }
    set(active, false);
    return { el, setActive: (id) => set(id, false), get active() { return active; }, setBadge(id, v) { const b = btns[id]; if (!b) return; let c = b.querySelector('.sap-count'); if (v == null) { if (c) c.remove(); return; } if (!c) { c = h('span.sap-count'); b.appendChild(c); } c.textContent = v; } };
  };
  /** Wizard stepper: SA.stepper(['بيانات','دور وقسم','مراجعة'], currentIndex) */
  SA.stepper = (steps, cur) => h('ol.sap-stepper', { 'aria-label': 'خطوات المعالج' }, steps.map((s, i) => h('li', { class: i < cur ? 'is-done' : i === cur ? 'is-now' : '', 'aria-current': i === cur ? 'step' : null }, h('span.sap-step-n', {}, i < cur ? SA.icon('check', 'icon-sm') : String(i + 1)), h('span', {}, s))));
  SA.segmented = function (items, active, onChange) {
    const el = h('div.segmented', { role: 'group' });
    items.forEach((it) => el.appendChild(h('button', { type: 'button', 'aria-pressed': String(it[0] === active), onclick: (e) => { SA.$$('button', el).forEach((b) => b.setAttribute('aria-pressed', 'false')); e.currentTarget.setAttribute('aria-pressed', 'true'); onChange(it[0]); } }, it[1])));
    return el;
  };
  SA.alert = (kind, ...kids) => h('div.alert.alert-' + (kind === 'info' ? 'info' : kind) + '.sap-alert', { role: kind === 'danger' ? 'alert' : null }, SA.icon(kind === 'success' ? 'checkcircle' : kind === 'info' ? 'info' : 'alert'), h('div', {}, kids));

  /* ───────────────────────── states ───────────────────────── */
  /** Empty state: SA.empty({icon, title, text, action:{label, onClick, perm}}) */
  SA.empty = (o) => h('div.empty.sap-empty', {}, h('span.sap-state-ico', {}, SA.icon(o.icon || 'inbox', 'icon-lg')), h('strong', {}, o.title || 'لا توجد بيانات'), o.text ? h('p.t-muted', {}, o.text) : null, o.action ? SA.btn({ label: o.action.label, icon: o.action.icon || 'plus', kind: 'primary', perm: o.action.perm, onClick: o.action.onClick }) : null);
  /** Error state with retry */
  SA.errorState = (o) => { o = o || {}; return h('div.empty.sap-empty.is-error', { role: 'alert' }, h('span.sap-state-ico.is-danger', {}, SA.icon('wifioff', 'icon-lg')), h('strong', {}, o.title || 'مقدرناش نحمّل البيانات'), h('p.t-muted', {}, o.text || 'محدش اتأثر. جرّب تاني.'), o.onRetry ? SA.btn({ label: 'إعادة المحاولة', icon: 'refresh', kind: 'primary', onClick: o.onRetry }) : null); };
  /** Denied (403) state: SA.denied({perm, title, text}) — also used by SA.guard. */
  SA.denied = (o) => { o = o || {}; return h('div.denied.sap-denied', { role: 'alert' }, h('span.dot', {}, SA.icon('shield')), h('strong', {}, o.title || 'هذه الشاشة ليست من صلاحياتك'), h('span.t-muted', {}, o.text || 'اطلب من مدير النظام إضافتها لدورك.'), o.perm ? h('code', {}, o.perm) : null, h('div.cluster', { style: { justifyContent: 'center' } }, o.home !== false ? SA.btn({ label: 'العودة للرئيسية', icon: 'home', kind: 'ghost', onClick: () => SA.nav(SA.homeRoute() || 'start') }) : null)); };
  /** Returns null when allowed, otherwise a denied node (and logs ACCESS.DENIED): const d = SA.guard('sa.x.y'); if (d) return root.append(d); */
  SA.guard = function (perm, o) {
    if (SA.can(perm)) return null;
    SA.audit('ACCESS.DENIED', { target: { type: 'permission', id: perm, label: perm }, result: 'denied' });
    return SA.denied(Object.assign({ perm }, o || {}));
  };
  /** Skeleton: SA.skeleton({kind:'table'|'cards'|'form'|'detail', rows}) */
  SA.skeleton = function (o) {
    o = o || {}; const rows = o.rows || 6; const k = o.kind || 'table';
    if (k === 'cards') return h('div.sap-grid-cards', { 'aria-busy': 'true', 'aria-label': 'جاري التحميل' }, Array.from({ length: o.rows || 4 }, () => h('div.card', {}, h('div.skeleton', { style: { width: '40%', height: '12px' } }), h('div.skeleton', { style: { width: '60%', height: '28px', marginBlock: '10px' } }), h('div.skeleton', { style: { width: '80%' } }))));
    if (k === 'form' || k === 'detail') return h('div.sap-skel', { 'aria-busy': 'true', 'aria-label': 'جاري التحميل' }, Array.from({ length: rows }, (_, i) => h('div.skeleton', { style: { width: (95 - (i % 3) * 18) + '%', height: '16px', marginBlock: '14px' } })));
    return h('div.sap-skel', { 'aria-busy': 'true', 'aria-label': 'جاري التحميل' }, Array.from({ length: rows }, () => h('div.sap-skel-row', {}, h('div.skeleton.sap-skel-circle'), h('div.skeleton', { style: { width: '30%' } }), h('div.skeleton', { style: { width: '14%' } }), h('div.skeleton', { style: { width: '12%' } }), h('div.skeleton', { style: { width: '10%' } }))));
  };
  /** Re-render `root` with build() whenever any of the store `paths` change. Returns cleanup (call it from your render's return). */
  SA.live = function (root, build, paths) {
    const run = () => { const sx = root.scrollTop; SA.clear(root); const n = build(); if (n) root.appendChild(n); if (sx) root.scrollTop = sx; };
    run(); const offs = (paths || []).map((p) => SA.store.subscribe(p, run)); return () => offs.forEach((f) => f());
  };

  /* ───────────────────────── popover menu ───────────────────────── */
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.remove(); openMenu = null; document.removeEventListener('mousedown', outside, true); } }
  function outside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
  /** SA.menu(anchor, [{label, icon, onClick, danger, disabled:'reason'|false, divider:true, hidden}]) */
  SA.menu = function (anchor, items) {
    closeMenu();
    const list = items.filter((i) => i && !i.hidden);
    const m = h('div.sap-menu', { role: 'menu' });
    list.forEach((it) => {
      if (it.divider) { m.appendChild(h('div.sap-menu-sep', { role: 'separator' })); return; }
      const b = h('button.sap-menu-item' + (it.danger ? '.is-danger' : '') + (it.disabled ? '.is-disabled' : ''), { type: 'button', role: 'menuitem', 'aria-disabled': it.disabled ? 'true' : null, title: it.disabled || null }, it.disabled ? SA.icon('lock', 'icon-sm') : it.icon ? SA.icon(it.icon, 'icon-sm') : h('span.sap-menu-gap'), h('span', {}, it.label, it.disabled ? h('small', {}, it.disabled) : null));
      b.addEventListener('click', () => { if (it.disabled) { SA.toast(it.disabled, 'warn'); return; } closeMenu(); if (it.onClick) it.onClick(); });
      m.appendChild(b);
    });
    body().appendChild(m); openMenu = m;
    const r = anchor.getBoundingClientRect(); const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = document.dir === 'rtl' ? r.left : r.right - mw; if (left < 8) left = 8; if (left + mw > innerWidth - 8) left = innerWidth - mw - 8;
    let top = r.bottom + 4; if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
    m.addEventListener('keydown', (e) => { const bs = SA.$$('.sap-menu-item', m); const i = bs.indexOf(document.activeElement); if (e.key === 'ArrowDown') { e.preventDefault(); (bs[i + 1] || bs[0]).focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); (bs[i - 1] || bs[bs.length - 1]).focus(); } else if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); anchor.focus(); } else if (e.key === 'Tab') closeMenu(); });
    const f = SA.$('.sap-menu-item', m); if (f) f.focus();
    return m;
  };
  SA.closeMenu = closeMenu;

  /* ───────────────────────── confirm + step-up ───────────────────────── */
  /** SA.confirm({title, impact:[string]|string, warnings:[string], reasonRequired, reasonLabel, danger, confirmLabel, cancelLabel, note, extra:Node, icon}) → Promise<{ok, reason}> */
  SA.confirm = function (o) {
    return new Promise((resolve) => {
      let reasonEl = null; const wantReason = o.reasonRequired || o.reason;
      const impact = o.impact ? (Array.isArray(o.impact) ? o.impact : [o.impact]) : [];
      const confirmBtn = h('button.btn.' + (o.danger ? 'btn-accent' : 'btn-primary'), { type: 'button', onclick: () => { if (confirmBtn.disabled) return; m.close({ ok: true, reason: reasonEl ? reasonEl.value.trim() : '' }); } }, o.confirmLabel || 'تأكيد');
      const check = () => { confirmBtn.disabled = !!(o.reasonRequired && reasonEl && reasonEl.value.trim().length < 3); };
      if (wantReason) reasonEl = h('textarea.textarea', { rows: 3, placeholder: o.reasonPlaceholder || 'اكتب السبب…', 'aria-label': o.reasonLabel || 'السبب', oninput: check });
      const bodyNode = h('div.sap-confirm', {},
        o.text ? h('p', {}, o.text) : null,
        impact.length ? h('div.sap-impact', {}, h('b', {}, 'الأثر'), h('ul', {}, impact.map((t) => h('li', {}, t)))) : null,
        (o.warnings || []).map((w) => SA.alert('warning', w)), o.extra || null,
        wantReason ? h('label.field', {}, h('span.label', {}, o.reasonLabel || 'السبب', o.reasonRequired ? h('span.req', {}, '*') : h('span.t-caption', {}, ' (اختياري)')), reasonEl) : null,
        h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), o.note || 'هيتسجّل في سجل التدقيق باسمك مع الوقت.'));
      const m = SA.modal({ title: o.title || 'تأكيد الإجراء', icon: o.icon || (o.danger ? 'alert' : 'info'), danger: o.danger, size: 'sm', body: bodyNode, foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close({ ok: false }) }, o.cancelLabel || 'إلغاء'), confirmBtn], onClose: () => {} });
      check(); m.closed.then((r) => resolve(r || { ok: false, reason: '' }));
    });
  };
  let stepUpAt = 0;
  SA.lastStepUp = () => stepUpAt;
  /** SA.stepUp('role.update', {title, text}) → Promise<boolean>. Asks only if the action key is in settings.security.stepUpActions (or opts.force). */
  SA.stepUp = function (actionKey, o) {
    o = o || {};
    const list = SA.store.get('settings.security.stepUpActions') || [];
    if (!o.force && list.indexOf(actionKey) < 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      let fails = 0; const me = SA.session.user;
      const input = h('input.input.num', { type: 'password', autocomplete: 'off', 'aria-label': 'كلمة المرور أو كود التحقق', placeholder: 'كلمة المرور أو كود التحقق', style: { direction: 'ltr', textAlign: 'start' } });
      const err = h('div.sap-field-error', { role: 'alert', hidden: true });
      const label = (SA.catalog.stepUp.find((s) => s[0] === actionKey) || [])[1];
      const submit = () => {
        const v = input.value.trim(); if (!v) { err.hidden = false; err.textContent = 'اكتب كلمة المرور أو الكود.'; return; }
        m.setBusy(true);
        SA.delay(180).then(() => {
          m.setBusy(false);
          const pw = (SA.store.get('creds') || {})[me && me.id] || 'Demo@1234';
          if (v === pw || v === '123456') { stepUpAt = Date.now(); m.close(true); return; }
          fails++; SA.audit('AUTH.STEPUP_FAILED', { target: { type: 'action', id: actionKey, label: label || actionKey }, result: 'failure', severity: fails >= 2 ? 'high' : 'medium' });
          if (fails >= 3) { m.close(false); SA.toast('فشل التحقق 3 مرات — اتلغت العملية وتم تسجيل المحاولة.', 'error'); return; }
          err.hidden = false; err.textContent = 'بيانات التحقق غير صحيحة — متبقي ' + (3 - fails) + (3 - fails === 1 ? ' محاولة.' : ' محاولات.'); input.select();
        }, (e) => { m.setBusy(false); SA.fail(e); });
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
      const m = SA.modal({
        title: o.title || 'إعادة التحقق (Step-up)', icon: 'lock', size: 'sm',
        body: h('div.sap-confirm', {}, h('p', {}, o.text || 'العملية دي حساسة' + (label ? ' (' + label + ')' : '') + '. أدخل كلمة مرورك أو كود التحقق للمتابعة.'), h('label.field', {}, h('span.label', {}, 'كلمة المرور أو كود التحقق'), input, err),
          h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تجريبي: كلمة المرور ', h('code', {}, 'Demo@1234'), ' أو الكود ', h('code', {}, '123456'), '. صلاحية التحقق بعد النجاح: ', SA.openValue('غير مُعدّة')))),
        foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close(false) }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: submit }, SA.icon('check', 'icon-sm'), 'تحقق ومتابعة')]
      });
      m.closed.then((r) => resolve(!!r));
    });
  };

  /* ───────────────────────── form helpers ───────────────────────── */
  const F = (SA.form = {});
  F.msg = { required: 'هذا الحقل مطلوب', email: 'صيغة البريد غير صحيحة', phone: 'رقم الهاتف غير صحيح', min: (n) => 'الحد الأدنى ' + n + ' أحرف', unique: 'القيمة مستخدمة من قبل' };
  F.rules = {
    required: (v) => (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) ? F.msg.required : null),
    email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : F.msg.email),
    phone: (v) => (!v || /^[+\d][\d\s-]{6,}$/.test(v) ? null : F.msg.phone),
    min: (n) => (v) => (!v || String(v).length >= n ? null : F.msg.min(n))
  };
  /** SA.form.field({name,label,type:'text|email|tel|password|textarea|select|checkbox|switch|radio|multi|number|date', value, options:[[value,label,desc?]], required, hint, placeholder, rules:[fn], disabled, dir, rows, onInput, onChange})
      → {el, input, name, get(), set(v), error(msg), validate()} */
  F.field = function (o) {
    const id = SA.uid('f'); const type = o.type || 'text'; const hintId = id + '-h', errId = id + '-e';
    let input, getter, setter; let lastErr = null;
    const errEl = h('div.sap-field-error', { id: errId, role: 'alert', hidden: true });
    const wrap = h('div.field.sap-field' + (o.class ? '.' + o.class : ''));
    const labelEl = o.label ? h('label.label', { for: id }, o.label, o.required ? h('span.req', { 'aria-hidden': 'true' }, '*') : null, o.tag || null) : null;
    const desc = { 'aria-describedby': (o.hint ? hintId + ' ' : '') + errId };
    if (type === 'select') {
      input = h('select.select', Object.assign({ id, name: o.name, disabled: o.disabled, onchange: (e) => { clear(); if (o.onChange) o.onChange(e.target.value, e); } }, desc), (o.options || []).map((op) => h('option', { value: op[0], disabled: op[2] === 'disabled' }, op[1])));
      setter = (v) => { input.value = v == null ? '' : v; }; getter = () => input.value;
      if (o.value != null) setter(o.value);
    } else if (type === 'textarea') {
      input = h('textarea.textarea', Object.assign({ id, name: o.name, rows: o.rows || 3, placeholder: o.placeholder, disabled: o.disabled, oninput: (e) => { clear(); if (o.onInput) o.onInput(e.target.value, e); } }, desc), o.value || '');
      setter = (v) => { input.value = v || ''; }; getter = () => input.value;
    } else if (type === 'checkbox' || type === 'switch') {
      input = h('input', Object.assign({ id, type: 'checkbox', name: o.name, checked: !!o.value, disabled: o.disabled, onchange: (e) => { if (o.onChange) o.onChange(e.target.checked, e); } }, desc));
      setter = (v) => { input.checked = !!v; }; getter = () => input.checked;
    } else if (type === 'radio' || type === 'multi') {
      const multi = type === 'multi'; const name = o.name || id; const inputs = [];
      input = h('div.sap-choices', { role: multi ? 'group' : 'radiogroup', 'aria-labelledby': id + '-l' }, (o.options || []).map((op) => {
        const i = h('input', { type: multi ? 'checkbox' : 'radio', name, value: op[0], disabled: o.disabled || op[3] === 'disabled', onchange: () => { clear(); if (o.onChange) o.onChange(getter()); } }); inputs.push(i);
        return h('label.sap-choice', {}, i, h('span', {}, h('b', {}, op[1]), op[2] ? h('small', {}, op[2]) : null));
      }));
      getter = () => (multi ? inputs.filter((i) => i.checked).map((i) => i.value) : (inputs.find((i) => i.checked) || {}).value || '');
      setter = (v) => { inputs.forEach((i) => { i.checked = multi ? (v || []).indexOf(i.value) >= 0 : i.value === v; }); };
      if (o.value != null) setter(o.value);
      if (labelEl) labelEl.removeAttribute('for'), (labelEl.id = id + '-l');
    } else {
      const isPw = type === 'password';
      input = h('input.input', Object.assign({ id, name: o.name, type: type === 'number' ? 'number' : type, value: o.value == null ? '' : o.value, placeholder: o.placeholder, disabled: o.disabled, autocomplete: o.autocomplete || 'off', min: o.min, max: o.max, dir: o.dir || (type === 'email' || type === 'tel' || type === 'password' || type === 'number' ? 'ltr' : null), style: type === 'email' || type === 'tel' || type === 'password' ? { textAlign: 'start' } : null, oninput: (e) => { clear(); if (o.onInput) o.onInput(e.target.value, e); } }, desc));
      getter = () => (type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value); setter = (v) => { input.value = v == null ? '' : v; };
      if (isPw) {
        const tog = h('button.sap-pw-toggle', { type: 'button', 'aria-label': 'إظهار كلمة المرور', onclick: () => { const s = input.type === 'password'; input.type = s ? 'text' : 'password'; tog.replaceChildren(SA.icon(s ? 'eyeoff' : 'eye')); tog.setAttribute('aria-label', s ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'); } }, SA.icon('eye'));
        input = h('div.sap-pw', {}, input, tog); const real = input.firstChild; const g = getter, s = setter; getter = () => real.value; setter = (v) => { real.value = v == null ? '' : v; }; input.focus = () => real.focus(); wrap._realInput = real;
      }
    }
    function clear() { if (lastErr) { lastErr = null; wrap.classList.remove('has-error'); errEl.hidden = true; const t = wrap._realInput || input; if (t.removeAttribute) t.removeAttribute('aria-invalid'); } }
    const api = {
      el: wrap, name: o.name, input: wrap._realInput || input, get: () => getter(), set: (v) => setter(v),
      error(msg) { lastErr = msg; if (!msg) return clear(); wrap.classList.add('has-error'); errEl.hidden = false; errEl.textContent = msg; (wrap._realInput || input).setAttribute('aria-invalid', 'true'); },
      validate() {
        const v = getter(); const rules = (o.required ? [F.rules.required] : []).concat(o.rules || []);
        for (const r of rules) { const m = r(v); if (m) { api.error(m); return false; } }
        api.error(null); return true;
      },
      focus() { (wrap._realInput || input).focus(); }
    };
    if (type === 'checkbox' || type === 'switch') {
      const cls = type === 'switch' ? 'label.sap-switch-row' : 'label.check';
      wrap.appendChild(type === 'switch' ? h('div.sap-switch-line', {}, h('span', {}, h('b', {}, o.label), o.hint ? h('small', {}, o.hint) : null), h('span.switch', {}, input, h('span'))) : h(cls, {}, input, o.label));
      if (type !== 'switch' && o.hint) wrap.appendChild(h('div.help', { id: hintId }, o.hint));
    } else {
      if (labelEl) wrap.appendChild(labelEl); wrap.appendChild(input);
      if (o.hint) wrap.appendChild(h('div.help', { id: hintId }, o.hint));
    }
    wrap.appendChild(errEl);
    return api;
  };
  /** SA.form.group([fields]) → {get() → {name:value}, validate() → bool (focuses first invalid), fields} */
  F.group = function (fields) {
    return {
      fields,
      get() { const o = {}; fields.forEach((f) => { if (f.name) o[f.name] = f.get(); }); return o; },
      validate() { let first = null; fields.forEach((f) => { if (!f.validate() && !first) first = f; }); if (first) first.focus(); return !first; }
    };
  };

  /* ───────────────────────── data table ───────────────────────── */
  /** SA.table(opts) — sticky header, sort, search, filter chips, pagination, bulk selection, row actions, loading/empty/error.
      opts: {columns:[{key,label,sort:true|fn,value(row),render(row)→Node|string,class,width}], rows:[]|()=>[], rowId:'id',
             search:{placeholder, keys:[...]|fn(row,q)}, filters:[{key,label,options:[[value,label]], test(row,val)}],
             initial:{q,filters:{k:v},sort:{key,dir},page}, pageSize, selectable, bulk:[{label,icon,danger,perm,run(rows,api)}],
             rowActions(row)→[menu items], onRowClick(row), empty:{icon,title,text,action}, state:'loading|error|ready', onRetry, toolbar:[Node], onChange(state), caption}
      returns {el, refresh(), setState(s), getState(), selected(), clearSelection(), setFilter(k,v), filteredRows()} */
  SA.table = function (o) {
    const idKey = o.rowId || 'id';
    const st = { q: (o.initial && o.initial.q) || '', filters: Object.assign({}, o.initial && o.initial.filters), sort: (o.initial && o.initial.sort) || null, page: (o.initial && o.initial.page) || 1, pageSize: o.pageSize || 10, sel: new Set(), state: o.state || 'ready' };
    const el = h('div.sap-tablecard');
    const getRows = () => (typeof o.rows === 'function' ? o.rows() : o.rows || []);
    function colValue(c, r) { return c.value ? c.value(r) : r[c.key]; }
    function filtered() {
      let rows = getRows().slice();
      if (st.q && o.search) { const q = st.q.trim().toLowerCase(); rows = rows.filter((r) => (typeof o.search.keys === 'function' ? o.search.keys(r, q) : o.search.keys.some((k) => String(typeof k === 'function' ? k(r) : r[k] == null ? '' : r[k]).toLowerCase().indexOf(q) >= 0))); }
      (o.filters || []).forEach((f) => { const v = st.filters[f.key]; if (v != null && v !== '') rows = rows.filter((r) => (f.test ? f.test(r, v) : String(r[f.key]) === String(v))); });
      if (st.sort) { const c = o.columns.find((x) => x.key === st.sort.key); if (c && c.sort) { const dir = st.sort.dir === 'desc' ? -1 : 1; rows.sort((a, b) => { if (typeof c.sort === 'function') return c.sort(a, b) * dir; const x = colValue(c, a), y = colValue(c, b); if (x == null) return 1; if (y == null) return -1; return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ar')) * dir; }); } }
      return rows;
    }
    const emit = () => { if (o.onChange) o.onChange({ q: st.q, filters: Object.assign({}, st.filters), sort: st.sort, page: st.page }); };
    /* toolbar (built once so the search input keeps focus) */
    const searchInput = o.search ? h('input.input', { type: 'search', placeholder: o.search.placeholder || 'بحث…', 'aria-label': o.search.placeholder || 'بحث', value: st.q, oninput: SA.debounce((e) => { st.q = e.target.value; st.page = 1; render(); emit(); }, 120) }) : null;
    const filterEls = {};
    const filterBar = h('div.sap-filterbar', {}, (o.filters || []).map((f) => {
      const sel = h('select.select.sap-filter-sel', { 'aria-label': f.label, onchange: (e) => { st.filters[f.key] = e.target.value; st.page = 1; render(); emit(); } }, h('option', { value: '' }, f.label + ': الكل'), f.options.map((op) => h('option', { value: op[0] }, op[1])));
      sel.value = st.filters[f.key] == null ? '' : st.filters[f.key]; filterEls[f.key] = sel; return sel;
    }));
    const toolbar = h('div.sap-toolbar', {}, searchInput ? h('div.input-wrap.sap-search', {}, SA.icon('search'), searchInput) : null, filterBar, o.toolbar ? h('div.sap-toolbar-extra', {}, o.toolbar) : null);
    const chipsBar = h('div.sap-chips', { 'aria-label': 'الفلاتر النشطة' });
    const bulkBar = h('div.sap-bulkbar', { role: 'region', 'aria-label': 'إجراءات جماعية', hidden: true });
    const host = h('div.sap-table-host');
    const footer = h('div.sap-pager');
    el.append(o.search || (o.filters || []).length || o.toolbar ? toolbar : '', chipsBar, bulkBar, host, footer);
    function setFilter(k, v) { st.filters[k] = v; if (filterEls[k]) filterEls[k].value = v == null ? '' : v; st.page = 1; render(); emit(); }
    function clearAll() { st.q = ''; if (searchInput) searchInput.value = ''; Object.keys(filterEls).forEach((k) => { st.filters[k] = ''; filterEls[k].value = ''; }); st.page = 1; render(); emit(); }
    function activeCount() { return (st.q ? 1 : 0) + Object.keys(st.filters).filter((k) => st.filters[k] !== '' && st.filters[k] != null).length; }
    function renderChips() {
      SA.clear(chipsBar); const n = activeCount(); chipsBar.hidden = !n; if (!n) return;
      if (st.q) chipsBar.appendChild(h('button.sap-fchip', { type: 'button', onclick: () => { st.q = ''; searchInput.value = ''; render(); emit(); } }, 'بحث: ' + st.q, SA.icon('x', 'icon-sm')));
      (o.filters || []).forEach((f) => { const v = st.filters[f.key]; if (v === '' || v == null) return; const op = f.options.find((x) => String(x[0]) === String(v)); chipsBar.appendChild(h('button.sap-fchip', { type: 'button', 'aria-label': 'إزالة فلتر ' + f.label, onclick: () => setFilter(f.key, '') }, f.label + ': ' + (op ? op[1] : v), SA.icon('x', 'icon-sm'))); });
      chipsBar.appendChild(h('button.sap-linkbtn', { type: 'button', onclick: clearAll }, 'مسح الكل'));
    }
    function selectedRows() { const ids = st.sel; return getRows().filter((r) => ids.has(r[idKey])); }
    function renderBulk() {
      const n = st.sel.size; bulkBar.hidden = !n || !(o.bulk && o.bulk.length); if (bulkBar.hidden) return; SA.clear(bulkBar);
      bulkBar.append(h('span.sap-bulk-n', {}, SA.icon('checkcircle', 'icon-sm'), 'تم تحديد ' + n), h('div.sap-bulk-actions', {}, o.bulk.map((b) => SA.btn({ label: b.label, icon: b.icon, kind: b.danger ? 'danger' : 'ghost', size: 'sm', perm: b.perm, reason: b.reason, onClick: () => b.run(selectedRows(), api) }))), h('button.sap-linkbtn', { type: 'button', onclick: () => { st.sel.clear(); render(); } }, 'إلغاء التحديد'));
    }
    function render() {
      renderChips(); SA.clear(host); SA.clear(footer);
      if (st.state === 'loading') { host.appendChild(SA.skeleton({ rows: 6 })); bulkBar.hidden = true; return; }
      if (st.state === 'error') { host.appendChild(SA.errorState({ onRetry: o.onRetry, text: o.errorText })); bulkBar.hidden = true; return; }
      const all = filtered(); const total = all.length;
      const pages = Math.max(1, Math.ceil(total / st.pageSize)); if (st.page > pages) st.page = pages;
      const rows = all.slice((st.page - 1) * st.pageSize, st.page * st.pageSize);
      if (!total) {
        const e = o.empty || {}; const flt = activeCount() > 0;
        host.appendChild(flt ? SA.empty({ icon: 'search', title: 'مفيش نتائج مطابقة', text: 'جرّب تغيّر البحث أو تمسح الفلاتر.', action: { label: 'مسح الفلاتر', icon: 'x', onClick: clearAll } }) : SA.empty(Object.assign({ icon: 'inbox', title: 'لا توجد بيانات', text: '' }, e)));
        renderBulk(); return;
      }
      const cols = o.columns; const hasActions = !!o.rowActions;
      const pageIds = rows.map((r) => r[idKey]); const allSel = pageIds.length && pageIds.every((id) => st.sel.has(id)); const someSel = pageIds.some((id) => st.sel.has(id));
      const headRow = h('tr', {},
        o.selectable ? h('th.sap-th-sel', {}, h('label.perm-cb', {}, h('input', { type: 'checkbox', 'aria-label': 'تحديد كل الصفوف في الصفحة', checked: !!allSel, ref: (i) => { i.indeterminate = !allSel && someSel; }, onchange: (e) => { pageIds.forEach((id) => (e.target.checked ? st.sel.add(id) : st.sel.delete(id))); render(); } }), h('span'))) : null,
        cols.map((c) => {
          const sorted = st.sort && st.sort.key === c.key ? st.sort.dir : null;
          return h('th', { class: c.class || null, style: c.width ? { width: c.width } : null, 'aria-sort': sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : (c.sort ? 'none' : null) },
            c.sort ? h('button.sap-sort', { type: 'button', onclick: () => { st.sort = { key: c.key, dir: sorted === 'asc' ? 'desc' : 'asc' }; render(); emit(); } }, c.label, SA.icon(sorted === 'asc' ? 'chevup' : sorted === 'desc' ? 'chevdown' : 'sort', 'icon-sm')) : c.label);
        }),
        hasActions ? h('th.sap-th-act', {}, h('span.sap-sr', {}, 'إجراءات')) : null);
      const tbody = h('tbody', {}, rows.map((r) => {
        const rid = r[idKey];
        const tr = h('tr', { class: [st.sel.has(rid) ? 'is-selected' : '', o.onRowClick ? 'is-click' : ''], tabindex: o.onRowClick ? '0' : null, dataset: { id: rid } },
          o.selectable ? h('td.sap-td-sel', {}, h('label.perm-cb', {}, h('input', { type: 'checkbox', 'aria-label': 'تحديد الصف', checked: st.sel.has(rid), onchange: (e) => { if (e.target.checked) st.sel.add(rid); else st.sel.delete(rid); renderBulk(); tr.classList.toggle('is-selected', e.target.checked); const hd = SA.$('.sap-th-sel input', host); if (hd) { const ids = rows.map((x) => x[idKey]); hd.checked = ids.every((id) => st.sel.has(id)); hd.indeterminate = !hd.checked && ids.some((id) => st.sel.has(id)); } } }), h('span'))) : null,
          cols.map((c) => { const v = c.render ? c.render(r) : colValue(c, r); return h('td', { class: c.class || null, 'data-label': c.label }, v == null || v === '' ? '—' : v); }),
          hasActions ? h('td.sap-td-act', {}, h('button.sap-kebab', { type: 'button', 'aria-label': 'إجراءات الصف', 'aria-haspopup': 'menu', onclick: (e) => { e.stopPropagation(); SA.menu(e.currentTarget, o.rowActions(r)); } }, SA.icon('dots'))) : null);
        if (o.onRowClick) {
          tr.addEventListener('click', (e) => { if (e.target.closest('button,a,input,label,.sap-menu,select')) return; o.onRowClick(r); });
          tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === tr) o.onRowClick(r); });
        }
        return tr;
      }));
      host.appendChild(h('div.table-wrap.sap-table-wrap', {}, h('table.table.sap-table', { 'aria-label': o.caption || null }, h('thead', {}, headRow), tbody)));
      /* pager */
      const from = (st.page - 1) * st.pageSize + 1, to = Math.min(total, st.page * st.pageSize);
      const pbtn = (label, p, cur, dis, aria) => h('button.sap-page' + (cur ? '.is-cur' : ''), { type: 'button', disabled: dis, 'aria-label': aria || null, 'aria-current': cur ? 'page' : null, onclick: () => { st.page = p; render(); emit(); } }, label);
      const nums = []; for (let p = 1; p <= pages; p++) if (p === 1 || p === pages || Math.abs(p - st.page) <= 1) nums.push(p); else if (nums[nums.length - 1] !== '…') nums.push('…');
      footer.append(h('span.sap-pager-info', {}, 'عرض ', h('b.num', {}, from + '–' + to), ' من ', h('b.num', {}, total)),
        pages > 1 ? h('nav.sap-pages', { 'aria-label': 'الصفحات' }, pbtn(SA.icon('chevron', 'icon-sm icon-flip'), st.page - 1, false, st.page === 1, 'السابق'), nums.map((p) => (p === '…' ? h('span.sap-gap', {}, '…') : pbtn(String(p), p, p === st.page, false, 'صفحة ' + p))), pbtn(SA.icon('chevron', 'icon-sm'), st.page + 1, false, st.page === pages, 'التالي')) : null,
        h('label.sap-psize', {}, 'لكل صفحة', h('select.select', { 'aria-label': 'عدد الصفوف', onchange: (e) => { st.pageSize = +e.target.value; st.page = 1; render(); } }, [10, 25, 50].map((n) => h('option', { value: n, selected: n === st.pageSize }, n)))));
      renderBulk();
    }
    const api = {
      el, refresh: render, setState(s) { st.state = s; render(); }, getState: () => st, selected: selectedRows, clearSelection() { st.sel.clear(); render(); }, setFilter, filteredRows: filtered,
      setRows(r) { o.rows = r; render(); }
    };
    render();
    return api;
  };

  /* ───────────────────────── redaction + diff view ───────────────────────── */
  const RED = [[/wage|salary|أجر|مرتب/i, 'data.wages.view'], [/cost|تكلف/i, 'data.cost.view'], [/profit|margin|ربح|هامش/i, 'data.profit.view']];
  /** Replace values of sensitive-looking keys with a redaction mark unless the viewer holds the matching sensitive permission. */
  SA.redact = function (obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [] : {};
    Object.keys(obj).forEach((k) => {
      const rule = RED.find((r) => r[0].test(k));
      if (rule && !SA.canSensitive(rule[1])) out[k] = '••• (سري)'; else out[k] = typeof obj[k] === 'object' ? SA.redact(obj[k]) : obj[k];
    });
    return out;
  };
  /** Flatten two objects into rows [{key, before, after, changed}] (redacted). */
  SA.diffRows = function (before, after) {
    const b = SA.redact(before) || {}, a = SA.redact(after) || {}; const rows = [];
    const flat = (o, p, out) => { Object.keys(o || {}).forEach((k) => { const v = o[k], key = p ? p + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = Array.isArray(v) ? v.join('، ') : v; }); return out; };
    const fb = flat(b, '', {}), fa = flat(a, '', {});
    Array.from(new Set(Object.keys(fb).concat(Object.keys(fa)))).forEach((k) => rows.push({ key: k, before: fb[k], after: fa[k], changed: fb[k] !== fa[k] }));
    return rows;
  };
  SA.diffTable = function (before, after) {
    const rows = SA.diffRows(before, after);
    if (!rows.length) return h('p.t-muted', {}, 'لا توجد قيم قبل/بعد لهذا الحدث.');
    return h('div.table-wrap', {}, h('table.table.sap-diff', {}, h('thead', {}, h('tr', {}, h('th', {}, 'الحقل'), h('th', {}, 'قبل'), h('th', {}, 'بعد'))), h('tbody', {}, rows.map((r) => h('tr', { class: r.changed ? 'is-changed' : '' }, h('td', {}, h('code', {}, r.key)), h('td.sap-diff-before', {}, r.before == null ? '—' : String(r.before)), h('td.sap-diff-after', {}, r.after == null ? '—' : String(r.after)))))));
  };
})();
