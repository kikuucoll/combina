/* Configuració general de «combina ≈».
 * Per activar l'inici de sessió amb Google i el rànquing compartit,
 * omple `firebase` amb les dades del teu projecte (vegeu README.md). */
window.COMBINA_CONFIG = {
  // Dia del repte nº 1
  startDate: '2026-11-19',
  distMin: 20,                 // jugadors mínims del dia per mostrar la campana de Gauss al resultat
  // El repte canvia cada dia a aquesta hora (hora de Barcelona)
  timeZone: 'Europe/Madrid',
  resetHour: 9,
  // Segons per nivell (nivells 1 a 5)
  levelSeconds: [40, 50, 60, 60, 65],    // N2 a 50 s des del 25/11 (el 24/11 el 35 % s'hi quedava sense temps)
  // A partir d'aquest repte, nivells 1–3 més assequibles (objectius ≤12, 13–20, 21–35, 36–100, >100)
  curveFrom: '2026-11-21',
  // Xifres per nivell
  levelCounts: [4, 5, 6, 7, 8],
  // A partir d'aquest repte, el N1 sempre es pot fer sumant 2 o 3 xifres (primer contacte amable)
  easyN1From: '2026-11-27',
  // A partir d'aquest repte, el nivell 5 és més difícil: 6 xifres (1–20), objectiu 151–300,
  // la solució prevista combina + − × ÷ i només 6–12 combinacions de xifres hi arriben exactes.
  // Qui ja havia començat el N5 d'aquell dia amb la versió anterior el conserva (vegeu puzzleFor a app.js).
  hardFrom: '2026-11-24',
  // A partir d'aquest repte (versió 3): N4 amb 6 xifres i menys maneres d'encertar (12–20);
  // N5 amb 5 xifres que cada dia obliga a fer una potència, una arrel o un parèntesi amb dues
  // operacions; i als nivells 4 i 5 la calculadora ja no diu a quina distància estàs.
  v3From: '2026-11-26',
  // A partir d'aquest repte, el N4 surt del generador del joc (6 xifres, 12–20 maneres) i no de la taula
  // de reptes.js (5 xifres, 3+ maneres, massa difícil: el 26/11 només el 5 % el va encertar)
  softN4From: '2026-11-27',
  // Puntuació màxima del dia (5 rondes × 100 punts)
  dailyTotal: 500,
  levelMax: 100,
  // Punts màxims d'una ronda segons les xifres usades (100 = l'exacte sempre val 100;
  // fer servir totes les xifres dona una estrella ★ de bonus, sense restar punts)
  levelBase: 100,
  // Cada unitat de distància a l'objectiu resta aquesta fracció dels punts (0.1 = 10 %)
  penaltyPerUnit: 0.1,
  // Nivells (comptant des de 0) a partir dels quals apareixen les tecles xʸ i √ al repte diari
  advancedFrom: 3,
  // Correu públic de contacte i de privadesa (redirecció de CDmon cap al correu personal).
  // El formulari «Contacte» obre l'aplicació de correu de qui escriu (sense serveis externs).
  contactEmail: 'hola@combina.cat',
  // Comptes a les xarxes (icones discretes al peu i a «Contacte»; s'amaguen als menors de 14)
  social: { instagram: 'https://www.instagram.com/combinacat/', x: 'https://x.com/combinacat' },
  // Protecció de dades: edat mínima per crear compte o sortir al rànquing (LOPDGDD art. 7: 14 anys;
  // si la llei la puja a 16, canvia-ho aquí) i versió de la política (si canvia, es torna a demanar).
  minAge: 14,
  policyVersion: 'v1',

  // Projecte de Firebase (inici de sessió amb Google i rànquing compartit).
  // Aquestes dades són públiques per disseny; la seguretat la donen les regles de Firestore.
  // Posa-hi null per tornar al mode local.
  firebase: {
    apiKey: 'AIzaSyAH7PbiYKLO18VRBiAb8ZhPKC1B1uGIuqg',
    authDomain: 'combina-a85c4.firebaseapp.com',
    projectId: 'combina-a85c4',
    storageBucket: 'combina-a85c4.firebasestorage.app',
    messagingSenderId: '687629086327',
    appId: '1:687629086327:web:16c0884ab30f78302ce072'
  }
};
