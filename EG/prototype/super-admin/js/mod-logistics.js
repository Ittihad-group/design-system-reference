/* EG ERP prototype — mod-logistics.js  (app scm · group scm-log «التسليم والشحن» · moduleKey logistics)
   Screens: scm-deliveries scm/deliveries[/DN-id] · scm-dispatch scm/dispatch · scm-shipments scm/shipments[/SH-id] · scm-fleet scm/fleet
   Business actions go through ERP.flow (createDelivery / dispatch / deliver) so stock, COGS (GL), SO status, audit and notifications stay consistent.
   Own additive mutations (audited): DN vehicle/date assignment (DN.ASSIGNED) · DN loading (DN.LOADING) · shipment create/status/docs (SHIP.CREATED / SHIP.UPDATED / SHIP.DOC_GENERATED)
   · vehicles (FLEET.UPDATED). Additive fields: deliveries[].loadingAt, pod.signature/photo · shipments[].timeline[], docs[].generatedAt/by, atd, createdBy.
   Read-only helpers for other modules: ERP.logistics = { readyQueue(), remainingOf(so), dnKg(dn), shipmentRisk(sh), vehicleStatus(v), tripOf(dns, v) }
   Values that are assumptions (distances, trip cost, CBM, pallets, HS codes, container payloads) are tagged with ERP.ui.demo(). Currency is EGP only (v1). */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP;
  if (!SA || !ERP || !ERP.flow) return;
  const h = SA.h, st = SA.store, F = ERP.flow, K = ERP.stock, fmt = ERP.fmt, U = ERP.ui, get = ERP.get;
  const CS = SA.catalog.status;

  /* ───────────── catalog additions (additive) ───────────── */
  [['DN.ASSIGNED', 'إسناد إذن تسليم لمركبة/موعد', 'info'], ['DN.LOADING', 'بدء تحميل إذن تسليم', 'info'], ['SHIP.DOC_GENERATED', 'توليد/اعتماد مستند شحن', 'info'], ['FLEET.UPDATED', 'تعديل بيانات مركبة/سائق', 'medium']]
    .forEach((a) => SA.catalog.addAudit(a[0], a[1], a[2], 'scm'));
  if (!CS.vehicle) CS.vehicle = { available: ['متاحة', 'success'], on_trip: ['في رحلة', 'info'], maintenance: ['في الصيانة', 'warning'] };
  if (!CS.shipkind) CS.shipkind = { export: ['تصدير', 'info'], local: ['نقل محلي', 'neutral'] };
  if (SA.missions && SA.missions.areas && !SA.missions.areas.logistics) SA.missions.areas.logistics = 'التسليم والشحن';

  /* ───────────── styles ───────────── */
  (function css() {
    if (document.querySelector('style[data-mod="logistics"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'logistics');
    s.textContent = `
.lgx-muted { color: var(--color-text-muted); font-size: 12.5px; }
.lgx-late { color: var(--color-danger); font-weight: 700; }
.lgx-nolink { font-weight: 600; color: var(--color-text); }
.lgx-cell { display: flex; flex-direction: column; line-height: 1.35; min-width: 0; } .lgx-cell small { color: var(--color-text-muted); font-size: 11.5px; }
.lgx-tagx { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--eg-navy); background: var(--color-primary-tint); border-radius: 6px; padding: 1px 7px; }
.lgx-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lgx-sp { justify-content: space-between; }
.lgx-queue { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.lgx-q { border: 1px solid var(--color-border); border-radius: 12px; padding: 12px 14px; background: #fff; display: flex; flex-direction: column; gap: 10px; }
.lgx-q.is-late { border-inline-start: 3px solid var(--color-danger); }
.lgx-q-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.lgx-q-head b { display: block; font-size: var(--text-dense); } .lgx-q-head small { color: var(--color-text-muted); font-size: 12px; }
.lgx-q-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.lgx-q-lines li { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; }
.lgx-q-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-top: 1px dashed var(--color-border); padding-top: 8px; font-size: 12.5px; color: var(--color-text-muted); }
.lgx-board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(212px, 1fr); gap: 12px; overflow-x: auto; padding-bottom: 8px; align-items: start; }
.lgx-col { min-width: 0; background: var(--color-bg-alt); border-radius: 14px; padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 280px; border: 2px dashed transparent; transition: border-color .15s, background .15s; }
.lgx-col.is-un { background: #fff8ee; }
.lgx-col.is-over { border-color: var(--eg-navy-soft); background: var(--color-primary-tint); }
.lgx-col.is-maint { opacity: .75; }
.lgx-col-head { display: flex; flex-direction: column; gap: 6px; padding: 2px 2px 10px; border-bottom: 1px solid var(--color-border); }
.lgx-col-title { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; } .lgx-col-title b { font-size: var(--text-dense); }
.lgx-col-title .lgx-plate { flex: 0 1 auto; min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; } .lgx-col-title > .chip { flex: none; }
.lgx-col .erp-meter-l { flex-wrap: wrap; gap: 0 6px; font-size: 11.5px; } .lgx-col .erp-meter-l b { white-space: nowrap; }
.lgx-trip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; font-size: 11px; color: var(--color-text-muted); text-align: center; background: #fff; border-radius: 8px; padding: 6px 2px; }
.lgx-trip b { display: block; color: var(--color-text); font: 700 13px var(--font-en); }
.lgx-card { min-width: 0; background: #fff; border: 1px solid var(--color-border); border-radius: 10px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; cursor: grab; }
.lgx-card[draggable="false"] { cursor: default; } .lgx-card.is-moving { background: var(--color-primary-tint); border-style: dashed; }
.lgx-card:focus-within { box-shadow: 0 0 0 2px var(--eg-navy-tint); }
.lgx-card-top { display: flex; align-items: center; justify-content: space-between; gap: 4px 6px; flex-wrap: wrap; min-width: 0; }
.lgx-card-acts { display: flex; gap: 4px; justify-content: flex-end; }
.lgx-day { font-size: 11.5px; font-weight: 700; color: var(--eg-navy); margin-top: 2px; }
.lgx-drop { border: 1px dashed var(--color-border-strong); border-radius: 10px; padding: 18px 8px; text-align: center; color: var(--color-text-muted); font-size: 12px; }
.lgx-risk { display: flex; gap: 14px; border-radius: 14px; padding: 16px 18px; border: 1px solid #f5c2c4; background: linear-gradient(135deg, #fff4f4, #fff); margin-bottom: 16px; }
.lgx-risk.is-warning { border-color: #f2d6ad; background: linear-gradient(135deg, #fff9f0, #fff); }
.lgx-risk.is-ok { border-color: #bfe3cc; background: linear-gradient(135deg, #f2fbf5, #fff); }
.lgx-risk-ico { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; flex: none; background: var(--color-danger); color: #fff; }
.lgx-risk.is-warning .lgx-risk-ico { background: var(--color-warning); } .lgx-risk.is-ok .lgx-risk-ico { background: var(--color-success); }
.lgx-risk-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
.lgx-risk-body h3 { margin: 0; font-size: 1.05rem; color: var(--color-danger); line-height: 1.5; } .lgx-risk.is-warning h3 { color: var(--color-warning); } .lgx-risk.is-ok h3 { color: var(--color-success); }
.lgx-risk-chain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; font-size: 13px; }
.lgx-risk-chain li { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; line-height: 1.6; } .lgx-risk-chain li > .icon { color: var(--color-danger); flex: none; }
.lgx-risk-chain li.is-ok > .icon { color: var(--color-success); }
.lgx-risk-est { display: flex; gap: 8px; flex-wrap: wrap; }
.lgx-risk-est span { background: #fff; border: 1px solid var(--color-border); border-radius: 8px; padding: 4px 10px; font-size: 12.5px; } .lgx-risk-est b { font-family: var(--font-en); margin-inline-start: 4px; }
.lgx-risk-sug { margin: 0; padding-inline-start: 18px; font-size: 12.5px; color: var(--color-text-muted); line-height: 1.9; }
.lgx-docs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.lgx-docs li { display: flex; align-items: center; gap: 10px; padding: 10px 2px; border-bottom: 1px solid var(--color-border); }
.lgx-docs li:last-child { border-bottom: 0; }
.lgx-doc-ico { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: var(--color-warning-tint); color: var(--color-warning); flex: none; }
.lgx-docs li.is-ok .lgx-doc-ico { background: var(--color-success-tint); color: var(--color-success); }
.lgx-doc-name { flex: 1; min-width: 0; display: flex; flex-direction: column; } .lgx-doc-name b { font-size: var(--text-dense); } .lgx-doc-name small { color: var(--color-text-muted); font-size: 11.5px; }
.lgx-tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.lgx-tl li { position: relative; display: flex; gap: 10px; padding-bottom: 14px; }
.lgx-tl li:not(:last-child)::before { content: ""; position: absolute; inset-block: 18px 0; inset-inline-start: 7px; width: 2px; background: var(--color-border); }
.lgx-tl i { width: 16px; height: 16px; border-radius: 50%; background: var(--eg-navy); border: 3px solid var(--color-primary-tint); flex: none; margin-top: 3px; box-sizing: border-box; }
.lgx-tl li.is-future i { background: #fff; border-color: var(--color-border-strong); } .lgx-tl li.is-future b { color: var(--color-text-muted); font-weight: 600; }
.lgx-tl li.is-bad i { background: var(--color-danger); border-color: var(--color-danger-tint); }
.lgx-tl b { display: block; font-size: var(--text-dense); } .lgx-tl small { color: var(--color-text-muted); font-size: 12px; display: block; }
.lgx-route { background: linear-gradient(180deg, #edf3fa, #f8fafc); border-radius: 12px; border: 1px solid var(--color-border); overflow: hidden; }
.lgx-route text { font: 600 12px var(--font-ar); fill: var(--color-text); }
.lgx-route .lgx-r-sub { font: 500 10.5px var(--font-ar); fill: var(--color-text-muted); }
.lgx-mini { display: flex; flex-direction: column; gap: 10px; }
.lgx-mini-row { display: grid; grid-template-columns: minmax(150px, 1.1fr) minmax(160px, 2fr) auto; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-border); }
.lgx-mini-row:last-child { border-bottom: 0; }
.lgx-sig { width: 100%; height: 150px; border: 1.5px dashed var(--color-border-strong); border-radius: 10px; background: #fff; touch-action: none; cursor: crosshair; display: block; }
.lgx-sig-bar { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--color-text-muted); }
.lgx-photo { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 84px; border: 1.5px dashed var(--color-border-strong); border-radius: 10px; background: var(--color-bg-alt); color: var(--color-text-muted); cursor: pointer; font: inherit; width: 100%; }
.lgx-photo.is-set { border-style: solid; border-color: var(--color-success); background: var(--color-success-tint); color: var(--color-success); font-weight: 600; }
.lgx-pod-sig { max-width: 280px; border: 1px solid var(--color-border); border-radius: 8px; background: #fff; display: block; }
.lgx-tbl { width: 100%; border-collapse: collapse; font-size: var(--text-dense); }
.lgx-tbl th { text-align: start; font-size: 12px; color: var(--color-text-muted); font-weight: 600; padding: 6px 8px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-alt); }
.lgx-tbl td { padding: 8px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
.lgx-tbl tfoot td { font-weight: 700; border-bottom: 0; background: var(--color-bg-alt); }
.lgx-sheet-wrap { background: #e6eaf0; border-radius: 10px; padding: 18px; overflow: auto; }
.lgx-sheet { width: 794px; max-width: 100%; min-height: 1060px; margin: 0 auto; background: #fff; color: #1b1f27; box-shadow: 0 2px 14px rgba(1, 40, 100, .14); padding: 34px 38px; font-size: 12.5px; line-height: 1.6; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; }
.lgx-sheet-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid var(--eg-navy); padding-bottom: 12px; }
.lgx-sheet-co { display: flex; gap: 12px; align-items: flex-start; } .lgx-sheet-co img { height: 46px; width: auto; } .lgx-sheet-co div { display: flex; flex-direction: column; }
.lgx-sheet-co b { color: var(--eg-navy); font-size: 14px; } .lgx-sheet-co small { color: #555; font-size: 10.5px; }
.lgx-sheet-title { text-align: end; display: flex; flex-direction: column; align-items: flex-end; } .lgx-sheet-title h2 { margin: 0; color: var(--eg-navy); font-size: 19px; } .lgx-sheet-title small { color: #555; }
.lgx-sheet-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; background: #f4f6f9; border-radius: 8px; padding: 10px 12px; }
.lgx-sheet-meta small { display: block; color: #666; font-size: 10.5px; } .lgx-sheet-meta b { font-size: 12px; font-weight: 600; }
.lgx-sheet-table { width: 100%; border-collapse: collapse; }
.lgx-sheet-table th { background: var(--eg-navy); color: #fff; font-weight: 600; font-size: 11px; padding: 6px 7px; text-align: start; }
.lgx-sheet-table td { border-bottom: 1px solid #dde2ea; padding: 6px 7px; vertical-align: top; font-size: 11.5px; }
.lgx-sheet-table tfoot td { font-weight: 700; background: #f4f6f9; border-top: 2px solid var(--eg-navy); }
.lgx-sheet-notes { font-size: 11px; color: #444; border: 1px dashed #c9ced8; border-radius: 8px; padding: 8px 12px; } .lgx-sheet-notes p { margin: 2px 0; }
.lgx-sheet-box { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .lgx-sheet-box > div { border: 1px solid #dde2ea; border-radius: 8px; padding: 8px 10px; } .lgx-sheet-box small { display: block; color: #666; font-size: 10.5px; }
.lgx-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: auto; padding-top: 34px; } .lgx-sign div { border-top: 1px solid #333; padding-top: 6px; text-align: center; font-size: 11px; color: #333; }
.lgx-sheet-foot { border-top: 1px solid #dde2ea; padding-top: 6px; font-size: 9.5px; color: #888; text-align: center; }
.lgx-wm { align-self: flex-start; font: 700 11px var(--font-en); color: var(--color-warning); border: 1.5px solid var(--color-warning); border-radius: 6px; padding: 1px 8px; }
#lgx-print { display: none; }
@media print { body.lgx-printing > *:not(#lgx-print) { display: none !important; } body.lgx-printing #lgx-print { display: block !important; } #lgx-print .lgx-sheet { box-shadow: none; width: auto; min-height: 0; padding: 0; } @page { size: A4; margin: 14mm; } }
.lgx-vehs { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 255px), 1fr)); gap: 12px; }
.lgx-veh { border: 1px solid var(--color-border); border-radius: 12px; padding: 12px 14px; background: #fff; display: flex; flex-direction: column; gap: 8px; }
.lgx-veh-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.lgx-plate { font: 700 14px var(--font-ar); border: 2px solid var(--eg-navy); border-radius: 6px; padding: 0 8px; color: var(--eg-navy); background: #fff; display: inline-block; letter-spacing: .5px; }
.lgx-veh dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 12.5px; } .lgx-veh dt { color: var(--color-text-muted); } .lgx-veh dd { margin: 0; }
.lgx-flow { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: var(--color-text-muted); }
@media (max-width: 760px) { .lgx-sheet { padding: 18px; } .lgx-sheet-meta { grid-template-columns: 1fr 1fr; } .lgx-risk { flex-direction: column; } .lgx-mini-row { grid-template-columns: 1fr; } }`;
    document.head.appendChild(s);
  })();

  /* ───────────── helpers ───────────── */
  const today = () => ERP.day(0);
  const nowIso = () => new Date().toISOString();
  const me = () => SA.session.userId || 'SYSTEM';
  const p2 = (n) => String(n).padStart(2, '0');
  const addDays = (d, n) => { const x = new Date(String(d).slice(0, 10) + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + p2(x.getMonth() + 1) + '-' + p2(x.getDate()); };
  const localDay = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const OPEN = ['planned', 'loading'], MOVING = ['dispatched', 'in_transit'], ACTIVE = OPEN.concat(MOVING);
  const wOf = (itemId) => { const it = ERP.item(itemId); if (!it) return 1; if (it.weightKg != null) return it.weightKg; return it.family === 'acc' ? 1.5 : 1; };
  const uomOf = (itemId) => (ERP.item(itemId) || {}).uom;
  const kgOfLines = (lines) => (lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * wOf(l.itemId), 0);
  const dnKg = (dn) => kgOfLines(dn.lines);
  const kg = (n) => fmt.num(Math.round(n || 0)) + ' كجم';
  const dayLabel = (d) => { if (!d) return '—'; const n = ERP.daysBetween(today(), d); return n === 0 ? 'اليوم' : n === 1 ? 'غدًا' : n === -1 ? 'أمس' : n > 1 && n < 7 ? 'بعد ' + n + ' أيام' : n < -1 && n > -7 ? 'منذ ' + -n + ' أيام' : fmt.date(d); };
  /** perm-aware cross-module link: a real link only when the target screen exists and the persona may open it */
  const canRoute = (route) => { try { const p = SA.router.parse('#/' + route); return !!(p.module && SA.canOpen(p.module)); } catch (e) { return false; } };
  function L(id, label) { if (!id) return h('span', {}, '—'); const r = ERP.route(id); if (r && canRoute(r)) return U.docLink(id, label); return h('span.num.lgx-nolink', { title: r ? 'لا تملك صلاحية فتح هذا المستند' : '' }, label || id); }
  const custLink = (cid) => L(cid, ERP.customerName(cid));
  function liveView(root, build, paths) { let off = SA.live(root, build, paths); return { refresh() { off(); off = SA.live(root, build, paths); }, cleanup() { off(); } }; }
  const lockedReason = (perm) => (SA.can(perm) ? '' : 'ليست من صلاحياتك (' + perm + ')');

  /* distances from the plant (Gamasa) — demo values for trip planning */
  const KM = [['جمصة', 3], ['المنصورة', 45], ['دمياط', 40], ['طنطا', 95], ['المحلة', 70], ['كفر الشيخ', 75], ['الزقازيق', 105], ['بنها', 130], ['بورسعيد', 90], ['الإسماعيلية', 150], ['القاهرة الجديدة', 185], ['العاصمة الإدارية', 215], ['الشيخ زايد', 195], ['6 أكتوبر', 200], ['الجيزة', 175], ['الشروق', 180], ['القاهرة', 165], ['الإسكندرية', 210], ['العلمين', 340], ['رأس سدر', 330], ['السويس', 230], ['المنيا', 400], ['أسيوط', 500], ['الصعيد', 450], ['مسقط', 45], ['صحار', 45], ['ميناء دمياط', 40], ['ميناء الإسكندرية', 210]];
  const kmTo = (city) => { const s = String(city || ''); const r = KM.find((x) => s.indexOf(x[0]) >= 0); return r ? r[1] : 120; };
  const dnCity = (dn) => dn.address || (ERP.customer(dn.customerId) || {}).city || '';

  /* vehicles */
  const vehicles = () => get('vehicles');
  const vehicle = (id) => (id ? st.find('vehicles', id) : null);
  const vehLabel = (id) => { const v = vehicle(id); return v ? v.plate : '—'; };
  const vehTrips = (vid) => get('deliveries').filter((d) => d.vehicleId === vid && MOVING.indexOf(d.status) >= 0);
  const vehStatus = (v) => (!v ? 'available' : v.status === 'maintenance' ? 'maintenance' : vehTrips(v.id).length || get('shipments').some((s) => s.vehicleId === v.id && s.kind === 'local' && s.status === 'in_transit') ? 'on_trip' : 'available');
  const nextService = (v) => (v && v.lastService && !v.contracted ? addDays(v.lastService, v.serviceDays || 60) : null);
  const dayLoad = (vid, date, exceptId) => get('deliveries').filter((d) => d.vehicleId === vid && d.plannedDate === date && OPEN.indexOf(d.status) >= 0 && d.id !== exceptId).reduce((s, d) => s + dnKg(d), 0);
  /** trip estimate for a set of DNs on one vehicle (demo: 2 × farthest + 18 km per extra stop · 55 km/h · cost per km) */
  function tripOf(dns, v) {
    const cities = Array.from(new Set(dns.map(dnCity))); const far = cities.length ? Math.max.apply(null, cities.map(kmTo)) : 0;
    const km = dns.length ? Math.round(far * 2 + Math.max(0, cities.length - 1) * 18) : 0; const kgs = dns.reduce((s, d) => s + dnKg(d), 0);
    const hours = dns.length ? km / 55 + dns.length * 0.6 : 0; const cost = !dns.length ? 0 : v && v.contracted ? Math.round(2800 + km * 7.5) : Math.round(km * 11 + 650);
    return { stops: cities.length, km, kg: kgs, hours, cost, cities };
  }
  function loadMeter(kgs, cap, label) {
    const v = cap ? kgs / cap : 0;
    return h('div', {}, ERP.chart.meter(Math.min(1, v), { label: label || 'الحمولة', tone: v > 1 ? 'danger' : v >= 0.9 ? 'warning' : 'primary', text: Math.round(v * 100) + '% · ' + fmt.num(Math.round(kgs)) + ' / ' + fmt.num(cap || 0) + ' كجم' }),
      v > 1 ? h('small.lgx-late', {}, 'تجاوز الحمولة بـ ' + kg(kgs - cap) + ' — وزّع على مركبة أخرى') : null);
  }

  /* ready-to-deliver queue: reserved − delivered − quantities already on an active DN (planned/loading/dispatched/in_transit) */
  const openDnQty = (soId, itemId) => get('deliveries').filter((d) => d.soId === soId && ACTIVE.indexOf(d.status) >= 0).reduce((s, d) => s + d.lines.filter((l) => l.itemId === itemId).reduce((a, l) => a + l.qty, 0), 0);
  const remainingOf = (so) => (so.lines || []).map((l) => { const x = { itemId: l.itemId, ordered: l.qty, reserved: l.reservedQty || 0, delivered: l.deliveredQty || 0, open: openDnQty(so.id, l.itemId) }; x.qty = Math.max(0, x.reserved - x.delivered - x.open); return x; });
  const QUEUE_ST = ['ready', 'partially_delivered', 'in_production', 'confirmed'];
  function readyQueue() { return get('salesOrders').filter((so) => QUEUE_ST.indexOf(so.status) >= 0).map((so) => ({ so, lines: remainingOf(so).filter((x) => x.qty > 0) })).filter((x) => x.lines.length).sort((a, b) => String(a.so.promisedDate || '').localeCompare(String(b.so.promisedDate || ''))); }

  /* shipments */
  const SHIP_FLOW = ['planning', 'booked', 'loading', 'in_transit', 'arrived', 'cleared', 'delivered'];
  const PROG = { planning: 5, booked: 20, loading: 40, in_transit: 65, arrived: 80, cleared: 92, delivered: 100 };
  const shipments = () => get('shipments');
  const shipOfSo = (soId) => shipments().find((s) => (s.soIds || []).indexOf(soId) >= 0 && s.status !== 'delivered') || null;
  const shipSos = (sh) => (sh.soIds || []).map((id) => ERP.find('salesOrders', id)).filter(Boolean);
  const shipLines = (sh) => [].concat.apply([], shipSos(sh).map((so) => so.lines.map((l) => Object.assign({ soId: so.id }, l))));
  const DOCS = [
    { key: 'ci', name: 'فاتورة تجارية', match: /فاتورة/ }, { key: 'pl', name: 'قائمة تعبئة (Packing List)', match: /تعبئة|Packing/i },
    { key: 'co', name: 'شهادة منشأ', match: /منشأ/ }, { key: 'bl', name: 'بوليصة شحن (B/L)', match: /بوليصة|B\/L/ }, { key: 'qc', name: 'شهادة مطابقة/فحص', match: /مطابقة|فحص/ }];
  const docKey = (d) => (DOCS.find((x) => x.match.test(d.name)) || DOCS[0]).key;
  /* packing (demo assumptions) */
  const PACK = { door: 14, clad: 300, foam: 40, acc: 200 };
  const cbmOf = (itemId) => { const it = ERP.item(itemId) || {}; const a = it.attrs || {}; if (it.family === 'door') return ((a.width || 90) / 100) * 2.2 * 0.07; if (it.family === 'clad') return 0.0075; if (it.family === 'foam') return 1.22 * 2.44 * ((a.thickness || 10) / 1000); return 0.004; };
  const packOf = (lines) => lines.map((l) => { const it = ERP.item(l.itemId) || {}; const pallets = Math.max(1, Math.ceil(l.qty / (PACK[it.family] || PACK.acc))); const net = l.qty * wOf(l.itemId); return Object.assign({}, l, { pallets, net, gross: net * 1.015 + pallets * 22, cbm: l.qty * cbmOf(l.itemId) * 1.08 }); });
  const CONT = { '20': { kg: 21700, m3: 28, label: "20' DV" }, '40': { kg: 26700, m3: 58, label: "40' DV" }, '40HC': { kg: 26500, m3: 68, label: "40' HC" } };
  const contCap = (s) => { const m = /(\d+)\s*[×x]\s*(40HC|40|20)/i.exec(String(s || '')); const n = m ? +m[1] : 1; const t = CONT[m ? m[2].toUpperCase() : '40HC'] || CONT['40HC']; return { n, kg: t.kg * n, m3: t.m3 * n, label: n + ' × ' + t.label }; };
  const HS = { door: '3925.20', clad: '3916.20', foam: '3921.12', acc: '8302.10' };
  const hsOf = (itemId) => HS[(ERP.item(itemId) || {}).family] || '3926.90';

  /** live production risk of an export shipment (blocked WOs, down lines, maintenance waiting parts, spare stock, purchase approvals) */
  function shipmentRisk(sh) {
    const r = { level: 'ok', blocks: [], running: [], readiness: 1, kgNeed: 0, kgReady: 0, etdDays: sh.etd ? ERP.daysBetween(today(), sh.etd) : null, delayDays: 0, docsMissing: (sh.docs || []).filter((d) => !d.ok).length, worst: 0, shipped: SHIP_FLOW.indexOf(sh.status) >= 3 };
    shipSos(sh).forEach((so) => {
      so.lines.forEach((l) => { const w = wOf(l.itemId); r.kgNeed += l.qty * w; r.kgReady += Math.min(l.qty, Math.max(l.reservedQty || 0, l.deliveredQty || 0)) * w; });
      (so.woIds || []).forEach((wid) => {
        const wo = ERP.find('workOrders', wid); if (!wo || ['completed', 'closed'].indexOf(wo.status) >= 0) return;
        const ln = ERP.line(wo.lineId); const rem = Math.max(0, wo.qty - (wo.qtyDone || 0));
        const perDay = ln ? ln.capacityPerShift * ((ln.shifts || ['A']).length) : 300; const prodDays = Math.max(1, Math.ceil(rem / Math.max(1, perDay)));
        const down = !!(ln && ln.status === 'down');
        if (wo.status === 'on_hold' || down) {
          const mwo = get('maintenanceOrders').filter((m) => m.lineId === wo.lineId && ['done', 'cancelled'].indexOf(m.status) < 0).sort((a, b) => (a.kind === 'breakdown' ? -1 : 0) - (b.kind === 'breakdown' ? -1 : 0))[0] || null;
          const parts = mwo ? (mwo.parts || []).map((p) => { const it = ERP.item(p.itemId) || {}; return { itemId: p.itemId, need: p.qty, onHand: K.qty(p.itemId), onOrder: K.onOrder(p.itemId), lead: it.leadDays || 7, issued: !!p.issued }; }) : [];
          const missing = parts.filter((p) => !p.issued && p.onHand < p.need);
          const prq = missing.length ? get('purchaseRequisitions').find((q) => missing.some((p) => p.itemId === q.itemId) && ['open', 'approved', 'ordered'].indexOf(q.status) >= 0) || null : null;
          const ap = mwo ? get('approvals').find((a) => a.ref && a.ref.id === mwo.id && ['pending', 'delegated'].indexOf(a.status) >= 0) || null : null;
          const partsDays = missing.length ? Math.max.apply(null, missing.map((p) => (p.onOrder >= p.need ? Math.ceil(p.lead / 2) : p.lead))) : 0;
          const recover = (down ? partsDays + 1 : 0) + prodDays;
          r.blocks.push({ wo, ln, down, mwo, parts, missing, prq, ap, rem, prodDays, partsDays, recover });
        } else r.running.push({ wo, ln, rem, prodDays });
      });
    });
    r.readiness = r.kgNeed ? r.kgReady / r.kgNeed : 1;
    r.worst = Math.max.apply(null, [0].concat(r.blocks.map((b) => b.recover), r.running.map((x) => x.prodDays)));
    if (r.etdDays != null) r.delayDays = Math.max(0, r.worst - r.etdDays);
    if (r.shipped || sh.kind === 'local') r.level = 'ok';
    else if (r.blocks.length) r.level = r.delayDays > 0 || (r.etdDays != null && r.worst >= r.etdDays - 1) ? 'danger' : 'warning';
    else if (r.readiness < 1 && r.etdDays != null && r.worst > r.etdDays) r.level = 'warning';
    else if (r.docsMissing && r.etdDays != null && r.etdDays <= 5) r.level = 'warning';
    return r;
  }

  ERP.logistics = { readyQueue, remainingOf, dnKg, shipmentRisk, vehicleStatus: vehStatus, tripOf, kmTo };

  /* ───────────── printable A4 sheet ───────────── */
  function sheet(o) {
    const co = st.get('settings.company') || {};
    const cell = (c) => (Array.isArray(c) ? h('td', { colspan: c[1] }, c[0]) : h('td', {}, c == null ? '' : c));
    const foot = o.table ? o.table.footRows || (o.table.foot ? [o.table.foot] : null) : null;
    return h('article.lgx-sheet', { dir: 'rtl', lang: 'ar' },
      h('header.lgx-sheet-head', {},
        h('div.lgx-sheet-co', {}, h('img', { src: '../../assets/images/logo/wordmark-color.png', alt: 'EG' }), h('div', {}, h('b', {}, co.nameAr || 'المصرية الألمانية'), h('small', {}, co.nameEn || ''), h('small', {}, co.address || ''), h('small.num', {}, 'ت: ' + (co.phone || '') + ' · ' + (co.email || '')))),
        h('div.lgx-sheet-title', {}, h('h2', {}, o.title), o.titleEn ? h('small', {}, o.titleEn) : null, h('b.num', {}, o.no || ''), h('small.num', {}, o.date ? fmt.date(o.date) : ''), o.draft ? h('span.lgx-wm', {}, o.draft) : null)),
      o.meta ? h('div.lgx-sheet-meta', {}, o.meta.filter(Boolean).map((m) => h('div', {}, h('small', {}, m[0]), h('b', {}, m[1] == null || m[1] === '' ? '—' : m[1])))) : null,
      o.boxes ? h('div.lgx-sheet-box', {}, o.boxes.map((b) => h('div', {}, h('small', {}, b[0]), h('div', {}, b[1])))) : null,
      o.table ? h('table.lgx-sheet-table', {}, h('thead', {}, h('tr', {}, o.table.cols.map((c) => h('th', {}, c)))), h('tbody', {}, o.table.rows.map((r) => h('tr', {}, r.map(cell)))), foot ? h('tfoot', {}, foot.map((r) => h('tr', {}, r.map(cell)))) : null) : null,
      o.extra || null,
      o.notes ? h('div.lgx-sheet-notes', {}, o.notes.filter(Boolean).map((n) => h('p', {}, n))) : null,
      o.signs ? h('div.lgx-sign', {}, o.signs.map((s) => h('div', {}, s))) : null,
      h('footer.lgx-sheet-foot', {}, 'مستند مُولَّد من نظام EG — نموذج تجريبي للعرض · ' + SA.fmt.dt(nowIso())));
  }
  function doPrint(node) {
    const old = document.getElementById('lgx-print'); if (old) old.remove();
    const host = h('div#lgx-print', {}, node.cloneNode(true)); document.body.appendChild(host); document.body.classList.add('lgx-printing');
    const done = () => { document.body.classList.remove('lgx-printing'); if (host.parentNode) host.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { /* noop */ }
    setTimeout(done, 1200);
  }
  function openSheet(title, node, extraFoot) {
    let m = null;
    const foot = [h('button.btn.btn-ghost', { type: 'button', onclick: () => m && m.close() }, 'إغلاق'), h('button.btn.btn-ghost', { type: 'button', onclick: () => doPrint(node) }, SA.icon('download', 'icon-sm'), 'طباعة / حفظ PDF')].concat(extraFoot ? extraFoot(() => m) : []);
    m = SA.modal({ title, icon: 'doc', size: 'xl', body: h('div.lgx-sheet-wrap', {}, node), foot });
    return m;
  }

  /* ───────────── SVG route (no map tiles) ───────────── */
  const NS = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, kids) => { const e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k])); (kids || []).forEach((k) => k && e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k)); return e; };
  function routeSvg(o) {
    const W = 640, H = 230; const P0 = [585, 82], P1 = [330, 8], P2 = [70, 168]; const t = Math.max(0, Math.min(1, o.progress || 0));
    const bz = (a, b, c, u) => [(1 - u) * (1 - u) * a[0] + 2 * (1 - u) * u * b[0] + u * u * c[0], (1 - u) * (1 - u) * a[1] + 2 * (1 - u) * u * b[1] + u * u * c[1]];
    const Q1 = [P0[0] + (P1[0] - P0[0]) * t, P0[1] + (P1[1] - P0[1]) * t]; const Q2 = bz(P0, P1, P2, t);
    const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'erp-svg', role: 'img', 'aria-label': 'مسار الرحلة من ' + (o.from || 'جمصة') + ' إلى ' + (o.to || '') + ' — ' + Math.round(t * 100) + '%' });
    svg.appendChild(sv('path', { d: 'M0 0 H' + W + ' V34 C 520 52, 430 22, 330 40 S 120 30, 0 52 Z', fill: '#d6e6f6' }));
    svg.appendChild(sv('text', { x: 330, y: 24, 'text-anchor': 'middle', class: 'lgx-r-sub' }, ['البحر المتوسط']));
    for (let i = 1; i < 6; i++) svg.appendChild(sv('line', { x1: i * 107, x2: i * 107, y1: 40, y2: H, stroke: '#e3e9f1', 'stroke-width': 1 }));
    svg.appendChild(sv('path', { d: 'M' + P0.join(' ') + ' Q' + P1.join(' ') + ' ' + P2.join(' '), fill: 'none', stroke: '#9fb2cc', 'stroke-width': 4, 'stroke-dasharray': '2 9', 'stroke-linecap': 'round' }));
    if (t > 0) svg.appendChild(sv('path', { d: 'M' + P0.join(' ') + ' Q' + Q1.map((x) => x.toFixed(1)).join(' ') + ' ' + Q2.map((x) => x.toFixed(1)).join(' '), fill: 'none', stroke: '#012864', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    (o.via || []).forEach((v, i, arr) => { const p = bz(P0, P1, P2, (i + 1) / (arr.length + 1)); svg.appendChild(sv('circle', { cx: p[0], cy: p[1], r: 4, fill: '#fff', stroke: '#7d9cd1', 'stroke-width': 2 })); svg.appendChild(sv('text', { x: p[0], y: p[1] + 20, 'text-anchor': 'middle', class: 'lgx-r-sub' }, [v])); });
    svg.appendChild(sv('circle', { cx: P0[0], cy: P0[1], r: 9, fill: '#012864' })); svg.appendChild(sv('text', { x: P0[0], y: P0[1] + 28, 'text-anchor': 'middle' }, [o.from || 'جمصة — المصنع']));
    svg.appendChild(sv('circle', { cx: P2[0], cy: P2[1], r: 9, fill: t >= 1 ? '#147a3d' : '#fff', stroke: t >= 1 ? '#147a3d' : '#b9141b', 'stroke-width': 3 })); svg.appendChild(sv('text', { x: P2[0] + 4, y: P2[1] + 30, 'text-anchor': 'middle' }, [String(o.to || '').slice(0, 34)]));
    const g = sv('g', { transform: 'translate(' + (Q2[0] - 16).toFixed(1) + ' ' + (Q2[1] - 26).toFixed(1) + ')' }, [
      sv('rect', { x: 0, y: 4, width: 20, height: 13, rx: 2, fill: '#012864' }), sv('rect', { x: 20, y: 8, width: 11, height: 9, rx: 2, fill: '#345383' }),
      sv('circle', { cx: 6, cy: 19, r: 3, fill: '#1b1f27' }), sv('circle', { cx: 25, cy: 19, r: 3, fill: '#1b1f27' })]);
    g.appendChild(sv('title', {}, ['موقع المركبة التقريبي — ' + Math.round(t * 100) + '%'])); svg.appendChild(g);
    return h('div.lgx-route', {}, svg);
  }
  /** simulated progress of a dispatched DN (elapsed since dispatch vs. estimated duration) */
  function dnProgress(dn) {
    if (dn.status === 'delivered') return 1; if (!dn.dispatchedAt || MOVING.indexOf(dn.status) < 0) return 0;
    const km = kmTo(dnCity(dn)); const durH = km / 55 + 0.6; const el = (Date.now() - new Date(dn.dispatchedAt).getTime()) / 3600000;
    return Math.max(0.04, Math.min(0.96, el / durH));
  }
  const etaOf = (dn) => { const km = kmTo(dnCity(dn)); const durH = km / 55 + 0.6; return dn.dispatchedAt ? new Date(new Date(dn.dispatchedAt).getTime() + durH * 3600000).toISOString() : null; };

  /* ───────────── actions ───────────── */
  async function assignDn(dnId, vehId, date) {
    if (!SA.can('scm.dispatch.edit')) { SA.toast('ليست من صلاحياتك (scm.dispatch.edit)', 'warn'); return false; }
    const dn = ERP.find('deliveries', dnId); if (!dn || OPEN.indexOf(dn.status) < 0) { SA.toast('لا يمكن تعديل إذن خرج من المصنع', 'warn'); return false; }
    const nd = date || dn.plannedDate; if ((dn.vehicleId || null) === (vehId || null) && nd === dn.plannedDate) return false;
    const v = vehicle(vehId); if (v && vehStatus(v) === 'maintenance') { SA.toast('المركبة ' + v.plate + ' في الصيانة — اختر مركبة أخرى', 'warn'); return false; }
    const before = { vehicle: dn.vehicleId ? vehLabel(dn.vehicleId) : null, plannedDate: dn.plannedDate };
    try {
      await SA.api(() => {
        st.patch('deliveries', dnId, { vehicleId: vehId || null, driver: v ? v.driver : null, plannedDate: nd });
        SA.audit('DN.ASSIGNED', { target: { type: 'dn', id: dnId, label: ERP.customerName(dn.customerId) }, before, after: { vehicle: v ? v.plate : null, plannedDate: nd } });
      });
    } catch (e) { SA.fail(e); return false; }
    const load = v ? dayLoad(v.id, nd) : 0;
    if (v && load > v.capacityKg) SA.toast('تم الإسناد — لكن حمولة ' + v.plate + ' يوم ' + fmt.date(nd) + ' أصبحت ' + Math.round((load / v.capacityKg) * 100) + '% (تتجاوز السعة)', 'warn', { ms: 6500 });
    else SA.toast(v ? 'تم إسناد ' + dnId + ' إلى ' + v.plate + ' — ' + fmt.date(nd) : 'تم إلغاء إسناد ' + dnId, 'success');
    return true;
  }
  function vehOptions(withNone, date, exceptId) {
    return (withNone ? [['', withNone]] : []).concat(vehicles().map((v) => { const s = vehStatus(v); const load = date ? dayLoad(v.id, date, exceptId) : 0; return [v.id, v.plate + ' — ' + v.type + (s === 'maintenance' ? ' (في الصيانة)' : s === 'on_trip' ? ' (في رحلة الآن)' : '') + (date && load ? ' · محمّل ' + Math.round((load / v.capacityKg) * 100) + '%' : ''), s === 'maintenance' ? 'disabled' : '']; }));
  }

  function createDnModal(so) {
    const rem = remainingOf(so).filter((x) => x.qty > 0);
    if (!rem.length) { SA.toast('لا توجد كميات محجوزة متاحة للتسليم في ' + so.id, 'warn'); return; }
    const c = ERP.customer(so.customerId) || {}; const sh = so.export ? shipOfSo(so.id) : null;
    const inputs = {}; const totalEl = h('b.num', {}, '—'); const vehInfo = h('div');
    const fDate = SA.form.field({ name: 'plannedDate', label: 'تاريخ التسليم المخطط', type: 'date', required: true, value: so.promisedDate && so.promisedDate <= ERP.day(1) ? (so.promisedDate < today() ? today() : so.promisedDate) : ERP.day(1), onInput: () => upd() });
    fDate.input.addEventListener('change', () => upd());
    const fVeh = SA.form.field({ name: 'vehicleId', label: 'المركبة', type: 'select', options: vehOptions('بدون — تُحدد لاحقًا في لوحة الرحلات', fDate.get()), onChange: () => upd() });
    const sumKg = () => rem.reduce((s, x) => s + Math.max(0, Math.min(x.qty, Number(inputs[x.itemId].value) || 0)) * wOf(x.itemId), 0);
    function upd() {
      totalEl.textContent = kg(sumKg()); SA.clear(vehInfo);
      const v = vehicle(fVeh.get()); if (!v) { vehInfo.appendChild(h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'يمكنك إسناد المركبة لاحقًا بالسحب والإفلات في «تخطيط الرحلات».'))); return; }
      vehInfo.appendChild(loadMeter(dayLoad(v.id, fDate.get()) + sumKg(), v.capacityKg, 'حمولة ' + v.plate + ' يوم ' + fmt.date(fDate.get()) + ' بعد الإضافة'));
    }
    const rows = rem.map((x) => {
      const inp = h('input.input.num', { type: 'number', min: 0, max: x.qty, step: 1, value: x.qty, 'aria-label': 'كمية ' + ERP.itemName(x.itemId), style: { width: '104px' }, oninput: upd }); inputs[x.itemId] = inp;
      return h('tr', {}, h('td', {}, U.itemCell(x.itemId)), h('td.num', {}, fmt.num(x.ordered)), h('td.num', {}, fmt.num(x.delivered + x.open)), h('td.num', {}, h('b', {}, fmt.num(x.qty))), h('td', {}, inp), h('td.num', {}, fmt.num(wOf(x.itemId), 1)));
    });
    const body = h('div', {},
      SA.kv([['أمر البيع', L(so.id)], ['العميل', h('span', {}, c.name || so.customerId, ' · ', c.city || '')], ['موعد العميل', so.promisedDate ? fmt.date(so.promisedDate) + ' (' + dayLabel(so.promisedDate) + ')' : '—']]),
      h('div.table-wrap', { style: { marginTop: '12px' } }, h('table.lgx-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المطلوب', 'مُسلّم/على إذن', 'متاح للتسليم', 'كمية الإذن', 'كجم/وحدة'].map((t) => h('th', {}, t)))), h('tbody', {}, rows), h('tfoot', {}, h('tr', {}, h('td', { colspan: 4 }, 'إجمالي وزن الإذن'), h('td', { colspan: 2 }, totalEl))))),
      h('div.sap-formgrid', { style: { marginTop: '12px' } }, fDate.el, fVeh.el), vehInfo,
      sh ? SA.alert('info', h('b', {}, 'أمر تصدير. '), 'سيُربط الإذن بالشحنة ' + sh.id + ' ويُسلَّم في ' + (sh.port || 'الميناء') + '.') : null,
      h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'لا تتحرك البضاعة من المخزن إلا عند «الخروج من المصنع». الإنشاء يُسجَّل في التدقيق (DN.CREATED) ويُشعر المخزن بالتجهيز.'));
    const m = SA.modal({ title: 'إذن تسليم جديد — ' + so.id, subtitle: c.name, icon: 'truck', size: 'lg', body,
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, SA.icon('check', 'icon-sm'), 'إنشاء الإذن')] });
    upd();
    async function save() {
      if (!fDate.validate()) return;
      const lines = rem.map((x) => ({ itemId: x.itemId, qty: Math.max(0, Math.min(x.qty, Math.round(Number(inputs[x.itemId].value) || 0))) })).filter((l) => l.qty > 0);
      if (!lines.length) { SA.toast('حدد كمية واحدة على الأقل', 'warn'); return; }
      const vid = fVeh.get() || null; const v = vehicle(vid);
      if (v && vehStatus(v) === 'maintenance') { SA.toast('المركبة في الصيانة', 'warn'); return; }
      m.setBusy(true); let dn = null;
      try {
        dn = await SA.api(() => {
          const d = F.createDelivery(so.id, { lines, plannedDate: fDate.get(), vehicleId: vid, driver: v ? v.driver : null, shipmentId: sh ? sh.id : null });
          if (d && sh) { st.patch('deliveries', d.id, { address: sh.port || d.address }); st.patch('shipments', sh.id, (s) => { s.dnIds = (s.dnIds || []).concat(d.id); }); }
          if (d) SA.notify({ title: 'إذن تسليم للتجهيز: ' + d.id, body: ERP.customerName(so.customerId) + ' — ' + kg(dnKg(d)) + ' · ' + fmt.date(d.plannedDate), level: 'action', to: ['R-06'], link: '#/scm/deliveries/' + d.id });
          return d;
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close();
      if (!dn) { SA.toast('تعذّر إنشاء الإذن — راجع الكميات', 'error'); return; }
      SA.toast('تم إنشاء ' + dn.id + ' — ' + kg(dnKg(dn)) + (v ? ' على ' + v.plate : ''), 'success');
      SA.nav('scm/deliveries/' + dn.id);
    }
  }

  function dispatchModal(dn, onDone) {
    const fVeh = SA.form.field({ name: 'vehicleId', label: 'المركبة', type: 'select', required: true, value: dn.vehicleId || '', options: vehOptions('اختر المركبة…', dn.plannedDate, dn.id), onChange: (v) => { const x = vehicle(v); if (x) fDrv.set(x.driver || ''); } });
    const fDrv = SA.form.field({ name: 'driver', label: 'السائق', value: dn.driver || (vehicle(dn.vehicleId) || {}).driver || '' });
    const short = dn.lines.filter((l) => K.qty(l.itemId, K.FG) < l.qty);
    const cogs = dn.lines.reduce((s, l) => s + l.qty * ((ERP.item(l.itemId) || {}).stdCost || 0), 0);
    const body = h('div', {},
      h('table.lgx-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الكمية', 'رصيد W-01', ''].map((t) => h('th', {}, t)))), h('tbody', {}, dn.lines.map((l) => { const q = K.qty(l.itemId, K.FG); return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, fmt.num(l.qty)), h('td.num', {}, fmt.num(q)), h('td', {}, q >= l.qty ? SA.chip('متاح', 'success') : SA.chip('رصيد غير كافٍ', 'danger'))); }))),
      short.length ? SA.alert('danger', h('b', {}, 'لا يمكن الخروج: '), 'رصيد المنتج التام لا يغطي ' + short.length + ' بند. راجع المخزن أو عدّل الإذن.') : null,
      h('div.sap-formgrid', { style: { marginTop: '12px' } }, fVeh.el, fDrv.el),
      h('div.sap-impact', { style: { marginTop: '12px' } }, h('b', {}, 'الأثر'), h('ul', {}, h('li', {}, 'صرف ' + dn.lines.length + ' بند (' + kg(dnKg(dn)) + ') من مخزن المنتج التام W-01 وفك الحجز عن ' + dn.soId), h('li', {}, 'قيد تكلفة البضاعة المباعة آليًا (5101 / 1143): ', U.cost(cogs)), h('li', {}, 'إشعار المندوب وخدمة العملاء بخروج الشحنة'))));
    const m = SA.modal({ title: 'خروج من المصنع — ' + dn.id, subtitle: ERP.customerName(dn.customerId) + ' · ' + dnCity(dn), icon: 'truck', size: 'md', body,
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', disabled: !!short.length, onclick: go }, SA.icon('truck', 'icon-sm'), 'تأكيد الخروج')] });
    async function go() {
      if (short.length) return; if (!fVeh.validate()) return;
      const v = vehicle(fVeh.get()); if (!v || vehStatus(v) === 'maintenance') { fVeh.error('اختر مركبة متاحة'); return; }
      m.setBusy(true);
      try {
        await SA.api(() => {
          const r = F.dispatch(dn.id, { vehicleId: v.id, driver: fDrv.get() || v.driver });
          if (!r) throw SA.Err('state', 'state');
          const so = ERP.find('salesOrders', dn.soId);
          SA.notify({ title: 'خرجت شحنة ' + dn.id + ' من المصنع', body: ERP.customerName(dn.customerId) + ' — ' + v.plate + ' · ' + (fDrv.get() || v.driver || ''), level: 'info', to: ['R-19'], toUsers: so && so.repId ? [so.repId] : [], link: '#/scm/deliveries/' + dn.id });
        });
      } catch (e) { m.setBusy(false); if (e && e.code === 'state') { m.close(); SA.toast('حالة الإذن تغيّرت — حدّث الصفحة', 'warn'); return; } return SA.fail(e); }
      m.close(); SA.toast(dn.id + ' خرج من المصنع على ' + v.plate + ' — تم صرف المخزون', 'success'); if (onDone) onDone();
    }
  }

  async function startLoading(dn) {
    try { await SA.api(() => { st.patch('deliveries', dn.id, { status: 'loading', loadingAt: nowIso() }); SA.audit('DN.LOADING', { target: { type: 'dn', id: dn.id, label: ERP.customerName(dn.customerId) }, before: { status: 'planned' }, after: { status: 'loading', vehicle: vehLabel(dn.vehicleId) } }); }); } catch (e) { return SA.fail(e); }
    SA.toast('بدأ تحميل ' + dn.id, 'success');
  }

  function assignModal(dn) {
    const fDate = SA.form.field({ name: 'date', label: 'تاريخ التسليم', type: 'date', required: true, value: dn.plannedDate });
    const fVeh = SA.form.field({ name: 'vehicleId', label: 'المركبة', type: 'select', value: dn.vehicleId || '', options: vehOptions('بدون مركبة', dn.plannedDate, dn.id), onChange: () => upd() });
    const info = h('div'); const upd = () => { SA.clear(info); const v = vehicle(fVeh.get()); if (v) info.appendChild(loadMeter(dayLoad(v.id, fDate.get(), dn.id) + dnKg(dn), v.capacityKg, 'حمولة ' + v.plate + ' بعد الإسناد')); };
    fDate.input.addEventListener('change', upd);
    const m = SA.modal({ title: 'إسناد ' + dn.id, subtitle: ERP.customerName(dn.customerId) + ' · ' + kg(dnKg(dn)), icon: 'swap', size: 'sm', body: h('div', {}, fDate.el, fVeh.el, info),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (!fDate.validate()) return; m.setBusy(true); const ok = await assignDn(dn.id, fVeh.get() || null, fDate.get()); m.setBusy(false); if (ok !== false) m.close(); } }, 'حفظ')] });
    upd();
  }

  /** POD: receiver + note + signature pad + photo placeholder → ERP.flow.deliver (signature stored on the DN, not in the audit) */
  function podModal(dn, onDone) {
    const c = ERP.customer(dn.customerId) || {}; const ct = (c.contacts || [])[0] || {};
    const fRecv = SA.form.field({ name: 'receivedBy', label: 'اسم المستلم', required: true, value: ct.name || '' });
    const fNote = SA.form.field({ name: 'note', label: 'ملاحظات الاستلام', type: 'textarea', rows: 2, placeholder: 'مثال: استلام كامل بحالة سليمة — تم التفريغ بموقع المشروع' });
    const fOk = SA.form.field({ name: 'complete', type: 'checkbox', label: 'تم استلام كل البنود بالكميات المذكورة وبحالة سليمة', value: true });
    const cv = h('canvas.lgx-sig', { width: 560, height: 150, 'aria-label': 'لوحة توقيع المستلم' }); let drawn = false, drawing = false, last = null;
    const ctx2 = cv.getContext && cv.getContext('2d');
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [((e.clientX - r.left) * cv.width) / (r.width || 1), ((e.clientY - r.top) * cv.height) / (r.height || 1)]; };
    if (ctx2) {
      ctx2.lineWidth = 2.4; ctx2.lineCap = 'round'; ctx2.strokeStyle = '#012864';
      cv.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* noop */ } });
      cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); ctx2.beginPath(); ctx2.moveTo(last[0], last[1]); ctx2.lineTo(p[0], p[1]); ctx2.stroke(); last = p; drawn = true; sigState.textContent = 'تم التوقيع'; });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => cv.addEventListener(ev, () => { drawing = false; }));
    }
    const sigState = h('span', {}, 'وقّع داخل المربع بالماوس أو بالإصبع');
    const clearSig = h('button.sap-linkbtn', { type: 'button', onclick: () => { if (ctx2) ctx2.clearRect(0, 0, cv.width, cv.height); drawn = false; sigState.textContent = 'وقّع داخل المربع بالماوس أو بالإصبع'; } }, 'مسح التوقيع');
    let photo = null;
    const photoBtn = h('button.lgx-photo', { type: 'button', onclick: () => { photo = 'POD-' + dn.id + '-' + Date.now().toString(36).slice(-4).toUpperCase() + '.jpg'; photoBtn.classList.add('is-set'); SA.clear(photoBtn); photoBtn.append(SA.icon('checkcircle'), 'تم إرفاق صورة الاستلام: ' + photo + ' (محاكاة)'); } }, SA.icon('upload'), 'التقط/أرفق صورة البضاعة عند الاستلام (محاكاة)');
    const body = h('div', {},
      SA.kv([['الإذن', dn.id], ['العميل', c.name || dn.customerId], ['العنوان', dnCity(dn)], ['الحمولة', dn.lines.length + ' بند · ' + kg(dnKg(dn))]]),
      fRecv.el, fNote.el, fOk.el,
      h('div.field', {}, h('span.label', {}, 'توقيع المستلم'), cv, h('div.lgx-sig-bar', {}, sigState, clearSig)),
      h('div.field', {}, h('span.label', {}, 'صورة الاستلام'), photoBtn),
      h('p.sap-audit-note', {}, SA.icon('history', 'icon-sm'), 'تأكيد التسليم يحدّث أمر البيع (الكميات المسلّمة) ويُشعر الحسابات بأنه جاهز للفوترة.'));
    const m = SA.modal({ title: 'تأكيد التسليم (POD) — ' + dn.id, subtitle: c.name, icon: 'checkcircle', size: 'md', body,
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: go }, SA.icon('check', 'icon-sm'), 'تأكيد الاستلام')] });
    async function go() {
      if (!fRecv.validate()) return;
      let sig = null; try { sig = drawn ? cv.toDataURL('image/png') : null; } catch (e) { sig = null; }
      m.setBusy(true);
      try {
        await SA.api(() => {
          const r = F.deliver(dn.id, { receivedBy: fRecv.get().trim(), note: fNote.get().trim(), complete: !!fOk.get(), signed: drawn, photo });
          if (!r) throw SA.Err('state', 'state');
          if (sig) st.patch('deliveries', dn.id, (d) => { d.pod = Object.assign({}, d.pod, { signature: sig }); });
        });
      } catch (e) { m.setBusy(false); if (e && e.code === 'state') { m.close(); SA.toast('حالة الإذن تغيّرت — حدّث الصفحة', 'warn'); return; } return SA.fail(e); }
      m.close(); SA.toast('تم تأكيد تسليم ' + dn.id + ' — أمر البيع جاهز للفوترة', 'success'); if (onDone) onDone();
    }
  }

  function printDn(dn) {
    const c = ERP.customer(dn.customerId) || {}; const ct = (c.contacts || [])[0] || {}; const v = vehicle(dn.vehicleId); const tot = dnKg(dn);
    const rows = dn.lines.map((l, i) => { const it = ERP.item(l.itemId) || {}; return [String(i + 1), h('span.num', {}, it.code || l.itemId), it.name || l.itemId, h('span.num', {}, fmt.num(l.qty)), ERP.uom[it.uom] || '', h('span.num', {}, fmt.num(wOf(l.itemId), 1)), h('span.num', {}, fmt.num(Math.round(l.qty * wOf(l.itemId))))]; });
    const node = sheet({ title: 'إذن تسليم', titleEn: 'Delivery Note', no: dn.id, date: dn.plannedDate,
      meta: [['العميل', c.name], ['عنوان التسليم', dnCity(dn)], ['جهة الاتصال', (ct.name || '—') + (ct.phone ? ' · ' + ct.phone : '')], ['أمر البيع', dn.soId], ['المركبة', v ? v.plate + ' — ' + v.type : 'لم تُحدد'], ['السائق', dn.driver || (v || {}).driver || '—'], ['تاريخ الخروج', dn.dispatchedAt ? SA.fmt.dt(dn.dispatchedAt) : '—'], ['الحالة', (CS.dn[dn.status] || [dn.status])[0]], ['إجمالي الوزن', kg(tot)]],
      table: { cols: ['#', 'الكود', 'الصنف', 'الكمية', 'الوحدة', 'كجم/وحدة', 'الوزن (كجم)'], rows, foot: [['الإجمالي', 3], h('span.num', {}, fmt.num(dn.lines.reduce((s, l) => s + l.qty, 0))), '', '', h('span.num', {}, fmt.num(Math.round(tot)))] },
      notes: ['يُرجى فحص البضاعة عند الاستلام وتدوين أي ملاحظات قبل التوقيع.', 'هذا الإذن لا يتضمن أسعارًا — الفاتورة تصدر من الحسابات بعد تأكيد التسليم.', dn.pod ? 'تم الاستلام بواسطة: ' + (dn.pod.receivedBy || '—') + ' · ' + SA.fmt.dt(dn.pod.at) : null],
      signs: ['أمين المخزن', 'السائق', 'توقيع المستلم وختم العميل'] });
    openSheet('إذن تسليم ' + dn.id, node);
  }

  /* ───────────── 1. scm-deliveries ───────────── */
  const PERIODS = [['today', 'اليوم'], ['tomorrow', 'غدًا'], ['week', 'الأيام السبعة القادمة'], ['overdue', 'متأخر'], ['month', 'هذا الشهر'], ['past30', 'آخر 30 يوم']];
  function periodTest(d, v) {
    const td = today(); const pd = d.plannedDate || '';
    if (v === 'today') return pd === td; if (v === 'tomorrow') return pd === ERP.day(1); if (v === 'week') return pd >= td && pd <= ERP.day(6);
    if (v === 'overdue') return OPEN.indexOf(d.status) >= 0 && pd < td; if (v === 'month') return pd.slice(0, 7) === td.slice(0, 7); if (v === 'past30') return pd < td && pd >= ERP.day(-30); return true;
  }
  function dnRowActions(d) {
    const dis = (p) => lockedReason(p) || false;
    return [
      { label: 'فتح الإذن', icon: 'eye', onClick: () => SA.nav('scm/deliveries/' + d.id) },
      { label: 'طباعة إذن التسليم', icon: 'doc', onClick: () => printDn(d) },
      OPEN.indexOf(d.status) >= 0 ? { label: 'إسناد مركبة/موعد', icon: 'swap', disabled: dis('scm.dispatch.edit'), onClick: () => assignModal(d) } : null,
      OPEN.indexOf(d.status) >= 0 ? { label: 'خروج من المصنع', icon: 'truck', disabled: dis('scm.deliveries.dispatch'), onClick: () => dispatchModal(d) } : null,
      MOVING.indexOf(d.status) >= 0 ? { label: 'تأكيد التسليم (POD)', icon: 'checkcircle', disabled: dis('scm.deliveries.dispatch'), onClick: () => podModal(d) } : null
    ].filter(Boolean);
  }
  function queueCard(x) {
    const so = x.so; const c = ERP.customer(so.customerId) || {}; const kgs = kgOfLines(x.lines); const late = so.promisedDate && so.promisedDate < today(); const sh = so.export ? shipOfSo(so.id) : null;
    return h('article.lgx-q' + (late ? '.is-late' : ''), {},
      h('div.lgx-q-head', {}, h('div', {}, h('b', {}, c.name || so.customerId), h('small', {}, L(so.id), ' · ', c.city || '', so.export ? [' · ', h('span.lgx-tagx', {}, SA.icon('ship', 'icon-sm'), 'تصدير')] : null)), U.status('so', so.status)),
      h('ul.lgx-q-lines', {}, x.lines.map((l) => h('li', {}, U.itemCell(l.itemId), h('span.num', { style: { whiteSpace: 'nowrap' } }, h('b', {}, fmt.qty(l.qty, uomOf(l.itemId))), l.qty < l.ordered - l.delivered ? h('small.lgx-muted', {}, ' من ' + fmt.num(l.ordered - l.delivered)) : null)))),
      h('div.lgx-q-foot', {}, h('span', {}, 'موعد العميل: ', h('b' + (late ? '.lgx-late' : ''), {}, so.promisedDate ? dayLabel(so.promisedDate) : '—')), h('span.num', {}, kg(kgs))),
      sh ? h('small.lgx-muted', {}, SA.icon('ship', 'icon-sm'), ' مرتبط بشحنة التصدير ', L(sh.id), ' — يُفضَّل التحميل في الحاوية') : null,
      SA.btn({ label: 'أنشئ إذن تسليم', icon: 'plus', perm: 'scm.deliveries.create', size: 'sm', onClick: () => createDnModal(so) }));
  }
  function renderDeliveries(root, ctx) {
    if (ctx.path[0]) return renderDn(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'التسليم والشحن' }, { label: 'أذون التسليم' }]);
    let tState = { q: ctx.params.q || ctx.params.so || '', filters: Object.assign({}, ctx.params.status ? { status: ctx.params.status } : {}, ctx.params.period ? { period: ctx.params.period } : {}), sort: null, page: 1 };
    /* default order: open/moving first (by planned date), then delivered (newest first) */
    const ordered = () => { const rank = (d) => (OPEN.indexOf(d.status) >= 0 ? 0 : MOVING.indexOf(d.status) >= 0 ? 1 : 2); return get('deliveries').slice().sort((a, b) => rank(a) - rank(b) || (rank(a) < 2 ? String(a.plannedDate).localeCompare(String(b.plannedDate)) : String(b.deliveredAt || b.plannedDate).localeCompare(String(a.deliveredAt || a.plannedDate)))); };
    const build = () => {
      const dns = get('deliveries'); const q = readyQueue(); const td = today();
      const late = dns.filter((d) => OPEN.indexOf(d.status) >= 0 && d.plannedDate < td).length;
      const d30 = dns.filter((d) => d.status === 'delivered' && d.deliveredAt && ERP.daysBetween(localDay(d.deliveredAt), td) <= 30);
      const onTime = d30.length ? d30.filter((d) => d.onTime).length / d30.length : null;
      const tomKg = dns.filter((d) => OPEN.indexOf(d.status) >= 0 && d.plannedDate === ERP.day(1)).reduce((s, d) => s + dnKg(d), 0);
      const custOpts = Array.from(new Set(dns.map((d) => d.customerId))).map((id) => [id, ERP.customerName(id)]).sort((a, b) => a[1].localeCompare(b[1], 'ar'));
      const table = SA.table({
        caption: 'أذون التسليم',
        columns: [
          { key: 'id', label: 'الإذن', sort: true, render: (d) => h('span.lgx-cell', {}, h('a.erp-doc.num', { href: '#/scm/deliveries/' + d.id }, d.id), d.shipmentId ? h('small', {}, 'شحنة ' + d.shipmentId) : null) },
          { key: 'customer', label: 'العميل', sort: true, value: (d) => ERP.customerName(d.customerId), render: (d) => h('span.lgx-cell', {}, h('b', {}, ERP.customerName(d.customerId)), h('small', {}, dnCity(d))) },
          { key: 'soId', label: 'أمر البيع', render: (d) => L(d.soId) },
          { key: 'kg', label: 'الحمولة', sort: true, value: (d) => dnKg(d), render: (d) => h('span.lgx-cell', {}, h('b.num', {}, kg(dnKg(d))), h('small', {}, d.lines.length + ' بند')) },
          { key: 'plannedDate', label: 'الموعد', sort: true, render: (d) => h('span.lgx-cell', {}, h('b', {}, fmt.date(d.plannedDate)), OPEN.indexOf(d.status) >= 0 && d.plannedDate < td ? h('small.lgx-late', {}, 'متأخر') : h('small', {}, dayLabel(d.plannedDate))) },
          { key: 'vehicle', label: 'المركبة', sort: true, value: (d) => (d.vehicleId ? vehLabel(d.vehicleId) : 'ي'), render: (d) => (d.vehicleId ? h('span.lgx-cell', {}, h('b', {}, vehLabel(d.vehicleId)), h('small', {}, d.driver || (vehicle(d.vehicleId) || {}).driver || '')) : h('span.lgx-muted', {}, 'غير مُسند')) },
          { key: 'status', label: 'الحالة', sort: true, render: (d) => U.status('dn', d.status) },
          { key: 'deliveredAt', label: 'التسليم', sort: true, render: (d) => (d.deliveredAt ? h('span.lgx-cell', {}, h('b', {}, SA.fmt.date(d.deliveredAt)), d.onTime != null ? h('small', {}, SA.chip(d.onTime ? 'في الموعد' : 'متأخر', d.onTime ? 'success' : 'danger')) : null) : '—') }
        ],
        rows: ordered,
        search: { placeholder: 'بحث برقم الإذن أو العميل أو أمر البيع أو المدينة…', keys: ['id', 'soId', 'shipmentId', (d) => ERP.customerName(d.customerId), (d) => dnCity(d), (d) => vehLabel(d.vehicleId)] },
        filters: [
          { key: 'status', label: 'الحالة', options: Object.keys(CS.dn).map((k) => [k, CS.dn[k][0]]) },
          { key: 'period', label: 'الفترة', options: PERIODS, test: periodTest },
          { key: 'customer', label: 'العميل', options: custOpts, test: (d, v) => d.customerId === v },
          { key: 'vehicle', label: 'المركبة', options: vehicles().map((v) => [v.id, v.plate]).concat([['none', 'بدون مركبة']]), test: (d, v) => (v === 'none' ? !d.vehicleId : d.vehicleId === v) }
        ],
        initial: tState, onChange: (s) => { tState = s; }, pageSize: 10,
        onRowClick: (d) => SA.nav('scm/deliveries/' + d.id), rowActions: dnRowActions,
        empty: { icon: 'truck', title: 'لا توجد أذون تسليم', text: 'أنشئ إذن تسليم من قائمة «جاهز للتسليم».' }
      });
      return h('div', {},
        SA.pageHead({ title: 'أذون التسليم', desc: 'من البضاعة المحجوزة إلى إذن التسليم والخروج وتأكيد الاستلام — كل خطوة تحدّث المخزون وأمر البيع والفوترة.', actions: [SA.btn({ label: 'تخطيط الرحلات', icon: 'route', kind: 'ghost', onClick: () => SA.nav('scm/dispatch') }), SA.btn({ label: 'الشحنات والتصدير', icon: 'ship', kind: 'ghost', onClick: () => SA.nav('scm/shipments') })] }),
        U.kpis([
          U.kpi({ label: 'جاهز للتسليم', value: fmt.num(q.length), sub: 'أوامر بيع ببضاعة محجوزة بدون إذن', icon: 'box', tone: q.length ? 'warning' : null }),
          U.kpi({ label: 'أذون مخططة', value: fmt.num(dns.filter((d) => OPEN.indexOf(d.status) >= 0).length), sub: late ? late + ' إذن متأخر عن موعده' : 'لا يوجد متأخر', icon: 'clipboard', tone: late ? 'danger' : null, href: '#/scm/dispatch' }),
          U.kpi({ label: 'في الطريق الآن', value: fmt.num(dns.filter((d) => MOVING.indexOf(d.status) >= 0).length), sub: 'خرجت من المصنع', icon: 'truck' }),
          U.kpi({ label: 'الالتزام بالموعد (30 يوم)', value: onTime == null ? '—' : fmt.pct(onTime), sub: d30.length + ' تسليم مؤكد', icon: 'checkcircle', tone: onTime != null && onTime < 0.85 ? 'warning' : 'success' }),
          U.kpi({ label: 'حمولة الغد', value: kg(tomKg), sub: 'مخطط للتسليم غدًا', icon: 'gauge', href: '#/scm/dispatch?p=tomorrow' })
        ]),
        SA.card({ title: 'جاهز للتسليم', tags: h('span.sap-count', {}, q.length), actions: [h('span.lgx-muted', {}, 'بضاعة محجوزة في مخزن المنتج التام ولم يصدر لها إذن')] },
          q.length ? h('div.lgx-queue', {}, q.map(queueCard)) : SA.empty({ icon: 'checkcircle', title: 'لا توجد بضاعة جاهزة بدون إذن تسليم', text: 'عند اكتمال الإنتاج وحجز البضاعة لأمر بيع سيظهر هنا تلقائيًا.' })),
        h('div', { style: { height: '16px' } }),
        SA.card({ title: 'كل أذون التسليم', flush: true }, table.el));
    };
    return SA.live(root, build, ['deliveries', 'salesOrders', 'vehicles', 'shipments']);
  }

  function renderDn(root, ctx, id) {
    ctx.setCrumbs([{ label: 'التسليم والشحن' }, { label: 'أذون التسليم', href: '#/scm/deliveries' }, { label: id }]);
    const build = () => {
      const dn = ERP.find('deliveries', id);
      if (!dn) return h('div', {}, SA.pageHead({ title: 'إذن التسليم غير موجود', back: { label: 'أذون التسليم', href: '#/scm/deliveries' } }), SA.empty({ icon: 'search', title: 'لم نجد ' + id, text: 'ربما الرقم غير صحيح أو تم حذف البيانات التجريبية.', action: { label: 'كل الأذون', icon: 'list', onClick: () => SA.nav('scm/deliveries') } }));
      const so = ERP.find('salesOrders', dn.soId); const c = ERP.customer(dn.customerId) || {}; const ct = (c.contacts || [])[0] || {}; const v = vehicle(dn.vehicleId); const tot = dnKg(dn);
      const isOpen = OPEN.indexOf(dn.status) >= 0, isMoving = MOVING.indexOf(dn.status) >= 0; const late = isOpen && dn.plannedDate < today();
      const actions = [SA.btn({ label: 'طباعة الإذن', icon: 'doc', kind: 'ghost', onClick: () => printDn(dn) })];
      if (isOpen) actions.push(SA.btn({ label: 'إسناد مركبة/موعد', icon: 'swap', kind: 'ghost', perm: 'scm.dispatch.edit', onClick: () => assignModal(dn) }));
      if (dn.status === 'planned') actions.push(SA.btn({ label: 'بدء التحميل', icon: 'box', kind: 'ghost', perm: 'scm.deliveries.dispatch', onClick: () => startLoading(dn) }));
      if (isOpen) actions.push(SA.btn({ label: 'خروج من المصنع', icon: 'truck', perm: 'scm.deliveries.dispatch', onClick: () => dispatchModal(dn) }));
      if (isMoving) actions.push(SA.btn({ label: 'تأكيد التسليم (POD)', icon: 'checkcircle', perm: 'scm.deliveries.dispatch', onClick: () => podModal(dn) }));
      const toInvoice = so && dn.status === 'delivered' && so.lines.some((l) => (l.deliveredQty || 0) > (l.invoicedQty || 0));
      const invHint = dn.status !== 'delivered' || !so ? null : toInvoice
        ? SA.alert('success', h('b', {}, 'جاهز للفوترة. '), 'تم تأكيد الاستلام وتحديث الكميات المسلّمة في ' + so.id + '. ', canRoute('fin/invoices') ? h('a.sap-linkbtn', { href: '#/fin/invoices?so=' + encodeURIComponent(so.id) }, 'افتح الفوترة لهذا الطلب') : 'تم إشعار الحسابات لإصدار الفاتورة.')
        : (so.invoiceIds || []).length ? SA.alert('info', 'تمت فوترة الكميات المسلّمة: ', (so.invoiceIds || []).map((x, i) => [i ? '، ' : '', L(x)])) : null;
      const trackCard = isMoving ? SA.card({ title: 'التتبع التقريبي', tags: U.demo('محاكاة GPS') }, routeSvg({ from: 'جمصة — المصنع', to: dnCity(dn), progress: dnProgress(dn) }), h('div.lgx-row.lgx-sp', { style: { marginTop: '10px' } }, ERP.chart.meter(dnProgress(dn), { label: 'تقدّم الرحلة', tone: 'primary' }), h('span.lgx-muted', {}, 'الوصول المتوقع: ', h('b', {}, SA.fmt.time(etaOf(dn))), ' · ', kmTo(dnCity(dn)) + ' كم'))) : null;
      const steps = [
        { at: dn.createdAt, t: 'إنشاء الإذن', s: SA.userName(dn.createdBy) },
        dn.loadingAt ? { at: dn.loadingAt, t: 'بدء التحميل', s: vehLabel(dn.vehicleId) } : null,
        { at: dn.dispatchedAt, t: 'الخروج من المصنع', s: dn.dispatchedAt ? vehLabel(dn.vehicleId) + ' · ' + (dn.driver || (v || {}).driver || '') : 'مخطط ' + fmt.date(dn.plannedDate) },
        { at: dn.deliveredAt, t: 'التسليم للعميل', s: dn.deliveredAt ? 'استلم: ' + ((dn.pod || {}).receivedBy || '—') : isMoving ? 'متوقع ' + SA.fmt.time(etaOf(dn)) : '' }
      ].filter(Boolean);
      return h('div', {},
        SA.pageHead({ title: 'إذن تسليم ' + dn.id, back: { label: 'أذون التسليم', href: '#/scm/deliveries' }, tags: [U.status('dn', dn.status), late ? SA.chip('متأخر عن موعده', 'danger') : null, dn.onTime != null && dn.status === 'delivered' ? SA.chip(dn.onTime ? 'في الموعد' : 'تأخر', dn.onTime ? 'success' : 'danger') : null, dn.shipmentId ? h('span.lgx-tagx', {}, SA.icon('ship', 'icon-sm'), dn.shipmentId) : null], desc: (c.name || dn.customerId) + ' · ' + dnCity(dn) + ' · ' + kg(tot), actions }),
        invHint,
        U.grid(2,
          SA.card({ title: 'العميل وعنوان التسليم' }, SA.kv([['العميل', custLink(dn.customerId)], ['عنوان التسليم', dnCity(dn)], ['جهة الاتصال', (ct.name || '—') + (ct.phone ? ' · ' + ct.phone : '')], ['أمر البيع', so ? h('span', {}, L(so.id), ' ', U.status('so', so.status)) : L(dn.soId)], ['الموعد المخطط', fmt.date(dn.plannedDate) + ' (' + dayLabel(dn.plannedDate) + ')'], dn.shipmentId ? ['الشحنة', L(dn.shipmentId)] : null])),
          SA.card({ title: 'المركبة والسائق', actions: isOpen ? [SA.btn({ label: v ? 'تغيير' : 'إسناد', icon: 'swap', kind: 'ghost', size: 'sm', perm: 'scm.dispatch.edit', onClick: () => assignModal(dn) })] : null },
            v ? h('div', {}, SA.kv([['المركبة', h('span', {}, h('span.lgx-plate', {}, v.plate), ' ', v.type)], ['السائق', (dn.driver || v.driver || '—') + (v.phone ? ' · ' + v.phone : '')], ['الحالة الآن', U.status('vehicle', vehStatus(v))]]), isOpen ? h('div', { style: { marginTop: '12px' } }, loadMeter(dayLoad(v.id, dn.plannedDate), v.capacityKg, 'حمولة المركبة يوم ' + fmt.date(dn.plannedDate))) : null)
              : SA.empty({ icon: 'truck', title: 'لم تُسند مركبة بعد', text: 'أسند الإذن لمركبة من هنا أو من لوحة تخطيط الرحلات.' }))),
        SA.card({ title: 'البنود', tags: U.demo('أوزان تقديرية') },
          h('div.table-wrap', {}, h('table.lgx-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'الكمية', 'كجم/وحدة', 'الوزن'].map((t) => h('th', {}, t)))),
            h('tbody', {}, dn.lines.map((l) => h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, fmt.qty(l.qty, uomOf(l.itemId))), h('td.num', {}, fmt.num(wOf(l.itemId), 1)), h('td.num', {}, kg(l.qty * wOf(l.itemId)))))),
            h('tfoot', {}, h('tr', {}, h('td', {}, 'الإجمالي'), h('td.num', {}, fmt.num(dn.lines.reduce((s, l) => s + l.qty, 0))), h('td'), h('td.num', {}, kg(tot))))))),
        U.grid(2,
          SA.card({ title: 'مراحل الإذن' }, h('ol.lgx-tl', {}, steps.map((x) => h('li' + (x.at ? '' : '.is-future'), {}, h('i'), h('div', {}, h('b', {}, x.t), h('small', {}, x.at ? SA.fmt.dt(x.at) : 'لم يتم بعد'), x.s ? h('small', {}, x.s) : null))))),
          dn.pod ? SA.card({ title: 'إيصال الاستلام (POD)' }, SA.kv([['المستلم', dn.pod.receivedBy || '—'], ['وقت الاستلام', SA.fmt.dt(dn.pod.at)], ['الحالة', dn.pod.complete === false ? SA.chip('استلام بملاحظات', 'warning') : SA.chip('استلام كامل', 'success')], ['ملاحظات', dn.pod.note || '—'], ['صورة', dn.pod.photo || '—']]), dn.pod.signature ? h('div', { style: { marginTop: '10px' } }, h('small.lgx-muted', {}, 'توقيع المستلم'), h('img.lgx-pod-sig', { src: dn.pod.signature, alt: 'توقيع المستلم' })) : null)
            : trackCard || SA.card({ title: 'التتبع' }, SA.empty({ icon: 'route', title: 'لم يخرج من المصنع بعد', text: 'يبدأ التتبع التقريبي عند الخروج.' }))),
        dn.pod && trackCard ? trackCard : null,
        so ? SA.card({ title: 'دورة المستند — ' + so.id }, U.chain(so.id)) : null);
    };
    return SA.live(root, build, ['deliveries', 'vehicles', 'salesOrders', 'invoices', 'shipments']);
  }

  /* ───────────── 2. scm-dispatch ───────────── */
  function dispatchTrip(v, list) {
    const short = []; list.forEach((d) => d.lines.forEach((l) => { const need = list.filter((x) => x !== d).reduce((s, x) => s + x.lines.filter((y) => y.itemId === l.itemId).reduce((a, y) => a + y.qty, 0), 0) + l.qty; if (K.qty(l.itemId, K.FG) < need && short.indexOf(l.itemId) < 0) short.push(l.itemId); }));
    const trip = tripOf(list, v);
    SA.confirm({ title: 'خروج رحلة ' + v.plate, text: list.length + ' إذن · ' + trip.stops + ' توقف · ' + kg(trip.kg), impact: ['صرف البضاعة من مخزن المنتج التام لكل الأذون', 'قيود تكلفة البضاعة المباعة آليًا', 'تحويل حالة المركبة إلى «في رحلة»'], warnings: short.length ? ['رصيد غير كافٍ لـ: ' + short.map(ERP.itemName).join('، ') + ' — لن يتم الخروج'] : trip.kg > v.capacityKg ? ['الحمولة تتجاوز سعة المركبة'] : [], confirmLabel: 'تأكيد خروج الرحلة' }).then(async (r) => {
      if (!r.ok || short.length) return;
      try { await SA.api(() => { list.forEach((d) => F.dispatch(d.id, { vehicleId: v.id, driver: v.driver })); }); } catch (e) { return SA.fail(e); }
      SA.toast('خرجت رحلة ' + v.plate + ' — ' + list.length + ' إذن', 'success');
    });
  }
  function renderDispatch(root, ctx) {
    ctx.setCrumbs([{ label: 'التسليم والشحن' }, { label: 'تخطيط التحميل والرحلات' }]);
    const hasToday = get('deliveries').some((d) => OPEN.indexOf(d.status) >= 0 && d.plannedDate <= today());
    let period = ['today', 'tomorrow', 'week'].indexOf(ctx.params.p) >= 0 ? ctx.params.p : hasToday ? 'today' : 'tomorrow';
    const canEdit = SA.can('scm.dispatch.edit');
    const build = () => {
      const td = today(); const range = period === 'today' ? [td, td] : period === 'tomorrow' ? [ERP.day(1), ERP.day(1)] : [td, ERP.day(6)];
      const effDate = (d) => (d.plannedDate < td ? td : d.plannedDate);
      const dns = get('deliveries').filter((d) => OPEN.indexOf(d.status) >= 0 && ((d.plannedDate >= range[0] && d.plannedDate <= range[1]) || (period !== 'tomorrow' && d.plannedDate < td)));
      const moving = period === 'tomorrow' ? [] : get('deliveries').filter((d) => MOVING.indexOf(d.status) >= 0);
      let over = 0, totalKm = 0;
      const onDrop = (vid) => (e) => { e.preventDefault(); e.currentTarget.classList.remove('is-over'); const id = e.dataTransfer && e.dataTransfer.getData('text/plain'); if (id) assignDn(id, vid); };
      const dz = (vid) => canEdit ? { ondragover: (e) => { e.preventDefault(); e.currentTarget.classList.add('is-over'); }, ondragleave: (e) => e.currentTarget.classList.remove('is-over'), ondrop: onDrop(vid) } : {};
      const card = (d) => h('div.lgx-card', { draggable: canEdit ? 'true' : 'false', 'aria-label': d.id + ' — ' + ERP.customerName(d.customerId), ondragstart: (e) => { e.dataTransfer.setData('text/plain', d.id); e.dataTransfer.effectAllowed = 'move'; } },
        h('div.lgx-card-top', {}, h('a.erp-doc.num', { href: '#/scm/deliveries/' + d.id }, d.id), U.status('dn', d.status)),
        h('b', {}, ERP.customerName(d.customerId)),
        h('span.lgx-muted', {}, SA.icon('pin', 'icon-sm'), ' ', dnCity(d), ' · ', h('span.num', {}, kg(dnKg(d))), ' · ', kmTo(dnCity(d)) + ' كم'),
        d.plannedDate < td ? h('small.lgx-late', {}, 'متأخر — كان مخططًا ' + fmt.date(d.plannedDate)) : null,
        h('div.lgx-card-acts', {}, SA.btn({ label: 'إسناد', icon: 'swap', kind: 'ghost', size: 'sm', perm: 'scm.dispatch.edit', onClick: (e, b) => SA.menu(b, vehicles().map((x) => ({ label: x.plate + ' — ' + x.type, icon: 'truck', disabled: vehStatus(x) === 'maintenance' ? 'في الصيانة' : false, onClick: () => assignDn(d.id, x.id) })).concat(d.vehicleId ? [{ divider: true }, { label: 'إلغاء الإسناد', icon: 'x', onClick: () => assignDn(d.id, null) }] : [])) })));
      const movingCard = (d) => h('div.lgx-card.is-moving', { draggable: 'false' }, h('div.lgx-card-top', {}, h('a.erp-doc.num', { href: '#/scm/deliveries/' + d.id }, d.id), U.status('dn', d.status)), h('b', {}, ERP.customerName(d.customerId)), ERP.chart.meter(dnProgress(d), { label: 'في الطريق إلى ' + dnCity(d), tone: 'primary' }));
      const body = (list) => {
        if (!list.length) return [h('div.lgx-drop', {}, canEdit ? 'اسحب إذنًا هنا' : 'لا توجد أذون')];
        if (period !== 'week') return list.map(card);
        const days = Array.from(new Set(list.map(effDate))).sort();
        return days.map((dd) => [h('div.lgx-day', {}, dayLabel(dd) + ' · ' + fmt.date(dd)), list.filter((d) => effDate(d) === dd).map(card)]);
      };
      const unassigned = dns.filter((d) => !d.vehicleId || !vehicle(d.vehicleId));
      const cols = [h('section.lgx-col.is-un', Object.assign({ 'aria-label': 'أذون غير مُسندة' }, dz(null)),
        h('div.lgx-col-head', {}, h('div.lgx-col-title', {}, h('b', {}, 'غير مُسند'), h('span.sap-count', {}, unassigned.length)), h('span.lgx-muted', {}, canEdit ? 'اسحب الإذن إلى عمود مركبة، أو استخدم «إسناد».' : 'عرض فقط — الإسناد يحتاج صلاحية scm.dispatch.edit'), h('span.lgx-muted', {}, kg(unassigned.reduce((s, d) => s + dnKg(d), 0)))),
        body(unassigned))];
      vehicles().forEach((v) => {
        const list = dns.filter((d) => d.vehicleId === v.id); const vs = vehStatus(v); const trip = tripOf(list, v); totalKm += trip.km;
        const days = Array.from(new Set(list.map(effDate))); const loads = days.map((dd) => list.filter((d) => effDate(d) === dd).reduce((s, d) => s + dnKg(d), 0)); const maxLoad = loads.length ? Math.max.apply(null, loads) : 0;
        if (maxLoad > v.capacityKg) over++;
        const todays = list.filter((d) => effDate(d) === td);
        cols.push(h('section.lgx-col' + (vs === 'maintenance' ? '.is-maint' : ''), Object.assign({ 'aria-label': 'مركبة ' + v.plate }, vs === 'maintenance' ? {} : dz(v.id)),
          h('div.lgx-col-head', {},
            h('div.lgx-col-title', {}, h('span.lgx-plate', { title: v.plate }, v.plate), U.status('vehicle', vs)),
            h('span.lgx-muted', {}, v.type + ' · ' + (v.driver || '—')),
            loadMeter(maxLoad, v.capacityKg, period === 'week' ? 'أقصى حمولة يومية' : 'الحمولة'),
            h('div.lgx-trip', {}, h('div', {}, h('b', {}, String(trip.stops)), 'توقف'), h('div', {}, h('b', {}, fmt.num(trip.km)), 'كم تقريبًا'), h('div', {}, h('b', {}, trip.hours ? trip.hours.toFixed(1) : '0'), 'ساعة')),
            todays.length && period !== 'tomorrow' && vs !== 'maintenance' ? SA.btn({ label: 'خروج رحلة اليوم (' + todays.length + ')', icon: 'truck', size: 'sm', perm: 'scm.deliveries.dispatch', onClick: () => dispatchTrip(v, todays) }) : null),
          body(list), moving.filter((d) => d.vehicleId === v.id).map(movingCard)));
      });
      const totKg = dns.reduce((s, d) => s + dnKg(d), 0);
      return h('div', {},
        SA.pageHead({ title: 'تخطيط التحميل والرحلات', desc: 'وزّع أذون التسليم على المركبات حسب الحمولة والمسار. الحمولة تُحسب من أوزان الأصناف مقابل سعة كل مركبة.', actions: [SA.segmented([['today', 'اليوم'], ['tomorrow', 'غدًا'], ['week', 'هذا الأسبوع']], period, (p) => { period = p; history.replaceState(null, '', '#/scm/dispatch?p=' + p); view.refresh(); })] }),
        U.kpis([
          U.kpi({ label: 'أذون في الفترة', value: fmt.num(dns.length), sub: unassigned.length ? unassigned.length + ' غير مُسند' : 'كلها مُسندة', icon: 'clipboard', tone: unassigned.length ? 'warning' : 'success' }),
          U.kpi({ label: 'إجمالي الحمولة', value: kg(totKg), sub: vehicles().length + ' مركبات', icon: 'gauge' }),
          U.kpi({ label: 'مركبات فوق السعة', value: fmt.num(over), sub: over ? 'أعد التوزيع قبل التحميل' : 'كل الحمولات ضمن السعة', icon: 'alert', tone: over ? 'danger' : 'success' }),
          U.kpi({ label: 'مسافة تقديرية', value: fmt.num(totalKm) + ' كم', sub: 'ذهاب وعودة من جمصة', icon: 'route' }),
          U.kpi({ label: 'في الطريق الآن', value: fmt.num(get('deliveries').filter((d) => MOVING.indexOf(d.status) >= 0).length), sub: 'رحلات خرجت', icon: 'truck' })
        ]),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'المسافات والزمن وتكلفة الرحلات تقديرية للعرض ', U.demo(), ' · الأذون المتأخرة تظهر ضمن «اليوم».')),
        h('div.lgx-board', { role: 'list', 'aria-label': 'لوحة الرحلات' }, cols));
    };
    const view = liveView(root, build, ['deliveries', 'vehicles', 'shipments']);
    return view.cleanup;
  }

  /* ───────────── 3. scm-shipments ───────────── */
  function baseTimeline(sh) {
    const idx = SHIP_FLOW.indexOf(sh.status); const now = Date.now(); const c0 = new Date(sh.createdAt || nowIso()).getTime();
    const at = (k) => { const etd = sh.etd ? new Date(sh.etd + 'T10:00:00').getTime() : c0, eta = sh.eta ? new Date(sh.eta + 'T10:00:00').getTime() : etd; const m = { planning: c0, booked: c0 + 86400000 * 0.6, loading: etd - 86400000, in_transit: etd, arrived: eta, cleared: eta + 86400000, delivered: eta + 2 * 86400000 }; return m[k]; };
    const out = []; for (let i = 0; i <= idx; i++) { let t = at(SHIP_FLOW[i]); if (t > now) t = Math.min(now - (idx - i) * 3600000, c0 + (i + 1) * 3600000); out.push({ at: new Date(t).toISOString(), status: SHIP_FLOW[i], by: sh.createdBy || 'U-30', note: i === 0 ? 'إنشاء الشحنة' : '' }); }
    return out;
  }
  const timelineOf = (sh) => (sh.timeline && sh.timeline.length ? sh.timeline : baseTimeline(sh));

  function riskBanner(sh, r) {
    if (sh.kind === 'local') return null;
    if (r.shipped) return h('div.lgx-risk.is-ok', { role: 'status' }, h('span.lgx-risk-ico', {}, SA.icon('ship')), h('div.lgx-risk-body', {}, h('h3', {}, 'الشحنة خرجت — ' + (CS.ship[sh.status] || [sh.status])[0]), h('span.lgx-muted', {}, 'الوصول المتوقع ' + fmt.date(sh.eta))));
    const etd = r.etdDays;
    if (r.level === 'ok') return h('div.lgx-risk.is-ok', { role: 'status' }, h('span.lgx-risk-ico', {}, SA.icon('checkcircle')), h('div.lgx-risk-body', {}, h('h3', {}, 'لا توجد مخاطر إنتاج على موعد الإبحار'), h('div.lgx-risk-est', {}, h('span', {}, 'جاهزية البضاعة', h('b', {}, fmt.pct(r.readiness))), h('span', {}, 'حتى الإبحار', h('b', {}, etd == null ? '—' : etd + ' يوم')), h('span', {}, 'مستندات ناقصة', h('b', {}, String(r.docsMissing))))));
    const title = r.blocks.length ? (r.level === 'danger' ? 'الشحنة معرّضة للتأخير' + (r.delayDays > 0 ? ' — متوقع ' + r.delayDays + ' يوم بعد موعد الإبحار' : ' — بدون هامش أمان قبل الإبحار') : 'تنبيه: الإنتاج متوقف جزئيًا لهذه الشحنة') : r.docsMissing ? 'تنبيه: مستندات التصدير غير مكتملة قبل الإبحار' : 'تنبيه جاهزية';
    const chain = [];
    r.blocks.forEach((b) => {
      chain.push(h('li', {}, SA.icon('alert', 'icon-sm'), 'أمر التشغيل ', L(b.wo.id), ' — ', ERP.itemName(b.wo.itemId), ' ', U.status('wo', b.wo.status), h('span.lgx-muted', {}, ' تم ' + fmt.num(b.wo.qtyDone || 0) + ' من ' + fmt.num(b.wo.qty) + ' (متبقي ' + fmt.num(b.rem) + ')')));
      if (b.down && b.ln) chain.push(h('li', {}, SA.icon('alert', 'icon-sm'), 'خط الإنتاج ', L(b.ln.id, b.ln.id + ' ' + b.ln.name), ' ', U.status('line', b.ln.status), b.ln.downSince ? h('span.lgx-muted', {}, ' منذ ' + SA.fmt.rel(b.ln.downSince).replace('منذ ', '')) : null, b.ln.downReason ? h('span.lgx-muted', {}, ' — ' + b.ln.downReason) : null));
      if (b.mwo) chain.push(h('li', {}, SA.icon('wrench', 'icon-sm'), 'أمر الصيانة ', L(b.mwo.id), ' ', U.status('mwo', b.mwo.status), b.mwo.machineId ? h('span.lgx-muted', {}, ' — الماكينة ', L(b.mwo.machineId)) : null));
      b.missing.forEach((p) => chain.push(h('li', {}, SA.icon('box', 'icon-sm'), 'قطعة الغيار ', h('b', {}, ERP.itemName(p.itemId)), h('span.lgx-muted', {}, ' — الرصيد ' + fmt.num(p.onHand) + ' والمطلوب ' + fmt.num(p.need) + ' · مدة التوريد ' + p.lead + ' أيام' + (p.onOrder ? ' · على أمر شراء ' + fmt.num(p.onOrder) : ' · لا يوجد أمر شراء بعد')))));
      if (b.prq) chain.push(h('li', {}, SA.icon('clipboard', 'icon-sm'), 'طلب الشراء ', L(b.prq.id), ' ', U.status('prq', b.prq.status)));
      if (b.ap) { const step = (b.ap.chain || []).find((s) => s.status === 'pending') || {}; chain.push(h('li', {}, SA.icon('clock', 'icon-sm'), 'اعتماد الشراء العاجل ', L(b.ap.id), h('span.lgx-muted', {}, ' بانتظار ' + (step.label || '') + ' منذ ' + SA.fmt.rel(b.ap.createdAt).replace('منذ ', '')))); }
    });
    r.running.forEach((x) => chain.push(h('li.is-ok', {}, SA.icon('checkcircle', 'icon-sm'), 'أمر التشغيل ', L(x.wo.id), ' — ', ERP.itemName(x.wo.itemId), ' ', U.status('wo', x.wo.status), h('span.lgx-muted', {}, ' تم ' + fmt.num(x.wo.qtyDone || 0) + ' من ' + fmt.num(x.wo.qty) + ' · ~' + x.prodDays + ' يوم'))));
    const b0 = r.blocks[0];
    const est = h('div.lgx-risk-est', {},
      h('span', {}, 'حتى الإبحار (ETD)', h('b', {}, etd == null ? '—' : etd + ' يوم')),
      b0 ? h('span', {}, 'تقدير التعافي', h('b', {}, b0.recover + ' يوم'), h('small.lgx-muted', {}, b0.down ? ' (قطع غيار ' + b0.partsDays + ' + إصلاح 1 + إنتاج ' + b0.prodDays + ')' : ' (إنتاج ' + b0.prodDays + ')')) : null,
      h('span', {}, 'جاهزية البضاعة (بالوزن)', h('b', {}, fmt.pct(r.readiness))),
      h('span', {}, 'مستندات ناقصة', h('b', {}, String(r.docsMissing))), U.demo('تقدير'));
    const acts = h('div.lgx-row', {},
      b0 && b0.ap && canRoute('approvals/' + b0.ap.id) ? SA.btn({ label: 'فتح الاعتماد العاجل', icon: 'inbox', kind: 'ghost', size: 'sm', onClick: () => SA.nav('approvals/' + b0.ap.id) }) : null,
      b0 && b0.mwo && canRoute(ERP.route(b0.mwo.id)) ? SA.btn({ label: 'أمر الصيانة', icon: 'wrench', kind: 'ghost', size: 'sm', onClick: () => SA.nav(ERP.route(b0.mwo.id)) }) : null,
      b0 && canRoute(ERP.route(b0.wo.id)) ? SA.btn({ label: 'أمر التشغيل', icon: 'factory', kind: 'ghost', size: 'sm', onClick: () => SA.nav(ERP.route(b0.wo.id)) }) : null);
    const sug = b0 ? h('ul.lgx-risk-sug', {},
      b0.ap ? h('li', {}, 'اعتماد الشراء العاجل ' + b0.ap.id + ' اليوم وطلب توريد خلال 48 ساعة من مورد محلي يقلّص التعافي إلى ~' + (Math.min(2, b0.partsDays) + 1 + b0.prodDays) + ' أيام.') : null,
      r.running.length || r.readiness > 0 ? h('li', {}, 'جهّز البنود الجاهزة (' + fmt.pct(r.readiness) + ' بالوزن) واحجز موعد تحميل الحاوية بعد آخر دفعة إنتاج مباشرة.') : null,
      r.level === 'danger' ? h('li', {}, 'أبلغ الوكيل ' + ERP.customerName(sh.customerId) + ' مبكرًا باحتمال إبحار بديل، أو اطلب من وكيل الشحن خيار السفينة التالية.') : null) : null;
    return h('div.lgx-risk.is-' + r.level, { role: 'alert' }, h('span.lgx-risk-ico', {}, SA.icon(r.level === 'danger' ? 'alert' : 'clock')),
      h('div.lgx-risk-body', {}, h('h3', {}, title), chain.length ? h('ul.lgx-risk-chain', {}, chain) : null, est, ERP.chart.meter(r.readiness, { label: 'جاهزية البضاعة للحاوية', tone: r.readiness >= 1 ? 'success' : r.level === 'danger' ? 'danger' : 'warning' }), sug ? h('div', {}, h('b', { style: { fontSize: '12.5px' } }, 'المقترح'), ' ', U.demo('توصية'), sug) : null, acts));
  }

  async function advanceShipment(sh, next) {
    const r = shipmentRisk(sh); const sos = shipSos(sh); const warnings = []; let reasonRequired = false; let extra = null, exitChk = null;
    const ready = sos.map((so) => ({ so, lines: remainingOf(so).filter((x) => x.qty > 0) })).filter((x) => x.lines.length);
    const readyKg = ready.reduce((s, x) => s + kgOfLines(x.lines), 0);
    if ((next === 'loading' || next === 'in_transit') && r.blocks.length) { warnings.push('الإنتاج غير مكتمل: ' + r.blocks.map((b) => b.wo.id + ' (' + ERP.itemName(b.wo.itemId) + ')').join('، ') + ' — جاهزية ' + fmt.pct(r.readiness)); reasonRequired = true; }
    if (next === 'in_transit') {
      const miss = (sh.docs || []).filter((d) => !d.ok).map((d) => d.name); if (miss.length) { warnings.push('مستندات ناقصة: ' + miss.join('، ')); reasonRequired = true; }
      if (ready.length) { exitChk = h('input', { type: 'checkbox', checked: true }); extra = h('label.check', { style: { marginTop: '8px' } }, exitChk, ' إصدار إذن تسليم للحاوية وخروج البضاعة المحجوزة من المخزن (' + kg(readyKg) + ')'); }
    }
    const res = await SA.confirm({ title: 'تحديث حالة الشحنة ' + sh.id, text: (CS.ship[sh.status] || [sh.status])[0] + ' ← ' + (CS.ship[next] || [next])[0], impact: next === 'in_transit' ? ['تسجيل تاريخ الإبحار الفعلي', 'خروج البضاعة من مخزن المنتج التام بإذن تسليم مرتبط بالشحنة', 'إشعار الحسابات بفوترة التصدير'] : next === 'delivered' ? ['تأكيد تسليم أذون الشحنة للعميل', 'تحديث أمر البيع (الكميات المسلّمة) — جاهز للفوترة'] : ['تحديث مرحلة الشحنة ونسبة التقدم'], warnings, reasonRequired, reasonLabel: 'سبب المتابعة رغم التنبيه', extra, confirmLabel: 'تأكيد' });
    if (!res.ok) return;
    const prev = sh.status; const base = timelineOf(sh); const dnIds = [];
    try {
      await SA.api(() => {
        if (next === 'in_transit' && exitChk && exitChk.checked) ready.forEach((x) => { const d = F.createDelivery(x.so.id, { lines: x.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })), plannedDate: today(), vehicleId: 'VH-04', driver: 'شاحنة الحاوية — ' + (sh.forwarder || 'وكيل الشحن'), shipmentId: sh.id }); if (d) { st.patch('deliveries', d.id, { address: sh.port || d.address }); F.dispatch(d.id, { vehicleId: 'VH-04' }); dnIds.push(d.id); } });
        if (next === 'delivered') Array.from(new Set((sh.dnIds || []).concat(get('deliveries').filter((d) => d.shipmentId === sh.id).map((d) => d.id)))).forEach((id) => { const d = ERP.find('deliveries', id); if (d && MOVING.indexOf(d.status) >= 0) F.deliver(id, { receivedBy: 'الوكيل — ' + ERP.customerName(sh.customerId), note: 'تسليم ' + (sh.destination || '') + ' (' + (sh.incoterm || '') + ')' }); });
        st.patch('shipments', sh.id, (s) => { s.timeline = base.concat([{ at: nowIso(), status: next, by: me(), note: res.reason || '' }]); s.status = next; s.progress = PROG[next]; if (dnIds.length) s.dnIds = (s.dnIds || []).concat(dnIds); if (next === 'in_transit') s.atd = nowIso(); });
        SA.audit('SHIP.UPDATED', { target: { type: 'shipment', id: sh.id, label: ERP.customerName(sh.customerId) }, before: { status: prev }, after: { status: next, dn: dnIds.length ? dnIds.join('، ') : undefined }, reason: res.reason || '' });
        if (next === 'in_transit') SA.notify({ title: 'شحنة التصدير ' + sh.id + ' أبحرت', body: ERP.customerName(sh.customerId) + ' — ' + (sh.destination || '') + '. جاهزة لفوترة التصدير.', level: 'action', to: ['R-07', 'R-03'], link: '#/scm/shipments/' + sh.id });
      });
    } catch (e) { return SA.fail(e); }
    SA.toast('الشحنة ' + sh.id + ': ' + (CS.ship[next] || [next])[0] + (dnIds.length ? ' — صدر ' + dnIds.join('، ') : ''), 'success');
  }

  /* export documents (generated from the SO lines) */
  function docSheet(sh, k) {
    const c = ERP.customer(sh.customerId) || {}; const ct = (c.contacts || [])[0] || {}; const co = st.get('settings.company') || {}; const lines = shLinesSafe(sh); const sos = shipSos(sh); const so = sos[0] || {};
    const pk = packOf(lines); const T = pk.reduce((a, l) => ({ q: a.q + l.qty, p: a.p + l.pallets, n: a.n + l.net, g: a.g + l.gross, v: a.v + l.cbm }), { q: 0, p: 0, n: 0, g: 0, v: 0 });
    const n1 = (x) => fmt.num(Math.round(x)); const base = { no: sh.id + '-' + k.toUpperCase(), date: today() };
    const party = [['المُصدِّر', co.nameAr], ['المستورد', c.name], ['ميناء الشحن', sh.port || '—'], ['ميناء الوصول', sh.destination || '—'], ['الحاوية', sh.container || '—'], ['شروط التسليم', (sh.incoterm || '—') + ' ' + (sh.destination || '').split('—')[0]]];
    if (k === 'ci') {
      const gross = lines.reduce((s, l) => s + l.qty * l.price, 0); const disc = Math.round(gross * ((so.discountPct || 0) / 100));
      return sheet(Object.assign(base, { title: 'فاتورة تجارية', titleEn: 'Commercial Invoice', meta: party.concat([['أوامر البيع', (sh.soIds || []).join('، ')], ['شروط الدفع', (c.termsDays || 0) + ' يوم'], ['العملة', 'جنيه مصري (EGP)']]),
        table: { cols: ['#', 'الكود', 'الوصف', 'HS', 'الكمية', 'سعر الوحدة', 'القيمة'], rows: lines.map((l, i) => { const it = ERP.item(l.itemId) || {}; return [String(i + 1), h('span.num', {}, it.code), it.name, h('span.num', {}, hsOf(l.itemId)), h('span.num', {}, fmt.num(l.qty) + ' ' + (ERP.uom[it.uom] || '')), h('span.num', {}, fmt.num(l.price)), h('span.num', {}, fmt.num(l.qty * l.price))]; }),
          footRows: [[['الإجمالي قبل الخصم', 6], h('span.num', {}, fmt.money(gross))], disc ? [['خصم ' + so.discountPct + '%', 6], h('span.num', {}, '− ' + fmt.money(disc))] : null, [['الإجمالي المستحق (EGP)', 6], h('span.num', {}, fmt.money(gross - disc))]].filter(Boolean) },
        notes: ['العملة في الإصدار الأول: الجنيه المصري (EGP) فقط — تعدد العملات (USD / OMR) وأسعار الصرف خارج نطاق v1.', 'المعاملة الضريبية لصادرات هذه الفاتورة يحددها قسم المالية — لا تتضمن ضريبة قيمة مضافة.', 'أكواد HS تجريبية للعرض وتُراجع مع المخلص الجمركي.', 'بلد المنشأ: جمهورية مصر العربية — مصنع جمصة.'],
        signs: ['إعداد: الشحن والتصدير', 'مراجعة: الحسابات', 'اعتماد وختم الشركة'] }));
    }
    if (k === 'pl') {
      const cap = contCap(sh.container);
      return sheet(Object.assign(base, { title: 'قائمة التعبئة', titleEn: 'Packing List', meta: party.concat([['عدد الباليتات', n1(T.p)], ['الوزن القائم', n1(T.g) + ' كجم'], ['الحجم', T.v.toFixed(1) + ' م³']]),
        table: { cols: ['#', 'الكود', 'الوصف', 'الكمية', 'باليتات', 'صافي (كجم)', 'قائم (كجم)', 'م³'], rows: pk.map((l, i) => { const it = ERP.item(l.itemId) || {}; return [String(i + 1), h('span.num', {}, it.code), it.name, h('span.num', {}, fmt.num(l.qty)), h('span.num', {}, String(l.pallets)), h('span.num', {}, n1(l.net)), h('span.num', {}, n1(l.gross)), h('span.num', {}, l.cbm.toFixed(2))]; }),
          foot: [['الإجمالي', 3], h('span.num', {}, fmt.num(T.q)), h('span.num', {}, String(T.p)), h('span.num', {}, n1(T.n)), h('span.num', {}, n1(T.g)), h('span.num', {}, T.v.toFixed(1))] },
        extra: h('div.lgx-sheet-box', {}, h('div', {}, h('small', {}, 'نسبة تحميل الحاوية بالوزن — ' + cap.label), h('b.num', {}, fmt.pct(T.g / cap.kg))), h('div', {}, h('small', {}, 'نسبة تحميل الحاوية بالحجم'), h('b.num', {}, fmt.pct(T.v / cap.m3)))),
        notes: ['العلامات: EG / ' + (c.name || '') + ' / ' + sh.id + ' / PALLET 1–' + T.p, 'الأوزان والأحجام وعدد الباليتات تقديرية من بيانات الأصناف (تجريبي) — تُثبت عند التحميل الفعلي.'], signs: ['أمين المخزن', 'مسؤول الشحن', 'مندوب وكيل الشحن'] }));
    }
    if (k === 'co') {
      return sheet(Object.assign(base, { title: 'شهادة منشأ — طلب', titleEn: 'Certificate of Origin (application)', draft: 'نموذج داخلي', meta: party.concat([['بلد المنشأ', 'جمهورية مصر العربية'], ['وسيلة النقل', 'بحري — حاوية'], ['الفاتورة التجارية', sh.id + '-CI']]),
        table: { cols: ['#', 'وصف البضاعة', 'HS', 'الكمية', 'الوزن القائم (كجم)'], rows: pk.map((l, i) => [String(i + 1), ERP.itemName(l.itemId), h('span.num', {}, hsOf(l.itemId)), h('span.num', {}, fmt.num(l.qty)), h('span.num', {}, n1(l.gross))]), foot: [['الإجمالي', 3], h('span.num', {}, fmt.num(T.q)), h('span.num', {}, n1(T.g))] },
        notes: ['نقر بأن البضائع الموضحة أعلاه من إنتاج مصنعنا بالمنطقة الصناعية — جمصة، الدقهلية.', 'تُصدَّق الشهادة من الغرفة التجارية المختصة — هذا نموذج طلب داخلي مُولَّد من النظام.'], signs: ['المُصدِّر', 'الغرفة التجارية', 'ختم الجهة المختصة'] }));
    }
    if (k === 'bl') {
      return sheet(Object.assign(base, { title: 'تعليمات الشحن — مسودة بوليصة', titleEn: 'Shipping Instructions / Draft B/L', draft: 'مسودة', meta: [['الشاحن (Shipper)', co.nameEn || co.nameAr], ['المرسل إليه (Consignee)', 'لأمر ' + (c.name || '')], ['جهة الإخطار (Notify)', (c.name || '') + (ct.phone ? ' · ' + ct.phone : '')], ['ميناء الشحن', sh.port], ['ميناء التفريغ', sh.destination], ['السفينة/الرحلة', 'يحددها وكيل الشحن'], ['الحاوية', sh.container], ['رقم الختم', 'يُحدد عند التحميل'], ['أجرة الشحن', /^C/.test(sh.incoterm || '') ? 'مدفوعة مقدمًا (Prepaid)' : 'تُدفع عند الوصول (Collect)']],
        table: { cols: ['العلامات', 'عدد الطرود', 'وصف البضاعة', 'الوزن القائم (كجم)', 'م³'], rows: [['EG / ' + sh.id, h('span.num', {}, T.p + ' باليتة'), 'أبواب وتجاليد WPC & PVC — ' + lines.length + ' صنف (تفاصيل بقائمة التعبئة)', h('span.num', {}, n1(T.g)), h('span.num', {}, T.v.toFixed(1))]] },
        notes: ['هذه مسودة تعليمات شحن تُرسل لوكيل الشحن — البوليصة الأصلية تصدر من الخط الملاحي بعد التحميل.', 'وكيل الشحن: ' + (sh.forwarder || '—')], signs: ['مسؤول الشحن', 'وكيل الشحن', 'الخط الملاحي'] }));
    }
    const rows = []; sos.forEach((s) => s.lines.forEach((l) => { const wo = (s.woIds || []).map((w) => ERP.find('workOrders', w)).find((w) => w && w.itemId === l.itemId); const q = wo && wo.qcId ? ERP.find('qcInspections', wo.qcId) : null; rows.push([ERP.itemName(l.itemId), h('span.num', {}, fmt.num(l.qty)), wo ? h('span.num', {}, wo.lot || wo.id) : 'من المخزون', q ? (CS.qc[q.result] || [q.result])[0] : wo ? 'بانتظار الفحص النهائي' : 'مطابق (دفعة سابقة)', q && q.inspectorId ? SA.userName(q.inspectorId) : '—']); }));
    const certs = get('certs').filter((x) => x.status !== 'expired').map((x) => x.name).join(' · ');
    return sheet(Object.assign(base, { title: 'شهادة مطابقة وفحص', titleEn: 'Certificate of Conformity / Inspection', meta: [['العميل', c.name], ['الشحنة', sh.id], ['أوامر البيع', (sh.soIds || []).join('، ')], ['المعايير', certs || 'ISO 9001:2015']],
      table: { cols: ['المنتج', 'الكمية', 'الدفعة/اللوط', 'نتيجة الفحص النهائي', 'المفتش'], rows },
      notes: ['البنود المذكورة فُحصت وفق خطة الفحص الداخلية للمصنع (المقاسات، الالتصاق، اللون ΔE، الكثافة).', 'البنود «بانتظار الفحص النهائي» لا تُحمَّل قبل صدور نتيجة مطابقة.'], signs: ['مسؤول الجودة', 'مدير المصنع', 'ختم الجودة'] }));
  }
  const shLinesSafe = (sh) => shipLines(sh).filter((l) => l.qty > 0);
  function openDoc(sh, i) {
    const d = (sh.docs || [])[i]; if (!d) return; const k = docKey(d); const node = docSheet(sh, k);
    openSheet(d.name + ' — ' + sh.id, node, (getM) => (d.ok ? [] : [SA.btn({ label: k === 'bl' ? 'تأكيد استلام البوليصة من الخط الملاحي' : 'اعتماد المستند وإرفاقه بالشحنة', icon: 'check', perm: 'scm.shipments.edit', onClick: async () => {
      try { await SA.api(() => { st.patch('shipments', sh.id, (s) => { s.docs = (s.docs || []).slice(); s.docs[i] = Object.assign({}, s.docs[i], { ok: true, generatedAt: nowIso(), by: me() }); }); SA.audit('SHIP.DOC_GENERATED', { target: { type: 'shipment', id: sh.id, label: d.name }, after: { doc: d.name, ok: true } }); }); } catch (e) { return SA.fail(e); }
      const m = getM(); if (m) m.close(); SA.toast('تم إرفاق «' + d.name + '» بالشحنة ' + sh.id, 'success');
    } })]));
  }

  function createShipmentModal() {
    const eligible = get('salesOrders').filter((so) => so.export && ['confirmed', 'in_production', 'ready', 'partially_delivered'].indexOf(so.status) >= 0 && !shipOfSo(so.id));
    if (!eligible.length) { SA.modal({ title: 'شحنة تصدير جديدة', icon: 'ship', size: 'sm', body: SA.empty({ icon: 'ship', title: 'لا توجد أوامر تصدير بدون شحنة', text: 'كل أوامر التصدير المؤكدة مرتبطة بشحنات بالفعل.' }) }); return; }
    const so0 = eligible[0]; const destOf = (so) => { const c = ERP.customer(so.customerId) || {}; return c.country === 'OM' ? 'ميناء صحار — سلطنة عُمان' : (c.city || ''); };
    const fSo = SA.form.field({ name: 'soId', label: 'أمر التصدير', type: 'select', required: true, options: eligible.map((so) => [so.id, so.id + ' — ' + ERP.customerName(so.customerId)]), onChange: (v) => { const so = ERP.find('salesOrders', v); fDest.set(destOf(so)); fEtd.set(so.promisedDate && so.promisedDate > today() ? so.promisedDate : ERP.day(10)); } });
    const fPol = SA.form.field({ name: 'port', label: 'ميناء الشحن', type: 'select', options: [['ميناء دمياط', 'ميناء دمياط (40 كم)'], ['ميناء الإسكندرية', 'ميناء الإسكندرية'], ['ميناء بورسعيد', 'ميناء بورسعيد'], ['ميناء العين السخنة', 'ميناء العين السخنة']] });
    const fDest = SA.form.field({ name: 'destination', label: 'ميناء الوصول', required: true, value: destOf(so0) });
    const fCont = SA.form.field({ name: 'container', label: 'الحاوية', type: 'select', value: '1 × 40HC', options: [['1 × 20', "1 × 20' DV"], ['1 × 40', "1 × 40' DV"], ['1 × 40HC', "1 × 40' HC"], ['2 × 40HC', "2 × 40' HC"]] });
    const fInc = SA.form.field({ name: 'incoterm', label: 'شروط التسليم', type: 'select', value: 'CIF', options: [['EXW', 'EXW'], ['FOB', 'FOB'], ['CFR', 'CFR'], ['CIF', 'CIF']] });
    const fFwd = SA.form.field({ name: 'forwarder', label: 'وكيل الشحن', value: 'وكيل شحن (تجريبي)' });
    const fEtd = SA.form.field({ name: 'etd', label: 'موعد الإبحار (ETD)', type: 'date', required: true, value: so0.promisedDate && so0.promisedDate > today() ? so0.promisedDate : ERP.day(10) });
    const fEta = SA.form.field({ name: 'eta', label: 'موعد الوصول (ETA)', type: 'date', required: true, value: addDays(fEtd.get(), 7) });
    fEtd.input.addEventListener('change', () => fEta.set(addDays(fEtd.get(), 7)));
    const m = SA.modal({ title: 'شحنة تصدير جديدة', icon: 'ship', size: 'md', body: h('div', {}, fSo.el, h('div.sap-formgrid', {}, fPol.el, fDest.el, fCont.el, fInc.el, fEtd.el, fEta.el), fFwd.el, h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تُنشأ قائمة مستندات التصدير تلقائيًا (فاتورة تجارية، قائمة تعبئة، شهادة منشأ، بوليصة، شهادة مطابقة). العملة EGP فقط في v1.'))),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, SA.icon('check', 'icon-sm'), 'إنشاء الشحنة')] });
    async function save() {
      const g = SA.form.group([fSo, fDest, fEtd, fEta]); if (!g.validate()) return;
      if (fEta.get() < fEtd.get()) { fEta.error('الوصول يجب أن يكون بعد الإبحار'); return; }
      const so = ERP.find('salesOrders', fSo.get()); if (!so) return; m.setBusy(true); let id = null;
      try {
        await SA.api(() => {
          id = ERP.no('SH', 3); const now = nowIso();
          st.insert('shipments', { id, kind: 'export', soIds: [so.id], customerId: so.customerId, destination: fDest.get().trim(), port: fPol.get(), container: fCont.get(), forwarder: fFwd.get().trim() || '—', etd: fEtd.get(), eta: fEta.get(), status: 'planning', incoterm: fInc.get(), docs: DOCS.map((d) => ({ name: d.name, ok: false })), createdAt: now, createdBy: me(), progress: PROG.planning, dnIds: [], timeline: [{ at: now, status: 'planning', by: me(), note: 'إنشاء الشحنة' }] }, true);
          SA.audit('SHIP.CREATED', { target: { type: 'shipment', id, label: ERP.customerName(so.customerId) }, after: { so: so.id, etd: fEtd.get(), container: fCont.get(), incoterm: fInc.get() } });
          SA.notify({ title: 'شحنة تصدير جديدة ' + id, body: so.id + ' — ' + ERP.customerName(so.customerId) + ' · إبحار ' + fmt.date(fEtd.get()), level: 'info', to: ['R-03', 'R-05'], link: '#/scm/shipments/' + id });
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast('تم إنشاء الشحنة ' + id, 'success'); SA.nav('scm/shipments/' + id);
    }
  }

  function gpsUpdate(sh) {
    const add = 12 + Math.round(Math.random() * 10); const np = Math.min(100, (sh.progress || 0) + add);
    const from = [31.45, 31.53], to = [31.04, 31.38]; const t = np / 100;
    return SA.api(() => {
      st.patch('shipments', sh.id, (s) => { s.progress = np; s.gps = { lat: +(from[0] + (to[0] - from[0]) * t).toFixed(4), lng: +(from[1] + (to[1] - from[1]) * t).toFixed(4), updatedAt: nowIso() }; if (np >= 100 && !s.arrivedAt) s.arrivedAt = nowIso(); });
      if (np >= 100) SA.audit('SHIP.UPDATED', { target: { type: 'shipment', id: sh.id, label: ERP.customerName(sh.customerId) }, before: { progress: sh.progress }, after: { progress: 100, note: 'وصلت المركبة لموقع العميل (GPS)' }, via: 'system' });
    }, { ms: 220 }).then(() => SA.toast(np >= 100 ? 'وصلت المركبة لموقع العميل — أكّد التسليم' : 'تم تحديث الموقع: ' + np + '%', np >= 100 ? 'success' : 'info'), (e) => SA.fail(e));
  }
  function localView(sh) {
    const dns = Array.from(new Set((sh.dnIds || []).concat(get('deliveries').filter((d) => d.shipmentId === sh.id).map((d) => d.id)))).map((id) => ERP.find('deliveries', id)).filter(Boolean);
    const v = vehicle(sh.vehicleId); const km = kmTo(sh.destination); const prog = Math.min(1, (sh.progress || 0) / 100); const remH = (km * (1 - prog)) / 55;
    const pending = dns.filter((d) => MOVING.indexOf(d.status) >= 0);
    const finishLocal = () => { if (get('deliveries').filter((d) => dns.some((x) => x.id === d.id)).every((d) => d.status === 'delivered')) SA.api(() => { st.patch('shipments', sh.id, (s) => { s.timeline = timelineOf(s).concat([{ at: nowIso(), status: 'delivered', by: me(), note: 'تأكيد الاستلام' }]); s.status = 'delivered'; s.progress = 100; }); SA.audit('SHIP.UPDATED', { target: { type: 'shipment', id: sh.id, label: ERP.customerName(sh.customerId) }, before: { status: sh.status }, after: { status: 'delivered' } }); }, { ms: 120 }).catch((e) => SA.fail(e)); };
    const actions = [];
    if (sh.status !== 'delivered') actions.push(SA.btn({ label: 'تحديث الموقع (محاكاة GPS)', icon: 'refresh', kind: 'ghost', perm: 'scm.shipments.edit', reason: prog >= 1 ? 'المركبة وصلت بالفعل' : '', onClick: () => gpsUpdate(sh) }));
    if (pending.length) actions.push(SA.btn({ label: 'تأكيد التسليم (POD)', icon: 'checkcircle', perm: 'scm.deliveries.dispatch', onClick: () => podModal(pending[0], finishLocal) }));
    return h('div', {},
      SA.pageHead({ title: 'رحلة محلية ' + sh.id, back: { label: 'الشحنات', href: '#/scm/shipments' }, tags: [U.status('shipkind', 'local'), U.status('ship', sh.status)], desc: ERP.customerName(sh.customerId) + ' · ' + (sh.destination || ''), actions }),
      U.grid(2,
        SA.card({ title: 'المسار والموقع', tags: U.demo('محاكاة GPS — بدون خرائط خارجية') }, routeSvg({ from: 'جمصة — المصنع', to: sh.destination, progress: prog, via: km > 60 ? ['المنصورة'] : [] }),
          h('div', { style: { marginTop: '12px' } }, ERP.chart.meter(prog, { label: prog >= 1 ? 'وصلت لموقع العميل' : 'تقدّم الرحلة', tone: prog >= 1 ? 'success' : 'primary' })),
          h('div.lgx-row.lgx-sp', { style: { marginTop: '8px' } }, h('span.lgx-muted', {}, 'آخر تحديث GPS: ', h('b', {}, sh.gps && sh.gps.updatedAt ? SA.fmt.rel(sh.gps.updatedAt) : '—'), sh.gps ? h('span.num', {}, ' · ' + sh.gps.lat + ', ' + sh.gps.lng) : null), h('span.lgx-muted', {}, prog >= 1 ? 'بانتظار تأكيد الاستلام' : ['الوصول المتوقع: ', h('b', {}, SA.fmt.time(new Date(Date.now() + remH * 3600000).toISOString())), ' (' + Math.round(km * (1 - prog)) + ' كم متبقية)']))),
        SA.card({ title: 'بيانات الرحلة' }, SA.kv([['العميل', custLink(sh.customerId)], ['الوجهة', sh.destination], ['المسافة', km + ' كم (تقديري)'], ['المركبة', v ? h('span', {}, h('span.lgx-plate', {}, v.plate), ' ', v.type) : '—'], ['السائق', v ? (v.driver || '—') + (v.phone ? ' · ' + v.phone : '') : '—'], ['الخروج', sh.etd ? fmt.date(sh.etd) : '—'], ['أوامر البيع', (sh.soIds || []).map((x, i) => [i ? '، ' : '', L(x)])], ['أذون التسليم', dns.length ? dns.map((d, i) => [i ? '، ' : '', L(d.id), ' ', U.status('dn', d.status)]) : '—']]))),
      (sh.soIds || []).map((sid) => (ERP.find('salesOrders', sid) ? SA.card({ title: 'دورة المستند — ' + sid }, U.chain(sid)) : null)));
  }
  function exportView(sh) {
    const r = shipmentRisk(sh); const sos = shipSos(sh); const idx = SHIP_FLOW.indexOf(sh.status); const next = SHIP_FLOW[idx + 1];
    const lines = shLinesSafe(sh); const pk = packOf(lines); const gk = pk.reduce((s, l) => s + l.gross, 0), vol = pk.reduce((s, l) => s + l.cbm, 0), pal = pk.reduce((s, l) => s + l.pallets, 0); const cap = contCap(sh.container);
    const tl = timelineOf(sh); const atOf = (k) => (tl.filter((x) => x.status === k).slice(-1)[0] || {}).at;
    const STEP = [['الحجز', ['planning', 'booked']], ['التحميل', ['loading']], ['في الطريق', ['in_transit']], ['وصلت الميناء', ['arrived']], ['التخليص', ['cleared']], ['التسليم', ['delivered']]];
    const cur = sh.status === 'planning' ? 0 : sh.status === 'booked' ? 1 : sh.status === 'delivered' ? 6 : STEP.findIndex((s) => s[1].indexOf(sh.status) >= 0);
    const dm = (iso) => { const d = new Date(iso); return d.getDate() + ' ' + ERP.months[d.getMonth()]; };
    const stepLabels = STEP.map((s, i) => { const at = atOf(s[1][s[1].length - 1]); return s[0] + (at && i < cur ? ' · ' + dm(at) : ''); });
    const etaDays = sh.eta ? ERP.daysBetween(today(), sh.eta) : null;
    const actions = []; if (next) actions.push(SA.btn({ label: 'المرحلة التالية: ' + (CS.ship[next] || [next])[0], icon: 'arrowleft', perm: 'scm.shipments.edit', onClick: () => advanceShipment(sh, next) }));
    actions.unshift(SA.btn({ label: 'قائمة التعبئة', icon: 'doc', kind: 'ghost', onClick: () => openDoc(sh, Math.max(0, (sh.docs || []).findIndex((d) => docKey(d) === 'pl'))) }));
    const future = SHIP_FLOW.slice(idx + 1).map((k) => ({ status: k, at: k === 'in_transit' ? sh.etd : k === 'arrived' ? sh.eta : null }));
    return h('div', {},
      SA.pageHead({ title: 'شحنة تصدير ' + sh.id, back: { label: 'الشحنات', href: '#/scm/shipments' }, tags: [U.status('shipkind', 'export'), U.status('ship', sh.status), sh.incoterm ? SA.chip(sh.incoterm, 'neutral') : null], desc: ERP.customerName(sh.customerId) + ' · ' + (sh.port || '') + ' ← ' + (sh.destination || '') + ' · ' + (sh.container || ''), actions }),
      riskBanner(sh, r),
      SA.card({}, SA.stepper(stepLabels, cur)),
      U.grid(2,
        SA.card({ title: 'بيانات الشحنة' }, SA.kv([['العميل', custLink(sh.customerId)], ['أوامر البيع', sos.length ? sos.map((so, i) => [i ? '، ' : '', L(so.id), ' ', U.status('so', so.status)]) : '—'], ['ميناء الشحن', sh.port || '—'], ['ميناء الوصول', sh.destination || '—'], ['الحاوية', sh.container || '—'], ['وكيل الشحن', sh.forwarder || '—'], ['الإبحار (ETD)', sh.etd ? h('span', {}, fmt.date(sh.etd), ' ', h('small.lgx-muted', {}, r.etdDays != null && r.etdDays >= 0 ? '(بعد ' + r.etdDays + ' يوم)' : '')) : '—'], ['الوصول (ETA)', sh.eta ? h('span', {}, fmt.date(sh.eta), ' ', h('small.lgx-muted', {}, etaDays != null && etaDays >= 0 ? '(بعد ' + etaDays + ' يوم)' : '')) : '—'], ['شروط التسليم', sh.incoterm || '—'], ['العملة', h('span', {}, 'EGP ', h('small.lgx-muted', {}, '— تعدد العملات خارج v1'))]])),
        SA.card({ title: 'تحميل الحاوية', tags: U.demo('أوزان وأحجام تقديرية') },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
            loadMeter(gk, cap.kg, 'بالوزن — ' + cap.label),
            ERP.chart.meter(Math.min(1, vol / cap.m3), { label: 'بالحجم', tone: vol > cap.m3 ? 'danger' : 'primary', text: fmt.pct(vol / cap.m3) + ' · ' + vol.toFixed(1) + ' / ' + cap.m3 + ' م³' }),
            h('div.lgx-row', {}, h('span.lgx-tagx', {}, pal + ' باليتة'), h('span.lgx-tagx', {}, kg(gk) + ' قائم'), h('span.lgx-tagx', {}, vol.toFixed(1) + ' م³')),
            h('table.lgx-tbl', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المطلوب', 'جاهز', 'كجم'].map((t) => h('th', {}, t)))), h('tbody', {}, lines.map((l) => { const rd = Math.min(l.qty, Math.max(l.reservedQty || 0, l.deliveredQty || 0)); return h('tr', {}, h('td', {}, U.itemCell(l.itemId)), h('td.num', {}, fmt.num(l.qty)), h('td.num', {}, h('b', { style: { color: rd >= l.qty ? 'var(--color-success)' : 'var(--color-warning)' } }, fmt.num(rd))), h('td.num', {}, fmt.num(Math.round(l.qty * wOf(l.itemId))))); })))))),
      U.grid(2,
        SA.card({ title: 'مستندات التصدير', tags: h('span.sap-count', {}, (sh.docs || []).filter((d) => d.ok).length + '/' + (sh.docs || []).length) },
          h('ul.lgx-docs', {}, (sh.docs || []).map((d, i) => h('li' + (d.ok ? '.is-ok' : ''), {}, h('span.lgx-doc-ico', {}, SA.icon(d.ok ? 'checkcircle' : 'file')), h('span.lgx-doc-name', {}, h('b', {}, d.name), h('small', {}, d.ok ? 'جاهز' + (d.generatedAt ? ' · ' + SA.fmt.rel(d.generatedAt) + ' — ' + SA.userName(d.by) : '') : 'لم يُولَّد بعد')), SA.chip(d.ok ? 'جاهز' : 'ناقص', d.ok ? 'success' : 'warning'), SA.btn({ label: d.ok ? 'عرض' : 'توليد', icon: 'doc', kind: 'ghost', size: 'sm', onClick: () => openDoc(sh, i) })))),
          h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'المستندات تُولَّد من بنود أمر البيع والأوزان. الفاتورة التجارية بالجنيه المصري فقط في v1.'))),
        SA.card({ title: 'الخط الزمني' }, h('ol.lgx-tl', {}, tl.map((x) => h('li', {}, h('i'), h('div', {}, h('b', {}, (CS.ship[x.status] || [x.status])[0]), h('small', {}, SA.fmt.dt(x.at) + ' · ' + SA.userName(x.by)), x.note ? h('small', {}, x.note) : null))).concat(future.map((x) => h('li.is-future', {}, h('i'), h('div', {}, h('b', {}, (CS.ship[x.status] || [x.status])[0]), h('small', {}, x.at ? 'متوقع ' + fmt.date(x.at) : 'لاحقًا')))))))),
      sos.map((so) => SA.card({ title: 'دورة أمر البيع — ' + so.id }, U.chain(so.id))));
  }
  function renderShipment(root, ctx, id) {
    ctx.setCrumbs([{ label: 'التسليم والشحن' }, { label: 'الشحنات والتصدير', href: '#/scm/shipments' }, { label: id }]);
    const build = () => {
      const sh = ERP.find('shipments', id);
      if (!sh) return h('div', {}, SA.pageHead({ title: 'الشحنة غير موجودة', back: { label: 'الشحنات', href: '#/scm/shipments' } }), SA.empty({ icon: 'search', title: 'لم نجد ' + id, action: { label: 'كل الشحنات', icon: 'list', onClick: () => SA.nav('scm/shipments') } }));
      return sh.kind === 'local' ? localView(sh) : exportView(sh);
    };
    return SA.live(root, build, ['shipments', 'salesOrders', 'workOrders', 'lines', 'maintenanceOrders', 'approvals', 'purchaseRequisitions', 'purchaseOrders', 'deliveries', 'stock', 'qcInspections']);
  }
  function renderShipments(root, ctx) {
    if (ctx.path[0]) return renderShipment(root, ctx, ctx.path[0]);
    ctx.setCrumbs([{ label: 'التسليم والشحن' }, { label: 'الشحنات والتصدير' }]);
    let tState = { q: ctx.params.q || '', filters: {}, sort: { key: 'etd', dir: 'desc' }, page: 1 };
    const build = () => {
      const all = shipments(); const risk = {}; all.forEach((s) => { risk[s.id] = shipmentRisk(s); });
      const activeExp = all.filter((s) => s.kind === 'export' && s.status !== 'delivered');
      const atRisk = activeExp.filter((s) => risk[s.id].level !== 'ok'); const docsMiss = activeExp.reduce((n, s) => n + risk[s.id].docsMissing, 0);
      const nextEtd = activeExp.filter((s) => s.etd >= today()).sort((a, b) => a.etd.localeCompare(b.etd))[0];
      const movingDns = get('deliveries').filter((d) => MOVING.indexOf(d.status) >= 0);
      const localTrips = all.filter((s) => s.kind === 'local' && s.status !== 'delivered');
      const table = SA.table({
        caption: 'الشحنات',
        columns: [
          { key: 'id', label: 'الشحنة', sort: true, render: (s) => h('span.lgx-cell', {}, h('a.erp-doc.num', { href: '#/scm/shipments/' + s.id }, s.id), h('small', {}, U.status('shipkind', s.kind))) },
          { key: 'customer', label: 'العميل والوجهة', sort: true, value: (s) => ERP.customerName(s.customerId), render: (s) => h('span.lgx-cell', {}, h('b', {}, ERP.customerName(s.customerId)), h('small', {}, s.destination || '')) },
          { key: 'soIds', label: 'أوامر البيع', render: (s) => ((s.soIds || []).length ? (s.soIds || []).map((x, i) => [i ? '، ' : '', L(x)]) : '—') },
          { key: 'etd', label: 'الإبحار/الخروج', sort: true, render: (s) => (s.etd ? h('span.lgx-cell', {}, h('b', {}, fmt.date(s.etd)), h('small', {}, s.status === 'delivered' ? '' : dayLabel(s.etd))) : '—') },
          { key: 'eta', label: 'الوصول', sort: true, render: (s) => (s.eta ? fmt.date(s.eta) : '—') },
          { key: 'status', label: 'الحالة', sort: true, render: (s) => U.status('ship', s.status) },
          { key: 'docs', label: 'المستندات', value: (s) => (s.docs || []).filter((d) => d.ok).length, render: (s) => (s.kind === 'export' ? h('span.num', {}, (s.docs || []).filter((d) => d.ok).length + '/' + (s.docs || []).length) : '—') },
          { key: 'risk', label: 'المخاطر', value: (s) => ({ danger: 2, warning: 1, ok: 0 })[risk[s.id].level], sort: true, render: (s) => (risk[s.id].level === 'danger' ? SA.chip(risk[s.id].delayDays ? 'تأخير متوقع ' + risk[s.id].delayDays + ' يوم' : 'معرّضة للتأخير', 'danger') : risk[s.id].level === 'warning' ? SA.chip('تنبيه', 'warning') : SA.chip('لا يوجد', 'success')) }
        ],
        rows: () => shipments(),
        search: { placeholder: 'بحث برقم الشحنة أو العميل أو الوجهة…', keys: ['id', 'destination', (s) => ERP.customerName(s.customerId), (s) => (s.soIds || []).join(' ')] },
        filters: [{ key: 'kind', label: 'النوع', options: [['export', 'تصدير'], ['local', 'نقل محلي']] }, { key: 'status', label: 'الحالة', options: Object.keys(CS.ship).map((k) => [k, CS.ship[k][0]]) }, { key: 'risk', label: 'المخاطر', options: [['risk', 'معرّضة للتأخير/تنبيه'], ['ok', 'بدون مخاطر']], test: (s, v) => (v === 'risk' ? risk[s.id].level !== 'ok' : risk[s.id].level === 'ok') }],
        initial: tState, onChange: (s) => { tState = s; }, pageSize: 10, onRowClick: (s) => SA.nav('scm/shipments/' + s.id),
        empty: { icon: 'ship', title: 'لا توجد شحنات', text: 'أنشئ شحنة تصدير لأمر بيع تصديري.', action: { label: 'شحنة تصدير جديدة', perm: 'scm.shipments.create', onClick: createShipmentModal } }
      });
      const tripRow = (d) => h('div.lgx-mini-row', {}, h('span.lgx-cell', {}, h('a.erp-doc.num', { href: '#/scm/deliveries/' + d.id }, d.id), h('small', {}, ERP.customerName(d.customerId) + ' · ' + vehLabel(d.vehicleId))), ERP.chart.meter(dnProgress(d), { label: 'جمصة ← ' + dnCity(d), tone: 'primary' }), h('span.lgx-muted', {}, 'وصول ~', h('b', {}, SA.fmt.time(etaOf(d)))));
      const shipRow = (s) => h('div.lgx-mini-row', {}, h('span.lgx-cell', {}, h('a.erp-doc.num', { href: '#/scm/shipments/' + s.id }, s.id), h('small', {}, ERP.customerName(s.customerId) + ' · ' + vehLabel(s.vehicleId))), ERP.chart.meter((s.progress || 0) / 100, { label: 'جمصة ← ' + (s.destination || ''), tone: (s.progress || 0) >= 100 ? 'success' : 'primary' }), SA.btn({ label: 'التتبع', icon: 'map', kind: 'ghost', size: 'sm', onClick: () => SA.nav('scm/shipments/' + s.id) }));
      const localDnIds = new Set([].concat.apply([], localTrips.map((s) => s.dnIds || [])));
      return h('div', {},
        SA.pageHead({ title: 'الشحنات والتصدير', desc: 'حاويات التصدير ومستنداتها ومخاطر الإنتاج على موعد الإبحار — والرحلات المحلية بتتبع تقريبي.', actions: [SA.btn({ label: 'شحنة تصدير جديدة', icon: 'plus', perm: 'scm.shipments.create', onClick: createShipmentModal })] }),
        U.kpis([
          U.kpi({ label: 'شحنات تصدير نشطة', value: fmt.num(activeExp.length), sub: nextEtd ? 'أقرب إبحار ' + dayLabel(nextEtd.etd) : 'لا يوجد إبحار قريب', icon: 'ship' }),
          U.kpi({ label: 'معرّضة للتأخير', value: fmt.num(atRisk.length), sub: atRisk.length ? atRisk.map((s) => s.id).join('، ') : 'لا توجد مخاطر', icon: 'alert', tone: atRisk.some((s) => risk[s.id].level === 'danger') ? 'danger' : atRisk.length ? 'warning' : 'success', href: atRisk[0] ? '#/scm/shipments/' + atRisk[0].id : null }),
          U.kpi({ label: 'مستندات ناقصة', value: fmt.num(docsMiss), sub: 'في شحنات التصدير النشطة', icon: 'file', tone: docsMiss ? 'warning' : 'success' }),
          U.kpi({ label: 'رحلات محلية في الطريق', value: fmt.num(movingDns.length + localTrips.filter((s) => !(s.dnIds || []).some((x) => movingDns.some((d) => d.id === x))).length), sub: 'تتبع تقريبي', icon: 'truck' })
        ]),
        SA.card({ title: 'كل الشحنات', flush: true }, table.el),
        h('div', { style: { height: '16px' } }),
        SA.card({ title: 'رحلات محلية جارية', tags: U.demo('محاكاة GPS') }, localTrips.length || movingDns.length ? h('div.lgx-mini', {}, localTrips.map(shipRow), movingDns.filter((d) => !localDnIds.has(d.id)).map(tripRow)) : SA.empty({ icon: 'route', title: 'لا توجد رحلات في الطريق الآن' })));
    };
    return SA.live(root, build, ['shipments', 'deliveries', 'salesOrders', 'workOrders', 'lines', 'maintenanceOrders', 'approvals']);
  }

  /* ───────────── 4. scm-fleet ───────────── */
  function vehicleModal(v) {
    const isNew = !v; v = v || { id: null, plate: '', type: 'نقل متوسط 6 طن', capacityKg: 6000, driver: '', phone: '', status: 'available', lastService: today(), contracted: false };
    const fPlate = SA.form.field({ name: 'plate', label: 'رقم اللوحة', required: true, value: v.plate });
    const fType = SA.form.field({ name: 'type', label: 'النوع', required: true, value: v.type });
    const fCap = SA.form.field({ name: 'capacityKg', label: 'الحمولة القصوى (كجم)', type: 'number', required: true, value: v.capacityKg, min: 100 });
    const fDrv = SA.form.field({ name: 'driver', label: 'السائق', value: v.driver });
    const fPh = SA.form.field({ name: 'phone', label: 'هاتف السائق', type: 'tel', value: v.phone, rules: [SA.form.rules.phone] });
    const fSt = SA.form.field({ name: 'status', label: 'الحالة', type: 'select', value: v.status === 'maintenance' ? 'maintenance' : 'available', options: [['available', 'متاحة للتشغيل'], ['maintenance', 'في الصيانة (خارج الخدمة)']], hint: '«في رحلة» تُحسب تلقائيًا من أذون التسليم.' });
    const fSvc = SA.form.field({ name: 'lastService', label: 'آخر صيانة دورية', type: 'date', value: v.lastService || '' });
    const fCon = SA.form.field({ name: 'contracted', label: 'نقل خارجي بالتعاقد', type: 'switch', value: !!v.contracted, hint: 'لا يخضع لجدول الصيانة الداخلي' });
    const m = SA.modal({ title: isNew ? 'إضافة مركبة' : 'تعديل المركبة ' + v.plate, icon: 'truck', size: 'md', body: h('div', {}, h('div.sap-formgrid', {}, fPlate.el, fType.el, fCap.el, fSt.el, fDrv.el, fPh.el, fSvc.el), fCon.el),
      foot: [h('button.btn.btn-ghost', { type: 'button', onclick: () => m.close() }, 'إلغاء'), h('button.btn.btn-primary', { type: 'button', onclick: save }, SA.icon('check', 'icon-sm'), 'حفظ')] });
    async function save() {
      const g = SA.form.group([fPlate, fType, fCap, fPh]); if (!g.validate()) return; if (!(fCap.get() > 0)) { fCap.error('أدخل حمولة صحيحة'); return; }
      if (fSt.get() === 'maintenance' && v.id && vehTrips(v.id).length) { fSt.error('المركبة في رحلة الآن — أكّد التسليم أولًا'); return; }
      const after = { plate: fPlate.get().trim(), type: fType.get().trim(), capacityKg: Math.round(fCap.get()), driver: fDrv.get().trim(), phone: fPh.get().trim(), status: fSt.get(), lastService: fSvc.get() || null, contracted: !!fCon.get() };
      const before = isNew ? null : { plate: v.plate, type: v.type, capacityKg: v.capacityKg, driver: v.driver, phone: v.phone, status: v.status, lastService: v.lastService || null, contracted: !!v.contracted };
      m.setBusy(true); let id = v.id;
      try {
        await SA.api(() => {
          if (isNew) { id = st.nextId('vehicles', 'VH', 2); st.insert('vehicles', Object.assign({ id }, after)); }
          else st.patch('vehicles', v.id, after);
          SA.audit('FLEET.UPDATED', { area: 'scm', target: { type: 'vehicle', id, label: after.plate }, before, after });
        });
      } catch (e) { m.setBusy(false); return SA.fail(e); }
      m.close(); SA.toast(isNew ? 'تمت إضافة المركبة ' + after.plate : 'تم حفظ بيانات ' + after.plate, 'success');
    }
  }
  function renderFleet(root, ctx) {
    ctx.setCrumbs([{ label: 'التسليم والشحن' }, { label: 'الأسطول والسائقين' }]);
    let tState = { q: '', filters: {}, sort: { key: 'at', dir: 'desc' }, page: 1 };
    const build = () => {
      const dns = get('deliveries'); const td = today(); const mk = td.slice(0, 7);
      const del = dns.filter((d) => d.status === 'delivered' && d.deliveredAt);
      const d90 = del.filter((d) => ERP.daysBetween(localDay(d.deliveredAt), td) <= 90);
      const onTime = d90.length ? d90.filter((d) => d.onTime).length / d90.length : null;
      const month = del.filter((d) => localDay(d.deliveredAt).slice(0, 7) === mk).length;
      const durs = d90.filter((d) => d.dispatchedAt).map((d) => (new Date(d.deliveredAt) - new Date(d.dispatchedAt)) / 3600000).filter((x) => x > 0 && x < 240);
      const avgH = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
      const costs = d90.map((d) => tripOf([d], vehicle(d.vehicleId)).cost); const avgCost = costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
      const avail = vehicles().filter((v) => vehStatus(v) === 'available').length;
      /* weekly buckets (last 8 weeks) */
      const weeks = []; for (let i = 7; i >= 0; i--) { const end = ERP.day(-i * 7), start = ERP.day(-i * 7 - 6); weeks.push({ start, end, label: end.slice(8, 10) + '/' + end.slice(5, 7) }); }
      const wk = (d) => { const x = localDay(d.deliveredAt); return weeks.findIndex((w) => x >= w.start && x <= w.end); };
      const series = vehicles().map((v, i) => ({ name: v.plate, color: ERP.palette[i % ERP.palette.length], values: weeks.map((w, wi) => del.filter((d) => d.vehicleId === v.id && wk(d) === wi).length) }));
      const otLine = weeks.map((w, wi) => { const l = del.filter((d) => wk(d) === wi); return l.length ? Math.round((l.filter((d) => d.onTime).length / l.length) * 100) : null; });
      const vehCard = (v) => {
        const vs = vehStatus(v); const ns = nextService(v); const due = ns && ns <= ERP.day(7); const over = ns && ns < td; const trips30 = del.filter((d) => d.vehicleId === v.id && ERP.daysBetween(localDay(d.deliveredAt), td) <= 30);
        const cur = vehTrips(v.id)[0];
        return h('article.lgx-veh', {},
          h('div.lgx-veh-top', {}, h('div', {}, h('span.lgx-plate', {}, v.plate), h('div.lgx-muted', { style: { marginTop: '4px' } }, v.type)), U.status('vehicle', vs)),
          h('dl', {}, h('dt', {}, 'السائق'), h('dd', {}, v.driver || '—'), h('dt', {}, 'الهاتف'), h('dd.num', {}, v.phone || '—'), h('dt', {}, 'الحمولة'), h('dd.num', {}, kg(v.capacityKg)),
            h('dt', {}, 'الصيانة'), h('dd', {}, v.contracted ? SA.chip('تعاقد خارجي', 'neutral') : ns ? h('span', { class: over ? 'lgx-late' : '' }, (over ? 'متأخرة منذ ' : due ? 'مستحقة ' : 'القادمة ') + fmt.date(ns)) : '—'),
            h('dt', {}, 'رحلات 30 يوم'), h('dd.num', {}, String(trips30.length)), cur ? h('dt', {}, 'الآن') : null, cur ? h('dd', {}, L(cur.id), ' → ', dnCity(cur)) : null),
          SA.btn({ label: 'تعديل', icon: 'edit', kind: 'ghost', size: 'sm', perm: 'scm.fleet.edit', onClick: () => vehicleModal(v) }));
      };
      const drvRows = vehicles().filter((v) => !v.contracted).map((v) => { const l = d90.filter((d) => d.vehicleId === v.id); const ot = l.length ? l.filter((d) => d.onTime).length / l.length : null; return { v, n: l.length, ot, kg: l.reduce((s, d) => s + dnKg(d), 0) }; });
      const trips = dns.filter((d) => d.vehicleId && (d.status === 'delivered' || MOVING.indexOf(d.status) >= 0));
      const table = SA.table({
        caption: 'سجل الرحلات',
        columns: [
          { key: 'id', label: 'الإذن', sort: true, render: (d) => h('a.erp-doc.num', { href: '#/scm/deliveries/' + d.id }, d.id) },
          { key: 'at', label: 'التاريخ', sort: true, value: (d) => d.deliveredAt || d.dispatchedAt || '', render: (d) => SA.fmt.date(d.deliveredAt || d.dispatchedAt) },
          { key: 'vehicle', label: 'المركبة / السائق', sort: true, value: (d) => vehLabel(d.vehicleId), render: (d) => h('span.lgx-cell', {}, h('b', {}, vehLabel(d.vehicleId)), h('small', {}, d.driver || (vehicle(d.vehicleId) || {}).driver || '')) },
          { key: 'customer', label: 'العميل', sort: true, value: (d) => ERP.customerName(d.customerId), render: (d) => h('span.lgx-cell', {}, h('b', {}, ERP.customerName(d.customerId)), h('small', {}, dnCity(d))) },
          { key: 'kg', label: 'الحمولة', sort: true, value: (d) => dnKg(d), render: (d) => h('span.num', {}, kg(dnKg(d))) },
          { key: 'km', label: 'كم', sort: true, value: (d) => kmTo(dnCity(d)) * 2, render: (d) => h('span.num', {}, fmt.num(kmTo(dnCity(d)) * 2)) },
          { key: 'dur', label: 'زمن التوصيل', sort: true, value: (d) => (d.deliveredAt && d.dispatchedAt ? (new Date(d.deliveredAt) - new Date(d.dispatchedAt)) / 3600000 : null), render: (d) => (d.deliveredAt && d.dispatchedAt ? h('span.num', {}, ((new Date(d.deliveredAt) - new Date(d.dispatchedAt)) / 3600000).toFixed(1) + ' س') : U.status('dn', d.status)) },
          { key: 'onTime', label: 'الموعد', render: (d) => (d.onTime == null ? '—' : SA.chip(d.onTime ? 'في الموعد' : 'متأخر', d.onTime ? 'success' : 'danger')) }
        ],
        rows: () => trips,
        search: { placeholder: 'بحث بالإذن أو العميل أو المدينة…', keys: ['id', (d) => ERP.customerName(d.customerId), (d) => dnCity(d)] },
        filters: [{ key: 'vehicle', label: 'المركبة', options: vehicles().map((v) => [v.id, v.plate]), test: (d, v) => d.vehicleId === v }, { key: 'onTime', label: 'الموعد', options: [['yes', 'في الموعد'], ['no', 'متأخر']], test: (d, v) => (v === 'yes' ? d.onTime === true : d.onTime === false) }, { key: 'period', label: 'الفترة', options: [['30', 'آخر 30 يوم'], ['90', 'آخر 90 يوم'], ['month', 'هذا الشهر']], test: (d, v) => { const x = localDay(d.deliveredAt || d.dispatchedAt); return v === 'month' ? x.slice(0, 7) === mk : ERP.daysBetween(x, td) <= Number(v); } }],
        initial: tState, onChange: (s) => { tState = s; }, pageSize: 10, onRowClick: (d) => SA.nav('scm/deliveries/' + d.id),
        empty: { icon: 'truck', title: 'لا توجد رحلات مسجلة' }
      });
      return h('div', {},
        SA.pageHead({ title: 'الأسطول والسائقين', desc: 'حالة المركبات والصيانة الدورية وأداء التسليم في الموعد — من أذون التسليم الفعلية.', actions: [SA.btn({ label: 'إضافة مركبة', icon: 'plus', kind: 'ghost', perm: 'scm.fleet.edit', onClick: () => vehicleModal(null) })] }),
        U.kpis([
          U.kpi({ label: 'التسليم في الموعد (90 يوم)', value: onTime == null ? '—' : fmt.pct(onTime), sub: d90.length + ' تسليم', icon: 'checkcircle', tone: onTime != null && onTime < 0.85 ? 'warning' : 'success', trend: otLine.filter((x) => x != null) }),
          U.kpi({ label: 'تسليمات هذا الشهر', value: fmt.num(month), sub: 'تم تأكيد الاستلام', icon: 'truck', trend: weeks.map((w, wi) => del.filter((d) => wk(d) === wi).length) }),
          U.kpi({ label: 'متوسط زمن التوصيل', value: avgH == null ? '—' : avgH.toFixed(1) + ' ساعة', sub: 'من الخروج حتى الاستلام', icon: 'clock' }),
          U.kpi({ label: 'تكلفة الرحلة (متوسط)', value: avgCost == null ? '—' : fmt.short(avgCost), sub: 'تقديرية: وقود + سائق / تعاقد', icon: 'coins' }),
          U.kpi({ label: 'مركبات متاحة الآن', value: avail + ' / ' + vehicles().length, sub: vehicles().filter((v) => vehStatus(v) === 'on_trip').length + ' في رحلة', icon: 'gauge' })
        ]),
        h('p.sap-hint', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'تكلفة الرحلة والمسافات تقديرية للعرض ', U.demo(), ' — التكلفة الفعلية تأتي من المالية عند ربط مصروفات الأسطول.')),
        SA.card({ title: 'المركبات' }, h('div.lgx-vehs', {}, vehicles().map(vehCard))),
        U.grid(2,
          SA.card({ title: 'التسليمات أسبوعيًا حسب المركبة' }, ERP.chart.columns({ labels: weeks.map((w) => w.label), series, stacked: true, fmt: (n) => fmt.num(n), height: 210, legend: true })),
          SA.card({ title: 'نسبة التسليم في الموعد أسبوعيًا (%)' }, ERP.chart.line({ labels: weeks.map((w) => w.label), series: [{ name: 'في الموعد %', values: otLine }], fmt: (n) => Math.round(n) + '%', height: 210, area: true }))),
        SA.card({ title: 'السائقون (90 يوم)' }, h('div.table-wrap', {}, h('table.lgx-tbl', {}, h('thead', {}, h('tr', {}, ['السائق', 'المركبة', 'الهاتف', 'رحلات', 'في الموعد', 'الحمولة المنقولة', 'الحالة'].map((t) => h('th', {}, t)))),
          h('tbody', {}, drvRows.map((r) => h('tr', {}, h('td', {}, h('span.sap-usercell', {}, SA.avatar(r.v.driver || '?'), h('b', {}, r.v.driver || '—'))), h('td', {}, h('span.lgx-plate', {}, r.v.plate)), h('td.num', {}, r.v.phone || '—'), h('td.num', {}, String(r.n)), h('td', {}, r.ot == null ? '—' : SA.chip(fmt.pct(r.ot), r.ot >= 0.9 ? 'success' : r.ot >= 0.75 ? 'warning' : 'danger')), h('td.num', {}, kg(r.kg)), h('td', {}, U.status('vehicle', vehStatus(r.v))))))))),
        h('div', { style: { height: '16px' } }),
        SA.card({ title: 'سجل الرحلات', flush: true }, table.el));
    };
    return SA.live(root, build, ['vehicles', 'deliveries', 'shipments']);
  }

  /* ───────────── registration ───────────── */
  const reg = (o) => SA.register(Object.assign({ app: 'scm', group: 'scm-log', moduleKey: 'logistics' }, o));
  reg({ id: 'scm-deliveries', title: 'أذون التسليم', icon: 'box', route: 'scm/deliveries', perm: 'scm.deliveries.view', order: 60, desc: 'جاهز للتسليم · أذون التسليم · إيصال الاستلام',
    badge() { try { const n = readyQueue().length; return n || null; } catch (e) { return null; } }, render: renderDeliveries });
  reg({ id: 'scm-dispatch', title: 'تخطيط الرحلات', icon: 'route', route: 'scm/dispatch', perm: 'scm.dispatch.view', order: 61, desc: 'توزيع الأذون على المركبات والحمولة',
    badge() { try { const n = get('deliveries').filter((d) => OPEN.indexOf(d.status) >= 0 && !d.vehicleId).length; return n || null; } catch (e) { return null; } }, render: renderDispatch });
  reg({ id: 'scm-shipments', title: 'الشحنات والتصدير', icon: 'ship', route: 'scm/shipments', perm: 'scm.shipments.view', order: 62, desc: 'حاويات التصدير والمستندات والرحلات المحلية',
    badge() { try { const n = shipments().filter((s) => s.kind === 'export' && s.status !== 'delivered' && shipmentRisk(s).level === 'danger').length; return n || null; } catch (e) { return null; } }, render: renderShipments });
  reg({ id: 'scm-fleet', title: 'الأسطول والسائقين', icon: 'truck', route: 'scm/fleet', perm: 'scm.fleet.view', order: 63, desc: 'المركبات والصيانة والالتزام بالمواعيد', render: renderFleet });

  SA.search.register({ id: 'logistics', label: 'التسليم والشحن', perm: 'scm.deliveries.view', query: (q) => (q ? get('deliveries').filter((d) => d.id.toLowerCase().indexOf(q) >= 0 || ERP.customerName(d.customerId).toLowerCase().indexOf(q) >= 0).slice(0, 5).map((d) => ({ title: d.id + ' — ' + ERP.customerName(d.customerId), sub: (CS.dn[d.status] || [d.status])[0] + ' · ' + fmt.date(d.plannedDate), icon: 'truck', route: 'scm/deliveries/' + d.id }))
    .concat(SA.can('scm.shipments.view') ? shipments().filter((s) => s.id.toLowerCase().indexOf(q) >= 0 || String(s.destination || '').toLowerCase().indexOf(q) >= 0).slice(0, 3).map((s) => ({ title: s.id + ' — ' + (s.destination || ''), sub: (CS.ship[s.status] || [s.status])[0], icon: 'ship', route: 'scm/shipments/' + s.id })) : []) : []) });

  if (SA.missions) {
    SA.missions.add({ id: 'M-L1', area: 'logistics', title: 'من البضاعة الجاهزة إلى إيصال الاستلام', persona: 'logistics', route: 'scm/deliveries', est: '4 د', goal: 'أنشئ إذن تسليم لطلب جاهز، أسنده لمركبة، أخرجه من المصنع ثم أكّد الاستلام بتوقيع العميل — وشاهد أمر البيع يصبح جاهزًا للفوترة.',
      steps: [{ text: 'من «جاهز للتسليم» اضغط «أنشئ إذن تسليم»', audit: 'DN.CREATED' }, { text: 'اخرج الإذن من المصنع على مركبة متاحة', audit: 'DN.DISPATCHED' }, { text: 'أكّد التسليم بإيصال الاستلام (POD)', audit: 'DN.DELIVERED' }], detect: [{ audit: 'DN.CREATED' }, { audit: 'DN.DISPATCHED' }, { audit: 'DN.DELIVERED' }] });
    SA.missions.add({ id: 'M-L2', area: 'logistics', title: 'شحنة عُمان: اكتشف سبب خطر التأخير', persona: 'logistics', route: 'scm/shipments/SH-2026-014', est: '2 د', goal: 'افتح شحنة التصدير SH-2026-014 وتتبّع السلسلة: أمر تشغيل متوقف ← خط L-03 عطلان ← قطعة غيار رصيدها صفر ← اعتماد شراء عاجل. ثم ولّد قائمة التعبئة.',
      steps: [{ text: 'افتح الشحنة SH-2026-014 واقرأ بانر المخاطر', route: 'scm-shipments' }, { text: 'ولّد قائمة التعبئة واعتمدها', audit: 'SHIP.DOC_GENERATED' }], detect: [{ route: 'scm-shipments' }, { audit: 'SHIP.DOC_GENERATED' }] });
  }
})();
