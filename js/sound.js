/* Efectes de so de «combina ≈», sintetitzats amb Web Audio (sense fitxers).
 * El context d'àudio s'activa amb el primer clic o tecla (norma dels navegadors). */
(function (global) {
  'use strict';

  var AC = global.AudioContext || global.webkitAudioContext;
  var ctx = null, master = null, lastTick = 0;
  var api = { on: true };

  function ensure() {
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function unlock() { ensure(); }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    global.addEventListener(ev, unlock, { capture: true, passive: true });
  });

  /* Una nota curta amb envolupant suau */
  function note(freq, at, dur, vol, type) {
    var c = ensure();
    if (!c || !api.on || c.state !== 'running') return;
    var t = c.currentTime + (at || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.5, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* Petit «tic» de comptador; f (0–1) fa pujar el to a mesura que s'omple */
  api.tick = function (f) {
    var now = global.performance ? performance.now() : Date.now();
    if (now - lastTick < 55) return;
    lastTick = now;
    var fr = 560 * Math.pow(2, Math.max(0, Math.min(1, f || 0)) * 1.25);
    note(fr, 0, 0.05, 0.28, 'triangle');
    note(fr * 2, 0, 0.03, 0.06, 'sine');
  };

  /* Pujada de rang (0 Pitàgores … 4 Gauss): dues notes que s'enfilen */
  var SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  api.rank = function (i) {
    var a = SCALE[Math.min(SCALE.length - 3, i + 1)];
    note(a, 0, 0.22, 0.4, 'sine');
    note(a * 1.5, 0.09, 0.32, 0.32, 'sine');
  };

  /* Ronda perfecta (100 punts): arpegi brillant */
  api.full = function () {
    [1046.5, 1318.51, 1567.98, 2093].forEach(function (f, k) {
      note(f, k * 0.07, 0.45, 0.3, 'sine');
      note(f * 2, k * 0.07, 0.2, 0.05, 'triangle');
    });
  };

  /* Fi del recompte: acord final, més ple com més alt és el rang */
  api.done = function (i) {
    var base = [261.63, 293.66, 329.63, 392, 440][Math.max(0, Math.min(4, i || 0))];
    var chord = i >= 4 ? [1, 1.25, 1.5, 2, 2.5] : i >= 2 ? [1, 1.25, 1.5, 2] : [1, 1.5, 2];
    chord.forEach(function (m, k) { note(base * m, k * 0.05, 1.1, 0.22, 'sine'); });
    if (i >= 4) [3, 4].forEach(function (m, k) { note(base * m, 0.35 + k * 0.1, 0.6, 0.08, 'triangle'); });
  };

  /* Punts d'una ronda que no arriben a 100: tancament suau */
  api.settle = function () { note(659.25, 0, 0.25, 0.25, 'sine'); note(987.77, 0.06, 0.3, 0.18, 'sine'); };

  global.Sound = api;
})(typeof window !== 'undefined' ? window : globalThis);
