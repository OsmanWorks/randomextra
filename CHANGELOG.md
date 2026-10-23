# CHANGELOG - v5.0.0 (audit points ke hisaab se)

1. **Wrong numbers (root cause)** - `parseGviz()` position se columns padhta tha aur column D (Facebook Likes) skip karta tha, is liye sab ek khana khisak gaya tha. Ab header ke **naam** se mapping (`js/data.js: buildModel`), aliases `js/config.js` mein. "Linkdin" typo alias hai. Intermediate (column M) ab padha jata hai. WA SAT hata diya (sheet mein column nahi).
2. **Number parsing** - NBSP/space/comma hataye jate hain (" 1,084" -> 1084). "-", " ", khali = `null` (no data), zero nahi. Deltas mein null shamil nahi, UI mein "—".
3. **gviz null masla** - gviz mixed-type columns ki minority values khali kar deta hai (College Board/Intermediate mein 92 "-" vs 11 numbers). Primary source ab CSV export (`export?format=csv&gid=`), gviz CSV sirf fallback (banner ke saath). Proper CSV parser (quotes, header mein line breaks).
4. **Range** - `A4:M150` ki jagah poori sheet; header row khud dhoondi jati hai; sirf wo rows jin ka column A asli date hai (isliye "Total" row ignore). 150+ rows ka masla khatam.
5. **Mobile block** - `innerWidth < 900` wali screen hata di. Phone-first responsive layout, bottom navigation, sidebar sirf 900px+.
6. **PWA** - `sw.js` ab register hota hai (scope `./`, `updateViaCache: none`). Naya SW: static cache-first, sheet network-first, versioned cache, "Update" toast. Install button (Android) + iPhone steps. Manifest se invalid `splash_screens` hata, `id`, `scope`, shortcuts theek. Purane splash PNGs hata diye (sirf purane iPhones ke thay).
7. **Cache key** - `chaajao_cache_v2` hata kar `chaajao_cache_v3` + `schemaVersion`. Purani key boot par delete hoti hai. Cache mein CSV text hota hai, taake logic badalne par dobara parse ho.
8. **250 KB base64 icon** - hata diya; `icons/icon-192.png` use hota hai. `index.html` 298 KB se ~12 KB.

## Doosri tabdeeliyan
- Facebook = column E (Follows); E na ho to purani tareekhon ke liye D (Likes). Ek hi series, kabhi double nahi. Metric badalne wale hafte ka delta nahi nikalta, chart line wahan se alag.
- Total = 11 platforms ka jod. Hero mein week-on-week change.
- Platform detail (history, best week, average weekly growth), 4/12/sab chart, tap tooltips, skeleton/empty/error/offline states, dark mode.
- Google Fonts hata diye (system fonts). Emojis hata diye.
- Aakhri successful data safe rehta hai; refresh fail ho to purana data + Retry.
- Quick links aur Video Report placeholder wese hi rakhe.
