/* Configuració general de «combina ≈».
 * Per activar l'inici de sessió amb Google i el rànquing compartit,
 * omple `firebase` amb les dades del teu projecte (vegeu README.md). */
window.COMBINA_CONFIG = {
  // Dia del repte nº 1
  startDate: '2026-11-19',
  // El repte canvia cada dia a aquesta hora (hora de Barcelona)
  timeZone: 'Europe/Madrid',
  resetHour: 9,
  // Segons per nivell (nivells 1 a 5)
  levelSeconds: [40, 40, 60, 60, 65],
  // A partir d'aquest repte, nivells 1–3 més assequibles (objectius ≤12, 13–20, 21–35, 36–100, >100)
  curveFrom: '2026-11-21',
  // Xifres per nivell
  levelCounts: [4, 5, 6, 7, 8],
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
  // Correu on arriben els missatges del formulari «Sobre mi · Contacte» (via FormSubmit).
  // Buit = formulari desactivat.
  contactEmail: 'francesc.coll.boada@gmail.com',

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
