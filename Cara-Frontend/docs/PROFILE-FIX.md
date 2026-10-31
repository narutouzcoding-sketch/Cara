# Profilga kirish tuzatishi — 2026-10-27

Foydalanuvchi manzili: `http://127.0.0.1:5500/Cara-Frontend/profile.html`.

## Sabab va o‘zgarishlar

- Frontend APIga faqat Live Server 5501-portidan yo‘naltirar edi. 5500-portda `/api/me` statik serverga ketib, profil o‘rniga xatolik chiqardi. Endi localhost/127.0.0.1dagi 5500 va 5501 portlar `5502/api`ga ulanadi, ichki `/Cara-Frontend/` papkasi ham ishlaydi. Ochiq saytlarga bu lokal yo‘naltirish qo‘llanmaydi; aniq `apiBaseUrl` sozlamasi ustun.
- Lokal API CORS/origin tekshiruvida 5500-portga ham ruxsat berildi. CSRF va sessiya tekshiruvi saqlandi.
- Profil, login va buyurtmalar to‘lov konfiguratsiyasi yuklanishiga bog‘liq emas. Konfiguratsiya faqat hisobga kirgan checkout uchun so‘raladi.
- Login har urinishda joriy sessiya/CSRFni qayta oladi; dastlabki ulanish uzilishi keyingi urinishni bloklamaydi.
- Profil yuklashdagi Promise kutiladi; ishga tushish xatolari umumiy qayta ulanish oynasida ushlanadi. Server qaytganda mehmon yoki kabinet ko‘rinishi yangilanadi.
- Sessiya tugasa «Hisobga qayta kirish» havolasi chiqadi va himoyalangan amallar bloklanadi. Profil ma’lumoti qayta olingach formalar yana ishlaydi.
- To‘liq bo‘lmagan profil javobi tahrirlashni ochmaydi va qayta urinish taklif qiladi.

## Lokal muhit

Loyiha hozir `D:\My Projects\Cara\Cara-Frontend` ichida. Avvalgi `D:\My Projects\Cara-Frontend` bo‘sh qolgan. Papkaga bog‘liq data identifikatori o‘zgargani sabab yangi xususiy sozlamaga `CARA_DATABASE` orqali avvalgi baza manzili yozildi. Mavjud hisob/buyurtmalar ko‘chirilmagan yoki almashtirilmagan. Haqiqiy bazaga test hisoblari qo‘shilmadi.

5502-portdagi API ishga tushirildi. Keyingi safar frontend papkasida `python server.py` yoki `start.cmd` ishlating; Live Serverning o‘zi autentifikatsiya API emas. Django backendga o‘tganda `store-data.js`dagi `apiBaseUrl`ni o‘sha serverga moslang.

## Tekshiruv

- `npm test`: 45 frontend testi o‘tdi.
- `python -m unittest discover -s tests -v`: 50 backend testi o‘tdi, vaqtinchalik bazalar ishlatildi.
- Aniq 5500-portdagi profil sahifasi va yangi `commerce.js` HTTP 200 qaytardi; 5502dagi `/api/health`, `/api/me` 5500 originiga kerakli CORS header bilan HTTP 200 qaytardi.
- Brauzer vositasi loyiha ko‘chirilgandan keyin ishga tushmadi; ushbu tuzatish uchun yangi vizual tekshiruv tasdiqlanmagan. Frontend DOM testlari va haqiqiy HTTP tekshiruvi bajarildi.

Sahifani `Ctrl+F5` bilan yangilang. Hisobga kirilmagan bo‘lsa, profil kirish havolasini ko‘rsatadi.
