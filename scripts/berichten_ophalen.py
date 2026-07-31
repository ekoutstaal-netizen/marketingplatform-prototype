#!/usr/bin/env python3
"""
Berichten ophalen voor het Marketing Platform Werkontwikkelbedrijven.

Leest data/bronnen.json, haalt de RSS- of Atom-feeds op van de actieve bronnen,
normaliseert de berichten en schrijft data/berichten.json.

Alleen titel, korte samenvatting, datum, bron en de originele link worden opgeslagen.
Volledige artikelen worden bewust niet overgenomen, in verband met het auteursrecht.

Gebruik:
    python3 scripts/berichten_ophalen.py
    python3 scripts/berichten_ophalen.py --droogloop     toont resultaat zonder wegschrijven
"""

import argparse
import hashlib
import html
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    import feedparser
except ImportError:
    sys.exit("feedparser ontbreekt. Installeer met: pip install feedparser")

WORTEL = Path(__file__).resolve().parent.parent
BRONNEN = WORTEL / "data" / "bronnen.json"
UITVOER = WORTEL / "data" / "berichten.json"

USER_AGENT = "MarketingPlatformWerkontwikkelbedrijven/1.0 (+https://www.marketingplatformnl.nl)"
TIJDLIMIET = 20


def tekst_uit_html(ruwe_tekst: str) -> str:
    """Haalt opmaak weg en normaliseert witruimte."""
    if not ruwe_tekst:
        return ""
    zonder_tags = re.sub(r"<[^>]+>", " ", ruwe_tekst)
    ontdaan = html.unescape(zonder_tags)
    return re.sub(r"\s+", " ", ontdaan).strip()


def inkorten(tekst: str, maximum: int) -> str:
    """Kort in op een woordgrens en sluit af met een beletselteken."""
    if len(tekst) <= maximum:
        return tekst
    afgekapt = tekst[:maximum].rsplit(" ", 1)[0].rstrip(" ,;:.-")
    return afgekapt + "…"


def datum_van(item) -> str | None:
    """Geeft de publicatiedatum als JJJJ-MM-DD, of None als die ontbreekt."""
    for veld in ("published_parsed", "updated_parsed", "created_parsed"):
        deel = getattr(item, veld, None) or item.get(veld)
        if deel:
            try:
                return datetime(*deel[:6], tzinfo=timezone.utc).date().isoformat()
            except (TypeError, ValueError):
                continue
    return None


def bevat_blokkeerwoord(bericht: dict, woorden: list) -> bool:
    if not woorden:
        return False
    inhoud = (bericht["titel"] + " " + bericht["samenvatting"]).lower()
    return any(w.strip().lower() in inhoud for w in woorden if w.strip())


def bron_verwerken(bron: dict, instellingen: dict, ondergrens) -> tuple[list, str]:
    """Haalt een enkele feed op. Geeft de berichten en een statusregel terug."""
    naam = bron.get("naam", "onbekende bron")
    feed_url = bron.get("feed", "")
    if not feed_url:
        return [], f"{naam}: geen feed-URL ingevuld"

    try:
        feed = feedparser.parse(feed_url, agent=USER_AGENT, request_headers={"Accept": "application/rss+xml, application/atom+xml, application/xml"})
    except Exception as fout:                                   # noqa: BLE001
        return [], f"{naam}: ophalen mislukt ({fout})"

    if getattr(feed, "bozo", 0) and not feed.entries:
        return [], f"{naam}: feed onleesbaar of leeg ({getattr(feed, 'bozo_exception', 'onbekende oorzaak')})"

    berichten = []
    for item in feed.entries[: instellingen["maxPerBron"] * 3]:
        link = (item.get("link") or "").strip()
        titel = tekst_uit_html(item.get("title", ""))
        if not link or not titel:
            continue

        datum = datum_van(item)
        if datum and datum < ondergrens:
            continue

        ruwe_samenvatting = item.get("summary") or ""
        if not ruwe_samenvatting and item.get("content"):
            ruwe_samenvatting = item["content"][0].get("value", "")

        bericht = {
            "id": hashlib.sha1(link.encode("utf-8")).hexdigest()[:16],
            "titel": inkorten(titel, 140),
            "samenvatting": inkorten(tekst_uit_html(ruwe_samenvatting),
                                     instellingen["maxTekensSamenvatting"]),
            "datum": datum or "",
            "bron": naam,
            "link": link,
        }

        if bevat_blokkeerwoord(bericht, instellingen.get("blokkeerwoorden", [])):
            continue

        berichten.append(bericht)
        if len(berichten) >= instellingen["maxPerBron"]:
            break

    return berichten, f"{naam}: {len(berichten)} berichten"


def main() -> int:
    argumenten = argparse.ArgumentParser(description="Berichten ophalen uit de feeds van de leden.")
    argumenten.add_argument("--droogloop", action="store_true",
                            help="toont het resultaat zonder berichten.json te overschrijven")
    opties = argumenten.parse_args()

    if not BRONNEN.exists():
        print(f"Bronnenbestand niet gevonden: {BRONNEN}", file=sys.stderr)
        return 1

    configuratie = json.loads(BRONNEN.read_text(encoding="utf-8"))
    standaard = {"maxPerBron": 8, "maxTotaal": 60, "maxLeeftijdDagen": 365,
                 "maxTekensSamenvatting": 220, "blokkeerwoorden": []}
    instellingen = {**standaard, **configuratie.get("instellingen", {})}

    actieve_bronnen = [b for b in configuratie.get("bronnen", []) if b.get("actief")]
    if not actieve_bronnen:
        print("Geen actieve bronnen. Zet minimaal een bron op actief in data/bronnen.json.")

    ondergrens = (datetime.now(timezone.utc).date()
                  - timedelta(days=instellingen["maxLeeftijdDagen"])).isoformat()

    alle_berichten, mislukt = [], 0
    for bron in actieve_bronnen:
        berichten, melding = bron_verwerken(bron, instellingen, ondergrens)
        print("  " + melding)
        if not berichten:
            mislukt += 1
        alle_berichten.extend(berichten)

    # Ontdubbelen op de link, nieuwste eerst, en aftoppen op het maximum.
    uniek = {}
    for bericht in alle_berichten:
        uniek.setdefault(bericht["id"], bericht)
    gesorteerd = sorted(uniek.values(), key=lambda b: (b["datum"] or "", b["titel"]), reverse=True)
    gesorteerd = gesorteerd[: instellingen["maxTotaal"]]

    resultaat = {
        "laatstBijgewerkt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "aantal": len(gesorteerd),
        "berichten": gesorteerd,
    }

    print(f"\nTotaal {len(gesorteerd)} berichten uit {len(actieve_bronnen) - mislukt} "
          f"van de {len(actieve_bronnen)} bronnen.")

    if opties.droogloop:
        print("Droogloop: er is niets weggeschreven.")
        return 0

    # Alleen wegschrijven als de berichten zelf wijzigen, zodat er geen lege commits ontstaan.
    if UITVOER.exists():
        try:
            bestaand = json.loads(UITVOER.read_text(encoding="utf-8")).get("berichten", [])
            if bestaand == gesorteerd:
                print("Geen wijzigingen ten opzichte van het bestaande bestand.")
                return 0
        except (json.JSONDecodeError, OSError):
            pass

    UITVOER.parent.mkdir(parents=True, exist_ok=True)
    UITVOER.write_text(json.dumps(resultaat, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Weggeschreven naar {UITVOER.relative_to(WORTEL)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
