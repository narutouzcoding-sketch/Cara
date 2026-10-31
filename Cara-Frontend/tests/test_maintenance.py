from pathlib import Path
from contextlib import closing
from tempfile import TemporaryDirectory
import json
import sqlite3
import unittest

from backend.maintenance import backup_database, export_catalog
from backend.store import StoreError
from server import ROOT


class MaintenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.source = self.directory / 'live.sqlite3'
        self.web = self.directory / 'public'
        self.web.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_online_backup_includes_wal_data_and_can_be_restored(self):
        db = sqlite3.connect(self.source)
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE example (value TEXT)')
        db.execute("INSERT INTO example VALUES ('committed order')")
        db.commit()
        db.execute("INSERT INTO example VALUES ('uncommitted order')")
        output = backup_database(self.source, self.directory / 'backup.sqlite3', self.web)
        with closing(sqlite3.connect(output)) as backup:
            self.assertEqual(backup.execute('SELECT value FROM example').fetchall(), [('committed order',)])
            self.assertEqual(backup.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
        db.rollback()
        db.close()

    def test_backups_refuse_public_paths_missing_sources_and_existing_files(self):
        with closing(sqlite3.connect(self.source)) as db:
            db.execute('CREATE TABLE example (value TEXT)')
            db.commit()
        existing = self.directory / 'existing.sqlite3'
        existing.write_bytes(b'keep this file')
        for destination in (existing, self.source, self.web / 'backup.sqlite3'):
            with self.subTest(destination=destination), self.assertRaises(StoreError):
                backup_database(self.source, destination, self.web)
        self.assertEqual(existing.read_bytes(), b'keep this file')
        with self.assertRaises(StoreError):
            backup_database(self.directory / 'missing.sqlite3', self.directory / 'unused.sqlite3', self.web)
        self.assertFalse((self.directory / 'missing.sqlite3').exists())

    def test_public_catalog_exports_product_ids_prices_and_socials_without_overwriting(self):
        output = self.directory / 'catalog.json'
        export_catalog(ROOT, output)
        data = json.loads(output.read_text(encoding='utf-8'))
        self.assertEqual(len(data['products']), 16)
        self.assertEqual(data['store']['currency'], 'UZS')
        self.assertEqual(len(data['store']['socialLinks']), 6)
        self.assertEqual(next(p['price'] for p in data['products'] if p['id'] == 'f2'), 169000)
        with self.assertRaises(StoreError):
            export_catalog(ROOT, output)

    def test_corrupt_database_does_not_leave_a_partial_backup(self):
        self.source.write_bytes(b'not a sqlite database')
        output = self.directory / 'failed.sqlite3'
        with self.assertRaisesRegex(StoreError, 'SQLite'):
            backup_database(self.source, output, self.web)
        self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
