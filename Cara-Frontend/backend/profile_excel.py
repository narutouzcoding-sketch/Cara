"""Portable .xlsx account export using Python's standard library."""
from datetime import datetime, timedelta, timezone
from io import BytesIO
import math
import re
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
STATUSES = dict(pending='Kutilmoqda', confirmed='Tasdiqlangan', shipped='Yo‘lda', delivered='Yetkazilgan', cancelled='Bekor qilingan')


def date(value):
    return datetime.fromtimestamp(value / 1000, timezone(timedelta(hours=5))).strftime('%d.%m.%Y %H:%M') if value else ''


def column(index):
    result = ''
    while index:
        index, letter = divmod(index - 1, 26)
        result = chr(65 + letter) + result
    return result


def sheet(rows, widths, money_columns=()):
    out = [f'<worksheet xmlns="{NS}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>']
    out += [f'<col min="{i}" max="{i}" width="{width}" customWidth="1"/>' for i, width in enumerate(widths, 1)]
    out.append('</cols><sheetData>')
    for r, row in enumerate(rows, 1):
        lines = max(math.ceil(len(str(value or '')) / max(1,widths[c])) + str(value or '').count('\n') for c,value in enumerate(row))
        height = 30 if r == 1 else max(28,min(409,lines*16))
        out.append(f'<row r="{r}" ht="{height}" customHeight="1">')
        for c, value in enumerate(row, 1):
            money = c in money_columns or (c == 2 and str(row[0]).endswith('(UZS)'))
            style = 1 if r == 1 else 3 if money and type(value) in (int, float) else 2
            ref = f'{column(c)}{r}'
            if type(value) in (int, float):
                out.append(f'<c r="{ref}" s="{style}"><v>{value}</v></c>')
            else:
                text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(value if value is not None else ''))[:32767]
                # inlineStr keeps user text literal, including leading =, + and @.
                out.append(f'<c r="{ref}" s="{style}" t="inlineStr"><is><t xml:space="preserve">{escape(text)}</t></is></c>')
        out.append('</row>')
    out.append(f'</sheetData><autoFilter ref="A1:{column(len(widths))}{len(rows)}"/></worksheet>')
    return ''.join(out)


def export_workbook(data):
    user, details, stats = data['user'], data['details'], data['stats']
    profile = [['Ma’lumot', 'Qiymat'], ['Ism-familiya', details['full_name']], ['Foydalanuvchi nomi', user['username']],
        ['Email', user['email']], ['Telefon', details['phone']], ['Shahar yoki tuman', details['city']], ['Manzil', details['address']],
        ['Ro‘yxatdan o‘tilgan sana (Toshkent)', date(data['created'])], ['Buyurtmalar soni', stats['orders']],
        ['Jarayondagi buyurtmalar', stats['active']], ['Yetkazilgan buyurtmalar', stats['delivered']], ['To‘langan summa (UZS)', stats['spent']]]
    orders = [['Buyurtma', 'Sana (Toshkent)', 'Holat', 'To‘lov usuli', 'To‘lov holati', 'Mahsulotlar (UZS)', 'Yetkazish (UZS)', 'Jami (UZS)', 'Qabul qiluvchi', 'Telefon', 'Shahar', 'Manzil']]
    items = [['Buyurtma', 'Mahsulot', 'O‘lcham', 'Miqdor', 'Dona narxi (UZS)', 'Summa (UZS)']]
    reviews = [['Mahsulot', 'Baho (1–5)', 'Sharh', 'Yangilangan sana (Toshkent)']]
    for order in data['orders']:
        orders.append([order['id'], date(order['created']), STATUSES.get(order['status'], order['status']),
            dict(cash='Naqd',click='Click',payme='Payme').get(order['payment_method'],order['payment_method']),
            dict(paid='To‘langan',unpaid='To‘lanmagan',refunded='Qaytarilgan').get(order['payment_status'],order['payment_status']),
            order['subtotal'], order['shipping_fee'] if order['shipping_fee'] is not None else 'Tasdiqlanadi', order['total'],
            order['recipient'],order['phone'],order['city'],order['address']])
        for item in order['items']:
            items.append([order['id'],item['name'],item['size'],item['quantity'],item['unit_price'],item['quantity']*item['unit_price']])
    for review in data['reviews']:
        reviews.append([review.get('product_name',review['product_id']),review['rating'],review['body'],date(review['updated'])])
    tabs = [('Profil',profile,[38,65],()),('Buyurtmalar',orders,[25,23,20,17,20,23,23,23,28,24,25,60],(6,7,8)),
            ('Mahsulotlar',items,[25,40,16,14,24,24],(5,6)),('Sharhlar',reviews,[35,18,75,30],())]
    out = BytesIO()
    with ZipFile(out,'w',ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+''.join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1,5))+'</Types>')
        archive.writestr('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml',f'<workbook xmlns="{NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+''.join(f'<sheet name="{name}" sheetId="{i}" r:id="rId{i}"/>' for i,(name,*_) in enumerate(tabs,1))+'</sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1,5))+'<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('xl/styles.xml',f'<styleSheet xmlns="{NS}"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0&quot; UZS&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF088178"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')
        for i,(_,rows,widths,money) in enumerate(tabs,1):
            archive.writestr(f'xl/worksheets/sheet{i}.xml',sheet(rows,widths,money))
    return out.getvalue()
