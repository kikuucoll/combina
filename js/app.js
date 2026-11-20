/* combina ≈ — el repte diari d'operacions combinades */
(function () {
  'use strict';

  const C = window.COMBINA_CONFIG, E = window.Expr, P = window.Puzzle, SV = window.Savis, B = window.Backend;
  const KEY = 'combina:v1';
  const view = document.getElementById('view');
  const navEl = document.getElementById('nav');
  const modalEl = document.getElementById('modal');
  const toastEl = document.getElementById('toast');
  const bannerEl = document.getElementById('banner');

  /* ================= Emmagatzematge local ================= */
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* sense emmagatzematge */ }
    s = s && s.days ? s : { guest: false, days: {} };
    // Camps de recompenses (compatibles amb dades antigues)
    s.seenHelp = !!s.seenHelp;
    s.freezes = s.freezes || 0;           // comodins disponibles (màx. 2)
    s.frozen = s.frozen || {};            // dies salvats amb comodí
    s.ach = s.ach || {};                  // segells: id → dia
    s.milestones = s.milestones || {};    // fites de ratxa: dies → dia
    s.bestStreak = s.bestStreak || 0;
    return s;
  }
  const store = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignora */ } }

  /* ================= Estat ================= */
  const TUT = { count: 3, nums: [2, 3, 4], target: 10, solution: '3 * 4 - 2' };
  const state = {
    screen: null, dayKey: P.dayKey(), puzzle: null, level: 0,
    user: null, rankTab: 'day', ticker: null,
    digitBuf: '', digitTimer: null,
    tut: { tokens: [], startAt: 1, done: false }, tutResult: null,
    celebrations: []
  };
  state.puzzle = P.generateDay(state.dayKey);

  function day(k) {
    k = k || state.dayKey;
    return store.days[k] || (store.days[k] = { levels: [], finished: false, total: 0, submitted: false });
  }
  function totalOf(d) { return (d.levels || []).reduce((s, l) => s + (l && l.done ? l.points : 0), 0); }
  function exactOf(d) { return (d.levels || []).filter(l => l && l.done && l.exact).length; }
  function maxTotal() { return C.dailyTotal || 500; }
  const LEVEL_MAX = C.levelMax || 100;
  function doneCount(d) { return (d.levels || []).filter(l => l && l.done).length; }
  function secsFor(i) { return C.levelSeconds[i]; }
  function remaining(st, i) { return secsFor(i) - (Date.now() - st.startAt) / 1000; }
  function isDone(k) { const d = store.days[k]; return !!(d && d.finished); }

  /* ================= Ratxa, fites i comodins ================= */
  const MILESTONES = [3, 7, 14, 30, 100];

  function streak() {
    let k = isDone(state.dayKey) ? state.dayKey : P.addDays(state.dayKey, -1), n = 0, guard = 0;
    while (guard++ < 3000) {
      if (isDone(k)) n++;
      else if (!store.frozen[k]) break;
      k = P.addDays(k, -1);
    }
    return n;
  }
  function nextMilestone(s) { return MILESTONES.find(m => m > s) || null; }

  // Si ahir (o abans-d'ahir) no vas jugar, un comodí salva la ratxa automàticament
  function applyFreezes() {
    let k = P.addDays(state.dayKey, -1);
    const gap = [];
    while (!isDone(k) && !store.frozen[k] && gap.length < 3) { gap.push(k); k = P.addDays(k, -1); }
    if (!gap.length || gap.length > store.freezes) return;
    if (!isDone(k) && !store.frozen[k]) return;           // no hi havia ratxa per salvar
    gap.forEach(g => { store.frozen[g] = true; });
    store.freezes -= gap.length;
    save();
    banner('◈', 'Comodí utilitzat', gap.length === 1 ? 'Ahir no vas jugar, però la teva ratxa continua.' : 'La teva ratxa continua gràcies als comodins.');
  }

  /* ================= Segells (assoliments) ================= */
  const ACH = [
    { id: 'first', g: '1', name: 'Primer pas', desc: 'Completa el teu primer repte.' },
    { id: 'exact', g: '=', name: 'Exacte!', desc: 'Encerta un objectiu exactament.' },
    { id: 'pow', g: 'xʸ', name: 'Potència', desc: 'Encerta un objectiu fent servir una potència.' },
    { id: 'root', g: '√', name: 'Arrel', desc: 'Encerta un objectiu fent servir una arrel.' },
    { id: 'fast', g: 'Δt', name: 'Llampec', desc: 'Encerta un objectiu en menys de 10 segons.' },
    { id: 'edge', g: 'ε', name: 'Al límit', desc: 'Encerta un objectiu quan queden menys de 5 segons.' },
    { id: 'eight', g: '8', name: 'Vuit xifres', desc: 'Encerta exactament el nivell 5.' },
    { id: 'qed', g: '∎', name: 'Q.E.D.', desc: 'Fes un dia perfecte: 500 punts.' },
    { id: 's3', g: '△', name: 'Triangle', desc: 'Ratxa de 3 dies seguits.' },
    { id: 's7', g: '7', name: 'Setmana rodona', desc: 'Ratxa de 7 dies seguits.' },
    { id: 's14', g: '14', name: 'Quinzena', desc: 'Ratxa de 14 dies seguits.' },
    { id: 's30', g: '30', name: 'Mes de càlcul', desc: 'Ratxa de 30 dies seguits.' },
    { id: 's100', g: '100', name: 'Centenari', desc: 'Ratxa de 100 dies seguits.' },
    { id: 'gauss', g: 'Σ', name: 'Príncep', desc: 'Aconsegueix el rang Gauss.' },
    { id: 'gauss5', g: 'Σ⁵', name: 'Cort de Gauss', desc: 'Aconsegueix el rang Gauss cinc dies.' },
    { id: 'all', g: '5', name: 'Col·leccionista', desc: 'Aconsegueix la medalla dels cinc savis.' }
  ];
  const achById = id => ACH.find(a => a.id === id);

  function unlock(id) {
    if (store.ach[id]) return false;
    store.ach[id] = state.dayKey;
    const a = achById(id);
    state.celebrations.push({ g: a.g, title: 'Segell nou: ' + a.name, sub: a.desc });
    if (!state.quiet) banner(a.g, 'Segell desbloquejat', a.name + ' · ' + a.desc);
    return true;
  }

  function rankCounts() {
    const c = {};
    SV.list.forEach(s => { c[s.key] = 0; });
    Object.keys(store.days).forEach(k => { if (store.days[k].finished) c[SV.rankFor(store.days[k].total).key]++; });
    return c;
  }

  function onLevelDone(i, st, L) {
    if (!st.exact) return;
    unlock('exact');
    if (st.tokens.some(t => t.t === '^')) unlock('pow');
    if (st.tokens.some(t => t.t === 'sqrt')) unlock('root');
    const used = (st.endAt - st.startAt) / 1000;
    if (used < 10) unlock('fast');
    if (secsFor(i) - used < 5) unlock('edge');
    if (i === 4) unlock('eight');
  }

  function onDayFinished() {
    const d = day(), total = totalOf(d);
    const s = streak();
    store.bestStreak = Math.max(store.bestStreak, s);
    // Els avisos del final del dia es mostren com a targetes al resultat
    state.quiet = true;
    unlock('first');
    if (total === maxTotal()) unlock('qed');
    MILESTONES.forEach(m => {
      if (s >= m && !store.milestones[m]) {
        store.milestones[m] = state.dayKey;
        state.celebrations.unshift({ g: String(m), title: 'Fita assolida: ' + m + ' dies seguits', sub: 'La constància també és matemàtica.' });
        unlock('s' + m);
      }
    });
    if (s > 0 && s % 7 === 0 && store.lastFreezeDay !== state.dayKey && store.freezes < 2) {
      store.freezes++;
      store.lastFreezeDay = state.dayKey;
      state.celebrations.push({ g: '◈', title: 'Has guanyat un comodí', sub: 'Si algun dia no pots jugar, salvarà la teva ratxa.' });
    }
    const rc = rankCounts();
    if (rc.gauss >= 1) unlock('gauss');
    if (rc.gauss >= 5) unlock('gauss5');
    if (SV.list.every(sv => rc[sv.key] > 0)) unlock('all');
    state.quiet = false;
    save();
  }

  /* ================= Utilitats ================= */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = name => String(name || '?').trim().split(/\s+/).map(w => w.charAt(0)).slice(0, 2).join('').toUpperCase();

  function fmtCountdown() {
    const s = Math.floor(P.msToReset() / 1000);
    const p = n => String(n).padStart(2, '0');
    return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // Avisos destacats (segells, fites, comodins), un darrere l'altre
  const bannerQueue = [];
  function banner(g, title, sub) {
    bannerQueue.push({ g, title, sub });
    if (bannerQueue.length === 1) showBanner();
  }
  function showBanner() {
    const b = bannerQueue[0];
    if (!b) return;
    bannerEl.innerHTML = `<span class="seal on"><b>${esc(b.g)}</b></span><span><strong>${esc(b.title)}</strong><small>${esc(b.sub)}</small></span>`;
    bannerEl.classList.add('show');
    setTimeout(() => {
      bannerEl.classList.remove('show');
      setTimeout(() => { bannerQueue.shift(); showBanner(); }, 350);
    }, 3200);
  }

  const ICON = {
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    flame: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2.5-5 .5 1.5 1.5 2 2.5 2 0-2.5-.5-4.5 0-7z"/></svg>',
    soundOn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    soundOff: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/></svg>',
    shield: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/></svg>',
    share: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>',
    today: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12h8M12 8v8"/></svg>',
    rank: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 20V12M12 20V5M19 20v-5"/></svg>',
    trophy: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/></svg>',
    sages: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 6l5.2 9H6.8z"/></svg>',
    help: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/></svg>',
    google: '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.730-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>'
  };

  const wordmark = '<span class="wordmark"><em>combina</em><b>≈</b></span>';

  /* ================= Fons: operacions que cauen ================= */
  (function rain() {
    const box = document.getElementById('rain');
    const items = ['(7 + 5) × 3', '√144 = 12', '2⁸ = 256', '18 ÷ 3 − 4', 'a² + b² = c²', 'π ≈ 3,1416', '13 × 19 = 247',
      '(16 − 3)²', '5! = 120', '√2 ≈ 1,414', '(20 + 9)² = 841', '1 + 2 + … + 100', '11 × 11 = 121', '3³ = 27', '√81 = 9', '20 ÷ 4 + 1'];
    const n = window.innerWidth > 900 ? 16 : 9;
    let html = '';
    for (let i = 0; i < n; i++) {
      const left = (i / n) * 100 + Math.random() * (60 / n);
      const dur = 26 + Math.random() * 24, delay = -Math.random() * dur, size = 16 + Math.random() * 12;
      html += `<span style="left:${left.toFixed(1)}%;font-size:${size.toFixed(0)}px;animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s">${items[i % items.length]}</span>`;
    }
    box.innerHTML = html;
  })();

  /* ================= Navegació ================= */
  function go(screen) {
    if (screen !== 'joc') stopTicker();
    state.screen = screen;
    render();
    window.scrollTo(0, 0);
  }

  function renderNav() {
    const hidden = ['entrada', 'joc', 'correccio'].indexOf(state.screen) >= 0 || (state.screen === 'tutorial' && !store.seenHelp);
    document.body.classList.toggle('no-nav', hidden);
    const item = (id, label, icon) =>
      `<button type="button" class="nav-item${state.screen === id ? ' on' : ''}" data-go="${id}"${state.screen === id ? ' aria-current="page"' : ''}>${icon}<span>${label}</span></button>`;
    navEl.innerHTML = `<div class="nav-brand">${wordmark}</div>` +
      item('avui', 'Avui', ICON.today) + item('ranquing', 'Rànquing', ICON.rank) +
      item('vitrina', 'Vitrina', ICON.trophy) + item('savis', 'Savis', ICON.sages) +
      item('tutorial', 'Tutorial', ICON.help);
  }

  function render() {
    renderNav();
    const fn = SCREENS[state.screen] || SCREENS.avui;
    view.innerHTML = fn();
    view.setAttribute('data-screen', state.screen);
    if (state.screen === 'joc') afterJocRender();
    if (state.screen === 'tutorial') updateGame();
    if (state.screen === 'ranquing') loadRanking();
    if (state.screen === 'correccio') animateLevelPoints();
    if (state.screen === 'resultat') animateResult();
    tickCountdowns();
  }

  function header() {
    const u = state.user, s = streak();
    const who = u ? (u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc(initials(u.name))) : 'Tu';
    const fr = store.freezes ? `<span class="chip-sep"></span>${ICON.shield}${store.freezes}` : '';
    return `<header class="topbar">
      ${wordmark}
      <div class="topbar-right">
        <button type="button" class="chip chip-sound${store.sound === false ? ' off' : ''}" data-action="sound" aria-label="${store.sound === false ? 'Activa el so' : 'Silencia el so'}" title="${store.sound === false ? 'So desactivat' : 'So activat'}">${store.sound === false ? ICON.soundOff : ICON.soundOn}</button>
        <button type="button" class="chip" data-go="vitrina" title="Ratxa de dies seguits${store.freezes ? ' i comodins' : ''}">${ICON.flame}${s} ${s === 1 ? 'dia' : 'dies'}${fr}</button>
        <button type="button" class="avatar" data-action="profile" aria-label="Perfil i sessió">${who}</button>
      </div>
    </header>`;
  }

  /* ================= Peces del tauler de joc ================= */
  function boardHTML(L) {
    const tiles = L.nums.map((n, k) => `<button type="button" class="tile" data-tile="${k}">${n}</button>`).join('');
    const key = (k, label, aria, cls) => `<button type="button" class="key ${cls || ''}" data-key="${k}" aria-label="${aria}">${label}</button>`;
    return {
      expr: `<div class="expr-card" aria-live="polite">
          <p class="expr" id="expr"></p>
          <div class="expr-live"><span id="live-val">&nbsp;</span><span class="pill" id="live-pts"></span></div>
        </div>`,
      tiles: `<div class="tiles" style="--n:${L.count};--cols:${L.count <= 6 ? L.count : 4}">${tiles}</div>`,
      keypad: `<div class="keypad">
          ${key('+', '+', 'més')}${key('-', '−', 'menys')}${key('*', '×', 'per')}${key('/', '÷', 'dividit per')}
          ${key('(', '(', 'obre parèntesi')}${key(')', ')', 'tanca parèntesi')}${key('^', '<i>x</i><sup>y</sup>', 'potència: la xifra següent serà l’exponent')}${key('sqrt', '√', 'arrel quadrada')}
          ${key('back', '⌫', 'esborra', 'soft')}${key('clear', 'Neteja', 'neteja l’expressió', 'soft small')}
          <button type="button" class="key submit" data-key="submit" id="submit">Valida <b>=</b></button>
          <p class="kbd-hint">Teclat: xifres · + − * / · ( ) · ^ o P potència · R arrel · ⌫ · Retorn valida</p>
        </div>`
    };
  }

  /* Context actiu: el tutorial o el nivell en joc */
  function ctx() {
    if (state.screen === 'tutorial') return { st: state.tut, L: TUT, tut: true };
    return { st: day().levels[state.level], L: state.puzzle.levels[state.level], tut: false };
  }

  /* ================= Pantalla: entrada ================= */
  function screenEntrada() {
    const tiles = [3, 7, 12, 16, 2].map((n, i) => `<span class="mini-tile" style="animation-delay:${0.05 + i * 0.07}s">${n}</span>`).join('');
    return `<section class="screen entrada">
      <div class="brand-hero">${wordmark}<p class="kicker">El repte diari de càlcul</p></div>
      <div class="hero-demo" aria-hidden="true">
        <div class="mini-tiles">${tiles}</div>
        <div class="ops-line"><span></span>( ) × ÷ + − √ xʸ<span></span></div>
        <p class="kicker gold">Nivell 1 · objectiu</p>
        <p class="hero-target"><b>≈</b>247</p>
      </div>
      <h1 class="hero-title">Cinc nivells.<br><em>Un repte cada dia.</em></h1>
      <p class="lead">Combina les xifres combinant operacions per arribar a l'objectiu de cada nivell abans que s'acabi el temps.</p>
      <div class="cta-stack">
        ${B.enabled ? `<button type="button" class="btn btn-primary" data-action="signin">${ICON.google}Continua amb Google</button>` : ''}
        <button type="button" class="btn ${B.enabled ? 'btn-ghost' : 'btn-primary'}" data-action="guest">${B.enabled ? 'Juga com a convidat' : 'Comença a jugar'}</button>
        <div class="countdown-row"><span class="kicker">Nou repte en</span><span class="countdown big" data-countdown></span></div>
      </div>
    </section>`;
  }

  /* ================= Pantalla: tutorial jugable ================= */
  function screenTutorial() {
    const b = boardHTML(TUT);
    const r = state.tutResult;
    const done = r && r.exact;
    return `<section class="screen tutorial">
      <header class="game-head">
        <button type="button" class="icon-btn" data-action="tut-exit" aria-label="Surt del tutorial">${ICON.back}</button>
        <div class="game-progress"><p class="kicker">Tutorial · sense rellotge</p></div>
      </header>
      <div class="tut-intro">
        <h1 class="title sm">Arriba al <span class="gold">10</span></h1>
        <p class="lead">Combina les xifres 2, 3 i 4 amb operacions. Cada xifra, un sol cop.</p>
      </div>
      ${done ? tutorialDone() : `
      <div class="coach" id="coach" role="status"></div>
      <div class="game">
        <div class="game-main">
          <div class="target small-target"><p class="kicker">Objectiu</p><p class="target-num">10</p></div>
          ${b.expr}${b.tiles}
        </div>
        ${b.keypad}
      </div>`}
    </section>`;
  }

  function tutorialDone() {
    return `<div class="card tut-done">
      <p class="pop exact">+100</p>
      <p class="tut-done-title">Exacte! Ja saps jugar.</p>
      <ul class="tut-rules">
        <li><b>Cada dia a les 9:00</b>, un repte nou amb <b>5 nivells</b> (de 4 a 8 xifres de l'1 al 20).</li>
        <li>Tens de <b>30 a 50 segons</b> per nivell. Si s'acaba el temps, es corregeix el que hi hagi.</li>
        <li>Pots fer servir <b>+ − × ÷</b>, <b>parèntesis</b>, <b>potències</b> (l'exponent és una xifra) i <b>arrels</b>.</li>
        <li><b>Cada ronda val fins a 100 punts</b> (500 al dia). Si encertes l'objectiu fent servir <b>totes les xifres</b>, en fas 100; amb menys xifres, el màxim baixa fins a 70. <b>Cada unitat de distància resta un 10 %</b>: a 1, el 90 %; a 5, la meitat; a 10 o més, 0.</li>
        <li>Amb el total del dia, aconsegueixes la medalla d'un dels <b>cinc savis</b>. Juga cada dia per allargar la <b>ratxa</b> i guanyar <b>segells</b>.</li>
      </ul>
      <button type="button" class="btn btn-primary" data-action="tut-finish">Comença el repte d'avui</button>
      <button type="button" class="btn btn-ghost" data-action="tut-again">Torna a provar el tutorial</button>
    </div>`;
  }

  function coachText(st) {
    const t = st.tokens, last = t[t.length - 1];
    if (!t.length) return '<b>①</b> Toca una xifra per començar. Prova amb el <b>3</b>.';
    const r = E.value(t);
    if (r.ok && r.v === TUT.target && !E.allowed(t).close) return '<b>Ja hi ets!</b> Prem <b>Valida =</b> per comprovar-ho.';
    if (last.t === 'op') return '<b>③</b> Ara una altra xifra. Recorda: cada xifra només un cop.';
    if (last.t === 'num' && t.length === 1) return '<b>②</b> Tria una operació. Prova amb <b>×</b>.';
    if (r.ok) {
      const d = TUT.target - r.v;
      if (d > 0) return `Tens <b>${E.fmt(r.v)}</b>: et falten <b>${E.fmt(d)}</b>. Continua amb una altra operació o esborra amb <b>⌫</b>.`;
      return `Tens <b>${E.fmt(r.v)}</b>: t'has passat de <b>${E.fmt(-d)}</b>. Prova de restar o esborra amb <b>⌫</b>.`;
    }
    return 'Continua l’expressió…';
  }

  function tutSubmit() {
    const r = E.value(state.tut.tokens);
    if (!r.ok) return nudge();
    const pts = E.points(TUT.target, r.v, E.tilesUsed(state.tut.tokens), TUT.count);
    if (E.distance(TUT.target, r.v) === 0) {
      state.tutResult = { exact: true, points: pts };
      store.seenHelp = true; save();
      render();
    } else {
      const c = document.getElementById('coach');
      if (c) c.innerHTML = `Valdria <b>${pts} punts</b> (a ${E.fmt(E.distance(TUT.target, r.v))} de l'objectiu). Al joc de veritat també puntua, però prova d'arribar <b>exactament</b> al 10!`;
      nudge();
    }
  }

  /* ================= Pantalla: avui ================= */
  function screenAvui() {
    const pz = state.puzzle, d = day(), total = totalOf(d);
    const next = pz.levels.findIndex((_, i) => !(d.levels[i] && d.levels[i].done));
    const rows = pz.levels.map((L, i) => {
      const st = d.levels[i];
      const dots = Array.from({ length: L.count }, () => '<i></i>').join('');
      let right = `<span class="muted">${secsFor(i)} s</span>`;
      if (st && st.done) right = `<b class="${st.exact ? 'gold' : ''}">${st.points}</b>`;
      else if (st && st.startAt) right = '<span class="gold">en curs</span>';
      return `<li class="lvl-row${i === next ? ' next' : ''}"><span>Nivell ${i + 1}</span><span class="dots" aria-label="${L.count} xifres">${dots}</span><span class="lvl-right">${right}</span></li>`;
    }).join('');

    let cta;
    if (d.finished) cta = `<button type="button" class="btn btn-primary btn-split" data-go="resultat"><span>Veure el resultat</span><span class="btn-meta">${total} / ${maxTotal()} →</span></button>`;
    else {
      const started = doneCount(d) > 0 || (d.levels[next] && d.levels[next].startAt);
      cta = `<button type="button" class="btn btn-primary btn-split" data-action="play"><span>${started ? 'Continua · nivell ' + (next + 1) : 'Comença el repte'}</span><span class="btn-meta">${total} / ${maxTotal()} →</span></button>`;
    }

    const yk = P.addDays(state.dayKey, -1), yd = store.days[yk];
    let yesterday;
    if (yd && yd.finished) {
      const r = SV.rankFor(yd.total);
      yesterday = `<div class="y-medal">${SV.medal(r.key, 52)}</div>
        <div class="y-text"><p class="muted small">Ahir · ${yd.total} punts</p><p class="y-rank" style="color:${r.color}">Rang ${r.name}</p>${weekStrip()}</div>`;
    } else {
      yesterday = `<div class="y-medal">${SV.medal('pitagores', 52, { dim: true })}</div>
        <div class="y-text"><p class="muted small">${store.frozen[yk] ? 'Ahir et va salvar un comodí' : 'Ahir no vas completar el repte'}</p><p class="y-rank">${streak() ? 'La teva ratxa continua' : 'Avui comença una ratxa nova'}</p>${weekStrip()}</div>`;
    }

    return `<section class="screen avui">
      ${header()}
      <div class="avui-grid">
        <div>
          <p class="kicker">${esc(P.prettyDay(state.dayKey))} · Repte nº ${pz.number}</p>
          <h1 class="title">Cada segon compta.<br><em class="muted-em">Infinites combinacions.</em></h1>
          <ol class="card lvl-list" aria-label="Nivells d'avui">${rows}</ol>
          ${cta}
          <p class="countdown-line">Nou repte en <span class="countdown gold" data-countdown></span></p>
        </div>
        <div class="side-col">
          <section class="card yesterday" aria-label="Ahir i la teva setmana">${yesterday}</section>
          ${streakCard(true)}
        </div>
      </div>
    </section>`;
  }

  function weekStrip() {
    const yk = P.addDays(state.dayKey, -1);
    let html = '<div class="week" aria-label="Rangs dels darrers set dies">';
    for (let i = -6; i <= 0; i++) {
      const k = P.addDays(state.dayKey, i), d = store.days[k];
      const label = P.shortDay(k);
      if (d && d.finished) {
        const r = SV.rankFor(d.total);
        const hi = k === yk || k === state.dayKey;
        html += `<span class="wk" title="${label}: ${d.total} punts · ${r.name}"><i style="background:${r.color};${hi ? `box-shadow:0 0 10px rgba(${r.rgb},.9)` : 'opacity:.4'}"></i><small>${label}</small></span>`;
      } else if (store.frozen[k]) {
        html += `<span class="wk" title="${label}: salvat amb un comodí"><i class="frozen"></i><small>${label}</small></span>`;
      } else {
        html += `<span class="wk" title="${label}: sense jugar"><i class="${i === 0 ? 'today' : 'empty'}"></i><small>${label}</small></span>`;
      }
    }
    return html + '</div>';
  }

  /* Targeta de ratxa: fites i comodins */
  function streakCard(compact) {
    const s = streak(), nm = nextMilestone(s);
    const prev = MILESTONES.filter(m => m <= s).pop() || 0;
    const pct = nm ? Math.round(((s - prev) / (nm - prev)) * 100) : 100;
    const marks = MILESTONES.map(m => `<span class="ms${s >= m ? ' on' : ''}"><b>${m}</b></span>`).join('');
    const shields = [0, 1].map(i => `<span class="shield${i < store.freezes ? ' on' : ''}">${ICON.shield}</span>`).join('');
    return `<section class="card streak-card${compact ? ' compact' : ''}" aria-label="Ratxa">
      <div class="streak-top">
        <div><p class="kicker">Ratxa</p><p class="streak-num">${s}<span> ${s === 1 ? 'dia' : 'dies'}</span></p></div>
        <div class="shields" title="Comodins: salven la ratxa si un dia no jugues">${shields}<small>${store.freezes}/2 comodins</small></div>
      </div>
      <div class="ms-bar"><i style="width:${pct}%"></i></div>
      <div class="ms-row">${marks}</div>
      <p class="muted small">${nm ? `Pròxima fita: <b class="chalk">${nm} dies</b> (en falten ${nm - s}).` : 'Totes les fites assolides. Llegendari!'} Cada 7 dies seguits guanyes un comodí.</p>
    </section>`;
  }

  /* ================= Pantalla: joc ================= */
  function screenJoc() {
    const i = state.level, L = state.puzzle.levels[i], st = day().levels[i];
    const progress = state.puzzle.levels.map((_, k) => {
      const s = day().levels[k];
      const cls = k === i ? 'cur' : s && s.done ? (s.exact ? 'exact' : 'done') : '';
      return `<span class="${cls}"></span>`;
    }).join('');
    const head = `<header class="game-head">
      <button type="button" class="icon-btn" data-go="avui" aria-label="Surt (el temps continua corrent)">${ICON.close}</button>
      <div class="game-progress"><p class="kicker">Nivell ${i + 1} de 5 · ${secsFor(i)} s</p><div class="segs" aria-hidden="true">${progress}</div></div>
      <div class="timer" role="timer" aria-label="Temps restant">
        <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" class="ring-bg"/><circle cx="26" cy="26" r="22" class="ring" id="ring"/></svg>
        <span id="timer-num">${secsFor(i)}</span>
      </div>
    </header>`;

    if (!st || !st.startAt) {
      return `<section class="screen joc">
        ${head}
        <div class="intro">
          <p class="kicker">Nivell ${i + 1}</p>
          <p class="intro-big">${L.count} xifres<br><em>${secsFor(i)} segons</em></p>
          <div class="intro-tiles" aria-hidden="true">${Array.from({ length: L.count }, () => '<span>?</span>').join('')}</div>
          <p class="lead center">Quan premis el botó, apareixeran l'objectiu i les xifres i començarà el temps.</p>
          <button type="button" class="btn btn-primary" data-action="start">Comença el nivell ${i + 1}</button>
        </div>
      </section>`;
    }

    const b = boardHTML(L);
    return `<section class="screen joc">
      ${head}
      <div class="game">
        <div class="game-main">
          <div class="target"><p class="kicker">Objectiu</p><p class="target-num">${L.target}</p></div>
          ${b.expr}${b.tiles}
          <p class="hint">Cada xifra, un sol cop. Fer-les servir totes dona més punts; cada unitat de distància resta un 10 %.</p>
        </div>
        ${b.keypad}
      </div>
    </section>`;
  }

  function afterJocRender() {
    const st = day().levels[state.level];
    if (st && st.startAt && !st.done) { updateGame(); startTicker(); }
  }

  function updateGame() {
    const c = ctx(), L = c.L, st = c.st;
    if (!st) return;
    const ex = document.getElementById('expr');
    if (!ex) return;
    ex.innerHTML = (st.tokens.length ? E.toHTML(st.tokens) : '<span class="placeholder">Toca una xifra per començar</span>') + '<span class="caret"></span>';
    const a = E.allowed(st.tokens), used = E.usedTiles(st.tokens);
    view.querySelectorAll('.tile').forEach(b => {
      const k = +b.dataset.tile;
      b.classList.toggle('used', !!used[k]);
      b.disabled = !!used[k] || !a.num;
      b.setAttribute('aria-label', L.nums[k] + (used[k] ? ', ja utilitzada' : ''));
    });
    const map = { '+': a.op, '-': a.op, '*': a.op, '/': a.op, '(': a.open, ')': a.close, '^': a.pow, sqrt: a.sqrt, back: a.back, clear: a.back };
    view.querySelectorAll('.key[data-key]').forEach(b => { if (b.dataset.key in map) b.disabled = !map[b.dataset.key]; });

    const r = E.value(st.tokens);
    const lv = document.getElementById('live-val'), lp = document.getElementById('live-pts'), sb = document.getElementById('submit');
    if (r.ok) {
      const d = E.distance(L.target, r.v), pts = E.points(L.target, r.v, E.tilesUsed(st.tokens), L.count);
      lv.textContent = '= ' + E.fmt(r.v);
      lp.textContent = d === 0 ? 'Exacte! · ' + pts + ' punts' : 'a ' + E.fmt(d) + ' · ara ' + pts + ' punts';
      lp.className = 'pill' + (d === 0 ? ' exact' : '');
      sb.disabled = false;
    } else {
      lv.innerHTML = '&nbsp;';
      lp.textContent = r.empty ? '' : r.err;
      lp.className = 'pill' + (r.empty ? ' hidden' : ' err');
      sb.disabled = !!r.empty;
    }
    if (c.tut) {
      const co = document.getElementById('coach');
      if (co) co.innerHTML = coachText(st);
    }
  }

  const CIRC = 2 * Math.PI * 22;
  function startTicker() {
    stopTicker();
    const tick = () => {
      const i = state.level, st = day().levels[i];
      if (!st || st.done) return stopTicker();
      const rem = remaining(st, i);
      const ring = document.getElementById('ring'), num = document.getElementById('timer-num');
      if (ring) {
        ring.style.strokeDasharray = CIRC.toFixed(1);
        ring.style.strokeDashoffset = (CIRC * (1 - Math.max(0, rem) / secsFor(i))).toFixed(1);
        ring.parentNode.parentNode.classList.toggle('low', rem <= 10);
      }
      if (num) num.textContent = Math.max(0, Math.ceil(rem));
      if (rem <= 0) finishLevel(true);
    };
    tick();
    state.ticker = setInterval(tick, 200);
  }
  function stopTicker() { if (state.ticker) { clearInterval(state.ticker); state.ticker = null; } }

  /* Esdeveniment anònim a GoatCounter (si està carregat; sense dades personals) */
  function track(name, title) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: title || name, event: true }); } catch (e) {}
  }

  function startLevel() {
    const d = day(), i = state.level;
    if (d.levels[i] && d.levels[i].startAt) return;
    if (i === 0) track('repte-comencat', 'Repte començat');
    d.levels[i] = { tokens: [], startAt: Date.now(), done: false };
    save();
    render();
  }

  function finishLevel(timeout) {
    const i = state.level, L = state.puzzle.levels[i], d = day(), st = d.levels[i];
    if (!st || st.done) return;
    stopTicker();
    const r = E.value(st.tokens);
    st.done = true;
    st.timeout = !!timeout;
    st.endAt = Math.min(Date.now(), st.startAt + secsFor(i) * 1000);
    if (r.ok) {
      st.value = r.v; st.used = E.tilesUsed(st.tokens);
      st.points = E.points(L.target, r.v, st.used, L.count);
      st.exact = E.distance(L.target, r.v) === 0;
    }
    else { st.value = null; st.points = 0; st.err = r.empty ? 'No hi havia cap expressió' : r.err; }
    d.total = totalOf(d);
    state.celebrations = [];
    onLevelDone(i, st, L);
    if (doneCount(d) === state.puzzle.levels.length) { d.finished = true; onDayFinished(); submitDay(); track('repte-acabat', 'Repte acabat'); }
    save();
    go('correccio');
  }

  function press(k) {
    const c = ctx(), st = c.st;
    if (!st || st.done || !st.startAt) return;
    const a = E.allowed(st.tokens);
    let ok = true;
    switch (k) {
      case '+': case '-': case '*': case '/': ok = a.op; if (ok) st.tokens.push({ t: 'op', v: k }); break;
      case '(': ok = a.open; if (ok) st.tokens.push({ t: '(' }); break;
      case ')': ok = a.close; if (ok) st.tokens.push({ t: ')' }); break;
      case '^': ok = a.pow; if (ok) st.tokens.push({ t: '^' }); break;
      case 'sqrt': ok = a.sqrt; if (ok) st.tokens.push({ t: 'sqrt' }); break;
      case 'back': st.tokens.pop(); break;
      case 'clear': st.tokens = []; break;
      case 'submit':
        if (!st.tokens.length) return;
        if (c.tut) return tutSubmit();
        return finishLevel(false);
    }
    if (!ok) return nudge();
    if (!c.tut) save();
    updateGame();
  }

  function pressTile(k) {
    const c = ctx(), st = c.st;
    if (!st || st.done || !st.startAt) return;
    if (!E.allowed(st.tokens).num || E.usedTiles(st.tokens)[k]) return nudge();
    st.tokens.push({ t: 'num', v: c.L.nums[k], i: k });
    if (!c.tut) save();
    updateGame();
  }

  function nudge() {
    const ex = document.querySelector('.expr-card');
    if (!ex) return;
    ex.classList.remove('nudge'); void ex.offsetWidth; ex.classList.add('nudge');
  }

  /* ================= Pantalla: correcció ================= */
  function screenCorreccio() {
    const i = state.level, L = state.puzzle.levels[i], st = day().levels[i];
    if (!st || !st.done) return screenAvui();
    const last = i === state.puzzle.levels.length - 1;
    const r = E.value(st.tokens);
    let body = '', delayEnd = 0.6;

    if (r.ok) {
      const steps = E.steps(r.ast);
      body += '<ol class="card steps" aria-label="Correcció pas a pas">' + steps.map((s, k) =>
        `<li class="step" style="--d:${(0.2 + k * 0.9).toFixed(1)}s"><span class="step-expr${k === steps.length - 1 && k > 0 ? ' final' : ''}">${s.html}</span><span class="chip-label">${esc(s.label)}</span></li>`).join('') + '</ol>';
      delayEnd = 0.2 + steps.length * 0.9;
      const t = L.target, v = r.v, d = E.distance(t, v);
      const mid = (t + v) / 2, half = Math.max(30, (d / 2) * 1.7);
      const lo = mid - half, hi = mid + half, pos = x => Math.min(97, Math.max(3, ((x - lo) / (hi - lo)) * 100));
      body += `<section class="numline step" style="--d:${delayEnd.toFixed(1)}s" aria-label="Distància a l'objectiu">
        <div class="nl">
          <div class="nl-axis"></div>
          <div class="nl-gap" style="left:${Math.min(pos(t), pos(v))}%;width:${Math.abs(pos(t) - pos(v))}%"></div>
          ${d === 0 ? '' : `<div class="nl-mark you" style="left:${pos(v)}%"><span>${E.fmt(v)}</span></div>`}
          <div class="nl-mark goal" style="left:${pos(t)}%"><span>${t}</span></div>
          <span class="nl-end l">${E.fmt(Math.round(lo))}</span><span class="nl-end r">${E.fmt(Math.round(hi))}</span>
        </div>
        <p class="nl-eq">|${t} − ${E.fmt(v)}| = ${E.fmt(d)}</p>
      </section>`;
      delayEnd += 0.7;
    } else {
      body += `<div class="card empty-corr step" style="--d:.2s"><p class="step-expr">${st.tokens.length ? E.toHTML(st.tokens) : '—'}</p><p class="muted">${esc(st.err || 'Expressió no vàlida')}</p></div>`;
    }

    const used = E.tilesUsed(st.tokens), allUsed = used === L.count;
    const msg = st.points >= LEVEL_MAX ? 'Perfecte! Exacte i amb totes les xifres.'
      : st.exact ? (allUsed ? 'Exacte!' : 'Exacte! Amb totes les xifres hauries fet 100.')
      : st.points >= 80 ? 'Molt a prop.' : st.points > 0 ? 'Cada intent suma.' : 'Aquesta vegada no ha sortit.';
    const formula = !r.ok ? 'sense resultat vàlid · 0 punts'
      : `precisió ${E.fmt(E.percent(L.target, r.v))} %${E.distance(L.target, r.v) ? ' (a ' + E.fmt(E.distance(L.target, r.v)) + ')' : ''} × ${E.fmt(Math.round(E.roundMax(used, L.count) * 10) / 10)} punts (${used}/${L.count} xifres) = ${st.points} punts`;
    return `<section class="screen correccio">
      <header class="corr-head">
        <div><p class="kicker">Nivell ${i + 1} · Correcció${st.timeout ? ' · temps esgotat' : ''}</p><h1 class="title sm">Pas a pas</h1></div>
        <div class="right"><p class="kicker">Objectiu</p><p class="corr-target">${L.target}</p></div>
      </header>
      ${body}
      <section class="points step" style="--d:${delayEnd.toFixed(1)}s" aria-live="polite">
        <span class="pop" id="pts-pop" data-to="${st.points}" data-max="${LEVEL_MAX}" data-delay="${delayEnd.toFixed(2)}" aria-label="${st.points} punts de ${LEVEL_MAX}">+0</span>
        <span class="muted">punts<br>${msg}</span>
      </section>
      <p class="bands step" style="--d:${delayEnd.toFixed(1)}s">${formula}</p>
      <details class="solution step" style="--d:${(delayEnd + 0.3).toFixed(1)}s">
        <summary>Veure una solució exacta</summary>
        <p>${E.solutionHTML(L.solution)} = ${L.target}</p>
      </details>
      <div class="cta-row">
        <button type="button" class="btn btn-ghost" data-action="replay">Torna-ho a veure</button>
        ${last ? '<button type="button" class="btn btn-primary" data-go="resultat">Resultat del dia →</button>'
              : `<button type="button" class="btn btn-primary" data-action="next">Nivell ${i + 2} →</button>`}
      </div>
    </section>`;
  }

  /* ================= Paraules dels savis ================= */
  const SAGE_WORDS = {
    pitagores: { quote: 'Tot és nombre.', note: 'lema de l’escola pitagòrica',
      cheer: 'Cada gran teorema va començar amb un primer pas. Demà, una mica més a prop.' },
    hipatia: { quote: 'Defensa el teu dret a pensar: fins i tot pensar equivocadament és millor que no pensar.', note: 'atribuïda',
      cheer: 'Ja tens el ritme. Afina la precisió i el blau d’Arquimedes és teu.' },
    arquimedes: { quote: 'Doneu-me un punt de suport i mouré el món.', note: '',
      cheer: 'Ja has fet mig camí. Cada unitat que retallis et porta més amunt.' },
    noether: { quote: 'Els meus mètodes són maneres de treballar i de pensar; per això s’han escampat arreu.', note: '',
      cheer: 'Estàs a tocar de l’or. Un parell d’exactes més i Gauss t’espera.' },
    gauss: { quote: 'Les matemàtiques són la reina de les ciències.', note: '',
      cheer: 'Has arribat al cim. Demà toca defensar la corona.' }
  };

  function sageWordsHTML(r, total) {
    const w = SAGE_WORDS[r.key];
    const next = SV.list[r.n];   // rang següent (si n'hi ha)
    const gap = next ? `<span class="rr-gap">Et falten <b>${next.min - total}</b> punts per a <b style="color:${next.color}">${next.name}</b>.</span>` : '';
    return `<figure class="rr-words" style="border-left-color:${r.color}">
        <blockquote>«${w.quote}»</blockquote>
        <figcaption>— ${r.name}${w.note ? `, <span>${w.note}</span>` : ''}</figcaption>
        <p class="rr-cheer">${w.cheer} ${gap}</p>
      </figure>`;
  }

  /* ================= Animacions de puntuació ================= */
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  state.anim = 0;

  // Color segons el percentatge del nivell: blanc, verd, blau, plata… i or només amb els punts sencers
  function levelColor(p, T) {
    if (T > 0 && p >= T) return SV.list[4];
    const r = T > 0 ? p / T : 0;
    return SV.list[r < 0.25 ? 0 : r < 0.5 ? 1 : r < 0.75 ? 2 : 3];
  }

  // Efectes de so (js/sound.js); respecten el botó de silenci de la capçalera
  if (window.Sound) Sound.on = store.sound !== false;
  function sfx(name, arg) {
    if (!window.Sound || store.sound === false) return;
    try { Sound[name](arg); } catch (e) { /* sense àudio */ }
  }

  function tween(from, to, dur, step, done, linear) {
    if (reduceMotion || dur <= 0) { step(to); if (done) done(); return; }
    const t0 = performance.now();
    const frame = now => {
      const k = Math.min(1, (now - t0) / dur), e = linear ? k : 1 - Math.pow(1 - k, 3);
      step(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(frame); else if (done) done();
    };
    requestAnimationFrame(frame);
  }

  // Correcció: els punts compten des de 0 i canvien de color
  function animateLevelPoints() {
    const el = document.getElementById('pts-pop');
    if (!el) return;
    const to = +el.dataset.to, T = +el.dataset.max, tok = ++state.anim;
    const paint = v => {
      const c = levelColor(v, T);
      el.textContent = '+' + Math.round(v);
      el.style.color = c.color;
      el.style.textShadow = `0 0 18px rgba(${c.rgb},.55)`;
    };
    paint(0);
    let shown = 0;
    setTimeout(() => {
      if (tok !== state.anim) return;
      tween(0, to, Math.min(1700, 500 + to * 4), v => {
        if (tok !== state.anim) return;
        paint(v);
        if (Math.round(v) !== shown) { shown = Math.round(v); sfx('tick', T ? v / T : 0); }
      }, () => {
        if (tok !== state.anim) return;
        if (to >= T && to > 0) { el.classList.add('burst'); sfx('full'); }
        else if (to > 0) sfx('settle');
      });
    }, reduceMotion ? 0 : +el.dataset.delay * 1000);
  }

  // Resultat: la recta s'omple nivell a nivell, el total compta i al final es revela el savi
  function animateResult() {
    const fill = document.getElementById('rl-fill');
    if (!fill) return;
    const d = day(), MAX = maxTotal(), tok = ++state.anim;
    const num = document.getElementById('score3d'), box = num.parentNode, pctEl = document.getElementById('rl-pct');
    const meds = [...view.querySelectorAll('.rl-medal')], rows = [...view.querySelectorAll('.bar-row')];
    const pts = state.puzzle.levels.map((_, i) => (d.levels[i] ? d.levels[i].points : 0));
    const paint = v => {
      const frac = Math.min(1, v / MAX), c = SV.rankFor(Math.round(v));
      // Tota la barra pren el color del rang que s'està assolint
      fill.style.setProperty('--p', frac.toFixed(4));
      fill.style.setProperty('--fc', c.color);
      fill.style.setProperty('--frgb', c.rgb);
      if (pctEl) { pctEl.textContent = Math.round(frac * 100) + ' %'; pctEl.classList.toggle('over', frac > 0.86); }
      num.textContent = Math.round(v);
      box.style.setProperty('--c', c.color);
      box.style.setProperty('--rgb', c.rgb);
      meds.forEach((m, k) => {
        m.classList.toggle('lit', v > 0 && Math.round(v) >= SV.list[k].min);
        m.classList.toggle('cur', SV.list[k].key === c.key && v > 0);
      });
    };
    // Inici de cada nivell dins del total acumulat
    const starts = [];
    pts.reduce((acc, p, k) => { starts[k] = acc; return acc + p; }, 0);
    const total = pts.reduce((a, b) => a + b, 0);
    const bars = rows.map(row => row.querySelector('.bar i'));
    const fillRows = v => rows.forEach((row, k) => {
      const p = pts[k], f = p ? Math.max(0, Math.min(1, (v - starts[k]) / p)) : (v >= starts[k] ? 1 : 0);
      row.classList.toggle('add', v > starts[k] || (p === 0 && v >= starts[k] && v > 0));
      if (bars[k]) bars[k].style.width = (parseFloat(bars[k].dataset.w) * f).toFixed(2) + '%';
    });
    paint(0); fillRows(0);
    let shown = 0, rankIdx = 0, rowsDone = 0;
    const listen = v => {
      const n = Math.round(v);
      if (n === shown) return;
      shown = n;
      const ri = SV.list.indexOf(SV.rankFor(n));
      if (ri > rankIdx) { rankIdx = ri; sfx('rank', ri); }
      else sfx('tick', v / MAX);
      // Cada ronda de 100 que s'acaba d'omplir, un petit destell
      while (rowsDone < pts.length && v >= starts[rowsDone] + pts[rowsDone] - 0.5) {
        if (pts[rowsDone] >= LEVEL_MAX) sfx('full');
        rowsDone++;
      }
    };
    const finish = () => {
      if (tok !== state.anim) return;
      sfx('done', SV.list.indexOf(SV.rankFor(total)));
      rows.forEach(row => row.classList.add('add'));
      box.classList.add('done');
      fill.classList.add('complete');
      const rr = view.querySelector('.rank-reveal');
      if (rr) rr.classList.add('show');
    };
    // Un sol recorregut continu, a velocitat constant, de 0 al total
    const dur = Math.min(4200, 1600 + total * 2.6);
    setTimeout(() => {
      if (tok !== state.anim) return;
      tween(0, total, dur, v => { if (tok === state.anim) { paint(v); fillRows(v); listen(v); } }, finish, true);
    }, reduceMotion ? 0 : 500);
  }

  /* ================= Pantalla: resultat ================= */
  function screenResultat() {
    const d = day();
    if (!d.finished) return screenAvui();
    const total = totalOf(d), r = SV.rankFor(total), MAX = maxTotal();
    const bars = state.puzzle.levels.map((_, i) => {
      const st = d.levels[i], p = st ? st.points : 0, T = LEVEL_MAX, c = levelColor(p, T);
      return `<div class="bar-row"><span class="muted">N${i + 1}</span><span class="bar"><i style="width:0;background:${c.color};box-shadow:0 0 8px rgba(${c.rgb},.5)" data-w="${Math.round(p / T * 100)}%"></i></span><b>${p}<small>/${T}</small></b></div>`;
    }).join('');
    const rankLine = `<div class="rank-line" aria-hidden="true">
        <div class="rl-medals">${SV.list.map((sv, k) => `<span class="rl-medal" style="left:${10 + 20 * k}%">${SV.medal(sv.key, 40)}</span>`).join('')}</div>
        <div class="rl-track">
          <div class="rl-fill" id="rl-fill"></div>
          <div class="rl-zones">${SV.list.map(() => '<i></i>').join('')}</div>
          <span class="rl-pct" id="rl-pct">0 %</span>
        </div>
        <div class="rl-ticks">${[0, 1, 2, 3, 4, 5].map(k => `<span style="left:${k * 20}%">${MAX * k / 5}</span>`).join('')}</div>
      </div>`;
    const ex = exactOf(d), s = streak();
    const shown = state.celebrations.slice(0, 3), more = state.celebrations.length - shown.length;
    const cel = shown.length ? '<div class="celebrations">' + shown.map((c, k) =>
      `<div class="celebration" style="animation-delay:${(0.4 + k * 0.25).toFixed(2)}s"><span class="seal on"><b>${esc(c.g)}</b></span><span><strong>${esc(c.title)}</strong><small>${esc(c.sub)}</small></span></div>`).join('') +
      (more > 0 ? `<button type="button" class="link-more" data-go="vitrina">I ${more} ${more === 1 ? 'novetat més' : 'novetats més'} a la vitrina →</button>` : '') + '</div>' : '';
    return `<section class="screen resultat">
      ${header()}
      <div class="res-grid">
        <div class="res-hero">
          <p class="kicker center">Repte nº ${state.puzzle.number} · completat</p>
          <div class="score3d" style="--c:${SV.list[0].color};--rgb:${SV.list[0].rgb}" role="img" aria-label="Puntuació del dia: ${total} de ${MAX}">
            <span class="s3d-num" id="score3d">0</span>
            <span class="s3d-max">/ ${MAX}</span>
            <span class="s3d-floor" aria-hidden="true"></span>
          </div>
          ${rankLine}
          <div class="rank-reveal">
            <div class="rr-medal">${SV.medal(r.key, 110)}</div>
            <div><p class="kicker" style="color:${r.color}">Rang ${r.n} · ${r.colorName}</p><h1 class="res-name">${r.name}</h1></div>
            ${sageWordsHTML(r, total)}
          </div>
        </div>
        <div>
          ${cel}
          <section class="card bars" aria-label="Punts per nivell">${bars}
            <p class="muted small">${ex ? ex + (ex === 1 ? ' resultat exacte (en or).' : ' resultats exactes (en or).') : 'Cap resultat exacte avui.'} Ratxa: <b class="chalk">${s} ${s === 1 ? 'dia' : 'dies'}</b>.</p>
          </section>
          <div class="cta-row">
            <button type="button" class="btn btn-ghost" data-action="share">${ICON.share}Comparteix</button>
            <button type="button" class="btn btn-primary" data-go="ranquing">Rànquing →</button>
          </div>
          <div class="countdown-row"><span class="kicker">Nou repte en</span><span class="countdown big" data-countdown></span></div>
        </div>
      </div>
    </section>`;
  }

  function share() {
    const d = day(), total = totalOf(d), r = SV.rankFor(total);
    const marks = state.puzzle.levels.map((L, i) => { const st = d.levels[i]; return st && st.points >= LEVEL_MAX ? '■' : st && st.points >= LEVEL_MAX / 2 ? '▣' : '□'; }).join('');
    const text = `combina ≈ · repte nº ${state.puzzle.number}\n${marks}  ${total}/${maxTotal()} · ${r.name} · ratxa ${streak()}`;
    const url = location.href.split('#')[0];
    if (navigator.share) navigator.share({ title: 'combina ≈', text: text, url: url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + url).then(() => toast('Resultat copiat. Enganxa’l on vulguis!'), () => toast(text));
    else toast(text);
  }

  /* ================= Pantalla: vitrina ================= */
  function screenVitrina() {
    const rc = rankCounts();
    const got = ACH.filter(a => store.ach[a.id]).length;
    const medals = SV.list.map(s => `<div class="coll${rc[s.key] ? '' : ' none'}" title="${s.name}: ${rc[s.key]} ${rc[s.key] === 1 ? 'dia' : 'dies'}">
        ${SV.medal(s.key, 64, { dim: !rc[s.key] })}<b>×${rc[s.key]}</b><small>${s.name}</small></div>`).join('');
    const seals = ACH.map(a => {
      const on = !!store.ach[a.id];
      return `<li class="seal-item${on ? ' on' : ''}"><span class="seal${on ? ' on' : ''}"><b>${esc(a.g)}</b></span>
        <span><strong>${esc(a.name)}</strong><small>${esc(a.desc)}</small></span></li>`;
    }).join('');
    const played = Object.keys(store.days).filter(k => store.days[k].finished).length;
    return `<section class="screen vitrina">
      ${header()}
      <p class="kicker">La teva col·lecció</p>
      <h1 class="title">Vitrina</h1>
      <div class="vitrina-grid">
        <div class="v-col">
          ${streakCard(false)}
          <section class="card coll-card" aria-label="Medalles aconseguides">
            <div class="coll-head"><p class="kicker">Medalles</p><p class="muted small">${played} ${played === 1 ? 'repte completat' : 'reptes completats'} · millor ratxa ${store.bestStreak}</p></div>
            <div class="coll-row">${medals}</div>
          </section>
        </div>
        <section class="card seals-card" aria-label="Segells">
          <div class="coll-head"><p class="kicker">Segells</p><p class="muted small"><b class="chalk">${got}</b> de ${ACH.length}</p></div>
          <ul class="seals">${seals}</ul>
        </section>
      </div>
    </section>`;
  }

  /* ================= Pantalla: rànquing ================= */
  function screenRanquing() {
    const tabs = [['day', 'Avui'], ['week', 'Setmana'], ['total', 'Total']].map(([id, label]) =>
      `<button type="button" role="tab" aria-selected="${state.rankTab === id}" class="tab${state.rankTab === id ? ' on' : ''}" data-tab="${id}">${label}</button>`).join('');
    let body;
    if (!B.enabled) {
      const played = Object.keys(store.days).filter(k => store.days[k].finished);
      const sum = played.reduce((s, k) => s + store.days[k].total, 0);
      const best = played.reduce((m, k) => Math.max(m, store.days[k].total), 0);
      body = `<div class="card notice">
        <p><b>Rànquing compartit no activat.</b></p>
        <p class="muted small">Aquesta instal·lació funciona en mode local. Quan s'hi configuri Firebase (vegeu el README), s'hi podrà entrar amb Google i comparar-se amb tothom.</p>
      </div>
      <div class="stats">
        <div class="card stat"><span class="kicker">Avui</span><b>${day().finished ? totalOf(day()) : '—'}</b></div>
        <div class="card stat"><span class="kicker">Dies jugats</span><b>${played.length}</b></div>
        <div class="card stat"><span class="kicker">Total</span><b>${sum}</b></div>
        <div class="card stat"><span class="kicker">Millor dia</span><b>${best || '—'}</b></div>
      </div>`;
    } else {
      body = `${!state.user ? `<div class="card notice"><p class="muted small">Entra amb Google per aparèixer al rànquing.</p><button type="button" class="btn btn-primary" data-action="signin">${ICON.google}Continua amb Google</button></div>` : ''}
        <div id="rank-body"><p class="muted center pad">Carregant…</p></div>`;
    }
    return `<section class="screen ranquing">
      ${header()}
      <p class="kicker">Repte nº ${state.puzzle.number}</p>
      <h1 class="title">Rànquing</h1>
      <div role="tablist" class="tabs">${tabs}</div>
      ${body}
    </section>`;
  }

  function loadRanking() {
    if (!B.enabled) return;
    const tab = state.rankTab;
    let p;
    if (tab === 'day') p = B.day(state.dayKey);
    else if (tab === 'week') p = B.week(Array.from({ length: 7 }, (_, i) => P.addDays(state.dayKey, -i)));
    else p = B.total();
    p.then(rows => {
      if (state.screen !== 'ranquing' || state.rankTab !== tab) return;
      const box = document.getElementById('rank-body');
      if (box) box.innerHTML = rankHTML(rows, tab);
    }).catch(err => {
      const box = document.getElementById('rank-body');
      if (box) box.innerHTML = `<p class="muted center pad">No s'ha pogut carregar el rànquing (${esc(err.message)}).</p>`;
    });
  }

  function rankHTML(rows, tab) {
    if (!rows.length) return '<p class="muted center pad">Encara no hi ha cap puntuació. Sigues el primer!</p>';
    let dist = '';
    if (tab === 'day') {
      const counts = SV.list.map(s => rows.filter(r => SV.rankFor(r.total).key === s.key).length);
      const max = Math.max.apply(null, counts) || 1;
      dist = '<div class="dist" aria-label="Distribució de rangs">' + SV.list.map((s, i) =>
        `<div><small>${Math.round(counts[i] / rows.length * 100)}%</small><i style="height:${Math.max(4, counts[i] / max * 56)}px;background:${s.color}"></i><small>${s.name}</small></div>`).join('') + '</div>';
    }
    const me = state.user && state.user.uid;
    const list = rows.slice(0, 100).map((r, i) => {
      const s = tab === 'day' ? SV.rankFor(r.total) : null;
      const ring = s ? `border-color:${s.color};box-shadow:0 0 10px rgba(${s.rgb},.35)` : '';
      const sub = tab === 'day' ? `${s.name} · ${r.exact || 0} exactes` : `${r.days || 0} ${r.days === 1 ? 'dia' : 'dies'}`;
      return `<li class="rank-row${r.uid === me ? ' me' : ''}">
        <span class="pos">${i + 1}</span>
        <span class="ring" style="${ring}">${esc(initials(r.name))}</span>
        <span class="who"><b>${r.uid === me ? 'Tu' : esc(r.name)}</b><small>${esc(sub)}</small></span>
        <span class="pts">${r.total}</span>
      </li>`;
    }).join('');
    return dist + `<ol class="rank-list">${list}</ol>`;
  }

  /* ================= Pantalla: savis ================= */
  function screenSavis() {
    const d = day(), cur = d.finished ? SV.rankFor(totalOf(d)).key : null;
    const cards = SV.list.map(s => `<article class="card sage${s.key === cur ? ' current' : ''}" style="--c:${s.color};--rgb:${s.rgb}">
      <div class="sage-art">${SV.medal(s.key, 150)}</div>
      <div class="sage-info">
        <p class="kicker">Rang ${s.n} · ${s.min} – ${s.max} punts${s.key === cur ? ' · el teu d’avui' : ''}</p>
        <h2>${s.name}</h2>
        <p class="sage-meta">${s.era}</p>
        <p class="sage-fact">${s.fact}</p>
        <p class="sage-bio">${s.bio}</p>
      </div>
    </article>`).join('');
    return `<section class="screen savis">
      ${header()}
      <p class="kicker">Rangs diaris · 0 – ${maxTotal()} punts</p>
      <h1 class="title">Els cinc savis</h1>
      <p class="lead">Segons els punts del dia, acabes el repte al costat d'un d'ells. Com més t'acostes a l'objectiu, més brilla la medalla.</p>
      <div class="sage-grid">${cards}</div>
    </section>`;
  }

  const SCREENS = { entrada: screenEntrada, tutorial: screenTutorial, avui: screenAvui, joc: screenJoc, correccio: screenCorreccio, resultat: screenResultat, ranquing: screenRanquing, savis: screenSavis, vitrina: screenVitrina };

  /* ================= Modals ================= */
  function openModal(html) {
    modalEl.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}<button type="button" class="icon-btn modal-x" data-action="close-modal" aria-label="Tanca">${ICON.close}</button></div>`;
    modalEl.hidden = false;
    const f = modalEl.querySelector('button, a');
    if (f) f.focus();
  }
  function closeModal() { modalEl.hidden = true; modalEl.innerHTML = ''; }

  function profileModal() {
    let html = '<h2 class="title sm">El teu perfil</h2>';
    if (state.user) {
      html += `<p class="lead">Has entrat com a <b class="chalk">${esc(state.user.name)}</b>. Les teves puntuacions apareixen al rànquing.</p>
        <button type="button" class="btn btn-ghost" data-action="signout">Tanca la sessió</button>`;
    } else if (B.enabled) {
      html += `<p class="lead">Ara jugues com a convidat. Entra amb Google per sortir al rànquing compartit.</p>
        <button type="button" class="btn btn-primary" data-action="signin">${ICON.google}Continua amb Google</button>`;
    } else {
      html += '<p class="lead">Mode local: les partides es guarden en aquest dispositiu. El rànquing compartit s’activa quan es configura Firebase.</p>';
    }
    const played = Object.keys(store.days).filter(k => store.days[k].finished).length;
    html += `<p class="muted small">Dies completats: <b class="chalk">${played}</b> · Ratxa: <b class="chalk">${streak()}</b> · Segells: <b class="chalk">${ACH.filter(a => store.ach[a.id]).length}/${ACH.length}</b></p>`;
    openModal(html);
  }

  /* ================= Accions ================= */
  function submitDay() {
    const d = day();
    if (!d.finished || d.submitted || !B.enabled || !state.user) return;
    B.submitDay(state.dayKey, {
      total: totalOf(d), exact: exactOf(d),
      levels: state.puzzle.levels.map((_, i) => (d.levels[i] ? d.levels[i].points : 0))
    }).then(() => { d.submitted = true; save(); }).catch(e => console.warn('No s’ha pogut desar la puntuació', e));
  }

  function play() {
    const d = day();
    const next = state.puzzle.levels.findIndex((_, i) => !(d.levels[i] && d.levels[i].done));
    if (next < 0) return go('resultat');
    state.level = next;
    go('joc');
  }

  function openTutorial() {
    state.tut = { tokens: [], startAt: 1, done: false };
    state.tutResult = null;
    go('tutorial');
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-action],[data-tile],[data-key],[data-tab]');
    if (!t || t.disabled) return;
    if (t.dataset.go) {
      closeModal();
      if (t.dataset.go === 'tutorial') return openTutorial();
      return go(t.dataset.go);
    }
    if (t.dataset.tile != null) return pressTile(+t.dataset.tile);
    if (t.dataset.key) return press(t.dataset.key);
    if (t.dataset.tab) { state.rankTab = t.dataset.tab; return render(); }
    switch (t.dataset.action) {
      case 'guest': store.guest = true; save(); if (!store.seenHelp) openTutorial(); else go('avui'); break;
      case 'signin': closeModal(); B.signIn().catch(err => toast('No s’ha pogut iniciar la sessió: ' + (err.message || err))); break;
      case 'signout': closeModal(); B.signOut(); break;
      case 'play': play(); break;
      case 'start': startLevel(); break;
      case 'next': state.level++; go('joc'); break;
      case 'replay': render(); break;
      case 'share': share(); break;
      case 'profile': profileModal(); break;
      case 'sound':
        store.sound = store.sound === false; save();
        if (window.Sound) { Sound.on = store.sound; if (Sound.on) Sound.settle(); }
        render(); break;
      case 'close-modal': closeModal(); break;
      case 'tut-exit': store.seenHelp = true; save(); go('avui'); break;
      case 'tut-again': openTutorial(); break;
      case 'tut-finish': play(); break;
    }
  });

  modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(); });

  /* Teclat (ordinador) */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalEl.hidden) return closeModal();
    if ((state.screen !== 'joc' && state.screen !== 'tutorial') || !modalEl.hidden) return;
    const st = ctx().st;
    if (!st || !st.startAt || st.done) {
      if (state.screen === 'joc' && e.key === 'Enter' && (!st || !st.startAt)) { e.preventDefault(); startLevel(); }
      return;
    }
    if (state.screen === 'tutorial' && state.tutResult) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[0-9]$/.test(k)) { e.preventDefault(); return digit(k); }
    // «Dead»: als teclats catalans i espanyols, ^ és una tecla morta
    const map = { '+': '+', '-': '-', '*': '*', 'x': '*', 'X': '*', '/': '/', ':': '/', '(': '(', ')': ')', '^': '^', 'Dead': '^', 'p': '^', 'P': '^', 'r': 'sqrt', 'R': 'sqrt', '√': 'sqrt', 'Backspace': 'back', 'Delete': 'clear', 'Enter': 'submit', '=': 'submit' };
    if (map[k]) { e.preventDefault(); flushDigits(); press(map[k]); }
  });

  // Les xifres de dos dígits (10–20) s'escriuen seguides
  function digit(ch) {
    const c = ctx(), used = E.usedTiles(c.st.tokens);
    const free = c.L.nums.map((n, i) => ({ n: String(n), i })).filter(x => !used[x.i]);
    let buf = state.digitBuf + ch;
    if (!free.some(x => x.n.startsWith(buf))) buf = ch;
    const cands = free.filter(x => x.n.startsWith(buf));
    clearTimeout(state.digitTimer);
    if (!cands.length) { state.digitBuf = ''; return nudge(); }
    const exact = cands.find(x => x.n === buf);
    if (exact && cands.length === 1) { state.digitBuf = ''; return pressTile(exact.i); }
    state.digitBuf = buf;
    state.digitTimer = setTimeout(flushDigits, 650);
  }
  function flushDigits() {
    clearTimeout(state.digitTimer);
    const buf = state.digitBuf;
    state.digitBuf = '';
    if (!buf || (state.screen !== 'joc' && state.screen !== 'tutorial')) return;
    const c = ctx(), used = E.usedTiles(c.st.tokens);
    const i = c.L.nums.findIndex((n, k) => String(n) === buf && !used[k]);
    if (i >= 0) pressTile(i); else nudge();
  }

  /* ================= Rellotge global ================= */
  function tickCountdowns() {
    const txt = fmtCountdown();
    document.querySelectorAll('[data-countdown]').forEach(el => { el.textContent = txt; });
  }
  setInterval(() => {
    tickCountdowns();
    const k = P.dayKey();
    if (k !== state.dayKey) {
      const st = day().levels[state.level];
      const playing = state.screen === 'joc' && st && st.startAt && !st.done;
      if (!playing) {
        state.dayKey = k;
        state.puzzle = P.generateDay(k);
        applyFreezes();
        if (state.screen !== 'entrada' && state.screen !== 'tutorial') go('avui');
      }
    }
  }, 1000);

  /* ================= Inici ================= */
  function resumeOrHome() {
    const d = day();
    for (let i = 0; i < state.puzzle.levels.length; i++) {
      const st = d.levels[i];
      if (st && st.startAt && !st.done) {
        state.level = i;
        if (remaining(st, i) <= 0) { finishLevel(true); return; }
        return go('joc');
      }
    }
    go('avui');
  }

  applyFreezes();

  B.onAuth(u => {
    state.user = u;
    if (u) { store.guest = true; save(); submitDay(); }
    if (!state.screen) {
      if (!store.guest && !u) go('entrada');
      else resumeOrHome();
    } else if (state.screen === 'entrada' && u) {
      if (!store.seenHelp) openTutorial(); else resumeOrHome();
    } else render();
  });
  if (B.enabled) {
    // Si Firebase tarda, no deixem la pantalla en blanc
    setTimeout(() => { if (!state.screen) { if (store.guest) resumeOrHome(); else go('entrada'); } }, 2500);
  }
})();
