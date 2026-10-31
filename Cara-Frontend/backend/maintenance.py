"""Local maintenance utilities. Never overwrite a database or publish a backup."""
from contextlib import closing
from pathlib import Path
import json
import sqlite3

from .store import StoreError


def backup_database(source, destination, web_root):
    source, destination, web_root = (Path(value).resolve() for value in (source, destination, web_root))
    if not source.is_file():
        raise StoreError('Ma’lumotlar bazasi topilmadi. Avval serverni ishga tushiring.')
    if destination == source or destination.is_relative_to(web_root):
        raise StoreError('Zaxirani loyiha veb-papkasidan tashqarida saqlang.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open('xb'):
            pass
    except FileExistsError:
        raise StoreError('Zaxira fayli allaqachon bor. Boshqa nom tanlang.')
    try:
        # SQLite's backup API includes committed WAL pages while the store runs.
        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as original:
            with closing(sqlite3.connect(destination)) as backup:
                original.backup(backup)
                if backup.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                    raise StoreError('Zaxiraning yaxlitlik tekshiruvi o‘tmadi.')
    except sqlite3.Error:
        destination.unlink(missing_ok=True)
        raise StoreError('Bazadan yaxlit zaxira olib bo‘lmadi. Manba SQLite faylini tekshiring.')
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return destination


def export_catalog(root, destination):
    """Export public catalog data without creating/opening a customer database."""
    root = Path(root)
    source = (root / 'store-data.js').read_text(encoding='utf-8')
    catalog = json.loads(source.split('window.CARA_DATA = ', 1)[1].rstrip().removesuffix(';'))
    destination = Path(destination).resolve()
    if destination.suffix.lower() != '.json':
        raise StoreError('Katalog uchun .json kengaytmali fayl tanlang.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open('x', encoding='utf-8') as output:
            json.dump(catalog, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write('\n')
    except FileExistsError:
        raise StoreError('Katalog fayli allaqachon bor. Boshqa nom tanlang.')
    return destination
