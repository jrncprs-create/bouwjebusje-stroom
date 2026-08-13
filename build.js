/**
 * Bouwjebusje.nl — Camperstroom: statische sitegenerator
 *
 * Draaien:   node build.js
 * Resultaat: /public — upload de inhoud naar de map "stroom" in de docroot
 *            van bouwjebusje.nl (Plesk → Bestandsbeheer).
 *
 * Structuur (zelfde aanpak als Robotvergelijk):
 *   content/    alle tekst, apparaten, producten en rekenregels — hier pas je aan
 *   templates/  de opmaak, los van de content
 *   assets/     css en javascript
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'public');

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/site.json'), 'utf8'));
const apparaten = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/apparaten.json'), 'utf8'));
const rekenlogica = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/rekenlogica.json'), 'utf8'));
const producten = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/producten.json'), 'utf8'));
const wizard = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/wizard.json'), 'utf8'));
const media = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/media.json'), 'utf8'));

const BASIS = 'https://' + site.domein + site.basispad;

/* ---------------------------------------------------------------- helpers */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Affiliate-link naar bol. Zodra site.bol_site_id is ingevuld worden alle
 * links automatisch getagd — één plek wijzigen na goedkeuring.
 */
function bolLink(zoekterm) {
  const target = 'https://www.bol.com/nl/nl/s/?searchtext=' + encodeURIComponent(zoekterm);
  if (!site.bol_site_id) return target;
  return 'https://partner.bol.com/click/click?p=2&t=url&s=' + encodeURIComponent(site.bol_site_id) +
    '&url=' + encodeURIComponent(target) + '&f=TXL&name=' + encodeURIComponent(zoekterm);
}

/** Gereserveerde ruimte voor beeld dat we later maken. */
function beeldplek(ratio, titel, uitleg) {
  return `<figure class="mediaplek" style="--ratio:${ratio}">
  <div class="mediaplek-body">
    <span class="mediaplek-label">Beeld volgt</span>
    <b>${esc(titel)}</b>
    <span class="mediaplek-uitleg">${esc(uitleg)}</span>
  </div>
</figure>`;
}

/* ------------------------------------------------------- mini-markdown */
/* Zelfde dialect als Robotvergelijk: koppen, lijsten, tabellen, links, vet,
   :::let / :::tip callouts en ::beeld[ratio|titel|uitleg]. */

function inline(s) {
  return s
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>');
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function markdown(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    const beeld = line.match(/^::beeld\[(.+?)\|(.+?)\|(.+?)\]\s*$/);
    if (beeld) { out.push(beeldplek(beeld[1], beeld[2], beeld[3])); i++; continue; }

    // echte foto: ::foto[url|alt-tekst] of ::foto[url|alt-tekst|portret]
    const foto = line.match(/^::foto\[(.+?)\|(.+?)(?:\|(.+?))?\]\s*$/);
    if (foto) {
      out.push(`<figure class="artfoto${foto[3] ? ' ' + esc(foto[3]) : ''}"><img src="${esc(foto[1])}" alt="${esc(foto[2])}" loading="lazy"></figure>`);
      i++; continue;
    }

    const call = line.match(/^:::(let|tip)\s*(.*)$/);
    if (call) {
      const kop = call[2].trim();
      const body = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
      i++;
      out.push(`<div class="callout ${call[1] === 'let' ? 'warn' : ''}">` +
        (kop ? `<strong>${inline(esc(kop))}</strong>` : '') +
        markdown(body.join('\n')) + '</div>');
      continue;
    }

    if (/^\|/.test(line) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const head = line.split('|').slice(1, -1).map((c) => c.trim());
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push('<div class="table-scroll"><table><thead><tr>' +
        head.map((h) => `<th>${inline(esc(h))}</th>`).join('') +
        '</tr></thead><tbody>' +
        rows.map((r) => '<tr>' + r.map((c) => `<td>${inline(esc(c))}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>');
      continue;
    }

    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) { const n = h[1].length; out.push(`<h${n} id="${slug(h[2])}">${inline(esc(h[2]))}</h${n}>`); i++; continue; }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; }
      out.push('<ul>' + items.map((t) => `<li>${inline(esc(t))}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; }
      out.push('<ol>' + items.map((t) => `<li>${inline(esc(t))}</li>`).join('') + '</ol>');
      continue;
    }

    if (line.trim() === '') { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{2,4}\s|[-*]\s|\d+\.\s|\||:::|::beeld)/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(`<p>${inline(esc(buf.join(' ')))}</p>`);
  }

  return out.join('\n');
}

/* ------------------------------------------------------------- JSON-LD */

function jsonldWebsite() {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite',
    name: site.naam + ' ' + site.sub, url: BASIS,
    description: site.beschrijving,
    publisher: { '@type': 'Organization', name: site.eigenaar.bedrijf }
  };
}

function jsonldArtikel(meta, url) {
  return {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: meta.titel, description: meta.beschrijving,
    inLanguage: 'nl', mainEntityOfPage: BASIS + url,
    dateModified: meta.iso || undefined,
    author: { '@type': 'Organization', name: site.naam },
    publisher: { '@type': 'Organization', name: site.eigenaar.bedrijf }
  };
}

/** FAQPage uit een "Veelgestelde vragen"-sectie: ### vraag + antwoord-alinea's. */
function jsonldFaq(body) {
  const m = body.match(/##\s+Veelgestelde vragen\s*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!m) return null;
  const vragen = [];
  const re = /###\s+(.+)\n([\s\S]*?)(?=\n###\s|$)/g;
  let q;
  while ((q = re.exec(m[1]))) {
    vragen.push({
      '@type': 'Question', name: q[1].trim(),
      acceptedAnswer: { '@type': 'Answer', text: q[2].replace(/\s+/g, ' ').trim() }
    });
  }
  if (!vragen.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: vragen };
}

function jsonldBreadcrumb(titel, url) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Camperstroom', item: BASIS },
      { '@type': 'ListItem', position: 2, name: titel, item: BASIS + url }
    ]
  };
}

const ldScript = (objs) => objs.filter(Boolean)
  .map((o) => '<script type="application/ld+json">' + JSON.stringify(o) + '</script>').join('\n');

/* ------------------------------------------------------------ templates */

const T = {};
for (const f of fs.readdirSync(path.join(ROOT, 'templates'))) {
  if (f.endsWith('.html')) T[f.replace('.html', '')] = fs.readFileSync(path.join(ROOT, 'templates', f), 'utf8');
}

function render(tpl, vars) {
  return tpl
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => pick(vars, k) ?? '')
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(pick(vars, k) ?? ''));
}
const pick = (o, k) => k.split('.').reduce((a, b) => (a == null ? a : a[b]), o);

function navHtml(active) {
  return site.nav.map((n) =>
    `<a href="${n.url}"${n.cta ? ' class="nav-cta"' : ''}${n.url === active ? ' aria-current="page"' : ''}>${esc(n.titel)}</a>`
  ).join('\n');
}

function footerHtml() {
  return site.footer.map((kol) =>
    `<div><h4>${esc(kol.kop)}</h4><ul>` +
    kol.links.map((l) => `<li><a href="${l.url}">${esc(l.titel)}</a></li>`).join('') +
    '</ul></div>'
  ).join('\n');
}

function pagina({ titel, beschrijving, url, body, klasse = '', jsonld = '' }) {
  return render(T.base, {
    site, media, titel, beschrijving, url,
    nav: navHtml(url), footer: footerHtml(), body, klasse, jsonld,
    jaar: new Date().getFullYear()
  });
}

function schrijf(bestand, html) {
  fs.mkdirSync(path.dirname(path.join(OUT, bestand)), { recursive: true });
  fs.writeFileSync(path.join(OUT, bestand), html);
  console.log('  ✓', bestand);
}

function leesPagina(bestand) {
  const raw = fs.readFileSync(path.join(ROOT, 'content/pages', bestand), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const meta = {};
  if (m) {
    for (const r of m[1].split('\n')) {
      const k = r.indexOf(':');
      if (k > 0) meta[r.slice(0, k).trim()] = r.slice(k + 1).trim();
    }
  }
  return { meta, body: m ? m[2] : raw };
}

/* ------------------------------------------------------------ bouwen */

console.log('Camperstroom bouwen…');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });

// wizard-data voor de browser: alle content + kant-en-klare affiliate-links
const productenMetLinks = JSON.parse(JSON.stringify(producten));
for (const comp of Object.values(productenMetLinks.componenten)) {
  for (const o of comp.opties) o.link = bolLink(o.zoek);
}
fs.writeFileSync(path.join(OUT, 'assets/wizard-data.js'),
  'window.STROOM = ' + JSON.stringify({
    site: { disclosure_kort: site.disclosure_kort },
    apparaten, rekenlogica, producten: productenMetLinks, wizard
  }) + ';\n');

// artikelen
const paginas = fs.readdirSync(path.join(ROOT, 'content/pages')).filter((f) => f.endsWith('.md'));
const uitleg = [];
const actueel = [];

for (const bestand of paginas) {
  const { meta, body } = leesPagina(bestand);
  const url = bestand.replace('.md', '.html');
  const inhoud = markdown(body);

  const html = pagina({
    titel: meta.titel + ' | ' + site.naam,
    beschrijving: meta.beschrijving, url,
    jsonld: ldScript([jsonldArtikel(meta, url), jsonldFaq(body), jsonldBreadcrumb(meta.titel, url)]),
    body: render(T.artikel, {
      titel: meta.titel, intro: meta.intro || '', inhoud,
      kopfoto: meta.kopfoto
        ? `<div class="kopfoto"><img src="${esc(meta.kopfoto)}" alt="${esc(meta.kopfoto_alt || meta.titel)}"></div>`
        : '',
      disclosureblok: meta.affiliate ? '<p class="disclosure">' + esc(site.disclosure_kort) + '</p>' : '',
      bijgewerkt: meta.datum ? 'Laatst bijgewerkt: ' + meta.datum : '',
      soort: meta.soort || 'Uitleg'
    })
  });
  schrijf(url, html);

  if (meta.soort === 'Actueel') actueel.push({ titel: meta.titel, url, intro: meta.intro, datum: meta.datum });
  else if (meta.soort !== 'colofon') uitleg.push({ titel: meta.titel, url, intro: meta.intro });
}

// nieuwste actueel-stuk eerst (bestandsnaam begint met actueel-JJJJ-MM)
actueel.sort((a, b) => b.url.localeCompare(a.url));

const kaart = (u) => `<a class="card" href="${u.url}"><h3>${esc(u.titel)}</h3><p>${esc(u.intro)}</p></a>`;
const kaartActueel = (u) => `<a class="card" href="${u.url}"><span class="label">${esc(u.datum || 'Actueel')}</span><h3>${esc(u.titel)}</h3><p>${esc(u.intro)}</p></a>`;

const actueelblok = actueel.length ? `<section class="actueel-strook">
  <div class="wrap">
    <h2>Actueel</h2>
    <p class="lead">Wat er speelt in camperstroomland — elke week een eigen stuk, eerlijk zoals altijd.</p>
    <div class="grid grid-3">${actueel.slice(0, 3).map(kaartActueel).join('')}</div>
  </div>
</section>` : '';

// home = de wizard
schrijf('index.html', pagina({
  titel: wizard.intro.titel + ' | ' + site.naam,
  beschrijving: site.beschrijving,
  url: 'index.html',
  jsonld: ldScript([jsonldWebsite()]),
  body: render(T.wizard, { wizard, media, actueelblok, uitlegkaarten: uitleg.map(kaart).join('') })
}));

// uitleg-overzicht
schrijf('uitleg.html', pagina({
  titel: 'Camperstroom uitgelegd in gewone mensentaal | ' + site.naam,
  beschrijving: 'Zonnepanelen, accu\'s, laadregelaars en omvormers voor je camper — uitgelegd zonder jargon, met eerlijke adviezen.',
  url: 'uitleg.html',
  jsonld: ldScript([jsonldBreadcrumb('Uitleg', 'uitleg.html')]),
  body: `<div class="artikel-kop"><div class="wrap narrow">
    <span class="label">Uitleg</span>
    <h1>Eerst snappen, dan kopen</h1>
    <p class="lead">Voordat je honderden euro's uitgeeft is het handig om te snappen wát je koopt. Hieronder alle uitleg, zonder marketingtaal — zodat je zelf kunt beoordelen wat jouw bus nodig heeft.</p>
  </div></div>
  <div class="wrap" style="padding-top:28px"><div class="grid grid-4">${uitleg.map(kaart).join('')}</div>
  ${actueel.length ? `<h2 style="margin-top:1.8em">Actueel</h2><div class="grid grid-3">${actueel.map(kaartActueel).join('')}</div>` : ''}</div>`
}));

// sitemap + robots (robots.txt hoort bij de hoofdsite; wij leveren alleen een sitemap)
const urls = ['', 'uitleg.html'].concat(paginas.map((f) => f.replace('.md', '.html')));
schrijf('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${BASIS}${u}</loc></url>`).join('\n') + '\n</urlset>\n');

console.log('Klaar. Upload de inhoud van /public naar de map "stroom" op de server.');
