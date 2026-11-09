(() => {
    'use strict';
    const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
    const store = window.CARA_DATA.store, core = window.CARA_FRONTEND;
    const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = core.money, page = location.pathname.split('/').pop();
    const localHost = ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    const liveServer = localHost && ['5500','5501'].includes(location.port);
    const apiBase = new URL(store.apiBaseUrl || (liveServer ? `${location.protocol}//${location.hostname}:5502/api` : '/api'), location.origin).href.replace(/\/+$/, '');
    let user = null, csrf = null, config = null;
    let sessionReady;
    const statuses = {pending:'Sotuvchi tasdig‘i kutilmoqda',confirmed:'Tasdiqlangan',shipped:'Jo‘natilgan',delivered:'Yetkazilgan',cancelled:'Bekor qilingan'};
    const paymentNames = {cash:'Yetkazilganda naqd',click:'Click',payme:'Payme'};
    const paymentStatuses = {unpaid:'To‘lanmagan',paid:'To‘langan',refunded:'Pul qaytarilgan'};
    const safeNext = () => {
        const next = new URLSearchParams(location.search).get('next');
        return ['checkout.html','orders.html','cart.html','shop.html','profile.html'].includes(next) ? next : null;
    };
    async function api(path, {method='GET', body, key, download=false} = {}) {
        const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
        try {
            const headers = {};
            if (method !== 'GET') { headers['Content-Type'] = 'application/json'; if (csrf) headers['X-CSRF-Token'] = csrf; }
            if (key) headers['Idempotency-Key'] = key;
            const response = await fetch(apiBase + path, {method, headers, credentials:'include', signal:controller.signal, ...(body ? {body:JSON.stringify(body)} : {})});
            if (!response.ok) {
                const value = await response.json().catch(() => null);
                const fallback = {401:'Seans tugagan. Hisobingizga qayta kiring.',403:'Ruxsat yetarli emas yoki xavfsizlik belgisi eskirgan. Sahifani yangilang.',429:'So‘rovlar ko‘payib ketdi. Birozdan keyin qayta urinib ko‘ring.'};
                const error = new Error(typeof value?.error === 'string' ? value.error : fallback[response.status] || 'Xizmat so‘rovni bajara olmadi. Qayta urinib ko‘ring.');
                error.status = response.status;
                throw error;
            }
            if (download) return await response.blob();
            const value = await response.json().catch(() => null);
            if (!value || typeof value !== 'object' || Array.isArray(value)) {
                const error = new Error('Xizmat javobi noto‘g‘ri. Sahifani yangilang yoki qayta urinib ko‘ring.');
                error.status = 502;
                throw error;
            }
            return value;
        } catch (error) {
            if (error.status) throw error;
            const unavailable = new Error('Xizmatga ulanib bo‘lmadi. Qayta urinib ko‘ring.');
            unavailable.serviceUnavailable = true;
            throw unavailable;
        } finally { clearTimeout(timer); }
    }
    function status(node, message, error=false) {
        node.textContent = message; node.className = `inline-status ${error ? 'error' : 'success'}`;
    }
    function socialElement(entry, directory=false) {
        const icon = entry.icon ? `<i class="fa ${esc(entry.icon)}" aria-hidden="true"></i>` : `<span class="social-initials" aria-hidden="true">${esc(entry.initials || entry.label.slice(0,2))}</span>`;
        const control = `<a class="social-link" href="${esc(entry.url)}" aria-label="${esc(entry.label)}" title="${esc(entry.label)}" target="_blank" rel="noopener noreferrer">${icon}</a>`;
        const hint = entry.id === 'whatsapp' ? 'Xabar yozish' : ['instagram','telegram'].includes(entry.id) ? '@' + store.username : 'Profilni ochish';
        return directory ? `<div class="social-entry">${control}<span>${esc(entry.label)}<small>${esc(hint)}</small></span></div>` : control;
    }
    const socials = Array.isArray(store.socialLinks) ? store.socialLinks.filter(entry => /^https?:\/\//.test(entry.url || '')) : [];
    $$('.follow .icon').forEach(node => { node.innerHTML = socials.map(entry => socialElement(entry)).join(''); });
    const directory = $('#social');
    if (directory) {
        const grid = document.createElement('div'); grid.className='social-directory';
        grid.innerHTML=socials.map(entry=>socialElement(entry,true)).join(''); directory.append(grid);
    }
    async function renderAccount() {
        if (!user || !$('.account-page')) return;
        if (!window.CARA_PROFILE) throw new Error('Profil fayllari yuklanmadi. Sahifani yangilang.');
        await window.CARA_PROFILE.render({user, api, avatarUrl:version=>apiBase+'/profile/avatar?v='+encodeURIComponent(version), onUser(value) {
            user=value;
            $$('#account a').forEach(link=>{link.title=user.username;link.setAttribute('aria-label','Hisob: '+user.username);});
        }});
    }
    async function authenticate(form) {
        const button = form.querySelector('button[type="submit"]');
        if (button.disabled) return;
        let feedback = $('#auth-feedback');
        if (!feedback) { feedback=document.createElement('p');feedback.id='auth-feedback';feedback.className='account-feedback inline-status';feedback.setAttribute('role','status');$('.account-page').append(feedback); }
        const payload = Object.fromEntries(new FormData(form));
        button.disabled=true; status(feedback,'Tekshirilmoqda…');
        try {
            // Django also requires a CSRF token for anonymous login/register.
            const session = await api('/me');
            csrf = session.csrf;
            const response=await api(form.id==='RegForm'?'/register':'/login',{method:'POST',body:payload});
            user=response.user;csrf=response.csrf;
            location.href=safeNext()||'profile.html';
        } catch(error) { status(feedback,error.message,true); }
        finally { const password=form.querySelector('input[type="password"]');if(password)password.value='';button.disabled=false; }
    }
    window.CARA_COMMERCE={authenticate};
    function accountNeeded(root, next) {
        root.innerHTML=`<div class="commerce-card"><h2>Hisobingizga kiring</h2><p>Buyurtma va xaridni tasdiqlash uchun shaxsiy hisob kerak.</p><a class="button" href="login.html?next=${next}#signin">Kirish yoki hisob yaratish</a></div>`;
    }
    function summary(items) {
        const subtotal=items.reduce((sum,item)=>sum+core.product(item.id).price*item.quantity,0);
        return `<h2>Buyurtma tarkibi</h2><ul class="order-summary-list">${items.map(item=>{const p=core.product(item.id);return `<li><span><img src="${p.image}" alt="">${esc(p.name)}<br><small>${esc(item.size)} · ${item.quantity} dona</small></span><strong>${money(p.price*item.quantity)}</strong></li>`;}).join('')}</ul><p class="order-total"><span>Mahsulotlar:</span><strong>${money(subtotal)}</strong></p><p>Yetkazib berish narxi sotuvchi tomonidan alohida tasdiqlanadi. Olib ketish narxi: 0 so‘m.</p>`;
    }
    function renderCheckout() {
        const root=$('#checkout-content');if(!root)return;
        if(!user)return accountNeeded(root,'checkout.html');
        const items=core.cart();
        if(!items.length){root.innerHTML='<div class="commerce-card"><h2>Savatingiz bo‘sh</h2><a class="button" href="shop.html">Katalogga o‘tish</a><a href="orders.html">Buyurtmalarim</a></div>';return;}
        const methods=config.payment_methods;
        root.innerHTML=`<div class="commerce-layout"><div class="commerce-card"><h2>Qabul qiluvchi ma’lumotlari</h2><form id="checkout-form" class="commerce-form"><div class="field-grid"><label>Ism-familiya<input name="recipient" autocomplete="name" minlength="2" maxlength="80" required></label><label>Telefon<input name="phone" type="tel" autocomplete="tel" placeholder="+998 90 123 45 67" pattern="\\+998[0-9]{9}" title="+998 bilan va bo‘shliqsiz kiriting" required></label></div><label>Shahar<input name="city" value="${esc(store.city)}" autocomplete="address-level2" minlength="2" maxlength="80" required></label><label>Yetkazib berish<select name="delivery_method"><option value="pickup">Olib ketish — sotuvchi bilan kelishiladi</option><option value="courier">Yetkazib berish — narxi tasdiqlanadi</option></select></label><label>Manzil<input name="address" autocomplete="street-address" maxlength="400" placeholder="Ko‘cha, uy, mo‘ljal (yetkazib berish uchun)"></label><fieldset><legend>To‘lov usuli</legend>${['cash','click','payme'].map(method=>`<label class="choice-row ${methods[method]?'':'disabled'}"><input type="radio" name="payment_method" value="${method}" ${method==='cash'?'checked':''} ${methods[method]?'':'disabled'}><span>${paymentNames[method]}<small>${method==='cash'?'Mahsulotni olganda to‘laysiz.':methods[method]?'Sotuvchi narxni tasdiqlagach, himoyalangan to‘lov sahifasi ochiladi.':'Savdogar rekvizitlari hali ulanmagan.'}</small></span></label>`).join('')}</fieldset><label>Qo‘shimcha izoh<textarea name="notes" rows="3" maxlength="1000" placeholder="Yetkazib berish yoki o‘lcham bo‘yicha izoh"></textarea></label><p class="info-notice">${config.prices_are_samples?'Katalog narxlari hozircha namuna. ':''}Buyurtma avval so‘rov sifatida saqlanadi. Sotuvchi mavjudlik, mahsulot narxi va yetkazib berish summasini tasdiqlaydi.</p><label class="choice-row"><input type="checkbox" name="acknowledgement" required><span>Yakuniy summa sotuvchi tasdig‘idan so‘ng ma’lum bo‘lishini tushundim.</span></label><button class="button" type="submit">Buyurtmani yuborish</button><p id="checkout-status" class="inline-status" role="status"></p></form></div><aside class="commerce-card">${summary(items)}<a href="cart.html">Savatni tahrirlash</a></aside></div>`;
        const form=$('#checkout-form');
        let deliveryPoint=null;
        const locationBox=document.createElement('div');locationBox.className='checkout-location';locationBox.hidden=true;
        locationBox.innerHTML='<label class="choice-row"><input type="checkbox" name="use_saved_location" checked><span>Saqlangan xarita nuqtasini yetkazishga qo‘shish</span></label><a target="_blank" rel="noopener noreferrer">Nuqtani xaritada ko‘rish</a>';
        form.elements.address.closest('label').after(locationBox);
        // Saved account details are a convenience; never overwrite an edited field.
        api('/profile').then(profile=>{
            if(!form.isConnected)return;
            const details=profile.details||{};
            for(const [name,value] of Object.entries({recipient:details.full_name,phone:details.phone,city:details.city,address:details.address})) {
                const input=form.elements[name];
                if(value&&!input.dataset.edited)input.value=value;
            }
            if(Number.isFinite(details.latitude)&&Number.isFinite(details.longitude)&&!form.elements.address.dataset.edited&&!form.elements.city.dataset.edited){
                deliveryPoint={latitude:details.latitude,longitude:details.longitude};
                locationBox.querySelector('a').href=`https://www.google.com/maps?q=${details.latitude},${details.longitude}`;
                locationBox.hidden=form.elements.delivery_method.value!=='courier';
            }
        }).catch(()=>{});
        form.addEventListener('input',event=>{event.target.dataset.edited='true';if(['address','city'].includes(event.target.name)){deliveryPoint=null;locationBox.hidden=true;}});
        root.querySelector('aside').id = 'checkout-summary';
        form.elements.phone.addEventListener('input',()=>{
            let phone=form.elements.phone.value.replace(/[\s()-]/g,'');
            if(/^998\d{9}$/.test(phone))phone='+'+phone;
            form.elements.phone.value=phone;
        });
        form.elements.delivery_method.addEventListener('change',()=>{const courier=form.elements.delivery_method.value==='courier';form.elements.address.required=courier;form.elements.address.minLength=courier?5:0;locationBox.hidden=!courier||!deliveryPoint;});
        let busy=false,lastBody='',requestKey='';
        form.addEventListener('submit',async event=>{
            event.preventDefault();if(busy||!form.reportValidity())return;
            const fields=Object.fromEntries(new FormData(form));delete fields.acknowledgement;
            const includePoint=fields.delivery_method==='courier'&&form.elements.use_saved_location.checked&&deliveryPoint;
            delete fields.use_saved_location;
            if(includePoint)Object.assign(fields,deliveryPoint);
            const currentItems = core.cart();
            if (!currentItems.length) { status($('#checkout-status'),'Savatingiz bo‘sh. Avval mahsulot qo‘shing.',true); return; }
            const payload={...fields,items:currentItems};
            const serialized=JSON.stringify(payload);
            if(serialized!==lastBody){requestKey=crypto.randomUUID();lastBody=serialized;}
            busy=true;form.querySelector('button').disabled=true;status($('#checkout-status'),'Buyurtma saqlanmoqda…');
            try {
                // Remember only a digest and random key, never contact details.
                // A refresh after a lost response can safely retry the same request.
                const retryStorage = 'cara.checkout.retry.' + user.id;
                if (crypto.subtle && typeof TextEncoder === 'function') {
                    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
                    const fingerprint = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2,'0')).join('');
                    try {
                        const previous = JSON.parse(sessionStorage.getItem(retryStorage));
                        if (previous?.fingerprint === fingerprint && /^[a-zA-Z0-9_-]{8,100}$/.test(previous.key)) requestKey = previous.key;
                        sessionStorage.setItem(retryStorage, JSON.stringify({fingerprint,key:requestKey}));
                    } catch { /* In-memory retries still work when storage is blocked. */ }
                }
                const result=await api('/orders',{method:'POST',body:payload,key:requestKey});
                try { sessionStorage.removeItem(retryStorage); } catch {}
                // Another tab may have added products while the request was in flight.
                const remaining = core.cart().map(item => {
                    const submitted = currentItems.find(sent => sent.id === item.id && sent.size === item.size);
                    return {...item, quantity: Math.max(0, item.quantity - (submitted?.quantity || 0))};
                }).filter(item => item.quantity > 0);
                core.save('cart',remaining);core.updateCartLabels();location.href='orders.html?order='+encodeURIComponent(result.order.id);
            }catch(error){status($('#checkout-status'),error.message,true);busy=false;form.querySelector('button').disabled=false;}
        });
    }
    document.addEventListener('cara:cart-updated', () => {
        const container = $('#checkout-summary'), form = $('#checkout-form');
        if (!container || !form) return;
        const items = core.cart();
        container.innerHTML = (items.length ? summary(items) : '<h2>Savatingiz bo‘sh</h2><p>Katalogdan mahsulot qo‘shing.</p><a class="button" href="shop.html">Katalogga o‘tish</a>') + '<a href="cart.html">Savatni tahrirlash</a>';
        // Keep recipient details while synchronizing changes from another tab.
        status($('#checkout-status'),items.length ? 'Savat tarkibi yangilandi.' : 'Savatingiz bo‘sh. Avval mahsulot qo‘shing.',!items.length);
    });
    function orderCard(order,admin=false) {
        const next=order.status==='confirmed'&&order.delivery_method==='pickup'?'delivered':{pending:'confirmed',confirmed:'shipped',shipped:'delivered'}[order.status];
        let manage='';
        if(admin&&next)manage=`<form class="commerce-form order-manage" data-order="${esc(order.id)}" data-next="${next}"><h3>Sotuvchi tasdig‘i</h3>${next==='confirmed'?'<label>Yetkazib berish narxi (so‘m)<input type="number" name="shipping_fee" min="0" max="10000000" step="1" value="0" required></label><label class="choice-row"><input type="checkbox" name="approve_prices" required><span>Mahsulot mavjudligi va narxlarini tekshirdim.</span></label>':''}${next==='delivered'&&order.payment_method==='cash'?'<label class="choice-row"><input type="checkbox" name="cash_received" required><span>Mijoz mahsulotni oldi va naqd to‘lov qabul qilindi.</span></label>':''}<button class="button" type="submit">${next==='confirmed'?'Buyurtma va summani tasdiqlash':next==='shipped'?'Jo‘natilgan deb belgilash':'Yetkazilganini tasdiqlash'}</button><p class="inline-status" role="status"></p></form>`;
        if(admin&&['pending','confirmed'].includes(order.status))manage+=`<button class="button secondary cancel-order" type="button" data-order="${esc(order.id)}">Bekor qilish</button>`;
        const payable=order.payment_method!=='cash'&&order.pricing_confirmed&&order.status==='confirmed'&&order.payment_status==='unpaid';
        return `<article class="commerce-card order-card" id="${esc(order.id)}"><div class="order-heading"><h2>${esc(order.id)}</h2><span class="order-status ${order.status==='cancelled'?'cancelled':''}">${statuses[order.status]}</span></div><div class="order-meta"><span>Sana: ${new Date(order.created).toLocaleString('uz-UZ')}</span><span>To‘lov: ${paymentNames[order.payment_method]} · ${paymentStatuses[order.payment_status]}</span><span>Qabul qiluvchi: ${esc(order.recipient)}</span><span>Telefon: <a href="tel:${esc(order.phone)}">${esc(order.phone)}</a></span><span>Shahar: ${esc(order.city)}</span><span>${order.delivery_method==='pickup'?'Olib ketish':'Manzil: '+esc(order.address)}</span></div>${Number.isFinite(order.latitude)&&Number.isFinite(order.longitude)?`<p><a href="https://www.google.com/maps?q=${order.latitude},${order.longitude}" target="_blank" rel="noopener noreferrer"><i class="fa fa-map-marker" aria-hidden="true"></i> Yetkazib berish nuqtasi</a></p>`:''}<ul class="order-summary-list">${order.items.map(item=>`<li><span><a href="sproduct.html?id=${encodeURIComponent(item.product_id)}">${esc(item.name)}</a> · ${esc(item.size)} × ${item.quantity}</span><strong>${money(item.unit_price*item.quantity)}</strong></li>`).join('')}</ul><p>Yetkazib berish: ${order.shipping_fee===null?'Tasdiqlanadi':money(order.shipping_fee)}</p><p class="order-total"><span>${order.pricing_confirmed?'Tasdiqlangan jami':'Mahsulotlar summasi'}:</span><strong>${money(order.total)}</strong></p>${order.notes?`<p>Izoh: ${esc(order.notes)}</p>`:''}${!order.pricing_confirmed?'<p class="info-notice">Sotuvchi narx va mavjudlikni tasdiqlashi kutilmoqda. Hozircha hech qanday onlayn to‘lov olinmadi.</p>':''}${payable?`<button class="button pay-order" type="button" data-order="${esc(order.id)}">${paymentNames[order.payment_method]} orqali to‘lash</button><p class="inline-status payment-feedback" role="status"></p>`:''}${order.status==='delivered'?'<p class="info-notice">Xarid tasdiqlangan. Mahsulot sahifasida yulduzli baho va sharh qoldirishingiz mumkin.</p>':''}${manage}</article>`;
    }
    let adminView=new URLSearchParams(location.search).get('admin')==='1';
    async function renderOrders() {
        const root=$('#orders-content');if(!root)return;
        if(!user)return accountNeeded(root,'orders.html');
        if(user.role!=='admin')adminView=false;
        root.innerHTML='<p class="inline-status">Buyurtmalar yuklanmoqda…</p>';
        try {
            const result=await api('/orders'+(adminView?'?admin=1':''));
            root.innerHTML=`<div class="action-row"><a class="button secondary" href="shop.html">Katalog</a><button class="button secondary" id="refresh-orders" type="button">Yangilash</button>${user.role==='admin'?`<button class="button secondary" id="toggle-admin" type="button">${adminView?'Mening buyurtmalarim':'Barcha buyurtmalar — sotuvchi'}</button>`:''}</div><div class="order-list">${result.orders.map(order=>orderCard(order,adminView)).join('')||'<div class="commerce-card"><h2>Buyurtmalar hali yo‘q</h2><p>Savatga mahsulot qo‘shib, buyurtmani rasmiylashtiring.</p></div>'}</div>`;
            $('#refresh-orders').addEventListener('click',renderOrders);
            const requested = new URLSearchParams(location.search).get('order');
            const selected = result.orders.find(order => order.id === requested);
            if (selected) {
                const card = document.getElementById(selected.id);
                card.tabIndex = -1;
                card.focus({preventScroll:true});
                card.scrollIntoView?.({block:'start',behavior:'smooth'});
            }
            $('#toggle-admin')?.addEventListener('click',()=>{adminView=!adminView;renderOrders();});
            $$('.order-manage').forEach(form=>{ const order=result.orders.find(item=>item.id===form.dataset.order); if(order?.delivery_method==='pickup'&&form.elements.shipping_fee)form.elements.shipping_fee.readOnly=true; });
            $$('.order-manage').forEach(form=>form.addEventListener('submit',async event=>{
                event.preventDefault();if(!form.reportValidity())return;
                const button=form.querySelector('button');button.disabled=true;
                try { await api('/orders/'+form.dataset.order,{method:'PATCH',body:{status:form.dataset.next,shipping_fee:Number(form.elements.shipping_fee?.value||0),approve_prices:!!form.elements.approve_prices?.checked,cash_received:!!form.elements.cash_received?.checked}});await renderOrders(); }
                catch(error){status(form.querySelector('[role="status"]'),error.message,true);button.disabled=false;}
            }));
            $$('.cancel-order').forEach(button=>button.addEventListener('click',async()=>{
                if(!confirm('Buyurtmani bekor qilasizmi?'))return;
                button.disabled=true;
                try{await api('/orders/'+button.dataset.order,{method:'PATCH',body:{status:'cancelled'}});await renderOrders();}catch(error){core.message('Bekor qilinmadi',error.message);button.disabled=false;}
            }));
            $$('.pay-order').forEach(button=>button.addEventListener('click',async()=>{
                button.disabled=true;const feedback=button.parentElement.querySelector('.payment-feedback');
                try{const result=await api('/payment-link',{method:'POST',body:{order_id:button.dataset.order}});location.href=result.url;}
                catch(error){status(feedback,error.message,true);button.disabled=false;}
            }));
        }catch(error){root.innerHTML=`<div class="commerce-card"><p class="inline-status error">${esc(error.message)}</p><a href="orders.html">Qayta ochish</a></div>`;}
    }
    let reviewRequest=0;
    async function renderReviews(id) {
        const root=$('#product-reviews');if(!root)return;
        if(!core.product(id)){root.innerHTML='<h2>Sharhlar</h2><p>Mahsulot topilmadi.</p>';return;}
        const sequence=++reviewRequest;root.innerHTML='<h2>Mijozlar bahosi va sharhlari</h2><p>Sharhlar yuklanmoqda…</p>';
        try {
            const result=await api('/reviews?product='+encodeURIComponent(id));if(sequence!==reviewRequest)return;
            const own=result.own_review,can=result.can_review;
            root.innerHTML=`<h2>Mijozlar bahosi va sharhlari</h2><div class="rating-summary"><strong>${result.count?result.average.toFixed(1):'—'}</strong><span class="rating-caption">${result.count} ta baho · faqat tasdiqlangan xaridorlar</span></div><div class="review-layout"><div>${result.items.map(review=>`<article class="review-card"><strong>${esc(review.username)}</strong><span class="verified-label">✓ Mahsulotni olgan</span><div class="review-stars" aria-label="${review.rating} yulduz">${'★'.repeat(review.rating)}${'☆'.repeat(5-review.rating)}</div><p>${esc(review.body)}</p><span class="review-date">${new Date(review.updated).toLocaleDateString('uz-UZ')}</span></article>`).join('')||'<p>Bu mahsulotga hali sharh yozilmagan.</p>'}</div><div class="commerce-card"><h3>${own?'Baho va sharhingizni tahrirlang':'Baho va sharh qoldirish'}</h3><p>Faqat shu mahsulotni xarid qilib, qabul qilgan hisob egasi yozishi mumkin.</p>${!can?`<p class="info-notice">${user?'Buyurtma sotuvchi tomonidan «Yetkazilgan» va to‘langan deb tasdiqlangach bu bo‘lim ochiladi.':'Baho yozish uchun hisobga kiring va shu mahsulotni xarid qiling.'}</p>${!user?'<a href="login.html#signin">Hisobga kirish</a>':'<a href="orders.html">Buyurtmalarim</a>'}`:''}<form id="review-form" class="commerce-form"><fieldset ${can?'':'disabled'}><legend>Yulduzli baho</legend><div class="star-picker" role="radiogroup" aria-label="Mahsulot bahosi">${[1,2,3,4,5].map(rating=>`<div class="star-option"><input id="rating-${rating}" type="radio" name="rating" value="${rating}" aria-label="${rating} yulduz" ${own?.rating===rating?'checked':''} required><label for="rating-${rating}" class="${own&&own.rating>=rating?'is-active':''}" aria-hidden="true">★</label></div>`).join('')}</div><label for="review-text">Sharhingiz</label><textarea id="review-text" name="body" rows="5" minlength="5" maxlength="2000" required>${esc(own?.body||'')}</textarea><p class="inline-status">Foydalanuvchi nomingiz va sharhingiz hammaga ko‘rinadi.</p><button class="button" type="submit">${own?'Yangilash':'Sharhni yuborish'}</button></fieldset><p class="inline-status" id="review-feedback" role="status"></p></form></div></div>`;
            const form=$('#review-form');
            form.addEventListener('change',()=>{const rating=Number(form.elements.rating.value);$$('.star-option label').forEach((label,index)=>label.classList.toggle('is-active',index<rating));});
            form.addEventListener('submit',async event=>{
                event.preventDefault();if(!can||!form.reportValidity())return;
                const button=form.querySelector('button');button.disabled=true;
                try{await api('/reviews',{method:'POST',body:{product_id:id,rating:Number(form.elements.rating.value),body:form.elements.body.value}});await renderReviews(id);await loadRatings();}
                catch(error){status($('#review-feedback'),error.message,true);button.disabled=false;}
            });
            const summary=$('.product-rating-summary');if(summary)summary.textContent=result.count?`${result.average.toFixed(1)} / 5 · ${result.count} ta xaridor bahosi`:'Hali baholanmagan';
        }catch(error){if(sequence===reviewRequest)root.innerHTML=`<h2>Mijozlar sharhlari</h2><p>${esc(error.message)}</p><p>Baho berish huquqi server orqali tekshiriladi.</p>`;}
    }
    async function loadRatings() {
        try {
            const {ratings}=await api('/ratings');
            $$('.pro').forEach(card=>{
                const stats=ratings[card.dataset.productId],average=stats?.average||0,stars=card.querySelector('.star');
                if(!stars)return;stars.setAttribute('aria-label',stats?`${average.toFixed(1)} / 5, ${stats.count} ta baho`:'Hali baholanmagan');stars.title=stars.getAttribute('aria-label');
                [...stars.querySelectorAll('i')].forEach((icon,index)=>{icon.className='fa '+(average>=index+1?'fa-star':average>=index+.5?'fa-star-half-o':'fa-star-o');});
            });
        }catch{}
    }
    if(page==='sproduct.html') {
        const details=$('.single-pro-details');
        const buy=document.createElement('button');buy.type='button';buy.className='normal buy-now';buy.textContent='Hozir xarid qilish';
        buy.disabled=!core.product(new URLSearchParams(location.search).get('id')||'f1');
        $('[data-product-add]').after(document.createTextNode(' '),buy);
        buy.addEventListener('click',()=>{const id=new URLSearchParams(location.search).get('id')||'f1';if(core.add(id,details.querySelector('select').value,Number(details.querySelector('input[type="number"]').value),false))location.href='checkout.html';});
        const rating=document.createElement('p');rating.className='product-rating-summary';details.querySelector('h2').after(rating);
        document.addEventListener('cara:product-selected',event=>renderReviews(event.detail.id));
    }
    let starting = false;
    async function start() {
        if (starting) return;
        starting = true;
        const retry = $('#retry-commerce');
        if (retry) { retry.disabled = true; retry.textContent = 'Ulanmoqda…'; }
        try {
            sessionReady=api('/me');
            const session=await sessionReady;
            user=session.user;csrf=session.csrf;
            if(user){
                $$('#account a').forEach(link=>{link.title=user.username;link.setAttribute('aria-label','Hisob: '+user.username);});
                if(page==='login.html')location.replace(safeNext()||'profile.html');
                else if(page==='profile.html')await renderAccount();
            }
            if(page==='profile.html'&&!user)accountNeeded($('#profile-content'),'profile.html');
            if(page==='checkout.html') {
                if(user)config=await api('/config');
                renderCheckout();
            }
            if(page==='orders.html')await renderOrders();
        }catch(error){
            const root=$('#checkout-content')||$('#orders-content')||$('#profile-content');
            if(root) {
                const local = error.serviceUnavailable && ['localhost','127.0.0.1','[::1]'].includes(location.hostname);
                root.innerHTML=`<div class="commerce-card"><h2>Xizmat vaqtincha mavjud emas</h2><p role="status">${esc(error.message)}</p>${local?'<p>Loyiha papkasidagi <code>start.cmd</code> faylini oching yoki terminalda <code>python server.py</code> buyrug‘ini bajaring. Keyin «Qayta ulanish» tugmasini bosing.</p>':''}<div class="action-row"><button class="button" id="retry-commerce" type="button">Qayta ulanish</button><a href="cart.html">Savatga qaytish</a></div></div>`;
                $('#retry-commerce').addEventListener('click',start);
            }
        } finally {
            starting = false;
        }
        if(page==='sproduct.html')await renderReviews(new URLSearchParams(location.search).get('id')||'f1');
        await loadRatings();
    }
    start();
})();
