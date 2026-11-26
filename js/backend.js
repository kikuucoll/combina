/* Rànquing compartit, perfil i desat al núvol amb Google (Firebase).
 * Si COMBINA_CONFIG.firebase és null, l'app funciona en mode local.
 *
 * Estructura a Firestore:
 *   days/{AAAA-MM-DD}/scores/{uid} → { name, avatar, total, exact, levels:[p1..p5], at }   (públic: sense operacions)
 *   players/{uid}                   → { name, avatar, sum, days, best, last, updatedAt }
 *   saves/{uid}                     → { data: "<progrés local en JSON>", at }   (privat)
 *   stats/{AAAA-MM-DD}              → { s, n, sum }   (recompte anònim: qui comença, qui acaba i la suma de punts)
 */
(function (global) {
  'use strict';

  var cfg = global.COMBINA_CONFIG || {};
  var enabled = !!(cfg.firebase && global.firebase);
  var auth = null, db = null, user = null, listeners = [], lite = null;

  /* Àlies per defecte: un savi i un número fix derivat de l'uid (mai el nom real del compte de Google) */
  var SAVIS = ['Pitàgores', 'Hipàtia', 'Arquimedes', 'Noether', 'Gauss', 'Euclides', 'Fibonacci', 'Lovelace'];
  function alias(uid) {
    var h = 0, s = String(uid || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return SAVIS[h % SAVIS.length] + ' ' + (100 + (Math.floor(h / SAVIS.length) % 900));
  }
  // Nom per defecte que fèiem servir abans (nom real de Google abreujat, «Joan G.»): es substitueix per un àlies
  function oldShortName(name) {
    var p = String(name || '').trim().split(/s+/);
    return p.length > 1 ? p[0] + ' ' + p[p.length - 1].charAt(0) + '.' : p[0];
  }
  // Mateix filtre que les regles de Firestore (validName): si no el passa, no es podria desar cap puntuació
  function badName(name) { return /@/.test(name) || /\d{4,}/.test(name) || /www|http|\.(com|cat|es|net|org)/i.test(name); }
  function looksReal(name, u) {
    var dn = String((u && u.displayName) || '').trim();
    return !!dn && (name === dn || name === oldShortName(dn));
  }
  // Tots els dies de repte fins avui (per actualitzar l'àlies a l'historial del rànquing)
  function allDays() {
    var P = global.Puzzle, out = [];
    if (!P || !cfg.startDate) return out;
    for (var k = cfg.startDate, i = 0; k <= P.dayKey() && i < 5000; k = P.addDays(k, 1), i++) out.push(k);
    return out;
  }
  // Canvia nom i avatar a totes les puntuacions publicades i n'esborra les operacions (ja no són públiques)
  function renameScores(uid, name, avatar) {
    var del = global.firebase.firestore.FieldValue.delete();
    return Promise.all(allDays().map(function (k) {
      var ref = db.collection('days').doc(k).collection('scores').doc(uid);
      return ref.get().then(function (d) {
        if (!d.exists) return;
        var x = d.data(), up = {}, rm = {};
        if (x.name !== name) up.name = name;
        if ((x.avatar || '') !== (avatar || '')) up.avatar = avatar || '';
        if ('exprs' in x) rm.exprs = del;
        if ('photo' in x) rm.photo = del;
        // En dues passes: si les regles encara no permeten esborrar camps, almenys el nom canvia
        var p = Object.keys(up).length ? ref.update(up) : Promise.resolve();
        return p.then(function () { if (Object.keys(rm).length) return ref.update(rm).catch(function () {}); });
      }).catch(function () { /* opcional */ });
    }));
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
        // Mai no fem servir el nom ni la foto del compte de Google: només un àlies
        user = { uid: u.uid, anon: !!u.isAnonymous, name: u.isAnonymous ? (prevName || 'Convidat') : alias(u.uid),
          photo: '', avatar: '' };
        // Perfil personalitzat (nom i avatar), si n'hi ha
        db.collection('players').doc(u.uid).get().then(function (d) {
          var x = d.exists ? d.data() : {};
          if (x.name) user.name = x.name;
          if (x.avatar) user.avatar = x.avatar;
          // Nom canviat per privadesa (neteja del 23/11/2026): l'app ho avisa un cop
          if (x.aliasNotice) user.aliasNotice = true;
          // Perfils antics amb el nom real de Google: passen a un àlies (perfil i historial del rànquing)
          if (x.name && ((!u.isAnonymous && looksReal(x.name, u)) || badName(x.name))) {
            user.name = alias(u.uid);
            return db.collection('players').doc(u.uid).set({ name: user.name, updatedAt: ts() }, { merge: true })
              .then(function () { return renameScores(u.uid, user.name, user.avatar); });
          }
        }).catch(function () { /* sense perfil */ }).then(notify);
      });
    } catch (e) {
      console.warn('Firebase no s’ha pogut iniciar:', e);
      enabled = false;
    }
  }

  // Firestore Lite (per a les consultes de recompte), carregat només quan cal
  function liteDb() {
    var V = 'https://www.gstatic.com/firebasejs/10.12.2/';
    if (!lite) {
      lite = Promise.all([import(V + 'firebase-app.js'), import(V + 'firebase-firestore-lite.js')]).then(function (m) {
        var app = m[0].initializeApp(cfg.firebase, 'stats');
        return { F: m[1], db: m[1].getFirestore(app) };
      });
      lite.catch(function () { lite = null; });
    }
    return lite;
  }
  function scoresOf(dayKey) { return db.collection('days').doc(dayKey).collection('scores'); }
  function withUid(d) { var x = d.data(); x.uid = d.id; return x; }

  var Backend = {
    get enabled() { return enabled; },
    get user() { return user; },
    aliasFor: alias,
    isAlias: function (n) { return new RegExp('^(' + SAVIS.join('|') + ') \\d{3}$').test(n || ''); },

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
          user = { uid: u.uid, anon: false, name: (user && user.name) || alias(u.uid),
            photo: '', avatar: (user && user.avatar) || '' };
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
    // Resultat (o error) d'un inici de sessió per redirecció, en tornar a la pàgina
    redirectResult: function () { return enabled ? auth.getRedirectResult() : Promise.resolve(null); },

    /* Dret de supressió (art. 17 RGPD): esborra el perfil, totes les puntuacions, el progrés desat
     * i el mateix compte de Firebase. dayKeys = tots els dies en què podria haver jugat.
     * Les regles només deixen esborrar una puntuació si el perfil s'esborra en la mateixa operació
     * o ja no existeix (així no es pot «tornar a jugar» un dia esborrant-ne només la puntuació). */
    deleteAccount: function (dayKeys) {
      if (!enabled || !auth.currentUser) return Promise.reject(new Error('No hi ha cap sessió iniciada'));
      var u = auth.currentUser, uid = u.uid;
      var refs = [db.collection('players').doc(uid), db.collection('saves').doc(uid)]
        .concat((dayKeys || []).map(function (k) { return scoresOf(k).doc(uid); }));
      var chunks = [];
      for (var i = 0; i < refs.length; i += 400) chunks.push(refs.slice(i, i + 400));
      // Google demana haver entrat fa poc per esborrar un compte: es confirma primer (dins del clic,
      // perquè el navegador no bloquegi la finestra) i després s'esborra tot
      var pre = u.isAnonymous ? Promise.resolve()
        : u.reauthenticateWithPopup(new global.firebase.auth.GoogleAuthProvider());
      return pre.then(function () {
        return chunks.reduce(function (p, list) {
          return p.then(function () { var b = db.batch(); list.forEach(function (r) { b.delete(r); }); return b.commit(); });
        }, Promise.resolve());
      }).then(function () { return u.delete(); })
        .then(function () { user = null; notify(); });
    },

    /* Desa el resultat del dia (només una vegada per dia) */
    submitDay: function (dayKey, result) {
      if (!enabled || !user) return Promise.resolve(false);
      var scoreRef = scoresOf(dayKey).doc(user.uid);
      var playerRef = db.collection('players').doc(user.uid);
      return db.runTransaction(function (tx) {
        return Promise.all([tx.get(scoreRef), tx.get(playerRef)]).then(function (r) {
          if (r[0].exists) return false;
          var p = r[1].exists ? r[1].data() : {};
          // El nom desat al perfil mana (p. ex. si s'ha canviat per privadesa amb la pàgina oberta)
          if (p.name) user.name = p.name;
          if (p.avatar) user.avatar = p.avatar;
          tx.set(scoreRef, {
            name: user.name, avatar: user.avatar || '', total: result.total, exact: result.exact,
            levels: result.levels, at: ts()
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
        // El nou àlies substitueix l'antic a tot l'historial del rànquing (no només avui)
        return renameScores(user.uid, name, avatar);
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

    /* Recompte anònim del dia: quantes persones l'han acabat i la suma dels seus punts.
     * stats/{AAAA-MM-DD} → { n, sum }. Sense cap nom ni identificador; també compta els convidats. */
    countStart: function (dayKey) {
      if (!enabled) return Promise.reject(new Error('sense Firebase'));
      return db.collection('stats').doc(dayKey).set({ s: global.firebase.firestore.FieldValue.increment(1) }, { merge: true });
    },
    countPlayer: function (dayKey, total) {
      if (!enabled) return Promise.reject(new Error('sense Firebase'));
      var inc = global.firebase.firestore.FieldValue.increment;
      return db.collection('stats').doc(dayKey).set({ n: inc(1), sum: inc(total) }, { merge: true });
    },
    dayStats: function (dayKey) {
      if (!enabled) return Promise.resolve(null);
      return db.collection('stats').doc(dayKey).get().then(function (d) { return d.exists ? d.data() : null; });
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
      return liteDb().then(function (L) {
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

    /* Jugadors del dia per rang de savi (5 recomptes = 5 lectures, sigui quin sigui el nombre de jugadors).
     * ranges: [[min, max], …] */
    rankCounts: function (dayKey, ranges) {
      if (!enabled || !cfg.firebase) return Promise.resolve(null);
      return liteDb().then(function (L) {
        var F = L.F, col = F.collection(L.db, 'days', dayKey, 'scores');
        return Promise.all(ranges.map(function (r) {
          return F.getCount(F.query(col, F.where('total', '>=', r[0]), F.where('total', '<=', r[1]))).then(function (s) { return s.data().count; });
        }));
      });
    },

    /* Rànquing d'un dia (tothom, o només una llista de jugadors) */
    day: function (dayKey, uids) {
      if (!enabled) return Promise.resolve([]);
      if (uids) {
        return Promise.all(uids.map(function (u) { return Backend.scoreOf(dayKey, u).catch(function () { return null; }); }))
          .then(function (l) { return l.filter(Boolean).sort(function (a, b) { return b.total - a.total; }); });
      }
      // Només els 100 que es mostren (cada document és una lectura de la quota)
      return scoresOf(dayKey).orderBy('total', 'desc').limit(100).get()
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
      return db.collection('players').orderBy('sum', 'desc').limit(100).get()
        .then(function (q) { return q.docs.map(function (d) { return map(withUid(d)); }); });
    }
  };

  global.Backend = Backend;
})(window);
