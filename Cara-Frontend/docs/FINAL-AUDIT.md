# Yakuniy audit — 2026-10-27

## Profil bo‘yicha keyingi tuzatish

5500-portdagi profil muammosi ham tuzatildi: [PROFILE-FIX.md](PROFILE-FIX.md). Eng yangi tekshiruv: 45 frontend + 50 backend = **95 test o‘tdi**. Quyidagi brauzer dalillari avvalgi auditga tegishli; yangi tuzatish DOM va haqiqiy HTTP tekshiruvidan o‘tdi.

## Natija

Lokal frontend va mavjud Python/SQLite serveri yakuniy regressiya tekshiruvidan o‘tdi. Django backendni boshlash uchun ulanish qoidalari, ma’lumot modellari, ko‘chirish va boshqaruv tartibi hujjatlashtirildi. Original Cara mavzusi, Creepster, Font Awesome, mahsulot rasmlari, o‘zbekcha matnlar, UZS va 6 ijtimoiy profil saqlandi.

Django hali qurilmagan. Yangi Django serveriga qarshi API/merchant/production tekshiruvi bu auditning natijasi emas.

## Topilgan va tuzatilgan holatlar

| Holat | Tuzatish | Dalil |
| --- | --- | --- |
| Login text maydoni emailni 30 belgida cheklardi | Email orqali login 150 belgigacha, aniq yorliq | Frontend regressiya testi va haqiqiy email bilan qayta login |
| Django anonim login/register CSRFiga tayyor emas edi | `/me`ni kutish, mehmon tokenini yuborish; header sozlamasi hujjatlashtirildi | Anonim CSRF testi; Django serverida alohida tekshirish talab qilinadi |
| API base oxiridagi `/` ikki slash yaratishi, nisbiy manzil testda ishlamasligi mumkin edi | URLni origin asosida normallashtirish | Nisbiy va alohida portli API testlari |
| Proxy HTML xatosi «ulanib bo‘lmadi»ga aylanardi | HTTP statusga mos tushunarli xabar; HTML chiqarilmaydi | 401/403/429/502 testlari |
| Saqlangan savatdagi takroriy qatorlar server chegarasiga mos emasdi | ID/o‘lcham bo‘yicha birlashtirish, 99 dona va 50 qator chegarasi | Buzilgan/takroriy savat testi |
| Buyurtma javobini kutayotganda qo‘shilgan mahsulotlar ham o‘chardi | Faqat yuborilgan miqdorni ayirish; yangi mahsulot va qo‘shimcha miqdor qoladi | Kechiktirilgan javob regressiya testi |
| Javob yo‘qolib sahifa yangilansa idempotency kaliti yo‘qolardi | Web Crypto bilan payloadning SHA-256 izi va kalitini shu tab sessionStorage xotirasida saqlash | Reload/retry testi; aloqa ma’lumotlari saqlanmasligi ham tekshirildi |
| Profildagi sotuvchi havolasi oddiy order ro‘yxatini ochardi | `?admin=1`ni o‘qish, xaridorga admin ko‘rinish bermaslik | Sotuvchi/xaridor testlari |
| Yangi orderga havola shu orderni ko‘rsatib ajratmasdi | Tanlangan order kartasiga fokus va scroll | Brauzer checkout natijasi |
| To‘lov usuli/product IDga object/array yuborish ayrim joyda 500 qaytarardi | Turlar va order IDni tekshirish, 400 xato | HTTP malformed-payload testi; order yaratilmasligi tasdiqlandi |
| Boshqa lokal portdagi same-origin yozish rad qilinardi | Haqiqatan bog‘langan portni allowed originlarga qo‘shish | Port=0 bilan HTTP testi va 5510-portdagi brauzer oqimi |
| HEAD endpointlar ishlamasdi | GET bilan bir xil status/header, bo‘sh body | Ochiq, session va 404 manzillari HTTP testi |
| Ishlayotgan WAL bazadan qulay xavfsiz backup buyrug‘i yo‘q edi | SQLite backup API, integrity check, public papka va overwrite taqiqi | WAL/restore, mavjud fayl va yopiq yo‘l testlari |
| Django uchun katalog eksporti yo‘q edi | DB ochmasdan ochiq JSON eksporti | ID/narx/valyuta/social va overwrite testlari |
| Audit hisoboti eski sahifa/test sonlarini ko‘rsatardi | Joriy natijalar bilan `TEKSHIRUV.json` yangilandi | Quyidagi qayta bajarilgan tekshiruvlar |

Web Crypto yoki sessionStorage mavjud bo‘lmasa shu sahifadagi retry kaliti ishlaydi; sahifa yangilashlar orasidagi himoyaga tayanishdan oldin buyurtma tarixini tekshirish kerak. Turli tablardan mustaqil yaratilgan so‘rovlar avtomatik bitta so‘rov hisoblanmaydi.

## Tekshiruvlar

| Tekshiruv | Natija |
| --- | --- |
| `npm run check` | 39 frontend + 49 backend = **88 test o‘tdi**, 0 xato |
| Backend test ma’lumotlari | Alohida vaqtinchalik SQLite bazalar |
| `npm audit --omit=optional --json` | 0 ma’lum zaiflik |
| `python -m compileall -q server.py backend` | Python sintaksis xatosi yo‘q |
| CSS parse/property tekshiruvi | `style.css`, `enhancements.css`: 0 xato |
| Lokal havola/script/rasm/fragment | Frontend testlarida 12 HTML sahifa tekshirildi |
| Haqiqiy brauzer | Alohida 5510-port, vaqtinchalik baza, 512 px viewportda 12 sahifa |
| Mobil sahifalar | Gorizontal chiqib ketish va takroriy DOM ID topilmadi; Creepster saqlandi |
| Rasm yuklash | Mavjud `src`li sahifa rasmlarida yuklash xatosi aniqlanmadi; avatarsiz profilning yashirin bo‘sh previewsi xato sifatida olinmadi |
| Browser xato/warning loglari | Tekshirilgan oqimda bo‘sh |
| E2E oqim | f2, L, 2 dona → mehmon checkout → register → 338 000 so‘m cash pickup order → order ko‘rinishi → profil → logout → email bilan login |
| Shrift/ikonkalar | Browserda `Creepster` va `FontAwesome` tasdiqlandi |

512 pxdan boshqa viewportlarda ushbu auditda yangi brauzer o‘lchovi qilinmadi. Oldingi `TEKSHIRUV.json`dagi ko‘p o‘lchamli natijalar bu hisobotga ko‘chirilmadi. Tashqi Photon/OSM xizmatlarining uzluksiz ishlashi yoki haqiqiy Click/Payme pul operatsiyasi tasdiqlanmadi.

## Django va ommaviy ishga tushirish uchun qolgan ishlar

1. [DJANGO-READY.md](DJANGO-READY.md) bo‘yicha mos Python virtual muhit va Django loyihasini yarating. Hozirgi kompyuterdagi Python 3.15ni Django 5.2 LTS bilan aralashtirmang.
2. [API-CONTRACT.md](API-CONTRACT.md) bo‘yicha haqiqiy endpointlar, permission, serializer/validation, transaction va Django API testlarini yozing. Frontend testlari mock bilan ishlaydi.
3. Katalog/variant/stock, admin import va dinamik frontendni alohida bosqichda yarating. Hozir JSON hamda HTML kartalar statik; ombor rezervi va avtomatik narx sinxronlash yo‘q.
4. Legacy user/order/review ma’lumotlarini zaxira nusxada ko‘chirishni mashq qiling. Parol xeshini oddiy Django password maydoniga ko‘chirmang. Sessiyalarni yangilang.
5. Email reset/verification, qidiruv/filter, to‘liq order tarixi paginationi va qurilmalararo wishlist zarur bo‘lsa keyingi vazifalarga kiriting. Joriy lokal order limiti: xaridor 50, sotuvchi 100.
6. Haqiqiy katalog narxlari/mavjudligini kiriting; hozir `pricesAreSamples:true`. Sotuvchi hisobi va xizmat shartlarini tayyorlang.
7. Click/Payme merchant rekvizitlari, provayder sandbox/acceptance, HTTPS domen, production DB/server, monitoring, backup jadvali va restore sinovini yakunlang. Lokal `http.server`ni production server o‘rnida ishlatmang.
8. Git tarixini boshlang va xususiy fayllar qo‘shilmaganini tekshiring. Audit vaqtida papkada `.git` mavjud emas edi; `.gitignore` kengaytirildi.

Kunlik boshqaruv va tiklash: [PROJECT-GUIDE.md](PROJECT-GUIDE.md). Testlar o‘tishi xatolar umuman qolmaganiga kafolat emas; natijalar yuqoridagi aniq tekshirilgan doira uchun.
