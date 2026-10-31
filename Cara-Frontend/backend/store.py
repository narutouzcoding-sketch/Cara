"""Persistent accounts, orders and verified-purchase reviews. Python stdlib only."""
from contextlib import contextmanager
from pathlib import Path
import hashlib
import hmac
import json
import math
import re
import secrets
import sqlite3
import time


class StoreError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


def now_ms():
    return int(time.time() * 1000)


def text(value, label, minimum=1, maximum=200):
    if not isinstance(value, str):
        raise StoreError(f'{label} noto‘g‘ri.')
    value = value.strip()
    if not minimum <= len(value) <= maximum or any(ord(c) < 32 and c not in '\n\t' for c in value):
        raise StoreError(f'{label}: {minimum}–{maximum} belgi kiriting.')
    return value


def integer(value, minimum, maximum, label):
    if type(value) is not int or not minimum <= value <= maximum:
        raise StoreError(f'{label} noto‘g‘ri.')
    return value


def coordinates(latitude, longitude):
    if latitude is None and longitude is None:
        return None, None
    if any(type(value) not in (int, float) or not math.isfinite(value) for value in (latitude, longitude)):
        raise StoreError('Xaritadagi nuqta noto‘g‘ri.')
    if not -85.051128 <= latitude <= 85.051128 or not -180 <= longitude <= 180:
        raise StoreError('Xaritadagi nuqta chegaradan tashqarida.')
    return round(latitude, 6), round(longitude, 6)


class Store:
    def __init__(self, root, database):
        self.root = Path(root).resolve()
        self.database = Path(database).resolve()
        self.database.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','admin')),
                created INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                csrf TEXT NOT NULL, expires INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS profiles (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                full_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
                city TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS user_avatars (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                image BLOB NOT NULL, version TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                created INTEGER NOT NULL, updated INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','shipped','delivered','cancelled')),
                payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','click','payme')),
                payment_status TEXT NOT NULL DEFAULT 'unpaid', currency TEXT NOT NULL DEFAULT 'UZS',
                subtotal INTEGER NOT NULL, shipping_fee INTEGER, total INTEGER NOT NULL,
                pricing_confirmed INTEGER NOT NULL DEFAULT 0, sample_prices INTEGER NOT NULL,
                recipient TEXT NOT NULL, phone TEXT NOT NULL, city TEXT NOT NULL, address TEXT NOT NULL,
                delivery_method TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
                request_key TEXT NOT NULL, request_hash TEXT NOT NULL,
                UNIQUE(user_id,request_key));
            CREATE TABLE IF NOT EXISTS order_items (
                order_id TEXT NOT NULL REFERENCES orders(id), product_id TEXT NOT NULL,
                name TEXT NOT NULL, size TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 99),
                unit_price INTEGER NOT NULL CHECK(unit_price>0), PRIMARY KEY(order_id,product_id,size));
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
                product_id TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
                body TEXT NOT NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL,
                UNIQUE(user_id,product_id));
            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT NOT NULL,
                provider_id TEXT NOT NULL, order_id TEXT NOT NULL REFERENCES orders(id),
                amount INTEGER NOT NULL, state INTEGER NOT NULL DEFAULT 1,
                provider_time INTEGER NOT NULL DEFAULT 0, create_time INTEGER NOT NULL,
                perform_time INTEGER NOT NULL DEFAULT 0, cancel_time INTEGER NOT NULL DEFAULT 0,
                reason INTEGER, UNIQUE(provider,provider_id));
            CREATE UNIQUE INDEX IF NOT EXISTS one_active_payment ON payments(order_id) WHERE state IN (1,2);
            CREATE INDEX IF NOT EXISTS orders_owner ON orders(user_id,created);
            CREATE TABLE IF NOT EXISTS audit_events (
                id INTEGER PRIMARY KEY, actor INTEGER, event TEXT NOT NULL,
                order_id TEXT, created INTEGER NOT NULL);
            ''')
            for table in ('profiles', 'orders'):
                columns = {row['name'] for row in db.execute(f'PRAGMA table_info({table})')}
                for column in ('latitude', 'longitude'):
                    if column not in columns:
                        db.execute(f'ALTER TABLE {table} ADD COLUMN {column} REAL')

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    def catalog(self):
        source = (self.root / 'store-data.js').read_text(encoding='utf-8')
        data = json.loads(source.split('window.CARA_DATA = ', 1)[1].rstrip().removesuffix(';'))
        if data['store'].get('currency') != 'UZS':
            raise StoreError('Do‘kon valyutasi UZS bo‘lishi kerak.', 503)
        return data

    @staticmethod
    def password_hash(password, salt=None):
        if not isinstance(password, str) or not 8 <= len(password) <= 128:
            raise StoreError('Parol 8–128 belgidan iborat bo‘lsin.')
        salt = salt or secrets.token_hex(16)
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600_000).hex()
        return f'pbkdf2_sha256${salt}${digest}'

    @staticmethod
    def public_user(row):
        return {key: row[key] for key in ('id', 'username', 'email', 'role')}

    def register(self, username, email, password):
        username = text(username, 'Foydalanuvchi nomi', 3, 30)
        if not re.fullmatch(r'[a-zA-Z0-9_.-]+', username):
            raise StoreError('Foydalanuvchi nomida lotin harfi, raqam, nuqta, tire yoki pastki chiziq ishlating.')
        email = text(email, 'Email', 5, 150).lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            raise StoreError('Email manzilini to‘g‘ri kiriting.')
        password_hash = self.password_hash(password)
        try:
            with self.connection() as db:
                row_id = db.execute('INSERT INTO users(username,email,password_hash,created) VALUES(?,?,?,?)',
                                    (username, email, password_hash, now_ms())).lastrowid
                return self.public_user(db.execute('SELECT * FROM users WHERE id=?', (row_id,)).fetchone())
        except sqlite3.IntegrityError:
            raise StoreError('Bu foydalanuvchi nomi yoki email band.', 409)

    def login(self, username, password):
        username = text(username, 'Foydalanuvchi nomi', 1, 150)
        with self.connection() as db:
            row = db.execute('SELECT * FROM users WHERE username=? COLLATE NOCASE OR email=? COLLATE NOCASE', (username, username)).fetchone()
        stored = row['password_hash'] if row else 'pbkdf2_sha256$' + '0' * 32 + '$' + '0' * 64
        try:
            candidate = self.password_hash(password, stored.split('$')[1])
        except StoreError:
            candidate = ''
        if not row or not hmac.compare_digest(candidate, stored):
            raise StoreError('Foydalanuvchi nomi yoki parol noto‘g‘ri.', 401)
        return self.public_user(row)

    def new_session(self, user_id):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        with self.connection() as db:
            db.execute('DELETE FROM sessions WHERE expires<?', (now_ms(),))
            db.execute('INSERT INTO sessions VALUES(?,?,?,?)',
                       (hashlib.sha256(token.encode()).hexdigest(), user_id, csrf, now_ms() + 7 * 86_400_000))
        return token, csrf

    def session(self, token):
        if not token or len(token) > 200:
            return None
        with self.connection() as db:
            row = db.execute('SELECT u.*,s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',
                             (hashlib.sha256(token.encode()).hexdigest(), now_ms())).fetchone()
        return {**self.public_user(row), 'csrf': row['csrf']} if row else None

    def logout(self, token):
        with self.connection() as db:
            db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))

    def promote_admin(self, username):
        with self.connection() as db:
            result = db.execute("UPDATE users SET role='admin' WHERE username=? COLLATE NOCASE", (username,))
            if not result.rowcount:
                raise StoreError('Avval shu nom bilan sayt orqali hisob yarating.')

    def profile(self, user):
        with self.connection() as db:
            row = db.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone()
            details = db.execute('SELECT full_name,phone,city,address,latitude,longitude FROM profiles WHERE user_id=?', (user['id'],)).fetchone()
            avatar = db.execute('SELECT version FROM user_avatars WHERE user_id=?', (user['id'],)).fetchone()
            stats = db.execute("""SELECT COUNT(*) AS orders,
                COALESCE(SUM(status IN ('pending','confirmed','shipped')),0) AS active,
                COALESCE(SUM(status='delivered'),0) AS delivered,
                COALESCE(SUM(CASE WHEN payment_status='paid' THEN total ELSE 0 END),0) AS spent
                FROM orders WHERE user_id=?""", (user['id'],)).fetchone()
            reviews = [dict(r) for r in db.execute('SELECT product_id,rating,body,updated FROM reviews WHERE user_id=? ORDER BY updated DESC', (user['id'],))]
            sessions = db.execute('SELECT COUNT(*) FROM sessions WHERE user_id=? AND expires>?', (user['id'], now_ms())).fetchone()[0]
        return dict(user=self.public_user(row), created=row['created'],
                    details=dict(details) if details else dict(full_name='', phone='', city='', address='', latitude=None, longitude=None),
                    avatar_version=avatar['version'] if avatar else None,
                    stats=dict(stats), reviews=reviews, sessions=sessions,
                    recent_orders=self.list_orders(user)[:5])

    @staticmethod
    def check_password(row, password):
        try:
            candidate = Store.password_hash(password, row['password_hash'].split('$')[1])
        except StoreError:
            candidate = ''
        if not hmac.compare_digest(candidate, row['password_hash']):
            raise StoreError('Joriy parol noto‘g‘ri.', 403)

    def update_profile(self, user, payload):
        username = text(payload.get('username'), 'Foydalanuvchi nomi', 3, 30)
        if not re.fullmatch(r'[a-zA-Z0-9_.-]+', username):
            raise StoreError('Foydalanuvchi nomida lotin harfi, raqam, nuqta, tire yoki pastki chiziq ishlating.')
        email = text(payload.get('email'), 'Email', 5, 150).lower()
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email):
            raise StoreError('Email manzilini to‘g‘ri kiriting.')
        full_name = text(payload.get('full_name', ''), 'Ism-familiya', 0, 80)
        phone = re.sub(r'[\s()-]', '', text(payload.get('phone', ''), 'Telefon', 0, 25))
        if phone and not re.fullmatch(r'\+998\d{9}', phone):
            raise StoreError('Telefonni +998 bilan kiriting.')
        city = text(payload.get('city', ''), 'Shahar', 0, 80)
        address = text(payload.get('address', ''), 'Manzil', 0, 400)
        try:
            with self.connection() as db:
                db.execute('BEGIN IMMEDIATE')
                row = db.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone()
                previous = db.execute('SELECT latitude,longitude FROM profiles WHERE user_id=?', (user['id'],)).fetchone()
                latitude, longitude = coordinates(payload.get('latitude', previous['latitude'] if previous else None),
                                                  payload.get('longitude', previous['longitude'] if previous else None))
                if username != row['username'] or email != row['email']:
                    self.check_password(row, payload.get('current_password'))
                db.execute('UPDATE users SET username=?,email=? WHERE id=?', (username, email, user['id']))
                db.execute('''INSERT INTO profiles(user_id,full_name,phone,city,address,latitude,longitude) VALUES(?,?,?,?,?,?,?)
                    ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name,phone=excluded.phone,city=excluded.city,
                    address=excluded.address,latitude=excluded.latitude,longitude=excluded.longitude''',
                           (user['id'], full_name, phone, city, address, latitude, longitude))
        except sqlite3.IntegrityError:
            raise StoreError('Bu foydalanuvchi nomi yoki email band.', 409)
        return self.profile(user)

    def save_avatar(self, user, data):
        from backend.avatar import validate_avatar
        image = validate_avatar(data)
        version = secrets.token_hex(12)
        with self.connection() as db:
            db.execute('INSERT INTO user_avatars VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET image=excluded.image,version=excluded.version',
                       (user['id'], image, version))
        return dict(avatar_version=version)

    def avatar(self, user):
        with self.connection() as db:
            row = db.execute('SELECT image FROM user_avatars WHERE user_id=?', (user['id'],)).fetchone()
        if not row:
            raise StoreError('Profil rasmi topilmadi.', 404)
        return row['image']

    def remove_avatar(self, user):
        with self.connection() as db:
            db.execute('DELETE FROM user_avatars WHERE user_id=?', (user['id'],))

    def change_password(self, user, payload, token):
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM users WHERE id=?', (user['id'],)).fetchone()
            self.check_password(row, payload.get('current_password'))
            if payload.get('new_password') == payload.get('current_password'):
                raise StoreError('Yangi parol joriy paroldan farq qilsin.')
            hashed = self.password_hash(payload.get('new_password'))
            db.execute('UPDATE users SET password_hash=? WHERE id=?', (hashed, user['id']))
            db.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', (user['id'], hashlib.sha256(token.encode()).hexdigest()))

    def revoke_other_sessions(self, user, token):
        with self.connection() as db:
            db.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', (user['id'], hashlib.sha256(token.encode()).hexdigest()))

    def export_profile(self, user):
        result = self.profile(user)
        result.pop('recent_orders')
        with self.connection() as db:
            result['orders'] = [self.order(db, row) for row in db.execute('SELECT * FROM orders WHERE user_id=? ORDER BY created DESC', (user['id'],))]
        return result

    def create_order(self, user, payload, key, methods):
        if not isinstance(payload, dict):
            raise StoreError('Buyurtma noto‘g‘ri.')
        key = text(key, 'So‘rov identifikatori', 8, 100)
        if not re.fullmatch(r'[A-Za-z0-9_-]+', key):
            raise StoreError('So‘rov identifikatori noto‘g‘ri.')
        request_hash = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        with self.connection() as db:
            existing = db.execute('SELECT * FROM orders WHERE user_id=? AND request_key=?', (user['id'], key)).fetchone()
            if existing:
                if existing['request_hash'] != request_hash:
                    raise StoreError('Bu so‘rov identifikatori boshqa buyurtmada ishlatilgan.', 409)
                return self.order(db, existing)
        method = payload.get('payment_method')
        if not isinstance(method, str):
            raise StoreError('To‘lov usuli noto‘g‘ri.')
        if method not in methods or not methods[method]:
            raise StoreError('Tanlangan to‘lov usuli hali ulanmagan.', 409)
        recipient = text(payload.get('recipient'), 'Ism-familiya', 2, 80)
        phone = re.sub(r'[\s()-]', '', text(payload.get('phone'), 'Telefon', 9, 25))
        if not re.fullmatch(r'\+998\d{9}', phone):
            raise StoreError('Telefonni +998 bilan kiriting.')
        city = text(payload.get('city'), 'Shahar', 2, 80)
        delivery = payload.get('delivery_method')
        if delivery not in ('pickup', 'courier'):
            raise StoreError('Yetkazib berish usulini tanlang.')
        address = text(payload.get('address', ''), 'Manzil', 5 if delivery == 'courier' else 0, 400)
        latitude, longitude = coordinates(payload.get('latitude'), payload.get('longitude'))
        if delivery != 'courier':
            latitude, longitude = None, None
        notes = text(payload.get('notes', ''), 'Izoh', 0, 1000)
        raw_items = payload.get('items')
        if not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 50:
            raise StoreError('Savatda 1–50 qator bo‘lishi mumkin.')
        catalog = self.catalog()
        products = {p['id']: p for p in catalog['products']}
        items = {}
        for raw in raw_items:
            if not isinstance(raw, dict) or not isinstance(raw.get('id'), str) or raw['id'] not in products:
                raise StoreError('Savatda noma’lum mahsulot bor.')
            p = products[raw['id']]
            size = raw.get('size')
            if size not in p['sizes']:
                raise StoreError('Mahsulot o‘lchami noto‘g‘ri.')
            quantity = integer(raw.get('quantity'), 1, 99, 'Miqdor')
            price = integer(p['price'], 1, 1_000_000_000, 'Mahsulot narxi')
            item_key = (p['id'], size)
            quantity += items.get(item_key, {}).get('quantity', 0)
            if quantity > 99:
                raise StoreError('Bir mahsulot o‘lchamidan 99 donadan ko‘p bo‘lmaydi.')
            items[item_key] = dict(id=p['id'], name=p['name'], size=size, quantity=quantity, unit_price=price)
        subtotal = sum(i['quantity'] * i['unit_price'] for i in items.values())
        if subtotal > 10_000_000_000:
            raise StoreError('Buyurtma summasi chegaradan oshdi.')
        order_id = 'CARA-' + secrets.token_hex(6).upper()
        created = now_ms()
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            existing = db.execute('SELECT * FROM orders WHERE user_id=? AND request_key=?', (user['id'], key)).fetchone()
            if existing:
                if existing['request_hash'] != request_hash:
                    raise StoreError('Takroriy so‘rov mazmuni farq qiladi.', 409)
                return self.order(db, existing)
            db.execute('''INSERT INTO orders(id,user_id,created,updated,payment_method,subtotal,shipping_fee,total,
                sample_prices,recipient,phone,city,address,delivery_method,notes,request_key,request_hash,latitude,longitude)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                (order_id, user['id'], created, created, method, subtotal, 0 if delivery == 'pickup' else None,
                 subtotal, int(catalog['store'].get('pricesAreSamples', True)), recipient, phone, city, address, delivery, notes, key, request_hash, latitude, longitude))
            for item in items.values():
                db.execute('INSERT INTO order_items VALUES(?,?,?,?,?,?)',
                           (order_id, item['id'], item['name'], item['size'], item['quantity'], item['unit_price']))
            db.execute('INSERT INTO audit_events(actor,event,order_id,created) VALUES(?,?,?,?)',
                       (user['id'], 'order_created', order_id, created))
            return self.order(db, db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone())

    @staticmethod
    def order(db, row):
        result = dict(row)
        result.pop('request_hash', None)
        result.pop('request_key', None)
        result['items'] = [dict(item) for item in db.execute('SELECT product_id,name,size,quantity,unit_price FROM order_items WHERE order_id=?', (row['id'],))]
        return result

    def list_orders(self, user, admin=False):
        if admin and user['role'] != 'admin':
            raise StoreError('Sotuvchi ruxsati kerak.', 403)
        with self.connection() as db:
            rows = db.execute('SELECT * FROM orders ORDER BY created DESC LIMIT 100') if admin else db.execute('SELECT * FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 50', (user['id'],))
            return [self.order(db, row) for row in rows]

    def get_order(self, user, order_id):
        order_id = text(order_id, 'Buyurtma identifikatori', 17, 17)
        if not re.fullmatch(r'CARA-[A-F0-9]{12}', order_id):
            raise StoreError('Buyurtma identifikatori noto‘g‘ri.')
        with self.connection() as db:
            row = db.execute('SELECT * FROM orders WHERE id=? AND (user_id=? OR ?=1)', (order_id, user['id'], int(user['role'] == 'admin'))).fetchone()
            if not row:
                raise StoreError('Buyurtma topilmadi.', 404)
            return self.order(db, row)

    def update_order(self, user, order_id, payload):
        if user['role'] != 'admin':
            raise StoreError('Buyurtma holatini faqat sotuvchi o‘zgartiradi.', 403)
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
            if not row:
                raise StoreError('Buyurtma topilmadi.', 404)
            status = payload.get('status')
            allowed = {'pending': ['confirmed', 'cancelled'], 'confirmed': ['shipped', 'delivered', 'cancelled'], 'shipped': ['delivered'], 'delivered': [], 'cancelled': []}
            if status not in allowed[row['status']]:
                raise StoreError('Bu holatga o‘tishga ruxsat yo‘q.', 409)
            shipping, total, confirmed = row['shipping_fee'], row['total'], row['pricing_confirmed']
            payment_status = row['payment_status']
            if status == 'confirmed':
                if payload.get('approve_prices') is not True:
                    raise StoreError('Mahsulot narxlari va mavjudligini tasdiqlang.')
                shipping = integer(payload.get('shipping_fee', 0), 0, 10_000_000, 'Yetkazib berish narxi')
                if row['delivery_method'] == 'pickup' and shipping != 0:
                    raise StoreError('Olib ketish uchun yetkazib berish narxi 0 so‘m bo‘lishi kerak.')
                total, confirmed = row['subtotal'] + shipping, 1
            if status in ('shipped', 'delivered') and row['payment_method'] != 'cash' and payment_status != 'paid':
                raise StoreError('Onlayn to‘lov tasdiqlanmaguncha buyurtma jo‘natilmaydi.', 409)
            if status == 'delivered' and row['payment_method'] == 'cash':
                if payload.get('cash_received') is not True:
                    raise StoreError('Mahsulot va naqd to‘lov qabul qilinganini tasdiqlang.')
                payment_status = 'paid'
            if status == 'cancelled' and db.execute('SELECT 1 FROM payments WHERE order_id=? AND state IN (1,2)', (order_id,)).fetchone():
                raise StoreError('Faol to‘lov bor. Avval provayder orqali bekor qiling yoki pulni qaytaring.', 409)
            db.execute('UPDATE orders SET status=?,shipping_fee=?,total=?,pricing_confirmed=?,payment_status=?,updated=? WHERE id=?',
                       (status, shipping, total, confirmed, payment_status, now_ms(), order_id))
            db.execute('INSERT INTO audit_events(actor,event,order_id,created) VALUES(?,?,?,?)', (user['id'], 'order_' + status, order_id, now_ms()))
            return self.order(db, db.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone())

    @staticmethod
    def eligible(db, user_id, product_id):
        return bool(db.execute("SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.user_id=? AND i.product_id=? AND o.status='delivered' AND o.payment_status='paid' LIMIT 1", (user_id, product_id)).fetchone())

    def review_data(self, product_id, user=None):
        if product_id not in {p['id'] for p in self.catalog()['products']}:
            raise StoreError('Mahsulot topilmadi.', 404)
        with self.connection() as db:
            rows = [dict(row) for row in db.execute('SELECT r.id,r.rating,r.body,r.created,r.updated,u.username FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.product_id=? ORDER BY r.updated DESC LIMIT 100', (product_id,))]
            average = db.execute('SELECT COUNT(*) AS count,COALESCE(AVG(rating),0) AS average FROM reviews WHERE product_id=?', (product_id,)).fetchone()
            own = db.execute('SELECT rating,body FROM reviews WHERE product_id=? AND user_id=?', (product_id, user['id'])).fetchone() if user else None
            return {'items': rows, 'count': average['count'], 'average': average['average'], 'can_review': bool(user and self.eligible(db, user['id'], product_id)), 'own_review': dict(own) if own else None}

    def ratings(self):
        with self.connection() as db:
            return {r['product_id']: {'count': r['count'], 'average': r['average']} for r in db.execute('SELECT product_id,COUNT(*) AS count,AVG(rating) AS average FROM reviews GROUP BY product_id')}

    def review(self, user, payload):
        product_id = text(payload.get('product_id'), 'Mahsulot', 1, 30)
        rating = integer(payload.get('rating'), 1, 5, 'Yulduzlar soni')
        body = text(payload.get('body'), 'Sharh', 5, 2000)
        with self.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            if not self.eligible(db, user['id'], product_id):
                raise StoreError('Faqat shu mahsulotni xarid qilib, qabul qilgan mijoz baho va sharh qoldirishi mumkin.', 403)
            created = now_ms()
            db.execute('''INSERT INTO reviews(user_id,product_id,rating,body,created,updated) VALUES(?,?,?,?,?,?)
                ON CONFLICT(user_id,product_id) DO UPDATE SET rating=excluded.rating,body=excluded.body,updated=excluded.updated''',
                (user['id'], product_id, rating, body, created, created))
        return self.review_data(product_id, user)
