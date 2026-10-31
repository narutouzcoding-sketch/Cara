"""Run: python server.py. Owner role: python server.py admin USERNAME."""
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
import argparse
import hashlib
import hmac
import json
import mimetypes
import os
import re
import socket
import threading
import time
from datetime import datetime, timezone

from backend.store import Store, StoreError
from backend.payments import Payments
from backend.locations import Locations
from backend.profile_excel import export_workbook, MIME as EXCEL_MIME
from backend.maintenance import backup_database, export_catalog

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get('LOCALAPPDATA', str(Path.home() / '.local/share'))) / 'CaraStore' / hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]
ENV_FILE = Path(os.environ.get('CARA_ENV_FILE', str(DATA_DIR / '.env')))


class CaraHTTPServer(ThreadingHTTPServer):
    # Windows can otherwise accept multiple listeners using SO_REUSEADDR,
    # leaving requests handled by an old copy of the application.
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def load_env():
    env = dict(os.environ)
    path = ENV_FILE
    if path.exists():
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                env.setdefault(key.strip(), value.strip().strip('"\''))
    return env


def build_server(host='127.0.0.1', port=5502, database=None, env=None):
    env = load_env() if env is None else env
    store = Store(ROOT, database or env.get('CARA_DATABASE', str(DATA_DIR / 'cara.sqlite3')))
    payments = Payments(store, env)
    locations = Locations(env)
    cookie_name = env.get('CARA_COOKIE_NAME', 'cara_session')
    if not re.fullmatch(r'[A-Za-z0-9_]{3,50}', cookie_name):
        raise ValueError('Invalid session cookie name')
    allowed = {f'http://{hostname}:{number}' for hostname in ('localhost', '127.0.0.1') for number in (port, 5500, 5501)}
    allowed.update(value.strip().rstrip('/') for value in env.get('CARA_ALLOWED_ORIGINS', '').split(',') if value.strip())
    if env.get('CARA_PUBLIC_URL'):
        public = urlsplit(env['CARA_PUBLIC_URL'])
        allowed.add(f'{public.scheme}://{public.netloc}')
    attempts, lock = {}, threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        server_version = 'Cara'

        def log_message(self, fmt, *args):
            # URLs may contain customer data. Keep access logs out of stdout.
            return

        def headers_common(self):
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
            self.send_header('X-Frame-Options', 'SAMEORIGIN')
            self.send_header('Cache-Control', 'no-store')
            origin = self.headers.get('Origin')
            if origin in allowed:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Access-Control-Allow-Credentials', 'true')
                self.send_header('Vary', 'Origin')

        def respond(self, value, status=200, cookie=None):
            payload = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(status)
            self.headers_common()
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            if cookie:
                self.send_header('Set-Cookie', cookie)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(payload)

        def cookie(self, token, clear=False):
            secure = '; Secure' if env.get('CARA_COOKIE_SECURE') == '1' else ''
            return f'{cookie_name}={token}; Path=/api; HttpOnly; SameSite=Strict; Max-Age={0 if clear else 604800}{secure}'

        def user(self, required=True, mutation=False):
            try:
                cookies = SimpleCookie(self.headers.get('Cookie', ''))
                token = cookies[cookie_name].value if cookie_name in cookies else ''
            except Exception:
                token = ''
            user = store.session(token)
            if required and not user:
                raise StoreError('Avval hisobingizga kiring.', 401)
            if mutation and user and not hmac.compare_digest(user['csrf'].encode(), self.headers.get('X-CSRF-Token', '').encode()):
                raise StoreError('Xavfsizlik belgisi eskirgan. Sahifani yangilang.', 403)
            self.session_token = token
            return user

        def body(self, json_body=True, maximum=16_384):
            try:
                length = int(self.headers.get('Content-Length', '0'))
            except ValueError:
                raise StoreError('So‘rov hajmi noto‘g‘ri.')
            if not 0 < length <= maximum:
                raise StoreError('So‘rov hajmi chegaradan oshdi.', 413)
            if self.headers.get('Transfer-Encoding'):
                raise StoreError('So‘rov shakli qo‘llanmaydi.')
            content_type = self.headers.get('Content-Type', '').split(';')[0].strip()
            if json_body and content_type not in ('application/json', 'text/json'):
                raise StoreError('JSON so‘rov yuboring.', 415)
            if not json_body and content_type != 'application/x-www-form-urlencoded':
                raise StoreError('So‘rov turi noto‘g‘ri.', 415)
            try:
                raw = self.rfile.read(length).decode('utf-8')
                if json_body:
                    value = json.loads(raw, parse_constant=lambda value: (_ for _ in ()).throw(ValueError(value)))
                    if not isinstance(value, dict):
                        raise ValueError()
                    return value
                fields = parse_qs(raw, keep_blank_values=True, max_num_fields=30)
                if any(len(values) != 1 for values in fields.values()):
                    raise ValueError()
                return {key: values[0] for key, values in fields.items()}
            except (UnicodeError, ValueError, RecursionError):
                raise StoreError('So‘rov shakli noto‘g‘ri.')

        def rate_limit(self, name, limit, seconds):
            key = (self.client_address[0], name)
            with lock:
                current = time.monotonic()
                values = [stamp for stamp in attempts.get(key, []) if stamp > current - seconds]
                if len(values) >= limit:
                    raise StoreError('Juda ko‘p so‘rov yuborildi. Birozdan keyin urinib ko‘ring.', 429)
                attempts[key] = values + [current]

        def do_OPTIONS(self):
            if self.headers.get('Origin') not in allowed:
                return self.respond({'error': 'Origin ruxsat etilmagan.'}, 403)
            self.send_response(204)
            self.headers_common()
            self.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token,Idempotency-Key')
            self.end_headers()

        def do_GET(self):
            try:
                path = urlsplit(self.path).path
                query = parse_qs(urlsplit(self.path).query)
                if path == '/api/health':
                    return self.respond({'ok': True, 'currency': 'UZS', 'version': 'profile-ux-2'})
                if path == '/api/config':
                    return self.respond({'payment_methods': payments.methods(), 'prices_are_samples': store.catalog()['store'].get('pricesAreSamples', True)})
                if path == '/api/me':
                    user = self.user(False)
                    return self.respond({'user': {key: user[key] for key in ('id', 'username', 'email', 'role')} if user else None, 'csrf': user['csrf'] if user else None})
                if path == '/api/orders':
                    user = self.user()
                    return self.respond({'orders': store.list_orders(user, query.get('admin') == ['1'])})
                if path == '/api/profile':
                    return self.respond(store.profile(self.user()))
                if path == '/api/profile/avatar':
                    image = store.avatar(self.user())
                    self.send_response(200)
                    self.headers_common()
                    self.send_header('Content-Type', 'image/png')
                    self.send_header('Content-Length', str(len(image)))
                    self.end_headers()
                    if self.command != 'HEAD':
                        self.wfile.write(image)
                    return
                if path == '/api/profile/export':
                    data = store.export_profile(self.user())
                    catalog = {p['id']:p['name'] for p in store.catalog()['products']}
                    for review in data['reviews']:
                        review['product_name']=catalog.get(review['product_id'],review['product_id'])
                    workbook = export_workbook(data)
                    self.send_response(200)
                    self.headers_common()
                    self.send_header('Content-Type',EXCEL_MIME)
                    self.send_header('Content-Disposition','attachment; filename="cara-profil.xlsx"')
                    self.send_header('Content-Length',str(len(workbook)))
                    self.end_headers()
                    if self.command != 'HEAD':
                        self.wfile.write(workbook)
                    return
                if re.fullmatch(r'/api/orders/CARA-[A-F0-9]{12}', path):
                    return self.respond({'order': store.get_order(self.user(), path.rsplit('/', 1)[1])})
                if path == '/api/ratings':
                    return self.respond({'ratings': store.ratings()})
                if path == '/api/reviews':
                    return self.respond(store.review_data(query.get('product', [''])[0], self.user(False)))
                if path.startswith('/api/'):
                    raise StoreError('Manzil topilmadi.', 404)
                relative = unquote(path).lstrip('/') or 'index.html'
                if '\\' in relative or '\x00' in relative:
                    raise StoreError('Manzil noto‘g‘ri.', 404)
                file = (ROOT / relative).resolve()
                if not file.is_relative_to(ROOT) or not file.is_file():
                    raise StoreError('Fayl topilmadi.', 404)
                parts = Path(relative).parts
                permitted = (len(parts) == 1 and file.suffix in ('.html', '.css', '.js')) or (parts[0] in ('img', 'assets') and file.suffix.lower() in ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.css', '.js', '.woff2', '.woff', '.ttf', '.mp4'))
                if not permitted or any(part.startswith('.') for part in parts):
                    raise StoreError('Fayl yopiq.', 404)
                payload = file.read_bytes()
                mime = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
                self.send_response(200)
                self.headers_common()
                self.send_header('Content-Type', mime + ('; charset=utf-8' if file.suffix in ('.html', '.css', '.js') else ''))
                self.send_header('Content-Length', str(len(payload)))
                self.end_headers()
                if self.command != 'HEAD':
                    self.wfile.write(payload)
            except StoreError as error:
                self.respond({'error': error.message}, error.status)
            except Exception:
                self.respond({'error': 'Serverda xatolik yuz berdi.'}, 500)

        def do_POST(self):
            self.mutate()

        def do_HEAD(self):
            self.do_GET()

        def do_PATCH(self):
            self.mutate()

        def mutate(self):
            try:
                path = urlsplit(self.path).path
                if self.command == 'POST' and path == '/api/payments/payme':
                    try:
                        request = self.body()
                    except StoreError:
                        return self.respond(payments.rpc_error(None, -32700, 'JSON so‘rov noto‘g‘ri.'))
                    return self.respond(payments.payme(request, self.headers.get('Authorization')))
                if self.command == 'POST' and path in ('/api/payments/click/prepare', '/api/payments/click/complete'):
                    return self.respond(payments.click(self.body(False), 0 if path.endswith('prepare') else 1))
                # Read the bounded request body before rejecting its origin. Closing
                # a socket with unread request bytes can reset the response on Windows.
                payload = self.body(maximum=750_000 if path == '/api/profile/avatar' else 16_384)
                if self.headers.get('Origin') not in allowed:
                    raise StoreError('Bu manzildan yozish ruxsat etilmagan.', 403)
                if self.command == 'POST' and path in ('/api/register', '/api/login'):
                    self.rate_limit('auth', 20, 900)
                    user = store.register(payload.get('username'), payload.get('email'), payload.get('password')) if path.endswith('register') else store.login(payload.get('username'), payload.get('password'))
                    # Rotate an existing session instead of retaining a fixed login token.
                    self.user(False)
                    if self.session_token:
                        store.logout(self.session_token)
                    token, csrf = store.new_session(user['id'])
                    return self.respond({'user': user, 'csrf': csrf}, 201 if path.endswith('register') else 200, self.cookie(token))
                user = self.user(mutation=True)
                if self.command == 'POST' and path == '/api/profile/location':
                    self.rate_limit('location',60,60)
                    return self.respond(locations.lookup(payload))
                if self.command == 'POST' and path == '/api/profile/avatar':
                    self.rate_limit('avatar', 30, 900)
                    if payload.get('remove') is True:
                        store.remove_avatar(user)
                        return self.respond({'avatar_version': None})
                    return self.respond(store.save_avatar(user, payload.get('image')))
                if self.command == 'PATCH' and path == '/api/profile':
                    self.rate_limit('profile', 30, 900)
                    return self.respond(store.update_profile(user, payload))
                if self.command == 'POST' and path == '/api/profile/password':
                    self.rate_limit('password', 10, 900)
                    store.change_password(user, payload, self.session_token)
                    return self.respond({'ok': True})
                if self.command == 'POST' and path == '/api/profile/sessions/revoke':
                    store.revoke_other_sessions(user, self.session_token)
                    return self.respond({'ok': True})
                if self.command == 'POST' and path == '/api/logout':
                    store.logout(self.session_token)
                    return self.respond({'ok': True}, cookie=self.cookie('', True))
                if self.command == 'POST' and path == '/api/orders':
                    self.rate_limit('orders', 30, 3600)
                    return self.respond({'order': store.create_order(user, payload, self.headers.get('Idempotency-Key'), payments.methods())}, 201)
                if self.command == 'PATCH' and re.fullmatch(r'/api/orders/CARA-[A-F0-9]{12}', path):
                    return self.respond({'order': store.update_order(user, path.rsplit('/', 1)[1], payload)})
                if self.command == 'POST' and path == '/api/reviews':
                    self.rate_limit('reviews', 20, 3600)
                    return self.respond(store.review(user, payload))
                if self.command == 'POST' and path == '/api/payment-link':
                    return self.respond(payments.checkout(user, payload.get('order_id')))
                raise StoreError('Manzil topilmadi.', 404)
            except StoreError as error:
                self.respond({'error': error.message}, error.status)
            except Exception:
                self.respond({'error': 'Serverda xatolik yuz berdi.'}, 500)

    server = CaraHTTPServer((host, port), Handler)
    allowed.update({f'http://localhost:{server.server_port}', f'http://127.0.0.1:{server.server_port}'})
    server.store, server.payments = store, payments
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Cara buyurtma va sharh serveri')
    parser.add_argument('command', nargs='?', choices=['serve', 'admin', 'config', 'backup', 'catalog'], default='serve')
    parser.add_argument('username', nargs='?')
    parser.add_argument('--port', type=int, default=5502)
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--database')
    parser.add_argument('--output', help='Zaxira yoki katalog uchun yangi fayl manzili')
    args = parser.parse_args()
    if args.command == 'config':
        ENV_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not ENV_FILE.exists():
            ENV_FILE.write_text((ROOT / '.env.example').read_text(encoding='utf-8'), encoding='utf-8')
        print('Server sozlamalari:', ENV_FILE)
        print('Ma’lumotlar bazasi:', DATA_DIR / 'cara.sqlite3')
    elif args.command in ('backup', 'catalog'):
        settings = load_env()
        try:
            stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            if args.command == 'backup':
                database = args.database or settings.get('CARA_DATABASE', DATA_DIR / 'cara.sqlite3')
                output = args.output or DATA_DIR / 'backups' / f'cara-{stamp}.sqlite3'
                print('Zaxira nusxasi:', backup_database(database, output, ROOT))
            else:
                output = args.output or DATA_DIR / 'exports' / f'catalog-{stamp}.json'
                print('Ochiq katalog eksporti:', export_catalog(ROOT, output))
        except (StoreError, OSError, ValueError) as error:
            parser.exit(1, f'Xatolik: {error}\n')
    elif args.command == 'admin':
        if not args.username:
            parser.error('Admin qilinadigan foydalanuvchi nomini kiriting.')
        settings = load_env()
        Store(ROOT, args.database or settings.get('CARA_DATABASE', DATA_DIR / 'cara.sqlite3')).promote_admin(args.username)
        print('Sotuvchi huquqi berildi:', args.username)
    else:
        app = build_server(args.host, args.port, args.database)
        print(f'Cara server: http://localhost:{app.server_port}', flush=True)
        try:
            app.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            app.server_close()
