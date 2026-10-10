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
