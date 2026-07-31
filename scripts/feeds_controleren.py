#!/usr/bin/env python3
"""
Feeds controleren voor het Marketing Platform Werkontwikkelbedrijven.

Zoekt per website of er een RSS- of Atom-feed beschikbaar is. Bedoeld voor de
inventarisatie van nieuwsbronnen van de aangesloten werkontwikkelbedrijven.

Gebruik:
    python3 scripts/feeds_controleren.py https://www.voorbeeld.nl https://www.tweede.nl
    python3 scripts/feeds_controleren.py --bestand websites.txt

Het script raadt niets: het meldt alleen wat het daadwerkelijk heeft kunnen ophalen.
"""

import argparse
import re
import sys
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

USER_AGENT = "MarketingPlatformWerkontwikkelbedrijven/1.0 (+https://www.marketingplatformnl.nl)"
TIJDLIMIET = 15

# Veelgebruikte paden, in volgorde van waarschijnlijkheid.
PADEN = ["/feed/", "/feed", "/rss", "/rss.xml", "/atom.xml", "/index.xml",
         "/nieuws/feed/", "/actueel/feed/", "?feed=rss2"]

LINK_TAG = re.compile(
    r"""<link[^>]+type=["']application/(?:rss|atom)\+xml["'][^>]*>""",
    re.IGNORECASE)
HREF = re.compile(r"""href=["']([^"']+)["']""", re.IGNORECASE)


def ophalen(url: str, alleen_kop: bool = False):
    verzoek = Request(url, headers={"User-Agent": USER_AGENT})
    if alleen_kop:
        verzoek.get_method = lambda: "HEAD"
    return urlopen(verzoek, timeout=TIJDLIMIET)


def is_feed(url: str) -> bool:
    """Controleert of de URL daadwerkelijk een feed teruggeeft."""
    try:
        with ophalen(url) as antwoord:
            soort = antwoord.headers.get("Content-Type", "").lower()
            begin = antwoord.read(600).decode("utf-8", "ignore").lstrip()
    except (URLError, HTTPError, TimeoutError, OSError):
        return False
    if any(s in soort for s in ("rss", "atom", "xml")):
        return True
    return "<rss" in begin.lower() or "<feed" in begin.lower()


def feed_in_paginabron(website: str) -> str | None:
    """Leest de startpagina en zoekt naar een aangekondigde feed in de broncode."""
    try:
        with ophalen(website) as antwoord:
            bron = antwoord.read(200_000).decode("utf-8", "ignore")
    except (URLError, HTTPError, TimeoutError, OSError):
        return None
    for tag in LINK_TAG.findall(bron):
        gevonden = HREF.search(tag)
        if gevonden:
            return urljoin(website, gevonden.group(1))
    return None


def website_controleren(website: str) -> tuple[str, str]:
    if not website.startswith(("http://", "https://")):
        website = "https://" + website

    aangekondigd = feed_in_paginabron(website)
    if aangekondigd and is_feed(aangekondigd):
        return "gevonden", aangekondigd

    for pad in PADEN:
        kandidaat = urljoin(website, pad)
        if is_feed(kandidaat):
            return "gevonden", kandidaat

    if aangekondigd:
        return "twijfel", f"{aangekondigd} (aangekondigd in de broncode, maar niet op te halen)"
    return "niet gevonden", "handmatig aanleveren of site raadplegen"


def main() -> int:
    argumenten = argparse.ArgumentParser(description="Controleer welke websites een feed hebben.")
    argumenten.add_argument("websites", nargs="*", help="een of meer website-adressen")
    argumenten.add_argument("--bestand", help="tekstbestand met een website per regel")
    opties = argumenten.parse_args()

    lijst = list(opties.websites)
    if opties.bestand:
        with open(opties.bestand, encoding="utf-8") as bestand:
            lijst += [r.strip() for r in bestand if r.strip() and not r.startswith("#")]

    if not lijst:
        argumenten.print_help()
        return 1

    resultaten = []
    for website in lijst:
        status, toelichting = website_controleren(website)
        resultaten.append((website, status, toelichting))
        print(f"{status.upper():<14} {website}\n               {toelichting}\n")

    gevonden = [r for r in resultaten if r[1] == "gevonden"]
    print(f"Samenvatting: {len(gevonden)} van de {len(resultaten)} websites hebben een bruikbare feed.")

    if gevonden:
        print("\nRegels om over te nemen in data/bronnen.json:\n")
        for website, _, feed in gevonden:
            naam = website.split("//")[-1].split("/")[0].replace("www.", "")
            print(f'    {{ "naam": "{naam}", "website": "{website}", "feed": "{feed}", "actief": true }},')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
