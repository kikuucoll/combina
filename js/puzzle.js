/* Repte diari: data del repte (canvia a les 9:00, hora de Barcelona)
 * i generació determinista dels 5 nivells a partir de la data.
 * Tothom rep exactament el mateix repte sense necessitat de servidor. */
(function (global) {
  'use strict';

  function cfg() { return global.COMBINA_CONFIG; }

  /* ---------- Atzar amb llavor ---------- */
  function hashStr(s) {
    var h = 1779033703 ^ s.length;
    for (var i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(key) { return mulberry32(hashStr(key)); }
  function shuffle(rng, a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var x = a[i]; a[i] = a[j]; a[j] = x;
    }
    return a;
  }

  /* ---------- Dates ---------- */
  function parts(date, tz) {
    var f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    var o = {};
    f.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }

  /* Clau del repte vigent: AAAA-MM-DD (abans de les 9:00 encara és el d'ahir) */
  function dayKey(date) {
    var c = cfg();
    var shifted = new Date((date || new Date()).getTime() - c.resetHour * 3600000);
    var o = parts(shifted, c.timeZone);
    return o.year + '-' + o.month + '-' + o.day;
  }

  function keyToUTC(k) {
    var p = k.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]);
  }
  function addDays(k, n) {
    var d = new Date(keyToUTC(k) + n * 86400000);
    return d.toISOString().slice(0, 10);
  }
  function challengeNumber(k) {
    return Math.round((keyToUTC(k) - keyToUTC(cfg().startDate)) / 86400000) + 1;
  }

  /* Mil·lisegons fins al pròxim canvi de repte */
  function msToReset(now) {
    var c = cfg();
    var o = parts(now || new Date(), c.timeZone);
    var secs = (+o.hour) * 3600 + (+o.minute) * 60 + (+o.second);
    var diff = (c.resetHour * 3600 - secs + 86400) % 86400;
    if (diff === 0) diff = 86400;
    return diff * 1000;
  }

  var DAYS = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
  var MONTHS = ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'];
  function prettyDay(k) {
    var d = new Date(keyToUTC(k));
    return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }
  function shortDay(k) {
    return ['Dg', 'Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds'][new Date(keyToUTC(k)).getUTCDay()];
  }

  /* ---------- Generador de nivells ----------
   * Corba de dificultat suau:
   *  N1 — 2 o 3 xifres, només + − ×, objectiu petit: sempre assolible.
   *  N2 — 3 o 4 xifres, + − × ÷, sense potències ni arrels.
   *  N3 — apareixen (poc) les potències i les arrels.
   *  N4–N5 — el repte de debò.
   * Els primers 7 reptes des del llançament són encara més assequibles. */
  // Objectius petits i assequibles. La solució de referència fa servir SEMPRE totes les xifres
  // (k = nombre de xifres), així els 100 punts de cada ronda sempre són possibles.
  // w = pesos de + − × ÷ (sobretot sumes i restes).
  var SPEC = [
    { lo: 10, hi: 50,  k: [4, 4], w: [0.46, 0.32, 0.22, 0],    pow: 0,    root: 0,    needMul: false, strong: 0 },
    { lo: 12, hi: 70,  k: [5, 5], w: [0.44, 0.32, 0.20, 0.04], pow: 0,    root: 0,    needMul: false, strong: 0 },
    { lo: 15, hi: 100, k: [6, 6], w: [0.42, 0.32, 0.20, 0.06], pow: 0.08, root: 0.08, needMul: false, strong: 0 },
    { lo: 20, hi: 130, k: [7, 7], w: [0.42, 0.32, 0.20, 0.06], pow: 0.15, root: 0.12, needMul: false, strong: 0 },
    { lo: 25, hi: 160, k: [8, 8], w: [0.42, 0.32, 0.20, 0.06], pow: 0.2,  root: 0.15, needMul: false, strong: 0 }
  ];
  // Corba nova (des de COMBINA_CONFIG.curveFrom): N1–N3 molt assequibles, amb xifres i objectius petits.
  // Objectius: N1 fins a 15 · N2 16–30 · N3 31–50 · N4 51–100 · N5 com sempre.  max = xifra més gran.
  // N1 és per enganxar: xifres d'un sol dígit i només sumes i restes.
  var SPEC2 = [
    { lo: 1,  hi: 15,  max: 9,  k: [4, 4], w: [0.58, 0.42, 0, 0],       pow: 0,    root: 0,    needMul: false, strong: 0 },
    { lo: 16, hi: 30,  max: 10, k: [5, 5], w: [0.50, 0.34, 0.16, 0],    pow: 0,    root: 0,    needMul: false, strong: 0 },
    { lo: 31, hi: 50,  max: 12, k: [6, 6], w: [0.46, 0.32, 0.18, 0.04], pow: 0,    root: 0,    needMul: false, strong: 0 },
    { lo: 51, hi: 100, max: 20, k: [7, 7], w: [0.42, 0.32, 0.20, 0.06], pow: 0.12, root: 0.10, needMul: false, strong: 0 },
    // N5: les mateixes operacions i xifres que fins ara, però l'objectiu sempre per sobre del N4
    Object.assign({}, SPEC[4], { lo: 101, hi: 160 })
  ];
  var PREC = { '^': 3, '*': 2, '/': 2, '+': 1, '-': 1 };

  function useNewCurve(k) {
    var from = cfg().curveFrom;
    return !from || !/^\d{4}-\d{2}-\d{2}$/.test(k) || k >= from;
  }

  function specFor(li, n, k) {
    if (useNewCurve(k)) return Object.assign({}, SPEC2[li]);
    var s = Object.assign({}, SPEC[li]);
    if (n >= 1 && n <= 7) {
      var f = 0.55 + 0.065 * (n - 1);           // menys potències i arrels els primers dies
      s.pow *= f; s.root *= f; s.strong *= f;
      if (n <= 3 && li === 2) { s.pow = 0; s.root = 0; }
    }
    return s;
  }

  /* Genera molts reptes possibles per a un nivell (un per objectiu diferent) */
  function genCandidates(rng, count, li, n, want, k) {
    var S = specFor(li, n, k), lo = S.lo, hi = S.hi, found = {}, list = [];
    var maxNum = Math.max(count + 2, S.max || 20);
    for (var attempt = 0; attempt < 40000 && list.length < want; attempt++) {
      var all = shuffle(rng, Array.from({ length: maxNum }, function (_, i) { return i + 1; }));
      var nums = all.slice(0, count);

      var useK = S.k[0] + Math.floor(rng() * (S.k[1] - S.k[0] + 1));
      useK = Math.min(count, Math.max(2, useK));

      var pool = shuffle(rng, nums.slice()).slice(0, useK).map(function (v) {
        return { v: v, s: String(v), p: 4, leaf: true };
      });
      // De tant en tant, una arrel d'un quadrat perfecte (no gasta cap xifra)
      pool = pool.map(function (x) {
        if ([4, 9, 16].indexOf(x.v) >= 0 && rng() < S.root) return { v: Math.sqrt(x.v), s: '√' + x.s, p: 4, leaf: false };
        return x;
      });

      var ok = true, usedMul = false, usedPow = false, usedRoot = pool.some(function (x) { return x.s.charAt(0) === '√'; });
      while (pool.length > 1) {
        shuffle(rng, pool);
        var a = pool.pop(), b = pool.pop(), op, t;
        var r = rng(), w = S.w;
        if (b.leaf && (b.v === 2 || b.v === 3) && Math.abs(a.v) <= 25 && rng() < S.pow) op = '^';
        else if (a.leaf && (a.v === 2 || a.v === 3) && Math.abs(b.v) <= 25 && rng() < S.pow) { t = a; a = b; b = t; op = '^'; }
        else op = r < w[0] ? '+' : r < w[0] + w[1] ? '-' : r < w[0] + w[1] + w[2] ? '*' : '/';

        if (op === '/' && !(b.v > 1 && a.v % b.v === 0)) {
          if (a.v > 1 && b.v % a.v === 0) { t = a; a = b; b = t; } else op = '*';
        }
        if (op === '-') {
          if (a.v < b.v) { t = a; a = b; b = t; }
          if (a.v === b.v) op = '+';
        }
        var v;
        switch (op) {
          case '+': v = a.v + b.v; break;
          case '-': v = a.v - b.v; break;
          case '*': v = a.v * b.v; break;
          case '/': v = a.v / b.v; break;
          case '^': v = Math.pow(a.v, b.v); break;
        }
        if (v > 5000 || (op === '*' && (a.v === 1 || b.v === 1)) || (op === '^' && a.v <= 1)) { ok = false; break; }
        if (op === '*') usedMul = true;
        if (op === '^') usedPow = true;

        var P = PREC[op], s;
        if (op === '^') {
          s = (a.p < 4 ? '(' + a.s + ')' : a.s) + '^' + b.s;
        } else {
          var A = a.p < P ? '(' + a.s + ')' : a.s;
          var B = (b.p < P || (b.p === P && (op === '-' || op === '/'))) ? '(' + b.s + ')' : b.s;
          s = A + ' ' + op + ' ' + B;
        }
        pool.push({ v: v, s: s, p: P, leaf: false });
      }
      if (!ok) continue;

      var target = pool[0].v;
      if (!Number.isInteger(target) || target < lo || target > hi) continue;
      if (nums.indexOf(target) >= 0) continue;
      if (S.needMul && !usedMul && !usedPow) continue;
      // Als nivells alts, sovint cal una operació «potent» (potència o arrel)
      if (S.strong && !(usedPow || usedRoot) && rng() < S.strong) continue;

      if (found[target]) continue;
      found[target] = true;
      list.push({ count: count, nums: nums, target: target, solution: pool[0].s });
    }
    return list;
  }

  /* Tria un repte per nivell de manera que els objectius pugin i sumin el total del dia */
  function pickDay(cands, total, rng) {
    // Ordre aleatori (determinista) perquè cada dia surti una combinació diferent
    cands = cands.map(function (l) { return shuffle(rng, l.slice()); });
    // Taula de sumes dels nivells 4 i 5 (amb d < e)
    var pairs = {};
    cands[3].forEach(function (d) {
      cands[4].forEach(function (e) {
        if (d.target >= e.target) return;
        var s = d.target + e.target;
        (pairs[s] || (pairs[s] = [])).push([d, e]);
      });
    });
    for (var i = 0; i < cands[0].length; i++) {
      var a = cands[0][i];
      for (var j = 0; j < cands[1].length; j++) {
        var b = cands[1][j];
        if (b.target <= a.target) continue;
        for (var m = 0; m < cands[2].length; m++) {
          var c = cands[2][m];
          if (c.target <= b.target) continue;
          var list = pairs[total - a.target - b.target - c.target];
          if (!list) continue;
          for (var q = 0; q < list.length; q++) {
            if (list[q][0].target > c.target) return [a, b, c, list[q][0], list[q][1]];
          }
        }
      }
    }
    return null;
  }

  /* ---------- Nivell 5 «de debò» (des de COMBINA_CONFIG.hardFrom) ----------
   * Abans, el N5 tenia 8 xifres i un centenar de combinacions que arribaven a l'objectiu
   * (més que cap altre nivell!). Ara: 6 xifres de l'1 al 20, objectiu 151–300, la solució
   * prevista fa servir + − × ÷ i totes les xifres (★ sempre possible), i només 6–12
   * combinacions de xifres diferents hi arriben exactes (N4 en té ~44, N3 ~20). */
  var HARD = { count: 6, maxNum: 20, lo: 151, hi: 300, minWays: 6, maxWays: 12, attempts: 6000 };

  function useHard(k) {
    var from = cfg().hardFrom;
    return !!from && (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k >= from);
  }

  /* Quantes combinacions de xifres (subconjunts) arriben exactes a l'objectiu amb + − × ÷ xʸ √.
   * Només valors enters positius ≤ 5000 (els decimals intermedis són rars). Para quan en passa de `stop`. */
  var WAYS_CAP = 5000;
  function countWays(nums, target, stop) {
    var n = nums.length, N = 1 << n, reach = new Array(N), seen = new Int32Array(WAYS_CAP + 1);
    var stamp = 0, ways = 0, masks = [], m, i, j, out;
    function bits(x) { var c = 0; while (x) { c += x & 1; x >>= 1; } return c; }
    function add(v) { if (v > 0 && v <= WAYS_CAP && seen[v] !== stamp) { seen[v] = stamp; out.push(v); } }
    for (m = 1; m < N; m++) masks.push(m);
    masks.sort(function (a, b) { return bits(a) - bits(b) || a - b; });
    for (var q = 0; q < masks.length; q++) {
      m = masks[q]; stamp++; out = [];
      if ((m & (m - 1)) === 0) add(nums[31 - Math.clz32(m)]);
      else {
        var low = m & -m;
        for (var a = (m - 1) & m; a > 0; a = (a - 1) & m) {
          if (!(a & low)) continue;               // cada partició un sol cop
          var A = reach[a], B = reach[m ^ a];
          for (i = 0; i < A.length; i++) for (j = 0; j < B.length; j++) {
            var x = A[i], y = B[j];
            add(x + y); add(x > y ? x - y : y - x); add(x * y);
            if (x % y === 0) add(x / y);
            if (y % x === 0) add(y / x);
            if (y <= 4 && x > 1) add(Math.pow(x, y));
            if (x <= 4 && y > 1) add(Math.pow(y, x));
          }
        }
      }
      for (i = 0, j = out.length; i < j; i++) {
        var r = Math.round(Math.sqrt(out[i]));
        if (r > 1 && r * r === out[i]) add(r);
      }
      reach[m] = out;
      if (seen[target] === stamp && ++ways > stop) return ways;
    }
    return ways;
  }

  /* Construeix una expressió amb totes les xifres que fa servir + − × ÷ (i una operació més) */
  function buildHard(rng) {
    var nums = shuffle(rng, Array.from({ length: HARD.maxNum }, function (_, i) { return i + 1; })).slice(0, HARD.count);
    var pool = nums.map(function (v) { return { v: v, s: String(v), p: 4 }; });
    var ops = ['+', '-', '*', '/'];
    for (var e = 4; e < HARD.count - 1; e++) ops.push('+-*'.charAt(Math.floor(rng() * 3)));
    shuffle(rng, ops);
    for (var o = 0; o < ops.length; o++) {
      var op = ops[o], pairs = [], done = false;
      for (var i = 0; i < pool.length; i++) for (var j = 0; j < pool.length; j++) if (i !== j) pairs.push([i, j]);
      shuffle(rng, pairs);
      for (var q = 0; q < pairs.length && !done; q++) {
        var a = pool[pairs[q][0]], b = pool[pairs[q][1]], v;
        if (op === '+') v = a.v + b.v;
        else if (op === '-') { if (a.v <= b.v) continue; v = a.v - b.v; }
        else if (op === '*') { if (a.v < 2 || b.v < 2) continue; v = a.v * b.v; }
        else { if (b.v < 2 || a.v % b.v) continue; v = a.v / b.v; }
        if (v > 5000) continue;
        var P = PREC[op];
        var A = a.p < P ? '(' + a.s + ')' : a.s;
        var B = (b.p < P || (b.p === P && (op === '-' || op === '/'))) ? '(' + b.s + ')' : b.s;
        pool = pool.filter(function (x) { return x !== a && x !== b; });
        pool.push({ v: v, s: A + ' ' + op + ' ' + B, p: P });
        done = true;
      }
      if (!done) return null;
    }
    return { count: HARD.count, nums: nums, target: pool[0].v, solution: pool[0].s };
  }

  function genHard(k) {
    var rng = rngFor('combina|' + k + '|4|hard'), backup = null, backupWays = Infinity;
    for (var t = 0; t < HARD.attempts; t++) {
      var c = buildHard(rng);
      if (!c || c.target < HARD.lo || c.target > HARD.hi || c.nums.indexOf(c.target) >= 0) continue;
      var w = countWays(c.nums, c.target, Math.max(HARD.maxWays, backupWays - 1));
      if (w >= HARD.minWays && w <= HARD.maxWays) { c.ways = w; return c; }
      if (w < backupWays) { backup = c; backup.ways = w; backupWays = w; }   // reserva: la que en tingui menys
    }
    return backup;
  }

  // opts.legacy5: el N5 d'abans (per a qui ja l'havia començat el dia del canvi)
  var cache = {};
  function generateDay(k, opts) {
    var legacy = !!(opts && opts.legacy5), ck = k + (legacy ? '|v1' : '');
    if (cache[ck]) return cache[ck];
    var c = cfg(), total = c.dailyTotal || 500;
    var n = /^\d{4}-\d{2}-\d{2}$/.test(k) ? challengeNumber(k) : 0;
    var levels = c.levelCounts.map(function (count, i) {
      var cand = (i === 4 && !legacy && useHard(k) && genHard(k)) || genCandidates(rngFor('combina|' + k + '|' + i), count, i, n, 1, k)[0];
      if (cand) return cand;
      // Reserva (pràcticament impossible): la suma de totes les xifres
      var nums = shuffle(rngFor('combina|' + k + '|' + i + '|r'), Array.from({ length: 20 }, function (_, j) { return j + 1; })).slice(0, count);
      return { count: count, nums: nums, target: nums.reduce(function (a, b) { return a + b; }, 0), solution: nums.join(' + ') };
    });
    cache[ck] = { key: k, number: n, total: total, levels: levels };
    return cache[ck];
  }

  global.Puzzle = {
    dayKey: dayKey, addDays: addDays, challengeNumber: challengeNumber,
    msToReset: msToReset, prettyDay: prettyDay, shortDay: shortDay,
    generateDay: generateDay, countWays: countWays
  };
})(typeof window !== 'undefined' ? window : globalThis);
