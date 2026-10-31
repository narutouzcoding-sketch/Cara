# Cara frontend API shartnomasi

Holat: 2026-10-27. Bu hujjat hozirgi `commerce.js`, `profile*.js`, `server.py` va testlardagi xatti-harakatga asoslangan. Django shu shakllarni qaytarsa, hisob, profil, checkout, buyurtma va sharh interfeyslarini qayta yozish shart emas.

## Umumiy qoidalar

- Asosiy yo‘l `/api`; endpointlar oxirida `/` yo‘q. `POST`ni redirect orqali moslashtirmang.
- So‘rov va javob UTF-8 JSON. Xatolar: `{"error":"O‘zbekcha tushunarli xabar."}`. HTML xato sahifasi yoki DRFning standart maydonlar ro‘yxatini yubormang; exception handler bilan shu shaklga keltiring.
- Vaqtlar Unix epoch **millisekund** sonlari. Narxlar UZSdagi butun so‘m; Payme adapterida summa ×100 qilinadi. Narxni `float` bilan saqlamang.
- Cookie asosidagi sessiya; `fetch` har doim `credentials: 'include'` ishlatadi. JWT/localStorage tokeni talab qilinmaydi.
- O‘zgartiruvchi so‘rovlar `X-CSRF-Token` headerini yuboradi. Django’da `CSRF_HEADER_NAME = "HTTP_X_CSRF_TOKEN"` qo‘ying. Mijoz tokenni `/me`dan oladi.
- Django `/me` mehmon uchun ham `get_token(request)` bilan `csrf` qaytarsin. Frontend login/register yuborishdan oldin shu javobni kutadi. Login/register javobidagi token Django loginidan keyin yangidan olinsin.
- `401`: hisob kerak; `403`: CSRF/ruxsat; `404`: resurs yo‘q; `409`: takroriy identifikator/to‘qnashuv/holat; `413`: hajm; `415`: media turi; `429`: limit. Notog‘ri maydonlar `400` qaytarsin.
- `/profile/avatar` uchun 750 000 bayt, odatiy yozish so‘rovlariga 16 384 bayt cheklov mavjud. Avatar frontendda 256×256 PNGga aylantiriladi.
- Shaxsiy javoblar, CSRF va eksportlar `Cache-Control: no-store` bilan qaytsin. Sessiya cookie `HttpOnly`, `SameSite=Strict`, HTTPSda `Secure` bo‘lsin.

## Endpointlar

| Metod va yo‘l | Kirish/ruxsat | So‘rov / javob |
| --- | --- | --- |
| `GET /health` | Ochiq | `{ok:true,currency:"UZS",version:"..."}` |
| `GET /config` | Ochiq | `{payment_methods:{cash:true,click:false,payme:false},prices_are_samples:true}`; maxfiy kalitlar yo‘q |
| `GET /me` | Ochiq | `{user:User|null,csrf:string|null}`; Django mehmon uchun ham token beradi |
| `POST /register` | Ochiq, Django CSRF | `{username,email,password}` → `201 {user:User,csrf:string}` va sessiya cookie |
| `POST /login` | Ochiq, Django CSRF | `{username,password}`; `username` email ham bo‘lishi mumkin → `200 {user:User,csrf:string}` |
| `POST /logout` | Sessiya + CSRF | `{}` → `{ok:true}`; sessiya bekor qilinadi, cookie tozalanadi |
| `GET /profile` | Sessiya | `Profile` |
| `PATCH /profile` | Sessiya + CSRF | `ProfileUpdate` → yangilangan `Profile` |
| `POST /profile/password` | Sessiya + CSRF | `{current_password,new_password}` → `{ok:true}`; boshqa seanslar yopiladi |
| `POST /profile/sessions/revoke` | Sessiya + CSRF | `{}` → `{ok:true}`; joriy seans qoladi |
| `GET /profile/avatar?v=...` | Sessiya | Egaga tegishli `image/png`, rasm bo‘lmasa `404` |
| `POST /profile/avatar` | Sessiya + CSRF | `{image:"data:image/png;base64,..."}` yoki `{remove:true}` → `{avatar_version:string|null}` |
| `POST /profile/location` | Sessiya + CSRF | `{query:"Termiz ..."}` → `{places:[Place]}` yoki `{latitude,longitude}` → `{place:Place}` |
| `GET /profile/export` | Sessiya | XLSX, MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="cara-profil.xlsx"` |
| `GET /orders` | Sessiya | `{orders:[Order]}`; faqat egasining buyurtmalari |
| `GET /orders?admin=1` | Sotuvchi | `{orders:[Order]}`; boshqaruv ro‘yxati |
| `GET /orders/{id}` | Egasi/sotuvchi | `{order:Order}`; boshqa xaridorga `404` |
| `POST /orders` | Sessiya + CSRF | `OrderCreate` + `Idempotency-Key` → `201 {order:Order}` |
| `PATCH /orders/{id}` | Sotuvchi + CSRF | `OrderUpdate` → `{order:Order}` |
| `GET /ratings` | Ochiq | `{ratings:{"f2":{count:1,average:4.0}}}`; baholanmagan mahsulot kaliti bo‘lmasligi mumkin |
| `GET /reviews?product=f2` | Ochiq | `Reviews`; ruxsat joriy sessiya asosida hisoblanadi |
| `POST /reviews` | Tasdiqlangan xaridor + CSRF | `{product_id,rating,body}` → yangilangan `Reviews` |
| `POST /payment-link` | Egasi + CSRF | `{order_id}` → `{url,provider,amount,currency:"UZS"}` |
| `POST /payments/click/prepare` | Click imzosi | URL-encoded callback; alohida provayder protokoli |
| `POST /payments/click/complete` | Click imzosi | URL-encoded callback; alohida provayder protokoli |
| `POST /payments/payme` | Payme Basic auth | JSON-RPC; protokol xatolari ham HTTP `200` |

Payment callbacklar browser sessiyasi/CSRF talab qilmaydi, ammo imzo yoki provayder autentifikatsiyasi, summa, holat va tranzaksiya takroriyligi majburiy tekshiriladi. Butun API uchun CSRFni o‘chirmang. Protokol tafsilotlari [COMMERCE-SETUP.md](../COMMERCE-SETUP.md)da.

## Ma’lumot shakllari

### User va Profile

```json
{
  "user": {"id":1,"username":"buyer","email":"buyer@example.test","role":"customer"},
  "created": 1793000000000,
  "details": {
    "full_name":"Test Xaridor","phone":"+998901234567","city":"Termiz",
    "address":"Test ko‘chasi 10","latitude":37.224,"longitude":67.278
  },
  "avatar_version": null,
  "stats": {"orders":0,"active":0,"delivered":0,"spent":0},
  "recent_orders": [],
  "reviews": [],
  "sessions": 1
}
```

`role`: `customer` yoki `admin`; Django `is_staff`ni to‘g‘ridan-to‘g‘ri barcha mijozlarga berish kerak emas. Sotuvchi rolini server xaritalaydi. Username 3–30: `[a-zA-Z0-9_.-]+`; email 5–150; parol 8–128. Username/email registrga bog‘liq bo‘lmagan unique bo‘lsin. Login maydoni email uchun 150 belgi qabul qiladi.

`ProfileUpdate`: `username,email,full_name,phone,city,address`, ixtiyoriy `latitude,longitude,current_password`. Hozir frontend ikkala profil formasidan saqlashda to‘liq joriy qiymatlarni yuboradi. Username/email o‘zgarsa joriy parol talab qilinadi. `full_name` ≤80, `phone` ≤25 va bo‘sh yoki `+998` + 9 raqam, `city` ≤80, `address` ≤400. Bo‘sh maydonlar `""`, koordinata yo‘q bo‘lsa ikkisi ham `null`. Koordinatalar chekli son: latitude ±85.051128, longitude ±180; 6 kasr xonasi.

Profil ichidagi shaxsiy `reviews`: `{product_id,rating,body,updated}`. `recent_orders`: eng yangi 5 buyurtma. `stats.spent` faqat `paid` buyurtmalar summasi.

`Place`: `{city,address,latitude,longitude}`. Qidiruv 3–160 belgi, eng ko‘pi 5 natija. Tashqi geokoderga hisob, email yoki sessiya yuborilmaydi. Xarita nuqtasi buyurtmaga nusxa sifatida yoziladi.

### Buyurtma yaratish

```http
POST /api/orders
Content-Type: application/json
X-CSRF-Token: <me javobidan>
Idempotency-Key: 985bedf1-8719-4bbc-8fd8-c5a3ec061ba9
```

```json
{
  "recipient":"Test Xaridor","phone":"+998901234567","city":"Termiz",
  "delivery_method":"pickup","address":"","payment_method":"cash","notes":"",
  "items":[{"id":"f2","size":"L","quantity":2}]
}
```

`recipient`: 2–80, `city`: 2–80; telefon `+998` +9 raqam. `delivery_method`: `pickup|courier`. Courier manzili 5–400, pickup 0–400. `notes`: 0–1000. Courier uchun ixtiyoriy koordinatalar; pickupda koordinata saqlanmaydi.

Savat 1–50 qator; miqdor 1–99 butun son, `true` qabul qilinmaydi. Bir mahsulot/o‘lcham birlashtiriladi, jami miqdori ≤99. ID va o‘lcham server katalogida bo‘lishi shart. Mahsulot narxi 1–1 000 000 000, subtotal ≤10 000 000 000 so‘m. Mijoz yuborgan narx, egasi, holat, valyuta va `paid` belgisi ishonchli ma’lumot emas.

Idempotency kaliti 8–100 `[A-Za-z0-9_-]`. `(user,key)` unique; bir xil kalit va payload oldingi buyurtmani qaytaradi, mazmun o‘zgarsa `409`. Django’da `transaction.atomic` va bazadagi unique constraint bilan parallel so‘rovlarni ham boshqaring. Frontend uzilgan so‘rovni shu sahifada takrorlaydi; Web Crypto mavjud bo‘lsa shu tabdagi yangilashdan keyin ham SHA-256 iz va tasodifiy kalit orqali takrorlaydi. Aloqa ma’lumoti retry xotirasiga yozilmaydi.

### Order javobi

```json
{
  "id":"CARA-A1B2C3D4E5F6","user_id":1,"created":1793000000000,"updated":1793000000000,
  "status":"pending","payment_method":"cash","payment_status":"unpaid","currency":"UZS",
  "subtotal":338000,"shipping_fee":0,"total":338000,"pricing_confirmed":0,"sample_prices":1,
  "recipient":"Test Xaridor","phone":"+998901234567","city":"Termiz","address":"",
  "delivery_method":"pickup","notes":"","latitude":null,"longitude":null,
  "items":[{"product_id":"f2","name":"Gulli oq ko‘ylak","size":"L","quantity":2,"unit_price":169000}]
}
```

Mahsulot nomi, narxi, tanlangan o‘lchami va manzil buyurtma vaqtidagi nusxa bo‘lsin. Keyinchalik katalog/profil o‘zgarishi eski buyurtmani o‘zgartirmasin. Courier hali tasdiqlanmaganida `shipping_fee:null`; pickupda `0`. `pricing_confirmed`, `sample_prices` uchun JSON boolean ham frontendga mos. `request_key`, `request_hash`, parol va sessiya bazaviy maydonlari chiqarilmaydi.

`OrderUpdate`:

- Tasdiqlash: `{status:"confirmed",approve_prices:true,shipping_fee:0}`. Fee 0–10 000 000, pickupda faqat 0.
- Jo‘natish: `{status:"shipped"}`.
- Topshirish: `{status:"delivered",cash_received:true}`; naqd uchun haqiqiy pul qabul qilingani kerak.
- Bekor qilish: `{status:"cancelled"}`.

Ruxsatli o‘tishlar: `pending→confirmed|cancelled`, `confirmed→shipped|delivered|cancelled`, `shipped→delivered`. Oxirgi holatdan chiqish yo‘q. Onlayn to‘lanmaguncha jo‘natish/topshirish yo‘q. Faol tranzaksiyani oddiy sotuvchi tugmasi bilan bekor qilish yo‘q. To‘lov holatlari: `unpaid|paid|refunded`.

### Sharhlar

```json
{
  "items":[{"id":1,"username":"buyer","rating":4,"body":"Yaxshi mahsulot.","created":1793000000000,"updated":1793000000000}],
  "count":1,"average":4.0,"can_review":true,
  "own_review":{"rating":4,"body":"Yaxshi mahsulot."}
}
```

Sharhga ruxsat: shu hisobga tegishli buyurtmada aynan shu mahsulot bo‘lishi, holat `delivered`, to‘lov `paid`. Rating 1–5 butun son, body 5–2000 belgi. `(user,product)` unique; qayta yuborish tahrirlash hisoblanadi. Ochiq ro‘yxatda eng yangi 100 sharh; `count` va `average` barcha haqiqiy sharhlardan hisoblanadi. Mehmon uchun `can_review:false`, `own_review:null`.

## Katalog va keyingi kengaytirish chegarasi

Hozir mahsulotlar va blog statik `store-data.js` hamda HTML kartalaridan olinadi; mavjud frontend `GET /products` ishlatmaydi. Yangi Django adminida mahsulot yaratish hozirgi HTMLga o‘z-o‘zidan qo‘shilmaydi. Dinamik katalog alohida bosqich: products API + render + qidiruv/filter/pagination + server narxi/mavjudligi. Dastlab hozirgi `f1…f8,n1…n8` IDlarini va asset yo‘llarini saqlang.

Joriy lokal `/orders`: xaridorga eng yangi 50, sotuvchiga 100 buyurtma. Django’ni shu ro‘yxat shakli bilan boshlash mumkin; to‘liq tarix uchun cursor pagination va frontenddagi «Yana yuklash»ni birga ishlab chiqing. Yangi pagination envelope’ni eski frontendga moslamasdan kiritmang.
