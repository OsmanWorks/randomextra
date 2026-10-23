# Chaajao Analytics - Deploy Guide (Roman Urdu)

## 1. GitHub Pages par daalna
1. github.com par naya repository banayein (e.g. `chaajao-analytics`), **Public** rakhein.
2. Is folder ki **saari files** upload karein (Add file > Upload files). `index.html`, `sw.js`, `manifest.json` aur `css`, `js`, `icons` folders repo ke **root** mein hon.
3. Repo mein **Settings > Pages > Build and deployment > Source: Deploy from a branch**, Branch: `main`, Folder: `/ (root)`, **Save**.
4. 1-2 minute baad link aayega: `https://AAPKA-NAAM.github.io/chaajao-analytics/`. Ye HTTPS hai, PWA ke liye zaroori.

## 2. Google Sheet share karna (zaroori)
1. Sheet kholein > **Share** > General access > **Anyone with the link** > **Viewer** > Done.
2. Agar sheet private hui to app "Sheet tak access nahi mila" dikhayegi.

## 3. Tab ka gid lagana (bohat zaroori, 1 minute)
Google ka purana raasta (gviz) un cells ko khali bhej deta hai jin ka type baaqi column se alag ho (jaise College Board / Intermediate ke "-" ke beech wale numbers). CSV export is masle se paak hai, lekin usay tab ka `gid` chahiye.
1. Sheet mein **Weekly Engagment** tab par click karein.
2. Browser ke address bar mein aakhir mein `#gid=123456789` dikhega. Ye number copy karein.
3. `js/config.js` mein `gid: ''` ko `gid: '123456789'` karein. Save/commit karein.
4. App kholein: peela "gid set nahi" wala banner chala jana chahiye.

## 4. Phone par install
**Android (Chrome):** link kholein > "Install" wala card ya Chrome menu (3 dots) > **Install app / Add to Home screen**.
**iPhone (Safari):** link Safari mein kholein > neeche **Share** button > **Add to Home Screen** > **Add**.

## 5. Update push karne ka tareeqa (force update)
1. Files badal kar GitHub par commit karein.
2. `js/config.js` mein `version: '5.0.0'` ko agla number karein (e.g. `'5.0.1'`). **Ye step zaroori hai**, isi se naya cache banta hai.
3. Teams app dobara kholay to neeche "Naya version tayyar hai - **Update**" aayega. Update dabayein, app khud reload ho jati hai.
4. Agar phir bhi purana dikhe: browser/app band karke kholein, ya Chrome > Site settings > Clear & reset.

## 6. Naya hafta add karna
Sheet mein row 106 ke neeche agli date wali row likhein. App khud nayi row utha leti hai (150 row ki koi hadd nahi). "Total" wali row ignore hoti hai.

## 7. Agar header ka naam badla
Sheet ka header badlein to app peela alert dikhati hai ("Ye column nahi mile: ..."). `js/config.js` ke `platforms` mein us platform ke `aliases` mein naya naam add karein.

## 8. Local test
`python3 -m http.server 8080` chalayein aur `http://localhost:8080` kholein. Data parser test: `node tests/parser.test.js sheet-export.csv` (Sheet ka tab CSV download karke).
