# Live scan: hur låsningen fungerar

Mål: appen ska låsa på ett kort som hålls i bild och fånga det automatiskt, utan att konturen "flaxar". Koden finns i `src/live.js`, loopen i `src/page.template.html`.

## Varje varv (ca 8–10 gånger per sekund)
1. Hämta en bild (480 px) från kameran.
2. **Stillhet** mäts på en 36×64-gråtumnagel av hela bilden (`motion`): medelskillnad mot förra bilden delat med bildens egen gradient, alltså ungefärlig förskjutning i tumnagelpixlar. Oberoende av kortets motiv.
3. **Hörn** hittas på en 320 px-kopia (`SDCore.detect(img, true)`).
4. **Geometri** (`geometry`): alla hörn inom bild (1,5 % marginal), yta ≥ 12 % av bilden, sidförhållande 0,62–0,83, motstående sidor ungefär lika långa.
5. **Skärpa** (`sharpness`) på det rätade kortet: kvoten mellan Laplace-varians i full och halv upplösning. Oskarp bild saknar fin detalj, så kvoten faller, men den beror knappt på motiv eller avstånd.
6. **Tracker** (`makeTracker`) beslutar.

## Tracker
- Konturen som visas är **medianen av de senaste 5 hörnen**, så den darrar inte.
- Fånga bara om: geometri OK, hörnens spridning över de senaste 5 bilderna < 3 % av diagonalen, stillhet < 0,8 i 3 bilder i rad, skärpekvot ≥ 0,30 och tillräcklig detaljenergi, och skärpan inte är långt under bästa nyligen uppmätta (85 %).
- Steg som visas: `search` (vit streckad), `track` (vit), `focus` (guld), `fire` (grön).
- Ett fångat kort måste lämna bilden eller flyttas innan nästa automatiska fångst. "Capture now" fångar alltid det som syns.

## Felsökning på telefon
Tryck på rubriken "Live scan" så visas mätvärdena (stillhet, spridning, skärpa, energi, geometri, ms/bild, videostorlek) med tröskelvärdena i parentes. Skicka en skärmdump om låsningen inte fungerar.

## Test
- `node test/sim-video.mjs bench/<foto>.jpg /tmp/clip.mjpeg [--defocus|--sway]` gör en simulerad film (tomt bord, kort glider in, hålls stilla med darr, glider ut). Kräver ffmpeg. Klippet måste vara 4:2:0 (`yuvj420p`), annars avkodar Chromiums falska kamera bara en grön bild.
- `CLIPS=/tmp NODE_PATH=... node test/e2e-live-lock.cjs`: stilla skarpt kort ska låsa, oskarpt och svajande ska inte fångas.
- Mått: 7 av 7 giltiga foton låser efter 3–4 s i simuleringen. Trösklarna är kalibrerade mot simulering, inte riktig telefonfilm.

## Batch scan (hands-free)
Knappen "Batch scan" använder samma kameraloop och tracker, men:
- fångar och identifierar utan att visa hörn- eller resultatvyn;
- **identifierar i en Web Worker** (`#wsrc`, bygger på samma `hash.js` och `core.js`; `SDCore.identifyBatch`). Först ett snabbt försök (grov sökning på halv upplösning, en kandidat, ca 0,5 s), och en grundlig sökning (ca 2 s) bara om bästa avståndet är över 45. Blir kortet ändå inte `confident` tas en reservbild 200 ms efter fångsten (kortet ligger kvar) och det bästa resultatet behålls. Kameraloopen blockeras inte, så nästa kort fångas medan det förra identifieras. Utan Worker-stöd körs identifieringen i sidans tråd, men då kan kort som matas snabbt missas;
- lägger `confident` till direkt och ljuder (hög ton); `check` och `unsure` hamnar i "To check" (två låga toner) för granskning efteråt;
- kräver två bilder i rad utan kort (eller flyttat kort) innan nästa fångst, så att ett kort som ligger kvar inte skannas om;
- håller skärmen vaken (Wake Lock), har "Pause", "Undo last", ljud av/på och räknare ("N added · M to check · identifying K").

Mått i simulering (360×640-film, kortet 70 % av bredden): fem kort i följd, 4 läggs till och 1 (ej i databasen) hamnar i "To check", samma kort två gånger blir antal 2. Resultaten kan komma i annan ordning än korten matades (ett osäkert kort får en andra sökning); varje skanning har eget `scan_id`. Test: `test/e2e-batch.cjs` (klipp: `node test/sim-video.mjs a.jpg,b.jpg,… /tmp/batch.mjpeg --tail=900`). En riktig telefon filmar i högre upplösning och bör ge lägre avstånd, men trösklarna är inte kalibrerade på riktig matarlåda.

Kända gränser: foil/etched kan inte avgöras (finish blir nonfoil), och kort som inte finns i databasen hamnar i "To check".
