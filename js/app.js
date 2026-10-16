/* app.js — boot: show the login screen (or open straight away for a remembered learner), load THAT
   learner's data instantly from this device, render, then sync with their account in the background. */
(function(){
  Views.applyTheme();
  M.on('route', () => Views.nav());
  M.on('ai', () => { Views.nav(); if(['learn','home','coach','settings','labs','dashboard','library'].includes(M.current.name)) M.render(); });
  M.on('sync', () => { Views.nav(); if(M.current.name === 'settings' && !document.activeElement?.matches('input,textarea,select')) M.render(); });
  M.on('auth', () => Views.nav());
  let pend = false;
  M.on('store', (key) => {
    if(pend) return; pend = true;
    requestAnimationFrame(() => { pend = false; Views.nav(); if(key === '*' && !document.activeElement?.matches('input,textarea,select')) M.render(); });
  });

  Auth.boot((user) => {
    Store.useUser(user);
    Revision.scan();
    M.render();
    AI.init();
    Store.connect().then(() => { Revision.scan(); Views.nav(); });
    // stale "checking" state safety
    setTimeout(() => { if(AI.status === 'checking'){ AI.status = 'off'; M.emit('ai'); } }, 90000);
  });

  // Offline support + instant repeat loads (see sw.js). Failure is harmless.
  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // A new version finished downloading: switch to it once (saves first), so nobody runs stale code.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if(!hadController || reloaded) return; reloaded = true;
      Promise.resolve(window.Store && Store.uid ? Store.flushNow(4000) : true).finally(() => location.reload());
    });
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
})();
