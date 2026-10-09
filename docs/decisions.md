# Beslut

- **S01 På enheten, ingen kostnad per användare.** Igenkänningen körs i telefonen. Inga betalda AI-anrop per användaråtgärd; bearbetning på enheten (hashning, OCR, små modeller som laddas ned) är tillåten. Speglar Spelldiggers D03 i dess omformulerade lydelse.
- **S02 Perceptuell hashning.** Billig, tydbar, fungerar offline. Databasen är hashar, inga bilder.
- **S03 Hashkoden är fryst mot databasen.** `src/hash.js` delas av databasbygget och appen. Ändring kräver ombyggd `data/db.json`.
- **S04 Statisk webbapp (PWA-spår).** En enda HTML-fil på GitHub Pages. Kameran kräver HTTPS och fungerar inte inbäddad i andra appar.
- **S05 Hörn styrs av matchning.** Kantdetektering ger startgissningar; slutliga hörn väljs genom att minimera avståndet till närmaste kort i databasen.
- **S06 Eget repo tills vidare.** Flyttas in i Spelldigger som en slice när det är moget; importformatet är redan Spelldiggers (`scryfall_id,finish,quantity`).
