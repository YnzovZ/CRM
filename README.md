# Keynote feedback

Mobiele pagina die bezoekers openen via een QR-code aan het einde van een keynote. Ze geven een cijfer van 1 tot 10, schrijven waarom, en kunnen aangeven of ze interesse hebben in een talk voor hun eigen organisatie. Daarna gaan ze door naar de samenvatting van de keynote. Alle antwoorden komen in een Google Sheet.

## Bestanden

- `index.html`, `styles.css`, `app.js`: het formulier
- `config.js`: hier zet je de URL van je Google Sheet-koppeling
- `samenvatting/`: de samenvatting, nagebouwd uit het Claude Design-artifact "Handout telefoon", met logo's, fonts en Spotify-code in `samenvatting/assets/`
- `apps-script/Code.gs`: het script dat antwoorden in de Google Sheet zet

## Stap 1. Google Sheet koppelen

1. Maak een nieuwe Google Sheet, bijvoorbeeld "Keynote feedback".
2. Ga naar Extensies > Apps Script.
3. Vervang de inhoud door `apps-script/Code.gs`. Wil je bij elke lead een mail, vul dan `NOTIFY_EMAIL` in.
4. Klik op Implementeren > Nieuwe implementatie > type Web-app.
   - Uitvoeren als: ikzelf
   - Toegang: iedereen
5. Geef toestemming als Google erom vraagt en kopieer de web-app-URL (eindigt op `/exec`).
6. Plak die URL in `config.js` bij `endpoint`.

Het tabblad "Feedback" met kopjes wordt automatisch aangemaakt bij de eerste inzending.

## Stap 2. Live zetten op Vercel

1. In Vercel: Add New > Project, kies de GitHub-repo `YnzovZ/CRM`.
2. Framework preset: Other. Geen build-commando nodig.
3. Deploy.

## Stap 3. QR-code

Open `/qr/` op je eigen Vercel-adres en download de code als PNG of SVG. Eén code werkt voor al je keynotes; via het tijdstip in de sheet zie je welke reactie bij welk event hoort. Wil je toch per event filteren, vul dan op die pagina een eventnaam in.

## Samenvatting aanpassen

De samenvatting is een losse kopie van het artifact "Handout telefoon". Pas je het ontwerp aan in Claude Design, vraag dan in een sessie om `samenvatting/index.html` bij te werken naar de nieuwe versie.

## PDF van de kernpunten

`samenvatting/kernpunten-ynzo.pdf` wordt gemaakt van de samenvattingspagina. Na elke wijziging aan de samenvatting opnieuw maken:

```
python3 -m http.server 8765 &
python3 scripts/make_pdf.py
```

## Automatische controle

Elke ochtend controleert een geplande Claude-taak of het artifact in `samenvatting/bron.json` een nieuwe versie heeft. Zo ja, dan zet de taak de nieuwe versie klaar op de branch `handout-update` (testlink via Vercel) en krijg je een melding. Pas als je "live" zegt, gaat de nieuwe versie naar de productiebranch.

## Dashboard

`/dashboard/` laat per dag het gemiddelde cijfer, de verdeling, de leads en alle toelichtingen zien. De gegevens komen uit dezelfde Google Sheet, via het Apps Script, en zijn afgeschermd met `DASHBOARD_KEY` in `apps-script/Code.gs`. Vul daar zelf een lange sleutel in (minimaal 16 tekens) en implementeer opnieuw via Implementaties beheren. Op je telefoon open je `/dashboard/`, vul je de sleutel één keer in en zet je de pagina op je beginscherm.

Groeperen gaat in deze volgorde: eerst op talkcode (kolom Event), los van het tijdstip, en op de datum van de talk. Pas je in de sheet "algemeen" aan naar een talkcode, dan schuift die reactie bij de volgende keer verversen naar die talk. Hoofdletters en spaties maken niet uit. Alleen reacties op "algemeen" worden op tijd gesplitst: na een gat van meer dan 90 minuten begint een nieuwe groep, mits daarna minstens 3 reacties volgen.

## Beheer

`/beheer/` is de beheeromgeving voor op je desktop, met dezelfde sleutel als het dashboard. Onderdelen:

- **Talks & QR**: maak per talk een QR-code (`/?event=<code>`) en kies welke hand-out mensen na het formulier zien. Talks staan in het tabblad "Talks" van de Google Sheet.
- **Feedback**: gemiddelde, aantal reacties en leads per talk. Klik op een talk (of op het cijfer in "alle talks") en hij klapt open met de verdeling en alle reacties, cijfers en leads.
- **Contacten**: plek voor het toekomstige CRM.

De hand-out wordt pas bepaald op het moment dat iemand scant. Een QR-code blijft dus geldig, ook als je later een klantversie koppelt.

Beschikbare hand-outs staan in `handouts.json`. Een klantversie komt in `handouts/<naam>/` en krijgt daar een regel.

Alle schermen praten via `lib/api.js` met de opslag. Gaat het systeem later naar een echte database, dan verandert alleen dat bestand.

### Agenda

Het blok "aankomend in je agenda" toont afspraken uit Google Agenda met het woord "talk" in de beschrijving of titel, voor de komende 6 maanden (`CALENDAR_ID`, `TALK_WORD` en `AGENDA_DAYS` in `apps-script/Code.gs`). Met "QR maken" wordt de talk voorgevuld en gekoppeld aan de afspraak (kolom "Agenda-ID" in het tabblad Talks). Eenmalig nodig: draai `testAgenda` in de Apps Script-editor om toegang tot je agenda te geven.

### Leads en Gmail

In een opengeklapte talk staan de leads bovenaan. Per lead kijkt het script in je verzonden Gmail of er sinds de reactie een mail naar dat adres is gegaan: groen "gemaild" met datum, of "nog niet gemaild". Eenmalig nodig: draai `testGmail` in de Apps Script-editor om toegang te geven. Het script leest alleen verzonden mail en zoekt alleen op de e-mailadressen van leads.

Contact buiten Gmail (telefoon, LinkedIn) vink je zelf af met "contact gehad". Dat komt met datum in de kolom "Contact gehad" van het tabblad Feedback en gaat voor op de Gmail-check.
