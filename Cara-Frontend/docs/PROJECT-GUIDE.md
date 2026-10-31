# Cara loyihasini boshqarish

## Fayllar xaritasi

| Joy | Vazifasi | Qachon tahrirlaysiz |
| --- | --- | --- |
| `store-data.js` | Ochiq katalog, blog, kontakt, 6 ijtimoiy profil, API manzili | Narx/nom/matn, kontakt yoki backend originini o‘zgartirganda |
| `index.html`, `shop.html`, `sproduct.html` | Bosh sahifa, katalog va mahsulot markup | Statik kartalar va sahifa tuzilishi |
| `cart.html`, `checkout.html`, `orders.html` | Xarid oqimi konteynerlari | Oqimning sahifa tuzilishi |
| `login.html`, `profile.html` | Hisob sahifalari | Hisob/profil asosiy markup |
| `about.html`, `blog.html`, `contact.html`, `support.html` | Axborot sahifalari | Do‘kon ma’lumoti va yordam matni |
| `script.js` | Katalog, savat, saqlanganlar, menyu, login tablari | Frontend xatti-harakati |
| `commerce.js` | Yagona API client, session/CSRF, checkout, order, review | Django bilan ulanish |
| `profile.js`, `profile-location.js`, `profile-photo.js` | Profil, xarita, rasm | Shaxsiy kabinet |
| `style.css`, `enhancements.css` | Original mavzu va qo‘shimcha responsive uslublar | Dizayn; Creepster va Font Awesome saqlansin |
| `img/`, `assets/` | Mahsulot rasmlari, shriftlar, Leaflet | Asset almashtirish |
| `server.py`, `backend/` | Amaldagi lokal server, DB, to‘lov va servislar | Hozirgi backend yoki Django uchun xatti-harakat manbasi |
| `tests/` | Frontend va backend regressiya testlari | Funksional o‘zgarish bilan tekshirish |
| `TEKSHIRUV.json`, `docs/` | Audit dalillari va ishlash tartibi | Tekshiruvdan keyin yangilash |

`store-data.js` hamma uchun ochiq: maxfiy kalit, parol va merchant sirlarini yozmang. Hozir `Store.catalog()` shu fayl ichidagi JSONni o‘qiydi; `window.CARA_DATA = {...};` shaklini saqlang. JS expression yoki callback qo‘shmang.

Mahsulot qo‘shish hozir statik: JSONga qo‘shishning o‘zi yangi HTML karta yaratmaydi. Katalog va zarur tavsiya kartalarini ham moslang. Django dinamik katalogiga o‘tish [rejadagi alohida bosqich](DJANGO-READY.md).

## Kundalik buyruqlar

```powershell
python server.py
python server.py config
python server.py admin SIZNING_USERNAME
python server.py backup
python server.py catalog
npm run check
```

Admin uchun avval saytda o‘z hisobingizni yarating. So‘ng sotuvchi rolini terminaldan bering. `orders.html?admin=1` yoki profilning sotuvchi havolasi boshqaruvni ochadi. Faqat URLga `admin=1` yozish ruxsat bermaydi.

`config` birinchi chaqirishda tashqi shaxsiy `.env`ni yaratadi, mavjudini almashtirmaydi. `backup` yangi, sanali SQLite nusxani, `catalog` yangi ochiq JSONni loyiha tashqarisidagi xususiy data papkasiga yozadi. Har buyruq natija manzilini chiqaradi.

O‘zingiz nom bermoqchi bo‘lsangiz, yangi va **loyihadan tashqaridagi** fayl tanlang:

```powershell
python server.py backup --output "D:\Cara-Backups\cara-before-django.sqlite3"
python server.py catalog --output "D:\Cara-Backups\catalog-before-django.json"
```

Backup mavjud faylni bosib yozmaydi va veb-papka ichiga yozishni rad etadi. `--database` bilan kerakli boshqa bazani aniq tanlash mumkin. `.env` nusxasini ham alohida, xususiy joyda saqlang; DB backup `.env`ni o‘z ichiga olmaydi. Profilning XLSX eksporti to‘liq do‘kon backupi emas.

## Zaxiradan tiklash

1. `Ctrl+C` bilan serverni to‘xtating; eski bazaga yozayotgan boshqa jarayon qolmasin.
2. Tiklashdan oldin hozirgi bazadan `backup` oling. WAL ishlayotgan bazani oddiy `Copy-Item` bilan yolg‘iz nusxalamang.
3. Mavjud bazani bosib yozish o‘rniga zaxirani yangi xususiy fayl manziliga ko‘chiring.
4. `python server.py --database "D:\Cara-Backups\restored-copy.sqlite3"` bilan shu yangi nusxada tekshiring: login, buyurtmalar, ruxsat va summa.
5. Tasdiqlangach shaxsiy `.env`da `CARA_DATABASE`ni yangi bazaga qarating. Serverni odatiy buyruq bilan qayta ishga tushiring. Eski nusxalarni tekshiruv tugaguncha saqlang.

Backupda telefon, manzil, hisob xeshlari va buyurtmalar bor; uni GitHub, umumiy Drive yoki sayt papkasiga joylamang. `.gitignore` kengaytirilgan, lekin Gitning o‘zi backup emas.

## O‘zgarish kiritish tartibi

1. Ishlaydigan holatni Git commit yoki tashqi nusxaga saqlang. Audit vaqtida bu papka Git repository emas edi. GitHubga yuborishdan oldin `.env` va DB fayllari kuzatilmayotganini tekshiring.
2. O‘zgarishni kichik vazifaga ajrating; kerakli faylni xaritadan toping.
3. `npm test`; commerce/API o‘zgarsa `python -m unittest discover -s tests -v`. Ikkalasiga `npm run check`.
4. Brauzerda tegishli oqimni oching; yangi test xaridorlari uchun `--database` bilan vaqtinchalik DB ishlating. Haqiqiy xaridor bazasida soxta order yaratmang.
5. Natijani commit qiling, yo‘riqnoma va tekshiruv hisobotini kerak bo‘lsa yangilang. Npm auditni dependency o‘zgarganda bajaring.

Ishlatish uchun npm build kerak emas. Node dependencylar test uchun; runtime frontend oddiy statik fayllar.

## Nosozlikni aniqlash

| Holat | Amal |
| --- | --- |
| «Xizmatga ulanib bo‘lmadi» | `python server.py`; port va `/api/health`ni tekshiring; checkoutdagi «Qayta ulanish» |
| 403 / CSRF | To‘g‘ri origin va cookie, so‘ng sahifani yangilash; Django’da custom CSRF header sozlamasini tekshirish |
| Login bir manzilda bor, boshqasida yo‘q | `localhost` va `127.0.0.1`ni aralashtirmang; browser cookie/localStorage originlari alohida |
| Buyurtma qayta yuborildi | Oldin `orders.html`ni tekshiring; idempotency keyni yangi payloadga qo‘lda qayta ishlatmang |
| Click/Payme o‘chiq | Bu boshlang‘ich holat; [merchant sozlash yo‘riqnomasi](../COMMERCE-SETUP.md) |
| Profil xaritasi ishlamaydi | Internet/geokoder/OSMga ulanish; aniq nuqtani qayta tanlash; koordinata o‘rniga noto‘g‘ri nom saqlamang |
| Port band | O‘sha portdagi eski server terminalini yoping yoki `--port 5503` bilan boshqa port tanlang |
| Loyiha ko‘chgach hisoblar ko‘rinmadi | Data papka IDsi loyiha yo‘liga bog‘liq; eski `CARA_ENV_FILE`/`CARA_DATABASE`ni belgilang |

## Hozirgi funksional chegaralar

Email orqali reset/verification, jonli ombor qoldig‘i, kupon, mahsulot qidiruvi, katta order tarixining paginationi va Django admin katalogi hali alohida ishlab chiqiladigan imkoniyatlar. Kontakt formasi WhatsApp xabarini tayyorlaydi; yuborishni xaridor WhatsAppda bajaradi. Savat va saqlanganlar brauzerga tegishli, hisob bilan qurilmalar orasida sinxronlanmaydi. Bular keyingi backend vazifalari, auditda faol deb ko‘rsatilmagan.
