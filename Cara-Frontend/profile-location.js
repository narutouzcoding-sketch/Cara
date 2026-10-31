(() => {
    'use strict';
    const valid=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=85.051128&&Math.abs(lng)<=180;
    const mapUrl=(lat,lng)=>`https://www.google.com/maps?q=${Number(lat)},${Number(lng)}`;
    window.CARA_LOCATION={valid,mapUrl,mount};
    function mount(container,{api,onAddress=()=>{},onBusy=()=>{}}={}) {
        container.innerHTML=`<div class="profile-place-search"><label for="profile-place-query">Manzil yoki joy nomi</label><div><input id="profile-place-query" type="search" maxlength="160" placeholder="Masalan, Termiz, Alisher Navoiy ko‘chasi"><button class="button" type="button" data-location-search><i class="fa fa-search" aria-hidden="true"></i> Qidirish</button></div><ul data-location-results class="profile-place-results" aria-label="Topilgan manzillar" hidden></ul></div><div class="profile-map-tools"><button class="button secondary" type="button" data-location-current><i class="fa fa-location-arrow" aria-hidden="true"></i> Joriy joylashuvim</button><button class="button secondary" type="button" data-location-center>Shu joyni tanlash</button></div><p class="profile-map-hint">Xaritadan joyni tanlang — manzil nomi avtomatik to‘ladi.</p><div class="profile-map" id="profile-map" role="region" aria-label="Yetkazib berish joyini tanlash xaritasi"></div><p data-location-status class="inline-status" role="status"></p><div class="profile-location-summary"><strong data-location-summary>Hali manzil tanlanmagan</strong><div class="action-row"><a data-location-link target="_blank" rel="noopener noreferrer" hidden>Xaritada ochish</a><button type="button" data-location-copy hidden><i class="fa fa-copy" aria-hidden="true"></i> Manzilni nusxalash</button><button type="button" data-location-clear hidden>Tanlovni bekor qilish</button><button type="button" data-location-retry hidden>Manzil nomini qayta aniqlash</button></div></div>`;
        const $=s=>container.querySelector(s);
        let map,marker,point=null,label='',resolved=true,pending=false,disposed=false,gpsRequest=0,requestId=0,timer,places=[];
        function message(text,error=false){const node=$('[data-location-status]');node.textContent=text;node.className='inline-status '+(error?'error':'success');}
        function busy(value){pending=value;onBusy(value);}
        function display(){
            $('[data-location-summary]').textContent=label||(point?'Tanlangan joy':'Hali manzil tanlanmagan');
            for(const s of ['link','clear'])$('[data-location-'+s+']').hidden=!point;
            $('[data-location-copy]').hidden=!label||!resolved;
            $('[data-location-retry]').hidden=!point||resolved||pending;
            if(point)$('[data-location-link]').href=mapUrl(point.latitude,point.longitude);else $('[data-location-link]').removeAttribute('href');
            if(map){
                if(marker){map.removeLayer(marker);marker=null;}
                if(point){
                    marker=window.L.marker([point.latitude,point.longitude],{draggable:true,title:'Tanlangan manzil',alt:'Tanlangan manzil',icon:window.L.divIcon({className:'profile-map-pin',html:'<i class="fa fa-map-marker" aria-hidden="true"></i>',iconSize:[32,42],iconAnchor:[16,42]})}).addTo(map);
                    marker.on('dragend',()=>{const p=marker.getLatLng().wrap();choose(p.lat,p.lng);});
                    map.setView([point.latitude,point.longitude],Math.max(map.getZoom(),15),{animate:false});
                }
            }
        }
        function cancel(){clearTimeout(timer);requestId++;gpsRequest++;$('[data-location-current]').disabled=false;busy(false);}
        function set(details){cancel();point=details&&valid(details.latitude,details.longitude)?{latitude:details.latitude,longitude:details.longitude}:null;label=details?.address||'';resolved=true;display();message('');}
        async function resolve(id){
            try{
                const result=await api('/profile/location',{method:'POST',body:point});
                if(disposed||id!==requestId)return;
                if(!result.place?.address||!result.place.city)throw new Error('Manzil nomi topilmadi.');
                label=result.place.address;resolved=true;onAddress(result.place);message('Manzil aniqlandi. Saqlashni bosing.');
            }catch(error){if(!disposed&&id===requestId){resolved=false;label='Manzil nomi aniqlanmadi';message(error.message,true);}}
            finally{if(!disposed&&id===requestId){busy(false);display();}}
        }
        function choose(latitude,longitude,place){
            if(!valid(latitude,longitude)){message('Bu joyni tanlab bo‘lmaydi.',true);return;}
            cancel();point={latitude:Number(latitude.toFixed(6)),longitude:Number(longitude.toFixed(6))};
            label=place?.address||'Manzil aniqlanmoqda…';resolved=!!place;
            if(place){onAddress(place);message('Manzil tanlandi. Saqlashni bosing.');}
            else{busy(true);message('Manzil nomi aniqlanmoqda…');const id=requestId;timer=setTimeout(()=>resolve(id),450);}
            display();
        }
        function show(){
            if(disposed)return;
            if(map){map.invalidateSize();return;}
            if(!window.L){message('Xarita ochilmadi. Manzil nomini qidirib tanlang.',true);return;}
            const settings=window.CARA_DATA.store;
            map=window.L.map($('#profile-map'),{scrollWheelZoom:false}).setView(point?[point.latitude,point.longitude]:settings.mapCenter||[37.224,67.278],point?15:13);
            window.L.tileLayer(settings.mapTileUrl||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).addTo(map).on('tileerror',()=>message('Xarita tasvirlari yuklanmadi. Manzil nomini qidirib tanlashingiz mumkin.',true));
            map.on('click',event=>{const p=event.latlng.wrap();choose(p.lat,p.lng);});display();
        }
        async function search(){
            const query=$('#profile-place-query').value.trim();if(query.length<3){message('Kamida 3 ta belgi yozing.',true);return;}
            cancel();const id=requestId;busy(true);$('[data-location-search]').disabled=true;message('Manzillar qidirilmoqda…');$('[data-location-results]').hidden=true;
            try{
                const result=await api('/profile/location',{method:'POST',body:{query}});
                if(disposed||id!==requestId)return;
                places=(result.places||[]).filter(p=>p.address&&p.city&&valid(p.latitude,p.longitude));
                if(!places.length)throw new Error('Manzil topilmadi. Boshqa nom bilan qidiring.');
                const list=$('[data-location-results]');list.replaceChildren();
                places.forEach((place,index)=>{const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.dataset.placeIndex=index;button.textContent=place.address;item.append(button);list.append(item);});list.hidden=false;message('Ro‘yxatdan kerakli manzilni tanlang.');
            }catch(error){if(!disposed&&id===requestId)message(error.message,true);}
            finally{if(!disposed){$('[data-location-search]').disabled=false;if(id===requestId)busy(false);}}
        }
        $('[data-location-search]').addEventListener('click',search);
        $('#profile-place-query').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
        $('[data-location-results]').addEventListener('click',event=>{const button=event.target.closest('[data-place-index]');if(!button)return;const p=places[Number(button.dataset.placeIndex)];choose(p.latitude,p.longitude,p);$('[data-location-results]').hidden=true;});
        $('[data-location-center]').addEventListener('click',()=>{show();if(map){const p=map.getCenter().wrap();choose(p.lat,p.lng);}});
        $('[data-location-clear]').addEventListener('click',()=>{cancel();point=null;label='';resolved=true;onAddress({city:'',address:''});display();message('Tanlov bekor qilindi. Saqlashni bosing.');});
        $('[data-location-retry]').addEventListener('click',()=>{if(point)choose(point.latitude,point.longitude);});
        $('[data-location-copy]').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(label);message('Manzil nusxalandi.');}catch{message('Nusxalab bo‘lmadi. Manzil matnini qo‘lda nusxalang.',true);}});
        $('[data-location-current]').addEventListener('click',()=>{
            if(!navigator.geolocation){message('Joylashuvni aniqlab bo‘lmaydi. Xaritadan tanlang.',true);return;}
            const id=++gpsRequest,button=$('[data-location-current]');button.disabled=true;message('Joylashuv aniqlanmoqda…');
            navigator.geolocation.getCurrentPosition(position=>{if(disposed||id!==gpsRequest)return;button.disabled=false;choose(position.coords.latitude,position.coords.longitude);},error=>{if(disposed||id!==gpsRequest)return;button.disabled=false;message(error.code===1?'Joylashuvga ruxsat berilmadi. Xaritadan tanlang.':'Joylashuv topilmadi. Qayta urinib ko‘ring.',true);},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
        });
        return {show,set,value(){if(pending)throw new Error('Manzil aniqlanishini kuting.');if(point&&!resolved)throw new Error('Manzil nomini qayta aniqlang yoki qidiruvdan tanlang.');return point||{latitude:null,longitude:null};},destroy(){disposed=true;cancel();map?.remove();}};
    }
})();
