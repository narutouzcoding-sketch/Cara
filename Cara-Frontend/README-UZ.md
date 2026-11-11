# Cara — o‘zbekcha katalog, buyurtma va xaridor sharhlari

Asosiy sayt: **http://localhost:5502/**. Avvalgi Cara dizayni, rasmlari va UZS narxlari saqlandi. Havola, ijtimoiy tarmoq, xarid va sharh uslublari `enhancements.css` bilan bir xil holatga keltirildi.

Yangi backend uchun: [Django boshlash rejasi](docs/DJANGO-READY.md), [API shartnomasi](docs/API-CONTRACT.md), [boshqaruv va backup](docs/PROJECT-GUIDE.md), [yakuniy audit](docs/FINAL-AUDIT.md). Hozirgi backend Python stdlib serveri; Django ilovasi hali yaratilmagan.

## Ishga tushirish

Python 3.11+ bilan loyiha papkasida:

```powershell
python server.py
```

Server uchun tashqi Python paketlari kerak emas. Faqat HTML faylni ikki marta bosib ochish autentifikatsiya, buyurtma va sharhlarni ishlatmaydi. Live Server 5500 yoki 5501-portda ochilsa, API uchun 5502-portdagi server ham ishlashi kerak.

Windows’da `start.cmd` faylini ikki marta bosib ham serverni ishga tushirish mumkin. Ochilgan terminalni xarid davomida yopmang. Checkout’da «Xizmat vaqtincha mavjud emas» chiqsa, serverni ishga tushiring va «Qayta ulanish» tugmasini bosing. Sahifa joriy savat va hisob sessiyasini qayta yuklaydi; savatdagi mahsulotlar saqlanadi. Live Server’da yig‘ilgan savatni ishlatish uchun o‘sha brauzer manzilida qoling.

## Nimalar ishlaydi

- O‘zbekcha 16 mahsulot, UZS narxlari, mahsulot tafsiloti, o‘lcham va miqdor.
- Savat, saqlanganlar, katalog va blog sahifalari orasidagi ulanishlar.
- Hisob yaratish, kirish va chiqish. Parollar xesh ko‘rinishida; sessiya HttpOnly cookie orqali.
- `profile.html`: hisob ma’lumotlarini tahrirlash, yetkazib berish manzili, xarid statistikasi va so‘nggi buyurtmalar, saqlangan mahsulotlar, shaxsiy sharhlar, parolni yangilash, boshqa seanslarni yopish va Excel (.xlsx) eksporti.
- Profilning ism, telefon va manzili checkoutda avtomatik taklif qilinadi; xaridor qo‘lda kiritgan qiymatlar almashtirilmaydi. Saqlangan mahsulotlar joriy brauzerda saqlanadi.
- Qabul qiluvchi, telefon, manzil, olib ketish/yetkazib berish va to‘lov usuli bilan buyurtma yuborish.
- Serverdagi katalog narxlaridan hisoblash; takroriy yuborishda bitta buyurtma saqlash.
- Xaridorning buyurtmalari va sotuvchi boshqaruvi. Narx va yetkazib berish summasi sotuvchi tasdig‘idan o‘tadi.
- Faqat aynan shu mahsulotni xarid qilib, qabul qilgan va to‘lovi tasdiqlangan mijozga 1–5 yulduz va sharh. Ruxsat serverda tekshiriladi.
- Bitta hisobdan bitta mahsulotga bitta baho; keyin tahrirlash mumkin. Reyting haqiqiy sharhlardan hisoblanadi.
- Faqat 6 ta tasdiqlangan ijtimoiy havola: LinkedIn, Facebook, WhatsApp, GitHub, Instagram va Telegram.
- Asl Creepster shrifti butun saytda saqlangan. Mobil kartalar, menyu va hisob formalari moslashuvchan.

## Profil va hisob xavfsizligi

Profil ma’lumotlari bazadagi `profiles` jadvaliga saqlanadi; eski bazalar server ishga tushganda avtomatik moslanadi. Foydalanuvchi nomi yoki emailni o‘zgartirish uchun joriy parol talab qilinadi. Parol yangilanganda joriy seans saqlanadi, boshqa seanslar yopiladi. Eksportga parol xeshi yoki sessiya kalitlari kiritilmaydi.

Manzil bo‘limida xaritadan joy tanlang yoki nomi bilan qidiring. Shahar va manzil avtomatik to‘ladi, koordinata maydonlari ko‘rsatilmaydi. «Manzilni saqlash» bilan tanlov saqlanadi. «Joriy joylashuvim» faqat tugma bosilganda brauzer ruxsatini so‘raydi. Eskirgan javoblar yangi tanlov ustiga yozilmaydi; nom aniqlanayotgan vaqtda saqlash bloklanadi. Provayder ishlamasa, qayta urinish taklif qilinadi. Saqlangan joy buyurtmaga nusxa sifatida yoziladi.

Joy nomi va qidiruv [Photon](https://github.com/komoot/photon) orqali olinadi. Server faqat tanlangan koordinata yoki qidiruv matnini yuboradi, javoblarni keshlaydi va so‘rovlarni ketma-ket cheklaydi. `CARA_GEOCODER_URL` bilan boshqa Photon instansiyasiga o‘tish mumkin. Kutubxona [Leaflet 1.9.4](https://leafletjs.com/reference.html) `assets/leaflet/`da, xarita tasvirlari [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)dan olinadi.

Profil rasmi tanlangach avtomatik saqlanadi; alohida saqlash tugmasini bosish shart emas. JPG, PNG, WebP va AVIF 8 MB gacha qabul qilinadi; telefon fayl turini bo‘sh qaytarsa ham kengaytma va rasm dekoderi orqali tekshiriladi. «Rasmni moslash» bo‘limida kesish/yaqinlashtirish ixtiyoriy. Serverga faqat 256×256 PNG yuboriladi, metama’lumotlar olib tashlanadi. Rasm faqat hisob egasining sessiyasi bilan ochiladi.

«Excel faylini yuklab olish» haqiqiy `.xlsx` fayl beradi: Profil, Buyurtmalar, Mahsulotlar va Sharhlar varaqlari. Sana Toshkent vaqti bilan, narxlar UZS bilan chiqariladi. Telefon va foydalanuvchi matnlari matn sifatida saqlanadi; matndan formula bajarilmaydi. Faqat joriy hisobning ma’lumotlari eksport qilinadi.

## Gibrid to‘lovning hozirgi holati

**Naqd buyurtma usuli ishlaydi. Click va Payme adapterlari tayyor, ammo savdogar kalitlari berilmagani uchun ular hozir o‘chirilgan.** Sayt onlayn to‘lovni soxta muvaffaqiyatli deb belgilamaydi.

Katalog narxlari hali `pricesAreSamples: true` bilan namuna sifatida belgilangan. Buyurtma dastlab so‘rov bo‘ladi; sotuvchi mahsulot mavjudligi va yakuniy summani tasdiqlaydi. Onlayn to‘lov ham shu tasdiqdan keyin ochiladi.

Maxfiy sozlama faylini tayyorlash:

```powershell
python server.py config
```

Buyruq veb-papkadan tashqaridagi shaxsiy `.env` manzilini chiqaradi. Kalitlarni frontendga qo‘ymang. Domen/HTTPS, provayder rekvizitlari va callback manzillari tayyor bo‘lgach ulash tartibi [COMMERCE-SETUP.md](COMMERCE-SETUP.md) ichida.

## Sotuvchi huquqi

Avval saytda o‘z hisobingizni yarating. Keyin shu loyiha papkasida:

```powershell
python server.py admin SIZNING_USERNAME
```

Hisobingizdagi **Buyurtmalarim → Barcha buyurtmalar — sotuvchi** bo‘limida narxlarni tasdiqlash, jo‘natish va haqiqatan yetkazilganini belgilash mumkin. Naqd buyurtmada pul qabul qilinganini ham tasdiqlaysiz. Xaridor bu holatlarni o‘zi o‘zgartira olmaydi.

## Shaxsiy ma’lumotlar va ijtimoiy havolalar

`store-data.js` faylidagi ma’lumotlarni tahrirlang:

- Telefon: `+998770830820`; ko‘rinishi: `+998 77 083 08 20`.
- Manzil: Termiz, Surxondaryo, O‘zbekiston.
- `store.socialLinks`: platformaning `url` maydoniga to‘liq `https://...` havolasini yozing. Bo‘sh yoki noto‘g‘ri manzil soxta linkka aylantirilmaydi.
- `products`: nom, tavsif, kategoriya, o‘lcham va butun so‘mdagi `price`.
- `articles`: blog sarlavhasi, qisqa va to‘liq matn.
- `apiBaseUrl`: odatda bo‘sh qoladi; sayt va API boshqa manzillarda joylashtirilsa sozlanadi.

LinkedIn, Facebook va GitHub uchun siz bergan aniq profil manzillari ishlatiladi. WhatsApp: `https://wa.me/998770830820`. Instagram va Telegram: `@quvonchbekqos1mov`. Boshqa platformalar yoki bo‘sh tugmalar ko‘rsatilmaydi.

## Ma’lumotlar saqlanishi

Savat va saqlanganlar shu brauzerning localStorage xotirasida. Hisob, sessiya, buyurtma, to‘lov holati va sharhlar shaxsiy SQLite bazasida saqlanadi. Parol yoki karta ma’lumoti localStorage’ga yozilmaydi. Baza va haqiqiy `.env` veb-papka orqali tarqatilmaydi.

Kontakt formasi WhatsAppda xabar matnini tayyorlaydi; xaridor yuborishni o‘zi tasdiqlaydi. Email obunasi o‘rniga faol WhatsApp havolasi bor. Parolni email orqali tiklash hali ulanmagan. Hozirgi server lokal muhitda ishlaydi; tashqi xaridorlar uchun hosting, domen va HTTPS kerak.

## Tekshiruv

```powershell
python -m unittest discover -s tests -v
npm ci
npm test
```

Node.js paketlari faqat frontend testlari uchun. Ishlatish uchun npm build talab qilinmaydi. Testlar alohida vaqtinchalik bazalarda ishlaydi; asosiy do‘konga sinov sharhlari yoki soxta buyurtmalar qo‘shilmaydi. Natijalar `TEKSHIRUV.json` da.

Node.js 24+ bilan ikkala test to‘plamini birgalikda ishga tushirish: `npm run check`.

## Zaxira va Django uchun katalog

```powershell
python server.py backup
python server.py catalog
```

Birinchi buyruq ishlayotgan SQLite bazasidan yaxlit, sanali zaxira oladi. Ikkinchisi faqat ochiq katalogni JSONga chiqaradi; hisoblar yoki buyurtmalarni eksport qilmaydi. Natijalar loyiha tashqarisidagi xususiy data papkasiga yoziladi, manzili terminalda chiqadi. Mavjud fayl bosib yozilmaydi. Tiklash va ko‘chirish tartibi [PROJECT-GUIDE.md](docs/PROJECT-GUIDE.md)da.

## Manbalar va huquqlar

- Asl loyiha: [Rahul02M/Cara-online-shopping](https://github.com/Rahul02M/Cara-online-shopping). Asl README `README-original.md` da.
- Asl paketdagi litsenziya cheklovlari saqlanadi; bu o‘zgarishlar rasmlar yoki shablonga yangi litsenziya bermaydi.
- Font Awesome va Creepster fayllari mahalliy; litsenziya ma’lumotlari `assets/` ichida saqlangan.
- To‘lov protokollari va maxfiy sozlash yo‘riqnomasi: [COMMERCE-SETUP.md](COMMERCE-SETUP.md).
