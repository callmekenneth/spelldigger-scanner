# Dataformat och hashalgoritm (`sdh1`)

Underlag för kodgranskning och för att bygga samma hashar i Spelldiggers nattliga synk.

## Filer
- `data/db.json`: JSON-array med en rad per tryckning (format 2).
- `data/manifest.json`: beskriver filen. Genereras av `node scripts/manifest.mjs` och kontrolleras av bygget (`node scripts/manifest.mjs --check`). Bygget avbryts om manifestet inte stämmer med `db.json`.
- `data/sets.json`: vilka set databasen byggs för (kod, namn).

### Rad (format 2)
`[scryfall_id, name, set, collector_number, finishes, hash, oracle_id]`

| Fält | Typ | Anmärkning |
|---|---|---|
| `scryfall_id` | uuid | Tryckningens id (unikt i filen) |
| `name` | text | Scryfall-namn (visning) |
| `set` | text | Setkod |
| `collector_number` | text | Samlarnummer (kan innehålla bokstäver) |
| `finishes` | text | Bokstäver: `n` nonfoil, `f` foil, `e` etched |
| `hash` | 64 hex | Avtryck enligt nedan |
| `oracle_id` | uuid | Scryfalls Oracle-id (för dubbelsidiga kort: framsidans) |

### Manifest
`format`, `hash_algorithm` (`sdh1`), `hash_bits` (256), `row_fields`, `finishes_encoding`, `source`, `count`, `oracle_cards`, `sets`, `sha256` (av `db.json`-texten) och `version` = `sdh1-` + 12 första tecken av `sha256`. Versionen är innehållsbaserad och skickas i varje händelse som `db.version`.

Format 1 (tidigare) hade sex fält utan `oracle_id`.

## Hashalgoritmen `sdh1` (`src/hash.js`)
Samma kod bygger databasen och körs på telefonen. **Ändras något här måste algoritm-id bytas och hela databasen byggas om.**

Indata: en upprätt, perspektivrättad bild av kortet (kortet fyller bilden). I databasen används Scryfalls `small`-bild (146×204 px) oförändrad. På telefonen rätas kortet ut till 146×204 (homografi, 4 samplingar per pixel).

1. Gråvärde per pixel: `0.299·R + 0.587·G + 0.114·B`.
2. Två områden (andelar av bildens bredd/höjd, `[x0, y0, x1, y1]`): **kort** `[0.04, 0.03, 0.96, 0.97]` och **bildruta** `[0.08, 0.11, 0.92, 0.55]`.
3. **pHash** per område: området medelvärdesbildas ner till 32×32 gråvärden. 2D-DCT beräknas för koefficienterna `u, v ∈ 0..7` (`Σ g[y][x]·cos((2x+1)uπ/64)·cos((2y+1)vπ/64)`, utan normalisering), i ordningen `v` yttre, `u` inre (64 koefficienter). Medianen räknas på de 63 koefficienterna utom `(0,0)` som medelvärdet av element 31 och 32 (0-baserat) i sorterad ordning. Bit = `koefficient > median` för alla 64 (även `(0,0)`).
4. **dHash** per område: medelvärdesbildas ner till 9×8 (bredd×höjd). Bit för varje rad `y` (0–7) och kolumn `x` (0–7), radvis: `g[y][x] < g[y][x+1]`.
5. Biten packas 4 per hextecken, första biten högst. 64 bitar = 16 hextecken.
6. Avtryck = `pHash(kort) + dHash(kort) + pHash(bildruta) + dHash(bildruta)` = 4 × 16 = **64 hextecken (256 bitar)**.

Avstånd = Hamming-avstånd över de 256 bitarna. I minnet packas varje avtryck som 8 × uint32 (8 hextecken per ord, big-endian).

## Matchning (`src/core.js`)
1. Kortets hörn hittas (färg- och kantdetektering, robust rektangelpassning) och ger startgissningar.
2. Startgissningarna (båda orienteringarna, 0° och 180°) poängsätts mot hela databasen. De två bästa förfinas genom att hörnen flyttas så länge avståndet till närmaste databasrad minskar.
3. Resultatet är avståndet till varje databasrad för den bästa hörnuppsättningen. Kandidater, `gap` och `printing_gap` beräknas av sidan, se [integration.md](integration.md).

## Kända begränsningar
- Databasen täcker bara de set som listas i manifestet.
- Hasharna byggdes i en webbläsare från `small`-bilderna. `tools/build-db.mjs` (Node, `sharp`) är skrivet men ännu inte körd mot Scryfall; JPEG-avkodning kan skilja någon enstaka bit.
- Skanningsavstånd för rätt kort ligger normalt på 20–60 bitar; olika tryckningar av samma kort kan ligga närmare än så, se `printing` i kontraktet.
