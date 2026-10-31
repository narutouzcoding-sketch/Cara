"""Validate the small static PNG produced by the browser's avatar canvas.

Keep only pixel chunks: original photo metadata never enters the saved avatar.
No image packages are required by the stdlib-only commerce server.
"""
import base64
import binascii
import struct
import zlib

from backend.store import StoreError


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def validate_avatar(value):
    try:
        if not isinstance(value, str) or len(value) > 700_000 or not value.startswith('data:image/png;base64,'):
            raise ValueError()
        raw = base64.b64decode(value.split(',', 1)[1], validate=True)
        if not raw.startswith(b'\x89PNG\r\n\x1a\n') or len(raw) > 512_000:
            raise ValueError()
        offset, header, pixels, ended = 8, None, bytearray(), False
        while offset < len(raw):
            if offset + 12 > len(raw):
                raise ValueError()
            size = struct.unpack('>I', raw[offset:offset+4])[0]
            kind = raw[offset+4:offset+8]
            end = offset + 12 + size
            if end > len(raw):
                raise ValueError()
            data = raw[offset+8:end-4]
            if zlib.crc32(kind + data) != struct.unpack('>I', raw[end-4:end])[0]:
                raise ValueError()
            if header is None and kind != b'IHDR':
                raise ValueError()
            if kind == b'IHDR':
                if header is not None or size != 13:
                    raise ValueError()
                width, height, bits, colour, compression, filtering, interlace = struct.unpack('>IIBBBBB', data)
                if not (1 <= width <= 512 and 1 <= height <= 512 and bits == 8 and colour in (2, 6)
                        and compression == filtering == interlace == 0):
                    raise ValueError()
                header = data
            elif kind == b'IDAT':
                pixels.extend(data)
            elif kind == b'IEND':
                if size or end != len(raw):
                    raise ValueError()
                ended = True
                break
            elif kind[0] & 32 == 0 or kind in (b'acTL', b'fcTL', b'fdAT'):
                raise ValueError()
            offset = end
        if not header or not pixels or not ended:
            raise ValueError()
        stride = width * (4 if colour == 6 else 3) + 1
        expected = stride * height
        decoder = zlib.decompressobj()
        decoded = decoder.decompress(bytes(pixels), expected + 1)
        if len(decoded) != expected or not decoder.eof or decoder.unused_data or decoder.unconsumed_tail:
            raise ValueError()
        if any(decoded[index] > 4 for index in range(0, expected, stride)):
            raise ValueError()
        return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', bytes(pixels)) + chunk(b'IEND', b'')
    except (ValueError, binascii.Error, zlib.error, struct.error):
        raise StoreError('Rasmni o‘qib bo‘lmadi. JPG, PNG yoki WebP rasmni qayta tanlang.')
