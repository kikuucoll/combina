/* Els cinc savis: rangs diaris i medalles geomètriques animades (SVG). */
(function (global) {
  'use strict';

  var SAVIS = [
    { key: 'pitagores', n: 1, name: 'Pitàgores', min: 0, max: 100, color: '#EDE8DC', rgb: '237,232,220', colorName: 'Blanc',
      fact: 'a² + b² = c²', era: 'Samos, s. VI aC',
      bio: 'Filòsof i matemàtic grec. La seva escola va fer dels nombres la clau per entendre el món, i el teorema que porta el seu nom relaciona els costats del triangle rectangle.', glyph: '' },
    { key: 'hipatia', n: 2, name: 'Hipàtia', min: 101, max: 200, color: '#86C9A6', rgb: '134,201,166', colorName: 'Verd',
      fact: 'Àlgebra i estrelles', era: 'Alexandria, c. 355–415',
      bio: 'Matemàtica, astrònoma i filòsofa, la primera dona matemàtica de qui coneixem bé la vida. Va ensenyar i comentar obres d’àlgebra i de geometria, i va estudiar el cel amb astrolabis.', glyph: '' },
    { key: 'arquimedes', n: 3, name: 'Arquimedes', min: 201, max: 300, color: '#7FA6DB', rgb: '127,166,219', colorName: 'Blau',
      fact: '3 10⁄71 < π < 3 1⁄7', era: 'Siracusa, c. 287–212 aC',
      bio: 'El gran matemàtic i enginyer de l’antiguitat. Va acotar el nombre π, va calcular àrees i volums (l’esfera és 2/3 del cilindre) i va explicar la palanca i per què suren els cossos.', glyph: 'π' },
    { key: 'noether', n: 4, name: 'Noether', min: 301, max: 400, color: '#B9C3D0', rgb: '185,195,208', colorName: 'Plata',
      fact: 'Simetria ⇒ conservació', era: 'Erlangen, 1882–1935',
      bio: 'Emmy Noether, una de les grans creadores de l’àlgebra moderna. El seu teorema demostra que cada simetria de la natura amaga una quantitat que es conserva, com l’energia.', glyph: '∂' },
    { key: 'gauss', n: 5, name: 'Gauss', min: 401, max: 500, color: '#E6B85C', rgb: '230,184,92', colorName: 'Or',
      fact: '1 + 2 + … + 100 = 5050', era: 'Brunsvic, 1777–1855',
      bio: 'El «príncep dels matemàtics». Als 19 anys va demostrar que el polígon de 17 costats es pot construir amb regle i compàs, i va transformar l’aritmètica, l’estadística i l’astronomia.', glyph: 'Σ' }
  ];

  function rankFor(total) {
    for (var i = SAVIS.length - 1; i >= 0; i--) if (total >= SAVIS[i].min) return SAVIS[i];
    return SAVIS[0];
  }
  function byKey(k) {
    for (var i = 0; i < SAVIS.length; i++) if (SAVIS[i].key === k) return SAVIS[i];
    return SAVIS[4];
  }

  function rot(dur, reverse) {
    return '<animateTransform attributeName="transform" type="rotate" from="' + (reverse ? '360' : '0') +
      ' 100 100" to="' + (reverse ? '0' : '360') + ' 100 100" dur="' + dur + 's" repeatCount="indefinite"/>';
  }

  var FIG = {
    pitagores: function (c) {
      return '<g transform="translate(100 100) scale(.85) translate(-100 -100)" fill="' + c + '" fill-opacity=".08" stroke="' + c + '" stroke-width="1.8" stroke-linejoin="round">' +
        '<path d="M80 115 L120 115 L120 155 L80 155 Z"/><path d="M80 85 L80 115 L50 115 L50 85 Z"/>' +
        '<path d="M80 85 L120 115 L150 75 L110 45 Z"/><path d="M80 85 L80 115 L120 115 Z" fill-opacity=".3"/>' +
        '<path d="M80 107 L88 107 L88 115" fill="none"/>' +
        '<g fill-opacity="1" stroke="none" font-family="STIX Two Text, serif" font-style="italic" text-anchor="middle">' +
        '<text x="65" y="104" font-size="13">a²</text><text x="100" y="140" font-size="13">b²</text><text x="115" y="84" font-size="15">c²</text></g></g>';
    },
    hipatia: function (c) {
      return '<g fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round">' +
        '<circle cx="100" cy="38" r="6"/><circle cx="100" cy="100" r="56" fill="' + c + '" fill-opacity=".07"/>' +
        '<circle cx="100" cy="100" r="50" stroke-opacity=".45" stroke-width="1"/>' +
        '<path d="M44 100 H156 M100 44 V156" stroke-opacity=".45" stroke-width="1"/>' +
        '<circle cx="100" cy="100" r="30" stroke-opacity=".7"/><circle cx="100" cy="86" r="36"/>' +
        '<ellipse cx="100" cy="114" rx="40" ry="20" stroke-opacity=".5" stroke-width="1"/>' +
        '<g>' + rot(40) + '<path d="M58 132 L142 68" stroke-width="2.4"/><circle cx="58" cy="132" r="3"/><circle cx="142" cy="68" r="3"/>' +
        '<circle cx="72" cy="80" r="2" fill="' + c + '"/><circle cx="128" cy="120" r="2" fill="' + c + '"/><circle cx="117" cy="73" r="2" fill="' + c + '"/></g>' +
        '<circle cx="100" cy="100" r="4" fill="' + c + '"/></g>';
    },
    arquimedes: function (c) {
      return '<g>' + rot(70) + '<path d="M100 100 A5 5 0 0 1 110 100 A10 10 0 0 1 90 100 A15 15 0 0 1 120 100 A20 20 0 0 1 80 100 A25 25 0 0 1 130 100 A30 30 0 0 1 70 100 A35 35 0 0 1 140 100 A40 40 0 0 1 60 100 A45 45 0 0 1 150 100 A50 50 0 0 1 50 100 A55 55 0 0 1 160 100" fill="none" stroke="' + c + '" stroke-opacity=".28" stroke-width="1"/></g>' +
        '<g fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round">' +
        '<circle cx="100" cy="100" r="38" fill="#0B0E12" fill-opacity=".6"/><circle cx="100" cy="100" r="38" fill="' + c + '" fill-opacity=".1"/>' +
        '<path d="M62 62 V138 M138 62 V138"/><ellipse cx="100" cy="62" rx="38" ry="9.5"/>' +
        '<path d="M62 138 A38 9.5 0 0 0 138 138"/><path d="M62 138 A38 9.5 0 0 1 138 138" stroke-opacity=".5" stroke-dasharray="3 3"/>' +
        '<path d="M62 100 A38 9.5 0 0 0 138 100"/><path d="M62 100 A38 9.5 0 0 1 138 100" stroke-opacity=".5" stroke-dasharray="3 3"/>' +
        '<circle cx="100" cy="100" r="2.5" fill="' + c + '"/></g>' +
        '<text x="100" y="166" fill="' + c + '" font-family="STIX Two Text, serif" font-style="italic" font-size="13" text-anchor="middle">2 : 3</text>';
    },
    noether: function (c) {
      return '<g fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">' +
        '<path d="M36 100 H164 M68 44.6 L132 155.4 M132 44.6 L68 155.4" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 4"/>' +
        '<circle cx="100" cy="100" r="50" stroke-opacity=".45" stroke-width="1"/>' +
        '<g>' + rot(48) + '<path d="M150 100 L125 143.3 L75 143.3 L50 100 L75 56.7 L125 56.7 Z"/>' +
        '<path d="M143.3 125 L56.7 125 L100 50 Z" fill="' + c + '" fill-opacity=".08"/>' +
        '<path d="M100 150 L56.7 75 L143.3 75 Z" fill="' + c + '" fill-opacity=".08"/></g>' +
        '<circle cx="100" cy="100" r="18"/><circle cx="100" cy="100" r="3" fill="' + c + '"/>' +
        '<path d="M131 46.3 A62 62 0 0 1 158.3 78.8"/><path d="M151.5 77.5 L158.3 78.8 L160 72"/></g>';
    },
    gauss: function (c) {
      return '<path d="M40 152 C68 152 80 76 100 76 C120 76 132 152 160 152" fill="none" stroke="' + c + '" stroke-opacity=".3" stroke-width="1" stroke-dasharray="3 3"/>' +
        '<g fill="none" stroke="' + c + '" stroke-linejoin="round">' + rot(80) +
        '<path d="M100 48 L141.50 131.34 L49.98 114.23 L118.78 51.51 L127.37 144.21 L48.22 95.20 L135.03 61.57 L109.56 151.11 L53.45 76.82 L146.55 76.82 L90.44 151.11 L64.97 61.57 L151.78 95.20 L72.63 144.21 L81.22 51.51 L150.02 114.23 L58.50 131.34 Z" stroke-opacity=".5" stroke-width="1"/>' +
        '<path d="M100 48 L118.78 51.51 L135.03 61.57 L146.55 76.82 L151.78 95.20 L150.02 114.23 L141.50 131.34 L127.37 144.21 L109.56 151.11 L90.44 151.11 L72.63 144.21 L58.50 131.34 L49.98 114.23 L48.22 95.20 L53.45 76.82 L64.97 61.57 L81.22 51.51 Z" fill="' + c + '" fill-opacity=".08" stroke-width="2"/>' +
        '<circle cx="100" cy="48" r="3" fill="' + c + '"/></g>' +
        '<circle cx="100" cy="100" r="15" fill="#0B0E12" stroke="' + c + '" stroke-width="1.4"/>' +
        '<text x="100" y="104.5" fill="' + c + '" font-family="STIX Two Text, serif" font-size="13" font-weight="600" text-anchor="middle">17</text>';
    }
  };

  var uid = 0;
  /* Medalla completa. size en px; dim = true per a una versió apagada */
  function medal(key, size, opts) {
    opts = opts || {};
    var s = byKey(key), c = s.color, id = 'mh' + (++uid);
    var b1 = Math.max(1, size / 60).toFixed(1), b2 = Math.max(2, size / 16).toFixed(1), b3 = Math.max(4, size / 7).toFixed(1);
    var glow = opts.dim ? 'opacity:.35;filter:grayscale(.3)' :
      'filter:drop-shadow(0 0 ' + b1 + 'px ' + c + ') drop-shadow(0 0 ' + b2 + 'px ' + c + 'AA) drop-shadow(0 0 ' + b3 + 'px ' + c + '55)';
    var badge = '';
    if (key === 'pitagores') badge = '<path d="M100 3 L102.94 12.05 L95.24 6.45 L104.76 6.45 L97.06 12.05 Z" fill="none" stroke="' + c + '" stroke-width="1" stroke-linejoin="round"/>';
    else if (key === 'hipatia') badge = '<path d="M102.5 3.2 A5 5 0 1 0 102.5 12.8 A4 4 0 1 1 102.5 3.2 Z" fill="' + c + '"/>';
    else badge = '<text x="100" y="11.8" fill="' + c + '" font-family="STIX Two Text, serif" font-style="italic" font-size="11" text-anchor="middle">' + s.glyph + '</text>';

    return '<span class="medal" style="width:' + size + 'px;height:' + size + 'px">' +
      // Sense halo al voltant: només el medalló
      '<svg class="medal-art" viewBox="0 0 200 200" role="img" aria-label="Medalla de ' + s.name + '" style="' + glow + '">' +
      '<circle cx="100" cy="100" r="78" fill="#0B0E12" fill-opacity=".55"/>' +
      '<g>' + rot(60) +
      '<circle cx="100" cy="100" r="94" fill="none" stroke="' + c + '" stroke-opacity=".55" stroke-width="1" stroke-dasharray="40 6 4 6"/>' +
      '<circle cx="100" cy="100" r="87" fill="none" stroke="' + c + '" stroke-opacity=".5" stroke-width="5" stroke-dasharray="0.9 8.21"/>' +
      '<circle cx="100" cy="100" r="87" fill="none" stroke="' + c + '" stroke-opacity=".9" stroke-width="9" stroke-dasharray="1.4 44.15"/>' +
      '<circle cx="100" cy="8" r="9" fill="#0B0E12" stroke="' + c + '" stroke-width="1.4"/>' + badge + '</g>' +
      '<circle cx="100" cy="100" r="78" fill="' + c + '" fill-opacity=".05" stroke="' + c + '" stroke-opacity=".4" stroke-width="1"/>' +
      '<g>' + rot(90, true) + '<circle cx="100" cy="100" r="70" fill="none" stroke="' + c + '" stroke-opacity=".3" stroke-width=".8" stroke-dasharray="1 5"/>' +
      '<circle cx="100" cy="30" r="2" fill="' + c + '"/><circle cx="170" cy="100" r="1.4" fill="' + c + '" fill-opacity=".7"/></g>' +
      FIG[key](c) + '</svg></span>';
  }

  global.Savis = { list: SAVIS, rankFor: rankFor, byKey: byKey, medal: medal };
})(window);
