# Status

**Fungerar:** foto- och live-läge, hörnförfining, lista, CSV-export, kopiera/spara, händelsekontrakt 2 (`scan_id`, Oracle-baserad säkerhet, tryckningsflagga, dataversion) med webbläsartest. Live scan har byggts om (utjämnad kontur, stillhets- och skärpespärr, se `docs/live-scan.md`) efter att den första versionen flaxade på riktig iPhone; verifierad i simulerad film, inte ännu på riktig telefon.
**Batch scan (hands-free):** byggt och testat i simulerad film (se `docs/live-scan.md`), inte ännu på riktig matarlåda.
**Mätt:** 7/7 på egna foton av kort som finns i databasen (10 foton totalt).

## Nästa steg
0. Prova Batch scan med mobilen fast över en låda; justera ljud, tider och trösklar efter hur det känns.
1. Prova nya live scan på riktig telefon; justera trösklarna efter felsökningsraden (tryck på rubriken "Live scan").
2. Fler set i databasen; kör `build-db` i en Action.
3. OCR av samlarnummer/setkod för att välja rätt tryckning.
4. Mer testdata: 30+ foton med olika bakgrund, ljus, foil, sleeves.
5. PWA-manifest och ikon så att sidan kan läggas på hemskärmen.
6. Slice-spec för att flytta in i Spelldigger-repot (samlingsimport via API i stället för CSV, Location).
