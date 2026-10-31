(() => {
    'use strict';
    window.CARA_PHOTO={mount};
    function mount(container,{api,avatarUrl,onSaved}) {
        container.innerHTML=`<div class="profile-photo-editor"><button type="button" class="profile-photo-current" data-photo-choose aria-label="Profil rasmini tanlash"><img alt="Profil rasmi" hidden><span aria-hidden="true"><i class="fa fa-camera" aria-hidden="true"></i></span></button><div><h3>Profil rasmi</h3><p>Rasm tanlang — avtomatik saqlanadi. JPG, PNG, WebP, AVIF · 8 MB gacha</p><button type="button" class="button secondary" data-photo-choose>Rasm tanlash</button> <button type="button" class="button secondary" data-photo-remove hidden>Olib tashlash</button><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" hidden aria-label="Profil uchun rasm tanlash"></div></div><details class="profile-photo-adjust" hidden><summary>Rasmni moslash</summary><div class="profile-photo-preview"><canvas width="256" height="256" aria-label="Rasm ko‘rinishi"></canvas><label>Yaqinlashtirish<input type="range" min="1" max="3" step="0.05" value="1" data-photo-zoom></label><label>Chap / o‘ng<input type="range" min="0" max="1" step="0.01" value="0.5" data-photo-x></label><label>Yuqori / past<input type="range" min="0" max="1" step="0.01" value="0.5" data-photo-y></label><div class="action-row"><button type="button" class="button" data-photo-save>Moslashni saqlash</button><button type="button" class="button secondary" data-photo-cancel>Yopish</button></div></div></details><p data-photo-status class="inline-status" role="status"></p>`;
        const $=s=>container.querySelector(s),file=$('input[type="file"]'),canvas=$('canvas'),adjust=$('.profile-photo-adjust');
        let image,disposed=false,sequence=0,busy=false;
        function message(text,error=false){const node=$('[data-photo-status]');node.textContent=text;node.className='inline-status '+(error?'error':'success');}
        function release(){image=null;file.value='';adjust.hidden=true;adjust.open=false;}
        function set(version){const button=$('.profile-photo-current');button.dataset.photoHint=version?'Rasmni o‘zgartirish':'Rasm qo‘yish';button.title=button.dataset.photoHint;button.setAttribute('aria-label',button.dataset.photoHint);const img=$('.profile-photo-current img');img.hidden=!version;$('.profile-photo-current span').hidden=!!version;$('[data-photo-remove]').hidden=!version;if(version)img.src=avatarUrl(version);else img.removeAttribute('src');}
        $('.profile-photo-current img').addEventListener('error',()=>{$('.profile-photo-current img').hidden=true;$('.profile-photo-current span').hidden=false;message('Rasmni yuklab bo‘lmadi. Sahifani yangilang yoki qayta tanlang.',true);});
        function draw(){if(!image)return;const context=canvas.getContext('2d');if(!context)throw new Error('Brauzer rasmni tayyorlay olmadi. Boshqa brauzerda oching.');const size=Math.min(image.naturalWidth,image.naturalHeight)/Number($('[data-photo-zoom]').value),x=(image.naturalWidth-size)*Number($('[data-photo-x]').value),y=(image.naturalHeight-size)*Number($('[data-photo-y]').value);context.clearRect(0,0,256,256);context.drawImage(image,x,y,size,size,0,0,256,256);}
        function read(selected){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Fayl o‘qilmadi. Qayta tanlang.'));reader.readAsDataURL(selected);});}
        function decode(source){return new Promise((resolve,reject)=>{const candidate=new Image();candidate.onload=()=>resolve(candidate);candidate.onerror=()=>reject(new Error('Rasm ochilmadi. JPG, PNG yoki WebP nusxasini tanlang.'));candidate.src=source;});}
        function lock(value){busy=value;for(const control of container.querySelectorAll('button,input'))control.disabled=value;}
        async function persist(remove=false){
            if(!remove&&!image)return;
            const result=await api('/profile/avatar',{method:'POST',body:remove?{remove:true}:{image:canvas.toDataURL('image/png')}});
            if(disposed)return;set(result.avatar_version);onSaved(result.avatar_version);if(remove)release();message(remove?'Profil rasmi olib tashlandi.':'Profil rasmi saqlandi.');
        }
        for(const choose of container.querySelectorAll('[data-photo-choose]'))choose.addEventListener('click',()=>{if(!busy){file.value='';file.click();}});
        file.addEventListener('change',async()=>{
            const selected=file.files?.[0];if(!selected||busy)return;const request=++sequence;
            if(selected.size>8*1024*1024||!(/\.(jpe?g|png|webp|avif)$/i.test(selected.name)||['image/jpeg','image/png','image/webp','image/avif'].includes(selected.type))){message('JPG, PNG, WebP yoki AVIF formatida, 8 MB gacha rasm tanlang.',true);return;}
            lock(true);message('Rasm yuklanmoqda…');
            try{const candidate=await decode(await read(selected));if(disposed||request!==sequence)return;if(candidate.naturalWidth*candidate.naturalHeight>40_000_000)throw new Error('Rasm juda katta. Kichikroq nusxasini tanlang.');image=candidate;for(const [s,v] of [['zoom','1'],['x','0.5'],['y','0.5']])$('[data-photo-'+s+']').value=v;draw();adjust.hidden=false;await persist();}
            catch(error){if(!disposed&&request===sequence){message(error.message,true);if(image){adjust.hidden=false;adjust.open=true;}}}
            finally{if(!disposed&&request===sequence)lock(false);file.value='';}
        });
        for(const input of container.querySelectorAll('input[type="range"]'))input.addEventListener('input',()=>{try{draw();message('Moslashni saqlashni bosing.');}catch(error){message(error.message,true);}});
        async function action(remove=false){if(busy||(!remove&&!image))return;lock(true);message('Saqlanmoqda…');try{await persist(remove);}catch(error){if(!disposed)message(error.message,true);}finally{if(!disposed)lock(false);}}
        $('[data-photo-save]').addEventListener('click',()=>action());$('[data-photo-remove]').addEventListener('click',()=>action(true));
        $('[data-photo-cancel]').addEventListener('click',()=>{release();message('');});
        return {set,choose(){if(!busy){file.value='';file.click();}},destroy(){disposed=true;sequence++;release();}};
    }
})();
