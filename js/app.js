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
    // segells ja vistos a la vitrina (els que no, surten com a «Nou»); amb dades antigues, tots vistos
    if (!s.seenAch) { s.seenAch = {}; Object.keys(s.ach).forEach(id => { s.seenAch[id] = 1; }); }
    s.milestones = s.milestones || {};    // fites de ratxa: dies → dia
    s.bestStreak = s.bestStreak || 0;
    s.friends = s.friends || {};          // amics (uid → dia que es van afegir), per al rànquing d'amics
    s.arxiu = s.arxiu || {};              // reptes anteriors jugats després: dia → punts del primer intent
    return s;
  }
  const store = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* ignora */ }
    // Amb sessió iniciada, el progrés també es desa al núvol (agrupant canvis)
    if (cloud.ready && B.user) { clearTimeout(cloud.timer); cloud.timer = setTimeout(pushCloud, 1500); }
  }

  /* ================= Protecció de dades: edat i consentiment =================
   * Abans d'enviar cap dada al servidor (Google o rànquing amb àlies) es pregunta l'edat, amb
   * botons neutres. Amb menys de C.minAge anys (14, art. 7 LOPDGDD) es juga igual, però tot
   * queda en aquest dispositiu. L'acceptació (versió i data) es desa a store.consent, que viatja
   * amb el progrés privat al núvol: és la prova del consentiment. */
  const MIN_AGE = C.minAge || 14;
  function consentOk() { return store.age === 'adult' && !!store.consent && store.consent.v === C.policyVersion; }
  function online() { return B.enabled && store.age !== 'minor'; }
  function privacyLink(text) { return `<a class="btn-text inline" href="privacitat.html" target="_blank" rel="noopener">${text || 'Privadesa'}</a>`; }
  function withAge(fn) {
    if (store.age === 'minor') return minorModal();
    if (consentOk()) return fn();
    state.pendingAge = fn;
    ageModal();
  }
  function ageModal(existing) {
    openModal(`<p class="kicker gold">Abans de continuar</p>
      <h2 class="title sm">Quants anys tens?</h2>
      <div class="age-row">
        <button type="button" class="btn btn-ghost" data-action="age" data-age="minor">Menys de ${MIN_AGE}</button>
        <button type="button" class="btn btn-ghost" data-action="age" data-age="adult">${MIN_AGE} o més</button>
      </div>
      <p class="small muted">Si en tens ${MIN_AGE} o més, en continuar acceptes la ${privacyLink('política de privadesa')}.
        Al rànquing només es veuen el teu àlies i els teus punts: mai el teu correu, el teu nom ni la teva foto.</p>
      ${existing ? '' : '<button type="button" class="btn-text" data-action="close-modal">Ara no</button>'}`);
  }
  function minorModal(deleted) {
    openModal(`<h2 class="title sm">Pots jugar igual!</h2>
      <p class="lead">El repte diari, la ratxa, els segells i la vitrina són tots teus i es guarden en aquest dispositiu.</p>
      <p class="small muted">Els comptes i el rànquing públic són per a jugadors de ${MIN_AGE} anys o més.
        ${deleted ? 'Per això hem esborrat el compte que tenies al rànquing.' : ''}</p>
      <button type="button" class="btn btn-primary" data-action="close-modal">Entesos</button>`);
  }
  function chooseAge(age) {
    const fn = state.pendingAge;
    state.pendingAge = null;
    store.age = age;
    if (age === 'adult') store.consent = { v: C.policyVersion, at: new Date().toISOString() };
    save();
    closeModal();
    track(age === 'adult' ? 'edat_14_o_mes' : 'edat_menys_14', 'Porta d’edat');
    if (age === 'minor') {
      // Si ja tenia compte, no podem guardar les seves dades: s'esborren (el progrés local es manté)
      if (B.user) return eraseAccount(false).then(() => minorModal(true), () => minorModal());
      render();
      return minorModal();
    }
    if (B.user) { pushCloud(); setTimeout(askAliasNotice, 800); }
    if (fn) fn(); else render();
  }
  // Jugadors que ja tenien compte d'abans de la política (o d'una versió anterior): es pregunta un cop
  function askExistingConsent() {
    if (!B.user) return;
    if (consentOk()) return askAliasNotice();
    if (state.screen === 'joc' || !modalEl.hidden) return setTimeout(askExistingConsent, 4000);
    if (store.age === 'minor') return eraseAccount(false).then(() => minorModal(true), () => {});
    ageModal(true);
  }
  // Noms públics canviats per un àlies per privadesa: avís un sol cop (per dispositiu)
  function askAliasNotice() {
    const u = B.user;
    if (!u || !u.aliasNotice || store.aliasNoticeSeen) return;
    if (!consentOk() || state.screen === 'joc' || !modalEl.hidden) return setTimeout(askAliasNotice, 4000);
    store.aliasNoticeSeen = true; save();
    // Si una pàgina oberta d'abans del canvi hi va tornar a escriure el nom antic, es torna a posar l'àlies
    if (!B.isAlias(u.name)) {
      const a = B.aliasFor(u.uid);
      B.saveProfile(a, u.avatar || '').then(() => render()).catch(() => {});
      u.name = a;
    }
    openModal(`<p class="kicker gold">Privadesa</p>
      <h2 class="title sm">Ara tens un àlies</h2>
      <p class="lead">Per protegir la teva privadesa, hem canviat el teu nom públic del rànquing.
        Ara hi surts com a <b class="chalk">${esc(u.name)}</b>.</p>
      <p class="small muted">Els teus punts, la ratxa i els segells es mantenen igual. Pots triar un altre àlies quan vulguis,
        però no hi posis el teu nom complet. ${privacyLink('Més informació')}</p>
      <button type="button" class="btn btn-primary" data-action="profile">Tria el teu àlies</button>
      <button type="button" class="btn-text" data-action="close-modal">D'acord</button>`);
  }

  /* Àlies públic: res que pugui identificar algú (correus, xarxes, webs, telèfons, anys de naixement) */
  function aliasError(name) {
    if (!/^[\p{L}\p{N} .'’_-]{2,20}$/u.test(name)) return 'L’àlies ha de tenir de 2 a 20 lletres o xifres.';
    if (/\d{4,}/.test(name)) return 'Massa xifres seguides: no hi posis telèfons ni anys.';
    if (/www|http|\.(com|cat|es|net|org)/i.test(name)) return 'L’àlies no pot ser una web ni un usuari de xarxes.';
    return '';
  }

  /* Dret de supressió: esborra compte, àlies, puntuacions i progrés del núvol */
  function allDayKeys() {
    const keys = new Set(Object.keys(store.days));
    for (let k = C.startDate, i = 0; k <= P.dayKey() && i < 5000; k = P.addDays(k, 1), i++) keys.add(k);
    return [...keys];
  }
  function deleteModal() {
    openModal(`<h2 class="title sm">Esborrar el compte</h2>
      <p class="lead">S'esborraran el teu compte, el teu àlies, totes les teves puntuacions del rànquing i el progrés desat al núvol. No es pot desfer.</p>
      <label class="check"><input type="checkbox" id="del-local"> Esborra també el progrés d'aquest dispositiu</label>
      <button type="button" class="btn btn-primary btn-danger" data-action="delete-confirm">Esborra-ho tot</button>
      <button type="button" class="btn-text" data-action="close-modal">Cancel·la</button>`);
  }
  /* ================= Diagnòstic de l'inici de sessió (anònim) =================
   * On s'obre el joc (sense cap dada personal): app instal·lada, navegador intern d'una xarxa, etc. */
  function envTag() {
    const ua = navigator.userAgent || '';
    if (/Instagram/i.test(ua)) return 'instagram';
    if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
    if (/musical_ly|TikTok|Bytedance/i.test(ua)) return 'tiktok';
    if (/WhatsApp/i.test(ua)) return 'whatsapp';
    if (/; wv\)/.test(ua)) return 'webview';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'ordinador';
    const app = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
    return os + (app ? '-app' : '');
  }
  function authCode(e) { return String((e && e.code) || 'desconegut').replace(/^auth\//, '').replace(/[^a-z0-9-]/gi, '').slice(0, 40); }
  // what: 'google' o 'alies'
  function authFail(what, e) {
    const code = authCode(e);
    track('error-' + what + '_' + code + '_' + envTag(), 'Error ' + (what === 'google' ? 'Google' : 'àlies') + ': ' + code + ' (' + envTag() + ')');
    const tip = ' Prova d’obrir combina.cat escrivint l’adreça a Safari o Chrome.';
    const msg = {
      'popup-closed-by-user': 'Has tancat la finestra de Google abans d’acabar.',
      'cancelled-popup-request': 'Has tancat la finestra de Google abans d’acabar.',
      'user-cancelled': 'Has cancel·lat l’inici de sessió.',
      'network-request-failed': 'No hi ha connexió amb Google. Revisa la xarxa o si tens un bloquejador d’anuncis.' + tip,
      'web-storage-unsupported': 'Aquest navegador no deixa guardar la sessió.' + tip,
      'operation-not-supported-in-this-environment': 'Aquest navegador no deixa iniciar sessió.' + tip,
      'internal-error': 'Aquest navegador no ha pogut connectar amb Google.' + tip,
      'too-many-requests': 'Massa intents seguits. Torna-ho a provar d’aquí a uns minuts.',
      'operation-not-allowed': 'El rànquing de convidats encara no està activat.'
    }[code];
    toast(msg || ('No s’ha pogut ' + (what === 'google' ? 'iniciar la sessió' : 'desar l’àlies') + ' (' + code + ').' + tip));
  }
  function signIn() {
    track('google-intent_' + envTag(), 'Intent d’entrar amb Google');
    B.signIn().then(r => { if (r && r.user) track('google-ok_' + envTag(), 'Entrada amb Google'); }).catch(e => authFail('google', e));
  }

  function eraseAccount(local) {
    clearTimeout(cloud.timer); cloud.ready = false;
    return B.deleteAccount(allDayKeys()).then(() => {
      track('compte_esborrat', 'Compte esborrat');
      store.hadGoogle = false;
      if (local) { try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ } location.reload(); return; }
      store.askedDay = state.dayKey; save();
      render();
    });
  }
  function confirmDelete(btn) {
    const local = !!(document.getElementById('del-local') || {}).checked;
    if (btn) btn.disabled = true;
    eraseAccount(local).then(() => { if (!local) { closeModal(); toast('Fet. Hem esborrat el teu compte i les teves dades.'); } })
      .catch(e => { if (btn) btn.disabled = false; toast('No s’ha pogut esborrar: ' + ((e && e.message) || e)); });
  }

  /* ================= Progrés al núvol ================= */
  const cloud = { ready: false, timer: null };
  function pushCloud() {
    if (!cloud.ready || !B.user) return;
    const o = JSON.parse(JSON.stringify(store));
    // Dels dies passats no cal guardar les expressions, només els punts
    Object.keys(o.days).forEach(k => { if (k !== P.dayKey()) (o.days[k].levels || []).forEach(l => { if (l) delete l.tokens; }); });
    delete o.sound; delete o.challenge;
    B.pushSave(o).catch(e => console.warn('No s’ha pogut desar el progrés al núvol', e));
  }
  // Combina el progrés del núvol amb el d'aquest navegador (sense perdre res de cap dels dos)
  function mergeStore(r) {
    if (!r || !r.days) return false;
    const weight = d => d ? (d.finished ? 1e6 : 0) + (d.levels || []).filter(l => l && l.done).length * 1000 + (d.total || 0) : -1;
    Object.keys(r.days).forEach(k => { if (weight(r.days[k]) > weight(store.days[k])) store.days[k] = r.days[k]; });
    ['ach', 'milestones'].forEach(f => Object.keys(r[f] || {}).forEach(id => {
      if (!store[f][id] || r[f][id] < store[f][id]) store[f][id] = r[f][id];
    }));
    Object.assign(store.frozen, r.frozen || {});
    // Desades antigues sense seenAch: els seus segells ja s'havien vist a l'altre dispositiu
    Object.keys(r.seenAch || r.ach || {}).forEach(id => { store.seenAch[id] = 1; });
    Object.keys(r.friends || {}).forEach(u => { if (!store.friends[u]) store.friends[u] = r.friends[u]; });
    Object.keys(r.arxiu || {}).forEach(k => { if (!(k in store.arxiu)) store.arxiu[k] = r.arxiu[k]; });
    store.freezes = Math.min(2, Math.max(store.freezes, r.freezes || 0));
    store.bestStreak = Math.max(store.bestStreak, r.bestStreak || 0);
    store.seenHelp = store.seenHelp || !!r.seenHelp;
    if (r.lastFreezeDay && !(store.lastFreezeDay >= r.lastFreezeDay)) store.lastFreezeDay = r.lastFreezeDay;
    // Consentiment de privadesa donat en un altre dispositiu (si aquí no s'ha dit res d'edat)
    if (!store.age && r.age === 'adult' && r.consent) { store.age = 'adult'; store.consent = r.consent; }
    return true;
  }

  /* ================= Estat ================= */
  // Tutorial en dues rondes guiades (s'aprèn jugant, sense llegir):
  // ① encertar l'objectiu  ② no es pot encertar → apropar-s'hi també puntua
  // guide: tecles que brillen en ordre ('0', '1' = xifres per índex; '+', '*' = operacions)
  const TUTS = [
    { count: 2, nums: [4, 6], target: 10, label: 'Arriba al', guide: ['0', '+', '1', 'submit'] },
    { count: 2, nums: [4, 6], target: 25, label: 'Apropa’t al', cap: 'Com més a prop, més punts', guide: ['0', '*', '1', 'submit'] }
  ];
  function tutL() { return TUTS[state.tutStep || 0]; }
  const state = {
    screen: null, dayKey: P.dayKey(), puzzle: null, level: 0,
    user: null, rankTab: 'day', rankScope: 'all', ticker: null, reward: null,
    digitBuf: '', digitTimer: null,
    tut: { tokens: [], startAt: 1, done: false }, tutResult: null,
    celebrations: []
  };
  // El N5 va canviar el dia hardFrom: qui ja l'havia començat abans (nivell sense «v2») conserva el d'abans
  // (versió d'un nivell: v = 3 des de la versió 3; v2 = true la 2; cap marca = la 1)
  function puzzleFor(k) {
    const d = store.days[k];
    let ver = 3;
    [3, 4].forEach(i => {
      const lv = d && d.levels && d.levels[i];
      if (lv && lv.startAt) ver = Math.min(ver, lv.v || (lv.v2 ? 2 : 1));
    });
    return P.generateDay(k, { ver });
  }
  state.puzzle = puzzleFor(state.dayKey);

  function day(k) {
    if (!k && state.practice) return state.practice.day;     // mode aula: partida a part, no es desa
    k = k || state.dayKey;
    return store.days[k] || (store.days[k] = { levels: [], finished: false, total: 0, submitted: false });
  }
  function totalOf(d) { return (d.levels || []).reduce((s, l) => s + (l && l.done ? l.points : 0), 0); }
  function exactOf(d) { return (d.levels || []).filter(l => l && l.done && l.exact).length; }
  function starsOf(d) { return (d.levels || []).filter(l => l && l.done && l.star).length; }
  function maxTotal() { return C.dailyTotal || 500; }
  const LEVEL_MAX = C.levelMax || 100;
  function doneCount(d) { return (d.levels || []).filter(l => l && l.done).length; }
  function levelTimes() { return C.levelSeconds; }
  function secsFor(i) { return levelTimes()[i]; }
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
    { id: 'star', g: '★', name: 'Estrella', desc: 'Encerta un objectiu fent servir totes les xifres.' },
    { id: 'star5', g: '★⁵', name: 'Constel·lació', desc: 'Aconsegueix 5 estrelles en un mateix dia.' },
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
    if (st.star) unlock('star');
    if (starsOf(day()) >= 5) unlock('star5');
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
    // Moment de recompensa: primer repte o rècord personal (per proposar iniciar la sessió)
    const prevBest = Object.keys(store.days).filter(k => k !== state.dayKey && store.days[k].finished)
      .reduce((m, k) => Math.max(m, store.days[k].total), -1);
    state.reward = { first: prevBest < 0, record: prevBest >= 0 && total > prevBest, total };
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

  /* Avatars: un símbol matemàtic i el color d'un dels savis, desats com «símbol.color» (p. ex. «3.4») */
  const AV_GLYPHS = ['π', 'Σ', '√', '∞', 'φ', 'Δ', '∫', '≈', 'λ', 'Ω', 'e', '∂'];
  function parseAv(a) {
    const m = /^(\d{1,2})\.(\d)$/.exec(a || '');
    const g = m && AV_GLYPHS[+m[1]], c = m && SV.list[+m[2]];
    return g && c ? { g, c, gi: +m[1], ci: +m[2] } : null;
  }
  // Cercle amb l'avatar (o les inicials) d'un jugador
  function ringHTML(name, avatar, extra, style) {
    const av = parseAv(avatar);
    if (av) return `<span class="ring av ${extra || ''}" style="color:${av.c.color};${style || `border-color:${av.c.color}`}">${av.g}</span>`;
    return `<span class="ring ${extra || ''}" style="${style || ''}">${esc(initials(name))}</span>`;
  }

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
    bannerEl.innerHTML = `<span class="seal on stamp" style="--d:.25s"><b>${esc(b.g)}</b></span><span><strong>${esc(b.title)}</strong><small>${esc(b.sub)}</small></span>`;
    bannerEl.classList.add('show');
    setTimeout(() => {
      bannerEl.classList.remove('show');
      setTimeout(() => { bannerQueue.shift(); showBanner(); }, 350);
    }, 3200);
  }

  const ICON = {
    instagram: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
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
    phone: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 8v6M9 11l3 3 3-3"/></svg>',
    about: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/></svg>',
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
    if (state.practice && (archive() ? ['joc', 'desglos'] : ['joc', 'correccio', 'aula']).indexOf(screen) < 0) exitPractice();
    // Segells nous: es marquen com a vistos en entrar a la vitrina, però l'animació dura tota la visita
    if (screen === 'vitrina' && state.screen !== 'vitrina') {
      state.newSeals = ACH.filter(a => store.ach[a.id] && !store.seenAch[a.id]).map(a => a.id);
      if (state.newSeals.length) { state.newSeals.forEach(id => { store.seenAch[id] = 1; }); save(); }
    }
    state.screen = screen;
    render();
    window.scrollTo(0, 0);
  }

  function renderNav() {
    // Al tutorial també s'amaga: és una partida i la barra tapava el teclat (per sortir hi ha la fletxa enrere)
    const hidden = ['entrada', 'joc', 'correccio'].indexOf(state.screen) >= 0 || (state.screen === 'tutorial' && !(state.tutResult && state.tutResult.done));
    document.body.classList.toggle('no-nav', hidden);
    const fresh = ACH.filter(a => store.ach[a.id] && !store.seenAch[a.id]).length;
    const item = (id, label, icon) =>
      `<button type="button" class="nav-item${state.screen === id ? ' on' : ''}" data-go="${id}"${state.screen === id ? ' aria-current="page"' : ''}>${icon}<span>${label}</span>${id === 'vitrina' && fresh ? `<i class="nav-dot" aria-label="${fresh} ${fresh === 1 ? 'segell nou' : 'segells nous'}"></i>` : ''}</button>`;
    navEl.innerHTML = `<div class="nav-brand">${wordmark}</div>` +
      item('avui', 'Avui', ICON.today) + item('ranquing', 'Rànquing', ICON.rank) +
      item('vitrina', 'Vitrina', ICON.trophy) + item('savis', 'Savis', ICON.sages) +
      item('sobre', 'Contacte', ICON.about) + item('tutorial', 'Tutorial', ICON.help);
  }

  function render() {
    renderNav();
    const fn = SCREENS[state.screen] || SCREENS.avui;
    view.innerHTML = fn();
    view.setAttribute('data-screen', state.screen);
    if (state.screen === 'joc') afterJocRender();
    if (state.screen === 'tutorial') updateGame();
    fitScreen();
    if (state.screen === 'ranquing') { loadRanking(); loadStats(); }
    if (state.screen === 'correccio') animateLevelPoints();
    if (state.screen === 'resultat') { animateResult(); loadDist(); loadStats(); }
    if (state.screen === 'resultat' || state.screen === 'desglos') prepareCard();
    tickCountdowns();
  }

  function header() {
    const u = B.user, s = streak(), av = u && parseAv(u.avatar);
    const who = av ? `<span class="av-glyph" style="color:${av.c.color}">${av.g}</span>`
      : u ? esc(initials(u.name)) : 'Tu';
    const fr = store.freezes ? `<span class="chip-sep"></span>${ICON.shield}${store.freezes}` : '';
    // Convidat: accés discret per guardar el progrés amb Google
    const saveBtn = online() && !state.user ? `<button type="button" class="chip chip-save" data-action="signin" title="Inicia sessió amb Google per guardar el progrés">${ICON.google}<span>Guarda el progrés</span></button>` : '';
    return `<header class="topbar">
      ${wordmark}
      <div class="topbar-right">
        ${saveBtn}
        <button type="button" class="chip chip-sound${store.sound === false ? ' off' : ''}" data-action="sound" aria-label="${store.sound === false ? 'Activa el so' : 'Silencia el so'}" title="${store.sound === false ? 'So desactivat' : 'So activat'}">${store.sound === false ? ICON.soundOff : ICON.soundOn}</button>
        <button type="button" class="chip" data-go="vitrina" title="Ratxa de dies seguits${store.freezes ? ' i comodins' : ''}">${ICON.flame}${s} ${s === 1 ? 'dia' : 'dies'}${fr}</button>
        <button type="button" class="avatar" data-action="profile" aria-label="Perfil i sessió">${who}</button>
      </div>
    </header>`;
  }

  /* ================= Peces del tauler de joc ================= */
  // Potències i arrels només als nivells avançats del repte diari (i sempre al mode aula)
  function advancedKeys() {
    if (state.screen === 'tutorial') return false;
    if (untimed()) return true;
    return state.level >= (C.advancedFrom == null ? 3 : C.advancedFrom);
  }

  function boardHTML(L) {
    const tiles = L.nums.map((n, k) => `<button type="button" class="tile" data-tile="${k}">${n}</button>`).join('');
    const key = (k, label, aria, cls) => `<button type="button" class="key ${cls || ''}" data-key="${k}" aria-label="${aria}">${label}</button>`;
    const adv = advancedKeys();
    return {
      expr: `<div class="expr-card" aria-live="polite">
          <p class="expr" id="expr"></p>
          <div class="expr-live"><span id="live-val">&nbsp;</span><span class="pill" id="live-pts"></span></div>
          <div class="pts-bar" aria-hidden="true"><i id="pts-fill"></i></div>
        </div>`,
      tiles: `<div class="tiles" style="--n:${L.count};--cols:${L.count <= 6 ? L.count : 4}">${tiles}</div>`,
      keypad: `<div class="keypad${adv ? '' : ' basic'}">
          ${key('+', '+', 'més')}${key('-', '−', 'menys')}${key('*', '×', 'per')}${key('/', '÷', 'dividit per')}
          ${key('(', '(', 'obre parèntesi')}${key(')', ')', 'tanca parèntesi')}${adv ? key('^', '<i>x</i><sup>y</sup>', 'potència: la xifra següent serà l’exponent') + key('sqrt', '√', 'arrel quadrada') : ''}
          ${key('back', '⌫', 'esborra', 'soft')}${key('clear', 'Neteja', 'neteja l’expressió', 'soft small')}
          <button type="button" class="key submit" data-key="submit" id="submit">Valida <b>=</b></button>
          <p class="kbd-hint">Teclat: xifres · + − * / · ( )${adv ? ' · ^ o P potència · R arrel' : ''} · ⌫ · Retorn valida</p>
        </div>`
    };
  }

  // Mode aula «sense calculadora»: no es veu el resultat ni els punts fins que valides
  function noCalc() { return untimed() && store.calc === false && state.screen === 'joc'; }
  // Repte diari (versió 3), nivells 4 i 5: es veu el resultat, però no a quina distància estàs ni els punts
  function noDist() {
    const pz = state.puzzle;
    return state.screen === 'joc' && !untimed() && state.level >= 3 && !!pz && pz.ver >= 3;
  }

  /* Context actiu: el tutorial o el nivell en joc */
  function ctx() {
    if (state.screen === 'tutorial') return { st: state.tut, L: tutL(), tut: true };
    return { st: day().levels[state.level], L: state.puzzle.levels[state.level], tut: false };
  }

  /* ================= Pantalla: entrada ================= */
  function screenEntrada() {
    const tiles = [3, 7, 12, 16, 2].map((n, i) => `<span class="mini-tile" style="animation-delay:${0.05 + i * 0.07}s">${n}</span>`).join('');
    return `<section class="screen entrada">
      <div class="brand-hero">${wordmark}<p class="kicker">El repte diari de càlcul</p></div>
      <div class="hero-demo" aria-hidden="true">
        <div class="mini-tiles">${tiles}</div>
        <div class="ops-line"><span></span>( ) × ÷ + −<span></span></div>
        <p class="kicker gold">Nivell 1 · objectiu</p>
        <p class="hero-target"><b>≈</b>247</p>
      </div>
      <h1 class="hero-title">Cinc nivells.<br><em>Un repte cada dia.</em></h1>
      <p class="lead">Combina les xifres combinant operacions per arribar a l'objectiu de cada nivell abans que s'acabi el temps.</p>
      <div class="cta-stack">
        ${challengeCard()}
        <button type="button" class="btn btn-hero" data-action="guest">Juga ara <span aria-hidden="true">→</span></button>
        ${online() ? `<button type="button" class="btn-text" data-action="signin">${ICON.google}<span>o inicia sessió amb Google per guardar el progrés</span></button>` : ''}
        <div class="countdown-row"><span class="kicker">Nou repte en</span><span class="countdown big" data-countdown></span></div>
      </div>
      <p class="legal-line">${privacyLink('Privadesa i avís legal')}</p>
    </section>`;
  }

  /* ================= Reptes entre amics ================= */
  // Enllaç: ?r=<dia>&de=<uid> (amb sessió) o ?r=<dia>&p=<punts> (convidat)
  function readChallenge() {
    let q;
    try { q = new URLSearchParams(location.search); } catch (e) { return; }
    const d = q.get('r');
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const uid = q.get('de'), p = q.get('p');
    const ch = { day: d, uid: uid && /^[A-Za-z0-9]{10,40}$/.test(uid) ? uid : null,
      total: p != null && /^\d{1,4}$/.test(p) ? +p : null, name: '', avatar: '' };
    store.challenge = ch;
    if (ch.uid && !store.friends[ch.uid] && Object.keys(store.friends).length < 60) store.friends[ch.uid] = d;
    save();
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignora */ }
    track('repte-amic-obert', 'Enllaç de repte obert');
  }

  // Completa el nom, l'avatar i la puntuació de qui ha enviat el repte
  function loadChallenger() {
    const ch = store.challenge;
    if (!ch || !ch.uid || !B.enabled) return;
    Promise.all([B.scoreOf(ch.day, ch.uid).catch(() => null), B.player(ch.uid).catch(() => null)]).then(([s, pl]) => {
      if (store.challenge !== ch) return;
      ch.name = (pl && pl.name) || (s && s.name) || '';
      ch.avatar = (pl && pl.avatar) || (s && s.avatar) || '';
      if (s) ch.total = s.total;
      save();
      if (['entrada', 'avui', 'resultat'].indexOf(state.screen) >= 0) render();
    });
  }

  function activeChallenge() {
    const ch = store.challenge;
    if (!ch || ch.day < P.addDays(state.dayKey, -1)) return null;          // només d'avui o d'ahir
    if (B.user && ch.uid === B.user.uid) return null;               // el teu propi enllaç
    return ch;
  }

  function challengeCard() {
    const ch = activeChallenge();
    if (!ch) return '';
    const who = `<b class="chalk">${esc(ch.name || 'Un amic')}</b>`;
    const today = ch.day === state.dayKey, pts = ch.total != null ? `<b class="gold">${ch.total} punts</b>` : '';
    let msg;
    if (today && pts) msg = `${who} et repta: ha fet ${pts} al repte d'avui.<small>Pots superar-ho?</small>`;
    else if (today) msg = `${who} et repta al repte d'avui.<small>A veure qui fa més punts!</small>`;
    else msg = `${who} ${pts ? 'va fer ' + pts + ' ahir' : 't’ha reptat'}.<small>Avui hi ha un repte nou: a veure qui en fa més!</small>`;
    return `<div class="card challenge">${ringHTML(ch.name || '?', ch.avatar, 'lg')}<p>${msg}</p></div>`;
  }

  // Al resultat: comparació amb qui t'ha reptat
  function challengeResult(total) {
    const ch = activeChallenge();
    if (!ch || ch.day !== state.dayKey || ch.total == null) return '';
    const name = esc(ch.name || 'el teu amic'), diff = total - ch.total;
    const msg = diff > 0 ? `Has guanyat a <b class="chalk">${name}</b> per <b class="gold">${diff}</b> punts!`
      : diff === 0 ? `Empat amb <b class="chalk">${name}</b>: ${total} a ${ch.total}.`
      : `<b class="chalk">${name}</b> t'ha guanyat per <b class="gold">${-diff}</b> punts. Demà, la revenja!`;
    return `<div class="card challenge">${ringHTML(ch.name || '?', ch.avatar, 'lg')}<p>${msg}<small>Tu ${total} · ${name} ${ch.total}</small></p>
      <button type="button" class="btn btn-ghost btn-sm" data-action="challenge">${ICON.share}Comparteix</button></div>`;
  }

  function challengeURL() {
    const d = day(), p = new URLSearchParams({ r: state.dayKey });
    if (B.user) p.set('de', B.user.uid);
    else if (d.finished) p.set('p', String(totalOf(d)));
    return location.origin + location.pathname + '?' + p.toString();
  }

  function shareOut(text, url, copied) {
    if (navigator.share) navigator.share({ title: 'combina ≈', text: text, url: url }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + '\n' + url).then(() => toast(copied), () => toast(url));
    else toast(url);
  }

  function challenge() {
    const d = day(), n = state.puzzle.number;
    const text = d.finished ? `He fet ${totalOf(d)} punts al repte nº ${n} de combina ≈. Em pots superar?`
      : `T'atreveixes amb el repte nº ${n} de combina ≈? Cinc nivells de càlcul, un repte cada dia.`;
    track('repte-amic-enviat', 'Repte a un amic');
    shareOut(text, challengeURL(), 'Enllaç de repte copiat. Envia’l a qui vulguis!');
  }

  /* ================= Convidats: el nom al rànquing sense compte ================= */
  function nameCard(total) {
    if (!online() || B.user) return '';
    return `<form class="card name-card" id="name-card" onsubmit="return false">
      <p class="kicker gold">Surt al rànquing d'avui</p>
      <p class="small">Tria un àlies (no el teu nom complet) i els teus <b class="chalk">${total} punts</b> apareixeran a la llista de jugadors.</p>
      <div class="name-row">
        <input class="guest-name" type="text" maxlength="20" autocomplete="nickname" spellcheck="false" placeholder="Un àlies" aria-label="Un àlies (no el teu nom complet)">
        <button type="button" class="btn btn-primary btn-sm" data-action="guest-join">Desa</button>
      </div>
      <button type="button" class="btn-text inline" data-action="signin">${ICON.google}<span>o entra amb Google per guardar també la ratxa</span></button>
    </form>`;
  }

  function guestJoin(btn) {
    const box = btn && (btn.closest('.name-row') || btn.closest('form'));
    const inp = (box && box.querySelector('.guest-name')) || document.querySelector('.guest-name');
    const name = (inp ? inp.value : '').replace(/\s+/g, ' ').trim();
    const err = aliasError(name);
    if (err) return toast(err);
    withAge(() => doGuestJoin(name, btn));
  }
  function doGuestJoin(name, btn) {
    if (btn) btn.disabled = true;
    // Avatar aleatori (símbol i color), que després es pot canviar al perfil
    const av = Math.floor(Math.random() * AV_GLYPHS.length) + '.' + Math.floor(Math.random() * SV.list.length);
    B.guestJoin(name, av).then(() => {
      track('convidat_amb_nom', 'Convidat amb nom');
      submitDay();
      closeModal();
      toast('Fet! Ja surts al rànquing com a ' + name + '.');
      render();
    }).catch(e => {
      if (btn) btn.disabled = false;
      authFail('alies', e);
    });
  }

  /* ================= Iniciar la sessió en el moment de recompensa ================= */
  function signinModal(kicker, total) {
    openModal(`${kicker ? `<p class="kicker gold">${esc(kicker)}</p>` : ''}
      <h2 class="title sm">${total != null ? `Has fet ${total} punts!` : 'Bona partida!'}</h2>
      <p class="lead">Guarda la teva ratxa i entra al rànquing amb Google, en un clic.</p>
      <button type="button" class="btn btn-primary" data-action="signin">${ICON.google}Continua amb Google</button>
      <button type="button" class="btn-text" data-action="close-modal">Ara no</button>`);
  }

  function maybeAskSignin() {
    const r = state.reward;
    state.reward = null;
    // Un cop al dia, en acabar el repte (el moment de màxima recompensa)
    if (!r || !online() || state.user || store.askedDay === state.dayKey) return;
    if (state.anon) return;              // ja surt al rànquing amb el seu nom: no l'atabalem cada dia
    store.askedDay = state.dayKey; save();
    const kicker = r.record ? 'Rècord personal' : r.first ? 'Primer repte completat'
      : state.celebrations.length ? state.celebrations[0].title : 'Repte nº ' + state.puzzle.number + ' completat';
    // Just després de veure la puntuació: missatge a sobre amb el nom o Google
    setTimeout(() => { if (state.screen === 'resultat' && modalEl.hidden && !B.user) nameModal(kicker, r.total); }, reduceMotion ? 300 : 900);
  }

  function nameModal(kicker, total) {
    openModal(`${kicker ? `<p class="kicker gold">${esc(kicker)}</p>` : ''}
      <h2 class="title sm">Has fet ${total} punts!</h2>
      <p class="lead">Tria un àlies i sortiràs al rànquing d'avui.</p>
      <form class="name-row" onsubmit="return false">
        <input class="guest-name" type="text" maxlength="20" autocomplete="nickname" spellcheck="false" placeholder="Un àlies" aria-label="Un àlies (no el teu nom complet)">
        <button type="button" class="btn btn-primary btn-sm" data-action="guest-join">Desa</button>
      </form>
      <div class="or-line"><span>o bé</span></div>
      <button type="button" class="btn btn-ghost" data-action="signin">${ICON.google}Entra amb Google i desa la teva ratxa</button>
      <button type="button" class="btn-text" data-action="close-modal">Ara no</button>`);
    const inp = modalEl.querySelector('.guest-name');
    if (inp) inp.focus();
  }

  // Targeta fixa per als convidats (resultat i rànquing)
  function saveCard(text) {
    if (!online() || state.user) return '';
    return `<div class="card notice save-card"><p class="small">${text}</p>
      <button type="button" class="btn btn-primary btn-sm" data-action="signin">${ICON.google}Continua amb Google</button></div>`;
  }

  /* ================= Pantalla: tutorial jugable ================= */
  function screenTutorial() {
    const L = tutL(), b = boardHTML(L), step = state.tutStep || 0;
    const done = state.tutResult && state.tutResult.done;
    const dots = TUTS.map((_, k) => `<i class="${k < step ? 'ok' : k === step ? 'on' : ''}"></i>`).join('');
    return `<section class="screen tutorial">
      <header class="game-head">
        <button type="button" class="icon-btn" data-action="tut-exit" aria-label="Surt del tutorial">${ICON.back}</button>
        <div class="game-progress"><p class="kicker">${store.seenHelp ? 'Tutorial' : 'Escalfament'} · sense rellotge</p><div class="tut-dots" aria-hidden="true">${dots}</div></div>
      </header>
      ${store.seenHelp ? '' : `<div class="tut-intro"><p class="tut-brand">${wordmark}<span class="kicker">El repte diari de càlcul · 5 nivells, 2 minuts</span></p>${challengeCard()}</div>`}
      ${done ? tutorialDone() : `
      <div class="game">
        <div class="game-main">
          <div class="target small-target tut-target${step ? ' approx' : ''}">
            <p class="kicker">${L.label}</p><p class="target-num">${L.target}</p>
            ${L.cap ? `<p class="tut-cap">${L.cap}</p>` : ''}
            <p class="tut-pop" id="tut-pop" aria-live="polite"></p>
          </div>
          ${b.expr}${b.tiles}
        </div>
        ${b.keypad}
      </div>`}
    </section>`;
  }

  // Només quan es repeteix el tutorial des del menú (el primer cop es passa directament al joc)
  function tutorialDone() {
    return `<div class="card tut-done">
      <p class="pop exact">≈</p>
      <p class="tut-done-title">Ja saps jugar!</p>
      <p class="lead">Encertar val 100 punts. Si t'hi apropes, també en suma.</p>
      <button type="button" class="btn btn-primary" data-action="tut-finish">Juga el repte d'avui</button>
      <button type="button" class="btn btn-ghost" data-action="tut-again">Torna a provar el tutorial</button>
    </div>`;
  }

  // Normes completes: plegades a la pantalla d'avui, per a qui les vulgui llegir
  function rulesHTML() {
    return `<details class="card rules-box">
      <summary>Normes i puntuació</summary>
      <ul class="tut-rules">
        <li><b>Cada dia a les 9:00</b>, un repte nou amb <b>5 nivells</b>${state.puzzle && state.puzzle.ver >= 3
          ? ` (de 4 a 6 xifres). Als nivells 4 i 5 la calculadora et diu el resultat, però <b>no a quina distància estàs</b>: ho descobreixes en validar. L'últim és el <b>repte de debò</b>.`
          : ` (de 4 a 7 xifres). L'últim és el <b>repte de debò</b>: hi ha poques maneres d'encertar-lo i sovint cal combinar <b>+ − × ÷</b>.`}</li>
        <li>Tens de <b>${Math.min(...levelTimes())} a ${Math.max(...levelTimes())} segons</b> per nivell. Si s'acaba el temps, es corregeix el que hi hagi.</li>
        <li>Pots fer servir <b>+ − × ÷</b> i <b>parèntesis</b>. Als nivells 4 i 5 també <b>potències</b> (l'exponent és una xifra) i <b>arrels</b>.</li>
        <li><b>Arribar a l'objectiu exacte val 100 punts</b> (500 al dia). Si a més fas servir <b>totes les xifres</b>, guanyes una <b class="gold">estrella ★</b>. Si no hi arribes, <b>cada unitat de distància resta un 10 %</b>: a 1, 90 punts; a 5, 50; a 10 o més, 0.</li>
        <li>Amb el total del dia, aconsegueixes la medalla d'un dels <b>cinc savis</b>. Juga cada dia per allargar la <b>ratxa</b> i guanyar <b>segells</b>.</li>
      </ul>
    </details>`;
  }

  // Tecla que ha de brillar ara: segueix la guia mentre el jugador la segueix;
  // si se'n desvia, no es bloqueja res i només es convida a validar quan hi ha un resultat
  function tutGuide(st) {
    const g = tutL().guide, t = st.tokens;
    for (let i = 0; i < t.length; i++) {
      const w = g[i], tok = t[i];
      const ok = /^\d$/.test(w || '') ? (tok.t === 'num' && tok.i === +w) : (tok.t === 'op' && tok.v === w);
      if (!ok) return (t.length >= 3 && E.value(t).ok) ? 'submit' : null;
    }
    return g[t.length] || null;
  }
  function showGuide(st) {
    view.querySelectorAll('.guide').forEach(b => b.classList.remove('guide'));
    if (st.done) return;
    const k = tutGuide(st);
    if (!k) return;
    const el = /^\d$/.test(k) ? view.querySelector(`.tile[data-tile="${k}"]`) : view.querySelector(`.key[data-key="${k}"]`);
    if (el && !el.disabled) el.classList.add('guide');
  }

  function tutSubmit() {
    const L = tutL(), st = state.tut, r = E.value(st.tokens);
    if (!r.ok || st.done) return nudge();
    const d = E.distance(L.target, r.v), pts = E.points(L.target, r.v, E.tilesUsed(st.tokens), L.count);
    const step = state.tutStep || 0, last = step >= TUTS.length - 1;
    // A la ronda d'aproximació, si queda massa lluny (0 punts) es torna a provar
    const retry = last && pts === 0;
    const pop = document.getElementById('tut-pop');
    if (pop) {
      pop.innerHTML = `+${pts}<small>${d === 0 ? 'Exacte!' : pts > 0 ? 'Gairebé! També suma' : 'Massa lluny · apropa-t’hi més'}</small>`;
      pop.className = 'tut-pop show' + (d === 0 ? ' exact' : pts === 0 ? ' miss' : '');
    }
    if (pts >= LEVEL_MAX) sfx('full'); else if (pts > 0) sfx('settle'); else nudge();
    st.done = true;
    tutTrack(retry ? 'reintent' : 'ok', retry ? 'massa lluny, torna a provar' : 'superada');
    view.querySelectorAll('.tile, .key').forEach(b => { b.disabled = true; b.classList.remove('guide'); });
    setTimeout(() => {
      if (state.screen !== 'tutorial') return;
      if (retry) { state.tut = { tokens: [], startAt: 1, done: false }; return render(); }
      if (!last) { state.tutStep = step + 1; state.tut = { tokens: [], startAt: 1, done: false }; return render(); }
      const first = !store.seenHelp;
      track('tutorial_completat', 'Tutorial completat');
      store.seenHelp = true; save();
      // Primer cop: sense pantalles entremig, directes al nivell 1
      if (first) return play();
      state.tutResult = { done: true };
      render();
    }, reduceMotion ? 600 : (d === 0 ? 1100 : 1700));
  }

  /* ================= Pantalla: avui ================= */
  function screenAvui() {
    const pz = state.puzzle, d = day(), total = totalOf(d);
    const next = pz.levels.findIndex((_, i) => !(d.levels[i] && d.levels[i].done));
    const rows = pz.levels.map((L, i) => {
      const st = d.levels[i];
      const dots = Array.from({ length: L.count }, () => '<i></i>').join('');
      let right = `<span class="muted">${secsFor(i)} s</span>`;
      if (st && st.done) right = `<b class="${st.exact ? 'gold' : ''}">${st.points}${st.star ? ' ★' : ''}</b>`;
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
          ${d.finished ? '' : challengeCard()}
          ${cta}
          <ol class="card lvl-list" aria-label="Nivells d'avui">${rows}</ol>
          <p class="countdown-line">Nou repte en <span class="countdown gold" data-countdown></span></p>
          ${arxiuButton('Juga reptes de dies anteriors')}
          ${rulesHTML()}
          <button type="button" class="btn-text aula-link" data-go="aula">Mode aula · practica sense temps</button>
          ${aboutLink()}
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
    const pr = untimed(), ar = archive();
    const head = `<header class="game-head">
      <button type="button" class="icon-btn" data-go="${pr ? 'aula' : ar ? 'arxiu' : 'avui'}" aria-label="${pr ? 'Torna al mode aula' : ar ? 'Surt (aquest intent es perd)' : 'Surt (el temps continua corrent)'}">${ICON.close}</button>
      <div class="game-progress"><p class="kicker">${pr ? 'Mode aula · nivell ' + (i + 1) + (store.calc === false ? ' · sense calculadora' : ' · sense temps') : (ar ? 'Repte nº ' + state.puzzle.number + ' · ' : '') + 'Nivell ' + (i + 1) + ' de 5 · ' + secsFor(i) + ' s'}</p><div class="segs" aria-hidden="true">${progress}</div></div>
      ${pr ? '<div class="timer off" aria-hidden="true"><span>∞</span></div>' : `<div class="timer" role="timer" aria-label="Temps restant">
        <svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="22" class="ring-bg"/><circle cx="26" cy="26" r="22" class="ring" id="ring"/></svg>
        <span id="timer-num">${secsFor(i)}</span>
      </div>`}
    </header>`;

    if (!st || !st.startAt) {
      return `<section class="screen joc">
        ${head}
        <div class="intro">
          <p class="kicker">Nivell ${i + 1}</p>
          <p class="intro-big">${L.count} xifres<br><em>${pr ? 'sense rellotge' : secsFor(i) + ' segons'}</em></p>
          <div class="intro-tiles" aria-hidden="true">${Array.from({ length: L.count }, () => '<span>?</span>').join('')}</div>
          <p class="lead center">${pr ? (store.calc === false ? 'Sense calculadora: no veuràs el resultat fins que validis. Fes els càlculs de cap!' : 'Mode aula: pensa amb calma, no compta per al rànquing ni per a la ratxa.') : 'Quan premis el botó, apareixeran l\'objectiu i les xifres i començarà el temps.'}</p>
          <button type="button" class="btn btn-primary" data-action="start">${pr ? 'Mostra' : 'Comença'} el nivell ${i + 1}</button>
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
          <p class="hint">${noDist() ? 'Cada xifra, un sol cop. Aquí la calculadora no et diu a quina distància estàs: valida i ho sabràs.' : 'Cada xifra, un sol cop. Exacte = 100 punts · amb totes les xifres, ★ de bonus.'}</p>
        </div>
        ${b.keypad}
      </div>
    </section>`;
  }

  // Encongeix el tauler (xifres, tecles, objectiu) fins que tot hi cap a l'alçada visible
  function fitScreen() {
    const sc = view.querySelector('.screen');
    if (!sc) return;
    view.style.removeProperty('--k');
    if (!sc.querySelector('.game') || (window.matchMedia && matchMedia('(min-width: 960px)').matches)) return;
    const H = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (!(H > 300)) return;                          // pestanya oculta o sense mida: no hi toquem
    let k = 1;
    for (let n = 0; n < 10 && document.documentElement.scrollHeight > H + 8; n++) {   // +8: l’animació d’entrada desplaça 6 px
      k = Math.round((k - 0.04) * 100) / 100;
      view.style.setProperty('--k', k);
    }
  }
  let fitT = null;
  window.addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitScreen, 120); });

  function afterJocRender() {
    const st = day().levels[state.level];
    if (st && st.startAt && !st.done) { updateGame(); if (!untimed()) startTicker(); }
  }

  // Vibració tàctil suau (mòbils Android); se silencia amb el mateix botó que el so
  function buzz(p) {
    if (store.sound === false || !navigator.vibrate) return;
    try { navigator.vibrate(p); } catch (e) { /* sense vibració */ }
  }

  function updateGame() {
    const c = ctx(), L = c.L, st = c.st;
    if (!st) return;
    const ex = document.getElementById('expr');
    if (!ex) return;
    // Parèntesis oberts: es mostren en gris on es tancaran (Valida els tanca automàticament)
    const open = E.openCount(st.tokens);
    ex.innerHTML = (st.tokens.length ? E.toHTML(st.tokens) : '<span class="placeholder">Toca una xifra per començar</span>') + '<span class="caret"></span>' +
      (open > 0 ? `<span class="ghost-paren" title="Parèntesis per tancar">${')'.repeat(open)}</span>` : '');
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
    const card = document.querySelector('.expr-card');
    if (card) { card.classList.toggle('no-calc', noCalc()); card.classList.toggle('no-dist', !c.tut && noDist()); }
    if (noCalc()) {
      // Només es diu si l'expressió és vàlida; el valor és càlcul mental
      lv.textContent = r.empty ? ' ' : '= ?';
      lp.textContent = r.empty ? '' : r.ok ? (open > 0 ? `Calcula-ho de cap · falta${open > 1 ? 'n' : ''} ${open} )` : 'Calcula-ho de cap i valida') : r.err;
      lp.className = 'pill' + (r.empty ? ' hidden' : r.ok ? (open > 0 ? ' warn' : '') : ' err');
      sb.disabled = !!r.empty;
      setBar(0, false);
    } else if (r.ok && !c.tut && noDist()) {
      // Només el resultat: a quina distància estàs i quants punts fas es descobreix en validar
      lv.textContent = '= ' + E.fmt(r.v);
      lp.textContent = open > 0 ? `falta${open > 1 ? 'n' : ''} ${open} )` : 'Valida per saber els punts';
      lp.className = 'pill' + (open > 0 ? ' warn' : '');
      sb.disabled = false;
      setBar(0, false);
    } else if (r.ok) {
      const d = E.distance(L.target, r.v), pts = E.points(L.target, r.v, E.tilesUsed(st.tokens), L.count);
      const all = E.tilesUsed(st.tokens) === L.count;
      lv.textContent = '= ' + E.fmt(r.v);
      // ≈: mentre t'acostes, veus els punts que ja tens assegurats si valides ara
      lp.textContent = (d === 0 ? (all ? 'Exacte! 100 punts ★' : 'Exacte! 100 punts · ★ amb totes')
        : pts > 0 ? 'a ' + E.fmt(d) + ' · ja tens ' + pts + ' punts' : 'a ' + E.fmt(d) + ' · 0 punts') +
        (open > 0 ? ` · falta${open > 1 ? 'n' : ''} ${open} )` : '');
      lp.className = 'pill' + (d === 0 ? ' exact' : '') + (open > 0 ? ' warn' : '');
      sb.disabled = false;
      setBar(pts, d === 0);
    } else {
      lv.innerHTML = '&nbsp;';
      lp.textContent = r.empty ? '' : r.err;
      lp.className = 'pill' + (r.empty ? ' hidden' : ' err');
      sb.disabled = !!r.empty;
      setBar(0, false);
    }
    if (c.tut) showGuide(st);
  }

  // Barra de punts en directe: com més a prop de l'objectiu, més plena
  function setBar(pts, exact) {
    const f = document.getElementById('pts-fill');
    if (!f) return;
    f.style.width = Math.max(0, Math.min(100, pts / LEVEL_MAX * 100)) + '%';
    f.parentNode.classList.toggle('exact', !!exact);
    f.parentNode.classList.toggle('some', pts > 0);
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
  // Només una vegada per sessió (per no inflar els recomptes amb repeticions)
  const tracked = new Set();
  function trackOnce(name, title) { if (tracked.has(name)) return; tracked.add(name); track(name, title); }
  // Embut del tutorial: només per als qui el fan per primer cop
  function tutTrack(what, title) {
    if (store.seenHelp) return;
    const r = (state.tutStep || 0) + 1;
    trackOnce('tut_r' + r + '_' + what, 'Tutorial ronda ' + r + ': ' + title);
  }
  // On marxa la gent: l'app passa a segon pla a mig tutorial o a mig nivell
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (state.screen === 'tutorial') return tutTrack('sortida', 'surt de l’app');
    if (state.screen === 'joc' && !state.practice) {
      const st = day().levels[state.level];
      if (st && st.startAt && !st.done) trackOnce('nivell_' + (state.level + 1) + '_sortida', 'Nivell ' + (state.level + 1) + ': surt de l’app');
    }
  });

  // «Comença» vol dir comença ja: es mostra el tauler i el rellotge arrenca, sense pantalla d'espera
  function beginLevel(i) {
    state.level = i;
    const d = day();
    if (!(d.levels[i] && d.levels[i].startAt)) {
      if (i === 0 && !state.practice) { track('repte-comencat', 'Repte començat'); setTimeout(countStart, 0); }
      d.levels[i] = { tokens: [], startAt: Date.now(), done: false, v2: true, v: 3 };
      save();
    }
    go('joc');
  }

  function startLevel() {
    const d = day(), i = state.level;
    if (d.levels[i] && d.levels[i].startAt) return;
    if (i === 0 && !state.practice) { track('repte-comencat', 'Repte començat'); setTimeout(countStart, 0); }
    d.levels[i] = { tokens: [], startAt: Date.now(), done: false, v2: true, v: 3 };
    save();
    render();
  }

  // away = el temps s'ha esgotat mentre l'app estava tancada: no s'arrenca el nivell següent sol
  function finishLevel(timeout, away) {
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
      st.star = st.exact && st.used === L.count;
    }
    else { st.value = null; st.points = 0; st.err = r.empty ? 'No hi havia cap expressió' : r.err; }
    d.total = totalOf(d);
    state.celebrations = [];
    // Mode aula: correcció pas a pas (aquí sí, per aprendre amb calma)
    if (untimed()) return go('correccio');
    // Repte anterior: com el del dia, però sense rànquing, ratxa ni segells
    if (archive()) {
      const done = doneCount(d) === state.puzzle.levels.length;
      if (done) { d.finished = true; archiveFinished(d); }
      return levelFlash(i, st, done);
    }
    const n = i + 1;
    track('nivell_' + n + '_acabat', 'Nivell ' + n + ' acabat');
    if (st.value === null) track('nivell_' + n + '_buit', 'Nivell ' + n + ': sense expressió vàlida');
    else if (st.star) track('nivell_' + n + '_estrella', 'Nivell ' + n + ': exacte amb totes les xifres');
    else if (st.exact) track('nivell_' + n + '_exacte', 'Nivell ' + n + ': exacte');
    else track('nivell_' + n + '_aprox', 'Nivell ' + n + ': aproximat');
    if (timeout) track('nivell_' + n + '_temps', 'Nivell ' + n + ': temps esgotat');
    onLevelDone(i, st, L);
    const last = doneCount(d) === state.puzzle.levels.length;
    if (last) {
      d.finished = true; onDayFinished(); submitDay(); countDay(); track('repte-acabat', 'Repte acabat');
      const b = Math.min(4, Math.floor((d.total || 0) / 100)) * 100;
      track('total_' + b + '-' + (b === 400 ? 500 : b + 99), 'Total del dia ' + b + '–' + (b === 400 ? 500 : b + 99));
    }
    save();
    if (away) return go(last ? 'resultat' : 'avui');
    levelFlash(i, st, last);
  }

  /* Repte diari: entre nivells només se sumen els punts (≈1,5 s) i es passa al següent.
   * La correcció pas a pas queda per al final, a «Com ho has resolt». */
  function levelFlash(i, st, last) {
    const tok = ++state.flash;
    const d = day(), total = totalOf(d), prev = total - st.points;
    const c = levelColor(st.points, LEVEL_MAX);
    const msg = st.star ? 'Exacte i amb totes les xifres ★' : st.exact ? 'Exacte!'
      : st.points >= 80 ? 'Molt a prop' : st.points > 0 ? (st.timeout ? 'Temps esgotat · cada intent suma' : 'Cada intent suma')
      : st.timeout ? 'Temps esgotat' : 'Aquesta no t’ha sortit';
    const nextL = !last && state.puzzle.levels[i + 1];
    view.querySelectorAll('.tile, .key').forEach(b => { b.disabled = true; });
    const el = document.createElement('div');
    el.className = 'lvl-flash' + (st.exact ? ' exact' : '');
    el.setAttribute('role', 'status');
    el.innerHTML = `<div class="lf-card">
        <p class="kicker">Nivell ${i + 1} de 5</p>
        <p class="lf-pts" id="lf-pts" style="color:${c.color};text-shadow:0 0 22px rgba(${c.rgb},.55)">+0</p>
        <p class="lf-msg">${esc(msg)}</p>
        <p class="lf-total">Total <b id="lf-total">${prev}</b><small> / ${maxTotal()}</small></p>
        <p class="lf-next">${last ? 'Repte completat!' : `Nivell ${i + 2} · ${nextL.count} xifres · ${secsFor(i + 1)} s`}</p>
        ${last || archive() ? '' : '<button type="button" class="btn-text lf-pause" data-action="pause">Fes una pausa</button>'}
      </div>`;
    view.appendChild(el);
    const pe = el.querySelector('#lf-pts'), te = el.querySelector('#lf-total');
    let shown = 0;
    tween(0, st.points, reduceMotion ? 0 : 650, v => {
      pe.textContent = '+' + Math.round(v);
      te.textContent = Math.round(prev + v);
      if (Math.round(v) !== shown) { shown = Math.round(v); sfx('tick', v / LEVEL_MAX); }
    }, () => {
      if (st.points >= LEVEL_MAX) { pe.classList.add('burst'); sfx('full'); } else if (st.points > 0) sfx('settle');
    });
    setTimeout(() => {
      if (tok !== state.flash || state.screen !== 'joc' || !el.isConnected) return;
      if (last) go(archive() ? 'desglos' : 'resultat'); else beginLevel(i + 1);
    }, reduceMotion ? 1200 : (last ? 1500 : 1700));
  }
  state.flash = 0;

  function press(k) {
    const c = ctx(), st = c.st;
    if (!st || st.done || !st.startAt) return;
    const a = E.allowed(st.tokens);
    let ok = true;
    switch (k) {
      case '+': case '-': case '*': case '/': ok = a.op; if (ok) st.tokens.push({ t: 'op', v: k }); break;
      case '(': ok = a.open; if (ok) st.tokens.push({ t: '(' }); break;
      case ')': ok = a.close; if (ok) st.tokens.push({ t: ')' }); break;
      case '^': ok = a.pow && advancedKeys(); if (ok) st.tokens.push({ t: '^' }); break;
      case 'sqrt': ok = a.sqrt && advancedKeys(); if (ok) st.tokens.push({ t: 'sqrt' }); break;
      case 'back': st.tokens.pop(); break;
      case 'clear': st.tokens = []; break;
      case 'submit':
        if (!st.tokens.length) return;
        if (c.tut) return tutSubmit();
        return finishLevel(false);
    }
    if (!ok) return nudge();
    if (c.tut) tutTrack('toca', 'primera tecla');
    buzz(8);
    if (!c.tut) save();
    updateGame();
  }

  function pressTile(k) {
    const c = ctx(), st = c.st;
    if (!st || st.done || !st.startAt) return;
    if (!E.allowed(st.tokens).num || E.usedTiles(st.tokens)[k]) return nudge();
    if (c.tut) tutTrack('toca', 'primera tecla');
    st.tokens.push({ t: 'num', v: c.L.nums[k], i: k });
    buzz(15);
    if (!c.tut) save();
    updateGame();
  }

  function nudge() {
    buzz([20, 40, 20]);
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
        ${last ? (state.practice ? '<button type="button" class="btn btn-primary" data-go="aula">Torna a l’aula →</button>' : '<button type="button" class="btn btn-primary" data-go="resultat">Resultat del dia →</button>')
              : `<button type="button" class="btn btn-primary" data-action="next">Nivell ${i + 2} →</button>`}
      </div>
      ${firstLevelNudge(i, st)}
    </section>`;
  }

  // Primer nivell superat d'un convidat que encara no ha completat cap dia: recordatori discret
  function firstLevelNudge(i, st) {
    if (!online() || state.user || state.practice || i !== 0 || !(st.points > 0)) return '';
    if (Object.keys(store.days).some(k => store.days[k].finished)) return '';
    return `<p class="nudge-line step" style="--d:1.2s">Bon començament! <button type="button" class="btn-text inline" data-action="signin">${ICON.google}<span>Guarda el progrés amb Google</span></button></p>`;
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
      maybeAskSignin();
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
      return `<div class="bar-row"><span class="muted">N${i + 1}</span><span class="bar"><i style="width:0;background:${c.color};box-shadow:0 0 8px rgba(${c.rgb},.5)" data-w="${Math.round(p / T * 100)}%"></i></span><b>${p}<small>/${T}</small><em class="star${st && st.star ? ' on' : ''}" aria-hidden="true">★</em></b></div>`;
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
      `<div class="celebration" style="animation-delay:${(0.4 + k * 0.25).toFixed(2)}s"><span class="seal on stamp" style="--d:${(0.7 + k * 0.25).toFixed(2)}s"><b>${esc(c.g)}</b></span><span><strong>${esc(c.title)}</strong><small>${esc(c.sub)}</small></span></div>`).join('') +
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
          </div>
          <div class="res-actions">
            <button type="button" class="btn btn-gold" data-action="share">${ICON.share}Comparteix el teu resultat</button>
            <button type="button" class="btn-text" data-go="desglos">Com ho has resolt? <span aria-hidden="true">→</span></button>
          </div>
          ${nameCard(total)}
          ${sageWordsHTML(r, total)}
        </div>
        <div>
          ${challengeResult(total)}
          ${cel}
          ${statsSlot()}${distCard()}
          <section class="card bars" aria-label="Punts per nivell">${bars}
            <p class="muted small">${ex ? ex + (ex === 1 ? ' resultat exacte (en or)' : ' resultats exactes (en or)') : 'Cap resultat exacte avui'}${starsOf(d) ? ` · <b class="gold">${starsOf(d)} ★</b> amb totes les xifres` : ''}. Ratxa: <b class="chalk">${s} ${s === 1 ? 'dia' : 'dies'}</b>.</p>
          </section>
          ${state.anon ? saveCard('<b class="chalk">Jugues com a ' + esc(state.anon.name) + '.</b> Inicia sessió amb Google per no perdre la ratxa i els segells si canvies de mòbil.') : ''}
          <div class="cta-row">
            <button type="button" class="btn btn-ghost" data-go="desglos">Com ho has resolt</button>
            <button type="button" class="btn btn-primary" data-go="ranquing">Rànquing →</button>
          </div>
          ${arxiuButton('En vols més? Juga reptes anteriors')}
          <div class="next-card">
            <div class="countdown-row"><span class="kicker">Nou repte en</span><span class="countdown big" data-countdown></span></div>
            <p class="muted small center">Cada dia a les 9:00 h, cinc nivells nous. No perdis la ratxa!</p>
            ${installBtn()}
          </div>
          ${aboutLink()}
        </div>
      </div>
    </section>`;
  }

  // Targeta d'emojis: es copia al porta-retalls i, al mòbil, s'obre el menú de compartir
  function shareText() {
    const d = day(), total = totalOf(d), r = SV.rankFor(total), stars = starsOf(d);
    // 🟡 exacte · 🟢 75 o més · 🟠 40–74 · 🔴 menys de 40
    const marks = state.puzzle.levels.map((L, i) => {
      const p = d.levels[i] ? d.levels[i].points : 0;
      return p >= LEVEL_MAX ? '🟡' : p >= 75 ? '🟢' : p >= 40 ? '🟠' : '🔴';
    }).join('');
    const s = streak();
    return `combina ≈ nº ${state.puzzle.number}\n${marks}${stars ? ' ' + '⭐'.repeat(stars) : ''}\n${total}/${maxTotal()} · ${r.name}${s > 1 ? ` · 🔥${s}` : ''}`;
  }


  /* ================= La campana de Gauss d'avui ================= */
  // Distribució de les puntuacions del dia (recomptes al servidor) i on queda el jugador.
  // Per sobre de la mitjana: s'omple l'àrea i es diu quin percentatge supera.
  // Per sota: cap percentatge; només la distància a la mitjana com a repte assolible,
  // i si queda molt lluny, ni marcador: un missatge sobre la seva pròpia progressió.
  function distKey() { return state.dayKey + '|' + totalOf(day()); }
  function distInfo() {
    const D = state.dist;
    if (!D || D.key !== distKey() || !D.data || D.data.n < (C.distMin || 20)) return null;
    const x = D.data, total = totalOf(day()), MAX = maxTotal();
    const mids = [25, 75, 125, 175, 225, 275, 325, 375, 425, 475, 500];
    const mu = x.buckets.reduce((a, c, i) => a + c * mids[i], 0) / x.n;
    const sd = Math.max(25, Math.sqrt(x.buckets.reduce((a, c, i) => a + c * (mids[i] - mu) * (mids[i] - mu), 0) / x.n));
    const pct = Math.floor(x.below / x.n * 100);
    const above = total >= mu;
    let mode, msg;
    if (total >= MAX) { mode = 'top'; msg = `<b class="gold">Dia perfecte!</b> Només el ${Math.max(1, Math.round(x.ties / x.n * 100))} % dels jugadors d'avui ha fet ${MAX} punts.`; }
    else if (above && pct >= 90) { mode = 'top'; msg = `<b class="gold">Ets entre el ${Math.max(1, 100 - pct)} % millor d'avui!</b> Has superat el ${pct} % dels jugadors.`; }
    else if (above) { mode = 'up'; msg = `Has superat el <b class="gold">${pct} %</b> dels jugadors d'avui.`; }
    else {
      const gap = Math.ceil(mu) - total;
      if (gap <= 120) { mode = 'goal'; msg = `Amb <b class="chalk">${gap} punts més</b> arribaves a la mitjana del rànquing (${Math.round(mu)}). Demà la pots superar!`; }
      else {
        mode = 'self';
        const best = Math.max.apply(null, Object.keys(store.days).filter(k => store.days[k].finished).map(k => store.days[k].total));
        msg = best > total ? `Cada repte entrena el càlcul: la teva millor marca és <b class="chalk">${best}</b>. Demà, cinc nivells nous!` : 'Cada repte entrena el càlcul. Demà, cinc nivells nous!';
      }
    }
    return { x, total, MAX, mu, sd, pct, mode, msg };
  }

  function distCard() {
    if (!B.enabled || state.practice) return '';
    const I = distInfo();
    if (!I) return '<div id="dist-slot"></div>';
    const { x, total, MAX, mu, sd, pct, mode, msg } = I;
    const rk = SV.rankFor(total), RC = rk.color;   // la campana pren el color del rang del dia
    const W = 320, H = 150, L = 10, R = 10, T = 22, Bm = 30, pw = W - L - R, ph = H - T - Bm;
    const X = v => L + Math.max(0, Math.min(MAX, v)) / MAX * pw;
    const pdf = v => Math.exp(-0.5 * Math.pow((v - mu) / sd, 2)) / (sd * Math.sqrt(2 * Math.PI));
    // Escala comuna: corba normal ajustada (n · 50 · pdf) i histograma real (cada barra = 50 punts)
    const hist = x.buckets.slice(0, 9).concat([x.buckets[9] + x.buckets[10]]);   // l'última barra és 450–500
    const curveMax = x.n * 50 * pdf(mu), histMax = Math.max.apply(null, hist);
    const top = Math.max(curveMax, histMax) * 1.08;
    const Y = c => T + ph - c / top * ph;
    const bars = hist.map((c, i) => c ? `<rect x="${(X(i * 50) + 1).toFixed(1)}" y="${Y(c).toFixed(1)}" width="${(X(50) - X(0) - 2).toFixed(1)}" height="${(T + ph - Y(c)).toFixed(1)}" rx="2" fill="#ECE8DF" fill-opacity=".08"/>` : '').join('');
    const pts = [];
    for (let v = 0; v <= MAX; v += 5) pts.push([X(v), Y(x.n * 50 * pdf(v))]);
    const line = pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const base = (T + ph).toFixed(1);
    const showMe = mode !== 'self', up = mode === 'up' || mode === 'top';
    const fillPts = pts.filter(p => p[0] <= X(total) + 0.01);
    const area = up && fillPts.length > 1 ? `<path class="dc-area" d="M${X(0).toFixed(1)},${base} L${fillPts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L')} L${X(total).toFixed(1)},${Y(x.n * 50 * pdf(total)).toFixed(1)} L${X(total).toFixed(1)},${base} Z" fill="url(#dc-gold)"/>` : '';
    // Eix: els cinc savis al llarg de la puntuació
    const axis = SV.list.map(s => `<line x1="${X(Math.max(0, s.min - 1)).toFixed(1)}" x2="${X(s.max).toFixed(1)}" y1="${base}" y2="${base}" stroke="${s.color}" stroke-width="3" stroke-opacity=".75"/>`).join('') +
      [0, 100, 200, 300, 400, 500].map(v => `<text x="${X(v).toFixed(1)}" y="${(T + ph + 14).toFixed(1)}" text-anchor="${v === 0 ? 'start' : v === MAX ? 'end' : 'middle'}" fill="#7D8693" font-size="9">${v}</text>`).join('');
    const meanX = X(mu).toFixed(1);
    // Si «Tu» queda a prop de la mitjana, l'etiqueta μ s'aparta cap a l'altre costat
    const near = showMe && Math.abs(X(total) - X(mu)) < 44;
    const muAnchor = near ? (total >= mu ? 'end' : 'start') : 'middle';
    const muLx = near ? X(mu) + (total >= mu ? -4 : 4) - (total >= mu ? Math.max(0, 30 - (X(total) - X(mu))) : -Math.max(0, 30 - (X(mu) - X(total)))) : X(mu);
    const meY = Y(x.n * 50 * pdf(total));
    const me = showMe ? `<g class="dc-me">
        <line x1="${X(total).toFixed(1)}" x2="${X(total).toFixed(1)}" y1="${(meY - 4).toFixed(1)}" y2="${base}" stroke="${RC}" stroke-width="1.4"/>
        <circle cx="${X(total).toFixed(1)}" cy="${meY.toFixed(1)}" r="5" fill="${up ? RC : '#0B0E12'}" stroke="${RC}" stroke-width="1.8"/>
        <text x="${(X(total) > W - 40 ? X(total) + 5 : X(total) < 40 ? X(total) - 5 : X(total)).toFixed(1)}" y="${Math.max(10, meY - 11).toFixed(1)}" text-anchor="${X(total) > W - 40 ? 'end' : X(total) < 40 ? 'start' : 'middle'}" fill="${RC}" font-size="11" font-weight="600" stroke="#0B0E12" stroke-width="4" paint-order="stroke">Tu${total >= MAX ? ' ★' : up ? ' · ' + pct + ' %' : ''}</text></g>` : '';
    // Per sota: fletxa cap a la mitjana amb els punts que falten (objectiu proper, no rànquing)
    const goal = mode === 'goal' ? `<g class="dc-goal"><line x1="${(X(total) + 7).toFixed(1)}" x2="${(X(mu) - 4).toFixed(1)}" y1="${(T + ph - 12).toFixed(1)}" y2="${(T + ph - 12).toFixed(1)}" stroke="#E6B85C" stroke-width="1.4" stroke-dasharray="3 3" marker-end="url(#dc-arrow)"/>
        <text x="${((X(total) + X(mu)) / 2).toFixed(1)}" y="${(T + ph - 17).toFixed(1)}" text-anchor="middle" fill="#E6B85C" font-size="10" font-weight="600" stroke="#0B0E12" stroke-width="4" paint-order="stroke">+${Math.ceil(mu) - total}</text></g>` : '';
    const svg = `<svg class="dist-svg${mode === 'top' ? ' top' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribució de les puntuacions d'avui: ${x.n} jugadors, mitjana ${Math.round(mu)}.">
        <defs>
          <linearGradient id="dc-gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${RC}" stop-opacity=".55"/><stop offset="1" stop-color="${RC}" stop-opacity=".08"/></linearGradient>
          <marker id="dc-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#E6B85C"/></marker>
        </defs>
        ${bars}${area}
        <polyline class="dc-curve" points="${line}" pathLength="1" fill="none" stroke="${RC}" stroke-opacity=".9" stroke-width="1.6" stroke-linejoin="round"/>
        <line x1="${meanX}" x2="${meanX}" y1="${(T - 6).toFixed(1)}" y2="${base}" stroke="#ECE8DF" stroke-opacity=".4" stroke-width=".8" stroke-dasharray="3 3"/>
        <text x="${muLx.toFixed(1)}" y="${(T - 10).toFixed(1)}" text-anchor="${muAnchor}" fill="#9AA3B0" font-size="9.5">μ = ${Math.round(mu)}</text>
        ${axis}${goal}${me}
      </svg>`;
    return `<div id="dist-slot"><section class="card dist-card ${mode}" style="--rc:${RC};--rrgb:${rk.rgb}" aria-label="Com has quedat avui">
      <div class="coll-head"><p class="kicker">La campana de Gauss d'avui</p><p class="muted small">${x.n} al rànquing</p></div>
      ${svg}
      <p class="dist-msg">${msg}</p>
    </section></div>`;
  }

  /* ================= Recompte de tots els jugadors d'avui (també convidats) ================= */
  // Cada partida acabada suma 1 un sol cop (marca `counted` dins del dia, que també viatja al núvol).
  // Recompte anònim (només n i suma). Mai per a qui ha dit que té menys de 14 anys: les seves dades no surten del dispositiu.
  function countDay() {
    const k = state.dayKey, d = store.days[k];
    if (!online() || !d || !d.finished || d.counted || state.countBusy) return;
    state.countBusy = true;
    B.countPlayer(k, totalOf(d)).then(() => {
      d.counted = true; save(); state.stats = null;
      if (state.screen === 'resultat' || state.screen === 'ranquing') loadStats();
    }).catch(e => console.warn('No s’ha pogut sumar al recompte', e)).then(() => { state.countBusy = false; });
  }
  // Qui comença el repte del dia (marca `startCounted`); tampoc per als menors
  function countStart() {
    const k = state.dayKey, d = store.days[k];
    if (!online() || state.practice || !d || !d.levels[0] || !d.levels[0].startAt || d.startCounted || state.startBusy) return;
    state.startBusy = true;
    B.countStart(k).then(() => { d.startCounted = true; save(); })
      .catch(e => console.warn('No s’ha pogut sumar al recompte', e)).then(() => { state.startBusy = false; });
  }
  function statsLine() {
    const S = state.stats, x = S && S.key === state.dayKey && S.data;
    if (!x || !(x.n > 0 || x.s > 0)) return '';
    // Només quanta gent ha jugat (qui ha començat el repte; els dies sense aquest recompte, qui l'ha acabat)
    const p = Math.max(x.s || 0, x.n || 0);
    return `<p class="day-stats">Avui han jugat <b>${p}</b> ${p === 1 ? 'persona' : 'persones'}</p>`;
  }
  function statsSlot() { return B.enabled && !state.practice ? `<div id="stats-slot">${statsLine()}</div>` : ''; }
  function loadStats() {
    if (!B.enabled || state.practice) return;
    const k = state.dayKey, S = state.stats;
    if (S && S.key === k && (S.loading || Date.now() - S.at < 60000)) return;
    state.stats = { key: k, at: Date.now(), loading: true, data: S && S.key === k ? S.data : null };
    B.dayStats(k).then(data => {
      state.stats = { key: k, at: Date.now(), data };
      const slot = document.getElementById('stats-slot');
      if (slot) slot.innerHTML = statsLine();
    }).catch(e => { state.stats = { key: k, at: Date.now(), data: null }; console.warn('Recompte no disponible', e); });
  }

  // Es demana en obrir el resultat (i es refresca si fa més de 2 minuts)
  function loadDist() {
    if (!B.enabled || state.practice || !day().finished) return;
    const key = distKey(), D = state.dist;
    if (D && D.key === key && (D.loading || Date.now() - D.at < 120000)) return;
    state.dist = { key, at: Date.now(), loading: true, data: D && D.key === key ? D.data : null };
    B.distribution(state.dayKey, totalOf(day())).then(data => {
      state.dist = { key, at: Date.now(), data };
      const slot = document.getElementById('dist-slot');
      if (slot && state.screen === 'resultat') { slot.outerHTML = distCard(); prepareCard(); }
    }).catch(e => { state.dist = { key, at: Date.now(), data: null }; console.warn('Distribució no disponible', e); });
  }

  /* ================= Targeta personal (imatge 1080×1920 per a històries) ================= */
  // Medalla del savi com a imatge: l'SVG de medals.js sense animacions ni filtres CSS
  function medalImage(key, size) {
    const tmp = document.createElement('div');
    tmp.innerHTML = SV.medal(key, size);
    const svg = tmp.querySelector('.medal-art');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', size); svg.setAttribute('height', size);
    svg.removeAttribute('style');
    svg.querySelectorAll('animateTransform, animate').forEach(n => n.remove());
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
    return new Promise((ok, ko) => {
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); ok(im); };
      im.onerror = e => { URL.revokeObjectURL(url); ko(e); };
      im.src = url;
    });
  }

  async function buildCard() {
    const d = day(), total = totalOf(d), r = SV.rankFor(total), MAX = maxTotal(), stars = starsOf(d), s = streak();
    const seals = ACH.filter(a => store.ach[a.id]).length;
    try {
      await Promise.all(['500 120px "STIX Two Text"', 'italic 400 60px "STIX Two Text"', '600 200px "IBM Plex Mono"', '500 40px "IBM Plex Mono"', '500 40px "IBM Plex Sans"', '600 40px "IBM Plex Sans"']
        .map(f => document.fonts ? document.fonts.load(f) : null));
    } catch (e) { /* tipografies del sistema */ }
    const W = 1080, H = 1920, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const SERIF = '"STIX Two Text", Georgia, serif', MONO = '"IBM Plex Mono", Consolas, monospace', SANS = '"IBM Plex Sans", system-ui, sans-serif';
    // Fons: tinta, halo del color del rang i una quadrícula de llibreta molt suau
    g.fillStyle = '#0B0E12'; g.fillRect(0, 0, W, H);
    let rg = g.createRadialGradient(W / 2, 720, 40, W / 2, 720, 900);
    rg.addColorStop(0, `rgba(${r.rgb},.30)`); rg.addColorStop(.45, `rgba(${r.rgb},.08)`); rg.addColorStop(1, 'rgba(11,14,18,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(236,232,223,.035)'; g.lineWidth = 2;
    for (let x = 60; x < W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 60; y < H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    // Capçalera
    g.font = `500 92px ${SERIF}`;
    const wA = g.measureText('combina ').width, wB = g.measureText('≈').width, x0 = W / 2 - (wA + wB) / 2;
    g.textAlign = 'left'; g.fillStyle = '#ECE8DF'; g.fillText('combina ', x0, 190);
    g.fillStyle = '#E6B85C'; g.fillText('≈', x0 + wA, 190);
    g.textAlign = 'center'; g.fillStyle = '#9AA3B0'; g.font = `500 36px ${MONO}`;
    g.fillText(`Repte nº ${state.puzzle.number} · ${P.prettyDay(state.dayKey)}`, W / 2, 262);
    // Medalla del savi
    try {
      const im = await medalImage(r.key, 560);
      g.save(); g.shadowColor = r.color; g.shadowBlur = 60;
      g.drawImage(im, W / 2 - 280, 330, 560, 560); g.restore();
      g.drawImage(im, W / 2 - 280, 330, 560, 560);
    } catch (e) { /* sense medalla */ }
    // Rang
    g.fillStyle = r.color; g.font = `600 38px ${MONO}`;
    g.fillText(`RANG ${r.n} · ${r.colorName.toUpperCase()}`, W / 2, 985);
    g.fillStyle = '#ECE8DF'; g.font = `500 132px ${SERIF}`;
    g.fillText(r.name, W / 2, 1120);
    // Puntuació
    g.font = `600 230px ${MONO}`;
    const tW = g.measureText(String(total)).width;
    g.font = `500 72px ${MONO}`;
    const mW = g.measureText(' / ' + MAX).width, sx = W / 2 - (tW + mW) / 2;
    g.textAlign = 'left';
    g.save(); g.shadowColor = 'rgba(230,184,92,.45)'; g.shadowBlur = 40;
    g.fillStyle = '#FFFFFF'; g.font = `600 230px ${MONO}`; g.fillText(String(total), sx, 1370); g.restore();
    g.fillStyle = '#7D8693'; g.font = `500 72px ${MONO}`; g.fillText(' / ' + MAX, sx + tW, 1370);
    g.textAlign = 'center';
    // Cinc nivells: una peça per nivell, del color del rang de punts (or = exacte)
    const bw = 150, gap = 22, bx = W / 2 - (5 * bw + 4 * gap) / 2, by = 1440;
    state.puzzle.levels.forEach((L, i) => {
      const st = d.levels[i], p = st && st.done ? st.points : 0, c = levelColor(p, LEVEL_MAX), x = bx + i * (bw + gap);
      g.beginPath(); g.roundRect ? g.roundRect(x, by, bw, 120, 22) : g.rect(x, by, bw, 120);
      g.fillStyle = `rgba(${c.rgb},${p >= LEVEL_MAX ? .9 : .16})`; g.fill();
      g.strokeStyle = `rgba(${c.rgb},.9)`; g.lineWidth = 3; g.stroke();
      g.fillStyle = p >= LEVEL_MAX ? '#0B0E12' : '#ECE8DF'; g.font = `600 50px ${MONO}`;
      g.fillText(String(p), x + bw / 2, by + 76);
      g.fillStyle = '#7D8693'; g.font = `500 26px ${MONO}`;
      g.fillText('N' + (i + 1) + (st && st.star ? ' ★' : ''), x + bw / 2, by + 160);
    });
    // Ratxa · estrelles · segells
    const cols = [[String(s), s === 1 ? 'dia de ratxa' : 'dies de ratxa'], [String(stars), stars === 1 ? 'estrella ★' : 'estrelles ★'], [seals + '/' + ACH.length, 'segells']];
    cols.forEach((c, k) => {
      const cx = W / 2 + (k - 1) * 320;
      g.fillStyle = k === 0 ? '#E6B85C' : '#ECE8DF'; g.font = `600 68px ${MONO}`; g.fillText(c[0], cx, 1712);
      g.fillStyle = '#9AA3B0'; g.font = `500 32px ${SANS}`; g.fillText(c[1], cx, 1760);
    });
    g.strokeStyle = 'rgba(236,232,223,.12)'; g.lineWidth = 2;
    [-160, 160].forEach(dx => { g.beginPath(); g.moveTo(W / 2 + dx, 1650); g.lineTo(W / 2 + dx, 1775); g.stroke(); });
    // Peu
    const brag = cardBrag();
    if (brag) {
      g.font = `600 44px ${SANS}`;
      const bw2 = g.measureText(brag).width + 80;
      g.beginPath(); g.roundRect ? g.roundRect(W / 2 - bw2 / 2, 1792, bw2, 76, 38) : g.rect(W / 2 - bw2 / 2, 1792, bw2, 76);
      g.fillStyle = 'rgba(230,184,92,.16)'; g.fill(); g.strokeStyle = 'rgba(230,184,92,.8)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#E6B85C'; g.fillText(brag, W / 2, 1845);
      g.fillStyle = '#ECE8DF'; g.font = `600 36px ${SANS}`; g.fillText('Supera’m a combina.cat', W / 2, 1902);
    } else {
      g.fillStyle = '#E6B85C'; g.font = `600 42px ${SANS}`;
      g.fillText('Supera’m a combina.cat', W / 2, 1862);
    }
    return new Promise(ok => cv.toBlob(ok, 'image/png'));
  }

  // Un sol botó «Comparteix el teu resultat»: imatge + text del resultat + enllaç de repte.
  // La imatge es prepara en obrir la pantalla, perquè el menú de compartir s'obri dins del mateix toc (Safari ho exigeix).
  function cardKey() { const d = day(); return state.dayKey + '|' + totalOf(d) + '|' + streak() + '|' + ACH.filter(a => store.ach[a.id]).length + '|' + cardBrag(); }
  // Frase de la targeta: només si deixa el jugador en bon lloc
  function cardBrag() {
    const I = distInfo();
    if (!I || (I.mode !== 'up' && I.mode !== 'top')) return '';
    return I.total >= I.MAX ? 'Dia perfecte · ' + I.x.n + ' jugadors avui' : I.pct >= 90 ? 'Entre el ' + Math.max(1, 100 - I.pct) + ' % millor d’avui' : 'Millor que el ' + I.pct + ' % dels jugadors d’avui';
  }
  function prepareCard() {
    if (!day().finished || state.practice) return Promise.resolve(null);
    const key = cardKey();
    if (state.card && state.card.key === key) return state.card.ready;
    const c = { key, file: null, url: null, name: 'combina-' + state.puzzle.number + '.png' };
    c.ready = buildCard().then(blob => {
      if (!blob) return null;
      c.file = new File([blob], c.name, { type: 'image/png' });
      c.url = URL.createObjectURL(blob);
      return c;
    }).catch(() => null);
    if (state.card && state.card.url) URL.revokeObjectURL(state.card.url);
    state.card = c;
    return c.ready;
  }
  function shareMessage() { return shareText() + '\n' + challengeURL(); }
  function copyMessage() {
    try { if (navigator.clipboard) return navigator.clipboard.writeText(shareMessage()).then(() => true, () => false); } catch (e) { /* sense porta-retalls */ }
    return Promise.resolve(false);
  }

  function shareResult() {
    const c = state.card;
    // Mòbil: imatge i missatge junts al menú del sistema (WhatsApp, Instagram, X…)
    if (c && c.file && navigator.canShare && navigator.canShare({ files: [c.file] })) {
      track('resultat_compartit', 'Resultat compartit');
      copyMessage();   // per si l'app triada només agafa la imatge (Instagram): el text queda copiat
      navigator.share({ files: [c.file], text: shareMessage() }).catch(err => {
        if (err && err.name === 'AbortError') return;
        // Alguns navegadors no deixen compartir fitxers amb text: com a mínim el missatge amb l'enllaç
        if (navigator.share) navigator.share({ text: shareMessage() }).catch(() => {});
      });
      return;
    }
    // Ordinador (o targeta encara no llesta): vista prèvia, descàrrega i missatge copiat
    cardModal();
  }

  async function cardModal() {
    track('resultat_compartit', 'Resultat compartit');
    openModal('<p class="kicker">Comparteix el teu resultat</p><div class="card-prev"><p class="muted small">Preparant la targeta…</p></div>');
    const [c, copied] = await Promise.all([prepareCard(), copyMessage()]);
    if (modalEl.hidden) return;
    const canFiles = !!(c && c.file && navigator.canShare && navigator.canShare({ files: [c.file] }));
    openModal(`<p class="kicker">Comparteix el teu resultat</p>
      ${c ? `<div class="card-prev"><img src="${c.url}" alt="Targeta amb la puntuació del repte nº ${state.puzzle.number}" width="1080" height="1920"></div>`
        : '<p class="muted small">No s’ha pogut crear la imatge en aquest navegador, però pots enviar el missatge.</p>'}
      <pre class="share-msg">${esc(shareMessage())}</pre>
      ${canFiles ? `<button type="button" class="btn btn-gold" data-action="share">${ICON.share}Comparteix</button>` : ''}
      ${c && !canFiles ? `<button type="button" class="btn btn-gold" data-action="card-download">Descarrega la imatge</button>` : ''}
      <button type="button" class="btn btn-ghost" data-action="copy-msg">${copied ? 'Missatge copiat ✓' : 'Copia el missatge'}</button>
      <p class="muted small center">${canFiles ? 'Tria WhatsApp, Instagram, X… al menú del mòbil.' : 'Envia la imatge i enganxa el missatge (amb l’enllaç) al xat o a la xarxa que vulguis.'}</p>`);
  }
  function cardDownload() {
    const c = state.card;
    if (!c || !c.url) return;
    track('targeta_descarregada', 'Targeta descarregada');
    const a = document.createElement('a');
    a.href = c.url; a.download = c.name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ================= Pantalla: com ho has resolt (desglòs del dia) ================= */
  function screenDesglos() {
    const d = day(), ar = archive();
    if (!d.finished) return screenAvui();
    const items = state.puzzle.levels.map((L, i) => {
      const st = d.levels[i] || {}, r = E.value(st.tokens || []);
      const c = levelColor(st.points || 0, LEVEL_MAX);
      let body;
      if (r.ok) {
        const steps = E.steps(r.ast);
        body = '<ol class="steps-mini">' + steps.map((sp, k) =>
          `<li><span class="step-expr${k === steps.length - 1 && k > 0 ? ' final' : ''}">${sp.html}</span><span class="chip-label">${esc(sp.label)}</span></li>`).join('') + '</ol>';
        const dist = E.distance(L.target, r.v);
        body += `<p class="muted small">${dist === 0 ? 'Exacte!' : `|${L.target} − ${E.fmt(r.v)}| = ${E.fmt(dist)} · precisió ${E.fmt(E.percent(L.target, r.v))} %`} · ${st.used || 0}/${L.count} xifres${st.star ? ' ★' : ''}</p>`;
      } else {
        body = `<p class="step-expr">${st.tokens && st.tokens.length ? E.toHTML(st.tokens) : '—'}</p><p class="muted small">${esc(st.err || 'Sense resultat vàlid')}</p>`;
      }
      return `<details class="card dg-item"${i === 0 ? ' open' : ''}>
        <summary><span class="dg-n">N${i + 1}</span><span class="dg-t">Objectiu <b>${L.target}</b></span>
          <span class="dg-p" style="color:${c.color}">${st.points || 0}${st.star ? ' ★' : ''}</span></summary>
        <div class="dg-body">${body}
          <p class="dg-sol"><span class="kicker">Una solució exacta</span><span>${E.solutionHTML(L.solution)} = ${L.target}</span></p>
        </div>
      </details>`;
    }).join('');
    return `<section class="screen desglos">
      <header class="game-head">
        <button type="button" class="icon-btn" data-go="${ar ? 'arxiu' : 'resultat'}" aria-label="${ar ? 'Torna als reptes anteriors' : 'Torna al resultat'}">${ICON.back}</button>
        <div class="game-progress"><p class="kicker">Repte nº ${state.puzzle.number} · ${ar ? esc(P.prettyDay(state.practice.key)) + ' · ' : ''}${totalOf(d)} / ${maxTotal()}</p><h1 class="title sm">Com ho has resolt</h1></div>
      </header>
      ${ar ? archiveNote() : ''}
      ${items}
      ${ar ? '<button type="button" class="btn btn-primary" data-go="arxiu">Més reptes anteriors →</button>' : `<button type="button" class="btn btn-gold" data-action="share">${ICON.share}Comparteix el teu resultat</button>`}
    </section>`;
  }

  /* ================= Pantalla: sobre mi i contacte ================= */
  /* Xarxes de @combinacat: enllaços simples (res incrustat, cap galeta) i mai per a qui ha dit que té menys de 14 anys */
  const SOCIAL = [['instagram', 'Instagram'], ['x', 'X']].filter(([k]) => C.social && C.social[k]);
  function socialOn() { return SOCIAL.length > 0 && store.age !== 'minor'; }
  function socialLink(k, name, label) {
    return `<a href="${esc(C.social[k])}" target="_blank" rel="noopener" data-social="${k}" aria-label="${name} @combinacat (s’obre en una pestanya nova)">${ICON[k]}${label ? '<span>@combinacat</span>' : ''}</a>`;
  }
  function socialIcons() {
    return socialOn() ? ` · <span class="social-icons">${SOCIAL.map(([k, n]) => socialLink(k, n, false)).join('')}</span>` : '';
  }
  function followCard() {
    return socialOn() ? `<div class="follow"><p class="kicker">Segueix el repte cada dia</p>
      <div class="follow-row">${SOCIAL.map(([k, n]) => socialLink(k, n, true)).join('')}</div></div>` : '';
  }
  function aboutLink() {
    return `<p class="about-links"><button type="button" class="btn-text about-link" data-go="sobre">Contacte · Envia'm una idea</button> · ${privacyLink()}${socialIcons()}</p>`;
  }

  function screenSobre() {
    const on = !!C.contactEmail;
    return `<section class="screen sobre">
      ${header()}
      <h1 class="title">Contacte</h1>
      <div class="card about-card">
        <p class="about-hi">Hola! Em dic <b class="gold">Kiku</b> i sóc mestre de primària.</p>
        <p><b class="chalk">COMBINA ≈</b> va néixer a l'aula: volia que practicar la jerarquia d'operacions i el càlcul fos un joc d'escalfament diari i no una fitxa més. Ara hi podeu jugar alumnes, famílies, docents i altres curiosos.</p>
        <p class="muted">És gratuït, sense anuncis i sense galetes de seguiment (${privacyLink('com tractem les dades')}). El faig a estones, i cada comentari m'ajuda a millorar-lo. <b class="chalk">T'hi animes?</b></p>
      </div>
      <section class="card contact-card" aria-label="Formulari de contacte">
        <p class="kicker gold">Escriu-me</p>
        <p class="small muted">Una idea, un error, una proposta per fer-lo servir a classe… Ho llegeixo tot.</p>
        ${on ? `<form id="contact" class="contact-form" novalidate onsubmit="return false">
          <label class="field"><span class="kicker">De què es tracta?</span>
            <select name="tipus"><option>Idea de millora</option><option>He trobat un error</option><option>L'utilitzo a l'aula</option><option>Altres</option></select></label>
          <label class="field"><span class="kicker">Missatge</span>
            <textarea name="missatge" rows="5" maxlength="3000" required placeholder="Escriu aquí…"></textarea></label>
          <button type="button" class="btn btn-primary" data-action="contact-send">Obre el correu per enviar-lo</button>
          <p class="muted small">S'obrirà la teva aplicació de correu amb el missatge preparat, per a <b class="chalk">${esc(C.contactEmail)}</b>. Si tens menys de ${MIN_AGE} anys, demana a un adult que l'enviï per tu.</p>
          <p class="muted small" id="contact-status" role="status"></p>
        </form>` : '<p class="muted small">El formulari de contacte encara no està configurat.</p>'}
      </section>
      ${followCard()}
      <button type="button" class="btn-text" data-go="avui">Torna al repte d'avui</button>
    </section>`;
  }

  // Sense serveis externs: obre l'aplicació de correu de qui escriu amb el missatge preparat
  function sendContact() {
    const f = document.getElementById('contact'), out = document.getElementById('contact-status');
    if (!f || !C.contactEmail) return;
    const v = n => (f.elements[n] ? f.elements[n].value : '').trim();
    if (v('_honey')) return;
    if (v('missatge').length < 3) { out.textContent = 'Escriu el missatge abans d’enviar-lo.'; return; }
    const subject = 'combina ≈ · ' + v('tipus');
    const body = v('missatge') + '\n\n— Repte nº ' + state.puzzle.number;
    track('contacte_obert', 'Missatge de contacte');
    location.href = 'mailto:' + C.contactEmail + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    out.textContent = 'Si no s’ha obert cap aplicació, escriu directament a ' + C.contactEmail + '.';
  }

  /* ================= Pantalla: vitrina ================= */
  function screenVitrina() {
    const rc = rankCounts();
    const got = ACH.filter(a => store.ach[a.id]).length;
    const medals = SV.list.map(s => `<div class="coll${rc[s.key] ? '' : ' none'}" title="${s.name}: ${rc[s.key]} ${rc[s.key] === 1 ? 'dia' : 'dies'}">
        ${SV.medal(s.key, 64, { dim: !rc[s.key] })}<b>×${rc[s.key]}</b><small>${s.name}</small></div>`).join('');
    const fresh = state.newSeals || [];
    // Els nous primer, perquè l'estampada es vegi sense haver de baixar
    const order = ACH.slice().sort((a, b) => (fresh.indexOf(b.id) >= 0) - (fresh.indexOf(a.id) >= 0));
    let nk = 0;
    const seals = order.map(a => {
      const on = !!store.ach[a.id], isNew = fresh.indexOf(a.id) >= 0;
      return `<li class="seal-item${on ? ' on' : ''}${isNew ? ' new' : ''}"${isNew ? ` style="--d:${(0.25 + 0.35 * nk++).toFixed(2)}s"` : ''}><span class="seal${on ? ' on' : ''}${isNew ? ' stamp' : ''}"><b>${esc(a.g)}</b></span>
        <span><strong>${esc(a.name)}${isNew ? ' <em class="new-tag">Nou</em>' : ''}</strong><small>${esc(a.desc)}</small></span></li>`;
    }).join('');
    const played = Object.keys(store.days).filter(k => store.days[k].finished).length;
    return `<section class="screen vitrina">
      ${header()}
      <p class="kicker">La teva col·lecció</p>
      <h1 class="title">Vitrina</h1>
      <div class="vitrina-grid">
        <div class="v-col">
          ${statsCard()}
          ${progressCard()}
          ${streakCard(false)}
          ${installBtn()}
          <section class="card coll-card" aria-label="Medalles aconseguides">
            <div class="coll-head"><p class="kicker">Medalles</p><p class="muted small">${played} ${played === 1 ? 'repte completat' : 'reptes completats'} · millor ratxa ${store.bestStreak}</p></div>
            <div class="coll-row">${medals}</div>
          </section>
        </div>
        <section class="card seals-card" aria-label="Segells">
          <div class="coll-head"><p class="kicker">Segells</p><p class="muted small"><b class="chalk">${got}</b> de ${ACH.length}${fresh.length ? ` · <b class="gold">${fresh.length} ${fresh.length === 1 ? 'nou' : 'nous'}</b>` : ''}</p></div>
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
      const nf = friendUids().length;
      const seg = (id, label) => `<button type="button" class="${state.rankScope === id ? 'on' : ''}" data-scope="${id}" aria-pressed="${state.rankScope === id}">${label}</button>`;
      body = `<div class="scope">
          <div class="seg" role="group" aria-label="Qui surt al rànquing">${seg('all', 'Tothom')}${seg('friends', 'Amics' + (nf ? ' · ' + nf : ''))}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-action="challenge">${ICON.share}Comparteix el teu resultat!</button>
        </div>
        ${saveCard('Inicia sessió amb Google per aparèixer al rànquing i no perdre el teu progrés.')}
        ${state.rankTab === 'day' ? statsSlot() : ''}
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

  // Amics: qui t'ha enviat un enllaç de repte (i tu mateix, si has iniciat la sessió)
  function friendUids() {
    const me = B.user && B.user.uid;
    return Object.keys(store.friends).filter(u => u !== me);
  }

  function loadRanking() {
    if (!B.enabled) return;
    const tab = state.rankTab, scope = state.rankScope;
    let uids;
    if (scope === 'friends') {
      uids = friendUids();
      if (!uids.length) {
        const box = document.getElementById('rank-body');
        if (box) box.innerHTML = `<div class="card notice center-notice"><p><b>Encara no tens amics al rànquing.</b></p>
          <p class="muted small">Envia el teu enllaç de repte: quan un amic l'obri, us podreu comparar aquí. Demana-li que te n'enviï un a tu també!</p>
          <button type="button" class="btn btn-primary btn-sm" data-action="challenge">${ICON.share}Comparteix el teu resultat!</button></div>`;
        return;
      }
      if (B.user) uids = uids.concat(B.user.uid);
    }
    let p;
    if (tab === 'day') p = B.day(state.dayKey, uids);
    else if (tab === 'week') p = B.week(Array.from({ length: 7 }, (_, i) => P.addDays(state.dayKey, -i)), uids);
    else p = B.total(uids);
    p.then(rows => {
      if (state.screen !== 'ranquing' || state.rankTab !== tab || state.rankScope !== scope) return;
      const box = document.getElementById('rank-body');
      if (box) box.innerHTML = rankHTML(rows, tab);
    }).catch(err => {
      const box = document.getElementById('rank-body');
      if (box) box.innerHTML = `<p class="muted center pad">No s'ha pogut carregar el rànquing (${esc(err.message)}).</p>`;
    });
  }

  function rankHTML(rows, tab) {
    if (!rows.length) return state.rankScope === 'friends'
      ? '<p class="muted center pad">Els teus amics encara no hi tenen cap puntuació.</p>'
      : '<p class="muted center pad">Encara no hi ha cap puntuació. Sigues el primer!</p>';
    let dist = '';
    if (tab === 'day') {
      const counts = SV.list.map(s => rows.filter(r => SV.rankFor(r.total).key === s.key).length);
      const max = Math.max.apply(null, counts) || 1;
      dist = '<div class="dist" aria-label="Distribució de rangs">' + SV.list.map((s, i) =>
        `<div><small>${Math.round(counts[i] / rows.length * 100)}%</small><i style="height:${Math.max(4, counts[i] / max * 56)}px;background:${s.color}"></i><small>${s.name}</small></div>`).join('') + '</div>';
    }
    const me = B.user && B.user.uid;
    const list = rows.slice(0, 100).map((r, i) => {
      const s = tab === 'day' ? SV.rankFor(r.total) : null;
      const ring = s ? `border-color:${s.color};box-shadow:0 0 10px rgba(${s.rgb},.35)` : '';
      const sub = tab === 'day' ? `${s.name} · ${r.exact || 0} exactes` : `${r.days || 0} ${r.days === 1 ? 'dia' : 'dies'}`;
      return `<li class="rank-row${r.uid === me ? ' me' : ''}">
        <span class="pos">${i + 1}</span>
        ${ringHTML(r.name, r.avatar, '', ring)}
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

  /* ================= Mode aula: sense temps, sense rànquing ================= */
  // timed = repte anterior amb rellotge (pantalla «Reptes anteriors»); sense = mode aula
  function startPractice(key, label, timed) {
    if (!state.practice) state.savedPuzzle = state.puzzle;
    const pz = puzzleFor(key);
    state.practice = { key, label, timed: !!timed, puzzle: pz, day: { levels: [], total: 0 } };
    state.puzzle = pz;
  }
  function exitPractice() {
    if (!state.practice) return;
    state.practice = null;
    state.puzzle = state.savedPuzzle || puzzleFor(state.dayKey);
    state.savedPuzzle = null;
  }
  function randomPractice() {
    startPractice('aula-' + Math.random().toString(36).slice(2, 9), 'Repte aleatori');
    track('mode_aula', 'Mode aula');
  }

  function untimed() { return !!state.practice && !state.practice.timed; }
  function archive() { return !!state.practice && !!state.practice.timed; }

  /* ================= Reptes anteriors: amb rellotge, sense rànquing ni ratxa =================
   * Es guarda només el primer resultat de cada dia, i mai si aquell dia ja es va jugar de veritat. */
  function pastKeys() {
    const out = [];
    for (let k = P.addDays(state.dayKey, -1), i = 0; k >= C.startDate && i < 90; k = P.addDays(k, -1), i++) out.push(k);
    return out;
  }
  function pastScore(k) {
    if (isDone(k)) return { pts: store.days[k].total, how: 'el mateix dia' };
    if (k in store.arxiu) return { pts: store.arxiu[k], how: 'després' };
    return null;
  }
  function playArchive(k) {
    if (!(k < state.dayKey) || k < C.startDate) return;
    startPractice(k, 'Repte nº ' + P.challengeNumber(k) + ' · ' + P.prettyDay(k), true);
    track('arxiu-comencat', 'Repte anterior començat');
    play();
  }
  function archiveFinished(d) {
    const k = state.practice.key;
    state.practice.first = !isDone(k) && !(k in store.arxiu);
    if (state.practice.first) { store.arxiu[k] = d.total; save(); }
    track('arxiu-acabat', 'Repte anterior acabat');
  }
  function archiveNote() {
    const k = state.practice.key, sc = pastScore(k);
    const msg = state.practice.first ? 'Desat a «Reptes anteriors». No compta per al rànquing ni per a la ratxa.'
      : sc ? `Aquest intent no es desa: el teu resultat d’aquest repte continua sent <b class="chalk">${sc.pts}</b> (jugat ${sc.how}).` : '';
    return msg ? `<p class="muted small center">${msg}</p>` : '';
  }
  function arxiuButton(label) {
    const keys = pastKeys();
    if (!keys.length) return '';
    const pending = keys.filter(k => !pastScore(k)).length;
    return `<button type="button" class="btn btn-arxiu btn-split" data-go="arxiu"><span>${label}</span><span class="btn-meta">${pending ? `<b class="arxiu-n" title="${pending} per jugar">${pending}</b>` : ''}→</span></button>`;
  }
  function screenArxiu() {
    trackOnce('arxiu-obert', 'Reptes anteriors obert');
    const keys = pastKeys();
    const rows = keys.map(k => {
      const sc = pastScore(k);
      const right = sc ? `<b class="${sc.pts >= 400 ? 'gold' : ''}">${sc.pts}</b>` : '<span class="gold">Juga →</span>';
      return `<li><button type="button" class="lvl-row aula-row arxiu-row" data-action="arxiu-play" data-day="${k}">
        <span>Nº ${P.challengeNumber(k)}</span><span class="muted small">${esc(P.prettyDay(k))}${sc ? ' · ' + sc.how : ''}</span><span class="lvl-right">${right}</span></button></li>`;
    }).join('');
    const pending = keys.filter(k => !pastScore(k)).length;
    return `<section class="screen arxiu">
      ${header()}
      <p class="kicker">${pending ? (pending === 1 ? 'Te n’has perdut 1' : 'Te n’has perdut ' + pending) : 'Els tens tots fets'}</p>
      <h1 class="title">Reptes anteriors</h1>
      <p class="lead">Juga els dies que t’has perdut, amb el mateix rellotge que el repte diari. No compten per al rànquing ni per a la ratxa, i de cada dia es guarda només el primer resultat.</p>
      ${rows ? `<ol class="card lvl-list aula-list">${rows}</ol>` : '<p class="muted center">Encara no hi ha reptes anteriors: torna demà!</p>'}
      <button type="button" class="btn-text" data-go="avui">Torna al repte d'avui</button>
    </section>`;
  }

  function screenAula() {
    if (!state.practice) randomPractice();
    const pr = state.practice, pz = pr.puzzle, d = pr.day;
    const rows = pz.levels.map((L, i) => {
      const st = d.levels[i];
      const right = st && st.done ? `<b class="${st.exact ? 'gold' : ''}">${st.points}</b>` : '<span class="muted">→</span>';
      return `<li><button type="button" class="lvl-row aula-row" data-action="aula-level" data-level="${i}">
        <span>Nivell ${i + 1}</span><span class="muted small">${L.count} xifres</span><span class="lvl-right">${right}</span></button></li>`;
    }).join('');
    return `<section class="screen aula">
      ${header()}
      <p class="kicker">Mode aula · sense temps</p>
      <h1 class="title">Pràctica</h1>
      <p class="lead">Reptes nous cada cop que els generes, sense rellotge i sense comptar per al rànquing ni per a la ratxa. Ideal per projectar a classe o practicar tant com vulguis.</p>
      <div class="calc-toggle" role="radiogroup" aria-label="Calculadora">
        <button type="button" role="radio" aria-checked="${store.calc !== false}" class="calc-opt${store.calc !== false ? ' on' : ''}" data-action="calc" data-calc="1">
          <b class="calc-g">= 24</b><strong>Amb calculadora</strong><small>Veus el resultat i els punts mentre escrius.</small></button>
        <button type="button" role="radio" aria-checked="${store.calc === false}" class="calc-opt${store.calc === false ? ' on' : ''}" data-action="calc" data-calc="0">
          <b class="calc-g">= ?</b><strong>Sense calculadora</strong><small>Càlcul mental: el resultat surt en validar.</small></button>
      </div>
      <p class="kicker gold">${esc(pr.label)}</p>
      <ol class="card lvl-list aula-list">${rows}</ol>
      <button type="button" class="btn btn-primary" data-action="aula-new">Genera un repte nou</button>
      <button type="button" class="btn-text" data-go="avui">Torna al repte d'avui</button>
    </section>`;
  }

  const SCREENS = { arxiu: screenArxiu, desglos: screenDesglos, sobre: screenSobre, aula: screenAula, entrada: screenEntrada, tutorial: screenTutorial, avui: screenAvui, joc: screenJoc, correccio: screenCorreccio, resultat: screenResultat, ranquing: screenRanquing, savis: screenSavis, vitrina: screenVitrina };

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
    const played = Object.keys(store.days).filter(k => store.days[k].finished).length;
    const stats = `<p class="muted small">Dies completats: <b class="chalk">${played}</b> · Ratxa: <b class="chalk">${streak()}</b> · Segells: <b class="chalk">${ACH.filter(a => store.ach[a.id]).length}/${ACH.length}</b></p>`;
    const me = B.user;
    if (me) {
      const av = parseAv(me.avatar) || { gi: 0, ci: 4 };
      state.pf = { gi: av.gi, ci: av.ci };
      html += `<div class="prof-head"><span id="pf-prev"></span><div><b id="pf-show">${esc(me.name)}</b><small>Així et veuran al rànquing</small></div></div>
        <label class="field"><span class="kicker">Nom públic</span>
          <input id="pf-name" type="text" maxlength="20" autocomplete="nickname" spellcheck="false" value="${esc(me.name)}">
          <small class="muted">És un àlies: no hi posis el teu nom complet.</small></label>
        <div class="field"><span class="kicker">Avatar</span>
          <div class="av-grid">${AV_GLYPHS.map((g, k) => `<button type="button" data-av-g="${k}" aria-label="Símbol ${g}">${g}</button>`).join('')}</div>
          <div class="av-colors">${SV.list.map((s, k) => `<button type="button" data-av-c="${k}" style="background:${s.color}" aria-label="Color ${s.colorName}"></button>`).join('')}</div>
        </div>
        <button type="button" class="btn btn-primary" data-action="profile-save">Desa el perfil</button>
        <button type="button" class="btn btn-ghost" data-action="challenge">${ICON.share}Comparteix el teu resultat!</button>
        ${stats}
        ${me.anon ? `<p class="muted small">Jugues com a convidat: la ratxa i els segells només es guarden en aquest navegador.</p>
          <button type="button" class="btn btn-ghost" data-action="signin">${ICON.google}Guarda-ho tot amb Google</button>`
          : '<button type="button" class="btn-text" data-action="signout">Tanca la sessió</button>'}
        <button type="button" class="btn-text danger" data-action="delete-account">Esborra el meu compte i les meves dades</button>
        ${aboutLink()}`;
      openModal(html);
      paintProfile();
      return;
    }
    if (B.enabled && store.age === 'minor') {
      html += `<p class="lead">Jugues sense compte: el teu progrés es guarda en aquest dispositiu. Els comptes i el rànquing públic són per a jugadors de ${MIN_AGE} anys o més.</p>`;
    } else if (B.enabled) {
      html += `<p class="lead">Ara jugues com a convidat: el progrés només es guarda en aquest navegador. Acaba el repte d'avui i tria un àlies per sortir al rànquing, o inicia sessió amb Google per no perdre’l mai.</p>
        <button type="button" class="btn btn-primary" data-action="signin">${ICON.google}Continua amb Google</button>`;
    } else {
      html += '<p class="lead">Mode local: les partides es guarden en aquest dispositiu. El rànquing compartit s’activa quan es configura Firebase.</p>';
    }
    openModal(html + stats + aboutLink());
  }

  // Previsualització en directe de l'avatar i el nom
  function paintProfile() {
    const prev = document.getElementById('pf-prev'), inp = document.getElementById('pf-name');
    if (!prev || !state.pf) return;
    const name = inp ? inp.value.trim() : '';
    prev.innerHTML = ringHTML(name, state.pf.gi + '.' + state.pf.ci, 'lg');
    const show = document.getElementById('pf-show');
    if (show) show.textContent = name || '—';
    modalEl.querySelectorAll('[data-av-g]').forEach(b => b.classList.toggle('on', +b.dataset.avG === state.pf.gi));
    modalEl.querySelectorAll('[data-av-c]').forEach(b => b.classList.toggle('on', +b.dataset.avC === state.pf.ci));
  }

  function saveProfile() {
    const inp = document.getElementById('pf-name');
    const name = (inp ? inp.value : '').replace(/\s+/g, ' ').trim();
    const err = aliasError(name);
    if (err) return toast(err);
    const btn = modalEl.querySelector('[data-action="profile-save"]');
    if (btn) btn.disabled = true;
    B.saveProfile(name, state.pf.gi + '.' + state.pf.ci, state.dayKey).then(() => {
      closeModal(); toast('Perfil desat'); render();
    }).catch(e => { if (btn) btn.disabled = false; toast('No s’ha pogut desar el perfil: ' + (e.message || e)); });
  }

  modalEl.addEventListener('click', e => {
    const g = e.target.closest('[data-av-g]'), c = e.target.closest('[data-av-c]');
    if (!state.pf || (!g && !c)) return;
    if (g) state.pf.gi = +g.dataset.avG;
    if (c) state.pf.ci = +c.dataset.avC;
    paintProfile();
  });
  document.addEventListener('keydown', e => { if (e.target && e.target.classList && e.target.classList.contains('guest-name') && e.key === 'Enter') { e.preventDefault(); guestJoin(e.target.parentNode.querySelector('[data-action="guest-join"]')); } });
  modalEl.addEventListener('input', e => { if (e.target.id === 'pf-name') paintProfile(); });
  modalEl.addEventListener('keydown', e => { if (e.target.id === 'pf-name' && e.key === 'Enter') { e.preventDefault(); saveProfile(); } });

  /* ================= Instal·lar l'app (PWA) ================= */
  let installEvt = null;
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); installEvt = e;
    if (state.screen === 'resultat' || state.screen === 'vitrina') render();
  });
  window.addEventListener('appinstalled', () => { installEvt = null; track('pwa_installada', 'App instal·lada'); });
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  function installBtn() {
    if (isStandalone() || (!installEvt && !isIOS)) return '';
    return `<button type="button" class="btn btn-ghost btn-install" data-action="install">${ICON.phone}Afegeix a la pantalla d’inici</button>`;
  }
  function install() {
    if (installEvt) {
      installEvt.prompt();
      installEvt.userChoice.then(c => { if (c && c.outcome === 'accepted') track('pwa_installada', 'App instal·lada'); installEvt = null; render(); });
    } else {
      openModal(`<h2 class="title sm">Afegeix combina ≈ a l'iPhone</h2>
        <ol class="ios-steps">
          <li>Toca el botó <b>Comparteix</b> ${ICON.share} de Safari (a baix de tot).</li>
          <li>Tria <b>«Afegeix a la pantalla d'inici»</b>.</li>
          <li>Toca <b>Afegeix</b>. Ja tindràs el repte diari a un toc!</li>
        </ol>`);
    }
  }

  /* ================= Estadístiques ================= */
  function stats() {
    const played = Object.keys(store.days).filter(k => store.days[k].finished);
    const totals = played.map(k => store.days[k].total);
    const gauss = totals.filter(t => SV.rankFor(t).key === 'gauss').length;
    return {
      played: played.length,
      best: totals.length ? Math.max.apply(null, totals) : 0,
      avg: totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : 0,
      gaussPct: totals.length ? Math.round(gauss / totals.length * 100) : 0,
      streak: streak(), bestStreak: Math.max(store.bestStreak, streak())
    };
  }
  function statsCard() {
    const s = stats();
    const cell = (label, v) => `<div class="stat-cell"><b>${v}</b><span>${label}</span></div>`;
    return `<section class="card stats-card" aria-label="Estadístiques">
      <p class="streak-line">Ratxa actual: <b>${s.streak} ${s.streak === 1 ? 'dia' : 'dies'}</b> 🔥</p>
      <div class="stat-grid">
        ${cell('Reptes jugats', s.played)}${cell('Millor puntuació', s.best || '—')}
        ${cell('Mitjana', s.played ? s.avg : '—')}${cell('Rang Gauss', s.played ? s.gaussPct + ' %' : '—')}
        ${cell('Millor ratxa', s.bestStreak)}${cell('Segells', ACH.filter(a => store.ach[a.id]).length + '/' + ACH.length)}
      </div>
      ${online() && !state.user ? '<p class="muted small">Ara només es guarden en aquest navegador. <button type="button" class="btn-text inline" data-action="signin">Sincronitza-les amb Google</button></p>' : ''}
    </section>`;
  }

  /* Evolució: línia de les últimes partides sobre les franges dels cinc savis */
  function progressCard() {
    const keys = Object.keys(store.days).filter(k => store.days[k].finished && /^\d{4}-\d{2}-\d{2}$/.test(k)).sort().slice(-20);
    const head = `<div class="coll-head"><p class="kicker">Evolució</p><p class="muted small">${keys.length > 1 ? 'Últimes ' + keys.length + ' partides' : ''}</p></div>`;
    if (keys.length < 2) {
      return `<section class="card prog-card" aria-label="Evolució de les puntuacions">${head}
        <p class="muted small">${keys.length ? 'Juga un altre dia i aquí veuràs com evoluciona la teva puntuació.' : 'Quan hagis jugat uns quants dies, aquí veuràs la teva evolució.'}</p></section>`;
    }
    const MAX = maxTotal(), W = 320, H = 160, L = 8, R = 72, T = 8, Bm = 22;
    const pw = W - L - R, ph = H - T - Bm;
    const x = i => L + i * pw / (keys.length - 1);
    const y = v => T + ph - Math.max(0, Math.min(MAX, v)) / MAX * ph;
    const bands = SV.list.map(s => {
      const lo = Math.max(0, s.min - (s.min ? 1 : 0)), hi = Math.min(MAX, s.max);
      return `<rect x="${L}" y="${y(hi).toFixed(1)}" width="${pw}" height="${(y(lo) - y(hi)).toFixed(1)}" fill="${s.color}" fill-opacity=".07"/>
        <line x1="${L}" x2="${L + pw}" y1="${y(hi).toFixed(1)}" y2="${y(hi).toFixed(1)}" stroke="${s.color}" stroke-opacity=".18" stroke-width=".6"/>
        <text x="${L + pw + 8}" y="${((y(lo) + y(hi)) / 2 + 3.5).toFixed(1)}" fill="${s.color}" fill-opacity=".85" font-size="10">${s.name}</text>`;
    }).join('');
    const vals = keys.map(k => store.days[k].total);
    const pts = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1));
    const area = `M${x(0).toFixed(1)},${(T + ph).toFixed(1)} L${pts.join(' L')} L${x(vals.length - 1).toFixed(1)},${(T + ph).toFixed(1)} Z`;
    const dots = vals.map((v, i) => {
      const r = SV.rankFor(v), last = i === vals.length - 1;
      return `<circle class="pc-dot" style="--d:${(0.15 + i * 0.9 / vals.length).toFixed(2)}s" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${last ? 4.5 : 2.8}" fill="${last ? r.color : '#0B0E12'}" stroke="${r.color}" stroke-width="1.6"><title>${P.prettyDay(keys[i])}: ${v} punts · ${r.name}</title></circle>`;
    }).join('');
    const lv = vals[vals.length - 1], lx = x(vals.length - 1), ly = y(lv);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const prev = vals.slice(0, -1), diff = Math.round(lv - prev.reduce((a, b) => a + b, 0) / prev.length);
    const trend = diff > 0 ? `<b class="gold">+${diff}</b> respecte a la teva mitjana anterior` : diff < 0 ? `<b class="chalk">${diff}</b> respecte a la teva mitjana anterior` : 'igual que la teva mitjana anterior';
    const svg = `<svg class="prog-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Puntuacions de les últimes ${vals.length} partides. Última: ${lv}. Mitjana: ${avg}.">
        <defs><linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#E6B85C" stop-opacity=".28"/><stop offset="1" stop-color="#E6B85C" stop-opacity="0"/></linearGradient></defs>
        ${bands}
        <line x1="${L}" x2="${L + pw}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" stroke="#ECE8DF" stroke-opacity=".35" stroke-width=".8" stroke-dasharray="3 3"/>
        <path class="pc-area" d="${area}" fill="url(#pc-fill)"/>
        <polyline class="pc-line" points="${pts.join(' ')}" pathLength="1" fill="none" stroke="#E6B85C" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
        <text class="pc-last" x="${(lx + 3).toFixed(1)}" y="${(ly - 10).toFixed(1)}" text-anchor="end" fill="#ECE8DF" stroke="#0B0E12" stroke-width="4" paint-order="stroke" font-size="11" font-weight="600">${lv}</text>
        <text x="${L}" y="${H - 6}" fill="#7D8693" font-size="9.5">${P.shortDay(keys[0])} ${+keys[0].slice(8)}</text>
        <text x="${L + pw}" y="${H - 6}" fill="#7D8693" font-size="9.5" text-anchor="end">${P.shortDay(keys[keys.length - 1])} ${+keys[keys.length - 1].slice(8)}</text>
      </svg>`;
    return `<section class="card prog-card" aria-label="Evolució de les puntuacions">${head}${svg}
      <p class="muted small">Última partida: ${trend} · <span class="pc-avg" aria-hidden="true"></span> mitjana ${avg}</p></section>`;
  }

  // Expressió en text pla (p. ex. «(3 + 4) × 2»)
  function exprText(tokens) {
    return (tokens || []).map(t => t.t === 'num' ? String(t.v) : t.t === 'op' ? ({ '*': '×', '/': '÷', '-': '−' }[t.v] || t.v)
      : t.t === 'sqrt' ? '√' : t.t).join(' ').slice(0, 160);
  }

  /* ================= Accions ================= */
  function submitDay() {
    const d = day();
    if (!d.finished || d.submitted || !B.enabled || !B.user) return;
    B.submitDay(state.dayKey, {
      total: totalOf(d), exact: exactOf(d),
      levels: state.puzzle.levels.map((_, i) => (d.levels[i] ? d.levels[i].points : 0)),
      // Expressions enviades, per poder-les revisar (i, en un futur, recalcular-les al servidor)
      exprs: state.puzzle.levels.map((_, i) => exprText(d.levels[i] && d.levels[i].tokens))
    }).then(() => { d.submitted = true; save(); }).catch(e => console.warn('No s’ha pogut desar la puntuació', e));
  }

  function nextLevel() {
    const d = day();
    return state.puzzle.levels.findIndex((_, i) => !(d.levels[i] && d.levels[i].done));
  }
  function play() {
    const next = nextLevel();
    if (next < 0) return go('resultat');
    const st = day().levels[next];
    // Un nivell que ja corre (el rellotge no s'atura) es reprèn sense compte enrere
    if (untimed() || (st && st.startAt)) return beginLevel(next);
    countdown(() => { const n = nextLevel(); if (n < 0) go('resultat'); else beginLevel(n); });
  }

  /* ================= Compte enrere: «Prepara’t, 3, 2, 1» =================
   * Els cinc savis orbiten com electrons, cadascun en un pla inclinat diferent,
   * a la mateixa velocitat; per davant passen per sobre dels números. */
  let cdBusy = false;
  function countdown(done) {
    if (cdBusy) return;
    cdBusy = true;
    const steps = ['Prepara’t', '3', '2', '1'];
    const STEP = reduceMotion ? 650 : 1000, T = STEP * steps.length;
    const vw = window.innerWidth, vh = window.innerHeight, m = Math.min(vw, vh);
    const base = Math.max(38, Math.min(62, m * 0.12));
    // Mida segons la importància del savi: de Pitàgores (el més petit) a Gauss (el més gran), amb subtilesa
    const SIZE = [0.84, 0.92, 1, 1.08, 1.16];
    // Òrbites: radi (fracció), inclinació i angle del node, totes diferents; sentits alterns
    const ORB = [[0.40, 74, 0], [0.33, 62, 37], [0.45, 80, 73], [0.29, 56, 112], [0.37, 69, 148]];
    const W = 2.4; // velocitat angular (rad/s), constant i igual per a tots
    const orbs = SV.list.slice(0, 5).map((s, k) => {
      const [f, inc, node] = ORB[k];
      return { s, R: m * f, inc: inc * Math.PI / 180, node: node * Math.PI / 180, nodeDeg: node,
        size: Math.round(base * SIZE[k]), ph: k * 1.37 + Math.random() * 0.6, dir: k % 2 ? -1 : 1 };
    });
    const el = document.createElement('div');
    el.className = 'cd';
    el.innerHTML = `<svg class="cd-orbits" width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}" aria-hidden="true">${orbs.map(o =>
        `<ellipse cx="${vw / 2}" cy="${vh / 2}" rx="${o.R.toFixed(1)}" ry="${(o.R * Math.cos(o.inc)).toFixed(1)}" transform="rotate(${o.nodeDeg} ${vw / 2} ${vh / 2})" fill="none" stroke="${o.s.color}"/>`).join('')}</svg>
      ${orbs.map(o => `<div class="cd-sat" aria-hidden="true">${SV.medal(o.s.key, o.size)}</div>`).join('')}
      <div class="cd-num-wrap"><div class="cd-num" role="status" aria-live="assertive"></div></div>`;
    document.body.appendChild(el);
    document.body.classList.add('cd-on');
    const sats = el.querySelectorAll('.cd-sat'), num = el.querySelector('.cd-num');
    const cx = vw / 2, cy = vh / 2;
    let elapsed = 0, last = performance.now(), shown = -1, ended = false;

    const frame = now => {
      // Si la pestanya s'amaga (salt gran), el compte enrere s'atura en lloc de saltar-se;
      // en un mòbil lent (pocs fotogrames) el temps real es respecta igualment
      const gap = Math.max(0, now - last), dt = gap > 300 ? 16 : gap;
      elapsed += dt; last = now;
      const k = Math.min(1, elapsed / T);
      const idx = Math.min(steps.length - 1, Math.floor(elapsed / STEP));
      if (idx !== shown) {
        shown = idx;
        num.textContent = steps[idx];
        num.className = 'cd-num' + (idx === 0 ? ' word' : '') + (idx === steps.length - 1 ? ' last' : '');
        void num.offsetWidth; num.classList.add('in');
        sfx('count', idx);
      }
      if (!reduceMotion) {
        // Òrbita serena: tots a la mateixa velocitat, sense acceleració
        orbs.forEach((o, i) => {
          o.ph += o.dir * W * dt / 1000;
          const x0 = o.R * Math.cos(o.ph), y0 = o.R * Math.sin(o.ph);
          const y1 = y0 * Math.cos(o.inc), z = y0 * Math.sin(o.inc);
          const x = x0 * Math.cos(o.node) - y1 * Math.sin(o.node), y = x0 * Math.sin(o.node) + y1 * Math.cos(o.node);
          const sc = 1 + 0.32 * z / o.R;
          const sat = sats[i], half = o.size / 2;
          sat.style.transform = `translate(${(cx + x - half).toFixed(1)}px, ${(cy + y - half).toFixed(1)}px) scale(${sc.toFixed(3)})`;
          // Per davant (z > 0) passen també per sobre dels números
          sat.style.zIndex = z < 0 ? 1 : 3;
          sat.style.opacity = (0.55 + 0.45 * (sc - 0.68) / 0.64).toFixed(3);
        });
      }
      if (k < 1) return requestAnimationFrame(frame);
      if (ended) return;
      ended = true;
      sfx('count', -1);
      document.body.classList.remove('cd-on');
      cdBusy = false;
      done();
      el.classList.add('out');
      setTimeout(() => el.remove(), 380);
    };
    requestAnimationFrame(frame);
  }

  function openTutorial() {
    state.tut = { tokens: [], startAt: 1, done: false };
    state.tutStep = 0;
    state.tutResult = null;
    go('tutorial');
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-go],[data-action],[data-tile],[data-key],[data-tab],[data-scope]');
    if (!t || t.disabled) return;
    if (t.dataset.go) {
      closeModal();
      if (t.dataset.go === 'tutorial') return openTutorial();
      return go(t.dataset.go);
    }
    if (t.dataset.tile != null) return pressTile(+t.dataset.tile);
    if (t.dataset.key) return press(t.dataset.key);
    if (t.dataset.tab) { state.rankTab = t.dataset.tab; return render(); }
    if (t.dataset.scope) { state.rankScope = t.dataset.scope; return render(); }
    switch (t.dataset.action) {
      case 'aula-level': beginLevel(+t.dataset.level); break;
      case 'aula-new': randomPractice(); render(); break;
      case 'arxiu-play': playArchive(t.dataset.day); break;
      case 'calc': store.calc = t.dataset.calc === '1'; save(); track(store.calc ? 'aula_amb_calculadora' : 'aula_sense_calculadora', 'Calculadora aula'); render(); break;
      case 'install': install(); break;
      case 'challenge': challenge(); break;
      case 'profile-save': saveProfile(); break;
      case 'guest-join': guestJoin(t); break;
      case 'guest': store.guest = true; save(); if (!store.seenHelp) openTutorial(); else go('avui'); break;
      case 'signin': closeModal(); withAge(signIn); break;
      case 'age': chooseAge(t.dataset.age); break;
      case 'delete-account': deleteModal(); break;
      case 'delete-confirm': confirmDelete(t); break;
      case 'signout': closeModal(); store.hadGoogle = false; save(); B.signOut(); break;
      case 'play': play(); break;
      case 'start': startLevel(); break;
      case 'next': beginLevel(state.level + 1); break;
      case 'replay': render(); break;
      case 'pause': state.flash++; go('avui'); break;
      case 'contact-send': sendContact(); break;
      case 'share': shareResult(); break;
      case 'copy-msg': copyMessage().then(ok => { t.textContent = ok ? 'Missatge copiat ✓' : 'No s’ha pogut copiar'; }); break;
      case 'card-download': cardDownload(); break;
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
      if (state.practice) {
        // A l'aula no interrompem la classe: el repte nou s'agafa en sortir
        state.dayKey = k; state.savedPuzzle = puzzleFor(k); applyFreezes();
      } else if (!playing) {
        state.dayKey = k;
        state.puzzle = puzzleFor(k);
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
        if (remaining(st, i) <= 0) { finishLevel(true, true); return; }
        return go('joc');
      }
    }
    go('avui');
  }

  // Sense portada: qui no ha jugat mai entra directament al tutorial (que ja és jugar)
  function firstScreen() {
    if (!store.seenHelp) { store.guest = true; save(); track('tutorial-obert', 'Tutorial obert'); return openTutorial(); }
    resumeOrHome();
  }

  applyFreezes();
  readChallenge();
  loadChallenger();

  let authSeen = false;
  B.onAuth(u => {
    if (B.enabled && !authSeen) {
      authSeen = true;
      if (!(u && !u.anon) && store.hadGoogle) trackOnce('sessio-google-perduda_' + envTag(), 'Sessió de Google perduda');
    }
    if (u && !u.anon && !store.hadGoogle) { store.hadGoogle = true; save(); }
    state.user = u && !u.anon ? u : null;
    state.anon = u && u.anon ? u : null;
    cloud.ready = false;
    if (u && u.anon) {
      // Convidat amb nom: puntua al rànquing; el progrés segueix només en aquest navegador
      if (store.friends[u.uid]) delete store.friends[u.uid];
      submitDay();
    } else if (u) {
      store.guest = true;
      if (store.friends[u.uid]) delete store.friends[u.uid];
      save();
      // Recupera el progrés desat al núvol i el combina amb el d'aquest navegador
      B.loadSave().then(r => {
        if (B.user !== u) return;
        mergeStore(r);
        cloud.ready = true;
        save(); pushCloud();
        submitDay();
        const st = day().levels[state.level];
        const playing = state.screen === 'joc' && st && st.startAt && !st.done;
        if (r && state.screen && state.screen !== 'entrada' && !playing) render();
      }).catch(e => { console.warn('No s’ha pogut llegir el progrés del núvol', e); submitDay(); });
    }
    if (u) setTimeout(askExistingConsent, 1500);
    if (!state.screen) firstScreen();
    else if (state.screen === 'entrada' && u) {
      if (!store.seenHelp) openTutorial(); else resumeOrHome();
    } else render();
  });
  if (B.enabled) {
    B.redirectResult().then(r => { if (r && r.user) track('google-ok_' + envTag(), 'Entrada amb Google'); }).catch(e => authFail('google', e));
    // Partides acabades que encara no s'han sumat al recompte (sense connexió, o d'abans d'existir-ne)
    setTimeout(() => { countStart(); countDay(); }, 3000);
    // Si Firebase tarda, no deixem la pantalla en blanc
    setTimeout(() => { if (!state.screen) firstScreen(); }, 2500);
  }
})();
