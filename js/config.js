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
  levelSeconds: [30, 35, 40, 45, 50],
  // Xifres per nivell
  levelCounts: [4, 5, 6, 7, 8],
  // Els 5 objectius de cada dia sumen aquesta quantitat (= puntuació màxima del dia)
  dailyTotal: 1000,
  // Cada unitat de distància a l'objectiu resta aquesta fracció dels punts del nivell (0.1 = 10 %)
  penaltyPerUnit: 0.1,

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
