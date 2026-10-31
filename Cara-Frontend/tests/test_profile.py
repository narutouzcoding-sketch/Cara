from pathlib import Path
from tempfile import TemporaryDirectory
import json
import base64
import sqlite3
import struct
import zlib
from io import BytesIO
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from unittest.mock import patch
import unittest

from backend.store import Store, StoreError
from server import ROOT, build_server
import test_store
from backend.avatar import chunk
from backend.profile_excel import export_workbook, MIME as EXCEL_MIME
from backend.locations import Locations


def avatar_data():
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 6, 0, 0, 0))
    png += chunk(b'tEXt', b'Location\x00must-not-be-kept')
    png += chunk(b'IDAT', zlib.compress((b'\x00' + b'\x08\x81\x78\xff'*2)*2)) + chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode()


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.database = Path(self.temp.name) / 'profile.sqlite3'
        self.store = Store(ROOT, self.database)
        self.user = self.store.register('profile_buyer', 'profile@example.test', 'old-test-password')
        self.other = self.store.register('another_buyer', 'another@example.test', 'other-test-password')
        self.payload = dict(username=self.user['username'], email=self.user['email'],
                            full_name='Test Xaridor', phone='+998 (90) 123-45-67', city='Termiz', address='Test ko‘chasi 12')

    def tearDown(self):
        self.temp.cleanup()

    def test_profile_is_persistent_normalized_and_owned(self):
        self.store.update_profile(self.user, {**self.payload, 'user_id': self.other['id'], 'role': 'admin'})
        fresh = Store(ROOT, self.database)
        saved = fresh.profile(self.user)
        self.assertEqual(saved['details']['phone'], '+998901234567')
        self.assertEqual(saved['details']['address'], 'Test ko‘chasi 12')
        self.assertEqual(saved['user']['role'], 'customer')
        self.assertEqual(fresh.profile(self.other)['details']['full_name'], '')
        self.assertNotIn('password_hash', json.dumps(saved))

    def test_map_point_is_saved_validated_cleared_and_private(self):
        saved = self.store.update_profile(self.user, {**self.payload, 'latitude':37.2241234, 'longitude':67.2781234})
        self.assertEqual(saved['details']['latitude'], 37.224123)
        self.assertIsNone(self.store.profile(self.other)['details']['latitude'])
        for lat, lng in [(True,67), (91,67), (37,None), ('37',67), (float('nan'),67), (37,float('inf'))]:
            with self.assertRaises(StoreError):
                self.store.update_profile(self.user, {**self.payload, 'latitude':lat, 'longitude':lng})
        self.assertEqual(self.store.profile(self.user)['details']['latitude'], 37.224123)
        kept = self.store.update_profile(self.user, self.payload)
        self.assertEqual(kept['details']['longitude'], 67.278123)
        cleared = self.store.update_profile(self.user, {**self.payload, 'latitude':None, 'longitude':None})
        self.assertIsNone(cleared['details']['latitude'])

    def test_avatar_is_validated_private_persistent_and_metadata_is_removed(self):
        result=self.store.save_avatar(self.user,avatar_data())
        self.assertTrue(result['avatar_version'])
        data=Store(ROOT,self.database).avatar(self.user)
        self.assertTrue(data.startswith(b'\x89PNG'))
        self.assertNotIn(b'must-not-be-kept',data)
        with self.assertRaises(StoreError):
            self.store.avatar(self.other)
        for bad in ('data:image/svg+xml;base64,PHN2Zz4=',avatar_data()[:-12], 'data:image/png;base64,'+'x'*700001, 'data:image/png;base64,'+base64.b64encode(b'fake PNG').decode()):
            with self.assertRaises(StoreError):
                self.store.save_avatar(self.user,bad)
        self.assertEqual(self.store.profile(self.user)['avatar_version'],result['avatar_version'])
        self.store.remove_avatar(self.other)
        self.assertEqual(self.store.avatar(self.user),data)
        self.store.remove_avatar(self.user)
        self.assertIsNone(self.store.profile(self.user)['avatar_version'])

    def test_legacy_profile_and_order_tables_migrate_without_losing_data(self):
        legacy=Path(self.temp.name)/'legacy.sqlite3'
        with sqlite3.connect(legacy) as db:
            db.execute("CREATE TABLE profiles(user_id INTEGER PRIMARY KEY,full_name TEXT,phone TEXT,city TEXT,address TEXT)")
            db.execute("INSERT INTO profiles VALUES(1,'Legacy Name','','Termiz','Original address')")
        db.close()
        migrated=Store(ROOT,legacy)
        with migrated.connection() as db:
            row=db.execute('SELECT * FROM profiles').fetchone()
            self.assertEqual(row['full_name'],'Legacy Name')
            self.assertIsNone(row['latitude'])

    def test_delivery_coordinates_are_an_order_snapshot_and_pickup_has_no_point(self):
        payload = dict(recipient='Test Customer', phone='+998901234567', city='Termiz', address='Test street 10',
                       delivery_method='courier', payment_method='cash', items=[dict(id='f2',size='L',quantity=1)], latitude=37.224,longitude=67.278)
        order=self.store.create_order(self.user,payload,'coordinate-courier-order',{'cash':True})
        self.store.update_profile(self.user,{**self.payload,'latitude':40,'longitude':65})
        self.assertEqual(self.store.get_order(self.user,order['id'])['latitude'],37.224)
        pickup=self.store.create_order(self.user,{**payload,'delivery_method':'pickup'},'coordinate-pickup-order',{'cash':True})
        self.assertIsNone(pickup['latitude'])

    def test_identity_change_requires_current_password_and_unique_identity(self):
        for current in (None, 'incorrect-password'):
            with self.assertRaises(StoreError):
                self.store.update_profile(self.user, {**self.payload, 'email': 'new@example.test', 'current_password': current})
        with self.assertRaises(StoreError) as duplicate:
            self.store.update_profile(self.user, {**self.payload, 'email': self.other['email'], 'current_password': 'old-test-password'})
        self.assertEqual(duplicate.exception.status, 409)
        self.assertEqual(self.store.profile(self.user)['details']['full_name'], '')
        saved = self.store.update_profile(self.user, {**self.payload, 'email': 'new@example.test', 'current_password': 'old-test-password'})
        self.assertEqual(saved['user']['email'], 'new@example.test')
        self.assertEqual(self.store.login('new@example.test', 'old-test-password')['id'], self.user['id'])

    def test_invalid_details_do_not_overwrite_saved_profile(self):
        self.store.update_profile(self.user, self.payload)
        for changes in ({'phone':'123'}, {'address':'x'*401}, {'full_name':123}, {'username':'<script>'}):
            with self.assertRaises(StoreError):
                self.store.update_profile(self.user, {**self.payload, **changes})
        self.assertEqual(self.store.profile(self.user)['details']['city'], 'Termiz')

    def test_password_change_keeps_current_session_and_revokes_only_own_other_sessions(self):
        token, _ = self.store.new_session(self.user['id'])
        other_token, _ = self.store.new_session(self.user['id'])
        unrelated_token, _ = self.store.new_session(self.other['id'])
        with self.assertRaises(StoreError):
            self.store.change_password(self.user, dict(current_password='incorrect-password', new_password='new-test-password'), token)
        self.assertIsNotNone(self.store.session(other_token))
        self.store.change_password(self.user, dict(current_password='old-test-password', new_password='new-test-password'), token)
        self.assertIsNotNone(self.store.session(token))
        self.assertIsNone(self.store.session(other_token))
        self.assertIsNotNone(self.store.session(unrelated_token))
        self.assertEqual(self.store.login('profile_buyer', 'new-test-password')['id'], self.user['id'])
        with self.assertRaises(StoreError):
            self.store.login('profile_buyer', 'old-test-password')

    def test_export_is_private_and_session_revocation_preserves_current_session(self):
        token, _ = self.store.new_session(self.user['id'])
        other_token, _ = self.store.new_session(self.user['id'])
        self.store.revoke_other_sessions(self.user, token)
        self.assertIsNotNone(self.store.session(token))
        self.assertIsNone(self.store.session(other_token))
        exported = self.store.export_profile(self.user)
        self.assertEqual(exported['user']['id'], self.user['id'])
        self.assertEqual(exported['orders'], [])
        self.assertNotIn('csrf', json.dumps(exported))
        self.assertNotIn('password_hash', json.dumps(exported))

    def test_excel_export_has_real_worksheets_literal_text_and_only_owned_data(self):
        self.store.update_profile(self.user,{**self.payload,'full_name':'=HYPERLINK("https://bad.example")'})
        exported=self.store.export_profile(self.user)
        workbook=export_workbook(exported)
        self.assertTrue(workbook.startswith(b'PK'))
        with ZipFile(BytesIO(workbook)) as archive:
            for name in archive.namelist():
                if name.endswith('.xml') or name.endswith('.rels'):
                    ET.fromstring(archive.read(name))
            root=ET.fromstring(archive.read('xl/workbook.xml'))
            ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
            self.assertEqual([s.attrib['name'] for s in root.findall('s:sheets/s:sheet',ns)],['Profil','Buyurtmalar','Mahsulotlar','Sharhlar'])
            sheet=ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
            self.assertEqual(sheet.find('.//s:c[@r="B2"]',ns).attrib['t'],'inlineStr')
            self.assertEqual(sheet.findall('.//s:f',ns),[])
            self.assertIn(b'profile@example.test',archive.read('xl/worksheets/sheet1.xml'))
            self.assertNotIn(b'another@example.test',archive.read('xl/worksheets/sheet1.xml'))

    def test_profile_order_totals_and_export_never_include_another_buyers_orders(self):
        payload = dict(recipient='Test Customer', phone='+998901234567', city='Termiz', address='',
                       delivery_method='pickup', payment_method='cash', notes='', items=[dict(id='f2', size='L', quantity=1)])
        own = self.store.create_order(self.user, payload, 'profile-own-order', {'cash': True})
        other = self.store.create_order(self.other, payload, 'profile-other-order', {'cash': True})
        self.store.promote_admin(self.user['username'])
        admin = self.store.login(self.user['username'], 'old-test-password')
        profile = self.store.profile(admin)
        self.assertEqual(profile['stats']['orders'], 1)
        self.assertEqual(profile['stats']['active'], 1)
        self.assertEqual(profile['stats']['spent'], 0)
        self.assertEqual([o['id'] for o in profile['recent_orders']], [own['id']])
        exported = self.store.export_profile(admin)
        self.assertEqual([o['id'] for o in exported['orders']], [own['id']])
        self.assertNotIn(other['id'], json.dumps(exported))


class ProfileHttpTests(unittest.TestCase):
    setUp = test_store.HttpTests.setUp
    tearDown = test_store.HttpTests.tearDown
    request = test_store.HttpTests.request
    register = test_store.HttpTests.register

    def test_only_one_server_can_listen_on_the_same_port(self):
        with self.assertRaises(OSError):
            build_server(port=self.server.server_port,database=Path(self.temp.name)/'second.sqlite3',env={})

    def test_avatar_endpoints_require_auth_and_csrf_and_serve_private_png(self):
        self.assertEqual(self.request('GET','/assets/leaflet/leaflet.js')[0],200)
        self.assertEqual(self.request('GET','/api/profile/avatar')[0],401)
        self.register()
        self.assertEqual(self.request('POST','/api/profile/avatar',dict(image=avatar_data()),csrf=False)[0],403)
        self.assertEqual(self.request('POST','/api/profile/avatar',dict(image=avatar_data()))[0],200)
        code,png,headers=self.request('GET','/api/profile/avatar')
        self.assertEqual(code,200)
        self.assertEqual(headers['Content-Type'],'image/png')
        self.assertNotIn(b'Location',png)
        self.assertEqual(self.request('POST','/api/profile/avatar',dict(remove=True))[0],200)
        self.assertEqual(self.request('GET','/api/profile/avatar')[0],404)

    def test_profile_auth_csrf_update_export_and_password(self):
        self.assertEqual(self.request('GET', '/api/profile')[0], 401)
        self.assertEqual(self.request('GET', '/api/profile/export')[0], 401)
        self.register()
        payload = dict(username='httpbuyer', email='http@example.test', full_name='HTTP Buyer', phone='+998901234567', city='Termiz', address='HTTP street 5', role='admin')
        self.assertEqual(self.request('PATCH', '/api/profile', payload, csrf=False)[0], 403)
        code, result, _ = self.request('PATCH', '/api/profile', payload)
        self.assertEqual(code, 200)
        self.assertEqual(result['details']['full_name'], 'HTTP Buyer')
        self.assertEqual(result['user']['role'], 'customer')
        code,workbook,headers=self.request('GET','/api/profile/export')
        self.assertEqual(code,200)
        self.assertEqual(headers['Content-Type'],EXCEL_MIME)
        self.assertIn('cara-profil.xlsx',headers['Content-Disposition'])
        with ZipFile(BytesIO(workbook)) as archive:
            self.assertIn(b'Termiz',archive.read('xl/worksheets/sheet1.xml'))
        self.assertEqual(self.request('POST', '/api/profile/password', dict(current_password='wrong-password', new_password='new-test-password'))[0], 403)
        self.assertEqual(self.request('POST', '/api/profile/password', dict(current_password='test-password-123', new_password='new-test-password'))[0], 200)
        self.assertEqual(self.request('GET', '/api/me')[1]['user']['username'], 'httpbuyer')
        self.assertEqual(self.request('POST', '/api/profile/sessions/revoke', {})[0], 200)

    def test_address_lookup_requires_session_csrf_and_returns_named_places(self):
        self.assertEqual(self.request('POST','/api/profile/location',dict(latitude=37,longitude=67))[0],401)
        self.register()
        self.assertEqual(self.request('POST','/api/profile/location',dict(query='Termiz'),csrf=False)[0],403)
        place=dict(city='Termiz',address='Termiz, Test ko‘chasi',latitude=37,longitude=67)
        with patch('server.Locations.lookup',return_value={'place':place}):
            self.assertEqual(self.request('POST','/api/profile/location',dict(latitude=37,longitude=67))[1]['place']['address'],place['address'])


class LocationTests(unittest.TestCase):
    def test_named_place_lookup_is_cached_and_never_sends_account_information(self):
        data=dict(features=[dict(geometry=dict(coordinates=[67.278,37.224]),properties=dict(name='Nearby cafe',city='Termiz',street='Test ko‘chasi',housenumber='12',country='O‘zbekiston'))])
        with patch('backend.locations.urlopen') as request:
            request.return_value.__enter__.return_value.read.return_value=json.dumps(data).encode()
            lookup=Locations({})
            first=lookup.lookup(dict(latitude=37.224,longitude=67.278))
            second=lookup.lookup(dict(latitude=37.224,longitude=67.278))
            self.assertEqual(first,second)
            self.assertEqual(request.call_count,1)
            self.assertEqual(first['place']['city'],'Termiz')
            self.assertIn('Test ko‘chasi',first['place']['address'])
            self.assertNotIn('Nearby cafe',first['place']['address'])
            self.assertNotIn('email',request.call_args.args[0].full_url)

    def test_missing_place_and_provider_failure_are_actionable_errors(self):
        with patch('backend.locations.urlopen',side_effect=TimeoutError()):
            with self.assertRaises(StoreError) as error:
                Locations({}).lookup(dict(query='Termiz'))
            self.assertEqual(error.exception.status,503)


if __name__ == '__main__':
    unittest.main()
