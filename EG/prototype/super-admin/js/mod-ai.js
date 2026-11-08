/* EG ERP prototype — mod-ai.js  (المساعد الذكي — محاكاة offline، حتمية، من بيانات النظام الحية)
   Exports ERP.ai = { insights(area), brief(), ask(question), chatView(opts), suggestions(n) }
     insights(area) for 'exec'|'crm'|'mfg'|'scm'|'fin'|'care'|'expo' → [{id, title, text, tone:'danger|warning|info|success', why, actions:[{label, route}|{label, onClick}]}] — computed LIVE (they change when data changes),
     scoped (reps see their customers only) and cost/profit gated. Used by ERP.ui.insights(area) on every dashboard.
   Screens: exec-insights  #/exec/insights (exec.insights.view, group exec-ai) — forecast with confidence band, smart reorder, maintenance & payment risk, opportunities, anomalies (+ «لماذا؟»)
            exec-ai        #/exec/ai       (exec.ai.use, group exec-ai)       — full-page chat «اسأل نظامك» (Arabic intent matching, sessionStorage per user, AI.QUERY audit throttled per intent)
   Floating assistant: round button on every internal shell screen (not ESS / portal / exec/ai) for exec.ai.use → SA.drawer with the same chat engine.
   Data-changing actions (create PRQ, schedule PM, assign a collection follow-up) always ask SA.confirm and write AI.INSIGHT_ACTION (+ the business audit code).
   DISCLOSURE: simulation — the real version connects to an AI model (Claude) over the system data and the user's permissions. Requires ERP.metrics (mod-exec.js). */
(function () {
  'use strict';
  const SA = window.SA, ERP = window.ERP; if (!SA || !ERP) return;
  const h = SA.h, st = SA.store, F = ERP.flow, K = ERP.stock, fm = ERP.fmt;
  const get = (p) => st.get(p) || [];
  const M = ERP.metrics;
  if (!M) { console.error('[mod-ai] ERP.metrics missing (mod-exec.js must load first)'); ERP.ai = { insights: () => [], brief: () => '', ask: () => ({ text: 'المساعد غير متاح.' }) }; return; }
  const DISCLOSURE = 'محاكاة — في النسخة الفعلية يتصل بنموذج ذكاء اصطناعي (Claude) على بيانات النظام وبصلاحياتك.';

  /* ═════════════ styles ═════════════ */
  (function () {
    if (document.querySelector('style[data-mod="ai"]')) return;
    const s = document.createElement('style'); s.setAttribute('data-mod', 'ai');
    s.textContent = `
.xai-chat { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; height: 100%; }
.xai-msgs { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 6px 4px 12px; }
.xai-msg { display: flex; gap: 10px; align-items: flex-start; }
.xai-msg.is-user { justify-content: flex-end; }
.xai-ava { width: 34px; height: 34px; border-radius: 11px; flex: none; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--eg-navy), #345383); box-shadow: 0 4px 10px rgba(1,40,100,.2); }
.xai-bub { background: #fff; border: 1px solid var(--color-border); border-radius: 16px; border-start-start-radius: 4px; padding: 10px 14px; max-width: min(820px, 94%); min-width: 0; box-shadow: var(--shadow-card); }
.xai-msg.is-user .xai-bub { background: var(--eg-navy); color: #fff; border-color: var(--eg-navy); border-radius: 16px; border-start-end-radius: 4px; max-width: min(620px, 86%); }
.xai-msg.is-user .xai-meta { color: #b9c8e6; }
.xai-tone-warning .xai-bub { border-color: #f2d6ad; background: #fffcf6; } .xai-tone-danger .xai-bub { border-color: #f1b9bc; background: #fffafa; } .xai-tone-success .xai-bub { border-color: #bfe3cc; background: #f8fdf9; }
.xai-text { margin: 0; font-size: 14.5px; line-height: 1.9; white-space: pre-line; overflow-wrap: anywhere; }
.xai-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 6px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.xai-flag { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700; color: var(--color-warning); background: var(--color-warning-tint); border-radius: 6px; padding: 1px 8px; margin-bottom: 6px; }
.xai-blocks { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; animation: xai-in .28s ease; }
.xai-blocks:empty { display: none; }
.xai-tbl { max-height: 330px; overflow: auto; border: 1px solid var(--color-border); border-radius: 10px; background: #fff; }
.xai-tbl table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.xai-tbl th { position: sticky; top: 0; z-index: 1; background: var(--color-bg-alt); font-weight: 700; text-align: start; padding: 7px 10px; white-space: nowrap; color: var(--color-text-muted); }
.xai-tbl td { padding: 7px 10px; border-top: 1px solid var(--color-border); white-space: nowrap; }
.xai-tbl td.num, .xai-tbl th.num { text-align: end; font-variant-numeric: tabular-nums; }
.xai-tbl a { color: var(--eg-navy); font-weight: 600; text-decoration: none; } .xai-tbl a:hover { text-decoration: underline; }
.xai-tbl .chip { font-size: 11.5px; }
.xai-chartbox { background: var(--color-bg-alt); border-radius: 12px; padding: 10px 12px; }
.xai-ct { display: block; font-size: 12px; color: var(--color-text-muted); font-weight: 700; margin-bottom: 4px; }
.xai-gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; }
.xai-links { display: flex; gap: 6px; flex-wrap: wrap; }
.xai-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.xai-chip { border: 1px solid var(--eg-navy-tint); background: var(--color-primary-tint); color: var(--eg-navy); border-radius: 999px; padding: 6px 12px; font: 600 12.5px var(--font-ar); cursor: pointer; min-height: 34px; display: inline-flex; align-items: center; gap: 5px; }
.xai-chip:hover { background: #fff; border-color: var(--eg-navy); }
.xai-chip:focus-visible { outline: none; box-shadow: var(--focus-ring); }
.xai-chip.is-locked { background: var(--color-neutral-tint); border-color: var(--color-border); color: var(--color-text-muted); }
.xai-note { margin: 0; font-size: 12px; color: var(--color-text-muted); display: flex; gap: 6px; align-items: flex-start; line-height: 1.6; }
.xai-composer { display: flex; gap: 8px; align-items: flex-end; background: #fff; border: 1px solid var(--color-border-strong); border-radius: 14px; padding: 6px; box-shadow: var(--shadow-card); }
.xai-composer:focus-within { border-color: var(--eg-navy); box-shadow: var(--focus-ring); }
.xai-inp.textarea { flex: 1; border: 0; box-shadow: none; resize: none; min-height: 44px; max-height: 140px; font-size: 15px; padding: 10px 8px; background: transparent; outline: none; }
.xai-send { width: 46px; height: 44px; padding: 0; border-radius: 12px; flex: none; display: grid; place-items: center; }
.xai-send svg { transform: scaleX(-1); }
.xai-disc { margin: 0; font-size: 11.5px; color: var(--color-text-muted); display: flex; gap: 6px; align-items: flex-start; line-height: 1.6; }
.xai-typing { display: inline-flex; gap: 4px; padding: 6px 2px; }
.xai-typing i { width: 7px; height: 7px; border-radius: 50%; background: var(--eg-navy-glass); opacity: .4; animation: xai-dot 1s infinite; }
.xai-typing i:nth-child(2) { animation-delay: .15s; } .xai-typing i:nth-child(3) { animation-delay: .3s; }
@keyframes xai-dot { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
@keyframes xai-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
.xai-act { border: 1px dashed var(--eg-navy-glass); border-radius: 12px; padding: 10px 12px; background: linear-gradient(135deg, #f5f8ff, #fff); display: flex; flex-direction: column; gap: 8px; }
.xai-act-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
.xai-done { display: inline-flex; gap: 6px; align-items: center; color: var(--color-success); font-weight: 700; font-size: 13px; }
.xai-welcome b { color: var(--eg-navy); }
.xai-page { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; align-items: start; }
@media (max-width: 1100px) { .xai-page { grid-template-columns: 1fr; } }
.xai-main.card { height: calc(100vh - 240px); min-height: 540px; display: flex; flex-direction: column; padding: 14px; }
.xai-side { display: flex; flex-direction: column; gap: 14px; }
.xai-cat { display: flex; flex-direction: column; gap: 8px; }
.xai-cat h4 { margin: 4px 0 0; font-size: 12.5px; color: var(--eg-navy); display: flex; align-items: center; gap: 6px; }
.xai-src { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; color: var(--color-text-muted); }
.xai-src li { display: flex; gap: 8px; align-items: flex-start; line-height: 1.6; } .xai-src li svg { flex: none; margin-top: 3px; color: var(--eg-navy); }
.sap-drawer-body.xai-dbody { display: flex; flex-direction: column; overflow: hidden; padding: 12px 16px; }
.xai-fab { position: fixed; inset-inline-end: 16px; inset-block-end: 76px; z-index: 45; display: inline-flex; align-items: center; gap: 8px; min-height: 48px; padding-inline: 14px 18px; border-radius: 999px; border: 0; cursor: pointer; color: #fff; font: 800 var(--text-dense) var(--font-ar); background: linear-gradient(135deg, var(--eg-navy), #345383); box-shadow: 0 10px 26px rgba(1,40,100,.35); transition: opacity .15s ease, transform .15s ease; }
.xai-fab:hover { transform: translateY(-2px); } .xai-fab:focus-visible { outline: none; box-shadow: var(--focus-ring), 0 10px 26px rgba(1,40,100,.35); }
.xai-fab-dot { width: 9px; height: 9px; border-radius: 50%; background: #3ddc84; box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
body:has(.sap-drawer, .sap-modal) .xai-fab, body.sap-tl-open .xai-fab { opacity: 0; pointer-events: none; transform: translateY(8px); }
@media (max-width: 760px) { .xai-fab > span { display: none; } .xai-fab { width: 52px; height: 52px; padding: 0; justify-content: center; inset-block-end: 80px; } .xai-fab-dot { position: absolute; top: 8px; inset-inline-end: 8px; } }
.xai-ipage { display: flex; flex-direction: column; gap: 18px; }
.xai-icards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 430px), 1fr)); gap: 12px; }
.xai-why { margin-top: 6px; } .xai-why summary { cursor: pointer; color: var(--eg-navy); font-weight: 700; font-size: 12.5px; display: inline-flex; gap: 4px; align-items: center; list-style: none; min-height: 28px; }
.xai-why summary::-webkit-details-marker { display: none; }
.xai-why p { margin: 6px 0 0; font-size: 12.5px; line-height: 1.85; color: var(--color-text); background: #fff; border: 1px solid var(--color-border); border-radius: 8px; padding: 8px 10px; }
.xai-rows { display: flex; flex-direction: column; gap: 8px; }
.xai-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 12px; background: #fff; }
.xai-row b { display: block; font-size: var(--text-dense); line-height: 1.45; } .xai-row b a { color: inherit; text-decoration: none; } .xai-row b a:hover { color: var(--eg-navy); text-decoration: underline; }
.xai-row small { display: block; color: var(--color-text-muted); font-size: 12px; line-height: 1.6; margin-top: 2px; }
.xai-row-acts { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.xai-score { min-width: 50px; text-align: center; font: 800 15px var(--font-en); border-radius: 10px; padding: 6px 8px; }
.xai-score small { display: block; font: 600 10px var(--font-ar); margin: 0; color: inherit; opacity: .85; }
.xai-score.is-high { background: var(--color-danger-tint); color: var(--color-danger); } .xai-score.is-medium { background: var(--color-warning-tint); color: var(--color-warning); } .xai-score.is-low { background: var(--color-success-tint); color: var(--color-success); }
.xai-tico { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: var(--color-primary-tint); color: var(--eg-navy); }
.xai-tico.is-danger { background: var(--color-danger-tint); color: var(--color-danger); } .xai-tico.is-warning { background: var(--color-warning-tint); color: var(--color-warning); } .xai-tico.is-success { background: var(--color-success-tint); color: var(--color-success); }
.xai-fc-tools { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.xai-mt td, .xai-mt th { white-space: nowrap; } .xai-mt td.num, .xai-mt th.num { text-align: end; font-variant-numeric: tabular-nums; }
@media (max-width: 700px) { .xai-row { grid-template-columns: auto minmax(0, 1fr); } .xai-row-acts { grid-column: 1 / -1; justify-content: flex-start; } }
@media (prefers-reduced-motion: reduce) { .xai-typing i, .xai-blocks { animation: none; } .xai-fab { transition: none; } }
`;
    document.head.appendChild(s);
  })();

  /* ═════════════ text + format helpers ═════════════ */
  const AD = '٠١٢٣٤٥٦٧٨٩', PD = '۰۱۲۳۴۵۶۷۸۹';
  /** Arabic normalisation for intent matching: tashkeel/tatweel removed, أإآ→ا, ة→ه, ى→ي, ؤ→و, ئ→ي, Arabic-Indic digits → Latin, punctuation → space */
  function norm(s) {
    return String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .replace(/[٠-٩]/g, (d) => String(AD.indexOf(d))).replace(/[۰-۹]/g, (d) => String(PD.indexOf(d))).toLowerCase()
      .replace(/(\d),(\d)/g, '$1$2').replace(/[؟?!،,؛;:"'()[\]{}«»…]/g, ' ').replace(/(^|[^\d])\.|\.(?!\d)/g, '$1 ').replace(/\s+/g, ' ').trim();
  }
  const N = (arr) => arr.map(norm);
  const has = (n, arr) => arr.some((w) => w && n.indexOf(w) >= 0);
  const short = fm.short, num = (v) => fm.num(v == null ? null : Math.round(v)), money = fm.money;
  const pct = (v) => (v == null || !isFinite(v) ? '—' : Math.round(v * 100) + '%');
  const pct1 = (v) => (v == null || !isFinite(v) ? '—' : (Math.round(v * 1000) / 10) + '%');
  /** Arabic counted noun: forms = [one, two, plural(3–10), singular(11+)] */
  const pl = (n, f) => (n === 1 ? f[0] : n === 2 ? f[1] : n >= 3 && n <= 10 ? n + ' ' + f[2] : n + ' ' + f[3]);
  const FN = { inv: ['فاتورة واحدة', 'فاتورتين', 'فواتير', 'فاتورة'], so: ['طلب واحد', 'طلبين', 'طلبات', 'طلبًا'], cust: ['عميل واحد', 'عميلين', 'عملاء', 'عميلًا'], wo: ['أمر تشغيل واحد', 'أمرَي تشغيل', 'أوامر تشغيل', 'أمر تشغيل'], item: ['صنف واحد', 'صنفين', 'أصناف', 'صنفًا'],
    mc: ['ماكينة واحدة', 'ماكينتين', 'ماكينات', 'ماكينة'], chq: ['شيك واحد', 'شيكين', 'شيكات', 'شيكًا'], tkt: ['تذكرة مفتوحة واحدة', 'تذكرتين مفتوحتين', 'تذاكر مفتوحة', 'تذكرة مفتوحة'], ap: ['طلب اعتماد واحد', 'طلبَي اعتماد', 'طلبات اعتماد', 'طلب اعتماد'],
    lead: ['عميل محتمل واحد', 'عميلين محتملين', 'عملاء محتملين', 'عميلًا محتملًا'], ncr: ['حالة عدم مطابقة واحدة', 'حالتَي عدم مطابقة', 'حالات عدم مطابقة', 'حالة عدم مطابقة'], mwo: ['أمر صيانة مفتوح واحد', 'أمرَي صيانة مفتوحين', 'أوامر صيانة مفتوحة', 'أمر صيانة مفتوح'], ev: ['معرض واحد', 'معرضين', 'معارض', 'معرضًا'] };
  const dur = (mins) => M.durAr(mins);
  const daysTo = (d) => ERP.daysBetween(ERP.day(0), d);
  const minsSince = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 60000 : 0);
  const stl = (kind, s) => ((SA.catalog.status[kind] || {})[s] || [s])[0];
  const stc = (kind, s) => { const m = (SA.catalog.status[kind] || {})[s]; return { text: m ? m[0] : s, chip: m ? m[1] : 'neutral' }; };
  const L = (text, route) => ({ text, route });
  const uniq = (a) => Array.from(new Set(a));
  const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);
  const mean = (a) => (a.length ? sum(a) / a.length : 0);
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) * (x - m)))); };
  const uomOf = (it) => (it ? ERP.uom[it.uom] || it.uom || '' : '');
  const first2 = (name) => String(name || '').split(' ').slice(0, 2).join(' ');
  const monthName = (key) => ERP.monthLabel(key).split(' ')[0];
  const custShort = (cid) => { const c = ERP.customer(cid) || {}; return c.export ? M.COUNTRY[c.country] || c.city || '' : c.name || ''; };
  const act = (label, route) => (route && M.openable(route) ? { label, route } : null);
  const acts = (...a) => a.filter(Boolean);
  const me = () => SA.session.user || {};
  const arrow = (d) => (d == null ? '' : (d >= 0 ? 'زيادة ' : 'انخفاض ') + Math.abs(Math.round(d * 100)) + '%');
  const C = { success: '#147a3d', danger: '#c41218', warning: '#a85a00', band: '#aebbd0' };

  /* ═════════════ shared live analytics (on top of ERP.metrics) ═════════════ */
  M.cashForecast = function (days) {
    days = days || 30; const to = ERP.day(days); const cash = M.cash();
    const arDue = M.arOpen().filter((i) => i.dueDate <= to); const inAR = sum(arDue, (i) => i.due * (i.st === 'overdue' ? 0.5 : 0.85));
    const chq = get('cheques').filter((c) => ['received', 'under_collection'].indexOf(c.status) >= 0 && c.dueDate <= to); const inChq = sum(chq, (c) => c.amount * 0.95);
    const bills = get('bills').filter((b) => b.status !== 'paid' && b.dueDate <= to); const outAP = sum(bills, (b) => Math.max(0, b.total - (b.paid || 0)));
    const outPV = sum(get('vouchers').filter((v) => (v.status === 'approved' || v.status === 'pending_approval') && !(v.billIds || []).length), (v) => v.amount);
    const keys = ERP.monthKeys(4).slice(0, 3); const fixedM = mean(keys.map((k) => { const g = M.glAgg(k + '-01', k + '-31'); const dep = g['5303'] ? g['5303'].dr - g['5303'].cr : 0; return M.groupBal(g, '52') + M.groupBal(g, '6') - dep; }));
    const fixed = fixedM * days / 30; const projected = cash + inAR + inChq - outAP - outPV - fixed;
    return { days, cash, inAR, inChq, outAP, outPV, fixed, projected, arCount: arDue.length, chqCount: chq.length, billCount: bills.length };
  };
  M.expoStats = () => get('events').map((e) => { const leads = get('leads').filter((l) => l.eventId === e.id); const won = sum(leads.filter((l) => l.stage === 'won'), (l) => l.value); const pipe = sum(leads.filter((l) => ['won', 'lost'].indexOf(l.stage) < 0), (l) => l.value * (l.probability || 0.2)); const spent = e.spent || 0; return { e, leads: leads.length, won, pipe, spent, roi: spent ? (won + pipe) / spent : null }; });
  const lastActivity = () => { const m = {}; get('activities').forEach((a) => { const k = a.leadId || a.customerId; if (k && (!m[k] || a.at > m[k])) m[k] = a.at; }); return m; };
  M.staleLeads = function (minScore, days) { const lim = new Date(Date.now() - (days || 7) * 864e5).toISOString(); const la = lastActivity(); return M.leads().filter((x) => x.score >= (minScore || 70) && ['won', 'lost'].indexOf(x.stage) < 0 && (!la[x.id] || la[x.id] < lim)).map((x) => Object.assign({ lastAt: la[x.id] || null }, x)).sort((a, b) => b.value - a.value); };

  /* ═════════════ INSIGHT GENERATORS ═════════════ */
  const G = {};
  G.lineDown = () => get('lines').filter((l) => l.status === 'down').map((l) => {
    const wos = get('workOrders').filter((w) => w.lineId === l.id && ['on_hold', 'planned', 'released', 'in_progress'].indexOf(w.status) >= 0);
    const sos = uniq(wos.map((w) => w.soId).filter(Boolean)).map((id) => ERP.find('salesOrders', id)).filter(Boolean); const exp = sos.find((s) => s.export);
    const mwo = get('maintenanceOrders').find((m) => m.lineId === l.id && m.kind === 'breakdown' && ['done', 'cancelled'].indexOf(m.status) < 0);
    const ap = mwo ? get('approvals').find((a) => a.ref && a.ref.id === mwo.id && (a.status === 'pending' || a.status === 'delegated')) : null;
    const part = mwo && (mwo.parts || [])[0]; const partQty = part ? K.qty(part.itemId) : null;
    let t = l.name + ' (' + l.id + ') متوقف منذ ' + dur(minsSince(l.downSince)) + (l.downReason ? ' — ' + l.downReason : '') + '. يؤثر على ' + pl(wos.length, FN.wo) + (sos.length ? ' و' + pl(sos.length, FN.so) + ' بيع' : '') + (exp ? '، منها طلب تصدير ' + custShort(exp.customerId) + ' ' + exp.id : '') + '.';
    if (exp) { const sh = get('shipments').find((s) => (s.soIds || []).indexOf(exp.id) >= 0 && ['delivered', 'cleared', 'arrived'].indexOf(s.status) < 0); const rem = sum(wos.filter((w) => w.soId === exp.id), (w) => Math.max(0, w.qty - (w.qtyDone || 0))); const sh2 = l.capacityPerShift ? rem / l.capacityPerShift : 0; const margin = sh ? daysTo(sh.etd) : daysTo(exp.promisedDate);
      t += ' المتبقي للتصدير ' + num(rem) + ' ' + M.uom(l) + ' (≈ ' + Math.round(sh2 * 10) / 10 + ' وردية بعد الإصلاح)، و' + (sh ? 'إبحار الشحنة ' + sh.id + ' بعد ' + margin + ' يوم' : 'موعد التسليم بعد ' + margin + ' يوم') + ' — ' + (margin >= 4 ? 'الموعد آمن لو الإصلاح تم خلال 48 ساعة.' : 'الموعد في خطر حقيقي.'); }
    if (part && partQty === 0) t += ' رصيد قطعة الغيار المطلوبة (' + first2(ERP.itemName(part.itemId)) + ') صفر' + (ap ? ' وطلب الشراء العاجل ' + ap.id + ' ينتظر الاعتماد.' : '.');
    return { id: 'line-' + l.id, tone: 'danger', title: 'خط متوقف يهدد مواعيد التسليم', text: t, why: 'حالة الخط من شاشة الخطوط، وأوامر التشغيل المفتوحة على نفس الخط، وطلبات البيع المرتبطة بها، وموعد الشحنة. الوقت اللازم بعد الإصلاح محسوب من طاقة الخط (' + num(l.capacityPerShift) + ' ' + M.uom(l) + ' لكل وردية).', actions: acts(ap && act('قرار الشراء العاجل', 'approvals/' + ap.id), mwo && act('أمر الصيانة', 'care/maintenance/' + mwo.id), act('تفاصيل الخط', 'mfg/lines/' + l.id)) };
  });
  G.film = () => M.reorderPlan().filter((x) => x.item.kind === 'rm' && x.lead >= 20 && (x.avail <= x.rop || x.status === 'now')).map((x) => {
    const u = uomOf(x.item); let t = x.item.name + ' (استيراد — ' + x.lead + ' يوم توريد) رصيده ' + num(x.avail) + ' ' + u + ' تحت حد الطلب ' + num(x.rop) + ' ' + u + '، ويكفي ≈ ' + Math.round(x.onHandCover) + ' يوم فقط بمعدل الاستهلاك الحالي.';
    t += x.gap > 0 ? ' لو اتطلب النهارده هيوصل بعد ' + x.lead + ' يوم ← متوقع نقص ≈ ' + Math.round(x.gap) + ' يوم على خط اللامينيشن. اطلب فورًا أو اتفق مع المورد على شحنة جزئية جوًا.' : ' اطلب الآن للحفاظ على مخزون الأمان.';
    if (x.openPrq) t += ' طلب الشراء ' + x.openPrq.id + ' مفتوح ' + SA.fmt.rel(x.openPrq.createdAt) + ' ولم يتحول لأمر شراء بعد.';
    return { id: 'import-' + x.itemId, tone: x.gap > 0 ? 'danger' : 'warning', title: 'اطلب ' + first2(x.item.name) + ' الآن — مدة الاستيراد أطول من الرصيد', text: t,
      why: 'الاستهلاك اليومي ≈ ' + num(x.daily) + ' ' + u + ' = الأعلى بين (حد الطلب المعتمد ÷ (مدة التوريد + ' + M.SAFETY_DAYS + ' أيام أمان)) و(احتياج أوامر التشغيل المخططة ÷ 14 يوم). التغطية = (الرصيد المتاح − احتياج أوامر التشغيل ' + num(x.need) + ') ÷ الاستهلاك اليومي.',
      actions: acts(act(x.openPrq ? 'طلبات الشراء' : 'الطلب الذكي', x.openPrq ? 'scm/requisitions' : 'exec/insights'), act('كارت الصنف', 'scm/stock/' + x.itemId)) };
  });
  G.pm = () => { const today = ERP.day(0); const od = get('machines').filter((m) => m.nextPMAt && m.nextPMAt < today).map((m) => ({ m, d: ERP.daysBetween(m.nextPMAt) })).sort((a, b) => b.d - a.d); if (!od.length) return null;
    return { id: 'pm', tone: 'warning', title: pl(od.length, FN.mc) + ' تجاوزت موعد الصيانة الوقائية', text: od.slice(0, 3).map((x) => x.m.id + ' ' + x.m.name + ' (متأخرة ' + x.d + ' يوم' + (x.m.status === 'down' ? '، ومتوقفة الآن' : '') + ')').join('، ') + (od.length > 3 ? ' وغيرها' : '') + '. تأجيل الوقائية بيرفع احتمال الأعطال المفاجئة — خصوصًا للماكينات الحرجة (A).', why: 'مقارنة تاريخ الصيانة الوقائية القادمة لكل ماكينة في سجل الأصول بتاريخ اليوم.', actions: acts(act('الصيانة الوقائية', 'care/pm'), act('مخاطر الأعطال', 'exec/insights')) }; };
  G.lowMtbf = () => { const r = M.machineRisk().filter((x) => x.breakdowns >= 2 || x.machine.mtbfH < 300)[0]; if (!r) return null; const m = r.machine;
    return { id: 'mtbf-' + m.id, tone: 'warning', title: 'ماكينة تتكرر أعطالها: ' + m.id, text: m.name + ': ' + pl(r.breakdowns, ['عطل واحد', 'عطلين', 'أعطال', 'عطلًا']) + ' خلال 30 يوم وMTBF ' + m.mtbfH + ' ساعة (الأقل بين الماكينات الحرجة)' + (r.overdueDays ? '، والصيانة الوقائية متأخرة ' + r.overdueDays + ' يوم' : '') + '. التوصية: صيانة شاملة مجدولة وفحص طقم المسمار والبرميل وتأمين قطع الغيار الحرجة على الرف.', why: 'عدد بلاغات الأعطال لنفس الماكينة آخر 30 يوم + متوسط الوقت بين الأعطال (MTBF) من سجل الماكينات.', actions: acts(act('سجل الماكينة', 'care/assets/' + m.id), act('أوامر الصيانة', 'care/maintenance')) }; };
  G.payRisk = () => { const r = M.payRisk().filter((c) => c.level !== 'low'); if (!r.length) return null; const tot = sum(r, (c) => c.overdue); const top = r[0]; const b = r.filter((c) => c.bounced);
    return { id: 'payrisk', tone: top.level === 'high' ? 'danger' : 'warning', title: 'مخاطر تحصيل عند ' + pl(r.length, FN.cust), text: 'متأخرات ' + short(tot) + (M.scoped() ? ' (عملاؤك)' : '') + '. الأعلى خطورة: ' + top.name + ' (' + short(top.overdue) + (top.maxLate ? '، متأخر ' + top.maxLate + ' يوم' : '') + (top.bounced ? '، وشيك مرتد' : '') + ')' + (b.length && b[0] !== top ? '. شيك مرتد: ' + b[0].name + ' (' + short(b[0].bouncedAmt) + ')' : '') + '. التوصية: مراجعة الحد الائتماني قبل تأكيد أي طلبات آجلة جديدة لهم ومتابعة المندوب (بدون إيقاف تلقائي — بند 41).',
      why: 'درجة المخاطرة (0–100) = مدة التأخير (حتى 40) + حجم المتأخر نسبةً للحد الائتماني (حتى 25) + الشيكات المرتدة آخر 6 شهور (20 لكل شيك) + تجاوز الحد الائتماني (15).', actions: acts(act('أعمار الديون', 'fin/aging'), act('ملف العميل', 'crm/customers/' + top.customerId), act('مخاطر التحصيل', 'exec/insights')) }; };
  G.ncr = () => { const col = get('ncrs').filter((n) => n.status !== 'closed' && n.defectCode === 'D03'); if (!col.length) return null; const n = col[0]; const lim = new Date(Date.now() - 60 * 864e5).toISOString(); const tk = get('tickets').filter((t) => /لون/.test(t.title || '') && String(t.openedAt) >= lim);
    const capa = n.capaId ? get('capas').find((c) => c.id === n.capaId) : null; const done = capa ? capa.actions.filter((a) => a.done).length : 0; const qc = n.qcId ? ERP.find('qcInspections', n.qcId) : null; const p = qc ? (qc.params || []).find((x) => /اللون/.test(x.name)) : null; const nextWo = get('workOrders').find((w) => w.itemId === n.itemId && w.status === 'planned');
    return { id: 'ncr-colour', tone: 'warning', title: 'تكرار مشكلة اختلاف اللون في التجاليد', text: n.id + ' على ' + ERP.itemName(n.itemId) + (p && p.value ? ' (' + p.value + ' والحد ' + p.spec + ')' : '') + (tk.length ? ' + ' + pl(tk.length, ['شكوى عميل', 'شكويين', 'شكاوى', 'شكوى']) + ' عن اختلاف درجة اللون' : '') + '. ' + (capa ? capa.id + ' منفّذ منه ' + done + ' من ' + capa.actions.length + ' إجراءات. ' : '') + (nextWo ? 'أمر التشغيل القادم ' + nextWo.id + ' لنفس اللون محتاج فحص COA للصبغة وقياس ΔE أول الوردية.' : 'التوصية: فحص COA لكل دفعة صبغة قبل التشغيل.'),
      why: 'ربط عدم المطابقة المفتوحة بكود العيب D03 (اختلاف لون) مع شكاوى العملاء بنفس الموضوع آخر 60 يوم وأوامر التشغيل المخططة لنفس الصنف.', actions: acts(act('عدم المطابقة', 'mfg/ncr/' + n.id), act('الإجراءات التصحيحية', 'mfg/capa')) }; };
  G.staleLeads = () => { const l = M.staleLeads(70, 7); if (!l.length) return null;
    return { id: 'leads', tone: 'warning', title: pl(l.length, FN.lead) + ' بتقييم عالٍ بدون تواصل منذ أسبوع', text: 'قيمة الفرص ' + short(sum(l, (x) => x.value)) + ' — أبرزها ' + l.slice(0, 2).map((x) => x.company + ' (' + short(x.value) + '، ' + stl('lead', x.stage) + ')').join(' و') + '. الفرصة اللي ما بتتابعش خلال أسبوعين بتقل نسبة كسبها بوضوح — حدّد مكالمة أو زيارة النهارده.', why: 'عملاء محتملين تقييمهم ≥ 70 ومرحلتهم مفتوحة ولا توجد لهم مكالمة/زيارة مسجلة آخر 7 أيام' + (M.scoped() ? ' (ضمن عملائك فقط).' : '.'), actions: acts(act('العملاء المحتملون', 'crm/leads'), act('مسار الفرص', 'crm/pipeline')) }; };
  G.demandCap = () => { const rows = ['door', 'clad', 'foam'].map((f) => { const d = M.demand(f, true); const cap = M.capacity(f); if (!d.f || !cap) return null; const nx = d.f.out[1].v; return { f, nx, cap, load: cap.effective ? nx / cap.effective : 0 }; }).filter(Boolean); if (!rows.length) return null;
    const nextLbl = monthName(M.addMonths(M.curKey(), 1)); const max = rows.slice().sort((a, b) => b.load - a.load)[0];
    return { id: 'demand', tone: max.load > 0.85 ? 'warning' : 'info', title: 'توقع الطلب مقابل الطاقة — ' + nextLbl, text: rows.map((r) => M.FAM[r.f] + ' ≈ ' + num(r.nx) + ' ' + r.cap.uom + ' (' + pct(r.load) + ' من الطاقة الفعلية)').join('، ') + '. ' + (max.load > 0.85 ? M.FAM[max.f] + ' تقترب من الحد الأقصى — فكّر في وردية إضافية.' : 'الطاقة المتاحة تغطي الطلب المتوقع بهامش كبير — فرصة لتوسيع مبيعات التجار والتصدير لاستغلال الطاقة.') + (rows.some((r) => r.cap.down) ? ' (خط التجاليد متوقف حاليًا ويقلل الطاقة هذا الأسبوع.)' : ''),
      why: 'التوقع: اتجاه خطي على آخر 11 شهر مكتمل × موسمية مخففة من نفس الشهر السنة الماضية (كميات من الفواتير). الطاقة الفعلية = طاقة الخط لكل وردية × عدد الورديات × 26 يوم × OEE الحالي.', actions: acts(act('التنبؤات', 'exec/insights'), act('خطة الإنتاج', 'mfg/planning')) }; };
  G.cashFc = () => { if (!SA.canAny(['exec.dashboard.view', 'fin.dashboard.view', 'fin.banks.view'])) return null; const c = M.cashForecast(30); const inn = c.inAR + c.inChq, out = c.outAP + c.outPV + c.fixed;
    return { id: 'cash', tone: c.projected < 0 ? 'danger' : c.projected < c.cash * 0.9 ? 'warning' : 'success', title: 'توقع السيولة خلال 30 يوم', text: 'السيولة الحالية ' + short(c.cash) + '. متوقع تحصيل ' + short(inn) + ' (فواتير مستحقة + شيكات تحت التحصيل) مقابل مدفوعات ' + short(out) + ' (موردين وسندات ' + short(c.outAP + c.outPV) + ' + مصروفات ثابتة ' + short(c.fixed) + ') ← رصيد متوقع ≈ ' + short(c.projected) + '.',
      why: 'الفواتير المستحقة خلال 30 يوم بنسبة تحصيل 85% (والمتأخرة 50%) + الشيكات تحت التحصيل 95% − فواتير الموردين المستحقة − سندات الصرف المعتمدة − متوسط المصروفات الثابتة لآخر 3 شهور (بدون الإهلاك).', actions: acts(act('البنوك والخزائن', 'fin/banks'), act('أعمار الديون', 'fin/aging')) }; };
  G.expoWinner = () => { const s = M.expoStats().filter((x) => x.e.status === 'done' && x.roi != null); if (!s.length) return null; s.sort((a, b) => b.roi - a.roi); const b = s[0];
    return { id: 'expo-roi', tone: 'success', title: 'أفضل معرض عائدًا: ' + b.e.name, text: pl(b.leads, FN.lead) + ' بفرص مرجّحة ' + short(b.won + b.pipe) + ' مقابل تكلفة ' + short(b.spent) + ' (عائد متوقع ' + b.roi.toFixed(1) + '×). ' + s.slice(1).map((x) => x.e.city.split(' ')[0] + ' ' + x.roi.toFixed(1) + '×').join(' · ') + ' — التوصية: أولوية للمعارض الكبرى والخليج، ودمج المعارض المحلية الصغيرة مع زيارات المصنع.', why: 'العائد = (قيمة الفرص المكسوبة + قيمة الفرص المفتوحة × احتمال الكسب) ÷ مصروف المعرض الفعلي. العملاء المحتملون مربوطون بالمعرض عند التسجيل في الجناح.', actions: acts(act('العائد من المعارض', 'expo/roi'), act('المعرض', 'expo/events/' + b.e.id)) }; };
  G.expoUpcoming = () => { const u = get('events').filter((e) => ['planned', 'preparing'].indexOf(e.status) >= 0 && e.approvalStatus === 'pending').sort((a, b) => (a.from < b.from ? -1 : 1))[0]; if (!u) return null;
    return { id: 'expo-up-' + u.id, tone: 'warning', title: 'ميزانية معرض قادم بانتظار الاعتماد', text: u.name + ' بعد ' + daysTo(u.from) + ' يوم وميزانيته ' + short(u.budget) + ' (مصروف حتى الآن ' + short(u.spent) + ') بانتظار الاعتماد' + (u.approvalId ? ' ' + u.approvalId : '') + '. المستهدف ' + u.leadsTarget + ' عميل محتمل — التأخير بيأثر على حجز العينات والطباعة.', why: 'معارض حالتها «مخطط/قيد التجهيز» وحالة الميزانية «بانتظار الاعتماد».', actions: acts(u.approvalId && act('قرار الميزانية', 'approvals/' + u.approvalId), act('المعرض', 'expo/events/' + u.id)) }; };
  G.expoFollow = () => { const la = lastActivity(); const lim = new Date(Date.now() - 5 * 864e5).toISOString(); const l = M.leads().filter((x) => x.eventId && ['new', 'contacted'].indexOf(x.stage) >= 0 && (!la[x.id] || la[x.id] < lim)); if (!l.length) return null;
    return { id: 'expo-follow', tone: 'info', title: pl(l.length, FN.lead) + ' من المعارض محتاجين متابعة', text: 'مسجلين من الجناح وما اتحركوش من «جديد/تم التواصل» آخر 5 أيام بقيمة ' + short(sum(l, (x) => x.value)) + ' — أبرزهم ' + l.slice(0, 2).map((x) => x.company).join(' و') + '. التواصل خلال أول أسبوع بعد المعرض بيضاعف فرص التحويل.', why: 'عملاء محتملين مصدرهم معرض، بدون نشاط مسجل آخر 5 أيام.', actions: acts(act('العملاء المحتملون', 'crm/leads')) }; };
  G.stockoutFG = () => { const out = []; M.orders().filter((o) => ['pending_review', 'pending_approval', 'confirmed'].indexOf(o.status) >= 0).forEach((o) => o.lines.forEach((l) => { const it = ERP.item(l.itemId); if (!it || it.kind !== 'fg') return; const need = l.qty - (l.reservedQty || 0); if (need <= 0) return; const avail = K.available(l.itemId, K.FG); const wo = sum(get('workOrders').filter((w) => w.itemId === l.itemId && w.soId === o.id && ['completed', 'closed'].indexOf(w.status) < 0), (w) => w.qty - (w.qtyDone || 0)); if (avail + wo < need) out.push({ o, l, it, need, avail, short: need - avail - wo }); }));
    if (!out.length) return null; out.sort((a, b) => b.short * b.l.price - a.short * a.l.price);
    return { id: 'stockout', tone: 'warning', title: 'خطر نفاد منتج تام لطلبات قيد التأكيد', text: out.slice(0, 3).map((x) => x.o.id + ': ' + first2(x.it.name) + ' ' + (x.it.attrs.color || '') + ' (مطلوب ' + num(x.need) + '، المتاح ' + num(x.avail) + ')').join('، ') + '. هتحتاج أوامر تشغيل عند التأكيد — راجع الطاقة وموعد التسليم قبل الالتزام مع العميل.', why: 'لكل بند في طلب بانتظار المراجعة/الاعتماد/مؤكد: الكمية غير المحجوزة مقارنة بالمتاح في مخزن المنتج التام + أوامر التشغيل المفتوحة لنفس الطلب.', actions: acts(act('الطلب', 'crm/orders/' + out[0].o.id), act('خطة الإنتاج', 'mfg/planning')) }; };
  G.dealerPending = () => { const l = M.orders().filter((o) => o.status === 'pending_review'); if (!l.length) return null; const o = l[0]; const mins = minsSince(o.submittedAt || o.createdAt);
    return { id: 'dealer', tone: mins > 120 ? 'danger' : 'warning', title: 'طلب من بوابة التاجر بانتظار مكالمة التأكيد', text: o.id + ' من ' + ERP.customerName(o.customerId) + ' (' + short(F.totals(o).total) + ') منذ ' + dur(mins) + (o.call && o.call.preferredTime ? ' — الوقت المفضل للاتصال: ' + o.call.preferredTime : '') + '. ' + (l.length > 1 ? 'وفي ' + (l.length - 1) + ' طلبات أخرى. ' : '') + 'التأكيد السريع بيرفع رضا التجار ويقلل الإلغاء.', why: 'سياسة بند 48: كل طلب من البوابة يتراجع بمكالمة من المبيعات قبل التأكيد.', actions: acts(act('طلبات التجار', 'crm/dealer-orders'), act('فتح الطلب', 'crm/orders/' + o.id)) }; };
  G.qcPending = () => { const w = get('workOrders').filter((x) => x.status === 'qc_pending'); if (!w.length) return null; const x = w[0]; const it = ERP.item(x.itemId); const so = x.soId ? ERP.find('salesOrders', x.soId) : null;
    return { id: 'qc-' + x.id, tone: 'warning', title: 'إنتاج جاهز بانتظار الفحص النهائي', text: num(x.qtyDone) + ' ' + uomOf(it) + ' ' + ERP.itemName(x.itemId) + ' بانتظار الجودة منذ ' + dur(minsSince(x.actualEnd || x.createdAt)) + (so ? ' — طلب ' + ERP.customerName(so.customerId) + ' موعده بعد ' + daysTo(so.promisedDate) + ' يوم' : '') + '. الإنتاج مش هيدخل مخزن المنتج التام إلا بعد قرار الجودة.', why: 'أوامر تشغيل حالتها «بانتظار الجودة» مع موعد تسليم الطلب المرتبط.', actions: acts(x.qcId && act('سجّل الفحص', 'mfg/qc/' + x.qcId), act('أمر التشغيل', 'mfg/workorders/' + x.id)) }; };
  G.mrpShort = () => { const r = F.mrp().filter((x) => x.need > 0); if (!r.length) return null;
    return { id: 'mrp', tone: 'info', title: 'MRP: ' + pl(r.length, FN.item) + ' أقل من الاحتياج', text: 'أوامر التشغيل المخططة + حد الطلب أعلى من الرصيد وعلى الطلب — أهمها ' + r.slice(0, 3).map((x) => first2(ERP.itemName(x.itemId)) + ' (مقترح ' + num(x.suggestQty) + ' ' + uomOf(ERP.item(x.itemId)) + ')').join('، ') + '.', why: 'ERP.flow.mrp(): احتياج أوامر التشغيل المخططة من مكونات المنتج (BOM) مقارنة بالمتاح + الكميات على الطلب وحد الطلب لكل خامة.', actions: acts(act('تخطيط المواد MRP', 'mfg/mrp'), act('طلبات الشراء', 'scm/requisitions')) }; };
  G.spareUrgent = () => { const crit = []; get('maintenanceOrders').filter((m) => ['done', 'cancelled'].indexOf(m.status) < 0).forEach((m) => (m.parts || []).forEach((p) => { if (!p.issued && K.qty(p.itemId) < p.qty) crit.push({ m, p }); })); if (!crit.length) return null; const c = crit[0]; const prq = get('purchaseRequisitions').find((r) => r.itemId === c.p.itemId && ['open', 'approved'].indexOf(r.status) >= 0); const ap = get('approvals').find((a) => a.ref && a.ref.id === c.m.id && a.status === 'pending');
    return { id: 'spare-' + c.p.itemId, tone: 'danger', title: 'قطعة غيار حرجة رصيدها لا يكفي', text: ERP.itemName(c.p.itemId) + ': الرصيد ' + num(K.qty(c.p.itemId)) + ' والمطلوب ' + c.p.qty + ' لأمر الصيانة ' + c.m.id + ' (' + ((ERP.machine(c.m.machineId) || {}).name || c.m.machineId) + ')' + (prq ? '. طلب الشراء ' + prq.id + ' ' + stl('prq', prq.status) : '') + (ap ? ' والاعتماد ' + ap.id + ' بانتظار القرار' : '') + '. التوصية: رفع حد الطلب لقطع غيار الماكينات الحرجة (A) وتأهيل مورد بديل.', why: 'قطع الغيار المطلوبة في أوامر صيانة مفتوحة مقارنة برصيد مخزن قطع الغيار.', actions: acts(ap && act('قرار الشراء العاجل', 'approvals/' + ap.id), act('قطع الغيار', 'care/spares')) }; };
  G.supplierQ = () => { const n = get('ncrs').filter((x) => x.source === 'supplier' && x.status !== 'closed')[0]; if (!n) return null; const it = ERP.item(n.itemId) || {}; const sup = ERP.supplier(it.supplierId) || {};
    return { id: 'supq-' + n.id, tone: 'warning', title: 'جودة مورد تحتاج متابعة: ' + first2(sup.name), text: 'رفض ' + num(n.qty) + ' ' + uomOf(it) + ' ' + (it.name || '') + ' (' + (n.rootCause || '') + ') — ' + n.id + '. تقييم المورد ' + (sup.rating || '—') + ' من 5. التوصية: اشتراط شهادة COA مع كل شحنة وفحص رطوبة سريع عند الاستلام، وتأهيل مورد بديل.', why: 'حالات عدم مطابقة مصدرها المورد ولم تُغلق بعد + تقييم المورد في سجل الموردين.', actions: acts(act('عدم المطابقة', 'mfg/ncr/' + n.id), act('تقييم الموردين', 'scm/suppliers')) }; };
  G.chequesDue = () => { const to = ERP.day(7); const due = M.cheques().filter((c) => ['received', 'under_collection'].indexOf(c.status) >= 0 && c.dueDate <= to); const bnc = M.cheques().filter((c) => c.status === 'bounced'); if (!due.length && !bnc.length) return null;
    return { id: 'cheques', tone: bnc.length ? 'warning' : 'info', title: 'الشيكات: استحقاقات الأسبوع والمرتدات', text: (due.length ? pl(due.length, FN.chq) + ' مستحقة خلال 7 أيام بإجمالي ' + short(sum(due, (c) => c.amount)) + ' — جهّز إيداعها. ' : '') + (bnc.length ? 'شيكات مرتدة: ' + bnc.slice(0, 2).map((c) => ERP.customerName(c.customerId) + ' ' + short(c.amount)).join('، ') + ' — قيمتها رجعت لمديونية العميل.' : ''), why: 'الشيكات بحالة «مستلم/تحت التحصيل» وتاريخ استحقاقها خلال 7 أيام + الشيكات بحالة «مرتد».', actions: acts(act('الشيكات', 'fin/cheques')) }; };
  G.vouchers = () => { const pend = get('vouchers').filter((v) => v.status === 'pending_approval'); const appr = get('vouchers').filter((v) => v.status === 'approved'); if (!pend.length && !appr.length) return null;
    return { id: 'vouchers', tone: 'info', title: 'سندات صرف تنتظر إجراء', text: (pend.length ? pl(pend.length, ['سند صرف واحد', 'سندَي صرف', 'سندات صرف', 'سند صرف']) + ' بانتظار الاعتماد (' + short(sum(pend, (v) => v.amount)) + '). ' : '') + (appr.length ? 'معتمد بانتظار التنفيذ: ' + appr.map((v) => v.id + ' ' + short(v.amount)).join('، ') + '. ' : '') + 'الإنشاء والاعتماد والتنفيذ صلاحيات منفصلة (بند 42).', why: 'سندات الصرف بحالة «بانتظار الاعتماد» أو «معتمد — بانتظار التنفيذ».', actions: acts(act('سندات الصرف', 'fin/vouchers'), act('الاعتمادات', 'approvals')) }; };
  G.margin = () => { if (!ERP.ui.canProfit()) return null; const keys = ERP.monthKeys(4); const m = keys.slice(0, 3).map((k) => M.pnl(k + '-01', k + '-31')); const avg = mean(m.map((x) => x.gm)); const last = m[2];
    return { id: 'margin', tone: last.gm < avg - 0.02 ? 'warning' : 'success', title: 'هامش مجمل الربح — ' + monthName(keys[2]), text: 'الهامش ' + pct1(last.gm) + ' مقابل متوسط ' + pct1(avg) + ' لآخر 3 شهور. ' + (last.gm < avg - 0.02 ? 'انخفاض ملحوظ — راجع الخصومات وأسعار الخامات.' : 'مستقر في حدود المعتاد.'), why: 'من القيود: (الإيرادات − تكلفة المبيعات) ÷ الإيرادات لكل شهر مكتمل. يظهر فقط لمن يملك صلاحية الأرباح.', actions: acts(act('القوائم المالية', 'fin/statements')) }; };
  G.complaints = () => { const open = get('tickets').filter((t) => ['resolved', 'closed'].indexOf(t.status) < 0 && M.custOK(t.customerId)); if (!open.length) return null; const brk = open.filter((t) => minsSince(t.openedAt) / 60 > (t.slaHours || 48)); const hi = open.filter((t) => t.priority === 'high'); const top = hi[0] || open[0];
    return { id: 'tickets', tone: brk.length ? 'danger' : hi.length ? 'warning' : 'info', title: pl(open.length, FN.tkt) + (hi.length ? '، منها ' + hi.length + ' عالية الأولوية' : ''), text: 'الأهم: ' + top.id + ' — ' + top.title + ' (' + ERP.customerName(top.customerId) + '، مفتوحة منذ ' + Math.round(minsSince(top.openedAt) / 60) + ' ساعة من ' + top.slaHours + ' ساعة SLA)' + (top.ncrId ? ' ومرتبطة بـ ' + top.ncrId : '') + '.' + (brk.length ? ' ' + brk.length + ' تجاوزت زمن الخدمة.' : ''), why: 'تذاكر العملاء غير المحلولة مقارنة بزمن الخدمة (SLA) لكل تذكرة.', actions: acts(act('التذكرة', 'care/tickets/' + top.id), act('كل التذاكر', 'care/tickets')) }; };

  const AREAS = {
    exec: ['lineDown', 'film', 'cashFc', 'payRisk', 'stockoutFG', 'ncr', 'demandCap', 'pm', 'expoWinner'],
    crm: ['dealerPending', 'stockoutFG', 'payRisk', 'staleLeads', 'lineDown', 'expoFollow', 'demandCap'],
    mfg: ['lineDown', 'qcPending', 'ncr', 'mrpShort', 'pm', 'demandCap'],
    scm: ['film', 'spareUrgent', 'mrpShort', 'stockoutFG', 'supplierQ'],
    fin: ['cashFc', 'payRisk', 'chequesDue', 'vouchers', 'margin'],
    care: ['lineDown', 'spareUrgent', 'lowMtbf', 'pm', 'complaints'],
    expo: ['expoWinner', 'expoUpcoming', 'expoFollow']
  };
  const TONE = { danger: 0, warning: 1, info: 2, success: 3 };
  function insights(area) {
    const keys = area === 'all' ? uniq([].concat.apply([], Object.keys(AREAS).map((k) => AREAS[k]))) : AREAS[area] || []; const out = [];
    keys.forEach((k) => { try { const r = G[k] ? G[k]() : null; (Array.isArray(r) ? r : [r]).forEach((x) => { if (x && out.every((y) => y.id !== x.id)) out.push(x); }); } catch (e) { console.error('[ERP.ai] insight failed: ' + k, e); } });
    return out.map((x, i) => ({ x, i })).sort((a, b) => (TONE[a.x.tone] - TONE[b.x.tone]) || a.i - b.i).map((o) => o.x);
  }
  function brief() {
    const parts = [];
    try {
      get('lines').filter((l) => l.status === 'down').forEach((l) => { const sos = uniq(get('workOrders').filter((w) => w.lineId === l.id && ['on_hold', 'planned', 'released', 'in_progress'].indexOf(w.status) >= 0).map((w) => w.soId).filter(Boolean)).map((id) => ERP.find('salesOrders', id)).filter(Boolean); const exp = sos.find((s) => s.export);
        parts.push(l.name.replace('خط بثق ', 'خط ') + ' متوقف منذ ' + dur(minsSince(l.downSince)) + (exp ? ' ويؤثر على طلب تصدير ' + custShort(exp.customerId) + ' (' + exp.id + ')' : '')); });
      const ap = M.myApprovals(); if (ap.length) parts.push(pl(ap.length, ['طلب اعتماد واحد ينتظر', 'طلبا اعتماد ينتظران', 'طلبات اعتماد تنتظر', 'طلب اعتماد ينتظر']) + ' قرارك');
      const od = sum(M.arOverdue(), (i) => i.due); if (od > 0) parts.push('متأخرات العملاء ' + short(od));
      const imp = M.reorderPlan().find((x) => x.item.kind === 'rm' && x.lead >= 20 && x.gap > 0); if (imp) parts.push(first2(imp.item.name) + ' يكفي ' + Math.round(imp.onHandCover) + ' يوم والاستيراد ' + imp.lead + ' يوم');
      const d = M.delta(M.salesMTD(), M.salesPrevMTD()); if (parts.length < 4) parts.push('مبيعات الشهر ' + short(M.salesMTD()) + (d != null ? ' (' + arrow(d) + ' عن نفس الفترة)' : ''));
    } catch (e) { console.error('[ERP.ai.brief]', e); }
    return parts.length ? parts.slice(0, 4).join(' · ') + '.' : 'كل المؤشرات في حدودها الطبيعية النهارده.';
  }

  /* ═════════════ INTENT ENGINE («اسأل نظامك») ═════════════ */
  const NEED = {
    sales: ['exec.dashboard.view', 'crm.dashboard.view', 'crm.reports.view', 'crm.orders.view', 'fin.dashboard.view', 'fin.invoices.view'],
    ar: ['exec.dashboard.view', 'fin.aging.view', 'fin.invoices.view', 'fin.dashboard.view', 'crm.customers.view'],
    cheques: ['exec.dashboard.view', 'fin.cheques.view', 'fin.dashboard.view'],
    mfg: ['exec.dashboard.view', 'mfg.dashboard.view', 'mfg.lines.view', 'mfg.shopfloor.view', 'mfg.workorders.view'],
    wo: ['exec.dashboard.view', 'mfg.workorders.view', 'mfg.dashboard.view', 'mfg.planning.view'],
    stock: ['exec.dashboard.view', 'scm.stock.view', 'scm.dashboard.view', 'mfg.mrp.view', 'scm.requisitions.view'],
    orders: ['exec.dashboard.view', 'crm.orders.view', 'crm.dashboard.view'],
    export: ['exec.dashboard.view', 'scm.shipments.view', 'crm.orders.view'],
    reps: ['exec.dashboard.view', 'crm.targets.view', 'crm.reports.view'],
    expo: ['exec.dashboard.view', 'expo.events.view', 'expo.roi.view'],
    care: ['exec.dashboard.view', 'care.tickets.view', 'care.dashboard.view'],
    mnt: ['exec.dashboard.view', 'care.maintenance.view', 'care.dashboard.view', 'mfg.lines.view', 'care.assets.view'],
    cash: ['exec.dashboard.view', 'fin.banks.view', 'fin.dashboard.view'],
    prq: ['exec.dashboard.view', 'scm.requisitions.view', 'scm.requisitions.create', 'scm.stock.view', 'mfg.mrp.view'],
    forecast: ['exec.dashboard.view', 'exec.insights.view', 'crm.reports.view'],
    quality: ['exec.dashboard.view', 'mfg.quality.view', 'mfg.qc.view', 'mfg.ncr.view'],
    cust: ['exec.dashboard.view', 'crm.customers.view', 'fin.invoices.view', 'fin.aging.view']
  };
  const INT = []; const byId = {};
  function intent(o) { o.req = N(o.req || []); o.boost = (o.boost || []).map((g) => [N(g[0]), g[1]]); INT.push(o); byId[o.id] = o; }
  function scoreOf(it, n, q) { if (it.match) return it.match(n, q) || 0; if (!has(n, it.req)) return 0; let s = it.w || 3; it.boost.forEach((g) => { if (has(n, g[0])) s += g[1]; }); return s; }
  const allowed = (it) => !it || !it.need || !it.need.length || it.need.some((k) => SA.can(k));
  const scopeNote = () => (M.scoped() ? ' (عملاؤك فقط)' : '');
  const SL = { dealer: 'تاجر', contractor: 'مقاول', direct: 'مباشر', export: 'تصدير', project: 'مشروع' };

  /* answers — every answer is plain serialisable data {text, table:{cols, rows, num}, chart:{type…}, links, chips, action, tone, note} */
  function ansHelp() {
    return { text: 'أنا مساعد نظام المصرية الألمانية (محاكاة). بقرأ بيانات النظام الحالية وبحدود صلاحياتك' + (M.scoped() ? ' (عملاؤك فقط)' : '') + '، وأقدر أجاوب عن:\n• المبيعات والمقارنات وأكبر العملاء وأداء المندوبين\n• المتأخرات والشيكات والتحصيل والكاش\n• خطوط الإنتاج والـOEE وأوامر التشغيل والجودة والأعطال\n• الخامات اللي هتخلص والطلب الذكي — وأقدر أجهّز طلب شراء بعد تأكيدك\n• حالة أي طلب (اكتب رقمه) والتصدير والشكاوى والمعارض والاعتمادات والتوقعات.', chips: suggestions(8) };
  }
  function ansSales(n) {
    const per = has(n, N(['النهارده', 'انهارده', 'اليوم', 'النهار ده'])) ? 'day' : has(n, N(['الاسبوع', 'اسبوع'])) ? 'week' : has(n, N(['السنه', 'سنه', 'سنوي', 'ytd', 'من اول السنه'])) ? 'year' : has(n, N(['الشهر اللي فات', 'الشهر الماضي', 'الشهر السابق', 'الشهر الفايت'])) ? 'last' : 'month';
    const inv = M.invoices(); const today = ERP.day(0); const byDate = {}; inv.forEach((i) => { byDate[i.issueDate] = (byDate[i.issueDate] || 0) + M.net(i); });
    const links = [{ label: 'تقرير المبيعات الشهرية', route: 'exec/reports?r=sales-month' }, { label: 'فواتير البيع', route: 'fin/invoices' }];
    if (per === 'day' || per === 'week') {
      const days = []; for (let d = 6; d >= 0; d--) days.push(ERP.day(-d)); const vals = days.map((d) => Math.round(byDate[d] || 0)); const tot = sum(vals);
      const cnt = inv.filter((i) => i.issueDate >= days[0]).length; const so = M.orders().filter((o) => String(o.createdAt).slice(0, 10) === today);
      const lastInv = inv.filter((i) => i.issueDate <= today).sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))[0];
      const text = per === 'day' ? 'مبيعات النهارده' + scopeNote() + ': ' + short(byDate[today] || 0) + ' صافي. ' + (byDate[today] ? '' : 'لسه مفيش فواتير اتصدرت النهارده' + (lastInv ? ' — آخر فاتورة ' + lastInv.id + ' يوم ' + fm.date(lastInv.issueDate) + ' بقيمة ' + short(M.net(lastInv)) : '') + '. ') + 'أوامر بيع جديدة النهارده: ' + so.length + (so.length ? ' بقيمة ' + short(sum(so, M.soNet)) : '') + '. آخر 7 أيام: ' + short(tot) + '.'
        : 'مبيعات آخر 7 أيام' + scopeNote() + ': ' + short(tot) + ' صافي من ' + pl(cnt, FN.inv) + '، بمتوسط يومي ' + short(tot / 7) + '. أعلى يوم ' + fm.date(days[vals.indexOf(Math.max.apply(null, vals))]) + ' (' + short(Math.max.apply(null, vals)) + ').';
      return { text, chart: { type: 'columns', title: 'صافي المبيعات اليومي — آخر 7 أيام', labels: days.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)), series: [{ name: 'صافي المبيعات', values: vals }] }, links, scoped: M.scoped() };
    }
    const sm = M.salesByMonth(12); const ck = M.curKey();
    if (per === 'year') { const y = String(new Date().getFullYear()); const ys = sm.filter((x) => x.key.indexOf(y) === 0); const tot = sum(ys, (x) => x.value); const full = ys.slice(0, -1); const best = full.slice().sort((a, b) => b.value - a.value)[0];
      return { text: 'مبيعات ' + y + ' حتى اليوم' + scopeNote() + ': ' + short(tot) + ' صافي على ' + ys.length + ' شهور، بمتوسط ' + short(full.length ? sum(full, (x) => x.value) / full.length : tot) + ' للشهر المكتمل.' + (best ? ' أفضل شهر ' + monthName(best.key) + ' (' + short(best.value) + ').' : ''), chart: { type: 'columns', title: 'صافي المبيعات الشهري — ' + y, labels: ys.map((x) => monthName(x.key)), series: [{ name: 'صافي المبيعات', values: ys.map((x) => x.value) }] }, links, scoped: M.scoped() }; }
    if (per === 'last') { const a = sm[sm.length - 2], b = sm[sm.length - 3]; const cntA = inv.filter((i) => String(i.issueDate).slice(0, 7) === a.key).length;
      return { text: 'مبيعات ' + monthName(a.key) + scopeNote() + ': ' + short(a.value) + ' صافي من ' + pl(cntA, FN.inv) + ' — ' + arrow(M.delta(a.value, b.value)) + ' عن ' + monthName(b.key) + ' (' + short(b.value) + ').', chart: { type: 'columns', title: 'آخر 6 شهور', labels: sm.slice(-7, -1).map((x) => monthName(x.key)), series: [{ name: 'صافي المبيعات', values: sm.slice(-7, -1).map((x) => x.value) }] }, links, scoped: M.scoped() }; }
    const mtd = M.salesMTD(), prev = M.salesPrevMTD(); const dom = new Date().getDate(); const cnt = inv.filter((i) => String(i.issueDate).slice(0, 7) === ck).length;
    return { text: 'مبيعات ' + monthName(ck) + ' حتى اليوم' + scopeNote() + ': ' + short(mtd) + ' صافي من ' + pl(cnt, FN.inv) + (prev ? ' — ' + arrow(M.delta(mtd, prev)) + ' عن نفس الفترة من ' + monthName(M.prevKey()) + ' (' + short(prev) + ')' : '') + '. المتوسط اليومي ' + short(mtd / dom) + '، والطلبات المفتوحة ' + short(sum(M.openOrders(), M.soNet)) + '.',
      chart: { type: 'columns', title: 'آخر 12 شهر (الشهر الحالي حتى اليوم)', stacked: true, legend: true, labels: sm.map((x) => monthName(x.key)), series: [{ name: 'شهور مكتملة', values: sm.map((x, i) => (i < sm.length - 1 ? x.value : 0)) }, { name: 'الشهر الحالي', values: sm.map((x, i) => (i === sm.length - 1 ? x.value : 0)), color: ERP.palette[3] }] }, links, scoped: M.scoped() };
  }
  function ansCompare() {
    const inv = M.invoices(); const byDate = {}; inv.forEach((i) => { byDate[i.issueDate] = (byDate[i.issueDate] || 0) + M.net(i); });
    const ck = M.curKey(), pk = M.prevKey(), p2 = M.addMonths(pk, -1); const dom = new Date().getDate(); const daysPrev = new Date(Number(pk.slice(0, 4)), Number(pk.slice(5, 7)), 0).getDate(); const daysCur = new Date(Number(ck.slice(0, 4)), Number(ck.slice(5, 7)), 0).getDate();
    const cum = (key, upto) => { let acc = 0; const out = []; for (let d = 1; d <= 31; d++) { if (d > upto) { out.push(null); continue; } acc += byDate[key + '-' + String(d).padStart(2, '0')] || 0; out.push(Math.round(acc)); } return out; };
    const mtd = M.salesMTD(), prev = M.salesPrevMTD(); const sm = M.salesByMonth(3); const prevFull = sm[1].value, prev2 = sm[0].value;
    const cM = M.collectedBetween(ck + '-01', ERP.day(0)), cP = M.collectedBetween(pk + '-01', M.sameDayPrev()); const proj = mtd / Math.max(1, dom) * daysCur;
    return { text: 'حتى يوم ' + dom + scopeNote() + ': ' + monthName(ck) + ' ' + short(mtd) + ' مقابل ' + short(prev) + ' في نفس الفترة من ' + monthName(pk) + (prev ? ' (' + arrow(M.delta(mtd, prev)) + ')' : '') + '. ' + monthName(pk) + ' كاملًا أغلق على ' + short(prevFull) + (prev2 ? ' (' + arrow(M.delta(prevFull, prev2)) + ' عن ' + monthName(p2) + ')' : '') + '. التحصيل ' + short(cM) + ' مقابل ' + short(cP) + '. بالمعدل الحالي ' + monthName(ck) + ' هيقفل تقديريًا على ≈ ' + short(proj) + ' (أول الشهر عادة أبطأ).',
      chart: { type: 'line', title: 'المبيعات التراكمية يومًا بيوم', labels: Array.from({ length: 31 }, (_, i) => String(i + 1)), series: [{ name: monthName(ck) + ' (حتى اليوم)', values: cum(ck, dom), color: ERP.palette[0] }, { name: monthName(pk), values: cum(pk, daysPrev), color: ERP.palette[2], dashed: true }] }, links: [{ label: 'تقرير المبيعات الشهرية', route: 'exec/reports?r=sales-month' }], scoped: M.scoped() };
  }
  function ansCollections() {
    const ck = M.curKey(), pk = M.prevKey(); const cM = M.collectedBetween(ck + '-01', ERP.day(0)), cP = M.collectedBetween(pk + '-01', M.sameDayPrev()); const rv = M.receipts().filter((r) => String(r.date).slice(0, 7) === ck);
    const by = {}; rv.forEach((r) => { by[r.method] = (by[r.method] || 0) + r.amount; }); const ML = { transfer: 'تحويل بنكي', cheque: 'شيكات', cash: 'نقدي', card: 'بطاقة' };
    return { text: 'التحصيلات منذ بداية ' + monthName(ck) + scopeNote() + ': ' + short(cM) + ' من ' + pl(rv.length, ['سند قبض واحد', 'سندَي قبض', 'سندات قبض', 'سند قبض']) + (cP ? ' — ' + arrow(M.delta(cM, cP)) + ' عن نفس الفترة من ' + monthName(pk) + ' (' + short(cP) + ')' : '') + '. المتأخرات المفتوحة ' + short(sum(M.arOverdue(), (i) => i.due)) + '.', chart: Object.keys(by).length ? { type: 'donut', title: 'حسب طريقة السداد', data: Object.keys(by).map((k, i) => ({ label: ML[k] || k, value: Math.round(by[k]), color: ERP.palette[i] })), center: short(cM).replace(' ج.م', ''), sub: 'ج.م' } : null, links: [{ label: 'سندات القبض', route: 'fin/receipts' }, { label: 'أعمار الديون', route: 'fin/aging' }], scoped: M.scoped() };
  }
  function ansTopCustomers(n) {
    const month = has(n, N(['الشهر'])); const from = month ? M.curKey() + '-01' : ERP.day(-365); const by = {}; M.invoices().filter((i) => i.issueDate >= from).forEach((i) => { by[i.customerId] = (by[i.customerId] || 0) + M.net(i); });
    const tot = sum(Object.keys(by), (k) => by[k]); const rows = Object.keys(by).map((k) => ({ id: k, v: by[k], c: ERP.customer(k) || {} })).sort((a, b) => b.v - a.v); if (!rows.length) return { text: 'مفيش مبيعات مسجلة في الفترة دي' + scopeNote() + '.' };
    const top5 = rows.slice(0, 5); const share = tot ? sum(top5, (r) => r.v) / tot : 0;
    return { text: 'أكبر العملاء ' + (month ? 'هذا الشهر' : 'آخر 12 شهر') + scopeNote() + ': ' + top5.slice(0, 3).map((r) => r.c.name + ' (' + short(r.v) + ')').join('، ') + '. أكبر 5 عملاء يمثلوا ' + pct(share) + ' من المبيعات' + (share > 0.6 ? ' — تركّز مرتفع، يُفضّل توسيع قاعدة التجار.' : '.'),
      chart: { type: 'bars', data: top5.map((r) => ({ label: r.c.name, sub: [r.c.region, SL[r.c.segment]].filter(Boolean).join(' · '), value: Math.round(r.v), route: 'crm/customers/' + r.id })) },
      table: { cols: ['العميل', 'الشريحة', 'المنطقة', 'صافي المبيعات', 'الحصة'], num: [3, 4], rows: rows.slice(0, 10).map((r) => [L(r.c.name, 'crm/customers/' + r.id), SL[r.c.segment] || '—', r.c.region || '—', money(r.v), pct1(tot ? r.v / tot : 0)]) }, links: [{ label: 'تقرير المبيعات حسب العميل', route: 'exec/reports?r=sales-customer' }], scoped: M.scoped() };
  }
  function ansOverdue() {
    const rows = M.overdueByCustomer(); const bnc = M.cheques().filter((c) => c.status === 'bounced');
    if (!rows.length) return { tone: 'success', text: 'مفيش عملاء متأخرين في السداد حاليًا' + scopeNote() + '. ' + (bnc.length ? 'لكن في ' + pl(bnc.length, FN.chq) + ' مرتدة.' : ''), links: [{ label: 'أعمار الديون', route: 'fin/aging' }] };
    const tot = sum(rows, (r) => r.amount);
    return { tone: 'warning', text: pl(rows.length, FN.cust) + ' متأخرين في السداد بإجمالي ' + short(tot) + scopeNote() + '. الأكبر: ' + rows.slice(0, 3).map((r) => r.name + ' ' + short(r.amount) + ' (أقدم تأخير ' + r.maxLate + ' يوم)').join('، ') + '.' + (bnc.length ? ' وفيه ' + pl(bnc.length, FN.chq) + ' مرتدة: ' + bnc.slice(0, 2).map((c) => ERP.customerName(c.customerId) + ' ' + short(c.amount)).join('، ') + '.' : '') + ' التوصية: متابعة المندوب ومراجعة الحد الائتماني قبل أي طلب آجل جديد.',
      table: { cols: ['العميل', 'المتأخر', 'الفواتير', 'أقدم تأخير (يوم)'], num: [1, 2, 3], rows: rows.slice(0, 12).map((r) => [L(r.name, 'crm/customers/' + r.customerId), money(r.amount), r.count, r.maxLate]) }, links: [{ label: 'أعمار الديون', route: 'fin/aging' }, { label: 'تقرير أعمار الديون', route: 'exec/reports?r=ar-aging' }], scoped: M.scoped() };
  }
  function ansCheques() {
    const today = ERP.day(0), to = ERP.day(30); const open = M.cheques().filter((c) => ['received', 'under_collection'].indexOf(c.status) >= 0).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)); const within = open.filter((c) => c.dueDate <= to); const past = open.filter((c) => c.dueDate < today); const bnc = M.cheques().filter((c) => c.status === 'bounced');
    return { tone: bnc.length ? 'warning' : null, text: 'الشيكات تحت التحصيل: ' + pl(open.length, FN.chq) + ' بإجمالي ' + short(sum(open, (c) => c.amount)) + '، منها ' + within.length + ' مستحقة خلال 30 يوم (' + short(sum(within, (c) => c.amount)) + ')' + (past.length ? ' و' + past.length + ' تاريخ استحقاقها فات ولسه ما اتحصلتش' : '') + '. ' + (bnc.length ? 'شيكات مرتدة: ' + bnc.map((c) => ERP.customerName(c.customerId) + ' ' + short(c.amount)).join('، ') + '.' : 'مفيش شيكات مرتدة.'),
      table: { cols: ['رقم الشيك', 'العميل', 'البنك', 'المبلغ', 'الاستحقاق', 'الحالة'], num: [3], rows: open.concat(bnc).slice(0, 12).map((c) => [c.no, ERP.customerName(c.customerId), c.bank, money(c.amount), fm.date(c.dueDate), stc('cheque', c.status)]) }, links: [{ label: 'الشيكات', route: 'fin/cheques' }] };
  }
  function ansLines() {
    const lines = get('lines'); const down = lines.filter((l) => l.status === 'down'); const pl0 = M.prodLast(); const sorted = lines.slice().sort((a, b) => M.oee(b) - M.oee(a));
    const text = M.running() + ' من ' + lines.length + ' خطوط تعمل الآن. ' + down.map((l) => l.name + ' متوقف منذ ' + dur(minsSince(l.downSince)) + (l.downReason ? ' (' + l.downReason + ')' : '')).join('. ') + (down.length ? '. ' : '') + 'OEE المصنع ' + pct(M.plantOEE()) + ' (المرجع العالمي 85%) — الأعلى ' + sorted[0].name + ' ' + pct(M.oee(sorted[0])) + ' والأقل ' + sorted[sorted.length - 1].name + ' ' + pct(M.oee(sorted[sorted.length - 1])) + '.' + (pl0 ? ' إنتاج آخر يوم (' + fm.date(pl0.date) + '): ' + num(pl0.good) + ' وحدة جيدة بنسبة هالك ' + pct1(pl0.scrap / Math.max(1, pl0.good + pl0.scrap)) + '.' : '');
    return { tone: down.length ? 'danger' : null, text, chart: { type: 'gauges', data: lines.map((l) => ({ label: l.id + ' OEE', value: M.oee(l) })) },
      table: { cols: ['الخط', 'الحالة', 'أمر التشغيل الحالي', 'التقدم', 'OEE'], num: [3, 4], rows: lines.map((l) => { const w = l.currentWoId ? ERP.find('workOrders', l.currentWoId) : null; return [L(l.id + ' — ' + l.name, 'mfg/lines/' + l.id), stc('line', l.status), w ? L(w.id, 'mfg/workorders/' + w.id) : '—', w ? num(w.qtyDone) + '/' + num(w.qty) : '—', pct(M.oee(l))]; }) }, links: [{ label: 'خطوط الإنتاج', route: 'mfg/lines' }, { label: 'أرضية المصنع', route: 'mfg/shopfloor' }] };
  }
  function ansLateWO() {
    const today = ERP.day(0); const wos = get('workOrders').filter((w) => ['completed', 'closed'].indexOf(w.status) < 0 && (w.status === 'on_hold' || (w.plannedEnd && w.plannedEnd < today) || (w.dueDate && w.dueDate < today))); const qc = get('workOrders').filter((w) => w.status === 'qc_pending'); const run = get('workOrders').filter((w) => w.status === 'in_progress');
    const text = (wos.length ? pl(wos.length, FN.wo) + ' متأخرة أو متوقفة: ' + wos.slice(0, 3).map((w) => w.id + ' ' + first2(ERP.itemName(w.itemId)) + ' — ' + stl('wo', w.status) + (w.holdReason ? ' (' + w.holdReason + ')' : '') + ' ' + num(w.qtyDone) + '/' + num(w.qty)).join('؛ ') + '.' : 'مفيش أوامر تشغيل متأخرة عن خطتها حاليًا.') + ' قيد التشغيل: ' + run.length + '، وبانتظار الجودة: ' + qc.length + '.';
    const rows = wos.concat(qc).slice(0, 12);
    return { tone: wos.length ? 'warning' : 'success', text, table: rows.length ? { cols: ['أمر التشغيل', 'الصنف', 'الخط', 'الحالة', 'المنجز', 'نهاية الخطة', 'الطلب'], num: [4], rows: rows.map((w) => [L(w.id, 'mfg/workorders/' + w.id), first2(ERP.itemName(w.itemId)) + ' ' + ((ERP.item(w.itemId) || {}).attrs || {}).color, w.lineId, stc('wo', w.status), num(w.qtyDone) + '/' + num(w.qty), fm.date(w.plannedEnd), w.soId ? L(w.soId, 'crm/orders/' + w.soId) : 'للمخزون']) } : null, links: [{ label: 'أوامر التشغيل', route: 'mfg/workorders' }] };
  }
  function ansLateOrders() {
    const rows = M.lateOrders(); const today = ERP.day(0);
    if (!rows.length) return { tone: 'success', text: 'مفيش طلبات متأخرة عن موعد التسليم' + scopeNote() + '.', links: [{ label: 'أوامر البيع', route: 'crm/orders' }] };
    return { tone: 'warning', text: pl(rows.length, FN.so) + ' متأخرة عن موعد التسليم' + scopeNote() + ': ' + rows.slice(0, 3).map((o) => o.id + ' ' + ERP.customerName(o.customerId) + ' (' + ERP.daysBetween(o.promisedDate, today) + ' يوم، ' + stl('so', o.status) + ')').join('، ') + '. التوصية: تواصل استباقي مع العميل بموعد محدث.',
      table: { cols: ['الطلب', 'العميل', 'الموعد', 'التأخير (يوم)', 'الحالة'], num: [3], rows: rows.map((o) => [L(o.id, 'crm/orders/' + o.id), ERP.customerName(o.customerId), fm.date(o.promisedDate), ERP.daysBetween(o.promisedDate, today), stc('so', o.status)]) }, links: [{ label: 'أوامر البيع', route: 'crm/orders' }], scoped: M.scoped() };
  }
  function ansMaterials(n) {
    if (has(n, N(['قيمه المخزون', 'قيمه', 'تكلفه المخزون']))) {
      if (!ERP.ui.canCost()) return { tone: 'warning', denied: true, text: 'عذرًا، قيمة المخزون والتكاليف بيانات سرية وتظهر فقط لمن يملك صلاحية التكاليف (data.cost.view). أقدر أقولك الكميات والأصناف اللي قربت تخلص بدل كده.', chips: ['الخامات اللي هتخلص'] };
      const by = {}; get('stock').forEach((r) => { const it = ERP.item(r.itemId); by[r.whId] = (by[r.whId] || 0) + r.qty * ((it && it.stdCost) || 0); }); const tot = sum(Object.keys(by), (k) => by[k]);
      return { text: 'قيمة المخزون بالتكلفة المعيارية: ' + short(tot) + ' — الأكبر ' + Object.keys(by).sort((a, b) => by[b] - by[a]).slice(0, 2).map((k) => ERP.whName(k) + ' ' + short(by[k])).join(' و') + '.', chart: { type: 'bars', data: Object.keys(by).sort((a, b) => by[b] - by[a]).map((k) => ({ label: ERP.whName(k), value: Math.round(by[k]) })) }, links: [{ label: 'تقييم المخزون', route: 'exec/reports?r=inv-wh' }] };
    }
    const plan = M.reorderPlan().slice(0, 10); if (!plan.length) return { tone: 'success', text: 'كل الخامات والإكسسوارات وقطع الغيار فوق حد الطلب وتغطي مدة التوريد.', links: [{ label: 'أرصدة المخزون', route: 'scm/stock' }] };
    const now = plan.filter((x) => x.status === 'now');
    return { tone: now.length ? 'danger' : 'warning', text: pl(plan.length, FN.item) + ' محتاجة طلب شراء قريب' + (now.length ? '، منها ' + now.length + ' لازم تتطلب النهارده' : '') + ': ' + plan.slice(0, 3).map((x) => first2(x.item.name) + ' (يكفي ' + Math.round(x.onHandCover) + ' يوم والتوريد ' + x.lead + ' يوم' + (x.openPrq ? '، عليه ' + x.openPrq.id : '') + ')').join('، ') + '.',
      table: { cols: ['الصنف', 'المتاح', 'حد الطلب', 'يكفي (يوم)', 'التوريد (يوم)', 'اطلب قبل', 'طلب مفتوح'], num: [1, 2, 3, 4], rows: plan.map((x) => [L(x.item.name, 'scm/stock/' + x.itemId), num(x.avail) + ' ' + uomOf(x.item), num(x.rop), Math.round(x.onHandCover), x.lead, x.status === 'now' ? { text: 'اليوم', chip: 'danger' } : fm.date(x.orderBy), x.openPrq ? x.openPrq.id : '—']) },
      chips: plan.filter((x) => !x.openPrq).slice(0, 2).map((x) => 'اعمل طلب شراء لـ' + first2(x.item.name)), links: [{ label: 'الطلب الذكي', route: 'exec/insights' }, { label: 'أرصدة المخزون', route: 'scm/stock' }] };
  }
  function parseSO(n, q) {
    const m1 = String(q || '').match(/SO[\s\-_]*(?:20\d\d[\s\-_]*)?0*(\d{3,4})/i) || n.match(/so[\s\-_]*(?:20\d\d[\s\-_]*)?0*(\d{3,4})/);
    let num0 = m1 ? m1[1] : null;
    if (!num0 && has(n, N(['طلب', 'اوردر', 'امر بيع', 'طلبيه'])) && !has(n, N(['شراء', 'اشتري']))) { const m2 = n.match(/(?:^|\s)0*(\d{3,4})(?:\s|$)/); if (m2) num0 = m2[1]; }
    if (!num0) return null; const suf = '-' + String(num0).padStart(4, '0'); return get('salesOrders').find((o) => o.id.slice(-5) === suf) || (m1 ? { missing: num0 } : null);
  }
  function ansOrder(n, q) {
    const so = parseSO(n, q); if (!so || so.missing) return { tone: 'warning', text: 'مش لاقي أمر بيع بالرقم ده. اكتب الرقم كامل زي SO-2026-0480.', chips: [sampleSO() ? 'حالة طلب ' + sampleSO() : 'الطلبات المتأخرة'] };
    if (M.scoped() && SA.scopeFilter('sales', [so], 'repId').length === 0) return { tone: 'warning', denied: true, text: 'الطلب ' + so.id + ' مش ضمن عملائك، فمش هقدر أعرض تفاصيله. (المندوب يشوف طلبات عملائه فقط.)' };
    const t = F.totals(so); const today = ERP.day(0); const late = so.promisedDate && so.promisedDate < today && M.DONE_SO.indexOf(so.status) < 0;
    const wos = (so.woIds || []).map((id) => ERP.find('workOrders', id)).filter(Boolean); const sh = get('shipments').find((s) => (s.soIds || []).indexOf(so.id) >= 0);
    const hold = wos.filter((w) => w.status === 'on_hold');
    let text = so.id + ' — ' + ERP.customerName(so.customerId) + ': ' + stl('so', so.status) + '. القيمة ' + money(t.total) + (so.discountPct ? ' (خصم ' + so.discountPct + '%)' : '') + '، موعد التسليم ' + fm.date(so.promisedDate) + (late ? ' (متأخر ' + ERP.daysBetween(so.promisedDate, today) + ' يوم)' : so.promisedDate >= today ? ' (بعد ' + daysTo(so.promisedDate) + ' يوم)' : '') + '.';
    if (wos.length) text += ' أوامر التشغيل: ' + wos.map((w) => first2(ERP.itemName(w.itemId)) + ' ' + num(w.qtyDone) + '/' + num(w.qty) + ' (' + stl('wo', w.status) + ')').join('، ') + '.';
    if (hold.length) { const ln = ERP.line(hold[0].lineId); text += ' تنبيه: ' + hold[0].id + ' متوقف' + (ln && ln.status === 'down' ? ' بسبب توقف ' + ln.name : hold[0].holdReason ? ' — ' + hold[0].holdReason : '') + '.'; }
    if (sh) text += ' الشحنة ' + sh.id + ' (' + stl('ship', sh.status) + ')' + (sh.etd ? '، الإبحار ' + fm.date(sh.etd) + ' والوصول ' + fm.date(sh.eta) : '') + '.';
    if (so.status === 'pending_approval' && so.approvalId) text += ' بانتظار الاعتماد ' + so.approvalId + '.';
    if (so.status === 'pending_review') text += ' طلب بوابة — محتاج مكالمة تأكيد مع التاجر.';
    const KIND = { so: 'so', wo: 'wo', qc: 'qc', dn: 'dn', inv: 'inv', approval: 'approval' }; const LB = { so: 'أمر البيع', approval: 'الاعتماد', wo: 'أمر تشغيل', qc: 'فحص الجودة', dn: 'إذن تسليم', inv: 'فاتورة', rv: 'تحصيل' };
    const chain = F.chainOf(so.id);
    return { tone: late || hold.length ? 'warning' : null, text, table: { cols: ['المرحلة', 'المستند', 'الحالة', 'التاريخ'], rows: chain.map((x) => [LB[x.kind] || x.label, L(x.id, ERP.route(x.id)), x.kind === 'rv' ? { text: 'مُرحّل', chip: 'success' } : KIND[x.kind] ? stc(KIND[x.kind], x.status) : x.status, x.at ? fm.date(String(x.at).slice(0, 10)) : '—']) },
      links: acts({ label: 'فتح الطلب', route: 'crm/orders/' + so.id }, so.approvalId && so.status === 'pending_approval' ? { label: 'الاعتماد', route: 'approvals/' + so.approvalId } : null, sh ? { label: 'الشحنة', route: 'scm/shipments/' + sh.id } : null) };
  }
  function ansExport() {
    const exp = M.orders().filter((o) => o.export && M.DONE_SO.indexOf(o.status) < 0 && o.status !== 'draft'); const ships = get('shipments').filter((s) => s.kind === 'export' && M.custOK(s.customerId)); const openS = ships.filter((s) => s.status !== 'delivered'); const lastDone = ships.filter((s) => s.status === 'delivered')[0];
    if (!exp.length && !openS.length) return { text: 'مفيش طلبيات تصدير مفتوحة' + scopeNote() + '.' + (lastDone ? ' آخر شحنة تصدير ' + lastDone.id + ' وصلت ' + lastDone.destination + '.' : ''), links: [{ label: 'الشحنات والتصدير', route: 'scm/shipments' }] };
    const risk = exp.map((o) => { const h0 = (o.woIds || []).map((id) => ERP.find('workOrders', id)).filter((w) => w && w.status === 'on_hold')[0]; return h0 ? { o, w: h0, ln: ERP.line(h0.lineId) } : null; }).filter(Boolean);
    return { tone: risk.length ? 'warning' : null, text: pl(exp.length, FN.so) + ' تصدير مفتوحة' + scopeNote() + ': ' + exp.map((o) => o.id + ' ' + custShort(o.customerId) + ' (' + stl('so', o.status) + '، ' + short(F.totals(o).total) + ')').join('، ') + '. ' + openS.map((s) => 'الشحنة ' + s.id + ' (' + s.container + ' ' + (s.incoterm || '') + ') إبحار ' + fm.date(s.etd) + ' ووصول ' + fm.date(s.eta)).join('؛ ') + (openS.length ? '. ' : '') + (risk.length ? 'خطر: ' + risk[0].w.id + ' متوقف' + (risk[0].ln && risk[0].ln.status === 'down' ? ' بسبب توقف ' + risk[0].ln.name : '') + ' — المتبقي ' + num(risk[0].w.qty - risk[0].w.qtyDone) + ' وحدة.' : 'لا توجد مخاطر على المواعيد حاليًا.'),
      table: { cols: ['الطلب', 'العميل', 'الحالة', 'القيمة', 'الشحنة', 'الإبحار', 'الوصول'], num: [3], rows: exp.map((o) => { const s = ships.find((x) => (x.soIds || []).indexOf(o.id) >= 0); return [L(o.id, 'crm/orders/' + o.id), ERP.customerName(o.customerId), stc('so', o.status), money(F.totals(o).total), s ? L(s.id, 'scm/shipments/' + s.id) : '—', s ? fm.date(s.etd) : '—', s ? fm.date(s.eta) : '—']; }) }, links: [{ label: 'الشحنات والتصدير', route: 'scm/shipments' }], scoped: M.scoped() };
  }
  function ansProfit() {
    if (!ERP.ui.canProfit()) return { tone: 'warning', denied: true, text: 'عذرًا، أرقام الأرباح والهوامش سرية ومتاحة فقط لمن يملك صلاحية الأرباح (data.profit.view) — صاحب الشركة والمدير العام والمدير المالي. أقدر أساعدك في المبيعات أو التحصيل أو حالة الطلبات بدلًا من كده.', chips: ['مبيعات الشهر', 'مين متأخر في السداد؟'] };
    const keys = ERP.monthKeys(6); const mon = keys.map((k) => M.pnl(k + '-01', k + '-31')); const last = mon[mon.length - 2], cur = mon[mon.length - 1]; const ytd = M.pnl(new Date().getFullYear() + '-01-01', ERP.day(0));
    return { text: 'أرباح ' + monthName(keys[keys.length - 2]) + ' (آخر شهر مكتمل): إيرادات ' + short(last.rev) + '، مجمل ربح ' + short(last.gross) + ' (' + pct1(last.gm) + ')، صافي ربح ' + short(last.net) + ' (' + pct1(last.nm) + '). منذ بداية السنة: صافي ' + short(ytd.net) + ' بهامش ' + pct1(ytd.nm) + '. ' + monthName(keys[keys.length - 1]) + ' حتى اليوم: مجمل ربح ' + short(cur.gross) + '.',
      chart: { type: 'columns', title: 'مجمل وصافي الربح — آخر 6 شهور', labels: keys.map(monthName), series: [{ name: 'مجمل الربح', values: mon.map((m) => Math.max(0, Math.round(m.gross))) }, { name: 'صافي الربح', values: mon.map((m) => Math.max(0, Math.round(m.net))), color: ERP.palette[4] }] }, note: 'أرقام تجريبية محسوبة من القيود اليومية — الشهر الحالي جزئي.', links: [{ label: 'قائمة الدخل المختصرة', route: 'exec/reports?r=pnl' }, { label: 'القوائم المالية', route: 'fin/statements' }] };
  }
  function ansReps() {
    const ck = M.curKey(); const by = {}; M.invoices().forEach((i) => { if (String(i.issueDate).slice(0, 7) !== ck) return; const r = M.repOf(i); if (r) by[r] = (by[r] || 0) + M.net(i); });
    const tg = {}; get('targets').forEach((t) => { if (t.period === ck) tg[t.repId] = t.target; }); let reps = uniq(Object.keys(tg).concat(Object.keys(by))).filter((r) => SA.userById(r));
    if (M.scoped()) reps = SA.scopeFilter('sales', reps.map((r) => ({ repId: r })), 'repId').map((x) => x.repId);
    if (!reps.length) return { text: 'مفيش بيانات أداء مندوبين متاحة لك.' };
    const open = {}; M.openOrders().forEach((o) => { open[o.repId] = (open[o.repId] || 0) + M.soNet(o); });
    const rows = reps.map((r) => ({ r, v: by[r] || 0, t: tg[r] || null })).sort((a, b) => b.v - a.v); const dom = new Date().getDate(); const days = new Date(Number(ck.slice(0, 4)), Number(ck.slice(5, 7)), 0).getDate(); const pace = dom / days;
    const mine = rows.length === 1 && rows[0].r === me().id;
    return { text: (mine ? 'أداؤك في ' + monthName(ck) + ': ' : 'أداء المندوبين في ' + monthName(ck) + ' (حتى اليوم، والمفروض نكون عند ' + pct(pace) + ' من الهدف): ') + rows.map((x) => (mine ? '' : SA.userName(x.r) + ' ') + short(x.v) + (x.t ? ' من هدف ' + short(x.t) + ' (' + pct(x.v / x.t) + ')' : '')).join('، ') + '.' + (!mine && rows[0].v ? ' الأعلى ' + SA.userName(rows[0].r) + '.' : ''),
      chart: { type: 'bars', fmt: 'pct', max: 100, data: rows.map((x) => ({ label: SA.userName(x.r), sub: x.t ? 'الهدف ' + short(x.t) : 'بدون هدف', value: x.t ? Math.round((x.v / x.t) * 100) : 0 })) },
      table: { cols: ['المندوب', 'مبيعات الشهر', 'الهدف', 'التحقيق', 'طلبات مفتوحة'], num: [1, 2, 3, 4], rows: rows.map((x) => [SA.userName(x.r), money(x.v), x.t ? money(x.t) : '—', x.t ? pct(x.v / x.t) : '—', money(open[x.r] || 0)]) }, links: [{ label: 'أهداف المبيعات', route: 'crm/targets' }, { label: 'تقرير أداء المندوبين', route: 'exec/reports?r=sales-rep' }], scoped: M.scoped() };
  }
  function ansExpo() {
    const s = M.expoStats(); const done = s.filter((x) => x.e.status === 'done' && x.roi != null).sort((a, b) => b.roi - a.roi); const up = s.filter((x) => ['planned', 'preparing', 'live'].indexOf(x.e.status) >= 0).sort((a, b) => (a.e.from < b.e.from ? -1 : 1));
    const b = done[0];
    return { text: (b ? 'آخر ' + pl(done.length, FN.ev) + ': الأعلى عائدًا ' + b.e.name + ' (' + b.roi.toFixed(1) + '× — ' + pl(b.leads, FN.lead) + ' وفرص مرجّحة ' + short(b.won + b.pipe) + ' مقابل تكلفة ' + short(b.spent) + '). ' : '') + (up.length ? 'القادم: ' + up.map((u) => u.e.name + ' بعد ' + daysTo(u.e.from) + ' يوم' + (u.e.approvalStatus === 'pending' ? ' (الميزانية ' + short(u.e.budget) + ' بانتظار الاعتماد)' : '')).join('، ') + '.' : ''),
      chart: done.length ? { type: 'bars', fmt: 'num', data: done.map((x) => ({ label: x.e.name, sub: x.e.city, value: Math.round(x.roi * 100) / 100, route: 'expo/events/' + x.e.id })) } : null,
      table: { cols: ['المعرض', 'التاريخ', 'العملاء المحتملون', 'فرص مرجّحة', 'مكسوب', 'التكلفة', 'العائد'], num: [2, 3, 4, 5, 6], rows: done.concat(up).map((x) => [L(x.e.name, 'expo/events/' + x.e.id), fm.date(x.e.from), x.leads, short(x.pipe), short(x.won), short(x.spent), x.roi != null && x.e.status === 'done' ? x.roi.toFixed(1) + '×' : stl('event', x.e.status)]) }, note: 'العائد = (المكسوب + الفرص المفتوحة × احتمال الكسب) ÷ مصروف المعرض.', links: [{ label: 'العائد من المعارض', route: 'expo/roi' }, { label: 'تقويم المعارض', route: 'expo/calendar' }] };
  }
  function ansComplaints() {
    const open = get('tickets').filter((t) => ['resolved', 'closed'].indexOf(t.status) < 0 && M.custOK(t.customerId)).sort((a, b) => (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0)); if (!open.length) return { tone: 'success', text: 'مفيش شكاوى أو تذاكر مفتوحة' + scopeNote() + '.' };
    const brk = open.filter((t) => minsSince(t.openedAt) / 60 > (t.slaHours || 48)); const PR = { high: ['عالية', 'danger'], normal: ['عادية', 'info'], low: ['منخفضة', 'neutral'] }; const KD = { complaint: 'شكوى', installation: 'تركيب', inquiry: 'استفسار', warranty: 'ضمان' };
    return { tone: brk.length ? 'danger' : 'warning', text: pl(open.length, FN.tkt) + scopeNote() + '، منها ' + open.filter((t) => t.priority === 'high').length + ' عالية الأولوية' + (brk.length ? ' و' + brk.length + ' تجاوزت زمن الخدمة (SLA)' : '') + '. الأهم: ' + open[0].id + ' — ' + open[0].title + ' (' + ERP.customerName(open[0].customerId) + ')' + (open[0].ncrId ? '، مرتبطة بعدم مطابقة ' + open[0].ncrId : '') + '.',
      table: { cols: ['التذكرة', 'النوع', 'العميل', 'الموضوع', 'الأولوية', 'العمر / SLA', 'الحالة'], rows: open.map((t) => [L(t.id, 'care/tickets/' + t.id), KD[t.kind] || t.kind, ERP.customerName(t.customerId), t.title, { text: (PR[t.priority] || [t.priority])[0], chip: (PR[t.priority] || [0, 'neutral'])[1] }, Math.round(minsSince(t.openedAt) / 60) + ' / ' + t.slaHours + ' س', stc('ticket', t.status)]) }, links: [{ label: 'شكاوى العملاء', route: 'care/tickets' }] };
  }
  function ansMaintenance() {
    const open = get('maintenanceOrders').filter((m) => ['done', 'cancelled'].indexOf(m.status) < 0); const brk = open.filter((m) => m.kind === 'breakdown'); const today = ERP.day(0); const od = get('machines').filter((m) => m.nextPMAt && m.nextPMAt < today); const from = M.curKey() + '-01';
    const downMin = sum(get('downtime').filter((d) => String(d.start).slice(0, 10) >= from), (d) => d.minutes || 0); const u = brk.find((m) => m.priority === 'urgent') || brk[0];
    return { tone: brk.length ? 'danger' : od.length ? 'warning' : null, text: pl(open.length, FN.mwo) + '، منها ' + brk.length + ' أعطال. ' + (u ? 'الأهم: ' + u.id + ' — ' + u.title + ' (' + stl('mwo', u.status) + ' منذ ' + dur(minsSince(u.openedAt)) + (u.notes ? '؛ ' + u.notes : '') + '). ' : '') + pl(od.length, FN.mc) + ' متأخرة عن الصيانة الوقائية. إجمالي التوقفات المسجلة هذا الشهر ' + Math.round(downMin / 6) / 10 + ' ساعة.',
      table: { cols: ['أمر الصيانة', 'الماكينة', 'النوع', 'الأولوية', 'الحالة', 'منذ'], rows: open.map((m) => [L(m.id, 'care/maintenance/' + m.id), m.machineId + ' ' + first2((ERP.machine(m.machineId) || {}).name), m.kind === 'breakdown' ? 'عطل' : 'وقائية', m.priority === 'urgent' ? { text: 'عاجل', chip: 'danger' } : m.priority === 'high' ? { text: 'عالية', chip: 'warning' } : 'عادية', stc('mwo', m.status), SA.fmt.rel(m.openedAt)]) }, links: [{ label: 'أوامر الصيانة', route: 'care/maintenance' }, { label: 'مخاطر الأعطال', route: 'exec/insights' }] };
  }
  function ansCash() {
    const acc = M.cashAccounts(); const tot = sum(acc, (a) => a.balance); const banks = sum(acc.filter((a) => a.code.indexOf('111') === 0), (a) => a.balance); const fc = M.cashForecast(30); const chq = sum(get('cheques').filter((c) => ['received', 'under_collection'].indexOf(c.status) >= 0), (c) => c.amount);
    return { tone: fc.projected < 0 ? 'danger' : null, text: 'الكاش المتاح الآن ' + short(tot) + ' (بنوك ' + short(banks) + ' + خزائن ' + short(tot - banks) + ')، وشيكات تحت التحصيل ' + short(chq) + '. التوقع خلال 30 يوم: تحصيلات ≈ ' + short(fc.inAR + fc.inChq) + ' ومدفوعات ≈ ' + short(fc.outAP + fc.outPV + fc.fixed) + ' ← رصيد متوقع ≈ ' + short(fc.projected) + '.',
      chart: { type: 'bars', data: acc.slice().sort((a, b) => b.balance - a.balance).map((a, i) => ({ label: a.name, value: Math.max(0, a.balance), color: ERP.palette[i] })) }, table: { cols: ['الحساب', 'الكود', 'الرصيد'], num: [2], rows: acc.map((a) => [a.name, a.code, money(a.balance)]) }, note: 'توقع تجريبي: نسب تحصيل افتراضية 85% للمستحق و50% للمتأخر.', links: [{ label: 'البنوك والخزائن', route: 'fin/banks' }] };
  }
  /** product / material standard cost — sensitive: data.cost.view (margin only with data.profit.view) */
  function ansCost(n) {
    if (!ERP.ui.canCost()) return { tone: 'warning', denied: true, text: 'عذرًا، تكلفة المنتجات والخامات بيانات سرية ومتاحة فقط لمن يملك صلاحية التكاليف (data.cost.view). أقدر أقولك سعر البيع حسب قائمة الأسعار أو المتاح في المخزون بدلًا من كده.', chips: ['مبيعات الشهر', 'مين متأخر في السداد؟'] };
    const items = get('items'); let list = items.filter((i) => i.attrs && i.attrs.model && n.indexOf(norm(i.attrs.model)) >= 0);
    if (!list.length) { const f = findItem(n); if (f) list = [ERP.item(f)]; }
    if (!list.length) { const fam = has(n, N(['باب', 'ابواب', 'الابواب'])) ? 'door' : has(n, N(['تجاليد', 'تجليد', 'كلادينج', 'k71'])) ? 'clad' : has(n, N(['فوم'])) ? 'foam' : null; if (fam) list = items.filter((i) => i.kind === 'fg' && i.family === fam); }
    if (!list.length) return { text: 'اكتب موديل المنتج أو اسم الخامة عشان أقولك تكلفتها — مثال: «تكلفة الباب D101» أو «تكلفة الفويل».', chips: ['تكلفة الباب D101', 'تكلفة التجاليد K71', 'تكلفة الفويل'] };
    list = list.slice(0, 8); const canP = ERP.ui.canProfit(); const mg = (i) => (i.price ? (i.price - (i.stdCost || 0)) / i.price : null); const f0 = list[0];
    return { text: 'التكلفة المعيارية لـ «' + f0.name + '»: ' + money(f0.stdCost || 0) + ' لل' + (uomOf(f0) || 'وحدة') + (f0.price ? ' مقابل سعر القائمة ' + money(f0.price) + (canP ? ' — هامش ' + pct1(mg(f0)) : '') : '') + '.' + (list.length > 1 ? ' وفي الجدول ' + (list.length - 1) + ' مقاسات/ألوان تانية.' : '') + (canP ? '' : ' (الهامش مخفي — يحتاج صلاحية الأرباح).'),
      table: { cols: ['الصنف', 'الكود', 'سعر القائمة', 'التكلفة المعيارية', 'الهامش'], num: [2, 3, 4], rows: list.map((i) => [L(i.name, 'scm/stock/' + i.id), i.code, i.price != null ? money(i.price) : '—', money(i.stdCost || 0), canP && mg(i) != null ? pct1(mg(i)) : '—']) },
      note: 'تكلفة معيارية تجريبية من مكونات المنتج (BOM) — التكلفة الفعلية من شاشة تكاليف المنتجات.', links: [{ label: 'تكاليف المنتجات', route: 'fin/costing' }] };
  }
  const SYN = [['IT-RM-FILM', ['فويل', 'ديكور فويل', 'film']], ['IT-RM-PVC', ['راتنج', 'pvc', 'بي في سي']], ['IT-RM-WF', ['دقيق خشب', 'دقيق الخشب', 'نشاره']], ['IT-RM-CC', ['كربونات']], ['IT-RM-STB', ['مثبت', 'ستابلايزر']], ['IT-RM-LUB', ['شمع', 'مزلق']], ['IT-RM-FOAM', ['عامل نفخ', 'نفخ']], ['IT-RM-ACR', ['acr', 'منظم فوم', 'منظم']],
    ['IT-RM-PIG', ['ماستر باتش', 'ماستر', 'صبغه', 'الوان']], ['IT-RM-GLUE', ['لاصق', 'غراء', 'pur']], ['IT-PKG-CTN', ['كرتونه', 'كرتون', 'كراتين']], ['IT-PKG-STR', ['ستريتش', 'استرتش']], ['IT-PKG-PAL', ['باليته', 'بالته', 'طبالي']], ['IT-ACC-LOCK', ['كالون', 'كوالين', 'اكره']], ['IT-ACC-HINGE', ['مفصلات', 'مفصله', 'مفصل']],
    ['IT-SP-SEAL', ['جوان طلمبه', 'جوان الطلمبه']], ['IT-ACC-GSKT', ['جوان مطاطي', 'جوان']], ['IT-SP-HTR', ['حزام تسخين', 'هيتر', 'heater']], ['IT-SP-BLD', ['سكينه', 'سكينة منشار']], ['IT-SP-BRG', ['رولمان', 'بلي']], ['IT-SP-THC', ['ثرموكبل', 'ثيرموكبل']], ['IT-SP-BELT', ['سير ناقل', 'سير']]].map((s) => [s[0], N(s[1])]);
  function findItem(n) { let best = null, bl = 0; SYN.forEach((s) => s[1].forEach((w) => { if (n.indexOf(w) >= 0 && w.length > bl) { bl = w.length; best = s[0]; } })); return best && ERP.item(best) ? best : null; }
  function ansPRQ(n) {
    const itemId = findItem(n); const plan = M.reorderPlan(true);
    if (!itemId) { const sug = plan.filter((x) => x.status !== 'ok' && !x.openPrq).slice(0, 4); return { text: 'تحب أعمل طلب شراء لأي صنف؟ اكتب اسم الخامة أو قطعة الغيار (مثلاً: اعمل طلب شراء لراتنج PVC 5000). دي أهم الأصناف المقترحة حاليًا:', chips: sug.length ? sug.map((x) => 'اعمل طلب شراء لـ' + first2(x.item.name)) : ['الخامات اللي هتخلص'] }; }
    const it = ERP.item(itemId); const row = plan.find((x) => x.itemId === itemId); const qm = n.replace(/so[\s\-]*\d+/g, '').match(/(\d{1,6})/); const qty = qm ? Number(qm[1]) : row ? row.suggest || it.moq || 1 : it.moq || 1; const u = uomOf(it); const open = row && row.openPrq;
    return { text: 'جاهز أعمل طلب شراء داخلي لـ «' + it.name + '» بكمية ' + num(qty) + ' ' + u + (qm ? '' : ' (الكمية المقترحة من الطلب الذكي)') + '. ' + (row ? 'المتاح ' + num(row.avail) + ' ' + u + ' ويكفي ≈ ' + Math.round(row.onHandCover) + ' يوم، ومدة التوريد ' + row.lead + ' يوم من ' + ERP.supplierName(it.supplierId) + '.' : '') + (open ? ' تنبيه: يوجد طلب مفتوح ' + open.id + ' لنفس الصنف (' + num(open.qty) + ' ' + u + ').' : '') + ' أكّد من الزر وهيوصل لقسم المشتريات فورًا.',
      action: { kind: 'prq', itemId, qty, source: 'manual', neededBy: ERP.day(it.leadDays || 7), reason: 'من المساعد الذكي — ' + (row ? 'التغطية ≈ ' + Math.round(row.onHandCover) + ' يوم مقابل توريد ' + row.lead + ' يوم' : 'طلب ' + (me().name || '')) } };
  }
  function ansApprovals() {
    const list = M.myApprovals(); const T = SA.catalog.approvalTypes;
    if (!list.length) return { tone: 'success', text: 'مفيش حاجة مستنية قرارك دلوقتي.', links: [{ label: 'صندوق الاعتمادات', route: 'approvals' }] };
    const old = list.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    return { text: pl(list.length, FN.ap) + ' تنتظر قرارك بإجمالي ' + short(sum(list, (a) => a.amount || 0)) + '. الأقدم: ' + old.title + ' (' + SA.fmt.rel(old.createdAt) + ').', table: { cols: ['الطلب', 'العنوان', 'النوع', 'القيمة', 'منذ'], num: [3], rows: list.map((a) => [L(a.id, 'approvals/' + a.id), a.title, (T[a.type] || {}).label || a.type, a.amount != null ? money(a.amount) : '—', SA.fmt.rel(a.createdAt)]) }, links: [{ label: 'صندوق الاعتمادات', route: 'approvals' }] };
  }
  function ansForecast() {
    const d = M.demand(null, false); if (!d.f) return { text: 'البيانات التاريخية غير كافية للتوقع.' };
    const labels = d.keys.concat(d.fKeys.slice(1)).map(monthName); const nul = () => Array(labels.length).fill(null);
    const act0 = d.hist.concat([null, null, null, null]); const fc = nul(), hi = nul(), lo = nul(); fc[10] = hi[10] = lo[10] = d.hist[10]; d.f.out.forEach((o, i) => { fc[11 + i] = Math.round(o.v); hi[11 + i] = Math.round(o.hi); lo[11 + i] = Math.round(o.lo); });
    const fam = ['door', 'clad', 'foam'].map((f) => { const v = M.demand(f, false), u = M.demand(f, true), cap = M.capacity(f); return { f, v: v.next ? v.next.v : 0, u: u.next ? u.next.v : 0, cap }; });
    return { text: 'التوقع' + scopeNote() + ' (اتجاه خطي + موسمية نفس الشهر من السنة الماضية): ' + monthName(d.fKeys[0]) + ' يقفل على ≈ ' + short(d.f.out[0].v) + ' (حتى اليوم ' + short(d.cur) + ')، ' + d.fKeys.slice(1).map((k, i) => monthName(k) + ' ≈ ' + short(d.f.out[i + 1].v)).join('، ') + '. نطاق الثقة ± ' + short(d.f.rmse) + ' تقريبًا، والاتجاه العام ' + (d.f.b >= 0 ? 'نمو ≈ ' + short(d.f.b) + ' شهريًا.' : 'انخفاض ≈ ' + short(-d.f.b) + ' شهريًا.'),
      chart: { type: 'line', title: 'فعلي + توقع مع نطاق الثقة', labels, series: [{ name: 'فعلي', values: act0, color: ERP.palette[0] }, { name: 'التوقع', values: fc, color: ERP.palette[3], dashed: true }, { name: 'الحد الأعلى', values: hi, color: C.band, dashed: true }, { name: 'الحد الأدنى', values: lo, color: C.band, dashed: true }] },
      table: { cols: ['العائلة', 'توقع ' + monthName(d.fKeys[1]) + ' (قيمة)', 'كمية', 'تحميل الطاقة'], num: [1, 2, 3], rows: fam.map((x) => [M.FAM[x.f], short(x.v), num(x.u) + ' ' + (x.cap ? x.cap.uom : ''), x.cap && x.cap.effective ? pct(x.u / x.cap.effective) : '—']) }, note: 'محاكاة: نموذج إحصائي بسيط وشفاف على بيانات الفواتير.', links: [{ label: 'التنبؤات والتنبيهات', route: 'exec/insights' }] };
  }
  function ansQuality() {
    const f = M.fpy(60); const open = M.openNcrs(); const capa = get('capas').filter((c) => c.status !== 'closed'); const DC = {}; ERP.defectCodes.forEach((d) => { DC[d.code] = d.label; }); const SRC = { production: 'إنتاج', supplier: 'مورد', customer: 'عميل' };
    return { tone: open.some((x) => x.severity === 'major') ? 'warning' : null, text: 'جودة من أول مرة (FPY) آخر 60 يوم: ' + pct1(f.value) + ' على ' + num(f.units) + ' وحدة (' + f.count + ' فحص نهائي). ' + pl(open.length, FN.ncr) + ' مفتوحة: ' + open.slice(0, 2).map((x) => x.id + ' ' + first2(ERP.itemName(x.itemId)) + ' — ' + (DC[x.defectCode] || x.defectCode) + ' (' + stl('ncr', x.status) + ')').join('، ') + '. الإجراءات التصحيحية الجارية: ' + capa.length + '.',
      table: { cols: ['NCR', 'الصنف', 'العيب', 'الكمية', 'المصدر', 'الحالة'], num: [3], rows: open.map((x) => [L(x.id, 'mfg/ncr/' + x.id), first2(ERP.itemName(x.itemId)) + ' ' + (((ERP.item(x.itemId) || {}).attrs || {}).color || ''), DC[x.defectCode] || x.defectCode, num(x.qty), SRC[x.source] || x.source, stc('ncr', x.status)]) }, links: [{ label: 'لوحة الجودة', route: 'mfg/quality' }, { label: 'تقرير مؤشرات الجودة', route: 'exec/reports?r=quality' }] };
  }
  const CSTOP = N(['معرض', 'شركه', 'مؤسسه', 'مجموعه', 'مكتب', 'للتجاره', 'للمقاولات', 'مقاولات', 'للتطوير', 'العقاري', 'الدولي', 'مستشفي', 'هندسي', 'وكيل', 'للابواب', 'والديكور', 'الحديث', 'سلطنه', 'مشروع', 'وحدات', 'طبيه', 'مباشر', 'القاهره', 'الجديده']);
  function findCustomer(n) { let best = null, bs = 0; get('customers').forEach((c) => { const toks = norm(c.name).split(' ').filter((t) => t.length >= 3 && CSTOP.indexOf(t) < 0); let s = 0; toks.forEach((t) => { if (n.indexOf(t) >= 0) s += t.length >= 4 ? 2 : 1; }); if (s > bs) { bs = s; best = c; } }); return bs >= 2 ? { c: best, s: bs } : null; }
  function ansCustomer(n) {
    const f = findCustomer(n); if (!f) return null; const c = f.c;
    if (!M.custOK(c.id)) return { tone: 'warning', denied: true, text: 'العميل «' + c.name + '» مش ضمن عملائك، فمش هقدر أعرض بياناته.' };
    const inv = M.invoices().filter((i) => i.customerId === c.id); const s12 = sum(inv.filter((i) => i.issueDate >= ERP.day(-365)), M.net); const ar = M.arOpen().filter((i) => i.customerId === c.id); const od = ar.filter((i) => i.st === 'overdue'); const openAmt = sum(ar, (i) => i.due); const odAmt = sum(od, (i) => i.due); const maxLate = od.reduce((m, i) => Math.max(m, ERP.daysBetween(i.dueDate)), 0);
    const last = inv.slice().sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1))[0]; const oo = M.openOrders().filter((o) => o.customerId === c.id); const bnc = get('cheques').filter((x) => x.customerId === c.id && x.status === 'bounced');
    return { tone: odAmt > 0 || bnc.length ? 'warning' : null, text: c.name + ' (' + [SL[c.segment], c.region, 'المندوب ' + SA.userName(c.salesRepId)].filter(Boolean).join('، ') + '): مبيعات آخر 12 شهر ' + short(s12) + '، الرصيد المستحق ' + short(openAmt) + (odAmt ? ' منها متأخر ' + short(odAmt) + ' (أقدم ' + maxLate + ' يوم)' : ' بدون متأخرات') + (c.creditLimit ? '، استخدام الحد الائتماني ' + pct(openAmt / c.creditLimit) + ' من ' + short(c.creditLimit) : '') + (bnc.length ? '، وعليه ' + pl(bnc.length, FN.chq) + ' مرتدة' : '') + '. ' + (last ? 'آخر فاتورة ' + fm.date(last.issueDate) + '. ' : '') + (oo.length ? 'طلبات مفتوحة: ' + oo.map((o) => o.id + ' (' + stl('so', o.status) + ')').join('، ') + '.' : 'مفيش طلبات مفتوحة.'),
      table: oo.length ? { cols: ['الطلب', 'الحالة', 'القيمة', 'التسليم'], num: [2], rows: oo.map((o) => [L(o.id, 'crm/orders/' + o.id), stc('so', o.status), money(F.totals(o).total), fm.date(o.promisedDate)]) } : null, links: [{ label: 'ملف العميل 360°', route: 'crm/customers/' + c.id }] };
  }

  intent({ id: 'help', label: 'المساعدة', w: 3, req: ['مرحبا', 'اهلا', 'السلام عليكم', 'ازيك', 'صباح الخير', 'مساء الخير', 'هاي', 'تقدر تعمل', 'بتعمل ايه', 'تعرف تعمل', 'ساعدني', 'مساعده', 'انت مين', 'help', 'بتعرف ايه'], answer: ansHelp });
  intent({ id: 'orderStatus', label: 'حالة الطلبات', need: NEED.orders, match: (n, q) => (parseSO(n, q) ? 12 : 0), answer: ansOrder });
  intent({ id: 'prq', label: 'إنشاء طلب شراء', need: NEED.prq, w: 6, req: ['طلب شراء', 'اعمل طلب', 'اطلب شراء', 'اشتري', 'اشتريلي', 'اطلبلي', 'اطلب لي', 'purchase'], answer: ansPRQ });
  intent({ id: 'compare', label: 'مقارنة المبيعات', need: NEED.sales, w: 4, req: ['مقارنه', 'قارن', 'بالشهر اللي فات', 'عن الشهر اللي فات', 'مقابل الشهر', 'الفرق بين', 'زي الشهر اللي فات'], boost: [[['مبيعات', 'بعنا', 'تحصيل'], 1]], answer: ansCompare });
  intent({ id: 'forecast', label: 'التوقعات', need: NEED.forecast, w: 4, req: ['توقع', 'توقعات', 'تنبؤ', 'الشهر الجاي', 'الشهر القادم', 'الشهور الجايه', 'الشهور القادمه', 'forecast', 'هنبيع', 'التوقع'], boost: [[['مبيعات', 'طلب'], 1]], answer: ansForecast });
  intent({ id: 'sales', label: 'المبيعات', need: NEED.sales, w: 3, req: ['مبيعات', 'بعنا', 'بيعنا', 'مبيع', 'ايرادات', 'الايراد', 'sales', 'فواتير البيع'], boost: [[['الشهر', 'الاسبوع', 'السنه', 'النهارده', 'اليوم'], 1]], answer: ansSales });
  intent({ id: 'collections', label: 'التحصيلات', need: NEED.ar, w: 3, req: ['تحصيلات', 'التحصيل', 'حصلنا', 'اتحصل', 'قبضنا', 'المقبوضات', 'سندات القبض'], answer: ansCollections });
  intent({ id: 'topCustomers', label: 'أكبر العملاء', need: NEED.sales, w: 4, req: ['اكبر العملاء', 'اكبر عملاء', 'اكبر عميل', 'اهم العملاء', 'افضل العملاء', 'العملاء الكبار', 'اكتر العملاء', 'top customers', 'اكبر 5'], answer: ansTopCustomers });
  intent({ id: 'overdue', label: 'المتأخرات', need: NEED.ar, match: (n) => { let s = 0; if (has(n, N(['سداد', 'يدفع', 'دفعوش', 'مدفعش', 'مديونيه', 'مديونيات', 'الديون', 'ديون', 'مستحقات', 'اعمار', 'عليهم فلوس', 'متاخرات', 'مديونين', 'مديون', 'الذمم', 'ذمم', 'الاجل', 'مستحق']))) s += 3; if (has(n, N(['فلوس', 'مبالغ', 'رصيد'])) && has(n, N(['عليه', 'عليهم', 'عندهم', 'عنده', 'لينا عند', 'لينا عليه']))) s += 4; if (has(n, N(['متاخر']))) s += 2; return s >= 3 ? s : 0; }, answer: ansOverdue });
  intent({ id: 'cheques', label: 'الشيكات', need: NEED.cheques, w: 4, req: ['شيك', 'شيكات'], answer: ansCheques });
  intent({ id: 'lateWO', label: 'أوامر التشغيل', need: NEED.wo, match: (n) => { let s = 0; if (has(n, N(['اوامر التشغيل', 'امر تشغيل', 'اوامر شغل', 'اوامر الشغل', 'امر الشغل', 'wo-']))) s += 3; if (has(n, N(['متاخر', 'متوقف', 'واقف', 'معطل']))) s += 2; return s >= 3 ? s + 1 : 0; }, answer: ansLateWO });
  intent({ id: 'lateOrders', label: 'الطلبات المتأخرة', need: NEED.orders, match: (n) => (has(n, N(['طلبات', 'طلبيات', 'اوردرات', 'اوامر البيع', 'الطلبات'])) && has(n, N(['متاخر', 'اتاخر'])) && !has(n, N(['سداد', 'تشغيل'])) ? 6 : 0), answer: ansLateOrders });
  intent({ id: 'lines', label: 'حالة خطوط الإنتاج', need: NEED.mfg, w: 3, req: ['خطوط', 'خط الانتاج', 'الخطوط', 'oee', 'الكفاءه', 'كفاءه', 'المصنع شغال', 'حاله المصنع', 'الانتاج', 'انتاج', 'خط التجاليد', 'خط الفوم', 'خط الابواب'], boost: [[['حاله', 'شغال', 'متوقف', 'واقف'], 1]], answer: ansLines });
  intent({ id: 'materials', label: 'المخزون والخامات', need: NEED.stock, w: 3, req: ['خامات', 'الخامات', 'هتخلص', 'هيخلص', 'نقص', 'حد الطلب', 'المخزون', 'مخزون', 'نواقص', 'reorder', 'قطع غيار', 'قطع الغيار'], boost: [[['هتخلص', 'هيخلص', 'نقص', 'حد الطلب', 'قربت تخلص'], 2]], answer: ansMaterials });
  intent({ id: 'export', label: 'التصدير والشحنات', need: NEED.export, w: 4, req: ['تصدير', 'التصدير', 'عمان', 'الخليج', 'حاويه', 'الميناء', 'export', 'صحار', 'شحنه', 'شحنات', 'الشحنات'], answer: ansExport });
  intent({ id: 'profit', label: 'الأرباح', w: 4, req: ['ارباح', 'الارباح', 'ربح', 'الربح', 'هامش', 'مكسب', 'كسبنا', 'profit', 'ربحيه', 'بنكسب'], answer: ansProfit });
  intent({ id: 'cost', label: 'تكلفة المنتجات', match: (n) => (!has(n, N(['تكلفه', 'تكاليف', 'التكلفه', 'بيتكلف', 'يتكلف', 'بتتكلف', 'تكلفته', 'cost'])) ? 0 : get('items').some((i) => i.attrs && i.attrs.model && n.indexOf(norm(i.attrs.model)) >= 0) || findItem(n) || has(n, N(['باب', 'ابواب', 'تجاليد', 'فوم', 'منتج', 'المنتجات'])) ? 7 : 2), answer: ansCost });
  intent({ id: 'reps', label: 'أداء المندوبين', need: NEED.reps, w: 4, req: ['المندوبين', 'مندوب', 'مناديب', 'المناديب', 'اداء المبيعات', 'التارجت', 'تارجت', 'الاهداف', 'الهدف', 'target', 'فريق المبيعات', 'ادائي'], answer: ansReps });
  intent({ id: 'expo', label: 'المعارض والعائد', need: NEED.expo, w: 4, req: ['معرض', 'المعارض', 'معارض', 'roi', 'عائد', 'فعاليه', 'فعاليات', 'expo'], answer: ansExpo });
  intent({ id: 'complaints', label: 'الشكاوى', need: NEED.care, w: 4, req: ['شكاوي', 'شكوي', 'تذاكر', 'التذاكر', 'تذكره', 'خدمه العملاء', 'الضمان', 'مشاكل العملاء', 'complaint'], answer: ansComplaints });
  intent({ id: 'maintenance', label: 'الأعطال والصيانة', need: NEED.mnt, w: 3, req: ['اعطال', 'عطل', 'الاعطال', 'صيانه', 'الصيانه', 'ماكينه', 'ماكينات', 'الماكينات', 'وقائيه', 'mtbf', 'توقفات', 'بلاغ'], answer: ansMaintenance });
  intent({ id: 'cash', label: 'الكاش والسيولة', need: NEED.cash, w: 3, req: ['كاش', 'الكاش', 'سيوله', 'السيوله', 'رصيد البنك', 'البنوك', 'البنك', 'الخزينه', 'خزينه', 'نقديه', 'النقديه', 'cash', 'الفلوس المتاحه', 'معانا كام'], boost: [[['توقع', 'الشهر الجاي', 'متاح'], 2]], answer: ansCash });
  intent({ id: 'approvals', label: 'الاعتمادات', w: 4, req: ['اعتماد', 'اعتمادات', 'الاعتمادات', 'موافقه', 'موافقات', 'موافقتي', 'قراري', 'مستني', 'pending', 'تنتظرني', 'مستنياني'], answer: ansApprovals });
  intent({ id: 'quality', label: 'مؤشرات الجودة', need: NEED.quality, w: 4, req: ['جوده', 'الجوده', 'ncr', 'عدم مطابقه', 'عيوب', 'fpy', 'مرفوض', 'capa', 'مطابقه', 'اختلاف اللون'], answer: ansQuality });
  intent({ id: 'customer', label: 'بيانات العملاء', need: NEED.cust, match: (n) => { const f = findCustomer(n); if (!f) return 0; return 1 + f.s + (has(n, N(['حساب', 'رصيد', 'عليه', 'مديونيه', 'كشف', 'عميل', 'العميل', 'طلبات', 'وضع'])) ? 2 : 0); }, answer: ansCustomer });

  const sampleSO = () => { const all = M.orders(); const pref = all.find((o) => o.id === 'SO-2026-0480'); if (pref) return pref.id; const o = all.find((x) => M.OPEN_SO.indexOf(x.status) >= 0) || all[0]; return o ? o.id : null; };
  const SUGG = [['مبيعات الشهر', 'sales'], ['قارن بالشهر اللي فات', 'compare'], ['حالة خطوط الإنتاج والـOEE', 'lines'], ['مين متأخر في السداد؟', 'overdue'], ['الخامات اللي هتخلص', 'materials'], ['إيه اللي مستني موافقتي؟', 'approvals'], ['__SO__', 'orderStatus'], ['أكبر العملاء', 'topCustomers'],
    ['حالة طلبيات التصدير', 'export'], ['الكاش المتاح', 'cash'], ['الشيكات المستحقة', 'cheques'], ['أوامر التشغيل المتأخرة', 'lateWO'], ['أرباح الشهر', 'profit'], ['أداء المندوبين', 'reps'], ['المعارض والعائد', 'expo'], ['الشكاوى المفتوحة', 'complaints'], ['الأعطال والصيانة', 'maintenance'], ['توقع مبيعات الشهور الجاية', 'forecast'], ['مؤشرات الجودة', 'quality'], ['اعمل طلب شراء لفويل الديكور', 'prq']];
  const okIntent = (id) => { const it = byId[id]; if (!allowed(it)) return false; if (id === 'profit') return ERP.ui.canProfit(); if (id === 'orderStatus') return !!sampleSO(); return true; };
  function suggestions(n, skip) { skip = skip || []; return SUGG.filter((s) => okIntent(s[1])).map((s) => (s[0] === '__SO__' ? 'حالة طلب ' + sampleSO() : s[0])).filter((t) => skip.indexOf(t) < 0).slice(0, n || 6); }

  function ask(q) {
    const n = norm(q); if (!n) return { intent: 'empty', text: 'اكتب سؤالك وأنا أجاوبك من بيانات النظام.', chips: suggestions(4) };
    let best = null, bs = 0; INT.forEach((it) => { let s = 0; try { s = scoreOf(it, n, q); } catch (e) { s = 0; } if (s > bs) { bs = s; best = it; } });
    if (!best) return { intent: 'unknown', text: 'مش متأكد إني فهمت سؤالك. أقدر أجاوب عن المبيعات، التحصيل، المصنع والجودة، المخزون والمشتريات، الاعتمادات، المعارض والتوقعات — جرّب صياغة تانية أو اختار من الاقتراحات:', chips: suggestions(6) };
    if (!allowed(best)) return { intent: best.id, tone: 'warning', denied: true, text: 'عذرًا، معلومات «' + best.label + '» خارج صلاحياتك الحالية، فمش هقدر أعرضها. لو محتاجها اطلب من مدير النظام إضافتها لدورك.', chips: suggestions(4) };
    try { const a = best.answer(n, q); if (!a) return { intent: 'unknown', text: 'مش لاقي إجابة واضحة للسؤال ده. جرّب واحد من الاقتراحات:', chips: suggestions(6) }; a.intent = best.id; return a; }
    catch (e) { console.error('[ERP.ai.ask] ' + best.id, e); return { intent: best.id, tone: 'warning', text: 'حصلت مشكلة أثناء تجهيز الإجابة. جرّب تاني أو بصيغة مختلفة.' }; }
  }
  const auditAt = {};
  function respond(q) {
    const a = ask(q); const key = (SA.session.userId || '') + ':' + (a.intent || 'unknown');
    if (!auditAt[key] || Date.now() - auditAt[key] > 60000) { auditAt[key] = Date.now(); try { SA.audit('AI.QUERY', { target: { type: 'assistant', id: a.intent || 'unknown', label: String(q).slice(0, 90) }, after: { intent: a.intent || 'unknown', denied: !!a.denied, scoped: M.scoped() }, result: a.denied ? 'denied' : 'success' }); } catch (e) { /* noop */ } }
    return a;
  }

  /* ═════════════ answer rendering + chat view (shared by the page and the floating drawer) ═════════════ */
  const cellNode = (v) => (v && typeof v === 'object' ? (v.chip ? SA.chip(v.text, v.chip) : v.route && M.openable(v.route) ? h('a', { href: '#/' + v.route }, v.text) : String(v.text)) : v == null || v === '' ? '—' : String(v));
  function tableNode(t) { const isNum = (i) => (t.num || []).indexOf(i) >= 0; return h('div.xai-tbl', {}, h('table', {}, h('thead', {}, h('tr', {}, t.cols.map((c, i) => h('th', { class: isNum(i) ? 'num' : null, scope: 'col' }, c)))), h('tbody', {}, t.rows.map((r) => h('tr', {}, r.map((v, i) => h('td', { class: isNum(i) ? 'num' : null }, cellNode(v)))))))); }
  function chartNode(c) {
    if (!c) return null; const f = c.fmt === 'num' ? (v) => fm.num(Math.round(v * 100) / 100) : c.fmt === 'pct' ? (v) => Math.round(v) + '%' : fm.short; let node = null;
    try {
      if (c.type === 'columns') node = ERP.chart.columns({ labels: c.labels, series: c.series, stacked: c.stacked, legend: c.legend, height: c.height || 190, fmt: f });
      else if (c.type === 'line') node = ERP.chart.line({ labels: c.labels, series: c.series, height: c.height || 200, fmt: f });
      else if (c.type === 'bars') node = ERP.chart.bars(c.data.map((d) => Object.assign({}, d, { href: d.route && M.openable(d.route) ? '#/' + d.route : null })), { fmt: f, max: c.max });
      else if (c.type === 'donut') node = ERP.chart.donut(c.data, { center: c.center, sub: c.sub, fmt: f, size: 150 });
      else if (c.type === 'gauges') node = h('div.xai-gauges', {}, c.data.map((d) => ERP.chart.gauge(d.value, { label: d.label, size: 112 })));
    } catch (e) { console.error('[mod-ai] chart', e); }
    return node ? h('div.xai-chartbox', {}, c.title ? h('span.xai-ct', {}, c.title) : null, node) : null;
  }
  const linksNode = (links) => { const l = (links || []).filter((x) => x && M.openable(x.route)); return l.length ? h('div.xai-links', {}, l.map((x) => h('a.btn.btn-ghost.btn-sm', { href: '#/' + x.route }, x.label, SA.icon('arrowleft', 'icon-sm')))) : null; };

  ERP.ai = { insights, brief, ask, suggestions, norm };
  ERP.ai.chatView = function (o) {
    o = o || {}; const u = SA.session.user; const KEY = 'eg.ai.chat.' + (u ? u.id : 'anon');
    let msgs = []; try { msgs = JSON.parse(sessionStorage.getItem(KEY) || '[]') || []; } catch (e) { msgs = []; }
    const timers = []; let busy = false; let dead = false;
    const list = h('div.xai-msgs', { role: 'log', 'aria-live': 'polite', 'aria-label': 'المحادثة مع المساعد الذكي' });
    const input = h('textarea.textarea.xai-inp', { rows: 1, placeholder: 'اسأل عن المبيعات، التحصيل، المصنع، المخزون، أو أي طلب برقمه…', 'aria-label': 'اكتب سؤالك للمساعد' });
    const sendBtn = h('button.btn.btn-primary.xai-send', { type: 'button', 'aria-label': 'إرسال السؤال', title: 'إرسال (Enter)' }, SA.icon('send'));
    const chipsEl = h('div.xai-chips', { role: 'group', 'aria-label': 'أسئلة مقترحة' });
    const el = h('div.xai-chat' + (o.compact ? '.is-compact' : ''), {}, list, chipsEl, h('div.xai-composer', {}, input, sendBtn), h('p.xai-disc', {}, SA.icon('info', 'icon-sm'), h('span', {}, DISCLOSURE)));
    const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(140, Math.max(44, input.scrollHeight)) + 'px'; };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    input.addEventListener('input', grow); sendBtn.addEventListener('click', () => send());
    list.addEventListener('click', (e) => { const a = e.target && e.target.closest ? e.target.closest('a[href^="#/"]') : null; if (a && o.onNavigate) o.onNavigate(); });
    const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-40))); } catch (e) { /* noop */ } };
    const scroll = () => { list.scrollTop = list.scrollHeight; };
    const later = (fn, ms) => { const t = setTimeout(() => { if (!dead) fn(); }, ms); timers.push(t); return t; };
    const chip = (text) => h('button.xai-chip', { type: 'button', onclick: () => send(text) }, text);
    const ava = () => h('span.xai-ava', { 'aria-hidden': 'true' }, SA.icon('bot', 'icon-sm'));
    function typewrite(p, text, done) { const step = Math.max(2, Math.ceil(text.length / 45)); let i = 0; const tick = () => { i = Math.min(text.length, i + step); p.textContent = text.slice(0, i); if (i < text.length) later(tick, 16); else done(); }; tick(); }
    function actionNode(m) {
      const a = m.ans.action; const it = a && ERP.item(a.itemId); if (!it) return null;
      if (a.done) return h('div.xai-act', {}, h('span.xai-done', {}, SA.icon('checkcircle', 'icon-sm'), 'تم إنشاء طلب الشراء ', ERP.ui.docLink(a.done)));
      return h('div.xai-act', {}, h('div.xai-act-row', {}, ERP.ui.itemCell(a.itemId), h('b.num', {}, num(a.qty) + ' ' + uomOf(it))),
        h('div.xai-act-row', {}, h('small.t-muted', {}, 'المورد: ' + ERP.supplierName(it.supplierId) + ' · مدة التوريد ' + (it.leadDays || 7) + ' يوم · مطلوب قبل ' + fm.date(a.neededBy)), SA.btn({ label: 'تأكيد إنشاء طلب الشراء', icon: 'plus', kind: 'primary', size: 'sm', perm: 'scm.requisitions.create', onClick: () => doPRQ(m) })));
    }
    function msgNode(m, animate) {
      if (m.role === 'user') return h('div.xai-msg.is-user', {}, h('div.xai-bub', {}, h('p.xai-text', {}, m.text), h('div.xai-meta', {}, SA.fmt.time(m.ts))));
      const a = m.ans || {}; const anim = animate && !SA.reducedMotion;
      const p = h('p.xai-text', {}, anim ? '' : a.text || '');
      const blocks = h('div.xai-blocks', {}, a.table && a.table.rows && a.table.rows.length ? tableNode(a.table) : null, chartNode(a.chart), a.action ? actionNode(m) : null, a.note ? h('p.xai-note', {}, SA.icon('info', 'icon-sm'), h('span', {}, a.note)) : null, linksNode(a.links), a.chips && a.chips.length ? h('div.xai-chips', {}, a.chips.map(chip)) : null);
      const node = h('div.xai-msg.is-ai' + (a.tone ? '.xai-tone-' + a.tone : ''), {}, ava(), h('div.xai-bub', {}, a.denied ? h('span.xai-flag', {}, SA.icon('lock', 'icon-sm'), 'محمي بالصلاحيات') : null, p, blocks, h('div.xai-meta', {}, SA.icon('sparkle', 'icon-sm'), 'المساعد الذكي · ' + SA.fmt.time(m.ts), a.scoped ? ' · عملاؤك فقط' : null)));
      if (anim) { blocks.style.display = 'none'; typewrite(p, a.text || '', () => { blocks.style.display = ''; scroll(); }); }
      return node;
    }
    function welcome() {
      const nm = M.shortName((u || {}).name || ''); const lines = get('lines'); const down = lines.filter((l) => l.status === 'down').length;
      return h('div.xai-msg.is-ai.xai-welcome', {}, ava(), h('div.xai-bub', {}, h('p.xai-text', {}, 'أهلًا يا ', h('b', {}, nm), ' — أنا مساعد نظام المصرية الألمانية. اسألني بالعربي أو بالعامية عن المبيعات، التحصيل، المصنع، المخزون، الاعتمادات… وهجاوبك من بيانات النظام الحالية وبحدود صلاحياتك' + (M.scoped() ? ' (هشوف عملاءك فقط)' : '') + '.' + (down && allowed(byId.lines) ? ' ملحوظة سريعة: في ' + down + ' خط متوقف الآن.' : '')), h('div.xai-blocks', {}, h('div.xai-chips', {}, suggestions(o.compact ? 4 : 6).map(chip))), h('div.xai-meta', {}, SA.icon('sparkle', 'icon-sm'), 'المساعد الذكي')));
    }
    function draw() { SA.clear(list); if (!msgs.length) list.appendChild(welcome()); msgs.forEach((m) => list.appendChild(msgNode(m, false))); drawChips(); later(scroll, 0); }
    function drawChips() { SA.clear(chipsEl); if (!msgs.length) return; const asked = msgs.filter((m) => m.role === 'user').map((m) => m.text); suggestions(o.compact ? 3 : 5, asked).forEach((t) => chipsEl.appendChild(chip(t))); }
    function push(m, animate) { msgs.push(m); save(); const wl = list.querySelector('.xai-welcome'); if (wl) wl.remove(); list.appendChild(msgNode(m, animate)); scroll(); }
    function send(qText) {
      const q = String(qText != null ? qText : input.value).trim(); if (!q || busy || dead) return;
      input.value = ''; grow(); busy = true; sendBtn.disabled = true;
      push({ role: 'user', text: q, ts: new Date().toISOString() });
      const typing = h('div.xai-msg.is-ai', {}, ava(), h('div.xai-bub', {}, h('span.xai-typing', { role: 'status', 'aria-label': 'المساعد يكتب' }, h('i'), h('i'), h('i')))); list.appendChild(typing); scroll();
      later(() => { typing.remove(); let a; try { a = respond(q); } catch (e) { console.error('[mod-ai] respond', e); a = { tone: 'warning', text: 'حصلت مشكلة غير متوقعة. جرّب تاني.' }; } push({ role: 'ai', ans: a, ts: new Date().toISOString() }, true); busy = false; sendBtn.disabled = false; drawChips(); if (!o.compact) input.focus(); }, 520 + Math.round(Math.random() * 320));
    }
    async function doPRQ(m) {
      const a = m.ans.action; const it = ERP.item(a.itemId); if (!it || a.done) return; const open = get('purchaseRequisitions').find((r) => r.itemId === a.itemId && (r.status === 'open' || r.status === 'approved'));
      const r = await SA.confirm({ title: 'إنشاء طلب شراء من المساعد الذكي', icon: 'cart', text: 'هيتم إنشاء طلب شراء داخلي لـ «' + it.name + '» بكمية ' + num(a.qty) + ' ' + uomOf(it) + '، مطلوب قبل ' + fm.date(a.neededBy) + '.', impact: ['يظهر فورًا في «طلبات الشراء الداخلية» ويصل إشعار لقسم المشتريات.', 'يُسجَّل في سجل التدقيق باسمك كإجراء من توصية ذكية (AI.INSIGHT_ACTION + PRQ.CREATED).'], warnings: open ? ['يوجد طلب مفتوح لنفس الصنف: ' + open.id + ' (' + num(open.qty) + ' ' + uomOf(it) + ').'] : [], confirmLabel: 'إنشاء الطلب' });
      if (!r || !r.ok) return; let prq = null;
      try { await SA.api(() => { prq = F.createPRQ({ itemId: a.itemId, qty: a.qty, reason: a.reason, source: a.source || 'manual', neededBy: a.neededBy }); SA.audit('AI.INSIGHT_ACTION', { target: { type: 'prq', id: prq.id, label: it.name }, after: { action: 'create_prq', qty: a.qty, via: o.compact ? 'assistant_drawer' : 'assistant_page' } }); }); } catch (e) { return SA.fail(e); }
      if (dead) { SA.toast('تم إنشاء طلب الشراء ' + prq.id, 'success'); return; }
      a.done = prq.id; save(); draw();
      push({ role: 'ai', ans: { intent: 'prq_done', tone: 'success', text: 'تم إنشاء طلب الشراء ' + prq.id + ' لـ «' + it.name + '» (' + num(a.qty) + ' ' + uomOf(it) + ') وإبلاغ قسم المشتريات. تقدر تتابعه من شاشة طلبات الشراء.', links: [{ label: 'طلبات الشراء', route: 'scm/requisitions' }] }, ts: new Date().toISOString() }, true);
      SA.toast('تم إنشاء طلب الشراء ' + prq.id, 'success');
    }
    draw();
    return { el, send, focus: () => input.focus(), clear() { msgs = []; save(); draw(); }, destroy() { dead = true; timers.forEach(clearTimeout); }, get count() { return msgs.length; } };
  };

  /* ═════════════ data-changing insight actions (confirm + AI.INSIGHT_ACTION) ═════════════ */
  async function actPRQ(row) {
    const it = row.item; const r = await SA.confirm({ title: 'إنشاء طلب شراء من الطلب الذكي', icon: 'cart', text: it.name + ' — الكمية المقترحة ' + num(row.suggest) + ' ' + uomOf(it) + ' من ' + ERP.supplierName(it.supplierId) + ' (توريد ' + row.lead + ' يوم).', impact: ['ينشئ طلب شراء داخلي ويُبلّغ قسم المشتريات.', 'السبب المسجل: التغطية ≈ ' + Math.round(row.onHandCover) + ' يوم مقابل توريد ' + row.lead + ' يوم.', 'يُسجَّل في التدقيق كإجراء من توصية ذكية (AI.INSIGHT_ACTION).'], confirmLabel: 'إنشاء طلب الشراء' });
    if (!r.ok) return; let prq;
    try { await SA.api(() => { prq = F.createPRQ({ itemId: it.id, qty: row.suggest, reason: 'توصية الطلب الذكي — تغطية ≈ ' + Math.round(row.onHandCover) + ' يوم مقابل توريد ' + row.lead + ' يوم', source: 'reorder', neededBy: ERP.day(row.lead) }); SA.audit('AI.INSIGHT_ACTION', { target: { type: 'prq', id: prq.id, label: it.name }, after: { action: 'create_prq', qty: row.suggest, via: 'insights' } }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم إنشاء طلب الشراء ' + prq.id + ' — ' + first2(it.name), 'success');
  }
  async function actPM(x) {
    const m = x.machine; const r = await SA.confirm({ title: 'جدولة صيانة وقائية (توصية ذكية)', icon: 'wrench', text: m.id + ' — ' + m.name + '. سيتم إنشاء أمر صيانة وقائية مجدول لبكرة وإسناده لمدير الصيانة.', impact: ['ينشئ أمر صيانة جديد بحالة «مجدول» ويصل إشعار لمدير الصيانة.', 'يُسجَّل PM.SCHEDULED + AI.INSIGHT_ACTION في سجل التدقيق.'], confirmLabel: 'جدولة الصيانة' });
    if (!r.ok) return; let id;
    try { await SA.api(() => { id = ERP.no('MWO'); st.insert('maintenanceOrders', { id, kind: 'preventive', machineId: m.id, lineId: m.lineId, title: 'صيانة وقائية (توصية ذكية) — ' + m.name, priority: m.criticality === 'A' ? 'high' : 'normal', status: 'scheduled', reportedBy: SA.session.userId, assigneeId: 'U-31', openedAt: ERP.now(), plannedAt: ERP.day(1), doneAt: null, downtimeMin: 0, parts: [], cost: null, source: 'ai', notes: 'سبب التوصية: درجة المخاطرة ' + x.score + '/100' }, true);
      SA.audit('PM.SCHEDULED', { target: { type: 'mwo', id, label: m.name }, after: { machine: m.id, plannedAt: ERP.day(1), source: 'ai' } }); SA.audit('AI.INSIGHT_ACTION', { target: { type: 'mwo', id, label: m.name }, after: { action: 'schedule_pm', score: x.score } });
      SA.notify({ title: 'صيانة وقائية مجدولة: ' + m.id, body: m.name + ' — بتوصية من المساعد الذكي (مخاطرة ' + x.score + '/100).', level: 'action', to: ['R-18'], link: '#/care/maintenance/' + id }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم إنشاء أمر الصيانة ' + id + ' لـ ' + m.id, 'success');
  }
  async function actFollow(c) {
    const r = await SA.confirm({ title: 'تكليف المندوب بمتابعة التحصيل', icon: 'phone', text: c.name + ' — متأخرات ' + short(c.overdue) + '. سيتم تسجيل مهمة متابعة (مكالمة) باسم المندوب ' + SA.userName(c.repId) + ' لبكرة وإبلاغه.', impact: ['تظهر المهمة في المكالمات والزيارات للمندوب.', 'يصل إشعار للمندوب ويُسجَّل AI.INSIGHT_ACTION.'], confirmLabel: 'تكليف المندوب' });
    if (!r.ok) return; const id = 'ACT-AI-' + Date.now().toString(36).toUpperCase();
    try { await SA.api(() => { const at = new Date(); at.setDate(at.getDate() + 1); at.setHours(10, 0, 0, 0); st.insert('activities', { id, kind: 'call', leadId: null, customerId: c.customerId, soId: null, ownerId: c.repId, at: at.toISOString(), dueAt: ERP.day(1), planned: true, createdAt: ERP.now(), note: 'متابعة تحصيل (توصية ذكية): متأخرات ' + short(c.overdue) + (c.maxLate ? '، أقدم تأخير ' + c.maxLate + ' يوم' : ''), done: false, source: 'ai', createdBy: SA.session.userId }, true);
      SA.audit('AI.INSIGHT_ACTION', { target: { type: 'customer', id: c.customerId, label: c.name }, after: { action: 'collection_followup', activity: id, rep: c.repId, overdue: Math.round(c.overdue) } });
      if (c.repId) SA.notify({ title: 'متابعة تحصيل: ' + c.name, body: 'متأخرات ' + short(c.overdue) + ' — كلّم العميل بكرة وسجّل النتيجة.', level: 'action', toUsers: [c.repId], to: [], link: '#/crm/customers/' + c.customerId }); }); } catch (e) { return SA.fail(e); }
    SA.toast('تم تكليف ' + SA.userName(c.repId) + ' بمتابعة ' + c.name, 'success');
  }

  /* ═════════════ exec-insights page ═════════════ */
  function insightCard(x) {
    return h('div.erp-ai-card.is-' + (x.tone || 'info'), {}, h('span.erp-ai-badge', {}, SA.icon('sparkle', 'icon-sm'), 'AI'),
      h('div.erp-ai-body', {}, h('b', {}, x.title), h('p', {}, x.text), x.why ? h('details.xai-why', {}, h('summary', {}, SA.icon('info', 'icon-sm'), 'لماذا؟'), h('p', {}, x.why)) : null,
        x.actions && x.actions.length ? h('div.erp-ai-acts', {}, x.actions.map((a) => h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: a.onClick || (() => SA.nav(a.route)) }, a.label))) : null));
  }
  const why = (text) => h('details.xai-why', {}, h('summary', {}, SA.icon('info', 'icon-sm'), 'لماذا؟'), h('p', {}, text));
  const rowItem = (o) => h('div.xai-row', {}, o.lead, h('div', {}, h('b', {}, o.route && M.openable(o.route) ? h('a', { href: '#/' + o.route }, o.title) : o.title), o.sub ? h('small', {}, o.sub) : null, o.why ? why(o.why) : null), h('div.xai-row-acts', {}, o.acts || null));
  const score = (v, level) => h('span.xai-score.is-' + level, { title: 'درجة المخاطرة من 100' }, String(v), h('small', {}, level === 'high' ? 'عالية' : level === 'medium' ? 'متوسطة' : 'منخفضة'));
  function anomalies() {
    const out = []; const dates = M.prodDates(); const last = dates[dates.length - 1]; const hist = dates.slice(-15, -1); const PD = get('prodDaily');
    if (last) get('lines').forEach((ln) => { const H = hist.map((d) => PD.find((p) => p.date === d && p.lineId === ln.id)).filter(Boolean); const r = PD.find((p) => p.date === last && p.lineId === ln.id); if (!r || H.length < 5) return;
      const sp = (x) => (x.good + x.scrap ? x.scrap / (x.good + x.scrap) : 0); const ms = mean(H.map(sp)), ss = sd(H.map(sp));
      if (sp(r) > ms + 2 * ss && sp(r) > 0.025) out.push({ tone: 'warning', icon: 'alert', title: 'هالك غير معتاد على ' + ln.id + ' — ' + ln.name, sub: 'نسبة الهالك ' + pct1(sp(r)) + ' يوم ' + fm.date(last) + ' مقابل متوسط ' + pct1(ms) + ' لآخر 14 يوم.', why: 'القيمة أعلى من المتوسط بأكثر من انحرافين معياريين (σ = ' + pct1(ss) + ') ومن 2.5%.', route: 'mfg/lines/' + ln.id });
      const md = mean(H.map((x) => x.downtimeMin)), sdd = sd(H.map((x) => x.downtimeMin)); if (r.downtimeMin > md + 2 * sdd && r.downtimeMin >= 60) out.push({ tone: 'danger', icon: 'clock', title: 'توقفات مرتفعة على ' + ln.id + ' — ' + ln.name, sub: num(r.downtimeMin) + ' دقيقة توقف يوم ' + fm.date(last) + ' مقابل متوسط ' + Math.round(md) + ' دقيقة.', why: 'التوقفات اليومية أعلى من المتوسط + انحرافين معياريين وأكثر من ساعة.', route: 'mfg/lines/' + ln.id });
      const eu = (x) => (x.good ? x.energyKwh / x.good : 0); const me0 = mean(H.map(eu)); if (me0 && eu(r) > me0 * 1.2) out.push({ tone: 'info', icon: 'bolt', title: 'استهلاك طاقة أعلى لكل وحدة على ' + ln.id, sub: (Math.round(eu(r) * 100) / 100) + ' ك.و.س/وحدة مقابل متوسط ' + (Math.round(me0 * 100) / 100) + ' (+' + pct((eu(r) - me0) / me0) + ').', why: 'الطاقة المستهلكة ÷ الإنتاج الجيد، أعلى من متوسط آخر 14 يوم بأكثر من 20% — غالبًا بسبب تشغيل بدون إنتاج كامل (توقفات/تسخين).', route: 'mfg/lines/' + ln.id }); });
    const d = M.delta(M.salesMTD(), M.salesPrevMTD()); if (d != null && Math.abs(d) >= 0.25) out.push({ tone: d < 0 ? 'warning' : 'success', icon: 'trend', title: d < 0 ? 'تباطؤ في مبيعات الشهر' : 'قفزة في مبيعات الشهر', sub: 'المبيعات حتى اليوم ' + (d < 0 ? 'أقل' : 'أعلى') + ' بـ ' + pct(Math.abs(d)) + ' من نفس الفترة الشهر الماضي.', why: 'مقارنة صافي فواتير الشهر الحالي حتى اليوم بنفس عدد الأيام من الشهر السابق؛ الفرق أكبر من 25%.', route: 'exec/reports?r=sales-month' });
    M.orders().filter((o) => ['draft', 'pending_approval'].indexOf(o.status) >= 0 && o.discountPct > F.limits.discountPct).slice(0, 2).forEach((o) => out.push({ tone: 'info', icon: 'tag', title: 'خصم أعلى من الحد على ' + o.id, sub: ERP.customerName(o.customerId) + ' — خصم ' + o.discountPct + '% (الحد التجريبي ' + F.limits.discountPct + '%)، ' + stl('so', o.status) + '.', why: 'أوامر بيع مسودة أو بانتظار الاعتماد نسبة خصمها أعلى من حد اعتماد المندوب (قيمة تجريبية — بند 33 Open).', route: 'crm/orders/' + o.id }));
    const lim = new Date(Date.now() - 30 * 864e5).toISOString(); get('qcInspections').filter((q) => String(q.at || '') >= lim && (q.params || []).some((p) => p.ok === false)).slice(0, 2).forEach((q) => { const p = q.params.find((x) => x.ok === false); out.push({ tone: 'warning', icon: 'beaker', title: 'قياس خارج المواصفة: ' + first2(ERP.itemName(q.itemId)) + ' ' + (((ERP.item(q.itemId) || {}).attrs || {}).color || ''), sub: p.name + ' = ' + p.value + ' (المواصفة ' + p.spec + ') — ' + q.id + '.', why: 'معاملات فحص الجودة المسجلة كغير مطابقة آخر 30 يوم.', route: 'mfg/qc/' + q.id }); });
    return out;
  }
  function opportunities() {
    const out = [];
    M.staleLeads(70, 7).slice(0, 3).forEach((l) => out.push({ tone: 'info', icon: 'target', title: l.company + ' — ' + short(l.value), sub: stl('lead', l.stage) + ' · تقييم ' + l.score + ' · ' + (l.lastAt ? 'آخر تواصل ' + SA.fmt.rel(l.lastAt) : 'لا يوجد تواصل مسجل') + ' · ' + SA.userName(l.ownerId), why: 'فرصة بتقييم ≥ 70 بدون نشاط آخر 7 أيام — المتابعة الآن ترفع احتمال الكسب.', route: 'crm/leads/' + l.id }));
    const lastInv = {}; const s12 = {}; M.invoices().forEach((i) => { if (!lastInv[i.customerId] || i.issueDate > lastInv[i.customerId]) lastInv[i.customerId] = i.issueDate; if (i.issueDate >= ERP.day(-365)) s12[i.customerId] = (s12[i.customerId] || 0) + M.net(i); });
    Object.keys(lastInv).filter((k) => ERP.daysBetween(lastInv[k]) > 45 && (s12[k] || 0) >= 300000).slice(0, 2).forEach((k) => out.push({ tone: 'info', icon: 'refresh', title: 'إعادة تنشيط: ' + ERP.customerName(k), sub: 'آخر فاتورة منذ ' + ERP.daysBetween(lastInv[k]) + ' يوم بينما مشترياته آخر 12 شهر ' + short(s12[k]) + '.', why: 'عميل بمبيعات سنوية ≥ 300 ألف ولم يشترِ منذ أكثر من 45 يوم — احتمال تحوّل لمنافس.', route: 'crm/customers/' + k }));
    get('quotations').filter((q) => q.status === 'sent' && q.validUntil && q.validUntil <= ERP.day(7) && q.validUntil >= ERP.day(0) && (!M.scoped() || SA.scopeFilter('sales', [q], 'repId').length)).forEach((q) => out.push({ tone: 'warning', icon: 'receipt', title: 'عرض سعر ينتهي خلال ' + daysTo(q.validUntil) + ' يوم: ' + q.id, sub: (q.prospect || ERP.customerName(q.customerId)) + ' — ' + short(F.totals(q).total) + ' · ' + SA.userName(q.repId), why: 'عروض أسعار مُرسلة تنتهي صلاحيتها خلال أسبوع بدون رد.', route: 'crm/quotes/' + q.id }));
    const cap = M.capacity('clad'); const dd = M.demand('clad', true); if (cap && dd.next && cap.effective && dd.next.v / cap.effective < 0.5) out.push({ tone: 'success', icon: 'globe', title: 'طاقة متاحة في التجاليد — فرصة تصدير', sub: 'الطلب المتوقع ≈ ' + pct(dd.next.v / cap.effective) + ' من الطاقة الفعلية لخط التجاليد. عملاء الخليج المحتملون من معرض مسقط في مرحلة التفاوض.', why: 'مقارنة توقع كميات التجاليد للشهر القادم بالطاقة الفعلية للخط (طاقة × ورديات × 26 يوم × OEE).', route: 'crm/pipeline' });
    return out;
  }
  function forecastCard(state) {
    const box = h('div');
    function draw() {
      SA.clear(box); const fam = state.fam === 'all' ? null : state.fam; const d = M.demand(fam, false); if (!d.f) { box.appendChild(SA.empty({ title: 'بيانات غير كافية للتوقع' })); return; }
      const labels = d.keys.concat(d.fKeys.slice(1)).map(ERP.monthLabel); const nul = () => Array(labels.length).fill(null); const act0 = d.hist.concat([null, null, null, null]); const cur = nul(); cur[11] = d.cur; const fc = nul(), hi = nul(), lo = nul();
      fc[10] = hi[10] = lo[10] = d.hist[10]; d.f.out.forEach((o, i) => { fc[11 + i] = Math.round(o.v); hi[11 + i] = Math.round(o.hi); lo[11 + i] = Math.round(o.lo); });
      const u = M.demand(fam, true); const cap = fam ? M.capacity(fam) : null;
      box.append(ERP.chart.line({ labels, height: 250, series: [{ name: 'فعلي (شهور مكتملة)', values: act0, color: ERP.palette[0] }, { name: 'الشهر الحالي حتى اليوم', values: cur, color: ERP.palette[5] }, { name: 'التوقع', values: fc, color: ERP.palette[3], dashed: true }, { name: 'نطاق الثقة — أعلى', values: hi, color: C.band, dashed: true }, { name: 'نطاق الثقة — أدنى', values: lo, color: C.band, dashed: true }] }),
        h('div.table-wrap', {}, h('table.table.xai-mt', {}, h('thead', {}, h('tr', {}, ['الشهر', 'التوقع (قيمة)', 'الحد الأدنى', 'الحد الأعلى', fam ? 'الكمية المتوقعة' : null, cap ? 'تحميل الطاقة الفعلية' : null].filter(Boolean).map((c, i) => h('th', { class: i ? 'num' : null }, c)))),
          h('tbody', {}, d.f.out.map((o, i) => h('tr', {}, h('td', {}, ERP.monthLabel(d.fKeys[i]) + (i === 0 ? ' (تقدير الإغلاق)' : '')), h('td.num', {}, money(o.v)), h('td.num', {}, money(o.lo)), h('td.num', {}, money(o.hi)), fam ? h('td.num', {}, u.f ? num(u.f.out[i].v) + ' ' + (cap ? cap.uom : '') : '—') : null, cap ? h('td.num', {}, u.f && cap.effective ? pct(u.f.out[i].v / cap.effective) : '—') : null))))),
        why('نموذج بسيط وشفاف: انحدار خطي على آخر 11 شهر مكتمل من الفواتير × معامل موسمية مخفّف (60%) من نفس الشهر في السنة الماضية. نطاق الثقة = ± الخطأ المعياري للنموذج (' + short(d.f.rmse) + ') ويتسع كلما بعد الشهر. في النسخة الفعلية: نموذج تنبؤ يتعلم من سنوات البيانات والعوامل الخارجية (المواسم، المعارض، الأسعار) ويتم مراجعته شهريًا.'));
    }
    const seg = SA.segmented([['all', 'كل المنتجات'], ['door', 'الأبواب'], ['clad', 'التجاليد'], ['foam', 'الفوم بورد']], state.fam, (v) => { state.fam = v; draw(); });
    draw();
    return SA.card({ title: 'توقع الطلب — الشهر الحالي + 3 شهور قادمة', tags: ERP.ui.demo('توقع إحصائي') }, h('div.xai-fc-tools', {}, seg, h('span.xai-note', {}, SA.icon('info', 'icon-sm'), h('span', {}, 'الخطوط المتقطعة = التوقع ونطاق الثقة'))), box);
  }
  function reorderCard() {
    const plan = M.reorderPlan(); const now = plan.filter((x) => x.status === 'now').length;
    const rows = plan.slice(0, 12).map((x) => h('tr', {}, h('td', {}, ERP.ui.itemCell(x.itemId)), h('td.num', {}, num(x.avail) + ' ' + uomOf(x.item)), h('td.num', {}, num(x.onOrder)), h('td.num', {}, num(x.need)), h('td.num', {}, num(x.daily)), h('td.num', {}, String(Math.round(x.onHandCover))), h('td.num', {}, String(x.lead)),
      h('td', {}, x.status === 'now' ? SA.chip('اطلب اليوم', 'danger') : SA.chip('قبل ' + fm.date(x.orderBy), 'warning')), h('td.num', {}, num(x.suggest) + ' ' + uomOf(x.item)), h('td', {}, x.openPrq ? ERP.ui.docLink(x.openPrq.id) : '—'),
      h('td', {}, SA.btn({ label: 'طلب شراء', icon: 'plus', kind: 'ghost', size: 'sm', perm: 'scm.requisitions.create', reason: x.openPrq ? 'يوجد طلب مفتوح ' + x.openPrq.id : null, onClick: () => actPRQ(x) }))));
    return SA.card({ title: 'الطلب الذكي للخامات وقطع الغيار', tags: [now ? SA.chip(now + ' اطلب اليوم', 'danger') : null, ERP.ui.demo('توصية')], actions: [M.openable('scm/requisitions') ? h('a.btn.btn-ghost.btn-sm', { href: '#/scm/requisitions' }, 'طلبات الشراء') : null] },
      plan.length ? h('div.table-wrap', {}, h('table.table.xai-mt', {}, h('thead', {}, h('tr', {}, ['الصنف', 'المتاح', 'على الطلب', 'احتياج أوامر التشغيل', 'استهلاك/يوم', 'يكفي (يوم)', 'التوريد (يوم)', 'موعد الطلب', 'الكمية المقترحة', 'طلب مفتوح', ''].map((c, i) => h('th', { class: i && i < 7 || i === 8 ? 'num' : null }, c)))), h('tbody', {}, rows))) : SA.empty({ icon: 'checkcircle', title: 'كل الأصناف تغطي مدة التوريد', text: 'لا توجد توصيات شراء حاليًا.' }),
      why('من ERP.flow.mrp() وأرصدة المخزون: الاستهلاك اليومي = الأعلى بين (حد الطلب المعتمد ÷ (مدة التوريد + ' + M.SAFETY_DAYS + ' أيام أمان)) و(احتياج أوامر التشغيل المخططة ÷ 14 يوم). موعد الطلب = اليوم + (التغطية شاملة الكميات على الطلب − مدة التوريد − أيام الأمان). الكمية المقترحة تغطي مدة التوريد + 30 يوم وبحد أدنى كمية الطلب (MOQ).'));
  }
  function machineCard() {
    const list = M.machineRisk().filter((x) => x.score >= 20).slice(0, 6);
    return SA.card({ title: 'مخاطر الأعطال — ماكينات تحتاج تدخل', tags: ERP.ui.demo('تقدير') }, list.length ? h('div.xai-rows', {}, list.map((x) => { const m = x.machine; const lvl = x.score >= 60 ? 'high' : x.score >= 35 ? 'medium' : 'low';
      const rs = [x.overdueDays > 0 ? 'وقائية متأخرة ' + x.overdueDays + ' يوم' : null, m.status === 'down' ? 'متوقفة الآن' : m.status === 'maintenance' ? 'تحت الصيانة' : null, m.mtbfH < 350 ? 'MTBF منخفض ' + m.mtbfH + ' س' : null, x.breakdowns ? x.breakdowns + ' أعطال/30 يوم' : null, m.criticality === 'A' ? 'ماكينة حرجة (A)' : null].filter(Boolean).join(' · ');
      return rowItem({ lead: score(x.score, lvl), title: m.id + ' — ' + m.name, sub: (m.lineId ? M.lineName(m.lineId) + ' · ' : 'مرافق المصنع · ') + rs + (x.openMwo ? ' · مفتوح: ' + x.openMwo.id : ''), route: 'care/assets/' + m.id,
        why: 'الدرجة = تأخر الصيانة الوقائية (25 + 2/يوم حتى 45) + الحالة الحالية (عطل 30) + MTBF أقل من 350 ساعة (15) + 10 لكل عطل آخر 30 يوم + أهمية الماكينة (A = 10).',
        acts: [SA.btn({ label: 'جدولة وقائية', icon: 'calendar', kind: 'ghost', size: 'sm', perm: 'care.maintenance.create', reason: x.openMwo ? 'يوجد أمر صيانة مفتوح ' + x.openMwo.id : null, onClick: () => actPM(x) })] }); })) : SA.empty({ icon: 'checkcircle', title: 'لا توجد ماكينات عالية المخاطرة' }));
  }
  function payCard() {
    const list = M.payRisk().slice(0, 6);
    return SA.card({ title: 'مخاطر التحصيل — عملاء' + (M.scoped() ? 'ك' : ''), tags: ERP.ui.demo('تقدير') }, list.length ? h('div.xai-rows', {}, list.map((c) => rowItem({ lead: score(c.score, c.level), title: c.name, route: 'crm/customers/' + c.customerId,
      sub: 'متأخر ' + short(c.overdue) + (c.maxLate ? ' · أقدم تأخير ' + c.maxLate + ' يوم' : '') + ' · مستحق ' + short(c.open) + (c.limit ? ' · استخدام الحد ' + pct(c.util) : '') + (c.bounced ? ' · ' + pl(c.bounced, FN.chq) + ' مرتد' : '') + ' · المندوب ' + SA.userName(c.repId),
      why: 'الدرجة = مدة التأخير (حتى 40) + حجم المتأخر نسبةً للحد الائتماني (حتى 25) + الشيكات المرتدة آخر 6 شهور (20+) + تجاوز الحد الائتماني (15). بدون إيقاف تلقائي للعميل (بند 41) — القرار للمبيعات والمالية.',
      acts: [SA.btn({ label: 'تكليف المندوب', icon: 'phone', kind: 'ghost', size: 'sm', perm: 'crm.activities.create', reason: c.repId ? null : 'لا يوجد مندوب للعميل', onClick: () => actFollow(c) })] }))) : SA.empty({ icon: 'checkcircle', title: 'لا توجد مخاطر تحصيل حاليًا' }));
  }
  const listCard = (title, items, empty) => SA.card({ title }, items.length ? h('div.xai-rows', {}, items.map((x) => rowItem({ lead: h('span.xai-tico.is-' + (x.tone || 'info'), {}, SA.icon(x.icon || 'sparkle', 'icon-sm')), title: x.title, sub: x.sub, why: x.why, route: x.route, acts: [M.openable(x.route) ? h('a.btn.btn-ghost.btn-sm', { href: '#/' + x.route }, 'فتح') : null] }))) : SA.empty({ icon: 'checkcircle', title: empty }));
  function insightsPage(root, ctx) {
    ctx.setCrumbs([{ label: 'الذكاء الاصطناعي' }, { label: 'التنبؤات والتنبيهات الذكية' }]);
    const state = { fam: 'all' }; const body = h('div.xai-ipage');
    root.append(SA.pageHead({ title: 'التنبؤات والتنبيهات الذكية', desc: 'المساعد بيراجع كل بيانات النظام باستمرار ويطلّع المخاطر والفرص قبل ما تحصل — كل توصية معاها «لماذا؟» وإجراء.', tags: [SA.tag('new'), ERP.ui.demo('محاكاة AI')], actions: [SA.can('exec.ai.use') ? SA.btn({ label: 'اسأل نظامك', icon: 'bot', kind: 'primary', onClick: () => SA.nav('exec/ai') }) : null] }),
      SA.alert('info', h('b', {}, 'محاكاة: '), 'في النسخة الفعلية يتصل بنموذج ذكاء اصطناعي (Claude) على بيانات النظام وبصلاحياتك. هنا كل الأرقام محسوبة لحظيًا من بيانات النموذج — غيّر أي بيان وشوف التوصيات تتغير.'), body);
    function build() {
      const all = insights('all'); const plan = M.reorderPlan(); const risk = M.payRisk().filter((c) => c.level === 'high'); const mr = M.machineRisk().filter((x) => x.score >= 60); const d = M.demand(null, false);
      return h('div.xai-ipage', {},
        ERP.ui.kpis([ERP.ui.kpi({ label: 'تنبيهات حرجة', value: String(all.filter((x) => x.tone === 'danger').length), icon: 'alert', tone: 'danger', sub: 'تحتاج تدخل اليوم' }), ERP.ui.kpi({ label: 'تحذيرات', value: String(all.filter((x) => x.tone === 'warning').length), icon: 'info', tone: 'warning', sub: 'متابعة خلال الأسبوع' }),
          ERP.ui.kpi({ label: 'توقع مبيعات ' + monthName(d.fKeys[1]), value: d.next ? short(d.next.v) : '—', icon: 'trend', sub: d.next ? 'نطاق ' + short(d.next.lo) + ' – ' + short(d.next.hi) : '' }), ERP.ui.kpi({ label: 'أصناف تُطلب اليوم', value: String(plan.filter((x) => x.status === 'now').length), icon: 'cart', tone: plan.some((x) => x.status === 'now') ? 'danger' : null, sub: plan.length + ' صنف في قائمة الطلب الذكي' }),
          ERP.ui.kpi({ label: 'عملاء عالية المخاطرة', value: String(risk.length), icon: 'coins', tone: risk.length ? 'warning' : null, sub: 'تحصيل' + (M.scoped() ? ' — عملاؤك' : '') }), ERP.ui.kpi({ label: 'ماكينات عالية المخاطرة', value: String(mr.length), icon: 'wrench', tone: mr.length ? 'warning' : null, sub: 'أعطال محتملة' })]),
        SA.card({ title: 'تنبيهات وتوصيات اليوم', tags: SA.chip(all.length + ' توصية', 'info') }, all.length ? h('div.xai-icards', {}, all.map(insightCard)) : SA.empty({ icon: 'checkcircle', title: 'لا توجد تنبيهات حاليًا' })),
        forecastCard(state), reorderCard(), ERP.ui.grid(2, machineCard(), payCard()), ERP.ui.grid(2, listCard('فرص', opportunities(), 'لا توجد فرص جديدة حاليًا'), listCard('قيم شاذة (Anomalies)', anomalies(), 'لا توجد قيم شاذة في آخر البيانات')));
    }
    return SA.live(body, () => { try { return build(); } catch (e) { console.error('[exec-insights]', e); return SA.errorState({ onRetry: () => SA.router.refresh() }); } }, ['lines', 'workOrders', 'salesOrders', 'invoices', 'receipts', 'cheques', 'stock', 'purchaseRequisitions', 'purchaseOrders', 'machines', 'maintenanceOrders', 'ncrs', 'leads', 'activities', 'events', 'tickets', 'bills', 'vouchers', 'prodDaily', 'qcInspections', 'quotations']);
  }
  SA.register({ id: 'exec-insights', app: 'exec', group: 'exec-ai', title: 'التنبؤات والتنبيهات الذكية', icon: 'sparkle', route: 'exec/insights', perm: 'exec.insights.view', order: 20, desc: 'توقع الطلب، الطلب الذكي، مخاطر الأعطال والتحصيل، الفرص والقيم الشاذة',
    badge() { try { const n = get('lines').filter((l) => l.status === 'down').length + M.reorderPlan().filter((x) => x.status === 'now' && !x.openPrq).length; return n || null; } catch (e) { return null; } }, render: insightsPage });

  /* ═════════════ exec-ai page ═════════════ */
  const CATS = [['المبيعات والعملاء', 'cart', [['مبيعات الشهر', 'sales'], ['مبيعات الأسبوع', 'sales'], ['قارن بالشهر اللي فات', 'compare'], ['أكبر العملاء', 'topCustomers'], ['أداء المندوبين', 'reps'], ['__SO__', 'orderStatus'], ['الطلبات المتأخرة', 'lateOrders']]],
    ['التحصيل والمالية', 'coins', [['مين متأخر في السداد؟', 'overdue'], ['الشيكات المستحقة', 'cheques'], ['التحصيلات الشهر ده', 'collections'], ['الكاش المتاح', 'cash'], ['أرباح الشهر', 'profit']]],
    ['المصنع والجودة', 'factory', [['حالة خطوط الإنتاج والـOEE', 'lines'], ['أوامر التشغيل المتأخرة', 'lateWO'], ['مؤشرات الجودة', 'quality'], ['الأعطال والصيانة', 'maintenance']]],
    ['المخزون والمشتريات والتصدير', 'warehouse', [['الخامات اللي هتخلص', 'materials'], ['اعمل طلب شراء لفويل الديكور', 'prq'], ['حالة طلبيات التصدير', 'export'], ['قيمة المخزون', 'materials']]],
    ['الإدارة', 'gauge', [['إيه اللي مستني موافقتي؟', 'approvals'], ['توقع مبيعات الشهور الجاية', 'forecast'], ['المعارض والعائد', 'expo'], ['الشكاوى المفتوحة', 'complaints']]]];
  function aiPage(root, ctx) {
    ctx.setCrumbs([{ label: 'الذكاء الاصطناعي' }, { label: 'اسأل نظامك' }]);
    const view = ERP.ai.chatView({});
    const cats = CATS.map((c) => { const items = c[2].filter((x) => x[1] === 'profit' || allowed(byId[x[1]])).filter((x) => x[1] !== 'orderStatus' || sampleSO()); if (!items.length) return null;
      return h('div.xai-cat', {}, h('h4', {}, SA.icon(c[1], 'icon-sm'), c[0]), h('div.xai-chips', {}, items.map((x) => { const t = x[0] === '__SO__' ? 'حالة طلب ' + sampleSO() : x[0]; const lock = (x[1] === 'profit' && !ERP.ui.canProfit()) || (t === 'قيمة المخزون' && !ERP.ui.canCost()); return h('button.xai-chip' + (lock ? '.is-locked' : ''), { type: 'button', title: lock ? 'محمي بالصلاحيات — جرّب وشوف رد المساعد' : null, onclick: () => view.send(t) }, lock ? SA.icon('lock', 'icon-sm') : null, t); }))); }).filter(Boolean);
    const side = h('aside.xai-side', { 'aria-label': 'اقتراحات ومعلومات' },
      SA.card({ title: 'جرّب تسأل' }, cats),
      SA.card({ title: 'المساعد بيشوف إيه؟' }, h('ul.xai-src', {}, [['layers', 'بيانات النظام الحية: الطلبات، الفواتير، التحصيل، المخزون، الإنتاج، الجودة، الصيانة، المعارض.'], ['shield', 'بصلاحياتك فقط: ' + (M.scoped() ? 'عملاؤك وطلباتك فقط.' : 'نفس ما تراه في الشاشات.') + ' التكاليف والأرباح محمية بصلاحيات خاصة.'], ['history', 'كل سؤال يُسجَّل في سجل التدقيق (AI.QUERY)، وأي إجراء يحتاج تأكيدك (AI.INSIGHT_ACTION).'], ['bot', DISCLOSURE]].map((x) => h('li', {}, SA.icon(x[0], 'icon-sm'), h('span', {}, x[1]))))));
    root.append(SA.pageHead({ title: 'اسأل نظامك', desc: 'اسأل بالعربي أو بالعامية المصرية عن أي حاجة في الشركة — والإجابة من بيانات النظام الحالية وبحدود صلاحياتك.', tags: [SA.tag('new'), ERP.ui.demo('محاكاة AI')], actions: [SA.btn({ label: 'محادثة جديدة', icon: 'refresh', kind: 'ghost', onClick: () => view.clear() })] }),
      h('div.xai-page', {}, h('section.card.xai-main', { 'aria-label': 'المحادثة' }, view.el), side));
    setTimeout(() => { try { view.focus(); } catch (e) { /* noop */ } }, 60);
    return () => view.destroy();
  }
  SA.register({ id: 'exec-ai', app: 'exec', group: 'exec-ai', title: 'اسأل نظامك', icon: 'bot', route: 'exec/ai', perm: 'exec.ai.use', order: 10, desc: 'مساعد ذكي يجاوب بالعربي من بيانات النظام وبصلاحياتك', render: aiPage });

  /* ═════════════ floating assistant (internal shell only) ═════════════ */
  let fab = null, drawer = null;
  function fabWanted() {
    try {
      if (!SA.session.isAuthed || SA.session.locked || !SA.can('exec.ai.use')) return false; if (SA.isEss() || SA.isPortal()) return false;
      const app = document.getElementById('app'); if (!app || app.dataset.mode !== 'shell' || !app.querySelector('.sap-app')) return false;
      const m = SA.route && SA.route.module; return !(m && m.id === 'exec-ai');
    } catch (e) { return false; }
  }
  function openAssistant() {
    if (drawer) return; let d = null;
    const view = ERP.ai.chatView({ compact: true, onNavigate: () => { if (d) d.close(); } });
    d = SA.drawer({ title: 'اسأل نظامك', subtitle: 'المساعد الذكي — من بيانات النظام وبحدود صلاحياتك (محاكاة)', size: 'lg', body: view.el, headActions: [h('button.btn.btn-ghost.btn-sm', { type: 'button', onclick: () => { d.close(); SA.nav('exec/ai'); } }, SA.icon('external', 'icon-sm'), 'ملء الشاشة')], onClose: () => { view.destroy(); drawer = null; } });
    d.body.classList.add('xai-dbody'); drawer = d; setTimeout(() => { try { view.focus(); } catch (e) { /* noop */ } }, 60);
  }
  function syncFab() {
    const want = fabWanted();
    if (want && !fab) { fab = h('button.xai-fab', { type: 'button', 'aria-label': 'افتح المساعد الذكي — اسأل نظامك', title: 'اسأل نظامك (المساعد الذكي)', onclick: openAssistant }, SA.icon('bot'), h('span', {}, 'اسأل نظامك'), h('i.xai-fab-dot', { 'aria-hidden': 'true' })); document.body.appendChild(fab); }
    else if (!want && fab) { fab.remove(); fab = null; }
    if (!want && drawer) { try { drawer.close(); } catch (e) { /* noop */ } }
  }
  ERP.ai.syncFab = syncFab; ERP.ai.openAssistant = openAssistant;
  SA.router.onChange(() => setTimeout(syncFab, 0));
  SA.on('login', () => setTimeout(syncFab, 0));
  SA.on('logout', () => { if (fab) { fab.remove(); fab = null; } });
  SA.on('perms', () => setTimeout(syncFab, 0));
  st.subscribe('session', () => setTimeout(syncFab, 0));

  /* ═════════════ Test Lab missions ═════════════ */
  try {
    if (SA.missions) {
      SA.missions.areas.exec = 'لوحة القيادة والذكاء';
      SA.missions.add({ id: 'M-E1', area: 'exec', title: 'اسأل نظامك عن المصنع ثم اعمل طلب شراء من المساعد', persona: 'owner', route: 'exec/ai', est: '3 د', goal: 'اسأل «حالة خطوط الإنتاج» ثم «الخامات اللي هتخلص» ثم «اعمل طلب شراء لفويل الديكور» وأكّد. افتح طلبات الشراء وشوف الطلب الجديد.', steps: [{ text: 'افتح «اسأل نظامك» واسأل عن خطوط الإنتاج', audit: 'AI.QUERY' }, { text: 'اطلب إنشاء طلب شراء وأكّد', audit: 'AI.INSIGHT_ACTION' }], detect: [{ audit: 'AI.QUERY' }, { audit: 'AI.INSIGHT_ACTION' }] });
      SA.missions.add({ id: 'M-E2', area: 'exec', title: 'الصلاحيات في المساعد: المندوب يسأل عن الأرباح', persona: 'rep', route: 'exec/ai', est: '2 د', goal: 'كمندوب اسأل «أرباح الشهر» (رفض مهذب) ثم «مبيعات الشهر» (عملاؤك فقط) ثم «حالة طلب SO-2026-0480» (ليس من عملائك).', steps: [{ text: 'اسأل عن الأرباح وشوف الرفض', audit: 'AI.QUERY' }], detect: [{ audit: 'AI.QUERY', where: { result: 'denied' } }] });
    }
  } catch (e) { console.error('[mod-ai] missions', e); }
})();
