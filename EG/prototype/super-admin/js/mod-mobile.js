/* EG Super Admin prototype — mod-mobile.js  (agent C · SA-28 Super Admin على EG-Mobile)
   Route: #/mobile — إطار هاتف يشارك نفس مجموعة `approvals` ونفس الصلاحيات. القرار من «الهاتف» يظهر في صندوق الويب بـ via:'mobile'.
   قواعد: أونلاين فقط للاعتماد (BR-MOB-01) · لا إجراء من نص الإشعار — يفتح الشاشة ثم يتحقق من الحالة والصلاحية الحيّة (BR-MOB-02) ·
   جهاز مشترك = خروج + مسح البيانات المحمّلة (UC-MOB-04) · الاعتمادات الحساسة/الموارد البشرية/تجاوز التجار تُنفَّذ من الويب فقط (خارج الموبايل). */
(function () {
  'use strict';
  const SA = window.SA, h = SA.h, st = SA.store;
  const MOD = 'mob';
  function css(text) { if (document.querySelector('style[data-mod="' + MOD + '"]')) return; const s = document.createElement('style'); s.setAttribute('data-mod', MOD); s.textContent = text; document.head.appendChild(s); }
  css(`
.sap-mob-wrap{display:grid;grid-template-columns:minmax(0,1fr) 392px;gap:28px;align-items:start}
.sap-mob-side{display:grid;gap:16px}
.sap-mob-stage{display:grid;place-items:center;padding-block:8px}
.sap-mob-phone{width:372px;max-width:100%;height:min(760px,calc(100vh - 150px));min-height:640px;border-radius:46px;border:10px solid #0b1220;background:#f4f6fb;position:relative;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 60px rgba(2,32,79,.28),0 0 0 2px #1b2740;color:var(--color-text)}
.sap-mob-notch{position:absolute;inset-block-start:0;inset-inline-start:50%;transform:translateX(-50%);width:120px;height:24px;background:#0b1220;border-radius:0 0 16px 16px;z-index:6}
.sap-mob-status{display:flex;justify-content:space-between;align-items:center;padding:8px 22px 4px;font:600 12px var(--font-en);color:var(--eg-navy);flex:none;direction:ltr}
.sap-mob-status button{all:unset;cursor:pointer;display:inline-flex;gap:4px;align-items:center;padding:2px 6px;border-radius:8px}.sap-mob-status button:focus-visible{outline:2px solid var(--eg-navy)}
.sap-mob-bar{display:flex;align-items:center;justify-content:space-between;padding:8px 16px 10px;flex:none}.sap-mob-bar h2{margin:0;font-size:1.15rem;color:var(--eg-navy)}
.sap-mob-ic{all:unset;box-sizing:border-box;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;position:relative;color:var(--eg-navy)}.sap-mob-ic:focus-visible{outline:2px solid var(--eg-navy)}.sap-mob-ic i{position:absolute;inset-block-start:6px;inset-inline-end:6px;min-width:16px;height:16px;border-radius:8px;background:var(--color-danger);color:#fff;font:700 10px var(--font-en);display:grid;place-items:center;font-style:normal;padding-inline:3px}
.sap-mob-body{flex:1;overflow:auto;padding:4px 14px 16px;display:grid;gap:12px;align-content:start}
.sap-mob-tabs{display:grid;grid-template-columns:repeat(4,1fr);background:#fff;border-block-start:1px solid var(--color-border);flex:none;padding-block-end:10px}
.sap-mob-tab{all:unset;box-sizing:border-box;min-height:56px;display:grid;place-items:center;align-content:center;gap:2px;font-size:11px;font-weight:600;color:var(--color-text-muted);cursor:pointer;position:relative}.sap-mob-tab[aria-selected=true]{color:var(--eg-navy)}.sap-mob-tab[aria-selected=true]::before{content:'';position:absolute;inset-block-start:0;width:28px;height:3px;border-radius:0 0 3px 3px;background:var(--eg-navy)}.sap-mob-tab:focus-visible{outline:2px solid var(--eg-navy);outline-offset:-4px}.sap-mob-tab i{position:absolute;inset-block-start:6px;margin-inline-start:22px;min-width:16px;height:16px;border-radius:8px;background:var(--color-danger);color:#fff;font:700 10px var(--font-en);display:grid;place-items:center;font-style:normal;padding-inline:3px}
.sap-mob-card{background:#fff;border:1px solid var(--color-border);border-radius:16px;padding:12px 14px;display:grid;gap:6px}
.sap-mob-kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sap-mob-kpi{all:unset;box-sizing:border-box;background:#fff;border:1px solid var(--color-border);border-radius:16px;padding:12px 14px;display:grid;gap:2px;cursor:pointer;min-height:76px}.sap-mob-kpi:focus-visible{outline:2px solid var(--eg-navy)}.sap-mob-kpi b{font:700 1.6rem var(--font-en);color:var(--eg-navy);line-height:1.1}.sap-mob-kpi span{font-size:12px;color:var(--color-text-muted)}.sap-mob-kpi.is-hot b{color:var(--color-danger)}
.sap-mob-row{all:unset;box-sizing:border-box;width:100%;background:#fff;border:1px solid var(--color-border);border-radius:16px;padding:12px 14px;display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:10px;align-items:center;cursor:pointer;min-height:64px}.sap-mob-row:focus-visible{outline:2px solid var(--eg-navy)}.sap-mob-row.is-unread{border-inline-start:4px solid var(--eg-navy)}
.sap-mob-ico{width:40px;height:40px;border-radius:12px;background:var(--color-primary-tint);color:var(--eg-navy);display:grid;place-items:center}.sap-mob-row b{display:block;font-size:13px;line-height:1.35}.sap-mob-row small{color:var(--color-text-muted);font-size:11px}
.sap-mob-chip{font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--color-bg-alt);color:var(--color-text-muted);white-space:nowrap}.sap-mob-chip.ok{background:var(--color-success-tint);color:var(--color-success)}.sap-mob-chip.bad{background:var(--color-danger-tint);color:var(--color-danger)}.sap-mob-chip.warn{background:var(--color-warning-tint,#fff3d6);color:var(--color-warning,#8a5a00)}
.sap-mob-seg{display:flex;gap:6px;background:#e9edf5;border-radius:12px;padding:4px}.sap-mob-seg button{all:unset;box-sizing:border-box;flex:1;text-align:center;padding:9px 4px;border-radius:9px;font-size:12px;font-weight:700;color:var(--color-text-muted);cursor:pointer;min-height:36px}.sap-mob-seg button[aria-pressed=true]{background:#fff;color:var(--eg-navy);box-shadow:0 1px 4px rgba(2,32,79,.12)}.sap-mob-seg button:focus-visible{outline:2px solid var(--eg-navy)}
.sap-mob-btn{all:unset;box-sizing:border-box;min-height:48px;padding-inline:16px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:14px;cursor:pointer;background:var(--eg-navy);color:#fff;text-align:center}.sap-mob-btn:focus-visible{outline:3px solid #9bb7f0;outline-offset:2px}.sap-mob-btn.ghost{background:#fff;color:var(--eg-navy);border:1px solid var(--color-border-strong)}.sap-mob-btn.danger{background:#fff;color:var(--color-danger);border:1px solid var(--color-danger)}.sap-mob-btn[aria-disabled=true]{opacity:.45;cursor:not-allowed}
.sap-mob-banner{border-radius:12px;padding:10px 12px;font-size:12px;display:flex;gap:8px;align-items:flex-start;background:#eef3fc;color:var(--eg-navy)}.sap-mob-banner.warn{background:var(--color-warning-tint,#fff3d6);color:var(--color-warning,#8a5a00)}.sap-mob-banner.bad{background:var(--color-danger-tint);color:var(--color-danger)}
.sap-mob-sheet{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;justify-content:flex-end}.sap-mob-scrim{position:absolute;inset:0;background:rgba(2,16,40,.45)}.sap-mob-sheetp{position:relative;background:#fff;border-radius:24px 24px 0 0;max-height:88%;display:flex;flex-direction:column;animation:sapmob-up .22s ease-out}.sap-mob-sheetp header{padding:14px 18px 8px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px}.sap-mob-sheetp header h3{margin:0;font-size:15px;line-height:1.4}.sap-mob-sheetb{overflow:auto;padding:0 18px 12px;display:grid;gap:10px}.sap-mob-sheetf{padding:10px 18px 18px;display:grid;gap:8px;border-block-start:1px solid var(--color-border)}
@keyframes sapmob-up{from{transform:translateY(30px);opacity:.6}to{transform:none;opacity:1}}
.sap-mob-chain{display:grid;gap:0}.sap-mob-step{display:grid;grid-template-columns:22px 1fr;gap:10px;position:relative;padding-block:6px}.sap-mob-step::before{content:'';position:absolute;inset-inline-start:10px;inset-block:26px -6px;width:2px;background:var(--color-border)}.sap-mob-step:last-child::before{display:none}.sap-mob-dot{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:var(--color-bg-alt);color:var(--color-text-muted);font:700 11px var(--font-en)}.sap-mob-dot.ok{background:var(--color-success);color:#fff}.sap-mob-dot.now{background:var(--eg-navy);color:#fff}.sap-mob-dot.bad{background:var(--color-danger);color:#fff}.sap-mob-step small{display:block;color:var(--color-text-muted);font-size:11px}
.sap-mob-kv{display:grid;gap:6px;margin:0}.sap-mob-kv div{display:flex;justify-content:space-between;gap:10px;font-size:12px;border-block-end:1px dashed var(--color-border);padding-block-end:6px}.sap-mob-kv dt{color:var(--color-text-muted)}.sap-mob-kv dd{margin:0;font-weight:600;text-align:end}
.sap-mob-ta{width:100%;border:1px solid var(--color-border-strong);border-radius:12px;padding:10px;font:inherit;font-size:13px;min-height:64px;box-sizing:border-box}
.sap-mob-empty{text-align:center;padding:28px 12px;color:var(--color-text-muted);display:grid;gap:8px;justify-items:center;font-size:13px}.sap-mob-empty b{color:var(--color-text);font-size:14px}
.sap-mob-signin{flex:1;display:grid;place-content:center;gap:14px;text-align:center;padding:28px}.sap-mob-signin h3{margin:0}
.sap-mob-side .t-caption{margin:0}.sap-mob-metric{display:flex;gap:10px;align-items:center;justify-content:space-between}.sap-mob-metric b{font:700 1.5rem var(--font-en);color:var(--eg-navy)}
@media(max-width:1100px){.sap-mob-wrap{grid-template-columns:1fr}.sap-mob-side{order:2}}
@media(max-width:480px){.sap-mob-phone{height:auto;min-height:640px;border-width:6px;border-radius:30px}.sap-mob-body{max-height:560px}}
@media(prefers-reduced-motion:reduce){.sap-mob-sheetp{animation:none}}
`);

  /* ───────────────────────── state ───────────────────────── */
  const M = { tab: 'home', online: true, signedIn: true, cache: null, sheetId: null, filter: 'mine', userSheet: null, notifOpen: false };
  const MOBILE_TYPES = ['discount', 'large_order', 'price_list', 'payment_voucher'];
  const effOnline = () => M.online && !SA.sim.offline;
  const me = () => SA.session.user;
  const TICON = { discount: 'receipt', large_order: 'cart', price_list: 'list', payment_voucher: 'coins', dealer_override: 'shield', payroll_run: 'coins', salary_change: 'edit', final_settlement: 'doc', hiring_requisition: 'userplus', advance: 'coins', leave: 'clock' };
  const aStatus = (s) => (SA.catalog.status.approval[s] || [s])[0];
  const curStep = (a) => a.chain.find((s) => s.step === a.currentStep);
  const isMine = (a) => { const s = curStep(a); const u = me(); return !!(a.status === 'pending' && s && u && (s.roleId === u.roleId || u.roleId === 'R-01') && a.requesterId !== u.id); };
  const allApprovals = () => st.get('approvals') || [];
  const via = () => (st.get('audit') || []).filter((a) => a.via === 'mobile' && /^APPROVAL\./.test(a.code)).length;

  /** snapshot of what the phone has loaded — used for the offline (read-only) view; wiped on shared-device logout */
  function takeCache() {
    const u = me(); if (!u) return;
    M.cache = { at: new Date().toISOString(), approvals: allApprovals().filter((a) => MOBILE_TYPES.concat(['dealer_override']).indexOf(a.type) >= 0 || a.area === 'hr').slice(0, 30).map((a) => SA.clone(a)), activity: (st.get('audit') || []).slice(0, 15).map((a) => ({ id: a.id, code: a.code, actor: a.actor.name, ts: a.ts, via: a.via, target: a.target && a.target.label, severity: a.severity })),
      kpis: { mine: allApprovals().filter(isMine).length, active: (st.get('users') || []).filter((x) => x.status === 'active').length, locked: (st.get('users') || []).filter((x) => x.status === 'locked').length, sessions: (st.get('sessions') || []).filter((x) => x.status === 'active').length, dealers: (st.get('dealerRequests') || []).filter((d) => d.status === 'pending_review').length } };
  }
  function liveKpis() { return { mine: allApprovals().filter(isMine).length, active: (st.get('users') || []).filter((x) => x.status === 'active').length, locked: (st.get('users') || []).filter((x) => x.status === 'locked').length, sessions: (st.get('sessions') || []).filter((x) => x.status === 'active').length, dealers: (st.get('dealerRequests') || []).filter((d) => d.status === 'pending_review').length }; }

  /** why a decision is not allowed RIGHT NOW (always read fresh from the store + live role) */
  function blockReason(a, needOnline) {
    if (!a) return 'الطلب لم يعد موجودًا.';
    if (a.status !== 'pending') return 'الحالة تغيّرت: «' + aStatus(a.status) + '» — لا يمكن اتخاذ قرار.';
    if (MOBILE_TYPES.indexOf(a.type) < 0) return 'هذا النوع (' + ((SA.catalog.approvalTypes[a.type] || {}).label || a.type) + ') يُنفَّذ من الويب فقط — خارج نطاق الموبايل.';
    const u = me(); const live = SA.session.role;
    if (!SA.can('sa.approvals.approve') || !live || !SA.roleCan(live, 'sa.approvals.approve')) return 'صلاحيتك تغيّرت — لم تعد تملك اعتماد الطلبات (sa.approvals.approve).';
    if (a.requesterId === u.id) return 'فصل المهام: لا يمكنك اعتماد طلبك بنفسك.';
    const s = curStep(a); if (!s || !(s.roleId === live.id || u.roleId === 'R-01')) return 'الخطوة الحالية ليست لدورك: ' + (s ? s.label : '—');
    if (needOnline && !effOnline()) return 'لا يوجد اتصال — الاعتماد غير متاح دون اتصال (BR-MOB-01).';
    return '';
  }
  async function decide(a0, kind, reason) {
    const a = st.find('approvals', a0.id); const b = blockReason(a, true); if (b) { SA.toast(b, 'warn', { ms: 6500 }); return false; }
    const money = a.type === 'payment_voucher';
    if (!(await SA.stepUp('approval.decide', { force: money, title: 'تأكيد هويتك على الموبايل', text: money ? 'قرار مالي: أدخل كلمة مرورك أو كود التحقق. (البصمة/PIN خارج v1 — BR-MOB-04)' : undefined }))) return false;
    const a2 = st.find('approvals', a.id); const b2 = blockReason(a2, true); if (b2) { SA.toast('تغيّر الوضع أثناء التحقق: ' + b2, 'warn', { ms: 6500 }); return false; } // re-check after step-up
    const u = me(); const now = new Date().toISOString(); const stepNo = a2.currentStep; let nextRole = null;
    try {
      await SA.api(() => {
        st.update('approvals', (l) => { const x = l.find((y) => y.id === a2.id); const s = x.chain.find((c) => c.step === x.currentStep); s.decidedBy = u.id; s.decidedAt = now; s.reason = reason || '';
          if (kind === 'approve') { s.status = 'approved'; const n = x.chain.find((c) => c.step === x.currentStep + 1); if (n) { n.status = 'pending'; x.currentStep += 1; nextRole = n.roleId; } else x.status = 'approved'; }
          else if (kind === 'reject') { s.status = 'rejected'; x.chain.forEach((c) => { if (c.step > s.step) c.status = 'skipped'; }); x.status = 'rejected'; }
          else { x.status = 'changes_requested'; }
          x.updatedAt = now; });
        const code = kind === 'approve' ? 'APPROVAL.APPROVED' : kind === 'reject' ? 'APPROVAL.REJECTED' : 'APPROVAL.CHANGES_REQUESTED';
        SA.audit(code, { target: { type: 'approval', id: a2.id, label: a2.title }, before: { status: a2.status, step: stepNo }, after: { status: st.find('approvals', a2.id).status, step: st.find('approvals', a2.id).currentStep }, reason: reason || '', via: 'mobile' });
      });
    } catch (e) { SA.fail(e); return false; }
    if (nextRole) SA.notify({ title: 'طلب اعتماد بانتظار قرارك: ' + a2.title, body: 'اعتمدته الخطوة السابقة من الموبايل.', level: 'action', to: [nextRole, 'R-01'], link: '#/approvals/' + a2.id });
    SA.notify({ title: (kind === 'approve' ? 'تم اعتماد ' : kind === 'reject' ? 'تم رفض ' : 'طُلب تعديل على ') + a2.title, body: 'القرار من الموبايل.', level: 'info', toUsers: [a2.requesterId], link: '#/approvals/' + a2.id });
    SA.emit('approval.decided', { id: a2.id, kind, via: 'mobile' }); takeCache();
    SA.toast(kind === 'approve' ? 'تم الاعتماد من الموبايل' : kind === 'reject' ? 'تم الرفض' : 'تم طلب التعديل', 'success'); return true;
  }
  /** run a web users-API action but stamp its audit entries as coming from mobile */
  async function asMobile(fn) { const a0 = SA.audit; SA.audit = (c, o) => a0.call(SA, c, Object.assign({}, o, { via: 'mobile' })); try { return await fn(); } finally { SA.audit = a0; } }

  /* ───────────────────────── UI pieces ───────────────────────── */
  const ago = (iso) => SA.fmt.rel(iso);
  function banner(kind, text, icon) { return h('div.sap-mob-banner' + (kind ? '.' + kind : ''), { role: kind === 'bad' ? 'alert' : 'status' }, SA.icon(icon || 'info', 'icon-sm'), h('span', {}, text)); }
  function approvalRow(a) {
    const t = SA.catalog.approvalTypes[a.type] || {}; const s = curStep(a); const mobileOk = MOBILE_TYPES.indexOf(a.type) >= 0; const unread = isMine(a);
    return h('button.sap-mob-row' + (unread ? '.is-unread' : ''), { type: 'button', onclick: () => openSheet(a.id), 'aria-label': t.label + ': ' + a.title },
      h('span.sap-mob-ico', {}, SA.icon(TICON[a.type] || 'clipboard')), h('span', {}, h('b', {}, a.title), h('small', {}, SA.userName(a.requesterId) + ' · ' + ago(a.createdAt) + (a.amount ? ' · ' + SA.fmt.money(a.amount) : '') + (a.discountPct ? ' · خصم ' + a.discountPct + '%' : ''))),
      h('span.sap-mob-chip' + (a.status === 'approved' ? '.ok' : a.status === 'rejected' ? '.bad' : unread ? '.warn' : ''), {}, a.status === 'pending' ? (unread ? 'بانتظارك' : mobileOk ? (s ? s.label.split(' ')[0] : 'معلّق') : 'من الويب') : aStatus(a.status)));
  }

  function screenHome(body, data, live) {
    const k = data.kpis; const mine = (live ? allApprovals() : data.approvals).filter((a) => (live ? isMine(a) : a.status === 'pending')).slice(0, 3);
    body.append(h('div.sap-mob-kpis', {}, [['mine', 'اعتمادات بانتظارك', k.mine, 'approvals', k.mine > 0], ['active', 'مستخدمون نشطون', k.active, 'users'], ['locked', 'حسابات موقوفة', k.locked, 'users', k.locked > 0], ['sessions', 'جلسات نشطة', k.sessions, 'sessions']].map((x) => h('button.sap-mob-kpi' + (x[4] ? '.is-hot' : ''), { type: 'button', onclick: () => { M.tab = x[3] === 'approvals' ? 'approvals' : x[3] === 'users' ? 'more' : 'home'; draw(); } }, h('b', {}, x[2]), h('span', {}, x[1])))),
      SA.can('sa.dealers.view') ? h('div.sap-mob-card', {}, h('div.sap-mob-metric', {}, h('span', {}, 'طلبات تسجيل تجار بانتظار المراجعة'), h('b', {}, k.dealers)), h('small.t-muted', {}, 'تُراجع من الويب (المبيعات أصل القرار).')) : null,
      h('div', {}, h('div.sap-mob-metric', { style: { marginBlockEnd: '8px' } }, h('b', { style: { font: '700 14px var(--font-ar,inherit)' } }, 'بانتظار قرارك'), h('button.sap-mob-btn.ghost', { type: 'button', style: { minHeight: '36px', fontSize: '12px' }, onclick: () => { M.tab = 'approvals'; draw(); } }, 'عرض الكل')),
        mine.length ? h('div', { style: { display: 'grid', gap: '8px' } }, mine.map(approvalRow)) : h('div.sap-mob-empty', {}, SA.icon('checkcircle', 'icon-lg'), h('b', {}, 'لا شيء ينتظرك'), h('span', {}, 'كل الطلبات الموجّهة لدورك تم البتّ فيها.'))));
  }
  function screenApprovals(body, data, live) {
    const list = (live ? allApprovals() : data.approvals); const rows = M.filter === 'mine' ? list.filter((a) => (live ? isMine(a) : a.status === 'pending')) : list;
    body.append(h('div.sap-mob-seg', { role: 'group', 'aria-label': 'تصفية الاعتمادات' }, [['mine', 'بانتظاري'], ['all', 'الكل']].map((f) => h('button', { type: 'button', 'aria-pressed': String(M.filter === f[0]), onclick: () => { M.filter = f[0]; draw(); } }, f[1]))),
      rows.length ? h('div', { style: { display: 'grid', gap: '8px' } }, rows.map(approvalRow)) : h('div.sap-mob-empty', {}, SA.icon('inbox', 'icon-lg'), h('b', {}, 'لا توجد طلبات'), h('span', {}, M.filter === 'mine' ? 'لا طلبات موجّهة لك الآن.' : 'لا توجد طلبات.')));
  }
  function screenActivity(body, data) {
    body.append(h('div.sap-mob-banner', {}, SA.icon('eye', 'icon-sm'), h('span', {}, 'قراءة فقط — النشاط الأخير من سجل التدقيق. لا إجراءات هنا.')),
      data.activity.length ? h('div', { style: { display: 'grid', gap: '8px' } }, data.activity.map((a) => h('div.sap-mob-card', {}, h('b', { style: { fontSize: '13px' } }, SA.auditLabel(a.code)), h('small', { style: { color: 'var(--color-text-muted)' } }, a.actor + ' · ' + ago(a.ts) + (a.via === 'mobile' ? ' · من الموبايل' : '')), a.target ? h('small', {}, a.target) : null))) : h('div.sap-mob-empty', {}, SA.icon('history', 'icon-lg'), h('b', {}, 'لا نشاط محمّل')));
  }
  function notifTarget(n) { const m = /#\/approvals\/(AP-\d+)/.exec(n.link || ''); if (m) return { kind: 'approval', id: m[1] }; const u = /#\/users\/(U-\d+)/.exec(n.link || ''); if (u) return { kind: 'user', id: u[1] }; return { kind: 'web' }; }
  function openNotif(n) { SA.notifications.markRead(n.id); const t = notifTarget(n); if (t.kind === 'approval') { if (!effOnline()) { SA.toast('لا اتصال — لا يمكن فتح الطلب الآن.', 'warn'); return; } M.tab = 'approvals'; openSheet(t.id); } else if (t.kind === 'user') { M.tab = 'more'; M.notifOpen = false; draw(); SA.toast('تم فتح شاشة المستخدم — التنفيذ بعد التحقق.', 'info'); } else SA.toast('هذا الإشعار يفتح شاشة على الويب.', 'info'); }
  function screenNotifs(body) {
    const list = SA.notifications.forMe().slice(0, 25);
    body.append(banner('', 'الإشعار يفتح الشاشة المعنية فقط — لا يُنفَّذ أي إجراء من نصه، ويُعاد التحقق من الحالة والصلاحية عند الفتح (BR-MOB-02).', 'shield'),
      list.length ? h('div', { style: { display: 'grid', gap: '8px' } }, list.map((n) => h('button.sap-mob-row' + (SA.notifications.isRead(n) ? '' : '.is-unread'), { type: 'button', onclick: () => openNotif(n) }, h('span.sap-mob-ico', {}, SA.icon(n.level === 'urgent' ? 'alert' : n.level === 'action' ? 'clipboard' : 'bell')), h('span', {}, h('b', {}, n.title), h('small', {}, ago(n.ts))), h('span.sap-mob-chip' + (n.level === 'urgent' ? '.bad' : n.level === 'action' ? '.warn' : ''), {}, n.level === 'urgent' ? 'عاجل' : n.level === 'action' ? 'إجراء' : 'للعلم')))) : h('div.sap-mob-empty', {}, SA.icon('bell', 'icon-lg'), h('b', {}, 'لا إشعارات')));
  }
  function screenMore(body) {
    if (M.notifOpen) { body.append(h('button.sap-mob-btn.ghost', { type: 'button', onclick: () => { M.notifOpen = false; draw(); } }, SA.icon('arrowright', 'icon-sm icon-flip'), 'رجوع')); return screenNotifs(body); }
    const users = (st.get('users') || []).filter((u) => u.status === 'locked' || u.status === 'active').sort((a, b) => (a.status === 'locked' ? -1 : 1) - (b.status === 'locked' ? -1 : 1)).slice(0, 8); const sec = st.get('settings.security') || {};
    body.append(
      h('div.sap-mob-card', {}, h('div.sap-mob-metric', {}, h('div', {}, h('b', { style: { display: 'block' } }, me().name), h('small', { style: { color: 'var(--color-text-muted)' } }, SA.roleName(me().roleId))), SA.avatar(me().name)), h('small', {}, 'تنتهي الجلسة بعد ', h('b.num', {}, sec.idleMinutes || '—'), ' دقيقة خمول (من سياسة الأمان)', sec.idleDemo ? ' — قيمة تجريبية' : '')),
      h('button.sap-mob-row', { type: 'button', onclick: () => { M.notifOpen = true; draw(); } }, h('span.sap-mob-ico', {}, SA.icon('bell')), h('span', {}, h('b', {}, 'الإشعارات'), h('small', {}, SA.notifications.unread() + ' غير مقروء')), h('span.sap-mob-chip', {}, 'فتح')),
      h('div', {}, h('b', { style: { fontSize: '14px', display: 'block', marginBlockEnd: '8px' } }, 'إجراءات المستخدمين السريعة'), !effOnline() ? banner('warn', 'لا اتصال — الإجراءات معطّلة.', 'wifioff') : null,
        h('div', { style: { display: 'grid', gap: '8px' } }, users.map((u) => h('div.sap-mob-card', {}, h('div.sap-mob-metric', {}, h('div', {}, h('b', { style: { fontSize: '13px', display: 'block' } }, u.name), h('small', { style: { color: 'var(--color-text-muted)' } }, SA.roleName(u.roleId))), h('span.sap-mob-chip' + (u.status === 'locked' ? '.bad' : '.ok'), {}, u.status === 'locked' ? 'موقوف' : 'نشط')),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, u.status === 'locked' ? qa('فك القفل', 'sa.users.unlock', () => asMobile(() => SA.users.unlock(u.id))) : null, SA.sessions.forUser(u.id).length && u.id !== me().id ? qa('خروج إجباري', 'sa.users.force_logout', () => asMobile(() => SA.users.forceLogout(u.id))) : null, u.status === 'active' && u.id !== me().id ? qa('تعطيل', 'sa.users.disable', () => asMobile(() => SA.users.disable(u.id)), true) : null))))),
      h('div.sap-mob-card', {}, h('b', {}, 'جهاز مشترك؟'), h('small', { style: { color: 'var(--color-text-muted)' } }, 'تسجيل الخروج يمسح البيانات المحمّلة على هذا الجهاز (UC-MOB-04).'), h('button.sap-mob-btn.danger', { type: 'button', onclick: sharedLogout }, SA.icon('logout', 'icon-sm'), 'خروج ومسح بيانات الجهاز')),
      h('div.sap-mob-banner', {}, SA.icon('lock', 'icon-sm'), h('span', {}, 'خارج الموبايل: تعديل مصفوفة الصلاحيات، الترقيم، الضريبة والمالية، تصدير التدقيق.')));
    function qa(label, perm, fn, danger) { const locked = !SA.can(perm) ? NOPERM() : !effOnline() ? 'لا اتصال' : ''; return h('button.sap-mob-btn' + (danger ? '.danger' : '.ghost'), { type: 'button', style: { minHeight: '44px', fontSize: '13px' }, 'aria-disabled': locked ? 'true' : null, title: locked || null, onclick: () => { if (locked) { SA.toast(locked, 'warn'); return; } fn(); } }, locked ? SA.icon('lock', 'icon-sm') : null, label); }
    function NOPERM() { return 'ليست من صلاحياتك'; }
  }
  async function sharedLogout() {
    const r = await SA.confirm({ title: 'خروج من جهاز مشترك', danger: true, confirmLabel: 'خروج ومسح', impact: ['تنتهي جلسة الموبايل على هذا الجهاز.', 'تُمسح كل البيانات المحمّلة (اعتمادات، نشاط، مؤشرات).', 'لن تتمكن من أي قراءة دون اتصال حتى تسجّل الدخول من جديد.'] }); if (!r.ok) return;
    try { await SA.api(() => { SA.audit('SESSION.REVOKED', { target: { type: 'session', id: 'mobile-preview', label: 'جهاز مشترك — معاينة الموبايل' }, reason: 'خروج من جهاز مشترك + مسح البيانات المحمّلة', via: 'mobile' }); }); } catch (e) { return SA.fail(e); }
    M.cache = null; M.signedIn = false; M.sheetId = null; M.tab = 'home'; M.notifOpen = false; draw(); SA.toast('تم الخروج ومسح بيانات الجهاز', 'success');
  }
  async function phoneSignIn() { if (!(await SA.stepUp('approval.decide', { force: true, title: 'تسجيل الدخول على الموبايل', text: 'أدخل كلمة مرورك أو كود التحقق لفتح EG-Mobile.' }))) return; M.signedIn = true; takeCache(); draw(); SA.toast('تم تسجيل الدخول على الموبايل', 'success'); }

  /* — approval detail sheet (SCR-MOB-02) — */
  function openSheet(id) { M.sheetId = id; if (effOnline()) takeCache(); draw(); }
  function sheet() {
    const a = st.find('approvals', M.sheetId); const t = a ? (SA.catalog.approvalTypes[a.type] || {}) : {}; const b = blockReason(a, true); const offline = !effOnline();
    const note = h('textarea.sap-mob-ta', { placeholder: 'سبب القرار (مطلوب للرفض وطلب التعديل)', 'aria-label': 'سبب القرار', disabled: !!b });
    const act = (kind, label, cls) => h('button.sap-mob-btn' + (cls ? '.' + cls : ''), { type: 'button', 'aria-disabled': b ? 'true' : null, title: b || null, onclick: async () => { const fresh = blockReason(st.find('approvals', M.sheetId), true); if (fresh) { SA.toast(fresh, 'warn', { ms: 6500 }); draw(); return; } if (kind !== 'approve' && note.value.trim().length < 3) { note.focus(); SA.toast('اكتب سببًا (3 أحرف على الأقل).', 'warn'); return; } const ok = await decide(a, kind, note.value.trim()); if (ok) { M.sheetId = null; draw(); } else draw(); } }, label);
    const body = a ? [
      b ? banner(a.status !== 'pending' ? 'warn' : 'bad', b, a.status !== 'pending' ? 'alert' : 'lock') : null, offline ? banner('warn', 'لا اتصال — تعرض بيانات محمّلة قبل قليل بدون إجراءات.', 'wifioff') : null,
      h('div', {}, h('span.sap-mob-chip', {}, t.label || a.type), ' ', h('span.sap-mob-chip' + (a.status === 'approved' ? '.ok' : a.status === 'rejected' ? '.bad' : '.warn'), {}, aStatus(a.status))),
      h('dl.sap-mob-kv', {}, h('div', {}, h('dt', {}, 'مقدّم الطلب'), h('dd', {}, SA.userName(a.requesterId))), h('div', {}, h('dt', {}, 'تاريخ الطلب'), h('dd', {}, SA.fmt.dt(a.createdAt))), a.amount ? h('div', {}, h('dt', {}, 'المبلغ'), h('dd', {}, SA.fmt.money(a.amount))) : null, a.discountPct ? h('div', {}, h('dt', {}, 'الخصم'), h('dd', {}, a.discountPct + '%')) : null, (a.context || []).filter((c) => !(a.amount && /^(قيمة الطلب|المبلغ)$/.test(c[0])) && !(a.discountPct && /^الخصم/.test(c[0]))).slice(0, 5).map((c) => h('div', {}, h('dt', {}, c[0]), h('dd', {}, c[1])))),
      h('div', {}, h('b', { style: { fontSize: '13px' } }, 'سلسلة الاعتماد'), h('div.sap-mob-chain', {}, a.chain.map((s) => h('div.sap-mob-step', {}, h('span.sap-mob-dot' + (s.status === 'approved' ? '.ok' : s.status === 'rejected' ? '.bad' : s.step === a.currentStep && a.status === 'pending' ? '.now' : ''), {}, s.status === 'approved' ? '✓' : s.status === 'rejected' ? '×' : String(s.step)), h('div', {}, h('b', { style: { fontSize: '12px' } }, s.label), h('small', {}, s.status === 'approved' ? 'اعتمد ' + SA.userName(s.decidedBy) + ' · ' + ago(s.decidedAt) : s.status === 'rejected' ? 'رُفض · ' + (s.reason || '') : s.status === 'skipped' ? 'تم تخطيها' : s.step === a.currentStep && a.status === 'pending' ? 'الخطوة الحالية' : 'بالانتظار')))))),
      !b ? note : null] : [h('div.sap-mob-empty', {}, SA.icon('alert', 'icon-lg'), h('b', {}, 'الطلب غير موجود'))];
    const foot = a && !b ? [act('approve', 'اعتماد'), h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } }, act('changes', 'طلب تعديل', 'ghost'), act('reject', 'رفض', 'danger'))] : [h('button.sap-mob-btn.ghost', { type: 'button', onclick: () => { M.sheetId = null; draw(); } }, 'إغلاق')];
    if (a && !b) foot.push(h('button.sap-mob-btn.ghost', { type: 'button', style: { minHeight: '40px' }, onclick: () => { M.sheetId = null; draw(); } }, 'إغلاق'));
    return h('div.sap-mob-sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'تفاصيل الاعتماد' }, h('div.sap-mob-scrim', { onclick: () => { M.sheetId = null; draw(); } }), h('div.sap-mob-sheetp', {}, h('header', {}, h('h3', {}, a ? a.title : 'اعتماد'), h('button.sap-mob-ic', { type: 'button', 'aria-label': 'إغلاق', onclick: () => { M.sheetId = null; draw(); } }, SA.icon('x'))), h('div.sap-mob-sheetb', {}, body), h('div.sap-mob-sheetf', {}, foot)));
  }

  /* ───────────────────────── phone + screen ───────────────────────── */
  let phoneHost = null, sideHost = null;
  function drawSide() {
    if (!sideHost) return; SA.clear(sideHost); const online = effOnline();
    sideHost.append(
      SA.card({ title: 'حالة الاتصال' }, h('div.cluster', { style: { alignItems: 'center', justifyContent: 'space-between' } }, h('span', {}, online ? SA.chip('متصل', 'success') : SA.chip(SA.sim.offline ? 'غير متصل (محاكاة النظام)' : 'غير متصل', 'danger')), SA.segmented([['on', 'أونلاين'], ['off', 'أوفلاين']], M.online ? 'on' : 'off', (v) => { M.online = v === 'on'; if (M.online) takeCache(); draw(); })), h('p.t-caption', { style: { marginBlockStart: '8px' } }, 'دون اتصال: الاعتمادات والإجراءات معطّلة، وتبقى قراءة آخر بيانات محمّلة فقط (BR-MOB-01).')),
      SA.card({ title: 'نفس البيانات، قناة مختلفة' }, h('div.sap-mob-metric', {}, h('span', {}, 'قرارات اعتماد تمت عبر الموبايل'), h('b', {}, via())), h('p.t-caption', {}, 'القرار من الهاتف يكتب في نفس مجموعة الاعتمادات وسجل التدقيق بـ«via: mobile» ويظهر في الصندوق الرئيسي.'), h('div.cluster', { style: { marginBlockStart: '8px' } }, SA.btn({ label: 'فتح صندوق الاعتمادات (ويب)', icon: 'inbox', kind: 'ghost', size: 'sm', perm: 'sa.approvals.view', onClick: () => SA.nav('approvals') }), SA.btn({ label: 'سجل التدقيق', icon: 'history', kind: 'ghost', size: 'sm', perm: 'sa.audit.view', onClick: () => SA.nav('audit') }))),
      SA.card({ title: 'قواعد الموبايل' }, h('ul', { style: { margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '6px', fontSize: 'var(--text-caption)' } }, ['لا اعتماد ولا عمليات مالية دون اتصال.', 'لا إجراء من نص الإشعار — يفتح الشاشة ثم يتحقق من الحالة والصلاحية.', 'جهاز مشترك: خروج + مسح البيانات المحمّلة.', 'الاعتماد المالي بـStep-up (كلمة مرور — البصمة/PIN خارج v1).', 'الموارد البشرية وتجاوز التجار تُنفَّذ من الويب فقط.'].map((t) => h('li', {}, t)))),
      SA.card({ title: 'جرّب' }, h('ol', { style: { margin: 0, paddingInlineStart: '18px', display: 'grid', gap: '6px', fontSize: 'var(--text-caption)' } }, ['افتح «الاعتمادات» ثم طلبًا بانتظارك.', 'اعتمده — ثم افتح الصندوق على الويب وشاهده بقناة الموبايل.', 'بدّل لأوفلاين وجرّب الاعتماد (معطّل).', 'غيّر الطلب من الويب بينما الشيت مفتوح: يُعاد التحقق عند القرار.'].map((t) => h('li', {}, t)))));
  }
  function draw() {
    if (!phoneHost) return; SA.clear(phoneHost); const u = me(); if (!u) return;
    const online = effOnline(); const live = online; if (online && M.signedIn && !M.cache) takeCache();
    const data = live ? { approvals: allApprovals(), activity: (st.get('audit') || []).slice(0, 15).map((a) => ({ code: a.code, actor: a.actor.name, ts: a.ts, via: a.via, target: a.target && a.target.label })), kpis: liveKpis() } : (M.cache || { approvals: [], activity: [], kpis: { mine: 0, active: 0, locked: 0, sessions: 0, dealers: 0 } });
    const titles = { home: 'الرئيسية', approvals: 'الاعتمادات', activity: 'النشاط', more: M.notifOpen ? 'الإشعارات' : 'المزيد' };
    const unread = SA.notifications.unread(); const mineN = live ? data.kpis.mine : (M.cache ? M.cache.kpis.mine : 0);
    const phone = h('div.sap-mob-phone', { role: 'region', 'aria-label': 'معاينة EG-Mobile' }, h('span.sap-mob-notch'));
    phone.append(h('div.sap-mob-status', {}, h('span', {}, new Date().toTimeString().slice(0, 5)), h('button', { type: 'button', 'aria-label': online ? 'متصل — اضغط للتبديل لأوفلاين' : 'غير متصل — اضغط للتبديل لأونلاين', onclick: () => { M.online = !M.online; if (M.online) takeCache(); draw(); } }, SA.icon(online ? 'globe' : 'wifioff', 'icon-sm'), online ? 'Online' : 'Offline')));
    if (!M.signedIn) {
      phone.append(h('div.sap-mob-signin', {}, h('span.sap-state-ico', {}, SA.icon('lock', 'icon-lg')), h('h3', {}, 'تم تسجيل الخروج'), h('p.t-muted', {}, 'مُسحت البيانات المحمّلة من هذا الجهاز.'), h('button.sap-mob-btn', { type: 'button', onclick: phoneSignIn }, 'تسجيل الدخول — ' + u.name)));
    } else {
      const body = h('div.sap-mob-body');
      phone.append(h('div.sap-mob-bar', {}, h('h2', {}, titles[M.tab]), h('button.sap-mob-ic', { type: 'button', 'aria-label': 'الإشعارات (' + unread + ')', onclick: () => { M.tab = 'more'; M.notifOpen = true; draw(); } }, SA.icon('bell'), unread ? h('i', {}, unread) : null)), body);
      if (!online) body.append(banner('warn', 'أنت دون اتصال. تعرض آخر بيانات محمّلة' + (M.cache ? ' (' + ago(M.cache.at) + ')' : '') + ' للقراءة فقط — الاعتماد والإجراءات معطّلة.', 'wifioff'));
      if (SA.session.permsStale) body.append(banner('warn', 'تم تحديث صلاحياتك — سيُعاد التحقق عند أي قرار.', 'alert'));
      if (!online && !M.cache) body.append(h('div.sap-mob-empty', {}, SA.icon('wifioff', 'icon-lg'), h('b', {}, 'لا بيانات محمّلة'), h('span', {}, 'اتصل بالإنترنت لتحميل البيانات.')));
      else if (M.tab === 'home') screenHome(body, data, live); else if (M.tab === 'approvals') screenApprovals(body, data, live); else if (M.tab === 'activity') screenActivity(body, data); else screenMore(body);
      phone.append(h('div.sap-mob-tabs', { role: 'tablist', 'aria-label': 'تنقل الموبايل' }, [['home', 'الرئيسية', 'dashboard'], ['approvals', 'الاعتمادات', 'clipboard'], ['activity', 'النشاط', 'activity'], ['more', 'المزيد', 'menu']].map((t) => h('button.sap-mob-tab', { type: 'button', role: 'tab', 'aria-selected': String(M.tab === t[0]), onclick: () => { M.tab = t[0]; if (t[0] !== 'more') M.notifOpen = false; draw(); } }, SA.icon(t[2]), t[1], t[0] === 'approvals' && mineN ? h('i', {}, mineN) : null))));
      if (M.sheetId) phone.append(sheet());
    }
    phoneHost.append(phone); drawSide();
    const f = M.sheetId ? phone.querySelector('.sap-mob-sheetp button') : null; if (f) f.focus();
  }

  function render(root, ctx) {
    ctx.setCrumbs([{ label: 'النظام' }, { label: 'Super Admin على الموبايل' }]);
    M.tab = M.tab || 'home'; M.sheetId = ctx.path[0] && /^AP-/.test(ctx.path[0]) ? ctx.path[0] : null; if (!M.signedIn && false) M.signedIn = true;
    root.append(SA.pageHead({ title: 'Super Admin على EG-Mobile', desc: 'معاينة تفاعلية لتطبيق الموبايل. تشارك نفس الاعتمادات والصلاحيات والتدقيق مع الويب — اعتمد من «الهاتف» وشاهد القرار في الصندوق الرئيسي.', tags: [SA.tag('pending', 'Pending بنود 17 و21 و22'), SA.tag('approved', 'أونلاين فقط')] }));
    phoneHost = h('div.sap-mob-stage'); sideHost = h('div.sap-mob-side');
    root.append(h('div.sap-mob-wrap', {}, phoneHost, sideHost));
    const skel = h('div', { style: { width: '372px', maxWidth: '100%' } }, SA.skeleton({ kind: 'detail', rows: 8 })); phoneHost.append(skel);
    let alive = true; SA.delay(260, { write: false }).then(() => { if (!alive) return; if (effOnline() || !M.cache) { M.cache = null; if (M.signedIn) takeCache(); } draw(); }, (e) => { if (!alive) return; SA.clear(phoneHost); phoneHost.append(SA.errorState({ text: SA.errorText(e), onRetry: () => SA.router.refresh() })); });
    const offs = ['approvals', 'users', 'sessions', 'notifications', 'audit', 'tour.sim'].map((p) => st.subscribe(p, () => { if (alive && phoneHost && phoneHost.firstChild && phoneHost.firstChild.classList && phoneHost.firstChild.classList.contains('sap-mob-phone')) draw(); }));
    const offPerm = SA.on('perms', () => draw());
    return () => { alive = false; offs.forEach((f) => f()); offPerm(); phoneHost = null; sideHost = null; };
  }
  SA.register({ id: 'mobile', group: 'system', title: 'الموبايل', icon: 'phone', route: 'mobile', perm: 'sa.approvals.view', order: 50, desc: 'معاينة Super Admin على EG-Mobile بنفس الاعتمادات', render });

  /* ───────────────────────── Test Lab missions ───────────────────────── */
  SA.missions.add({ id: 'M-C17', area: 'mobile', title: 'اعتمد من الموبايل ثم شاهده في صندوق الويب', persona: 'salesmgr', route: 'mobile', est: '5 د', goal: 'كمدير مبيعات افتح «الموبايل»، اعتمد خصم AP-2001 من الهاتف، ثم افتح صندوق الاعتمادات على الويب وشاهد القرار وحدث التدقيق بقناة الموبايل، والخطوة التالية للمدير العام.',
    steps: [{ text: 'افتح معاينة الموبايل وطلب AP-2001', route: 'mobile' }, { text: 'اعتمده من الهاتف', audit: 'APPROVAL.APPROVED', where: { via: 'mobile' } }, { text: 'افتح الصندوق على الويب وراجع السلسلة', route: 'approvals' }], detect: [{ route: 'mobile' }, { audit: 'APPROVAL.APPROVED', where: { via: 'mobile' } }, { route: 'approvals' }] });
  SA.missions.add({ id: 'M-C18', area: 'mobile', title: 'جرّب الأوفلاين وجهاز مشترك', persona: 'owner', route: 'mobile', est: '4 د', goal: 'بدّل الهاتف لأوفلاين وجرّب الاعتماد (معطّل)، ثم ارجع أونلاين ونفّذ «خروج ومسح بيانات الجهاز» وسجّل الدخول من جديد.',
    steps: [{ text: 'بدّل لأوفلاين وراجع حجب الاعتماد' }, { text: 'من «المزيد» اخرج من الجهاز المشترك', audit: 'SESSION.REVOKED', where: { via: 'mobile' } }], detect: [{ audit: 'SESSION.REVOKED', where: { via: 'mobile' } }] });
  SA.missions.add({ id: 'M-X1', area: 'approvals', title: 'رحلة كاملة: خصم ← موبايل ← مدير عام ← أثر في قائمة الأسعار', persona: 'salesmgr', route: 'mobile', est: '8 د', goal: 'عبر 4 وحدات: (1) كمدير مبيعات اعتمد طلبًا من الموبايل، (2) كمدير عام اعتمد الخطوة التالية من الويب، (3) كصاحب الشركة غيّر قائمة أسعار عميل (طلب اعتماد) واعتمده كمدير عام، (4) راجع سجل التدقيق: أحداث via=mobile وPRICELIST.CHANGED.',
    steps: [{ text: 'اعتمد AP-2001 من الموبايل', audit: 'APPROVAL.APPROVED', where: { via: 'mobile' } }, { text: 'كمدير عام اعتمد الخطوة التالية', audit: 'APPROVAL.APPROVED' }, { text: 'كصاحب الشركة غيّر قائمة أسعار عميل', audit: 'PRICELIST.CHANGED' }, { text: 'راجع التدقيق', route: 'audit' }], detect: [{ audit: 'APPROVAL.APPROVED', where: { via: 'mobile' } }, { audit: 'PRICELIST.CHANGED' }, { route: 'audit' }] });
})();
