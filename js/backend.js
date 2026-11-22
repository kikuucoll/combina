/* Rànquing compartit, perfil i desat al núvol amb Google (Firebase).
 * Si COMBINA_CONFIG.firebase és null, l'app funciona en mode local.
 *
 * Estructura a Firestore:
 *   days/{AAAA-MM-DD}/scores/{uid} → { name, avatar, total, exact, levels:[p1..p5], at }
 *   players/{uid}                   → { name, avatar, sum, days, best, last, updatedAt }
 *   saves/{uid}                     → { data: "<progrés local en JSON>", at }   (privat)
 */
(function (global) {
  'use strict';

  var cfg = global.COMBINA_CONFIG || {};
  var enabled = !!(cfg.firebase && global.firebase);
  var auth = null, db = null, user = null, listeners = [], lite = null;

  function shortName(name) {
    var p = String(name || 'Jugador').trim().split(/\s+/);
    return p.length > 1 ? p[0] + ' ' + p[p.length - 1].charAt(0) + '.' : p[0];
  }
  function ts() { return global.firebase.firestore.FieldValue.serverTimestamp(); }
  function notify() { listeners.forEach(function (fn) { fn(user); }); }

  if (enabled) {
    try {
      global.firebase.initializeApp(cfg.firebase);
      auth = global.firebase.auth();
      db = global.firebase.firestore();
      auth.onAuthStateChanged(function (u) {
        if (!u) { user = null; return notify(); }
        // Convidat amb nom (inici anònim): surt al rànquing però no té compte de Google
        var prevName = user && user.uid === u.uid ? user.name : '';
        user = { uid: u.uid, anon: !!u.isAnonymous, name: u.isAnonymous ? (prevName || 'Convidat') : shortName(u.displayName),
          photo: u.photoURL || '', avatar: '' };
        // Perfil personalitzat (nom i avatar), si n'hi ha
        db.collection('players').doc(u.uid).get().then(function (d) {
          var x = d.exists ? d.data() : {};
          if (x.name) user.name = x.name;
          if (x.avatar) user.avatar = x.avatar;
        }).catch(function () { /* sense perfil */ }).then(notify);
      });
    } catch (e) {
      console.warn('Firebase no s’ha pogut iniciar:', e);
      enabled = false;
    }
  }

  function scoresOf(dayKey) { return db.collection('days').doc(dayKey).collection('scores'); }
  function withUid(d) { var x = d.data(); x.uid = d.id; return x; }

  var Backend = {
    get enabled() { return enabled; },
    get user() { return user; },

    onAuth: function (fn) { listeners.push(fn); if (!enabled) fn(null); },

    /* Convidat que vol sortir al rànquing: compte anònim amb el nom que triï */
    guestJoin: function (name, avatar) {
      if (!enabled) return Promise.reject(new Error('Rànquing no configurat'));
      var go = auth.currentUser ? Promise.resolve({ user: auth.currentUser }) : auth.signInAnonymously();
      return go.then(function (cred) {
        var u = cred.user;
        user = { uid: u.uid, anon: !!u.isAnonymous, name: name, photo: '', avatar: avatar || '' };
        return db.collection('players').doc(u.uid).set({ name: name, avatar: avatar || '', updatedAt: ts() }, { merge: true });
      }).then(function () { notify(); return user; });
    },

    signIn: function () {
      if (!enabled) return Promise.reject(new Error('Rànquing no configurat'));
      var provider = new global.firebase.auth.GoogleAuthProvider();
      var cur = auth.currentUser;
      // Si ja jugava com a convidat amb nom, s'hi vincula Google i es conserven les puntuacions
      if (cur && cur.isAnonymous) {
        return cur.linkWithPopup(provider).then(function (r) {
          // Mateix uid: es manté el nom triat; només deixa de ser convidat (onAuthStateChanged no salta)
          var u = r.user;
          user = { uid: u.uid, anon: false, name: (user && user.name) || shortName(u.displayName),
            photo: u.photoURL || '', avatar: (user && user.avatar) || '' };
          notify();
          return r;
        }).catch(function (e) {
          if (e && e.code === 'auth/credential-already-in-use' && e.credential) return auth.signInWithCredential(e.credential);
          if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return cur.linkWithRedirect(provider);
          throw e;
        });
      }
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
      var scoreRef = scoresOf(dayKey).doc(user.uid);
      var playerRef = db.collection('players').doc(user.uid);
      return db.runTransaction(function (tx) {
        return Promise.all([tx.get(scoreRef), tx.get(playerRef)]).then(function (r) {
          if (r[0].exists) return false;
          var p = r[1].exists ? r[1].data() : {};
          tx.set(scoreRef, {
            name: user.name, avatar: user.avatar || '', total: result.total, exact: result.exact,
            levels: result.levels, exprs: result.exprs || [], at: ts()
          });
          tx.set(playerRef, {
            name: user.name, avatar: user.avatar || '',
            sum: (p.sum || 0) + result.total, days: (p.days || 0) + 1,
            best: Math.max(p.best || 0, result.total), last: dayKey, updatedAt: ts()
          }, { merge: true });
          return true;
        });
      });
    },

    /* Canvia el nom i l'avatar públics (i els d'avui, si ja hi ha puntuació) */
    saveProfile: function (name, avatar, dayKey) {
      if (!enabled || !user) return Promise.reject(new Error('Cal iniciar la sessió'));
      var data = { name: name, avatar: avatar || '', updatedAt: ts() };
      return db.collection('players').doc(user.uid).set(data, { merge: true }).then(function () {
        user.name = name; user.avatar = avatar || '';
        var ref = scoresOf(dayKey).doc(user.uid);
        return ref.get().then(function (d) {
          if (d.exists) return ref.update({ name: name, avatar: avatar || '' });
        }).catch(function () { /* la d'avui és opcional */ });
      });
    },

    /* Progrés complet (ratxa, segells, dies…), privat de cada jugador */
    loadSave: function () {
      if (!enabled || !user) return Promise.resolve(null);
      return db.collection('saves').doc(user.uid).get().then(function (d) {
        if (!d.exists) return null;
        try { return JSON.parse(d.data().data); } catch (e) { return null; }
      });
    },
    pushSave: function (obj) {
      if (!enabled || !user) return Promise.resolve();
      return db.collection('saves').doc(user.uid).set({ data: JSON.stringify(obj), at: ts() });
    },

    /* Un jugador concret (per als reptes entre amics) */
    player: function (uid) {
      if (!enabled) return Promise.resolve(null);
      return db.collection('players').doc(uid).get().then(function (d) { return d.exists ? withUid(d) : null; });
    },
    scoreOf: function (dayKey, uid) {
      if (!enabled) return Promise.resolve(null);
      return scoresOf(dayKey).doc(uid).get().then(function (d) { return d.exists ? withUid(d) : null; });
    },

    /* Distribució de puntuacions d'un dia, sense descarregar-les: consultes de recompte al servidor
     * (Firestore Lite, carregat només quan cal). Cada recompte costa 1 lectura per cada 1000 jugadors.
     * Torna { n, buckets: [11 recomptes: 0–49 … 450–499, 500], below, ties } */
    distribution: function (dayKey, mine) {
      if (!enabled || !cfg.firebase) return Promise.resolve(null);
      var V = 'https://www.gstatic.com/firebasejs/10.12.2/';
      if (!lite) {
        lite = Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-firestore-lite.js')]).then(function (m) {
          var app = m[0].initializeApp(cfg.firebase, 'stats');
          return { F: m[1], db: m[1].getFirestore(app) };
        });
        lite.catch(function () { lite = null; });
      }
      return lite.then(function (L) {
        var F = L.F, col = F.collection(L.db, 'days', dayKey, 'scores');
        var count = function () {
          var q = F.query.apply(null, [col].concat(Array.prototype.slice.call(arguments)));
          return F.getCount(q).then(function (s) { return s.data().count; });
        };
        var jobs = [];
        for (var b = 0; b < 10; b++) jobs.push(count(F.where('total', '>=', b * 50), F.where('total', '<', b * 50 + 50)));
        jobs.push(count(F.where('total', '>=', 500)));
        jobs.push(count(F.where('total', '<', mine)));
        jobs.push(count(F.where('total', '==', mine)));
        return Promise.all(jobs).then(function (r) {
          var buckets = r.slice(0, 11);
          return { n: buckets.reduce(function (a, c) { return a + c; }, 0), buckets: buckets, below: r[11], ties: r[12] };
        });
      });
    },

    /* Rànquing d'un dia (tothom, o només una llista de jugadors) */
    day: function (dayKey, uids) {
      if (!enabled) return Promise.resolve([]);
      if (uids) {
        return Promise.all(uids.map(function (u) { return Backend.scoreOf(dayKey, u).catch(function () { return null; }); }))
          .then(function (l) { return l.filter(Boolean).sort(function (a, b) { return b.total - a.total; }); });
      }
      return scoresOf(dayKey).orderBy('total', 'desc').limit(200).get()
        .then(function (q) { return q.docs.map(withUid); });
    },

    /* Rànquing dels últims 7 reptes (suma) */
    week: function (dayKeys, uids) {
      if (!enabled) return Promise.resolve([]);
      return Promise.all(dayKeys.map(function (k) { return Backend.day(k, uids); })).then(function (lists) {
        var acc = {};
        lists.forEach(function (list) {
          list.forEach(function (s) {
            var a = acc[s.uid] || (acc[s.uid] = { uid: s.uid, name: s.name, avatar: s.avatar, total: 0, exact: 0, days: 0 });
            a.total += s.total; a.exact += s.exact || 0; a.days++;
          });
        });
        return Object.keys(acc).map(function (k) { return acc[k]; }).sort(function (a, b) { return b.total - a.total; });
      });
    },

    /* Rànquing total acumulat */
    total: function (uids) {
      if (!enabled) return Promise.resolve([]);
      var map = function (x) { return { uid: x.uid, name: x.name, avatar: x.avatar, total: x.sum || 0, days: x.days || 0, best: x.best || 0 }; };
      if (uids) {
        return Promise.all(uids.map(function (u) { return Backend.player(u).catch(function () { return null; }); }))
          .then(function (l) { return l.filter(function (x) { return x && x.days; }).map(map).sort(function (a, b) { return b.total - a.total; }); });
      }
      return db.collection('players').orderBy('sum', 'desc').limit(200).get()
        .then(function (q) { return q.docs.map(function (d) { return map(withUid(d)); }); });
    }
  };

  global.Backend = Backend;
})(window);
