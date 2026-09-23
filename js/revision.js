/* revision.js — Revision Engine: spaced retrieval, forgetting detection, cumulative revision. */
(function(){
  const Revision = window.Revision = {
    onMastered(t){
      t.review = { due: Date.now() + M.DAY, interval: 1, ease: 2.3, history: [] };
    },

    /* Forgetting detection (predicted): badly overdue mastered topics become AT RISK until rechecked. */
    scan(){
      const now = Date.now();
      Store.topicsList().forEach(t => {
        if(!t.masteredAt || !t.review || t.atRisk) return;
        const overdueDays = (now - t.review.due) / M.DAY;
        if(overdueDays > Math.max(3, t.review.interval)){ t.atRisk = true; t.atRiskReason = 'overdue'; Store.saveTopic(t); }
      });
    },

    due(){
      return Store.topicsList().filter(t => t.masteredAt && (t.atRisk || (t.review && t.review.due <= Date.now())))
        .sort((a,b) => (b.atRisk - a.atRisk) || (a.review.due - b.review.due));
    },
    upcoming(){
      return Store.topicsList().filter(t => t.masteredAt && !t.atRisk && t.review && t.review.due > Date.now()).sort((a,b) => a.review.due - b.review.due);
    },

    /* Cumulative revision: older mastered topics from the same subject come back mixed in. */
    related(t){
      const all = Store.topicsList().filter(x => x.id !== t.id && x.masteredAt && (x.subject === t.subject || x.subjectKind === t.subjectKind));
      return all.sort((a,b) => a.masteredAt - b.masteredAt).slice(0, 2);
    },

    record(t, results){
      const n = results.length, right = results.filter(r => r.correct).length;
      const openOk = results.some(r => r.correct && Mastery.OPEN_TYPES.includes(r.type));
      const passed = right >= n - 1 && openOk;
      const r = t.review || { interval:1, ease:2.3, history:[] };
      r.history = r.history || [];
      r.history.push({ at: Date.now(), right, n, passed });
      if(passed){
        r.interval = Math.max(2, Math.round(r.interval * r.ease));
        r.ease = Math.min(2.8, r.ease + 0.1);
        r.due = Date.now() + r.interval * M.DAY;
        if(t.atRisk){ t.atRisk = false; t.atRiskReason = null; }
        if(Date.now() - t.masteredAt >= M.DAY * 0.9) t.retainedAt = t.retainedAt || Date.now();
      } else {
        r.ease = Math.max(1.3, r.ease - 0.2);
        r.interval = 1; r.due = Date.now();
        t.atRisk = true; t.atRiskReason = 'failed-review';
      }
      t.review = r;
      return { passed, right, n };
    },

    refreshed(t, ok){
      if(!t.review) return;
      if(ok){ t.atRisk = false; t.atRiskReason = null; t.review.interval = 2; t.review.due = Date.now() + 2 * M.DAY; }
      else { t.review.due = Date.now(); }
    }
  };
})();
