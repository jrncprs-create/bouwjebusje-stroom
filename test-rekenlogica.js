/* Snelle controle van de rekensom: node test-rekenlogica.js */
const fs = require('fs');
const { bereken, kiesProducten } = require('./assets/site.js');

const DATA = {
  apparaten: JSON.parse(fs.readFileSync('./content/apparaten.json', 'utf8')),
  rekenlogica: JSON.parse(fs.readFileSync('./content/rekenlogica.json', 'utf8')),
  producten: JSON.parse(fs.readFileSync('./content/producten.json', 'utf8')),
};
for (const comp of Object.values(DATA.producten.componenten))
  for (const o of comp.opties) o.link = '#';

const scenarios = [
  { naam: 'Zomers weekendstel (koelkast, telefoons, licht, vent.)',
    keuzes: { apparaten: ['koelkast','telefoons','verlichting','dakventilator'], frequentie: 'weekend', seizoen: 'zomer', rijden: 'beetje', dak: 'middel', budget: 'budget' } },
  { naam: 'Vakantieganger met laptop + koffie (230V)',
    keuzes: { apparaten: ['koelkast','telefoons','laptop','verlichting','waterpomp','dakventilator','koffie'], frequentie: 'vakantie', seizoen: 'zomer', rijden: 'beetje', dak: 'middel', budget: 'midden' } },
  { naam: 'Fulltimer winter, klein busje (dak te klein?)',
    keuzes: { apparaten: ['koelkast','telefoons','laptop','verlichting','waterpomp','standkachel','dakventilator'], frequentie: 'fulltime', seizoen: 'winter', rijden: 'veel', dak: 'klein', budget: 'premium' } },
  { naam: 'Alles-erop-en-eraan: inductie + airco + ebike, grote bus',
    keuzes: { apparaten: ['koelkast','telefoons','laptop','verlichting','waterpomp','dakventilator','inductie','airco','ebike','magnetron'], frequentie: 'vakantie', seizoen: 'zomer', rijden: 'weinig', dak: 'groot', budget: 'midden' } },
  { naam: 'Minimalist: alleen telefoons en licht',
    keuzes: { apparaten: ['telefoons','verlichting'], frequentie: 'weekend', seizoen: 'zomer', rijden: 'weinig', dak: 'klein', budget: 'budget' } },
  { naam: 'Standkachel in de zomer (moet 0 tellen)',
    keuzes: { apparaten: ['standkachel','verlichting'], frequentie: 'weekend', seizoen: 'zomer', rijden: 'weinig', dak: 'klein', budget: 'budget' } },
];

for (const s of scenarios) {
  const u = bereken(s.keuzes, DATA);
  const P = kiesProducten(u, s.keuzes, DATA);
  console.log('\n=== ' + s.naam);
  console.log('  verbruik: ' + u.totaalWh + ' Wh/dag | accu: ' + u.accuAh + ' Ah | panelen nodig: ' +
    u.wpNodig + ' Wp, doel: ' + u.wpDoel + ' Wp (dak max ' + u.dakMaxWp + ')' +
    (u.dakTekort ? '  [DAK TE KLEIN]' : ''));
  console.log('  omvormer: ' + (u.omvormerWatt || 'geen') + ' | B2B: ' + (u.b2bNodig ? 'ja' : 'nee') +
    ' | dekkend: ' + (u.dekkend ? 'ja' : 'NEE, gat ' + u.gatWh + ' Wh'));
  for (const item of P.lijst)
    console.log('   - ' + item.component.titel + ': ' + (item.aantal > 1 ? item.aantal + '× ' : '') +
      item.product.naam + (item.maat ? '  [' + item.maat + ']' : ''));
  console.log('  totaal: €' + P.totMin + ' – €' + P.totMax);
}
