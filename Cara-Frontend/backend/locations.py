"""User-triggered, cached Photon place lookup. No account data is sent."""
import json
import threading
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend.store import StoreError, coordinates, text


class Locations:
    def __init__(self, env):
        self.base = env.get('CARA_GEOCODER_URL','https://photon.komoot.io').rstrip('/')
        self.lock, self.cache, self.last = threading.Lock(), {}, 0

    @staticmethod
    def place(feature, include_name=True):
        properties = feature.get('properties',{})
        point = feature.get('geometry',{}).get('coordinates',[])
        if len(point) != 2:
            return None
        try:
            latitude, longitude = coordinates(point[1],point[0])
        except StoreError:
            return None
        city = properties.get('city') or properties.get('town') or properties.get('village') or properties.get('district') or properties.get('county') or properties.get('state') or ''
        street = ' '.join(str(properties.get(key) or '') for key in ('street','housenumber')).strip()
        pieces = [properties.get('name') if include_name or not street else None,street,city,properties.get('district'),properties.get('state'),properties.get('country')]
        pieces = list(dict.fromkeys(str(piece).strip() for piece in pieces if piece and str(piece).strip()))
        if not pieces or not city:
            return None
        return dict(city=str(city)[:80],address=', '.join(pieces)[:400],latitude=latitude,longitude=longitude)

    def lookup(self, payload):
        search = 'query' in payload
        if search:
            query = text(payload['query'],'Qidiruv',3,160)
            path, params = '/api',dict(q=query,limit=5)
        else:
            lat, lng = coordinates(payload.get('latitude'),payload.get('longitude'))
            if lat is None:
                raise StoreError('Xaritadan joy tanlang.')
            path, params = '/reverse',dict(lat=lat,lon=lng,limit=5,radius=0.5)
        key = path + '?' + urlencode(params)
        with self.lock:
            cached = self.cache.get(key)
            if cached and time.monotonic()-cached[0] < 86400:
                return cached[1]
            delay = 1.1 - (time.monotonic()-self.last)
            if delay > 0:
                time.sleep(delay)
            self.last = time.monotonic()
            try:
                request = Request(self.base+key,headers={'User-Agent':'CaraStore/1.0 (profile address picker)','Accept':'application/json'})
                with urlopen(request,timeout=7) as response:
                    raw = response.read(300_001)
                if len(raw)>300_000:
                    raise ValueError()
                data = json.loads(raw)
                places = [place for feature in data.get('features',[])[:5] if (place:=self.place(feature,include_name=search))]
                if not places:
                    raise StoreError('Bu joy nomi topilmadi. Yaqinroq ko‘cha yoki binoni tanlang.',404)
                result = {'places':places} if search else {'place':places[0]}
                if len(self.cache)>256:
                    self.cache.clear()
                self.cache[key]=(time.monotonic(),result)
                return result
            except StoreError:
                raise
            except Exception:
                raise StoreError('Manzil nomini aniqlab bo‘lmadi. Qayta urinib ko‘ring.',503)
