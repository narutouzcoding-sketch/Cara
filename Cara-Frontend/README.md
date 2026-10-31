# Cara Frontend

O‘zbekcha kiyimlar do‘koni: original Cara dizayni, Creepster, Font Awesome, 16 mahsulot va UZS narxlari. Hozir HTML/CSS/JavaScript frontend hamda Python stdlib + SQLite lokal server ishlaydi. Django backendni alohida loyihada boshlash uchun API shartnomasi va ko‘chirish rejasi tayyorlangan.

## Ishga tushirish

```powershell
python server.py
```

[Saytni ochish](http://localhost:5502/). Windows’da `start.cmd` ham ishlaydi. Sahifalarni `file://` orqali ochmang.

## Tekshiruv

Node.js 24+ testlar uchun, Python 3.11+ lokal server uchun:

```powershell
npm ci
npm run check
```

`check` frontend va backend testlarini ketma-ket bajaradi. Barcha test hisoblari va buyurtmalari vaqtinchalik bazalarda yaratiladi.

## Asosiy yo‘riqnomalar

5500-portdagi profil/kirish tuzatishi: [PROFILE-FIX.md](docs/PROFILE-FIX.md).

- [Django backendni boshlash va ma’lumotlarni ko‘chirish](docs/DJANGO-READY.md)
- [Frontend kutayotgan API shartnomasi](docs/API-CONTRACT.md)
- [Loyihani boshqarish, zaxira va nosozliklarni aniqlash](docs/PROJECT-GUIDE.md)
- [Yakuniy tekshiruv va keyingi ishlar](docs/FINAL-AUDIT.md)
- [Mavjud imkoniyatlar](README-UZ.md)
- [Click/Payme sozlamalari](COMMERCE-SETUP.md)
- [Tekshiruv natijalari](TEKSHIRUV.json)

Naqd buyurtma ishlaydi. Onlayn to‘lovlar merchant rekvizitlari va provayder tekshiruvlari bajarilguncha o‘chirilgan. Django ilovasi bu papkada hali yaratilmagan; uni boshlash tartibi yuqoridagi yo‘riqnomada.
