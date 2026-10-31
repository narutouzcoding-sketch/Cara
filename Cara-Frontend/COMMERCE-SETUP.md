# Xarid, sharh va gibrid to‘lovni sozlash

## Ishga tushirish

Python 3.11+ yetarli. Server uchun tashqi Python paketlari kerak emas.

```powershell
cd "D:\My Projects\Cara-Frontend"
python server.py
```

Sayt: [http://localhost:5502](http://localhost:5502). Frontendni Live Server orqali 5500 yoki 5501-portda ochsangiz ham, API uchun 5502-portdagi server ishlashi kerak.

Hisob, buyurtma va sharhlar SQLite bazasida saqlanadi. Baza va maxfiy sozlamalar veb-papkadan tashqarida:

```text
%LOCALAPPDATA%\CaraStore\81b589538f77\cara.sqlite3
%LOCALAPPDATA%\CaraStore\81b589538f77\.env
```

Papka identifikatori loyiha manzilidan olinadi. Loyiha boshqa papkaga ko‘chirilsa, `CARA_ENV_FILE` / `CARA_DATABASE` orqali avvalgi ma’lumotlar manzilini belgilash mumkin.

## Sotuvchi hisobi

1. Saytda o‘z foydalanuvchi nomingiz va parolingiz bilan ro‘yxatdan o‘ting.
2. Terminalda, shu loyiha papkasida bajaring:

```powershell
python server.py admin SIZNING_USERNAME
```

3. Hisobingizda **Buyurtmalarim → Barcha buyurtmalar — sotuvchi** tugmasini bosing. Admin huquqi frontend yoki ro‘yxatdan o‘tish formasidan berilmaydi.

Buyurtma tartibi:

1. Xaridor o‘lcham, miqdor, qabul qiluvchi va to‘lov usulini kiritadi.
2. Server narxni o‘z katalogidan hisoblab, `pending` buyurtma yaratadi. Mijoz yuborgan narx, «to‘langan» yoki «yetkazilgan» belgisi qabul qilinmaydi.
3. Sotuvchi mahsulot mavjudligi, narxi va yetkazib berish summasini tekshiradi. **Tasdiqlash**dan keyin summa o‘zgarmaydi.
4. Naqd usulida mahsulot topshirilgach, sotuvchi pul ham qabul qilinganini tasdiqlaydi. Click/Payme usulida to‘lov provayderdan tasdiqlanmaguncha jo‘natish ochilmaydi.
5. `delivered` va `paid` buyurtmasi bor mijoz aynan shu mahsulotga 1–5 yulduz va sharh qoldira oladi. To‘lashning o‘zi yoki savatga qo‘shish yetarli emas.

Bir hisob bir mahsulotga bitta baho qoldiradi; uni keyinchalik tahrirlashi mumkin. Boshqa mijozning buyurtmasi, bekor qilingan buyurtma yoki `localStorage`dagi soxta belgi huquq bermaydi.

## Click + Payme + naqd

Naqd usuli ishlaydi. Onlayn adapterlar yozilgan, ammo haqiqiy savdogar rekvizitlari berilmagani uchun boshlang‘ich holatda o‘chirilgan.

Sozlama faylini yaratish yoki manzilini ko‘rish:

```powershell
python server.py config
```

Chiqqan **shaxsiy `.env` faylini** tahrirlang. Kalitlarni `store-data.js`, HTML yoki veb-papkaga yozmang.

```dotenv
CARA_PUBLIC_URL=https://sizning-domeningiz.uz
CARA_COOKIE_SECURE=1
CARA_ONLINE_PAYMENTS_ENABLED=1
CLICK_MERCHANT_ID=...
CLICK_SERVICE_ID=...
CLICK_SECRET_KEY=...
PAYME_MERCHANT_ID=...
PAYME_KEY=...
```

Bu qiymatlar provayderning savdogar hisobidan olinadi; ulardan namuna qiymatlar bilan haqiqiy to‘lov boshlanmaydi. O‘zgarishdan keyin serverni qayta ishga tushiring. Ommaviy ishlatish uchun domen, HTTPS va provayder tomonidan ro‘yxatga olingan callback manzillari kerak. Hozir ishga tushirilgan server localhost uchun.

Provayderga beriladigan URLlar:

| Provayder | URL |
| --- | --- |
| Click Prepare | `https://sizning-domeningiz.uz/api/payments/click/prepare` |
| Click Complete | `https://sizning-domeningiz.uz/api/payments/click/complete` |
| Payme Merchant API | `https://sizning-domeningiz.uz/api/payments/payme` |

Payme hisob maydoni: `account.order_id` (buyurtma identifikatori). Click uchun `merchant_trans_id` shu buyurtma identifikatori bo‘ladi.

- Click imzosi, xizmat IDsi, summa, Prepare identifikatori va takroriy Complete tekshiriladi.
- Payme Basic auth, summa (tiyinda), hisob, tranzaksiya holati va 12 soatlik muddat tekshiriladi.
- Brauzerdagi qaytish URLsi to‘lov tasdig‘i hisoblanmaydi. Faqat tekshirilgan server xabari to‘lovni `paid` qiladi.
- API qayta yuborilsa, bir tranzaksiya yoki buyurtma takroran yaratilmaydi.
- Faol to‘lovli buyurtma sotuvchi tugmasi bilan bekor qilinmaydi; avval provayder orqali hal qilinadi. Yetkazilgan tovar uchun avtomatik Payme bekor qilish rad etiladi.

Provayder kalitlari ulangach, ularning sandbox/merchant tekshiruvlarini ham o‘tkazing. Hozirgi testlar haqiqiy pul yechmasdan protokol, imzo, ruxsat va holatlarni tekshiradi; real merchant hisobida to‘lov qilinmagan.

Rasmiy manbalar: [Click integratsiyasi](https://github.com/click-llc/click-integration-php), [Payme Merchant API](https://developer.help.paycom.uz/metody-merchant-api/), [Payme to‘lov havolasi](https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get/).

## Ijtimoiy tarmoqlar va narxlar

`store-data.js` → `store.socialLinks` ichida faqat foydalanuvchi bergan 6 ta platforma bor: LinkedIn, Facebook, WhatsApp, GitHub, Instagram va Telegram. Bo‘sh yoki noto‘g‘ri havolalar ko‘rsatilmaydi.

LinkedIn, Facebook va GitHub aniq berilgan profil manzillariga ochiladi. WhatsApp `+998770830820` raqamiga, Instagram va Telegram `@quvonchbekqos1mov` profillariga bog‘langan.

Narxlar UZSda. Hozir `pricesAreSamples: true`; namuna narxlar bilan buyurtma avval so‘rov sifatida qabul qilinadi. Haqiqiy katalog va narxlarni kiritib, mavjudlik/yetkazib berish shartlarini tasdiqlang.

## Tekshiruvlar

Django backendga ko‘chirish: [DJANGO-READY.md](docs/DJANGO-READY.md). Endpoint va javoblar: [API-CONTRACT.md](docs/API-CONTRACT.md). Ko‘chirishdan oldin `python server.py backup` bilan yaxlit nusxa oling; [tiklash tartibi](docs/PROJECT-GUIDE.md).

```powershell
python -m unittest discover -s tests -v
npm ci
npm test
```

Backend testlari vaqtinchalik bazalarda ishlaydi. Brauzer tekshiruvi ham alohida sinov serverida o‘tkazilgan; asosiy do‘konga soxta xaridor, buyurtma yoki sharh qo‘shilmagan.
