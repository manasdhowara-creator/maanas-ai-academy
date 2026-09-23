/* app.js — boot: load local data instantly, render, then light up AI + account sync when the runtime answers. */
(function(){
  Store.loadLocal();
  Views.applyTheme();
  Revision.scan();
  M.on('route', () => Views.nav());
  M.on('ai', () => { Views.nav(); if(['learn','home','coach','settings','labs','dashboard'].includes(M.current.name)) M.render(); });
  M.on('sync', () => Views.nav());
  let pend = false;
  M.on('store', (key) => {
    if(pend) return; pend = true;
    requestAnimationFrame(() => { pend = false; Views.nav(); if(key === '*' && !document.activeElement?.matches('input,textarea,select')) M.render(); });
  });
  M.render();
  AI.init();
  Store.connect().then(() => Revision.scan());
  // stale "checking" state safety: the runtime answers within ~10 s or resolves null
  setTimeout(() => { if(AI.status === 'checking'){ AI.status = 'off'; M.emit('ai'); } }, 12000);
})();
