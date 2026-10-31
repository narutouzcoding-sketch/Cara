from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
import base64
import hashlib
import http.client
import json
import unittest

from backend.store import Store, StoreError, now_ms
from backend.payments import Payments
from server import ROOT, build_server


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.store = Store(ROOT, Path(self.temp.name) / 'test.sqlite3')
        self.buyer = self.store.register('buyer', 'buyer@example.test', 'test-password-123')
        self.other = self.store.register('other', 'other@example.test', 'test-password-123')
        self.store.promote_admin('other')
        self.admin = self.store.login('other', 'test-password-123')
        self.env = dict(CARA_PUBLIC_URL='https://shop.example.test', CARA_ONLINE_PAYMENTS_ENABLED='1',
                        CLICK_MERCHANT_ID='123', CLICK_SERVICE_ID='456', CLICK_SECRET_KEY='test-click-key',
                        PAYME_MERCHANT_ID='test-merchant', PAYME_KEY='test-payme-key')
        self.payments = Payments(self.store, self.env)

    def tearDown(self):
        self.temp.cleanup()

    def payload(self, method='cash', **extra):
        return dict(recipient='Test Customer', phone='+998901234567', city='Termiz', address='',
                    delivery_method='pickup', notes='', payment_method=method,
                    items=[dict(id='f2', size='L', quantity=2)], **extra)

    def order(self, method='cash', confirmed=False, key='request-key-123'):
        order = self.store.create_order(self.buyer, self.payload(method), key, self.payments.methods())
        if confirmed:
            order = self.store.update_order(self.admin, order['id'], dict(status='confirmed', approve_prices=True, shipping_fee=0))
        return order

    def delivered(self, order):
        if order['status'] == 'pending':
            self.store.update_order(self.admin, order['id'], dict(status='confirmed', approve_prices=True, shipping_fee=0))
        return self.store.update_order(self.admin, order['id'], dict(status='delivered', cash_received=True))

    def rpc(self, method, params, auth=True):
        authorization = 'Basic ' + base64.b64encode(b'Paycom:test-payme-key').decode() if auth else 'Basic invalid'
        return self.payments.payme(dict(id=1, method=method, params=params), authorization)

    def click(self, order, action, tx='12345', **extra):
        payload = dict(click_trans_id=tx, service_id='456', merchant_trans_id=order['id'],
                       amount=str(order['total']), action=str(action), error='0', error_note='',
                       sign_time='2026-10-26 12:00:00', click_paydoc_id='789', **extra)
        source = tx + payload['service_id'] + 'test-click-key' + order['id']
        if action == 1:
            source += payload['merchant_prepare_id']
        payload['sign_string'] = hashlib.md5((source + payload['amount'] + str(action) + payload['sign_time']).encode()).hexdigest()
        return payload

    def test_passwords_are_hashed_and_login_rejects_wrong_password(self):
        with self.store.connection() as db:
            value = db.execute('SELECT password_hash FROM users WHERE id=?', (self.buyer['id'],)).fetchone()[0]
        self.assertNotIn('test-password-123', value)
        self.assertTrue(value.startswith('pbkdf2_sha256$'))
        with self.assertRaises(StoreError):
            self.store.login('buyer', 'wrong-password')

    def test_session_tokens_are_hashed_and_logout_revokes_them(self):
        token, csrf = self.store.new_session(self.buyer['id'])
        self.assertEqual(self.store.session(token)['csrf'], csrf)
        with self.store.connection() as db:
            self.assertNotEqual(db.execute('SELECT token_hash FROM sessions').fetchone()[0], token)
        self.store.logout(token)
        self.assertIsNone(self.store.session(token))

    def test_server_ignores_client_price_status_and_owner(self):
        payload = self.payload()
        payload.update(total=1, status='delivered', payment_status='paid', user_id=self.admin['id'])
        payload['items'][0]['unit_price'] = 1
        order = self.store.create_order(self.buyer, payload, 'forged-price-key', self.payments.methods())
        self.assertEqual(order['total'], 338000)
        self.assertEqual(order['currency'], 'UZS')
        self.assertEqual(order['status'], 'pending')
        self.assertEqual(order['payment_status'], 'unpaid')
        self.assertEqual(order['user_id'], self.buyer['id'])

    def test_duplicate_submission_creates_only_one_order(self):
        payload = self.payload()
        def create(_):
            return self.store.create_order(self.buyer, payload, 'same-request-key', self.payments.methods())['id']
        with ThreadPoolExecutor(max_workers=4) as pool:
            ids = list(pool.map(create, range(4)))
        self.assertEqual(len(set(ids)), 1)
        self.assertEqual(len(self.store.list_orders(self.buyer)), 1)
        payload['notes'] = 'Different request'
        with self.assertRaises(StoreError):
            self.store.create_order(self.buyer, payload, 'same-request-key', self.payments.methods())

    def test_customer_cannot_mark_order_delivered_or_confirm_payment(self):
        order = self.order()
        with self.assertRaises(StoreError) as caught:
            self.store.update_order(self.buyer, order['id'], dict(status='delivered', cash_received=True))
        self.assertEqual(caught.exception.status, 403)

    def test_admin_must_confirm_price_and_actual_cash_receipt(self):
        payload = self.payload()
        payload.update(delivery_method='courier', address='Test ko‘chasi 12-uy')
        order = self.store.create_order(self.buyer, payload, 'courier-price-key', self.payments.methods())
        with self.assertRaises(StoreError):
            self.store.update_order(self.admin, order['id'], dict(status='confirmed'))
        self.store.update_order(self.admin, order['id'], dict(status='confirmed', approve_prices=True, shipping_fee=12000))
        with self.assertRaises(StoreError):
            self.store.update_order(self.admin, order['id'], dict(status='delivered'))
        delivered = self.delivered(self.store.get_order(self.buyer, order['id']))
        self.assertEqual(delivered['total'], 350000)
        self.assertEqual(delivered['payment_status'], 'paid')

    def test_pickup_cannot_silently_gain_a_delivery_fee(self):
        order = self.order()
        with self.assertRaises(StoreError):
            self.store.update_order(self.admin, order['id'], dict(status='confirmed', approve_prices=True, shipping_fee=12000))

    def test_pending_order_or_forged_verified_flag_cannot_review(self):
        self.order()
        for extras in ({}, {'verified': True, 'status': 'delivered', 'user_id': self.admin['id']}):
            with self.assertRaises(StoreError) as caught:
                self.store.review(self.buyer, dict(product_id='f2', rating=5, body='A good product', **extras))
            self.assertEqual(caught.exception.status, 403)

    def test_only_delivered_product_owner_can_review(self):
        order = self.delivered(self.order())
        self.assertEqual(order['status'], 'delivered')
        with self.assertRaises(StoreError):
            self.store.review(self.admin, dict(product_id='f2', rating=5, body='Not the buyer'))
        with self.assertRaises(StoreError):
            self.store.review(self.buyer, dict(product_id='f1', rating=5, body='Different product'))
        result = self.store.review(self.buyer, dict(product_id='f2', rating=4, body='Mahsulot menga mos keldi.'))
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['average'], 4)
        self.assertTrue(result['can_review'])

    def test_rating_validation_and_single_review_updates(self):
        self.delivered(self.order())
        for rating in (True, 0, 6, 1.5, '5'):
            with self.assertRaises(StoreError):
                self.store.review(self.buyer, dict(product_id='f2', rating=rating, body='Mahsulot yaxshi.'))
        self.store.review(self.buyer, dict(product_id='f2', rating=3, body='Birinchi taassurot.'))
        result = self.store.review(self.buyer, dict(product_id='f2', rating=5, body='Yangilangan taassurot.'))
        self.assertEqual(result['count'], 1)
        self.assertEqual(self.store.ratings()['f2']['average'], 5)

    def test_cancelled_orders_do_not_unlock_reviews(self):
        order = self.order()
        self.store.update_order(self.admin, order['id'], dict(status='cancelled'))
        self.assertFalse(self.store.review_data('f2', self.buyer)['can_review'])

    def test_order_privacy(self):
        order = self.order()
        other = self.store.register('stranger', 'stranger@example.test', 'test-password-123')
        self.assertEqual(self.store.list_orders(other), [])
        with self.assertRaises(StoreError) as caught:
            self.store.get_order(other, order['id'])
        self.assertEqual(caught.exception.status, 404)

    def test_unconfigured_online_methods_are_disabled(self):
        payments = Payments(self.store, {})
        self.assertEqual(payments.methods(), dict(cash=True, click=False, payme=False))
        with self.assertRaises(StoreError):
            self.store.create_order(self.buyer, self.payload('click'), 'disabled-method', payments.methods())

    def test_online_payment_waits_for_merchant_price_confirmation(self):
        order = self.order('click')
        with self.assertRaises(StoreError):
            self.payments.checkout(self.buyer, order['id'])
        order = self.store.update_order(self.admin, order['id'], dict(status='confirmed', approve_prices=True, shipping_fee=0))
        link = self.payments.checkout(self.buyer, order['id'])['url']
        self.assertIn('https://my.click.uz/services/pay?', link)
        self.assertIn('amount=338000', link)

    def test_payme_link_uses_tiyin(self):
        order = self.order('payme', True)
        link = self.payments.checkout(self.buyer, order['id'])['url']
        params = base64.b64decode(link.removeprefix('https://checkout.paycom.uz/')).decode()
        self.assertIn('a=33800000', params)
        self.assertIn('ac.order_id=' + order['id'], params)

    def test_payme_auth_amount_idempotency_and_delivery_gate(self):
        order = self.order('payme', True)
        params = dict(id='payme-test-1', time=now_ms(), amount=order['total'] * 100, account={'order_id': order['id']})
        self.assertEqual(self.rpc('CreateTransaction', params, False)['error']['code'], -32504)
        self.assertEqual(self.rpc('CreateTransaction', params | {'amount': 1})['error']['code'], -31001)
        first = self.rpc('CreateTransaction', params)['result']
        self.assertEqual(self.rpc('CreateTransaction', params)['result'], first)
        paid = self.rpc('PerformTransaction', {'id': params['id']})
        self.assertEqual(paid['result']['state'], 2)
        self.assertEqual(self.rpc('PerformTransaction', {'id': params['id']})['result'], paid['result'])
        self.assertFalse(self.store.review_data('f2', self.buyer)['can_review'])
        self.delivered(order)
        self.assertTrue(self.store.review_data('f2', self.buyer)['can_review'])
        self.assertEqual(self.rpc('CancelTransaction', {'id': params['id'], 'reason': 1})['error']['code'], -31007)

    def test_payme_expired_and_cancelled_transactions_never_become_paid(self):
        order = self.order('payme', True)
        params = dict(id='payme-expired', time=now_ms() - Payments.TIMEOUT - 1, amount=order['total'] * 100, account={'order_id': order['id']})
        self.assertIn('error', self.rpc('CreateTransaction', params))
        params.update(id='payme-cancelled', time=now_ms())
        self.rpc('CreateTransaction', params)
        self.assertEqual(self.rpc('CancelTransaction', {'id': params['id'], 'reason': 1})['result']['state'], -1)
        self.assertIn('error', self.rpc('PerformTransaction', {'id': params['id']}))
        self.assertEqual(self.store.get_order(self.buyer, order['id'])['payment_status'], 'unpaid')

    def test_click_signature_amount_prepare_id_and_replay(self):
        order = self.order('click', True)
        prepare = self.click(order, 0)
        forged = prepare | {'sign_string': '0' * 32}
        self.assertEqual(self.payments.click(forged, 0)['error'], -1)
        prepared = self.payments.click(prepare, 0)
        self.assertEqual(prepared['error'], 0)
        self.assertEqual(self.payments.click(prepare, 0)['merchant_prepare_id'], prepared['merchant_prepare_id'])
        wrong = self.click(order, 1, merchant_prepare_id='9999')
        self.assertEqual(self.payments.click(wrong, 1)['error'], -6)
        complete = self.click(order, 1, merchant_prepare_id=str(prepared['merchant_prepare_id']))
        self.assertEqual(self.payments.click(complete, 1)['error'], 0)
        self.assertEqual(self.payments.click(complete, 1)['error'], -4)
        with self.store.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_events WHERE event='click_paid'").fetchone()[0], 1)
        self.assertFalse(self.store.review_data('f2', self.buyer)['can_review'])

    def test_click_failed_completion_does_not_mark_paid(self):
        order = self.order('click', True)
        prepared = self.payments.click(self.click(order, 0), 0)
        payload = self.click(order, 1, merchant_prepare_id=str(prepared['merchant_prepare_id']))
        payload['error'] = '-1'
        self.assertEqual(self.payments.click(payload, 1)['error'], -9)
        self.assertEqual(self.store.get_order(self.buyer, order['id'])['payment_status'], 'unpaid')


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.server = build_server(port=0, database=Path(self.temp.name) / 'http.sqlite3', env={})
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cookie, self.csrf = '', ''

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, method, path, payload=None, origin='http://localhost:5501', csrf=True):
        headers = {'Origin': origin}
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        if self.cookie:
            headers['Cookie'] = self.cookie
        if csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        headers['Idempotency-Key'] = 'http-order-key'
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        conn.request(method, path, json.dumps(payload) if payload is not None else None, headers)
        response = conn.getresponse()
        body = response.read()
        result = json.loads(body) if body and 'application/json' in response.headers.get('Content-Type', '') else body
        status, returned_headers = response.status, dict(response.getheaders())
        conn.close()
        return status, result, returned_headers

    def register(self, origin='http://localhost:5501'):
        code, result, headers = self.request('POST', '/api/register', {'username': 'httpbuyer', 'email': 'http@example.test', 'password': 'test-password-123', 'role': 'admin'}, origin=origin)
        self.assertEqual(code, 201)
        self.assertEqual(result['user']['role'], 'customer')
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.csrf = result['csrf']
        return headers

    def test_guest_cannot_order_or_review(self):
        self.assertEqual(self.request('POST', '/api/orders', {})[0], 401)
        self.assertEqual(self.request('POST', '/api/reviews', {})[0], 401)

    def test_live_server_checkout_saves_order_and_returns_it_with_session(self):
        origin = 'http://127.0.0.1:5501'
        self.assertEqual(self.register(origin)['Access-Control-Allow-Origin'], origin)
        self.assertEqual(self.request('GET', '/api/me', origin=origin)[1]['user']['username'], 'httpbuyer')
        self.assertTrue(self.request('GET', '/api/config', origin=origin)[1]['payment_methods']['cash'])
        payload = dict(recipient='Test Customer', phone='+998901234567', city='Termiz', address='',
                       delivery_method='pickup', notes='', payment_method='cash',
                       items=[dict(id='f2', size='L', quantity=2)])
        code, result, headers = self.request('POST', '/api/orders', payload, origin=origin)
        self.assertEqual(code, 201)
        self.assertEqual(headers['Access-Control-Allow-Origin'], origin)
        self.assertEqual(result['order']['total'], 338000)
        self.assertEqual(result['order']['status'], 'pending')
        code, orders, _ = self.request('GET', '/api/orders', origin=origin)
        self.assertEqual(code, 200)
        self.assertEqual([order['id'] for order in orders['orders']], [result['order']['id']])

    def test_cookies_cors_and_csrf(self):
        headers = self.register()
        self.assertIn('HttpOnly', headers['Set-Cookie'])
        self.assertIn('SameSite=Strict', headers['Set-Cookie'])
        self.assertEqual(headers['Access-Control-Allow-Origin'], 'http://localhost:5501')
        self.assertEqual(self.request('POST', '/api/orders', {}, csrf=False)[0], 403)
        self.assertEqual(self.request('POST', '/api/orders', {}, origin='https://evil.example')[0], 403)

    def test_live_server_5500_register_login_profile_and_logout(self):
        origin = 'http://127.0.0.1:5500'
        headers = self.register(origin)
        self.assertEqual(headers['Access-Control-Allow-Origin'], origin)
        self.assertEqual(self.request('GET', '/api/profile', origin=origin)[0], 200)
        self.assertEqual(self.request('POST', '/api/logout', {}, origin=origin)[0], 200)
        self.assertEqual(self.request('GET', '/api/profile', origin=origin)[0], 401)
        code, result, headers = self.request('POST', '/api/login', {'username':'http@example.test','password':'test-password-123'}, origin=origin)
        self.assertEqual(code, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], origin)
        self.assertEqual(result['user']['username'], 'httpbuyer')

    def test_direct_review_and_delivery_forgery_are_rejected(self):
        self.register()
        code, _, _ = self.request('POST', '/api/reviews', {'product_id': 'f2', 'rating': 5, 'body': 'Forged purchase', 'verified': True})
        self.assertEqual(code, 403)
        code, _, _ = self.request('PATCH', '/api/orders/CARA-AAAAAAAAAAAA', {'status': 'delivered', 'cash_received': True})
        self.assertEqual(code, 403)

    def test_session_survives_page_requests_and_logout_revokes_it(self):
        self.register()
        self.assertEqual(self.request('GET', '/api/me')[1]['user']['username'], 'httpbuyer')
        self.assertEqual(self.request('POST', '/api/logout', {})[0], 200)
        self.assertIsNone(self.request('GET', '/api/me')[1]['user'])

    def test_private_files_are_not_served_and_public_settings_have_no_keys(self):
        for path in ('/.env', '/.env.example', '/server.py', '/backend/store.py', '/.data/cara.sqlite3', '/../server.py'):
            self.assertEqual(self.request('GET', path)[0], 404, path)
        code, config, _ = self.request('GET', '/api/config')
        self.assertEqual(code, 200)
        self.assertEqual(config['payment_methods'], {'cash': True, 'click': False, 'payme': False})
        self.assertNotIn('KEY', json.dumps(config))

    def test_payme_parse_errors_keep_json_rpc_http_200(self):
        code, body, _ = self.request('POST', '/api/payments/payme', ['not-an-rpc-object'])
        self.assertEqual(code, 200)
        self.assertEqual(body['error']['code'], -32700)

    def test_malformed_order_fields_are_client_errors_and_do_not_write_orders(self):
        self.register()
        payload = dict(recipient='Test Customer', phone='+998901234567', city='Termiz', address='',
                       delivery_method='pickup', payment_method='cash', items=[dict(id='f2', size='L', quantity=1)])
        invalid = [dict(payment_method=[]), dict(payment_method={}),
                   dict(items=[dict(id=[], size='L', quantity=1)]),
                   dict(items=[dict(id={}, size='L', quantity=1)]),
                   dict(items=[dict(id='f2', size=[], quantity=1)]),
                   dict(items=[dict(id='f2', size='L', quantity=True)])]
        for fields in invalid:
            with self.subTest(fields=fields):
                self.assertEqual(self.request('POST', '/api/orders', {**payload, **fields})[0], 400)
        for order_id in ([], {}, None, 'wrong-id'):
            with self.subTest(order_id=order_id):
                self.assertEqual(self.request('POST', '/api/payment-link', dict(order_id=order_id))[0], 400)
        self.assertEqual(self.request('GET', '/api/orders')[1]['orders'], [])

    def test_actual_bound_port_is_an_allowed_same_origin_and_head_has_no_body(self):
        origin = f'http://localhost:{self.server.server_port}'
        self.register(origin)
        for path in ('/', '/api/me', '/server.py'):
            get_code, _, get_headers = self.request('GET', path, origin=origin)
            head_code, body, headers = self.request('HEAD', path, origin=origin)
            self.assertEqual(head_code, get_code)
            self.assertEqual(headers['Content-Type'], get_headers['Content-Type'])
            self.assertEqual(headers['Content-Length'], get_headers['Content-Length'])
            self.assertEqual(body, b'')


if __name__ == '__main__':
    unittest.main()
