/* Marketing Platform Werkontwikkelbedrijven
   Inlezen en tonen van activiteiten uit data/activiteiten.json.
   Wordt gebruikt door index.html (drie eerstvolgende) en activiteiten.html (volledige kalender).
   Alle tekst wordt via textContent geplaatst, zodat aangeleverde inhoud geen HTML kan injecteren. */

const CATEGORIEEN = {
  bijeenkomsten: { naam: 'Bijeenkomsten', kleur: 'magenta' },
  workshops:     { naam: 'Workshops',     kleur: 'groen'   },
  deadlines:     { naam: 'Deadlines',     kleur: 'oranje'  },
  algemeen:      { naam: 'Algemeen',      kleur: 'blauw'   }
};

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
                 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function categorieVan(activiteit) {
  const sleutel = String(activiteit.categorie || '').trim().toLowerCase();
  return CATEGORIEEN[sleutel] || CATEGORIEEN.algemeen;
}

function datumDelen(datumTekst) {
  const d = new Date(datumTekst + 'T00:00:00');
  if (isNaN(d)) return null;
  return { dag: d.getDate(), maand: MAANDEN[d.getMonth()], jaar: d.getFullYear(), object: d };
}

function el(tag, klasse, tekst) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
}

/* Haalt de activiteiten op, sorteert chronologisch en laat afgelopen dagen weg. */
async function haalActiviteiten(pad) {
  const antwoord = await fetch(pad, { cache: 'no-cache' });
  if (!antwoord.ok) throw new Error('Bestand niet gevonden: ' + pad);
  const data = await antwoord.json();
  const vandaag = new Date();
  vandaag.setHours(0, 0, 0, 0);

  return (data.activiteiten || [])
    .map(a => ({ ...a, _datum: datumDelen(a.datum) }))
    .filter(a => a._datum && a._datum.object >= vandaag)
    .sort((a, b) => a._datum.object - b._datum.object);
}

/* ---------- Volledige kalender (activiteiten.html) ---------- */

function bouwKalenderItem(a) {
  const cat = categorieVan(a);
  const item = el('article', 'kalender-item item-' + cat.kleur);
  item.dataset.cat = cat.naam.toLowerCase();

  const datumblok = el('div', 'datumblok');
  datumblok.setAttribute('aria-hidden', 'true');
  datumblok.append(el('span', 'dag', String(a._datum.dag)), el('span', 'maand', a._datum.maand));

  const midden = document.createElement('div');
  midden.append(el('h3', null, a.titel || ''));
  if (a.omschrijving) midden.append(el('p', 'omschrijving', a.omschrijving));

  const meta = el('p', 'meta');
  if (a.locatie) meta.append(el('span', null, a.locatie));
  if (a.organisatie) meta.append(el('span', null, a.organisatie));
  if (meta.childElementCount) midden.append(meta);

  if (a.aanmeldlink) {
    const link = el('a', 'kaart-link', 'Meer informatie');
    link.href = a.aanmeldlink;
    link.rel = 'noopener';
    midden.append(link);
  }

  item.append(datumblok, midden, el('span', 'label label-' + cat.kleur, cat.naam));
  return item;
}

function activeerFilter() {
  const filters = document.querySelectorAll('.filter');
  const items = document.querySelectorAll('.kalender-item');
  const geenResultaten = document.getElementById('geen-resultaten');

  filters.forEach(f => f.addEventListener('click', () => {
    filters.forEach(x => x.classList.remove('actief'));
    f.classList.add('actief');
    const cat = f.dataset.cat;
    let zichtbaar = 0;
    items.forEach(item => {
      const toon = cat === 'alle' || item.dataset.cat === cat;
      item.classList.toggle('verborgen', !toon);
      if (toon) zichtbaar++;
    });
    if (geenResultaten) geenResultaten.hidden = zichtbaar > 0;
  }));
}

async function toonKalender(pad) {
  const lijst = document.querySelector('.kalender-lijst');
  const melding = document.getElementById('geen-resultaten');
  if (!lijst) return;

  try {
    const activiteiten = await haalActiviteiten(pad);
    if (!activiteiten.length) {
      if (melding) {
        melding.textContent = 'Er staan op dit moment geen activiteiten gepland. Houd deze pagina in de gaten.';
        melding.hidden = false;
      }
      return;
    }
    const fragment = document.createDocumentFragment();
    activiteiten.forEach(a => fragment.append(bouwKalenderItem(a)));
    lijst.prepend(fragment);
    activeerFilter();
  } catch (fout) {
    if (melding) {
      melding.textContent = 'De activiteiten konden niet worden geladen. Probeer het later opnieuw.';
      melding.hidden = false;
    }
    console.error('Activiteiten laden mislukt:', fout);
  }
}

/* ---------- Drie eerstvolgende activiteiten (index.html) ---------- */

function bouwHomepageKaart(a) {
  const cat = categorieVan(a);
  const kaart = el('a', 'activiteit-kaart kaart-' + cat.kleur);
  kaart.href = 'activiteiten.html';
  kaart.append(
    el('span', 'label label-' + cat.kleur, cat.naam),
    el('span', 'datum', `${a._datum.dag} ${a._datum.maand} ${a._datum.jaar}`),
    el('h3', null, a.titel || '')
  );
  if (a.locatie) kaart.append(el('span', 'locatie', a.locatie));
  return kaart;
}

async function toonEerstvolgende(pad, aantal = 3) {
  const rij = document.querySelector('.kaarten-rij');
  if (!rij) return;

  try {
    const activiteiten = (await haalActiviteiten(pad)).slice(0, aantal);
    rij.textContent = '';
    if (!activiteiten.length) {
      rij.append(el('p', 'omschrijving', 'Er staan op dit moment geen activiteiten gepland.'));
      return;
    }
    activiteiten.forEach(a => rij.append(bouwHomepageKaart(a)));
  } catch (fout) {
    rij.textContent = '';
    rij.append(el('p', 'omschrijving', 'De activiteiten konden niet worden geladen.'));
    console.error('Activiteiten laden mislukt:', fout);
  }
}
