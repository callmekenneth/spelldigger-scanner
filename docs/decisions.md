# Beslut

- **S01 På enheten, ingen kostnad per användare.** Igenkänningen körs i telefonen. Inga betalda AI-anrop per användaråtgärd; bearbetning på enheten (hashning, OCR, små modeller som laddas ned) är tillåten. Speglar Spelldiggers D03 i dess omformulerade lydelse.
- **S02 Perceptuell hashning.** Billig, tydbar, fungerar offline. Databasen är hashar, inga bilder.
- **S03 Hashkoden är fryst mot databasen.** `src/hash.js` delas av databasbygget och appen. Ändring kräver ombyggd `data/db.json`.
- **S04 Statisk webbapp (PWA-spår).** En enda HTML-fil på GitHub Pages. Kameran kräver HTTPS och fungerar inte inbäddad i andra appar.
- **S05 Hörn styrs av matchning.** Kantdetektering ger startgissningar; slutliga hörn väljs genom att minimera avståndet till närmaste kort i databasen.
- **S06 Eget repo tills vidare.** Flyttas in i Spelldigger som en slice när det är moget; importformatet är redan Spelldiggers (`scryfall_id,finish,quantity`).
- **S07 Identifiera och spara hålls isär.** Skannern lämnar `scryfall_id` eller kandidater (händelserna `sd:candidates`/`sd:confirm`); Spelldigger hanterar antal, finish, skick, plats och sparande. Se `docs/integration.md`.
- **S08 "Samma kort" = Oracle-ID.** Marginalen (`gap`) och all jämförelse mellan kort bygger på `oracle_id`, inte namn. Säkerhetsnivån avser kortet; tryckningens säkerhet anges separat (`match.printing`).
- **S09 En skanning = ett `scan_id`.** Nytt ID vid varje avsiktlig ny skanning, en `sd:confirm` per ID, sena resultat kastas, avbrott ger `sd:cancel`. Kvarhållna kort skannas inte om.
- **S10 Innehållsbaserad dataversion.** `db.version` = `sdh1-` + SHA-256-prefix av `db.json`; skickas i varje händelse. Bygget avbryts om manifestet är inaktuellt.
