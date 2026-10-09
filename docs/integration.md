# Integration med Spelldigger

**Princip (från Codex/Spelldigger):** skannern *identifierar*, Spelldigger *sparar*. Skannern lämnar exakt Scryfall-version eller kandidater att bekräfta. Antal, finish, skick, plats och sparande hanteras av Spelldiggers befintliga flöde. Det passar D03 (ingen betald AI per användaråtgärd; bearbetning på enheten är tillåten).

## Gränssnitt (kontrakt 1)
Skannern skickar två `CustomEvent` på `window`. Allt i `detail` är ren JSON.

### `sd:candidates`: ett kort har identifierats
```json
{
  "contract": 1,
  "confidence": "confident | check | unsure",
  "distance": 28,
  "gap": 53,
  "candidates": [
    { "scryfall_id": "…", "name": "…", "set": "msh", "collector_number": "187",
      "finishes": ["nonfoil", "foil"], "distance": 28 }
  ]
}
```
- `candidates` är sorterade, bäst först (högst 6).
- `distance` är Hamming-avstånd (0–256) för bästa kandidat; `gap` är marginalen till närmaste *annat* kort (andra tryckningar av samma kort räknas inte).
- `unsure` betyder ofta att kortet inte finns i databasen. Spelldigger bör då visa kandidaterna som förslag eller låta användaren söka manuellt.

### `sd:confirm`: användaren bekräftade en kandidat
```json
{ "contract": 1, "confidence": "confident", "candidate": { /* en kandidat som ovan */ } }
```
Detta är signalen att spara. Skannern skickar **inte** antal, finish, skick eller plats; `finishes` är bara vilka finish tryckningen finns i.

## Vad som är skannerns egen demo-UI
Antal, finish-val, plats, sessionslistan och CSV-export i `src/page.template.html` är bara en tillfällig konsument av händelserna så att skannern går att använda fristående. De ska inte flyttas över till Spelldigger.

## Flytt in i Spelldigger (skiss)
1. Kopiera `src/hash.js`, `src/core.js`, `src/live.js` som en modul; ersätt demo-UI:t med Spelldiggers komponenter.
2. Hasher (`data/db.json`) byggs i den nattliga Scryfall-synken och serveras som versionerad statisk fil.
3. Matchningen körs i en Web Worker.
4. `sd:confirm` mappas till befintligt sparflöde.
