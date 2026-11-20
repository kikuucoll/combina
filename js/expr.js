/* Motor d'expressions: entrada per fitxes, anàlisi, avaluació,
 * correcció pas a pas (jerarquia d'operacions) i puntuació. */
(function (global) {
  'use strict';

  var OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  var RANK = { '^': 3, '*': 2, '/': 2, '+': 1, '-': 1 };
  var LIMIT = 1e9;

  /* ---------- Format de nombres (coma decimal) ---------- */
  function fmt(v) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    var r = Math.round(v);
    var s;
    if (Math.abs(v - r) < 1e-9) s = String(r);
    else s = v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
    return s.replace('-', '−');
  }

  /* ---------- Estat de l'entrada ---------- */
  function last(tokens) { return tokens[tokens.length - 1]; }

  function openCount(tokens) {
    var c = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i].t === '(') c++;
      else if (tokens[i].t === ')') c--;
    }
    return c;
  }

  function expectsOperand(tokens) {
    var l = last(tokens);
    return !l || l.t === 'op' || l.t === '(' || l.t === '^' || l.t === 'sqrt';
  }

  /* Quines tecles es poden prémer ara mateix */
  function allowed(tokens) {
    var l = last(tokens);
    var exp = expectsOperand(tokens);
    var afterPow = !!(l && l.t === '^');
    return {
      num: exp,
      open: exp && !afterPow,
      sqrt: exp && !afterPow,
      op: !exp,
      pow: !exp,
      close: !exp && openCount(tokens) > 0,
      back: tokens.length > 0
    };
  }

  function usedTiles(tokens) {
    var u = {};
    tokens.forEach(function (t) { if (t.t === 'num') u[t.i] = true; });
    return u;
  }

  /* ---------- Representació visual de l'entrada ---------- */
  function toHTML(tokens) {
    var h = '';
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.t === 'num') h += '<span class="tk-n">' + t.v + '</span>';
      else if (t.t === 'op') h += '<span class="tk-o">' + OPS[t.v] + '</span>';
      else if (t.t === '(' || t.t === ')') h += '<span class="tk-p">' + t.t + '</span>';
      else if (t.t === 'sqrt') h += '<span class="tk-r">√</span>';
      else if (t.t === '^') {
        var nx = tokens[i + 1];
        if (nx && nx.t === 'num') { h += '<sup>' + nx.v + '</sup>'; i++; }
        else h += '<sup class="tk-hole">□</sup>';
      }
    }
    return h;
  }

  /* ---------- Anàlisi sintàctica ---------- */
  function parse(tokens) {
    var i = 0;
    function peek() { return tokens[i]; }
    function isOp(t, a, b) { return t && t.t === 'op' && (t.v === a || t.v === b); }

    function expr() {
      var n = term();
      while (isOp(peek(), '+', '-')) {
        var op = tokens[i++].v;
        n = { k: 'bin', op: op, a: n, b: term() };
      }
      return n;
    }
    function term() {
      var n = power();
      while (isOp(peek(), '*', '/')) {
        var op = tokens[i++].v;
        n = { k: 'bin', op: op, a: n, b: power() };
      }
      return n;
    }
    function power() {
      var base = unary();
      if (peek() && peek().t === '^') {
        i++;
        return { k: 'bin', op: '^', a: base, b: power() };
      }
      return base;
    }
    function unary() {
      var t = peek();
      if (t && t.t === 'sqrt') { i++; return { k: 'sqrt', a: unary() }; }
      return primary();
    }
    function primary() {
      var t = peek();
      if (!t) throw new SyntaxError('Expressió incompleta');
      if (t.t === 'num') { i++; return { k: 'num', v: t.v }; }
      if (t.t === '(') {
        i++;
        var n = expr();
        if (!peek() || peek().t !== ')') throw new SyntaxError('Falta tancar un parèntesi');
        i++;
        n.grp = true;
        return n;
      }
      throw new SyntaxError('Expressió mal formada');
    }

    var ast = expr();
    if (i !== tokens.length) throw new SyntaxError('Expressió mal formada');
    return ast;
  }

  /* ---------- Avaluació ---------- */
  function apply(op, a, b) {
    var r;
    switch (op) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*': r = a * b; break;
      case '/':
        if (Math.abs(b) < 1e-12) throw new RangeError('No es pot dividir per zero');
        r = a / b; break;
      case '^':
        if (Math.abs(b) > 30 && Math.abs(a) > 1) throw new RangeError('Potència massa gran');
        r = Math.pow(a, b); break;
    }
    if (!isFinite(r) || Math.abs(r) > LIMIT) throw new RangeError('Resultat massa gran');
    return r;
  }

  function sqrt(a) {
    if (a < 0) throw new RangeError('No hi ha arrel quadrada d’un negatiu');
    return Math.sqrt(a);
  }

  function evaluate(n) {
    if (n.k === 'num') return n.v;
    if (n.k === 'sqrt') return sqrt(evaluate(n.a));
    return apply(n.op, evaluate(n.a), evaluate(n.b));
  }

  /* Completa una entrada a mitges: treu el que penja i tanca parèntesis */
  function completed(tokens) {
    var t = tokens.slice();
    while (t.length && ['op', '(', '^', 'sqrt'].indexOf(t[t.length - 1].t) >= 0) t.pop();
    var c = openCount(t);
    while (c-- > 0) t.push({ t: ')' });
    return t;
  }

  /* Valor d'una entrada (completa o no) */
  function value(tokens) {
    var t = completed(tokens);
    if (!t.length) return { ok: false, empty: true, tokens: t };
    try {
      var ast = parse(t);
      var v = evaluate(ast);
      return { ok: true, v: v, ast: ast, tokens: t };
    } catch (e) {
      return { ok: false, err: e.message, tokens: t };
    }
  }

  /* ---------- Puntuació ---------- */
  function distance(target, v) {
    return Math.round(Math.abs(target - v) * 1e6) / 1e6;
  }
  /* Precisió: cada unitat de distància resta un 10 % dels punts del nivell.
   * Exacte = 100 % de l'objectiu · a 1 = 90 % · a 5 = 50 % · a 10 o més = 0. */
  function penalty() {
    var c = (typeof window !== 'undefined' ? window : globalThis).COMBINA_CONFIG;
    return (c && c.penaltyPerUnit) || 0.1;
  }
  function percent(target, v) {
    var d = distance(target, v);
    return Math.max(0, Math.round((1 - penalty() * d) * 1000) / 10);
  }
  /* Punts màxims d'una ronda segons les xifres usades: de levelBase (70) a levelMax (100, totes) */
  function roundMax(used, count) {
    var c = (typeof window !== 'undefined' ? window : globalThis).COMBINA_CONFIG || {};
    var top = c.levelMax || 100, base = c.levelBase == null ? 70 : c.levelBase;
    if (!count) return top;
    var u = used == null ? count : Math.max(0, Math.min(count, used));
    return base + (top - base) * u / count;
  }
  /* Punts = precisió × màxim per xifres usades. Exacte amb totes les xifres = 100. */
  function points(target, v, used, count) {
    return Math.max(0, Math.floor(roundMax(used, count) * percent(target, v) / 100 + 1e-9));
  }
  function tilesUsed(tokens) {
    return tokens.filter(function (t) { return t.t === 'num'; }).length;
  }

  /* ---------- Correcció pas a pas ---------- */
  function clone(n) { return JSON.parse(JSON.stringify(n)); }

  function print(n) {
    if (n.k === 'num') {
      var s = fmt(n.v);
      if (n.grp && n.v < 0) s = '(' + s + ')';
      return n.fresh ? '<span class="ink">' + s + '</span>' : s;
    }
    var out;
    if (n.k === 'sqrt') out = '√' + print(n.a);
    else if (n.op === '^') out = print(n.a) + '<sup>' + print(n.b) + '</sup>';
    else out = print(n.a) + ' ' + OPS[n.op] + ' ' + print(n.b);
    return n.grp ? '(' + out + ')' : out;
  }

  function clearFresh(n) {
    delete n.fresh;
    if (n.a) clearFresh(n.a);
    if (n.b) clearFresh(n.b);
  }

  var LABELS = { 3: 'Potències i arrels', 2: 'Multiplicacions i divisions', 1: 'Sumes i restes, d’esquerra a dreta' };

  function steps(ast) {
    var cur = clone(ast);
    var out = [{ html: print(cur), label: 'La teva expressió' }];
    var guard = 0;

    while (cur.k !== 'num' && guard++ < 60) {
      clearFresh(cur);
      var cands = [];
      (function walk(n, depth, parent, key) {
        if (n.k === 'num') return;
        var d = depth + (n.grp ? 1 : 0);
        if (n.k === 'sqrt') {
          if (n.a.k === 'num') cands.push({ n: n, parent: parent, key: key, depth: d, rank: 3 });
          else walk(n.a, d, n, 'a');
          return;
        }
        var ra = n.a.k === 'num', rb = n.b.k === 'num';
        if (ra && rb) cands.push({ n: n, parent: parent, key: key, depth: d, rank: RANK[n.op] });
        if (!ra) walk(n.a, d, n, 'a');
        if (!rb) walk(n.b, d, n, 'b');
      })(cur, 0, null, null);

      if (!cands.length) break;
      var maxD = Math.max.apply(null, cands.map(function (c) { return c.depth; }));
      var pool = cands.filter(function (c) { return c.depth === maxD; });
      var maxR = Math.max.apply(null, pool.map(function (c) { return c.rank; }));
      var chosen = pool.filter(function (c) { return c.rank === maxR; });

      chosen.forEach(function (c) {
        var leaf = { k: 'num', v: evaluate(c.n), grp: !!c.n.grp, fresh: true };
        if (c.parent) c.parent[c.key] = leaf; else cur = leaf;
      });

      var label = LABELS[maxR];
      if (maxD > 0) label = 'Parèntesis · ' + label.charAt(0).toLowerCase() + label.slice(1);
      out.push({ html: '= ' + print(cur), label: label });
    }
    return out;
  }

  /* Solució generada (cadena amb * / - ^) a HTML */
  function solutionHTML(s) {
    return s
      .replace(/\^(\d+)/g, '<sup>$1</sup>')
      .replace(/ \* /g, ' × ')
      .replace(/ \/ /g, ' ÷ ')
      .replace(/ - /g, ' − ');
  }

  global.Expr = {
    OPS: OPS, fmt: fmt, allowed: allowed, usedTiles: usedTiles, toHTML: toHTML,
    parse: parse, evaluate: evaluate, completed: completed, value: value,
    distance: distance, points: points, percent: percent, roundMax: roundMax, tilesUsed: tilesUsed, steps: steps, solutionHTML: solutionHTML,
    openCount: openCount
  };
})(typeof window !== 'undefined' ? window : globalThis);
