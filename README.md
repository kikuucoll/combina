# combina ≈ — el repte diari d'operacions combinades

Cinc nivells. Un repte cada dia.

Joc web (mòbil i ordinador) sense dependències: HTML, CSS i JavaScript. Funciona en qualsevol allotjament estàtic.

## Com funciona

- **Repte diari automàtic.** Cada dia a les **9:00 (hora de Barcelona)** canvia el repte. Els 5 nivells es generen a partir de la data, de manera que tothom rep exactament el mateix repte sense necessitat de servidor.
- **Nivells:** 4, 5, 6, 7 i 8 xifres (de l'1 al 20), amb 40, 40, 60, 60 i 65 segons.
- **Operacions:** + − × ÷, parèntesis, potències (l'exponent també és una xifra) i arrels quadrades. Cada xifra, un sol cop.
- **Puntuació:** cada ronda val fins a **100 punts** (500 al dia). Punts = precisió × xifres: el màxim de la ronda va de 70 (`levelBase`, poques xifres) a 100 (`levelMax`, totes les xifres), i cada unitat de distància a l'objectiu en resta un 10 % (`penaltyPerUnit`). Cada repte es pot resoldre exactament fent servir totes les xifres. Si s'acaba el temps, es corregeix el que hi hagi escrit.
- **Correcció animada** pas a pas seguint la jerarquia de les operacions, i una solució exacta per aprendre.
- **Rangs diaris:** Pitàgores (0–100), Hipàtia (101–200), Arquimedes (201–300), Noether (301–400), Gauss (401–500).
- **Dificultat suau:** objectius petits (ronda 1: 10–50 … ronda 5: 25–160), sobretot amb sumes i restes; les potències i arrels només apareixen de tant en tant a les últimes rondes.
- **Tutorial jugable** («Com es juga»): arriba al 10 amb 2, 3 i 4, sense rellotge i amb indicacions pas a pas. Surt sol el primer cop.
- **Ratxa amb fites i comodins:** fites als 3, 7, 14, 30 i 100 dies. Cada 7 dies seguits es guanya un comodí (màxim 2) que salva la ratxa automàticament si un dia no es juga.
- **Vitrina:** medalles aconseguides de cada savi i 16 segells per col·leccionar (primer exacte, potència, arrel, llampec, al límit, dia perfecte, ratxes, Gauss…).
- **Teclat a l'ordinador:** xifres, `+ - * /`, `( )`, `^` o `P` (potència), `R` (arrel), retrocés i Retorn per validar.

Tots els paràmetres són a `js/config.js`.

## Provar-lo en local

Cal servir la carpeta amb un servidor web. Per exemple, amb Node:

```bash
npx serve .
```

Sense configurar res, l'app funciona en **mode local**: les partides es guarden al navegador i no hi ha rànquing compartit.

## Activar l'inici de sessió amb Google i el rànquing compartit (Firebase, gratuït)

1. Entra a <https://console.firebase.google.com> i crea un projecte nou.
2. **Authentication → Sign-in method →** activa **Google**.
3. **Firestore Database → Create database** (mode producció, ubicació `europe-west`).
4. **Configuració del projecte → Les teves apps → Web (`</>`)**: registra l'app i copia l'objecte `firebaseConfig`.
5. Enganxa'l a `js/config.js`, a la propietat `firebase`:

   ```js
   firebase: {
     apiKey: '...',
     authDomain: 'el-teu-projecte.firebaseapp.com',
     projectId: 'el-teu-projecte',
     appId: '...'
   }
   ```

6. Publica les regles de seguretat de `firestore.rules` (Firestore → Regles, o amb l'eina `firebase`).
7. Publica la web. L'opció més senzilla és Firebase Hosting, des d'aquesta carpeta:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy
   ```

   Si l'allotges en un altre lloc (GitHub Pages, el servidor del centre…), afegeix aquest domini a **Authentication → Settings → Authorized domains**.

### Dades que es guarden

- `days/{AAAA-MM-DD}/scores/{uid}` → nom curt (p. ex. «Laia R.»), foto, total, exactes i punts per nivell.
- `players/{uid}` → nom curt, total acumulat, dies jugats i millor dia.

El rànquing mostra **Avui**, **Setmana** (últims 7 reptes) i **Total**.

> Nota: com en qualsevol joc web sense servidor propi, la puntuació la calcula el navegador. Les regles limiten els valors (0–1000, una sola puntuació per dia), però un usuari expert podria falsejar-la. Per a un ús escolar és més que suficient.

## Estructura

```
index.html        pàgina única
css/styles.css    sistema visual (tinta, guix i or de Gauss)
js/config.js      paràmetres i configuració de Firebase
js/expr.js        entrada, anàlisi, avaluació, correcció pas a pas i puntuació
js/puzzle.js      data del repte (9:00 Barcelona) i generador determinista
js/medals.js      els cinc savis i les medalles geomètriques animades
js/backend.js     Google + Firestore (opcional)
js/app.js         pantalles i lògica del joc
firestore.rules   regles de seguretat de la base de dades
firebase.json     configuració per publicar a Firebase Hosting
```

## Llicència

© 2026 Kiku (combina.cat). **Tots els drets reservats.** El repositori és públic només per publicar el joc amb GitHub Pages; no es permet copiar, modificar ni redistribuir el codi sense permís. Vegeu [LICENSE](LICENSE).
