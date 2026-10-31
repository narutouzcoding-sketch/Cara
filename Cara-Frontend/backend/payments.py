"""Click Shop API and Payme Merchant API adapters; disabled without credentials."""
from decimal import Decimal, InvalidOperation
from urllib.parse import urlencode, urlsplit
import base64
import hashlib
import hmac
import re
import sqlite3

from .store import StoreError, now_ms


class GatewayError(Exception):
    def __init__(self, code, message, data=None):
        self.code, self.message, self.data = code, message, data


class Payments:
    TIMEOUT = 43_200_000

    def __init__(self, store, env):
        self.store, self.env = store, env
        self.base = env.get('CARA_PUBLIC_URL', 'http://localhost:5502').rstrip('/')

    def methods(self):
        public = urlsplit(self.base)
        enabled = self.env.get('CARA_ONLINE_PAYMENTS_ENABLED') == '1' and public.scheme == 'https' and bool(public.netloc) and not public.username
        return {
            'cash': True,
            'click': bool(enabled and all(self.env.get(k) for k in ('CLICK_MERCHANT_ID', 'CLICK_SERVICE_ID', 'CLICK_SECRET_KEY'))),
            'payme': bool(enabled and all(self.env.get(k) for k in ('PAYME_MERCHANT_ID', 'PAYME_KEY')))
        }

    @staticmethod
    def payable(order, provider):
        return bool(order and order['payment_method'] == provider and order['pricing_confirmed'] and order['status'] == 'confirmed' and order['payment_status'] == 'unpaid')

    def checkout(self, user, order_id):
        order = self.store.get_order(user, order_id)
        provider = order['payment_method']
        if not self.methods().get(provider) or provider == 'cash':
            raise StoreError('Bu onlayn to‘lov usuli ulanmagan.', 409)
        if not self.payable(order, provider):
            raise StoreError('Avval sotuvchi buyurtma va yakuniy summani tasdiqlashi kerak.', 409)
        return_url = self.base + '/orders.html?order=' + order_id
        if provider == 'click':
            url = 'https://my.click.uz/services/pay?' + urlencode({
                'service_id': self.env['CLICK_SERVICE_ID'], 'merchant_id': self.env['CLICK_MERCHANT_ID'],
                'amount': order['total'], 'transaction_param': order_id, 'return_url': return_url
            })
        else:
            parameters = f"m={self.env['PAYME_MERCHANT_ID']};ac.order_id={order_id};a={order['total'] * 100};l=uz;c={return_url}"
            url = 'https://checkout.paycom.uz/' + base64.b64encode(parameters.encode()).decode()
        return {'url': url, 'provider': provider, 'amount': order['total'], 'currency': 'UZS'}

    @staticmethod
    def rpc_error(request_id, code, message, data=None):
        error = {'code': code, 'message': {'uz': message, 'ru': message, 'en': message}}
        if data is not None:
            error['data'] = data
        return {'id': request_id, 'error': error}

    @staticmethod
    def tx_result(tx):
        return {key: tx[key] for key in ('create_time', 'perform_time', 'cancel_time', 'state', 'reason')} | {'transaction': str(tx['id'])}

    def payme(self, request, authorization):
        request_id = request.get('id') if isinstance(request, dict) else None
        expected = 'Basic ' + base64.b64encode(('Paycom:' + self.env.get('PAYME_KEY', '')).encode()).decode()
        if not self.methods()['payme'] or not hmac.compare_digest(authorization or '', expected):
            return self.rpc_error(request_id, -32504, 'Ruxsat etilmagan.')
        if not isinstance(request, dict) or not isinstance(request.get('params'), dict):
            return self.rpc_error(request_id, -32600, 'So‘rov noto‘g‘ri.')
        method, p = request.get('method'), request['params']
        try:
            with self.store.connection() as db:
                db.execute('BEGIN IMMEDIATE')
                if method == 'GetStatement':
                    start, end = p.get('from'), p.get('to')
                    if type(start) is not int or type(end) is not int or not 0 <= start <= end:
                        raise GatewayError(-32602, 'Vaqt noto‘g‘ri.')
                    transactions = []
                    for tx in db.execute("SELECT * FROM payments WHERE provider='payme' AND provider_time BETWEEN ? AND ? ORDER BY provider_time", (start, end)):
                        transactions.append(self.tx_result(tx) | {'id': tx['provider_id'], 'time': tx['provider_time'], 'amount': tx['amount'], 'account': {'order_id': tx['order_id']}})
                    return {'id': request_id, 'result': {'transactions': transactions}}
                if method in ('CheckPerformTransaction', 'CreateTransaction'):
                    account = p.get('account')
                    if not isinstance(account, dict) or not isinstance(account.get('order_id'), str):
                        raise GatewayError(-31050, 'Buyurtma topilmadi.', 'order_id')
                    order = db.execute('SELECT * FROM orders WHERE id=?', (account['order_id'],)).fetchone()
                    if not order or order['payment_method'] != 'payme':
                        raise GatewayError(-31050, 'Buyurtma topilmadi.', 'order_id')
                    if type(p.get('amount')) is not int or p['amount'] != order['total'] * 100:
                        raise GatewayError(-31001, 'Summa noto‘g‘ri.')
                    if method == 'CheckPerformTransaction':
                        if not self.payable(order, 'payme'):
                            raise GatewayError(-31008, 'Buyurtma to‘lovga tayyor emas.')
                        return {'id': request_id, 'result': {'allow': True}}
                    if not isinstance(p.get('id'), str) or not 1 <= len(p['id']) <= 128 or type(p.get('time')) is not int:
                        raise GatewayError(-32602, 'Tranzaksiya ma’lumoti noto‘g‘ri.')
                    tx = db.execute("SELECT * FROM payments WHERE provider='payme' AND provider_id=?", (p['id'],)).fetchone()
                    if tx:
                        if tx['order_id'] != order['id'] or tx['amount'] != p['amount']:
                            raise GatewayError(-31008, 'Tranzaksiya boshqa buyurtmaga tegishli.')
                        if tx['state'] != 1:
                            raise GatewayError(-31008, 'Tranzaksiya faol emas.')
                        if now_ms() - tx['provider_time'] >= self.TIMEOUT:
                            db.execute('UPDATE payments SET state=-1,reason=4,cancel_time=? WHERE id=?', (now_ms(), tx['id']))
                            return self.rpc_error(request_id, -31008, 'To‘lov vaqti tugagan.')
                        return {'id': request_id, 'result': self.tx_result(tx)}
                    if not self.payable(order, 'payme') or now_ms() - p['time'] >= self.TIMEOUT or p['time'] > now_ms() + 60_000:
                        raise GatewayError(-31008, 'To‘lov mumkin emas yoki vaqti tugagan.')
                    if db.execute('SELECT 1 FROM payments WHERE order_id=? AND state IN (1,2)', (order['id'],)).fetchone():
                        raise GatewayError(-31099, 'Boshqa faol tranzaksiya bor.', 'order_id')
                    row_id = db.execute("INSERT INTO payments(provider,provider_id,order_id,amount,provider_time,create_time) VALUES('payme',?,?,?,?,?)",
                                        (p['id'], order['id'], p['amount'], p['time'], now_ms())).lastrowid
                    tx = db.execute('SELECT * FROM payments WHERE id=?', (row_id,)).fetchone()
                    return {'id': request_id, 'result': self.tx_result(tx)}
                if method not in ('PerformTransaction', 'CancelTransaction', 'CheckTransaction'):
                    raise GatewayError(-32601, 'Metod topilmadi.')
                if not isinstance(p.get('id'), str):
                    raise GatewayError(-32602, 'Tranzaksiya identifikatori noto‘g‘ri.')
                tx = db.execute("SELECT * FROM payments WHERE provider='payme' AND provider_id=?", (p['id'],)).fetchone()
                if not tx:
                    raise GatewayError(-31003, 'Tranzaksiya topilmadi.')
                order = db.execute('SELECT * FROM orders WHERE id=?', (tx['order_id'],)).fetchone()
                if method == 'CheckTransaction':
                    return {'id': request_id, 'result': self.tx_result(tx)}
                if method == 'PerformTransaction':
                    if tx['state'] == 2:
                        return {'id': request_id, 'result': self.tx_result(tx)}
                    if tx['state'] != 1 or not self.payable(order, 'payme'):
                        raise GatewayError(-31008, 'Tranzaksiya bajarilmaydi.')
                    if now_ms() - tx['provider_time'] >= self.TIMEOUT:
                        db.execute('UPDATE payments SET state=-1,reason=4,cancel_time=? WHERE id=?', (now_ms(), tx['id']))
                        return self.rpc_error(request_id, -31008, 'To‘lov vaqti tugagan.')
                    db.execute('UPDATE payments SET state=2,perform_time=? WHERE id=?', (now_ms(), tx['id']))
                    db.execute("UPDATE orders SET payment_status='paid',updated=? WHERE id=?", (now_ms(), tx['order_id']))
                    db.execute("INSERT INTO audit_events(event,order_id,created) VALUES('payme_paid',?,?)", (tx['order_id'], now_ms()))
                else:
                    reason = p.get('reason')
                    if type(reason) is not int or not 1 <= reason <= 10:
                        raise GatewayError(-32602, 'Bekor qilish sababi noto‘g‘ri.')
                    if order['status'] == 'delivered':
                        raise GatewayError(-31007, 'Mahsulot yetkazilgan; avtomatik bekor qilinmaydi.')
                    if tx['state'] in (1, 2):
                        db.execute('UPDATE payments SET state=?,reason=?,cancel_time=? WHERE id=?', (-1 if tx['state'] == 1 else -2, reason, now_ms(), tx['id']))
                        db.execute('UPDATE orders SET payment_status=?,status=?,updated=? WHERE id=?', ('unpaid' if tx['state'] == 1 else 'refunded', order['status'] if tx['state'] == 1 else 'cancelled', now_ms(), tx['order_id']))
                tx = db.execute('SELECT * FROM payments WHERE id=?', (tx['id'],)).fetchone()
                return {'id': request_id, 'result': self.tx_result(tx)}
        except GatewayError as error:
            return self.rpc_error(request_id, error.code, error.message, error.data)
        except sqlite3.IntegrityError:
            return self.rpc_error(request_id, -31099, 'Faol tranzaksiya bor.', 'order_id')

    def click(self, p, expected_action):
        raw_id = p.get('click_trans_id', '')
        base = {'click_trans_id': int(raw_id) if isinstance(raw_id, str) and re.fullmatch(r'\d{1,20}', raw_id) else 0, 'merchant_trans_id': p.get('merchant_trans_id')}
        def fail(code, note):
            return base | {'error': code, 'error_note': note}
        required = ('click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'action', 'error', 'error_note', 'sign_time', 'sign_string', 'click_paydoc_id')
        if not self.methods()['click'] or any(not isinstance(p.get(key), str) for key in required):
            return fail(-8, 'Error in request from click')
        if not re.fullmatch(r'\d{1,20}', raw_id) or not re.fullmatch(r'\d{1,20}', p['click_paydoc_id']):
            return fail(-8, 'Error in request from click')
        if p['action'] != str(expected_action):
            return fail(-3, 'Action not found')
        if expected_action == 1 and not isinstance(p.get('merchant_prepare_id'), str):
            return fail(-8, 'Error in request from click')
        if p['service_id'] != self.env['CLICK_SERVICE_ID']:
            return fail(-1, 'SIGN CHECK FAILED')
        source = p['click_trans_id'] + p['service_id'] + self.env['CLICK_SECRET_KEY'] + p['merchant_trans_id']
        if expected_action == 1:
            source += p['merchant_prepare_id']
        signature = hashlib.md5((source + p['amount'] + p['action'] + p['sign_time']).encode()).hexdigest()
        if not hmac.compare_digest(signature, p['sign_string'].lower()):
            return fail(-1, 'SIGN CHECK FAILED')
        if not re.fullmatch(r'\d+(?:\.\d{1,2})?', p['amount']) or len(p['amount']) > 30:
            return fail(-2, 'Incorrect parameter amount')
        try:
            amount = int(Decimal(p['amount']) * 100)
            callback_error = int(p['error'])
        except (ValueError, InvalidOperation):
            return fail(-8, 'Error in request from click')
        with self.store.connection() as db:
            db.execute('BEGIN IMMEDIATE')
            order = db.execute('SELECT * FROM orders WHERE id=?', (p['merchant_trans_id'],)).fetchone()
            if not order or order['payment_method'] != 'click':
                return fail(-5, 'User does not exist')
            if amount != order['total'] * 100:
                return fail(-2, 'Incorrect parameter amount')
            tx = db.execute("SELECT * FROM payments WHERE provider='click' AND provider_id=?", (p['click_trans_id'],)).fetchone()
            if tx and (tx['order_id'] != order['id'] or tx['amount'] != amount):
                return fail(-6, 'Transaction does not exist')
            if tx and tx['state'] == 2:
                return fail(-4, 'Already paid')
            if tx and tx['state'] < 0:
                return fail(-9, 'Transaction cancelled')
            if not self.payable(order, 'click'):
                return fail(-4 if order['payment_status'] == 'paid' else -5, 'Already paid' if order['payment_status'] == 'paid' else 'User does not exist')
            if callback_error > 0:
                return fail(-8, 'Error in request from click')
            if expected_action == 0:
                if callback_error < 0:
                    return fail(-9, 'Transaction cancelled')
                if not tx:
                    if db.execute('SELECT 1 FROM payments WHERE order_id=? AND state IN (1,2)', (order['id'],)).fetchone():
                        return fail(-8, 'Payment in progress')
                    tx_id = db.execute("INSERT INTO payments(provider,provider_id,order_id,amount,create_time) VALUES('click',?,?,?,?)", (p['click_trans_id'], order['id'], amount, now_ms())).lastrowid
                    tx = db.execute('SELECT * FROM payments WHERE id=?', (tx_id,)).fetchone()
                return base | {'merchant_prepare_id': tx['id'], 'error': 0, 'error_note': 'Success'}
            if not tx or p['merchant_prepare_id'] != str(tx['id']):
                return fail(-6, 'Transaction does not exist')
            if callback_error < 0:
                db.execute('UPDATE payments SET state=-1,cancel_time=?,reason=? WHERE id=?', (now_ms(), callback_error, tx['id']))
                return fail(-9, 'Transaction cancelled')
            db.execute('UPDATE payments SET state=2,perform_time=? WHERE id=?', (now_ms(), tx['id']))
            db.execute("UPDATE orders SET payment_status='paid',updated=? WHERE id=?", (now_ms(), order['id']))
            db.execute("INSERT INTO audit_events(event,order_id,created) VALUES('click_paid',?,?)", (order['id'], now_ms()))
            return base | {'merchant_confirm_id': tx['id'], 'error': 0, 'error_note': 'Success'}
