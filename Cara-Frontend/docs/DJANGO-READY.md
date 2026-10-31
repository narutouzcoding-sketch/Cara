# Django backendni boshlash rejasi

Holat: 2026-10-27. Frontend tekshirildi va ulanishdagi xatolar tuzatildi. Bu hujjat yangi backendni qurish rejasi; amaldagi server hali Django emas.

## Muhitni tanlash

Tekshirilgan kompyuterda Python **3.15.0**, Node **24.14.1** bor. Joriy stdlib server testlari Python 3.15da o‘tdi. Django uchun alohida virtual muhit yarating. Barqaror boshlash varianti: Python 3.14 + Django 5.2 LTSning eng yangi xavfsizlik patchi. Django 5.2 Python 3.10–3.14ni qo‘llaydi; 3.15ni shu muhitga ishlatmang. [Rasmiy Python mosligi](https://docs.djangoproject.com/en/5.2/faq/install/), [qo‘llab-quvvatlanadigan Django versiyalari](https://www.djangoproject.com/download/).

Quyidagilar yangi **alohida backend papkasida** bajariladigan buyruqlar; bu audit ularni ishga tushirmadi. Python 3.14 o‘rnatilgan bo‘lishi kerak:

```powershell
cd "D:\My Projects"
mkdir Cara-Backend
cd Cara-Backend
py -3.14 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install "Django>=5.2.8,<5.3"
.\.venv\Scripts\python.exe -m django startproject config .
.\.venv\Scripts\python.exe manage.py startapp accounts
.\.venv\Scripts\python.exe manage.py startapp catalog
.\.venv\Scripts\python.exe manage.py startapp orders
.\.venv\Scripts\python.exe manage.py startapp reviews
.\.venv\Scripts\python.exe manage.py startapp payments
```

`migrate`dan **oldin** custom user model, `AUTH_USER_MODEL` va app sozlamalarini yozing. Ishlaydigan versiyalar aniqlangach `pip freeze > requirements.txt` bilan aniq dependency holatini saqlang. DRF ixtiyoriy: hozirgi JSON shartnomasini Django `JsonResponse` bilan ham bajarish mumkin.

## Qurilish ketma-ketligi va qabul mezonlari

| Bosqich | Natija | Tugallanganini qanday bilasiz |
| --- | --- | --- |
| 1. Hisob | Custom User, case-insensitive username/email, session, CSRF, admin | Register/login/logout; boshqa foydalanuvchi ma’lumotiga ruxsat yo‘q |
| 2. Katalog | Product, ProductSize/variant, 16 IDni import | Frontend va server narxlari mos; narx browserdan olinmaydi |
| 3. Buyurtma | Order, OrderItem, snapshot, idempotency | Parallel takroriy POST bitta order; boshqa egaga 404 |
| 4. Sotuvchi | Holatlarni boshqarish, narx/fee tasdig‘i, audit | Xaridor holatni o‘zgartira olmaydi; noqonuniy o‘tish 409 |
| 5. Profil | Manzil, xususiy avatar, seans, XLSX | Faqat egasi ko‘radi; parol yangilanganda boshqa seanslar yopiladi |
| 6. Sharh | Unique xaridor/mahsulot, real aggregation | Faqat delivered+paid order egasi; takroriy sharh tahrirlanadi |
| 7. Onlayn to‘lov | Callback, transaction, idempotency | Sandbox, noto‘g‘ri imzo/summa/replay sinovlari; keyin merchant tasdig‘i |
| 8. Ishlab chiqarish muhiti | PostgreSQL, HTTPS, statik/media, backup, monitoring | Deploy tekshiruvi va zaxiradan tiklash sinovi o‘tadi |

Har bosqichda [API shartnomasi](API-CONTRACT.md)dagi URL, birlik va javob shakllarini saqlang. Frontend testlari mock API bilan ishlaydi; ular yangi Django backendga avtomatik ulanmaydi. Django API testlari va haqiqiy brauzer checkout sinovi alohida talab qilinadi.

## Modellar uchun tayanch

- `accounts.User`: Django auth asosida username, email, rol; case-insensitive unique constraint. Sotuvchi guruh/ruxsatlari bilan boshqariladi; `role:"admin"` frontendga serverdan chiqariladi. Xaridor payloadidan `is_staff/is_superuser/role` qabul qilinmaydi.
- `accounts.Profile`: user OneToOne, full_name, phone, city, address, latitude, longitude. `Avatar`: private storage, version; PNG dekoderi/cheklovlar bilan tekshirish.
- `catalog.Product`: mavjud string ID, name, brand, description, category, UZS butun narx, image, active. Variant/o‘lcham va stockni shu bosqichda alohida loyihalang.
- `orders.Order`: ID `CARA-` +12 uppercase hex; user, created/updated, status, payment_method/status, subtotal, shipping_fee nullable, total, confirmed/sample flags, recipient/manzil nusxasi, idempotency key/hash.
- `orders.OrderItem`: order, product reference va name/unit_price/size snapshot, quantity; unique `(order,product,size)`.
- `reviews.Review`: user, product, rating, body, timestamps; unique `(user,product)` va rating 1–5 check.
- `payments.Transaction`: provider, provider_id unique juftlik, order, amount, state, provider timestamps, reason. Bitta orderga bir faol/to‘langan tranzaksiya cheklovi.
- `AuditEvent`: actor, event, order, timestamp. Parol, token, karta rekvizitini logga yozmang.

Summalar uchun `BigIntegerField` yoki tegishli butun qiymat cheklovlari; `FloatField` ishlatmang. Order yaratish, holat va callback yangilashlar `transaction.atomic()` hamda zarur `select_for_update()` bilan bajarilsin. Stock qo‘shilganda reservation/timeout strategiyasi ham shu tranzaksiyalarga qo‘shiladi.

## Frontendni ulash

Eng sodda joylashtirish: frontend va `/api` bir origin ostida. Django developmentda HTMLni aniq sahifalar ro‘yxati orqali bering, statik assetlar uchun `staticfiles`; butun repositoryni ochiq fayl serveriga aylantirmang. Yakunda takroriy header/footerlarni base templatega ko‘chirish mumkin; oldin ishlaydigan API mosligini saqlang.

Alohida portdagi Django uchun `store-data.js`dagi yagona sozlama:

```json
"apiBaseUrl": "http://localhost:8000/api"
```

Nisbiy `/api/` ham ishlaydi, oxirgi `/` frontendda normallashtiriladi. Localhost va 127.0.0.1ni bitta test oqimida aralashtirmang: ular alohida cookie/localStorage manzillari. API ko‘chishi savatni ko‘chirmaydi; frontend originini almashtirsangiz savat boshqa xotirada qoladi.

CSRF va CORS:

```python
CSRF_HEADER_NAME = "HTTP_X_CSRF_TOKEN"
CSRF_TRUSTED_ORIGINS = ["http://localhost:5502"]
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Strict"
TIME_ZONE = "Asia/Tashkent"
USE_TZ = True
```

`CSRF_TRUSTED_ORIGINS` **CORSni yoqmaydi**. Alohida originda aniq frontend originiga `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, preflightda `Content-Type,X-CSRF-Token,Idempotency-Key`, metodlar `GET,POST,PATCH,OPTIONS` kerak. Origin wildcard ishlatmang. Buni reverse proxy yoki tanlangan CORS middleware bilan sozlang. Turli saytlardagi domenlarga cookie uchun qo‘shimcha brauzer cheklovlari bor; bir originli deployni tanlang.

`GET /me`: `get_token(request)` + user/null. Django `login()` tokenni almashtirgani uchun muvaffaqiyatli login/register javobida `get_token(request)`ni yana chaqiring. CSRF failure javobini ham JSONga moslang. [Django CSRF qo‘llanmasi](https://docs.djangoproject.com/en/5.2/howto/csrf/).

## Eski ma’lumotlarni yo‘qotmasdan ko‘chirish

1. Mavjud manzillarni `python server.py config` bilan aniqlang. `.env` va bazani alohida himoyalang; katalog eksporti hisoblar eksporti emas.
2. `python server.py backup` bilan yaxlit nusxa oling. Nusxa live WAL bazadan SQLite backup API orqali olinadi. Ko‘chirish mashqini shu nusxada bajaring.
3. `python server.py catalog` → chiqqan JSONni yangi backendga import qiling. ID, nom, narx, rasm va o‘lchamlarni saqlang. Bu umumiy JSON, Django fixture shakli emas; `import_cara_catalog` management command yozing va `update_or_create`ni ID bo‘yicha ishlating.
4. User, profile, avatar, order, item, review, payment va audit ma’lumotlari uchun alohida import command yozing. IDlarni saqlang yoki eski→yangi xaritani qo‘llang; bog‘lanishlarni transaction ichida ko‘chiring. Sessiyalarni ko‘chirmang, qayta login talab qiling.
5. **Parol xeshi Django bilan bevosita mos emas.** Eski format `pbkdf2_sha256$hex_salt$hex_digest`; Django formatida iteratsiya va base64 hash bor. Shunchaki user.password maydoniga nusxalamang. Nazoratli legacy hasher orqali 600 000 iteratsiya va `bytes.fromhex(salt)` bilan tekshirib, muvaffaqiyatli login paytida Django `set_password`ga yangilang; yoki tekshirilgan xavfsiz reset oqimini yarating. Eski xeshning algoritm nomini custom `cara_legacy_pbkdf2`ga importda o‘zgartirish mumkin. [Django password formatlari](https://docs.djangoproject.com/en/5.2/topics/auth/passwords/).
6. User/order/review sonlari, har order summasi, product ID va egaliklarini solishtiring; XLSX eksport va private avatarni tekshiring. Bir necha qayta import dublikat yaratmasin.
7. Yakuniy ko‘chirishda eski serverga yozishni vaqtincha to‘xtating, yangi backup oling, importni bajaring, API originini almashtiring, smoke test qiling. Xatoda yangi serverni to‘xtatib eski server/origin va saqlangan bazaga qayting. Eski bazani `migrate` bilan o‘zgartirmang.

## Ommaviy ishga tushirishdan oldin

`DEBUG=False`, maxfiy `SECRET_KEY`, aniq `ALLOWED_HOSTS`, HTTPS va secure cookie, PostgreSQL, WSGI/ASGI server, reverse proxy, statik fayllar, xususiy media, health/error loglari, login/callback limitlari, muntazam backup va restore sinovi kerak. Django `manage.py check --deploy`ni to‘g‘ri production settings bilan bajaring. Click/Payme merchant sinovlari tugamaguncha onlayn usullar o‘chiq qolsin. [Rasmiy deploy checklist](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/).
