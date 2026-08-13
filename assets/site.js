/* Bouwjebusje.nl — Camperstroom samensteller
   Vanilla JS, geen afhankelijkheden. Data komt uit assets/wizard-data.js
   (window.STROOM), gegenereerd door build.js uit de content-bestanden. */

(function () {
  'use strict';

  /* ================================================== rekenmodule (puur) */
  /* Losse functie zodat de som ook buiten de browser te testen is. */

  function bereken(keuzes, DATA) {
    const R = DATA.rekenlogica;
    const apparaten = DATA.apparaten.apparaten.filter((a) => keuzes.apparaten.includes(a.id));

    // 1. verbruik per dag
    let basis = 0, basis230 = 0;
    const posten = [];
    for (const a of apparaten) {
      let wh = a.whDag;
      if (keuzes.seizoen === 'zomer' && typeof a.whDagZomer === 'number') wh = a.whDagZomer;
      if (wh <= 0) { posten.push({ label: a.label, wh: 0, noot: 'telt in de zomer niet mee' }); continue; }
      basis += wh;
      if (a.is230v) basis230 += wh;
      posten.push({ label: a.label, wh });
    }
    const heeft230v = apparaten.some((a) => a.is230v);
    let omvormerExtra = 0;
    if (heeft230v) {
      omvormerExtra = Math.round(basis230 * R.omvormerVerlies) + R.omvormerStandbyWhDag;
      posten.push({ label: 'Omzetverlies + standby omvormer', wh: omvormerExtra });
    }
    const totaalWh = basis + omvormerExtra;

    // 2. accu
    const autonomie = R.accu.autonomieDagen[keuzes.frequentie];
    const accuWhNodig = totaalWh * autonomie;
    const ahNodig = accuWhNodig / R.accu.bruikbaarDeel / R.accu.spanning;
    const accuAh = R.accu.maten.find((m) => m >= ahNodig) || R.accu.maten[R.accu.maten.length - 1];
    const accuTeKlein = ahNodig > R.accu.maten[R.accu.maten.length - 1];

    // 3. panelen
    const zonuren = R.zonurenPerSeizoen[keuzes.seizoen];
    const wpNodig = totaalWh / zonuren / R.systeemRendement;
    const dakMaxWp = Math.floor(R.paneel.dakM2[keuzes.dak] * R.paneel.wpPerM2);
    const wpDoel = Math.min(wpNodig, dakMaxWp);
    const dakTekort = wpNodig > dakMaxWp;

    // 4. laden via rijden (B2B) — alleen adviseren als hij echt wat toevoegt
    const rijWh = Math.round(R.b2b.whPerRijuur * R.b2b.rijuurPerDag[keuzes.rijden]);
    const b2bNodig = keuzes.rijden === 'veel' || keuzes.seizoen === 'winter' ||
      (dakTekort && keuzes.rijden !== 'weinig');

    // dekt het systeem het verbruik?
    const opbrengstZon = Math.round(wpDoel * zonuren * R.systeemRendement);
    const opbrengstTotaal = opbrengstZon + (b2bNodig ? rijWh : 0);
    const dekkend = opbrengstTotaal >= totaalWh;
    const gatWh = Math.max(0, totaalWh - opbrengstTotaal);

    // 5. omvormer
    let omvormerWatt = 0;
    if (heeft230v) {
      const pieken = apparaten.filter((a) => a.is230v).map((a) => a.piekWatt).sort((a, b) => b - a);
      const piek = Math.round((pieken[0] || 0) + R.gelijktijdigheid * pieken.slice(1).reduce((s, p) => s + p, 0));
      const maat = R.omvormerMaten.find((m) => m.totPiek >= piek) || R.omvormerMaten[R.omvormerMaten.length - 1];
      omvormerWatt = maat.watt;
    }

    return {
      posten, totaalWh: Math.round(totaalWh), heeft230v,
      accuAh, accuTeKlein, autonomie,
      wpNodig: Math.round(wpNodig), wpDoel: Math.round(wpDoel), dakMaxWp, dakTekort, zonuren,
      b2bNodig, rijWh, opbrengstZon, opbrengstTotaal, dekkend, gatWh: Math.round(gatWh),
      omvormerWatt,
      mpptWpMin: Math.round(wpDoel * R.mpptMarge)
    };
  }

  /* ------------------------------------------ productkeuze bij de uitkomst */

  function prijsRange(str) {
    const m = String(str).replace(/\./g, '').match(/(\d+)\s*[–-]\s*€?\s*(\d+)/);
    return m ? [+m[1], +m[2]] : [0, 0];
  }

  function kiesProducten(uitkomst, keuzes, DATA) {
    const C = DATA.producten.componenten;
    const b = keuzes.budget;
    const perBudget = (opties) => opties.filter((o) => o.budget === b || o.budget === 'alle');
    const lijst = [];
    let totMin = 0, totMax = 0;
    const voegToe = (item) => {
      lijst.push(item);
      if (item.aantal && item.perStuk) {
        const [lo, hi] = prijsRange(item.product.prijsklasse);
        totMin += lo * item.aantal; totMax += hi * item.aantal;
      } else {
        const [lo, hi] = prijsRange(item.product.prijsklasse);
        totMin += lo; totMax += hi;
      }
    };

    // panelen — nooit meer adviseren dan er op het dak past
    const paneel = perBudget(C.paneel.opties)[0];
    const maxOpDak = Math.max(1, Math.floor(uitkomst.dakMaxWp / paneel.paneelWp));
    const aantalPanelen = Math.min(maxOpDak, Math.max(1, Math.ceil(uitkomst.wpDoel / paneel.paneelWp)));
    voegToe({
      component: C.paneel, product: paneel, aantal: aantalPanelen, perStuk: true,
      maat: aantalPanelen + ' × ' + paneel.paneelWp + ' Wp = ' + (aantalPanelen * paneel.paneelWp) + ' Wp',
      uitleg: 'Jouw verbruik (' + uitkomst.totaalWh + ' Wh/dag) vraagt in jouw seizoen om ± ' + uitkomst.wpNodig + ' Wp.' +
        (uitkomst.dakTekort ? ' Meer past er niet op je dak — zie de waarschuwing hieronder.' : '')
    });

    // montage
    voegToe({
      component: C.montage, product: perBudget(C.montage.opties)[0], aantal: aantalPanelen, perStuk: true,
      maat: 'voor ' + aantalPanelen + ' ' + (aantalPanelen === 1 ? 'paneel' : 'panelen'), uitleg: ''
    });

    // mppt — maat op werkelijk paneelvermogen incl. uitbreidmarge
    const echtWp = aantalPanelen * paneel.paneelWp;
    const mpptDoel = Math.round(echtWp * DATA.rekenlogica.mpptMarge);
    const mpptOpties = perBudget(C.mppt.opties);
    const mppt = mpptOpties.find((o) => o.maxWp >= mpptDoel) || mpptOpties[mpptOpties.length - 1];
    voegToe({
      component: C.mppt, product: mppt,
      maat: 'geschikt tot ' + mppt.maxWp + ' Wp',
      uitleg: 'Eén maat ruimer dan je ' + echtWp + ' Wp aan panelen, zodat er later een paneel bij kan.'
    });

    // accu
    const accuOpties = perBudget(C.accu.opties);
    let accu = accuOpties.find((o) => o.ah >= uitkomst.accuAh);
    let accuAantal = 1;
    if (!accu) { // groter dan grootste maat: parallel
      accu = accuOpties[accuOpties.length - 1];
      accuAantal = Math.ceil(uitkomst.accuAh / accu.ah);
    }
    voegToe({
      component: C.accu, product: accu, aantal: accuAantal, perStuk: accuAantal > 1,
      maat: (accuAantal > 1 ? accuAantal + ' × ' : '') + accu.ah + ' Ah',
      uitleg: uitkomst.totaalWh + ' Wh/dag × ' + uitkomst.autonomie + ' dagen buffer ÷ 90% bruikbaar ÷ 12,8 volt = ± ' + Math.round(uitkomst.totaalWh * uitkomst.autonomie / 0.9 / 12.8) + ' Ah.'
    });

    // b2b
    if (uitkomst.b2bNodig) {
      voegToe({
        component: C.b2b, product: perBudget(C.b2b.opties)[0],
        maat: '',
        uitleg: keuzes.seizoen === 'winter'
          ? 'In de winter is rijden je hoofdbron: panelen leveren dan bijna niets.'
          : (uitkomst.dakTekort
            ? 'Je dak is te klein voor je verbruik — laden tijdens het rijden vult het gat.'
            : 'Jij rijdt vrijwel dagelijks; zo is je accu na elke rit gewoon weer vol.')
      });
    }

    // omvormer
    if (uitkomst.omvormerWatt > 0) {
      const omvOpties = perBudget(C.omvormer.opties);
      const omv = omvOpties.find((o) => o.watt >= uitkomst.omvormerWatt) || omvOpties[omvOpties.length - 1];
      voegToe({
        component: C.omvormer, product: omv,
        maat: omv.watt + ' W zuivere sinus',
        uitleg: 'Gekozen op de piekbelasting van je 230V-apparaten.'
      });
    }

    // koelkast
    if (keuzes.apparaten.includes('koelkast')) {
      voegToe({
        component: C.koelkast, product: perBudget(C.koelkast.opties)[0],
        maat: '',
        uitleg: 'De zuinige variant waar we mee gerekend hebben — een gewone koelbox zou je systeem 3× groter maken.'
      });
    }

    // monitor + kabels
    voegToe({ component: C.monitor, product: perBudget(C.monitor.opties)[0], maat: '', uitleg: '' });
    voegToe({ component: C.kabels, product: perBudget(C.kabels.opties)[0], maat: '', uitleg: '' });

    return { lijst, totMin, totMax };
  }

  // exporteren voor tests buiten de browser
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { bereken, kiesProducten, prijsRange };
    return;
  }

  /* ====================================================== de wizard-app */

  const el = document.getElementById('wizard');
  if (!el || !window.STROOM) return;
  const DATA = window.STROOM;

  const state = {
    stap: 0,
    apparaten: [],
    frequentie: null, seizoen: null, rijden: null,
    dak: null, budget: null
  };

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function stappenbalk() {
    return '<div class="stappenbalk">' + DATA.wizard.stappen.map((s, i) =>
      '<span class="stap-dot' + (i === state.stap ? ' actief' : i < state.stap ? ' klaar' : '') + '">' +
      '<span class="nr">' + (i < state.stap ? '✓' : i + 1) + '</span><span class="tekst">' + esc(s.titel) + '</span></span>'
    ).join('') + '</div>';
  }

  function radioGroep(vraagId, gekozen) {
    const v = DATA.wizard.vragen[vraagId];
    return '<h3>' + esc(v.vraag) + '</h3>' +
      (v.sub ? '<p class="som-uitleg">' + esc(v.sub) + '</p>' : '') +
      '<div class="keuzegrid" role="radiogroup" aria-label="' + esc(v.vraag) + '">' +
      v.opties.map((o) =>
        '<label class="keuze' + (gekozen === o.id ? ' aan' : '') + '">' +
        '<input type="radio" name="' + vraagId + '" value="' + o.id + '"' + (gekozen === o.id ? ' checked' : '') + '>' +
        '<span class="vink">✓</span>' +
        '<span class="keuze-label">' + esc(o.label) + '</span>' +
        '<span class="keuze-sub">' + esc(o.sub) + '</span></label>'
      ).join('') + '</div>';
  }

  /* ------------------------------------------------------------- stap 1 */

  function stapApparaten() {
    const s = DATA.wizard.stappen[0];
    const items = DATA.apparaten.apparaten.map((a) => {
      const aan = state.apparaten.includes(a.id);
      return '<label class="keuze' + (aan ? ' aan' : '') + '">' +
        '<input type="checkbox" data-apparaat="' + a.id + '"' + (aan ? ' checked' : '') + '>' +
        '<span class="vink">✓</span>' +
        '<span class="keuze-label">' + esc(a.label) + '</span>' +
        '<span class="keuze-sub">' + esc(a.sub) + '</span></label>';
    }).join('');

    const edus = DATA.apparaten.apparaten
      .filter((a) => state.apparaten.includes(a.id) && a.eduMoment)
      .map((a) => '<div class="edu' + (a.whDag >= 1000 ? ' waarschuwing' : '') + '"><strong>' +
        esc(a.eduMoment.kop) + '</strong>' + esc(a.eduMoment.tekst) + '</div>').join('');

    const som = state.apparaten.length
      ? '<p class="som-uitleg">Voorlopige inschatting: <b>± ' + ruweSom() + ' Wh per dag</b> — in de volgende stappen maken we dit precies.</p>'
      : '';

    return '<div class="stap-kop"><h2>' + esc(s.titel) + '</h2><p class="lead">' + esc(s.sub) + '</p></div>' +
      '<div class="keuzegrid">' + items + '</div>' + edus + som +
      voet(state.apparaten.length > 0, 'Kies minstens één apparaat');
  }

  function ruweSom() {
    return DATA.apparaten.apparaten
      .filter((a) => state.apparaten.includes(a.id))
      .reduce((t, a) => t + a.whDag, 0);
  }

  /* ------------------------------------------------------------- stap 2/3 */

  function stapGebruik() {
    const s = DATA.wizard.stappen[1];
    return '<div class="stap-kop"><h2>' + esc(s.titel) + '</h2><p class="lead">' + esc(s.sub) + '</p></div>' +
      radioGroep('frequentie', state.frequentie) +
      radioGroep('seizoen', state.seizoen) +
      radioGroep('rijden', state.rijden) +
      voet(state.frequentie && state.seizoen && state.rijden, 'Beantwoord de drie vragen');
  }

  function stapBus() {
    const s = DATA.wizard.stappen[2];
    return '<div class="stap-kop"><h2>' + esc(s.titel) + '</h2><p class="lead">' + esc(s.sub) + '</p></div>' +
      radioGroep('dak', state.dak) +
      radioGroep('budget', state.budget) +
      voet(state.dak && state.budget, 'Beantwoord beide vragen', 'Laat het doorrekenen');
  }

  function voet(klaar, hint, verderTekst) {
    return '<div class="wizard-voet">' +
      (state.stap > 0 ? '<button type="button" class="terug" data-terug>← Vorige stap</button>' : '<span></span>') +
      '<span>' + (!klaar ? '<span class="som-uitleg">' + esc(hint) + ' &nbsp;</span>' : '') +
      '<button type="button" class="btn" data-verder' + (klaar ? '' : ' disabled style="opacity:.4;cursor:not-allowed"') + '>' +
      esc(verderTekst || 'Volgende stap') + ' →</button></span></div>';
  }

  /* ------------------------------------------------------------ resultaat */

  function stapResultaat() {
    const u = bereken(state, DATA);
    const P = kiesProducten(u, state, DATA);
    const T = DATA.wizard.resultaatTeksten;
    const budgetLabel = DATA.producten.budgetklassen[state.budget].label;

    let html = '<div class="stap-kop"><h2>' + esc(DATA.wizard.stappen[3].titel) + '</h2>' +
      '<p class="lead">' + esc(DATA.wizard.stappen[3].sub) + '</p></div>';

    // verbruik
    html += '<div class="verbruik-kaart"><h3>' + esc(T.verbruikKop) + '</h3>' +
      '<span class="verbruik-totaal">± ' + u.totaalWh + ' Wh per dag</span>' +
      '<p class="som-uitleg">' + esc(T.verbruikUitleg) + '</p>' +
      '<ul class="verbruik-lijst">' + u.posten.map((p) =>
        '<li><span>' + esc(p.label) + (p.noot ? ' <em>(' + esc(p.noot) + ')</em>' : '') + '</span><span class="wh">' + p.wh + ' Wh</span></li>'
      ).join('') + '</ul></div>';

    // eerlijke waarschuwingen
    if (u.dakTekort) {
      html += '<div class="edu waarschuwing"><strong>Eerlijk: je dak kan dit niet bijbenen</strong>' +
        'Je verbruik vraagt ± ' + u.wpNodig + ' Wp aan panelen, maar op jouw dak past maar ± ' + u.dakMaxWp + ' Wp. ' +
        (u.dekkend
          ? 'Omdat je geregeld rijdt, vult de B2B-lader het gat — dan klopt het alsnog.'
          : 'Er blijft dagelijks een gat van ± ' + u.gatWh + ' Wh over. Kies: schrap de grootste stroomvreter hierboven, rijd vaker, of reken op af en toe een camping met stroomaansluiting.') +
        '</div>';
    } else if (!u.dekkend) {
      html += '<div class="edu waarschuwing"><strong>Let op: dit seizoen laad je minder dan je gebruikt</strong>' +
        'Met ' + u.zonuren + ' zon-uur per dag komt er ± ' + u.opbrengstTotaal + ' Wh binnen tegen ' + u.totaalWh + ' Wh verbruik. ' +
        'Je grote accu vangt een paar dagen op, maar niet eindeloos. Overweeg een B2B-lader, minder apparaten of af en toe walstroom.</div>';
    }
    if (state.seizoen === 'winter') {
      html += '<div class="edu"><strong>Winterwaarheid</strong>' +
        'Wij rekenen in de winter met maar 0,7 zon-uur per dag — dat is de realiteit in december. ' +
        'Je panelen zijn dan mooi meegenomen, maar rijden (B2B) en af en toe walstroom zijn je echte bronnen.</div>';
    }

    // materiaallijst
    html += '<h3 style="font-size:1.6rem;margin-top:1.6em">' + esc(T.lijstKop) + ' <span class="som-uitleg">(' + esc(budgetLabel) + ')</span></h3>';
    html += P.lijst.map((item) => {
      const p = item.product;
      return '<div class="onderdeel"><div>' +
        '<h3>' + esc(item.component.titel) + (item.maat ? ' — <span class="advies-maat">' + esc(item.maat) + '</span>' : '') + '</h3>' +
        (item.uitleg ? '<p>' + esc(item.uitleg) + '</p>' : '') +
        '<p class="waarom">' + esc(item.component.waarom) + '</p>' +
        '</div><div class="onderdeel-cta">' +
        '<b>' + (item.aantal > 1 ? item.aantal + ' × ' : '') + esc(p.naam) + '</b>' +
        '<a class="btn btn-klein" href="' + esc(p.link) + '" rel="sponsored nofollow noopener" target="_blank">Bekijk prijs</a>' +
        '<small>Prijsklasse ' + esc(p.prijsklasse) + '<br>Actuele prijs zie je bij de winkel</small>' +
        '</div></div>';
    }).join('');

    // totaal
    html += '<div class="totaalbalk"><h3>Totaalindicatie (' + esc(budgetLabel) + ')</h3>' +
      '<span class="totaal">± €' + afgerond(P.totMin) + ' – €' + afgerond(P.totMax) + '</span>' +
      '<p>Richtprijs voor de hele lijst, op basis van de prijsklassen hierboven. De actuele prijs zie je altijd bij de winkel zelf.</p>' +
      '<h3 style="margin-top:1.2em">' + esc(T.uitbreidKop) + '</h3><p>' + esc(T.uitbreidTekst) + '</p></div>';

    // disclosure
    html += '<p class="disclosure">' + esc(DATA.site.disclosure_kort) + '</p>';

    html += '<div class="wizard-voet"><button type="button" class="terug" data-terug>← Aanpassen</button>' +
      '<button type="button" class="btn alt" data-opnieuw>Opnieuw beginnen</button></div>';
    return html;
  }

  const afgerond = (n) => (Math.round(n / 10) * 10).toLocaleString('nl-NL');

  /* ------------------------------------------------------------- render */

  const stappen = [stapApparaten, stapGebruik, stapBus, stapResultaat];

  function render() {
    el.innerHTML = stappenbalk() + stappen[state.stap]();
    el.querySelectorAll('[data-apparaat]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.dataset.apparaat;
        state.apparaten = inp.checked
          ? state.apparaten.concat(id)
          : state.apparaten.filter((x) => x !== id);
        render();
      });
    });
    el.querySelectorAll('input[type=radio]').forEach((inp) => {
      inp.addEventListener('change', () => { state[inp.name] = inp.value; render(); });
    });
    const verder = el.querySelector('[data-verder]');
    if (verder) verder.addEventListener('click', () => {
      if (verder.disabled) return;
      state.stap++; render(); el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const terug = el.querySelector('[data-terug]');
    if (terug) terug.addEventListener('click', () => { state.stap--; render(); });
    const opnieuw = el.querySelector('[data-opnieuw]');
    if (opnieuw) opnieuw.addEventListener('click', () => {
      state.stap = 0; state.apparaten = [];
      state.frequentie = state.seizoen = state.rijden = state.dak = state.budget = null;
      render(); el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  render();
})();
