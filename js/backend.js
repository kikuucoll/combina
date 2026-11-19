/* Rànquing compartit i inici de sessió amb Google (Firebase).
 * Si COMBINA_CONFIG.firebase és null, l'app funciona en mode local.
 *
 * Estructura a Firestore:
 *   days/{AAAA-MM-DD}/scores/{uid} → { name, photo, total, exact, levels:[p1..p5], at }
 *   players/{uid}                   → { name, photo, sum, days, best, last, updatedAt }
 */
(function (global) {
  'use strict';

  var cfg = global.COMBINA_CONFIG || {};
  var enabled = !!(cfg.firebase && global.firebase);
  var auth = null, db = null, user = null, listeners = [];

  if (enabled) {
    try {
      global.firebase.initializeApp(cfg.firebase);
      auth = global.firebase.auth();
      db = global.firebase.firestore();
      auth.onAuthStateChanged(function (u) {
        user = u ? { uid: u.uid, name: u.displayName || 'Jugador', photo: u.photoURL || '' } : null;
        listeners.forEach(function (fn) { fn(user); });
      });
    } catch (e) {
      console.warn('Firebase no s’ha pogut iniciar:', e);
      enabled = false;
    }
  }

  function shortName(name) {
    var p = String(name || 'Jugador').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[p.length - 1].charAt(0) + '.' : p[0];
  }

  var Backend = {
    get enabled() { return enabled; },
    get user() { return user; },

    onAuth: function (fn) { listeners.push(fn); if (!enabled) fn(null); },

    signIn: function () {
      if (!enabled) return Promise.reject(new Error('Rànquing no configurat'));
      var provider = new global.firebase.auth.GoogleAuthProvider();
      return auth.signInWithPopup(provider).catch(function (e) {
        if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
          return auth.signInWithRedirect(provider);
        }
        throw e;
      });
    },

    signOut: function () { return enabled ? auth.signOut() : Promise.resolve(); },

    /* Desa el resultat del dia (només una vegada per dia) */
    submitDay: function (dayKey, result) {
      if (!enabled || !user) return Promise.resolve(false);
      var scoreRef = db.collection('days').doc(dayKey).collection('scores').doc(user.uid);
      var playerRef = db.collection('players').doc(user.uid);
      var name = shortName(user.name);
      return db.runTransaction(function (tx) {
        return Promise.all([tx.get(scoreRef), tx.get(playerRef)]).then(function (r) {
          if (r[0].exists) return false;
          var p = r[1].exists ? r[1].data() : { sum: 0, days: 0, best: 0 };
          tx.set(scoreRef, {
            name: name, photo: user.photo, total: result.total, exact: result.exact,
            levels: result.levels, at: global.firebase.firestore.FieldValue.serverTimestamp()
          });
          tx.set(playerRef, {
            name: name, photo: user.photo,
            sum: (p.sum || 0) + result.total, days: (p.days || 0) + 1,
            best: Math.max(p.best || 0, result.total), last: dayKey,
            updatedAt: global.firebase.firestore.FieldValue.serverTimestamp()
          });
          return true;
        });
      });
    },

    /* Rànquing d'un dia */
    day: function (dayKey) {
      if (!enabled) return Promise.resolve([]);
      return db.collection('days').doc(dayKey).collection('scores')
        .orderBy('total', 'desc').limit(200).get()
        .then(function (q) { return q.docs.map(function (d) { var x = d.data(); x.uid = d.id; return x; }); });
    },

    /* Rànquing dels últims 7 reptes (suma) */
    week: function (dayKeys) {
      if (!enabled) return Promise.resolve([]);
      return Promise.all(dayKeys.map(function (k) { return Backend.day(k); })).then(function (lists) {
        var acc = {};
        lists.forEach(function (list) {
          list.forEach(function (s) {
            var a = acc[s.uid] || (acc[s.uid] = { uid: s.uid, name: s.name, photo: s.photo, total: 0, exact: 0, days: 0 });
            a.total += s.total; a.exact += s.exact || 0; a.days++;
          });
        });
        return Object.keys(acc).map(function (k) { return acc[k]; }).sort(function (a, b) { return b.total - a.total; });
      });
    },

    /* Rànquing total acumulat */
    total: function () {
      if (!enabled) return Promise.resolve([]);
      return db.collection('players').orderBy('sum', 'desc').limit(200).get()
        .then(function (q) {
          return q.docs.map(function (d) { var x = d.data(); return { uid: d.id, name: x.name, photo: x.photo, total: x.sum, days: x.days, best: x.best }; });
        });
    }
  };

  global.Backend = Backend;
})(window);
