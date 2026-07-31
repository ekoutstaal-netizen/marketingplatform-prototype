/* Marketing Platform Werkontwikkelbedrijven
   Inlezen en tonen van berichten uit data/berichten.json.
   Wordt gebruikt door berichten.html (volledig overzicht) en index.html (laatste drie).
   Alle tekst wordt via textContent geplaatst, zodat inhoud uit externe feeds
   geen HTML of script kan injecteren. Alleen de link naar de bron is klikbaar. */

const MAANDEN_BERICHT = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
                         'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

function maakElement(tag, klasse, tekst) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst !== undefined) e.textContent = tekst;
  return e;
}

function datumTekst(datum) {
  if (!datum) return '';
  const d = new Date(datum + 'T00:00:00');
  if (isNaN(d)) return '';
  return `${d.getDate()} ${MAANDEN_BERICHT[d.getMonth()]} ${d.getFullYear()}`;
}

/* Alleen http- en https-links toestaan, om javascript:-links uit een feed te weren. */
function veiligeLink(url) {
  try {
    const adres = new URL(url, window.location.href);
    return ['http:', 'https:'].includes(adres.protocol) ? adres.href : null;
  } catch {
    return null;
  }
}

async function haalBerichten(pad) {
  const antwoord = await fetch(pad, { cache: 'no-cache' });
  if (!antwoord.ok) throw new Error('Bestand niet gevonden: ' + pad);
  const data = await antwoord.json();
  return (data.berichten || [])
    .filter(b => b.titel && veiligeLink(b.link))
    .sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
}

/* ---------- Volledig overzicht (berichten.html) ---------- */

function bouwBericht(b) {
  const artikel = maakElement('article', 'bericht-kaart');
  artikel.dataset.bron = b.bron || '';

  const kop = maakElement('div', 'bericht-kop');
  kop.append(maakElement('span', 'label label-oranje', b.bron || 'Nieuws'));
  const datum = datumTekst(b.datum);
  if (datum) kop.append(maakElement('span', 'bericht-datum', datum));
  artikel.append(kop);

  const titel = maakElement('h3');
  const link = maakElement('a', null, b.titel);
  link.href = veiligeLink(b.link);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  titel.append(link);
  artikel.append(titel);

  if (b.samenvatting) artikel.append(maakElement('p', 'omschrijving', b.samenvatting));
  artikel.append(maakElement('span', 'bericht-herkomst', 'Lees verder op de site van ' + (b.bron || 'de bron')));
  return artikel;
}

function bouwBronfilter(bronnen, lijst, melding) {
  const balk = document.querySelector('.bronfilter');
  if (!balk || bronnen.length < 2) return;

  const maakKnop = (label, waarde, actief) => {
    const knop = maakElement('button', 'filter' + (actief ? ' actief' : ''), label);
    knop.dataset.bron = waarde;
    knop.addEventListener('click', () => {
      balk.querySelectorAll('.filter').forEach(k => k.classList.remove('actief'));
      knop.classList.add('actief');
      let zichtbaar = 0;
      lijst.querySelectorAll('.bericht-kaart').forEach(kaart => {
        const toon = waarde === 'alle' || kaart.dataset.bron === waarde;
        kaart.classList.toggle('verborgen', !toon);
        if (toon) zichtbaar++;
      });
      if (melding) {
        melding.textContent = 'Geen berichten van deze organisatie. Kies een andere bron.';
        melding.hidden = zichtbaar > 0;
      }
    });
    return knop;
  };

  balk.append(maakKnop('Alle bronnen', 'alle', true));
  bronnen.forEach(bron => balk.append(maakKnop(bron, bron, false)));
}

async function toonBerichten(pad) {
  const lijst = document.querySelector('.berichten-lijst');
  const melding = document.getElementById('geen-berichten');
  if (!lijst) return;

  try {
    const berichten = await haalBerichten(pad);
    if (!berichten.length) {
      if (melding) {
        melding.textContent = 'Er zijn nog geen berichten verzameld. Zodra leden hun nieuwsbron aanleveren, verschijnen de berichten hier.';
        melding.hidden = false;
      }
      return;
    }
    const fragment = document.createDocumentFragment();
    berichten.forEach(b => fragment.append(bouwBericht(b)));
    lijst.prepend(fragment);

    const bronnen = [...new Set(berichten.map(b => b.bron).filter(Boolean))].sort();
    bouwBronfilter(bronnen, lijst, melding);
  } catch (fout) {
    if (melding) {
      melding.textContent = 'De berichten konden niet worden geladen. Probeer het later opnieuw.';
      melding.hidden = false;
    }
    console.error('Berichten laden mislukt:', fout);
  }
}

/* ---------- Laatste berichten op de homepage ---------- */

async function toonLaatsteBerichten(pad, aantal = 3) {
  const rij = document.querySelector('.berichten-rij');
  const sectie = document.getElementById('laatste-berichten');
  if (!rij) return;

  try {
    const berichten = (await haalBerichten(pad)).slice(0, aantal);
    if (!berichten.length) {
      if (sectie) sectie.hidden = true;      // blok verbergen zolang er niets te tonen is
      return;
    }
    rij.textContent = '';
    berichten.forEach(b => {
      const kaart = maakElement('a', 'activiteit-kaart kaart-oranje');
      kaart.href = veiligeLink(b.link);
      kaart.target = '_blank';
      kaart.rel = 'noopener noreferrer';
      kaart.append(maakElement('span', 'label label-oranje', b.bron || 'Nieuws'));
      const datum = datumTekst(b.datum);
      if (datum) kaart.append(maakElement('span', 'datum', datum));
      kaart.append(maakElement('h3', null, b.titel));
      if (b.samenvatting) kaart.append(maakElement('span', 'locatie', b.samenvatting.slice(0, 90)));
      rij.append(kaart);
    });
    if (sectie) sectie.hidden = false;
  } catch (fout) {
    if (sectie) sectie.hidden = true;
    console.error('Berichten laden mislukt:', fout);
  }
}
