(() => {
    'use strict';
    const core = window.CARA_FRONTEND;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const date = value => value ? new Date(value).toLocaleDateString('uz-UZ') : '—';
    const icons = {overview:'th-large',info:'user-o',address:'map-marker',saved:'heart-o',reviews:'star-o',security:'shield'};
    const labels = {overview:'Umumiy',info:'Shaxsiy ma’lumotlar',address:'Yetkazib berish manzili',saved:'Saqlanganlar',reviews:'Sharhlarim',security:'Xavfsizlik'};
    const states = {pending:'Kutilmoqda',confirmed:'Tasdiqlangan',shipped:'Yo‘lda',delivered:'Yetkazilgan',cancelled:'Bekor qilingan'};
    let dispose;
    window.CARA_PROFILE = {render};
    async function render({user, api, onUser, avatarUrl}) {
        dispose?.();
        const root = document.querySelector('.account-page');
        if (!root) return;
        root.classList.add('profile-page');
        let profile = {user, details:{}, stats:{}, reviews:[], recent_orders:[], sessions:1};
        let loaded = false, locationControl, photoControl;
        root.innerHTML = `<div class="profile-shell">
          <header class="profile-heading"><div><p class="profile-eyebrow">CARA · SHAXSIY KABINET</p><h1>Profilim</h1><p>Tanlovlaringiz, buyurtmalaringiz va hisobingiz.</p></div><a href="shop.html" class="button secondary"><i class="fa fa-shopping-bag" aria-hidden="true"></i> Xaridni davom ettirish</a></header>
          <div class="profile-layout"><aside class="profile-sidebar"><div class="profile-identity"><div class="profile-avatar" aria-hidden="true"></div><h2 data-profile-name></h2><p data-profile-email></p><span class="profile-member">${user.role === 'admin' ? 'Sotuvchi' : 'Cara xaridori'}</span></div>
          <nav class="profile-nav" aria-label="Profil bo‘limlari">${Object.entries(labels).map(([id,label])=>`<a href="#${id}" data-profile-panel="${id}"><i class="fa fa-${icons[id]}" aria-hidden="true"></i>${label}${id==='saved'?'<span data-saved-count></span>':''}</a>`).join('')}</nav>
          <div class="profile-sidebar-bottom"><a href="support.html#help"><i class="fa fa-question-circle-o" aria-hidden="true"></i> Yordam</a><button type="button" id="logout-button"><i class="fa fa-sign-out" aria-hidden="true"></i> Hisobdan chiqish</button></div></aside>
          <div class="profile-content"><p id="profile-status" class="inline-status" role="status">Ma’lumotlar yuklanmoqda…</p><button class="button secondary" id="profile-retry" type="button" hidden>Qayta yuklash</button>
          <section id="profile-overview" class="profile-panel" aria-labelledby="heading-overview"><h2 id="heading-overview">Xush kelibsiz, <span data-profile-greeting></span>!</h2><div class="profile-stats">${[['orders','Buyurtmalar','shopping-bag'],['active','Jarayonda','truck'],['delivered','Yetkazilgan','check-circle-o'],['spent','To‘langan summa','credit-card']].map(([key,label,icon])=>`<div><i class="fa fa-${icon}" aria-hidden="true"></i><strong data-stat="${key}">—</strong><span>${label}</span></div>`).join('')}</div>
          <div class="profile-section-heading"><h3>So‘nggi buyurtmalar</h3><a href="orders.html">Barchasini ko‘rish <i class="fa fa-angle-right" aria-hidden="true"></i></a></div><div id="profile-orders"></div>
          <div class="profile-quick-links"><a href="#address" data-profile-panel="address"><i class="fa fa-map-marker" aria-hidden="true"></i><span>Manzilni saqlang<small>Keyingi xaridda avtomatik to‘ldiriladi</small></span><i class="fa fa-angle-right" aria-hidden="true"></i></a><a href="cart.html"><i class="fa fa-shopping-cart" aria-hidden="true"></i><span>Savatim<small>Tanlangan mahsulotlarga qaytish</small></span><i class="fa fa-angle-right" aria-hidden="true"></i></a></div>${user.role==='admin'?'<p class="info-notice">Sotuvchi kabineti: <a href="orders.html?admin=1">buyurtmalarni boshqarish</a>.</p>':''}</section>
          <section id="profile-info" class="profile-panel" aria-labelledby="heading-info" hidden><h2 id="heading-info">Shaxsiy ma’lumotlar</h2><p class="profile-description">Hisobingiz va bog‘lanish ma’lumotlari.</p><div id="profile-photo-controls"></div><form id="profile-info-form" class="commerce-form"><div class="field-grid"><label>Ism-familiya<input name="full_name" autocomplete="name" maxlength="80"></label><label>Foydalanuvchi nomi<input name="username" autocomplete="username" minlength="3" maxlength="30" pattern="[a-zA-Z0-9_.-]+" required></label><label>Email<input name="email" type="email" autocomplete="email" maxlength="150" required></label><label>Telefon<input name="phone" type="tel" autocomplete="tel" placeholder="+998 90 123 45 67" maxlength="25"></label></div><label>Joriy parol<input name="current_password" type="password" autocomplete="current-password" maxlength="128" aria-describedby="profile-identity-hint"></label><small id="profile-identity-hint">Foydalanuvchi nomi yoki emailni o‘zgartirganda kerak.</small><div class="action-row"><button class="button" type="submit">O‘zgarishlarni saqlash</button><button type="reset" class="button secondary">Bekor qilish</button></div><p class="inline-status" role="status"></p></form><p class="profile-description">Ro‘yxatdan o‘tilgan sana: <span id="profile-created">—</span></p></section>
          <section id="profile-address" class="profile-panel" aria-labelledby="heading-address" hidden><h2 id="heading-address">Yetkazib berish manzili</h2><p class="profile-description">Bu manzil keyingi buyurtmada taklif qilinadi.</p><form id="profile-address-form" class="commerce-form"><div id="profile-location-controls"></div><label>Shahar yoki tuman<input name="city" autocomplete="address-level2" maxlength="80" placeholder="Masalan, Termiz"></label><label>Manzil<textarea name="address" autocomplete="street-address" maxlength="400" rows="4" placeholder="Ko‘cha, uy, xonadon va mo‘ljal"></textarea></label><div class="action-row"><button class="button" type="submit">Manzilni saqlash</button><button class="button secondary" type="reset">Bekor qilish</button></div><p class="inline-status" role="status"></p></form></section>
          <section id="profile-saved" class="profile-panel" aria-labelledby="heading-saved" hidden><div class="profile-section-heading"><h2 id="heading-saved">Saqlangan mahsulotlar</h2><a href="shop.html?wishlist=1">Katalogda ko‘rish</a></div><p class="profile-description">Saqlanganlar shu brauzerda saqlanadi.</p><div id="profile-wishlist" class="profile-products"></div><p id="profile-saved-status" class="inline-status" role="status"></p></section>
          <section id="profile-reviews" class="profile-panel" aria-labelledby="heading-reviews" hidden><h2 id="heading-reviews">Sharhlarim</h2><p class="profile-description">Yetkazilgan va to‘langan mahsulotlarga baho berishingiz mumkin.</p><div id="profile-review-list"></div><a href="orders.html" class="button secondary">Xaridlarimni ko‘rish</a></section>
          <section id="profile-security" class="profile-panel" aria-labelledby="heading-security" hidden><h2 id="heading-security">Xavfsizlik</h2><h3>Parolni almashtirish</h3><form id="profile-password-form" class="commerce-form"><label>Joriy parol<input name="current_password" type="password" autocomplete="current-password" required maxlength="128"></label><div class="field-grid"><label>Yangi parol<input name="new_password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label><label>Yangi parolni takrorlang<input name="confirm_password" type="password" autocomplete="new-password" minlength="8" maxlength="128" required></label></div><label class="choice-row"><input type="checkbox" id="profile-show-passwords"><span>Parollarni ko‘rsatish</span></label><small>8–128 belgi. Parol yangilanganda boshqa seanslar yopiladi.</small><button type="submit" class="button">Parolni yangilash</button><p class="inline-status" role="status"></p></form>
          <div class="profile-security-block"><h3>Faol seanslar</h3><p><strong id="profile-sessions">—</strong> ta faol seans. Joriy brauzerda kirish saqlanadi.</p><button class="button secondary" id="profile-revoke" type="button">Boshqa seanslardan chiqish</button></div><div class="profile-security-block"><h3>Ma’lumotlarim</h3><p>Profil, buyurtmalar va sharhlaringizni Excel faylida oling.</p><button class="button secondary" id="profile-export" type="button"><i class="fa fa-download" aria-hidden="true"></i> Excel faylini yuklab olish</button></div><p id="profile-security-status" class="inline-status" role="status"></p></section>
          </div></div></div>`;
        const $ = selector => root.querySelector(selector);
        const $$ = selector => [...root.querySelectorAll(selector)];
        function status(node, message, error=false) { node.textContent=message; node.className='inline-status '+(error?'error':'success'); }
        function failure(node,error) {
            status(node,error.message,true);
            if(error.status===401) {
                loaded=false;
                const link=document.createElement('a');link.href='login.html?next=profile.html#signin';link.textContent='Hisobga qayta kirish';link.className='button';
                node.append(document.createTextNode(' '),link);
                $$('#profile-info-form input,#profile-info-form button,#profile-address-form textarea,#profile-address-form input,#profile-address-form button,#profile-password-form input,#profile-password-form button,#profile-revoke,#profile-export').forEach(control=>{control.disabled=true;});
            }
        }
        function selectPanel(focus=false) {
            const selected=Object.hasOwn(labels,location.hash.slice(1))?location.hash.slice(1):'overview';
            $$('.profile-panel').forEach(panel=>{panel.hidden=panel.id!=='profile-'+selected;});
            $$('.profile-nav a').forEach(link=>{if(link.dataset.profilePanel===selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
            if(selected==='address'&&loaded)locationControl?.show();
            if(focus){const heading=$('#heading-'+selected);heading.tabIndex=-1;heading.focus({preventScroll:true});}
        }
        const onHash=()=>selectPanel(true);
        root.addEventListener('click',event=>{
            const link=event.target.closest('a[data-profile-panel]');
            if(!link)return;
            event.preventDefault();location.hash=link.dataset.profilePanel;selectPanel(true);
        });
        window.addEventListener('hashchange',onHash);
        function identity() {
            const name=profile.details.full_name||profile.user.username;
            $('[data-profile-name]').textContent=name;
            $('[data-profile-email]').textContent=profile.user.email;
            $('[data-profile-greeting]').textContent=name;
            const avatar=$('.profile-avatar');
            avatar.dataset.photoHint=profile.avatar_version?'Rasmni o‘zgartirish':'Rasm qo‘yish';
            avatar.title=avatar.dataset.photoHint;
            avatar.setAttribute('aria-label',avatar.dataset.photoHint);
            avatar.replaceChildren();
            if(profile.avatar_version&&avatarUrl){const img=document.createElement('img');img.src=avatarUrl(profile.avatar_version);img.alt='Profil rasmi';img.addEventListener('error',()=>{avatar.textContent=name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();},{once:true});avatar.append(img);}
            else avatar.textContent=name.trim().split(/\s+/).map(s=>s[0]).slice(0,2).join('').toUpperCase();
            photoControl?.set(profile.avatar_version);
            $('#profile-created').textContent=date(profile.created);
            $('#profile-sessions').textContent=profile.sessions;
            onUser(profile.user);
        }
        function fillForms() {
            for(const [id,values] of [['profile-info-form',{...profile.user,...profile.details}],['profile-address-form',profile.details]]) {
                const form=$('#'+id);
                for(const input of form.querySelectorAll('input,textarea')) { const value=input.name==='current_password'?'':values[input.name]??'';input.value=value;input.defaultValue=value; }
            }
        }
        function wishlist() {
            const saved=core.wishlist();
            $('[data-saved-count]').textContent=saved.length;
            $('#profile-wishlist').innerHTML=saved.length?saved.map(id=>{const p=core.product(id);return `<article class="profile-product"><a href="sproduct.html?id=${esc(id)}"><img src="${esc(p.image)}" alt="${esc(p.name)}"><h3>${esc(p.name)}</h3></a><p>${core.money(p.price)}</p><div class="profile-product-actions"><label class="sr-only" for="saved-size-${esc(id)}">${esc(p.name)} o‘lchami</label><select id="saved-size-${esc(id)}">${p.sizes.map(s=>`<option>${esc(s)}</option>`).join('')}</select><button type="button" class="button" data-saved-add="${esc(id)}" aria-label="${esc(p.name)} savatga qo‘shish"><i class="fa fa-shopping-cart" aria-hidden="true"></i></button><button type="button" class="button secondary" data-saved-remove="${esc(id)}" aria-label="${esc(p.name)} saqlanganlardan olib tashlash"><i class="fa fa-heart" aria-hidden="true"></i></button></div></article>`;}).join(''):'<div class="profile-empty"><i class="fa fa-heart-o" aria-hidden="true"></i><h3>Hali mahsulot saqlanmagan</h3><p>Mahsulot sahifasida «Saqlab qo‘yish»ni bosing.</p><a class="button" href="shop.html">Katalogni ochish</a></div>';
        }
        function summary() {
            $$('[data-stat]').forEach(el=>{const key=el.dataset.stat;el.textContent=key==='spent'?core.money(profile.stats[key]||0):profile.stats[key]||0;});
            $('#profile-orders').innerHTML=profile.recent_orders.length?profile.recent_orders.map(o=>`<a class="profile-order" href="orders.html?order=${esc(o.id)}"><span><strong>${esc(o.id)}</strong><small>${date(o.created)} · ${o.items.reduce((n,i)=>n+i.quantity,0)} dona</small></span><span class="order-status ${esc(o.status)}">${esc(states[o.status]||o.status)}</span><strong>${core.money(o.total)}</strong><i class="fa fa-angle-right" aria-hidden="true"></i></a>`).join(''):'<div class="profile-empty"><i class="fa fa-shopping-bag" aria-hidden="true"></i><h3>Ilk xaridingizni kutamiz</h3><p>Buyurtmalaringiz shu yerda ko‘rinadi.</p><a class="button" href="shop.html">Mahsulotlarni ko‘rish</a></div>';
            $('#profile-review-list').innerHTML=profile.reviews.length?profile.reviews.map(r=>{const p=core.product(r.product_id);return `<article class="profile-review"><a href="sproduct.html?id=${esc(r.product_id)}">${esc(p?.name||r.product_id)}</a><span class="profile-stars" aria-label="5 dan ${r.rating} baho">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span><p>${esc(r.body)}</p><small>${date(r.updated)}</small> · <a href="sproduct.html?id=${esc(r.product_id)}#product-reviews">Sharhni tahrirlash</a></article>`;}).join(''):'<div class="profile-empty"><i class="fa fa-star-o" aria-hidden="true"></i><h3>Hali sharh yozmagansiz</h3><p>Xaridingizdan keyin fikringiz bilan bo‘lishing.</p></div>';
        }
        async function load() {
            if($('#profile-retry').disabled)return;
            loaded=false;
            $('#profile-retry').disabled=true;
            $('#profile-retry').hidden=true;
            status($('#profile-status'),'Ma’lumotlar yuklanmoqda…');
            $$('#profile-info-form input,#profile-info-form button,#profile-address-form textarea,#profile-address-form input,#profile-address-form button').forEach(control=>{control.disabled=true;});
            try {
                const result=await api('/profile');
                if(!result.user||result.user.id!==user.id||!result.details||typeof result.details!=='object')throw new Error('Profil ma’lumotlari yuklanmadi. Qayta urinib ko‘ring.');
                profile={...result,stats:result.stats||{},recent_orders:Array.isArray(result.recent_orders)?result.recent_orders:[],reviews:Array.isArray(result.reviews)?result.reviews:[]};
                identity();fillForms();locationControl?.set(profile.details);summary();loaded=true;
                if(location.hash==='#address')locationControl?.show();
                $$('#profile-password-form input,#profile-password-form button,#profile-revoke,#profile-export').forEach(control=>{control.disabled=false;});
                status($('#profile-status'),'');
            }
            catch(error){loaded=false;failure($('#profile-status'),error);$('#profile-retry').hidden=false;}
            finally{$('#profile-retry').disabled=false;}
            $$('#profile-info-form input,#profile-info-form button,#profile-address-form textarea,#profile-address-form input,#profile-address-form button').forEach(control=>{control.disabled=!loaded;});
        }
        async function action(button,node,work) {
            if(button.disabled)return;
            button.disabled=true;status(node,'Bajarilmoqda…');
            try{await work();}catch(error){failure(node,error);}finally{if(button.id==='logout-button'||loaded)button.disabled=false;}
        }
        for(const id of ['info','address']) {
            const form=$('#profile-'+id+'-form');
            form.addEventListener('submit',event=>{event.preventDefault();if(!loaded||!form.reportValidity())return;action(form.querySelector('[type="submit"]'),form.querySelector('[role="status"]'),async()=>{
                const payload={...profile.user,...profile.details,...Object.fromEntries(new FormData(form)),...(id==='address'?locationControl?.value():{})};
                profile=await api('/profile',{method:'PATCH',body:payload});identity();
                // Preserve unsaved edits in the other form.
                for(const input of form.querySelectorAll('input,textarea')) {const value=input.name==='current_password'?'':({...profile.user,...profile.details})[input.name]??'';input.value=value;input.defaultValue=value;}
                if(id==='address')locationControl.set(profile.details);
                status(form.querySelector('[role="status"]'),'Saqlandi.');
            });});
        }
        const passwordForm=$('#profile-password-form');
        $('#profile-show-passwords').addEventListener('change',event=>passwordForm.querySelectorAll('input[name*="password"]').forEach(input=>{input.type=event.target.checked?'text':'password';}));
        passwordForm.addEventListener('submit',event=>{event.preventDefault();const fields=passwordForm.elements;fields.confirm_password.setCustomValidity(fields.new_password.value===fields.confirm_password.value?'':'Parollar mos kelmadi.');if(!passwordForm.reportValidity())return;action(passwordForm.querySelector('[type="submit"]'),passwordForm.querySelector('[role="status"]'),async()=>{await api('/profile/password',{method:'POST',body:{current_password:fields.current_password.value,new_password:fields.new_password.value}});passwordForm.reset();passwordForm.querySelectorAll('input[name*="password"]').forEach(input=>{input.type='password';});$('#profile-sessions').textContent='1';status(passwordForm.querySelector('[role="status"]'),'Parol yangilandi. Boshqa seanslar yopildi.');});});
        passwordForm.addEventListener('input',()=>passwordForm.elements.confirm_password.setCustomValidity(''));
        $('#profile-revoke').addEventListener('click',event=>action(event.currentTarget,$('#profile-security-status'),async()=>{await api('/profile/sessions/revoke',{method:'POST',body:{}});$('#profile-sessions').textContent='1';status($('#profile-security-status'),'Boshqa seanslar yopildi.');}));
        $('#profile-export').addEventListener('click',event=>action(event.currentTarget,$('#profile-security-status'),async()=>{const data=await api('/profile/export',{download:true});const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download='cara-profil.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);status($('#profile-security-status'),'Excel fayli yuklab olindi.');}));
        $('#logout-button').addEventListener('click',event=>action(event.currentTarget,$('#profile-status'),async()=>{await api('/logout',{method:'POST',body:{}});location.href='login.html#signin';}));
        $('#profile-retry').addEventListener('click',load);
        $('#profile-wishlist').addEventListener('click',event=>{const add=event.target.closest('[data-saved-add]'),remove=event.target.closest('[data-saved-remove]');if(add&&core.add(add.dataset.savedAdd,$('#saved-size-'+add.dataset.savedAdd).value,1,false))status($('#profile-saved-status'),'Savatga qo‘shildi.');if(remove&&core.save('wishlist',core.wishlist().filter(id=>id!==remove.dataset.savedRemove))){wishlist();status($('#profile-saved-status'),'Saqlanganlardan olindi.');}});
        const onStorage=event=>{if(event.key===null||event.key==='cara.connections.wishlist')wishlist();};
        window.addEventListener('storage',onStorage);
        dispose=()=>{locationControl?.destroy();photoControl?.destroy();window.removeEventListener('hashchange',onHash);window.removeEventListener('storage',onStorage);};
        locationControl=window.CARA_LOCATION.mount($('#profile-location-controls'),{api,onAddress(place){const form=$('#profile-address-form');form.elements.city.value=place.city;form.elements.address.value=place.address;},onBusy(busy){$('#profile-address-form [type="submit"]').disabled=busy||!loaded;}});
        photoControl=window.CARA_PHOTO.mount($('#profile-photo-controls'),{api,avatarUrl:avatarUrl||((version)=>'/api/profile/avatar?v='+encodeURIComponent(version)),onSaved(version){profile.avatar_version=version;identity();}});
        $('.profile-avatar').tabIndex=0;$('.profile-avatar').setAttribute('role','button');$('.profile-avatar').removeAttribute('aria-hidden');
        $('.profile-avatar').addEventListener('click',()=>photoControl.choose());
        $('.profile-avatar').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();photoControl.choose();}});
        $('#profile-address-form').addEventListener('reset',()=>queueMicrotask(()=>locationControl.set(profile.details)));
        identity();wishlist();selectPanel();
        await load();
    }
})();
