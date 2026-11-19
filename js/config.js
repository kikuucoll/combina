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

  // null = mode local (sense inici de sessió ni rànquing compartit)
  firebase: null
  /* Exemple:
  firebase: {
    apiKey: 'AIza...',
    authDomain: 'el-teu-projecte.firebaseapp.com',
    projectId: 'el-teu-projecte',
    appId: '1:000000000000:web:0000000000000000'
  }
  */
};
