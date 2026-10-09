# Spelldigger Scanner

Kortskanner för Magic: The Gathering. Telefonens kamera identifierar kortet **på enheten** och lägger det i en lista som kan exporteras till Spelldiggers samlingsimport (`scryfall_id,finish,quantity`). Tills vidare ett eget repo; tanken är att det senare flyttas in i Spelldigger-repot som en egen slice.

Provkör: <https://callmekenneth.github.io/spelldigger-scanner/> (efter att GitHub Pages är påslaget, se nedan).

## Så fungerar det
1. **Hörn:** kortets fyra hörn hittas (färg/kantdetektering + robust rektangelpassning) och förfinas genom att flytta hörnen tills träffen mot databasen blir så nära som möjligt.
2. **Avtryck:** kortet rätas ut till 146×204 px och får ett perceptuellt avtryck (pHash + dHash över hela kortet och över bildrutan, 256 bitar).
3. **Match:** minsta Hamming-avstånd mot `data/db.json`. Avstånd och marginal till näst bästa *andra* kort styr indikatorn Confident / Check it / Unsure.
4. **Live scan:** kameraflödet analyseras ~5 gånger/s. Bilden tas automatiskt när kortet ligger helt i bild, har legat stilla och är skarpt. Kräver HTTPS (därför GitHub Pages).

Allt körs i webbläsaren. Inga anrop till betald AI, ingen server, ingen kostnad per användare.

## Kommandon
```
npm install
npm run build      # skapar dist/index.html (en enda fil)
npm run check      # syntaxkontroll av sidans script
npm run bench      # kör igenkänningen på foton i bench/ (se Test)
npm run build-db   # bygger om data/db.json från Scryfall (se Databasen)
```
Öppna `dist/index.html` via en lokal webbserver (`npx serve dist`) om du vill testa lokalt. Kameran fungerar bara på HTTPS eller `localhost`.

## Publicering (GitHub Pages)
`.github/workflows/pages.yml` bygger och publicerar vid varje push till `main`. Slå på en gång: **Settings → Pages → Source: GitHub Actions**. Gratis Pages kräver publikt repo.

## Databasen
`data/db.json`: en rad per tryckning, `[scryfall_id, namn, set, samlarnummer, finish-bokstäver (n/f/e), hash64hex]`. Seten listas i `data/sets.json`.
- `src/hash.js` används både när databasen byggs och på telefonen. **Ändra den inte utan att bygga om databasen.**
- `tools/build-db.mjs` hämtar från Scryfall (följer deras regler: User-Agent, paus mellan anrop, bilder från `*.scryfall.io`). Skriptet är skrivet men ännu inte körd mot Scryfall; nuvarande `db.json` byggdes i webbläsare från samma bilder och hash-kod. Kör det i en GitHub Action (Scryfall är nåbart där) eller lokalt och jämför några rader mot nuvarande fil.

## Test
`npm run bench` läser `bench/labels.json` (`{"bild.jpg": "Kortnamn" | null}`, `null` = finns inte i databasen) och JPG-filer i `bench/`. Mappen ingår inte i repot (privata foton). Resultat på 10 egna foton: 7/7 av korten som finns i databasen identifierades rätt, de 3 som saknades fick "Unsure". Det är ett litet underlag, samma bakgrund och belysning; fler foton behövs.

## Kända begränsningar
- Databasen täcker bara 7 set. Hela Standard eller fler set är nästa steg.
- Skilja mellan tryckningar med samma bild i olika set är svårt för hashning; OCR av samlarnummer är planerat.
- Skärpe- och stillhetströsklarna i live-läget är kalibrerade på stillbilder, inte på riktig rörelseoskärpa.
- Foil, sleeves och reflexer ger högre avstånd (Check it).

## Fan Content
Kortbilder och kortdata kommer från Scryfall. Magic: The Gathering är ett varumärke som tillhör Wizards of the Coast. Detta är inofficiellt Fan Content enligt Fan Content Policy och inte godkänt av eller kopplat till Wizards of the Coast. © Wizards of the Coast LLC.
