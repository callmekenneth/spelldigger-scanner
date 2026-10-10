# Integration med Spelldigger (kontrakt 2)

**Princip:** skannern *identifierar* kortversionen, Spelldigger *sparar*. Skannern lämnar exakt Scryfall-version eller kandidater att bekräfta. Antal, vald finish, skick, plats och användarens sparbekräftelse hanteras av Spelldiggers tilläggsflöde. Passar D03 (ingen betald AI per användaråtgärd; bearbetning på enheten är tillåten).

Kontrakt 1 (första skissen) ersätts av detta. Ingen konsument finns ännu, så ändringen är inte bakåtkompatibel.

## 1. Händelser
Tre `CustomEvent` skickas på `window`. `detail` är ren JSON. `window.SpelldiggerScanner.contract` är `2`.

### `sd:candidates`: kandidater för en skanning
```json
{
  "contract": 2,
  "scan_id": "9b1f0c6e-…",
  "revision": 1,
  "source": "live",
  "db": { "version": "sdh1-56f4fc0a2fae", "format": 2, "hash_algorithm": "sdh1", "count": 2725 },
  "confidence": "confident",
  "match": { "distance": 26, "gap": 52, "gap_basis": "oracle_id", "printing": "distinct", "printing_gap": 84 },
  "candidates": [
    { "scryfall_id": "…", "oracle_id": "…", "name": "…", "set": "msh", "collector_number": "187",
      "finishes": ["nonfoil", "foil"], "distance": 26 }
  ]
}
```
- `candidates`: sorterade, bäst först, högst 6. Samma kort kan förekomma i flera tryckningar.
- `source`: `live` (auto- eller manuell fångst i live-läget) eller `photo` (foto/vald bild).
- `name`, `set`, `collector_number` och `finishes` är **visningshjälp**. `finishes` är de finish tryckningen finns i, **inte** vilken finish det skannade exemplaret har.

### `sd:confirm`: användaren bekräftade en kortversion
```json
{
  "contract": 2, "scan_id": "9b1f0c6e-…", "revision": 2, "source": "live",
  "db": { "…": "som ovan" },
  "confidence": "confident",
  "match": { "…": "som i sd:candidates" },
  "candidate": { "scryfall_id": "…", "…": "…" },
  "selected_rank": 1,
  "changed_by_user": true
}
```
Händelsen överlämnar vald kortversion till Spelldiggers tilläggsflöde. Den är **inte** ett sparkommando. Spelldigger frågar efter antal, finish, skick och plats och ber användaren bekräfta sparandet.
- `revision` är samma som i den senaste `sd:candidates` för skanningen.
- `confidence` och `match` är kopierade från den `sd:candidates` användaren valde ur och **ändras aldrig av användarens val**. `selected_rank` (0 = bäst) och `changed_by_user` visar om användaren valde något annat än förstaförslaget.
- Skannern skickar aldrig antal, finish, skick eller plats.

### `sd:cancel`: skanningen är avbruten
```json
{ "contract": 2, "scan_id": "9b1f0c6e-…", "reason": "new_scan | resumed | stopped" }
```
Skickas bara för skanningar som inte hunnit bekräftas. Allt i Spelldigger som hänger ihop med `scan_id` (kandidatlista, öppet tilläggsflöde som ännu inte sparats) ska då släppas. Inga fler händelser kommer för det `scan_id`.

## 2. `scan_id` och livscykel
Ett `scan_id` (UUID v4) hör till **en skanning**: ett fångat kort från identifiering till bekräftelse eller avbrott.

```
identifying ──► candidates ──► confirmed        (slut; sd:confirm skickat)
     │              │
     └──────────────┴──────► cancelled          (slut; sd:cancel skickat)
```
Regler:
1. **Nytt ID för varje avsiktlig ny skanning**, även av samma kortversion (ny fångst, nytt foto, "Capture now" en gång till).
2. **Samma ID och stigande `revision`** när samma bild identifieras om (användaren drar i hörnen eller trycker "Identify again"). En senare `sd:candidates` ersätter en tidigare med samma `scan_id`, så länge skanningen inte är bekräftad.
3. **Exakt en `sd:confirm` per `scan_id`.** Efter bekräftelse ignorerar skannern alla fler Add-klick och sena resultat för det ID:t. En bekräftad skanning ersätts aldrig. Spelldigger bör använda `scan_id` som idempotensnyckel mot sitt sparflöde; hur den hanterar återförsök vid sparning är Spelldiggers sak.
4. **Sena resultat kastas.** Identifieringen tar några sekunder. Om skanningen hunnit avbrytas eller ersättas under tiden skickas inget `sd:candidates` för den.
5. **Paus, återupptagning, stopp** (live-läget):
   - *Paus:* medan ett resultat visas (skanningen är i `candidates`) analyserar skannern inga nya bilder. Inga nya skanningar startar.
   - *Återupptagning* ("Back to live scan", eller automatiskt efter bekräftelse): en obekräftad skanning avbryts (`sd:cancel`, `reason: "resumed"`). En bekräftad rörs inte. Kameran återgår till att leta kort.
   - *Stopp* ("Stop", sidan döljs eller kameran avbryts): kameran släpps och en obekräftad skanning avbryts (`reason: "stopped"`). Inga händelser skickas medan kameran är stoppad.
   - *Ny skanning* (nytt foto eller ny fångst medan en obekräftad skanning finns): den gamla avbryts (`reason: "new_scan"`).
6. **Kvarhållet kort:** ett kort som redan skannats i live-läget fångas inte om automatiskt. Det måste först lämna bilden eller flyttas märkbart. Det hindrar dubbla skanningar när kortet ligger kvar efter bekräftelse eller efter "Back to live scan".

## 3. Vad `confidence` betyder
`confidence` (`confident` | `check` | `unsure`) är algoritmens bedömning av **vilket kort** (Oracle-kort) som syns, inte vilken tryckning.

- **"Samma kort" avgörs med Oracle-ID** (`oracle_id`). Jämförelsen använder inte kortnamn (fem Oracle-kort har flera namn i databasen).
- `match.distance`: Hamming-avstånd (0–256 bitar) mellan skanningen och bästa kandidat.
- `match.gap`: avståndet till närmaste kandidat med **annat Oracle-ID**, minus `distance`. Beräknas över hela databasen, inte bara de sex kandidaterna. `gap_basis` är alltid `"oracle_id"`.
- Nivåer (provisoriska; kalibrerade på 10 egna foton, behöver mer data):
  - `confident`: `distance ≤ 50` och `gap ≥ 30`
  - `check`: `distance ≤ 70` och `gap ≥ 20`
  - `unsure`: övrigt. Betyder ofta att kortet inte finns i databasen.
- **`confidence` säger inget om vilken tryckning som är rätt.** Det gör `match.printing`:
  - `match.printing_gap`: avståndet till närmaste *annan tryckning av samma Oracle-kort*, minus `distance`. `null` om kortet bara har en tryckning i databasen.
  - `match.printing`: `"ambiguous"` om `printing_gap < 15` (annan tryckning ligger så nära att skanningens brus kan förväxla dem), annars `"distinct"`. Tröskeln är provisorisk: i databasen har 11 % av korten med flera tryckningar en annan tryckning inom 14 bitar; skanningar ger normalt 20–60 bitars avstånd.
  - Vid `ambiguous` ska Spelldigger låta användaren välja tryckning (set och samlarnummer) och aldrig lägga till tyst, även om `confidence` är `confident`.
- Användarens bekräftelse ändrar aldrig `confidence`, se `sd:confirm`.

### Kantfall
- **Ingen jämförelsekandidat** (alla databasrader är samma Oracle-kort): `match.gap` är `null`. Nivån blir då högst `check` (aldrig `confident`).
- **Tom kandidatlista:** skannern skickar i nuläget aldrig en tom lista, eftersom databasen är inbyggd. En konsument ska ändå hantera `candidates: []` som `unsure` med manuell sökning.
- **Oavgjort** mellan kandidater: ordningen är godtycklig men stabil inom en `sd:candidates`. `printing: "ambiguous"` flaggar det vanliga fallet (tryckningar av samma kort).
- **Kort som saknas i databasen** (andra set än de som listas i manifestet) ger normalt `unsure`. Det är en indikator, inte ett bevis.

## 4. Data och uppslag
- Varje händelse bär `db.version`, en innehållsbaserad version (`sdh1-` + 12 första hextecken av SHA-256 för `data/db.json`), plus `format`, `hash_algorithm` och `count`. Resultatet går därmed att koppla till den dataversion som användes. Se [data-format.md](data-format.md) och `data/manifest.json`.
- Spelldigger slår upp vald `scryfall_id` i sin egen katalog för komplett kortunderlag. Händelsens `name`, `set`, `collector_number` och `finishes` ersätter inte katalogen.
- **Okänt `scryfall_id`** (finns inte i Spelldiggers katalog): erbjud manuell sökning och visa kandidaten som förslag.

## 5. Skannerns egen demo-UI
Antal, finish-val, plats, sessionslistan och CSV-export i `src/page.template.html` är bara en tillfällig konsument av händelserna så att skannern går att använda fristående. De ska inte flyttas över.

## 6. Test
`test/e2e-contract.cjs` kör hela livscykeln i Chromium med falsk kamera: kontraktsfält, ny revision, bekräftelse av alternativ utan ändrad `confidence`, ingen dubbel confirm, ingen omskanning av kvarhållet kort, nytt `scan_id` vid ny skanning, `sd:cancel` vid återupptagning och stopp samt kasserade sena resultat. Se filens huvud för hur det körs.

## 7. Flytt in i Spelldigger (skiss)
1. Kopiera `src/hash.js`, `src/core.js`, `src/live.js` som en modul; ersätt demo-UI:t med Spelldiggers komponenter och koppla `sd:confirm` till tilläggsflödet.
2. Hasherna byggs i den nattliga Scryfall-synken och serveras som versionerad statisk fil enligt [data-format.md](data-format.md).
3. Matchningen körs i en Web Worker.
