/* EG Super Admin prototype — app.js: boots the store, test lab, auth watchers and the hash router. */
(function () {
  'use strict';
  const SA = window.SA;
  try { SA.store.init(SA.seed.build); } catch (e) { console.error('seed failed', e); }
  SA.applyUi();
  SA.tour.mount();
  SA.auth.initWatchers();
  SA.on('login', () => { SA.shell.host = null; });
  const app = document.getElementById('app');
  const PUBLIC = ['start', 'login', 'forgot', 'reset', 'activate'];
  function onRoute(route) {
    const s0 = route.segs[0] || '';
    if (SA.session.isAuthed) {
      if (PUBLIC.indexOf(s0) >= 0) { SA.nav(SA.homeRoute() || '', { replace: true }); if (!SA.homeRoute()) { SA.shell.mount(app); SA.shell.route(SA.route); } return; }
      SA.shell.mount(app); SA.shell.route(route);
    } else {
      if (s0 && PUBLIC.indexOf(s0) < 0) { SA.auth.intended = route.raw; SA.nav('login', { replace: true }); return; }
      if (app.dataset.mode !== 'auth') { SA.shell.unmount(); app.dataset.mode = 'auth'; }
      SA.auth.render(app, route);
    }
  }
  SA.router.onChange(onRoute);
  SA.router.start();
})();
