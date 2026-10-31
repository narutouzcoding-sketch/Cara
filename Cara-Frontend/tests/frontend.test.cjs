const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const code = name => fs.readFileSync(path.join(root, name), 'utf8');
const buyer = { id: 1, username: 'test_buyer', email: 'buyer@example.test', role: 'customer' };
const emptyReviews = { items: [], count: 0, average: 0, can_review: false, own_review: null };
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };

async function open(file, { query = '', origin = 'http://localhost:5502', user = null, reviews = emptyReviews, values = {}, sessionValues = {}, handler, configure } = {}) {
    const calls = [], errors = [], console = new VirtualConsole();
    console.on('jsdomError', error => { if (!error.message.includes('navigation to another Document')) errors.push(error); });
    const dom = new JSDOM(code(file), { url: `${origin}/${file}${query}`, runScripts: 'outside-only', virtualConsole: console });
    const w = dom.window, d = w.document;
    w.alert = () => {};
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    for (const [key, value] of Object.entries(values)) w.localStorage.setItem('cara.connections.' + key, JSON.stringify(value));
    for (const [key, value] of Object.entries(sessionValues)) w.sessionStorage.setItem(key, value);
    w.fetch = async (url, options) => {
        const pathname = new URL(url).pathname;
        calls.push({ url, pathname, options });
        let result = handler ? await handler(pathname, options) : undefined;
        if (!result) {
            result = pathname === '/api/me' ? { user, csrf: user ? 'test-csrf' : null }
                : pathname === '/api/config' ? { payment_methods: { cash: true, click: false, payme: false }, prices_are_samples: true }
                : pathname === '/api/reviews' ? reviews
                : pathname === '/api/ratings' ? { ratings: {} }
                : pathname === '/api/orders' ? { orders: [] }
                : pathname === '/api/profile' ? {user,details:{full_name:'',phone:'',city:'',address:''},stats:{orders:0,active:0,delivered:0,spent:0},recent_orders:[],reviews:[],sessions:1,created:1793000000000}
                : {};
        }
        if (typeof result.json === 'function') return result;
        return { ok: true, status: 200, json: async () => result, blob:async()=>new w.Blob(['PK-test-excel'],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}) };
    };
    for (const script of [...d.scripts].filter(script => !script.src)) w.eval(script.textContent);
    w.eval(code('store-data.js'));
    if (configure) configure(w.CARA_DATA,w);
    w.eval(code('script.js'));
    if (d.querySelector('script[src="profile.js"]')) {
        w.eval(code('profile-location.js'));
        w.eval(code('profile-photo.js'));
        w.eval(code('profile.js'));
    }
    w.eval(code('commerce.js'));
    await flush();
    assert.deepEqual(errors, []);
    return { w, d, calls, errors, close: () => w.close() };
}
function fire(s, node, name) { node.dispatchEvent(new s.w.Event(name, { bubbles: true, cancelable: true })); }

const profileFixture = (details = {}) => ({user:buyer, details:{full_name:'Test Xaridor',phone:'+998901234567',city:'Termiz',address:'Test ko‘chasi 10',...details},stats:{orders:2,active:1,delivered:1,spent:169000},recent_orders:[],reviews:[],sessions:2,created:1793000000000});

test('choosing a named place fills the address, saves the point without showing coordinates and supports reset', async () => {
    let saved=profileFixture({latitude:37.224,longitude:67.278});
    const place={latitude:40.1,longitude:65.2,city:'Test shahar',address:'Test shahar, Yangi ko‘cha'};
    const s=await open('profile.html',{user:buyer,handler:(p,options)=>{if(p==='/api/profile/location')return {places:[place]};if(p!=='/api/profile')return;if(options.method==='PATCH'){const body=JSON.parse(options.body);saved={...saved,details:{...saved.details,...body}};}return saved;}});
    const form=s.d.querySelector('#profile-address-form');
    s.d.querySelector('#profile-place-query').value='Yangi ko‘cha';s.d.querySelector('[data-location-search]').click();await flush();
    s.d.querySelector('[data-place-index="0"]').click();
    assert.equal(form.elements.city.value,'Test shahar');assert.equal(form.elements.address.value,place.address);
    assert.equal(s.d.querySelector('[name="latitude"]'),null);
    assert.equal(s.d.querySelector('[data-location-summary]').textContent,place.address);
    fire(s,form,'submit');await flush();
    assert.equal(saved.details.latitude,40.1);
    assert.equal(typeof saved.details.longitude,'number');
    form.elements.address.value='Unsaved address';form.reset();await flush();
    assert.equal(form.elements.address.value,place.address);
    s.d.querySelector('[data-location-clear]').click();fire(s,form,'submit');await flush();
    assert.equal(saved.details.latitude,null);
    assert.equal(saved.details.longitude,null);
    s.close();
});

test('geolocation is requested only on click and permission failure leaves the saved point intact', async () => {
    let requests=0;
    const s=await open('profile.html',{user:buyer,handler:p=>p==='/api/profile'?profileFixture({latitude:37.224,longitude:67.278}):undefined,configure:(_,w)=>Object.defineProperty(w.navigator,'geolocation',{value:{getCurrentPosition(success,error){requests++;error({code:1});}}})});
    assert.equal(requests,0);
    s.d.querySelector('[data-location-current]').click();
    assert.equal(requests,1);
    assert.match(s.d.querySelector('[data-location-status]').textContent,/ruxsat berilmadi/);
    assert.equal(s.d.querySelector('[data-location-summary]').textContent,'Test ko‘chasi 10');
    assert.equal(s.d.querySelector('[data-location-current]').disabled,false);
    s.close();
});

test('invalid photo formats never upload and an existing avatar can be removed', async () => {
    const s=await open('profile.html',{user:buyer,handler:p=>p==='/api/profile'?{...profileFixture(),avatar_version:'test-version'}:p==='/api/profile/avatar'?{avatar_version:null}:undefined});
    const input=s.d.querySelector('input[type="file"]');
    Object.defineProperty(input,'files',{value:[new s.w.File(['<svg/>'],'unsafe.svg',{type:'image/svg+xml'})]});
    fire(s,input,'change');await flush();
    assert.equal(s.calls.filter(c=>c.pathname==='/api/profile/avatar').length,0);
    assert.match(s.d.querySelector('[data-photo-status]').textContent,/JPG, PNG, WebP/);
    s.d.querySelector('[data-photo-remove]').click();await flush();
    const call=s.calls.find(c=>c.pathname==='/api/profile/avatar');assert.equal(JSON.parse(call.options.body).remove,true);
    assert.equal(s.d.querySelector('[data-photo-remove]').hidden,true);
    s.close();
});

test('a photo with an empty MIME type uploads automatically without a second save click', async () => {
    const s=await open('profile.html',{user:buyer,handler:p=>p==='/api/profile/avatar'?{avatar_version:'saved-picture'}:undefined,configure:(_,w)=>{
        w.FileReader=class {readAsDataURL(){this.result='data:image/jpeg;base64,test';this.onload();}};
        w.Image=class {naturalWidth=512;naturalHeight=512;set src(value){this.onload();}};
        w.HTMLCanvasElement.prototype.getContext=()=>({clearRect(){},drawImage(){}});
        w.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,prepared-image';
    }});
    const input=s.d.querySelector('input[type="file"]');Object.defineProperty(input,'files',{value:[new s.w.File(['photo'],'phone-photo.jpg',{type:''})]});
    fire(s,input,'change');await flush();
    const calls=s.calls.filter(c=>c.pathname==='/api/profile/avatar');assert.equal(calls.length,1);
    assert.match(JSON.parse(calls[0].options.body).image,/^data:image\/png/);
    assert.match(s.d.querySelector('.profile-avatar img').src,/saved-picture/);
    assert.match(s.d.querySelector('[data-photo-status]').textContent,/saqlandi/);
    s.close();
});

test('profile export downloads an XLSX blob with an Excel filename', async () => {
    let downloaded,blob;
    const s=await open('profile.html',{user:buyer,configure:(_,w)=>{
        w.URL.createObjectURL=value=>{blob=value;return 'blob:excel-export';};w.URL.revokeObjectURL=()=>{};
        w.HTMLAnchorElement.prototype.click=function(){downloaded=this.download;};
    }});
    s.d.querySelector('#profile-export').click();await flush();
    assert.equal(downloaded,'cara-profil.xlsx');
    assert.equal(blob.type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.match(s.d.querySelector('#profile-security-status').textContent,/Excel/);s.close();
});

test('failed address lookup leaves the saved address intact and can be retried', async () => {
    const s=await open('profile.html',{user:buyer,handler:p=>{if(p==='/api/profile/location')throw new Error('Lookup unavailable');}});
    s.d.querySelector('#profile-place-query').value='Test address';s.d.querySelector('[data-location-search]').click();await flush();
    assert.match(s.d.querySelector('[data-location-status]').textContent,/ulanib bo‘lmadi/);
    assert.equal(s.d.querySelector('#profile-address-form [name="address"]').value,'');
    assert.equal(s.d.querySelector('[data-location-search]').disabled,false);s.close();
});

test('courier checkout includes the chosen point and drops it after the delivery address changes', async () => {
    const s=await open('checkout.html',{user:buyer,values:{cart:[{id:'f2',size:'L',quantity:1}]},handler:p=>p==='/api/profile'?profileFixture({latitude:37.224,longitude:67.278}):undefined});
    const form=s.d.querySelector('#checkout-form');form.elements.delivery_method.value='courier';fire(s,form.elements.delivery_method,'change');
    assert.equal(s.d.querySelector('.checkout-location').hidden,false);
    assert.match(s.d.querySelector('.checkout-location a').href,/37.224,67.278/);
    form.elements.acknowledgement.checked=true;fire(s,form,'submit');await flush();
    const payload=JSON.parse(s.calls.find(c=>c.pathname==='/api/orders'&&c.options.method==='POST').options.body);
    assert.equal(payload.latitude,37.224);assert.equal(payload.longitude,67.278);
    s.close();
    const edited=await open('checkout.html',{user:buyer,values:{cart:[{id:'f2',size:'L',quantity:1}]},handler:p=>p==='/api/profile'?profileFixture({latitude:37.224,longitude:67.278}):undefined});
    const f=edited.d.querySelector('#checkout-form');f.elements.delivery_method.value='courier';fire(edited,f.elements.delivery_method,'change');f.elements.address.value='Changed address 20';fire(edited,f.elements.address,'input');
    assert.equal(edited.d.querySelector('.checkout-location').hidden,true);
    f.elements.acknowledgement.checked=true;fire(edited,f,'submit');await flush();
    const changed=JSON.parse(edited.calls.find(c=>c.pathname==='/api/orders'&&c.options.method==='POST').options.body);
    assert.equal(changed.latitude,undefined);edited.close();
});

test('profile guests get sign-in links and signed-in users get their own account dashboard', async () => {
    const guest=await open('profile.html');
    assert.ok(guest.d.querySelector('a[href="login.html?next=profile.html#signin"]'));
    assert.equal(guest.d.querySelector('.profile-shell'),null);guest.close();
    const s=await open('profile.html',{user:buyer,handler:pathname=>pathname==='/api/profile'?profileFixture():undefined});
    assert.equal(s.d.querySelector('[data-profile-name]').textContent,'Test Xaridor');
    assert.equal(s.d.querySelector('[data-stat="orders"]').textContent,'2');
    assert.equal(s.d.querySelector('[data-stat="spent"]').textContent,'169 000 so‘m');
    assert.equal(s.d.querySelectorAll('.profile-panel').length,6);
    s.d.querySelector('[href="#security"]').click();await flush();
    assert.equal(s.d.querySelector('#profile-security').hidden,false);
    assert.equal(s.d.querySelector('#profile-overview').hidden,true);
    assert.equal(s.d.querySelector('.profile-nav [aria-current="page"]').getAttribute('href'),'#security');
    s.close();
});

test('profile edits persist through the API and preserve unsaved edits in the other form', async () => {
    let saved=profileFixture();
    const s=await open('profile.html',{user:buyer,handler:(pathname,options)=>{
        if(pathname==='/api/profile') {
            if(options.method==='PATCH') {const body=JSON.parse(options.body); saved={...saved,details:{...saved.details,full_name:body.full_name,city:body.city,address:body.address}};}
            return saved;
        }
    }});
    const info=s.d.querySelector('#profile-info-form'),address=s.d.querySelector('#profile-address-form');
    info.elements.full_name.value='Saqlanmagan ism';address.elements.city.value='Toshkent';
    fire(s,address,'submit');await flush();
    assert.equal(saved.details.city,'Toshkent');
    assert.equal(saved.details.full_name,'Test Xaridor');
    assert.equal(info.elements.full_name.value,'Saqlanmagan ism');
    fire(s,info,'submit');await flush();
    assert.equal(saved.details.full_name,'Saqlanmagan ism');
    assert.equal(saved.details.city,'Toshkent');
    assert.equal(s.d.querySelector('[data-profile-name]').textContent,'Saqlanmagan ism');
    assert.match(info.querySelector('[role="status"]').textContent,/Saqlandi/);
    s.close();
});

test('profile password mismatch never submits and success clears sensitive fields', async () => {
    const s=await open('profile.html',{user:buyer});
    const form=s.d.querySelector('#profile-password-form');
    form.elements.current_password.value='old-test-password';form.elements.new_password.value='new-test-password';form.elements.confirm_password.value='mismatch-test';
    fire(s,form,'submit');await flush();
    assert.equal(s.calls.filter(c=>c.pathname==='/api/profile/password').length,0);
    form.elements.confirm_password.value='new-test-password';fire(s,form.elements.confirm_password,'input');
    fire(s,form,'submit');fire(s,form,'submit');await flush();
    assert.equal(s.calls.filter(c=>c.pathname==='/api/profile/password').length,1);
    assert.equal(form.elements.current_password.value,'');
    assert.equal(form.elements.new_password.value,'');
    assert.equal(s.d.querySelector('#profile-sessions').textContent,'1');
    s.close();
});

test('profile wishlist supports choosing size, adding to cart and removing saved products', async () => {
    const s=await open('profile.html',{user:buyer,values:{wishlist:['f2']}});
    const size=s.d.querySelector('#saved-size-f2');size.value='L';
    s.d.querySelector('[data-saved-add="f2"]').click();
    assert.equal(s.w.CARA_FRONTEND.cart()[0].id,'f2');
    assert.equal(s.w.CARA_FRONTEND.cart()[0].size,'L');
    s.d.querySelector('[data-saved-remove="f2"]').click();
    assert.equal(s.w.CARA_FRONTEND.wishlist().length,0);
    assert.match(s.d.querySelector('#profile-wishlist').textContent,/Hali mahsulot saqlanmagan/);
    s.close();
});

test('profile escapes personal data and keeps forms disabled when loading fails', async () => {
    const safe=await open('profile.html',{user:buyer,handler:pathname=>pathname==='/api/profile'?profileFixture({full_name:'<img src=x onerror=alert(1)>'}):undefined});
    assert.equal(safe.d.querySelector('[data-profile-name] img'),null);
    assert.match(safe.d.querySelector('[data-profile-name]').textContent,/<img/);safe.close();
    const failed=await open('profile.html',{user:buyer,handler:pathname=>{if(pathname==='/api/profile')throw new Error('Offline');}});
    assert.equal(failed.d.querySelector('#profile-info-form [type="submit"]').disabled,true);
    assert.equal(failed.d.querySelector('#profile-retry').hidden,false);
    failed.close();
});

test('checkout prefills saved profile details without replacing fields edited during loading', async () => {
    let resolveProfile;
    const s=await open('checkout.html',{user:buyer,values:{cart:[{id:'f2',size:'L',quantity:1}]},handler:pathname=>pathname==='/api/profile'?new Promise(resolve=>{resolveProfile=resolve;}):undefined});
    const form=s.d.querySelector('#checkout-form');
    form.elements.recipient.value='Boshqa qabul qiluvchi';fire(s,form.elements.recipient,'input');
    resolveProfile(profileFixture());await flush();
    assert.equal(form.elements.recipient.value,'Boshqa qabul qiluvchi');
    assert.equal(form.elements.phone.value,'+998901234567');
    assert.equal(form.elements.address.value,'Test ko‘chasi 10');
    s.close();
});

test('all storefront pages initialize with Uzbek content and linked commerce assets', async () => {
    for (const file of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
        const s = await open(file);
        assert.equal(s.d.documentElement.lang, 'uz', file);
        assert.ok(s.d.querySelector('link[href="enhancements.css"]'), file);
        assert.equal(s.d.querySelectorAll('a[href="#"],a[href=""]').length, 0, file);
        const ids = [...s.d.querySelectorAll('[id]')].map(node => node.id);
        assert.equal(new Set(ids).size, ids.length, `${file}: duplicate IDs`);
        assert.equal(s.d.querySelectorAll('button[data-social-pending]').length, 0, file);
        assert.equal(s.d.querySelectorAll('footer .icon a').length, 6, file);
        s.close();
    }
});

test('social links contain only the six supplied profiles with exact destinations', async () => {
    const s = await open('index.html');
    const links = [...s.d.querySelectorAll('footer .icon a.social-link')].map(link => [link.getAttribute('aria-label'), link.href]);
    assert.deepEqual(links, [
        ['LinkedIn', 'https://www.linkedin.com/in/quvonchbek-qosimov-1b9ba0352/'],
        ['Facebook', 'https://www.facebook.com/profile.php?id=61569095741937'],
        ['WhatsApp', 'https://wa.me/998770830820'],
        ['GitHub', 'https://github.com/QuvonchbekQosimov'],
        ['Instagram', 'https://www.instagram.com/quvonchbekqos1mov/'],
        ['Telegram', 'https://t.me/quvonchbekqos1mov']
    ]);
    assert.equal(s.d.querySelectorAll('footer button.social-link').length, 0);
    s.close();
});

test('login tabs hide inactive fields, support arrows and keep the selected state', async () => {
    const s = await open('login.html');
    assert.equal(s.d.querySelector('#LoginForm').hidden, false);
    assert.equal(s.d.querySelector('#RegForm').hidden, true);
    s.d.querySelector('#signup').click(); await flush();
    assert.equal(s.d.querySelector('#LoginForm').hidden, true);
    assert.equal(s.d.querySelector('#RegForm').hidden, false);
    assert.equal(s.d.querySelector('#signup').getAttribute('aria-selected'), 'true');
    s.d.querySelector('#signup').dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(s.d.querySelector('#RegForm').hidden, true);
    assert.equal(s.d.activeElement.id, 'signin');
    assert.equal(s.d.querySelector('#signin').getAttribute('aria-selected'), 'true');
    s.close();
});

test('mobile menu closes with Escape and keeps keyboard focus inside while open', async () => {
    const s = await open('index.html');
    const bar = s.d.querySelector('#bar'), nav = s.d.querySelector('#navbar');
    bar.click();
    assert.equal(bar.getAttribute('aria-expanded'), 'true');
    bar.focus();
    bar.dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert.equal(nav.contains(s.d.activeElement), true);
    s.d.activeElement.dispatchEvent(new s.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(bar.getAttribute('aria-expanded'), 'false');
    assert.equal(s.d.activeElement, bar);
    s.close();
});

test('catalog pagination ends on its last page and hides for empty or short saved lists', async () => {
    const last = await open('shop.html', { query: '?page=2' });
    assert.equal(last.d.querySelectorAll('.pro:not([hidden])').length, 8);
    assert.equal(last.d.querySelector('#pagination a:last-child').hidden, true);
    assert.equal(last.d.querySelector('#pagination [aria-current="page"]').textContent, '2');
    last.close();
    for (const wishlist of [[], ['f2']]) {
        const s = await open('shop.html', { query: '?wishlist=1&page=2', values: { wishlist } });
        assert.equal(s.d.querySelector('#pagination').hidden, true);
        assert.equal(s.d.querySelectorAll('.pro:not([hidden])').length, wishlist.length);
        assert.equal(!!s.d.querySelector('.empty-state'), wishlist.length === 0);
        s.close();
    }
});

test('thumbnail selection resets size and quantity, updates the URL and adds the displayed product', async () => {
    const s = await open('sproduct.html', { query: '?id=f1' });
    const size = s.d.querySelector('.single-pro-details select'), quantity = s.d.querySelector('.single-pro-details input');
    size.value = 'L'; quantity.value = '3';
    s.d.querySelectorAll('.small-img')[1].click();
    assert.equal(s.w.location.search, '?id=f2');
    assert.equal(size.value, ''); assert.equal(quantity.value, '1');
    size.value = 'M'; s.d.querySelector('[data-product-add]').click();
    assert.deepEqual(JSON.parse(s.w.localStorage.getItem('cara.connections.cart')), [{ id: 'f2', size: 'M', quantity: 1 }]);
    assert.match(s.d.querySelector('#mobile a').getAttribute('aria-label'), /1 dona/);
    s.close();
});

test('invalid product and article URLs show recovery instead of unrelated content', async () => {
    const p = await open('sproduct.html', { query: '?id=missing' });
    assert.equal(p.d.querySelector('[data-product-add]').disabled, true);
    assert.equal(p.d.querySelector('.buy-now').disabled, true);
    assert.equal(p.d.querySelector('#MainImg').hidden, true);
    p.close();
    for (const query of ['?article=0','?article=no','?article=999']) {
        const s = await open('blog.html', { query });
        assert.equal(s.d.querySelectorAll('.blog-box:not([hidden])').length, 0);
        assert.ok(s.d.querySelector('.empty-state a[href="blog.html"]'));
        s.close();
    }
});

test('unsafe social URL schemes never become links', async () => {
    const s = await open('index.html', { configure: data => { data.store.socialLinks[0].url = 'javascript:alert(1)'; } });
    assert.equal(s.d.querySelectorAll('a[href^="javascript:"]').length, 0);
    s.close();
});

test('guests and unverified buyers cannot submit a rating even through a synthetic submit', async () => {
    for (const user of [null, buyer]) {
        const s = await open('sproduct.html', { query: '?id=f2', user });
        assert.equal(s.d.querySelector('#review-form fieldset').disabled, true);
        fire(s, s.d.querySelector('#review-form'), 'submit');
        await flush();
        assert.equal(s.calls.filter(call => call.pathname === '/api/reviews' && call.options.method === 'POST').length, 0);
        s.close();
    }
});

test('verified buyers get star radios and escaped review text', async () => {
    const reviews = { ...emptyReviews, can_review: true };
    const s = await open('sproduct.html', {
        query: '?id=f2', user: buyer, reviews,
        handler: async (pathname, options) => {
            if (pathname === '/api/reviews' && options.method === 'POST') {
                const body = JSON.parse(options.body);
                assert.equal(body.rating, 4);
                assert.equal(body.product_id, 'f2');
                assert.equal(options.headers['X-CSRF-Token'], 'test-csrf');
                reviews.items = [{ username: '<b>buyer</b>', body: body.body, rating: 4, updated: Date.now() }];
                reviews.count = 1; reviews.average = 4;
                return reviews;
            }
        }
    });
    assert.equal(s.d.querySelector('#review-form fieldset').disabled, false);
    s.d.querySelector('#rating-4').checked = true;
    fire(s, s.d.querySelector('#rating-4'), 'change');
    assert.equal(s.d.querySelectorAll('.star-option label.is-active').length, 4);
    s.d.querySelector('#review-text').value = '<img src=x onerror=alert(1)> yaxshi';
    fire(s, s.d.querySelector('#review-form'), 'submit'); await flush();
    assert.equal(s.d.querySelectorAll('.review-card img,.review-card b').length, 0);
    assert.match(s.d.querySelector('.review-card').textContent, /<img src=x/);
    s.close();
});

test('actual aggregate ratings fill stars; empty products keep outlines', async () => {
    const s = await open('index.html', { handler: async pathname => pathname === '/api/ratings' ? { ratings: { f1: { average: 4.5, count: 2 } } } : undefined });
    assert.equal(s.d.querySelectorAll('[data-product-id="f1"] .star .fa-star').length, 4);
    assert.equal(s.d.querySelectorAll('[data-product-id="f1"] .star .fa-star-half-o').length, 1);
    assert.equal(s.d.querySelectorAll('[data-product-id="f2"] .star .fa-star-o').length, 5);
    s.close();
});

test('checkout requires a session and unconfigured online providers stay disabled', async () => {
    const guest = await open('checkout.html');
    assert.ok(guest.d.querySelector('a[href="login.html?next=checkout.html#signin"]'));
    guest.close();
    const s = await open('checkout.html', { user: buyer, values: { cart: [{ id: 'f2', size: 'L', quantity: 2 }] } });
    assert.equal(s.d.querySelector('[value="click"]').disabled, true);
    assert.equal(s.d.querySelector('[value="payme"]').disabled, true);
    assert.equal(s.d.querySelector('[value="cash"]').checked, true);
    assert.ok(s.d.querySelector('#checkout-content').textContent.includes('338 000 so‘m'));
    s.close();
});

test('Live Server checkout reconnects to the backend without losing the cart or session', async () => {
    let offline = true;
    const cart = [{ id: 'f2', size: 'L', quantity: 2 }];
    const s = await open('checkout.html', {
        origin: 'http://127.0.0.1:5501', user: buyer, values: { cart },
        handler: async () => { if (offline) throw new Error('connection refused'); }
    });
    assert.ok(s.d.querySelector('#retry-commerce'));
    assert.match(s.d.querySelector('#checkout-content').textContent, /python server\.py/);
    assert.deepEqual(JSON.parse(s.w.localStorage.getItem('cara.connections.cart')), cart);
    assert.ok(s.calls.every(call => new URL(call.url).origin === 'http://127.0.0.1:5502'));
    // An unsuccessful retry still allows another attempt.
    s.d.querySelector('#retry-commerce').click(); await flush();
    assert.equal(s.d.querySelector('#retry-commerce').disabled, false);
    offline = false;
    s.d.querySelector('#retry-commerce').click(); await flush();
    assert.ok(s.d.querySelector('#checkout-form'));
    assert.equal(s.d.querySelector('#retry-commerce'), null);
    assert.match(s.d.querySelector('#checkout-content').textContent, /338 000 so‘m/);
    assert.deepEqual(JSON.parse(s.w.localStorage.getItem('cara.connections.cart')), cart);
    s.close();
});

test('reconnecting as a guest still requires login and keeps the checkout destination', async () => {
    let offline = true;
    const s = await open('checkout.html', {
        handler: async () => { if (offline) throw new Error('connection refused'); }
    });
    offline = false;
    s.d.querySelector('#retry-commerce').click(); await flush();
    assert.ok(s.d.querySelector('a[href="login.html?next=checkout.html#signin"]'));
    assert.equal(s.d.querySelector('#checkout-form'), null);
    s.close();
});

test('checkout submits an idempotency key, blocks double submission and clears only on success', async () => {
    const s = await open('checkout.html', {
        user: buyer, values: { cart: [{ id: 'f2', size: 'L', quantity: 2 }] },
        handler: async (pathname, options) => pathname === '/api/orders' && options.method === 'POST' ? { order: { id: 'CARA-AAAAAAAAAAAA' } } : undefined
    });
    const form = s.d.querySelector('#checkout-form');
    form.elements.recipient.value = 'QA Customer'; form.elements.phone.value = '+998 (90) 123-45-67'; fire(s, form.elements.phone, 'input'); form.elements.acknowledgement.checked = true;
    assert.equal(form.elements.phone.value, '+998901234567');
    fire(s, form, 'submit'); fire(s, form, 'submit'); await flush();
    const calls = s.calls.filter(call => call.pathname === '/api/orders' && call.options.method === 'POST');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].options.headers['Idempotency-Key']);
    assert.equal(calls[0].options.headers['X-CSRF-Token'], 'test-csrf');
    assert.deepEqual(JSON.parse(s.w.localStorage.getItem('cara.connections.cart')), []);
    s.close();
});

test('failed checkout keeps the cart and reuses its idempotency key on retry', async () => {
    const s = await open('checkout.html', {
        user: buyer, values: { cart: [{ id: 'f2', size: 'L', quantity: 2 }] },
        handler: async (pathname, options) => { if (pathname === '/api/orders' && options.method === 'POST') throw new Error('offline'); }
    });
    const form = s.d.querySelector('#checkout-form');
    form.elements.recipient.value = 'QA Customer'; form.elements.phone.value = '+998901234567'; form.elements.acknowledgement.checked = true;
    fire(s, form, 'submit'); await flush(); fire(s, form, 'submit'); await flush();
    const calls = s.calls.filter(call => call.pathname === '/api/orders' && call.options.method === 'POST');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
    assert.equal(JSON.parse(s.w.localStorage.getItem('cara.connections.cart'))[0].quantity, 2);
    s.close();
});

test('checkout follows cart changes from other tabs without clearing recipient fields', async () => {
    const s = await open('checkout.html', { user: buyer, values: { cart: [{ id: 'f2', size: 'L', quantity: 2 }] } });
    const form = s.d.querySelector('#checkout-form');
    form.elements.recipient.value = 'QA Customer'; form.elements.phone.value = '+998901234567'; form.elements.acknowledgement.checked = true;
    s.w.localStorage.setItem('cara.connections.cart', JSON.stringify([{ id: 'f1', size: 'M', quantity: 1 }]));
    s.w.dispatchEvent(new s.w.StorageEvent('storage', { key: 'cara.connections.cart' }));
    assert.match(s.d.querySelector('#checkout-summary').textContent, /159 000 so‘m/);
    assert.equal(form.elements.recipient.value, 'QA Customer');
    s.w.localStorage.removeItem('cara.connections.cart');
    s.w.dispatchEvent(new s.w.StorageEvent('storage', { key: 'cara.connections.cart' }));
    assert.match(s.d.querySelector('#checkout-summary').textContent, /Savatingiz bo‘sh/);
    fire(s, form, 'submit'); await flush();
    assert.equal(s.calls.filter(call => call.pathname === '/api/orders' && call.options.method === 'POST').length, 0);
    s.close();
});

test('corrupt and duplicate cart entries normalize to the server quantity limit', async () => {
    const s = await open('cart.html', {values:{cart:[
        {id:'f2',size:'Large',quantity:70}, {id:'f2',size:'L',quantity:60},
        {id:'missing',size:'L',quantity:1}, {id:'f1',size:'M',quantity:-1}, null
    ]}});
    assert.deepEqual(JSON.parse(JSON.stringify(s.w.CARA_FRONTEND.cart())), [{id:'f2',size:'L',quantity:99}]);
    assert.equal(s.d.querySelectorAll('[data-quantity]').length, 1);
    assert.equal(s.d.querySelector('[data-quantity]').value, '99');
    assert.equal(s.w.CARA_FRONTEND.add('f2','L',1,false), undefined);
    s.close();
});

test('login supports a full email and includes the anonymous Django CSRF token', async () => {
    const s = await open('login.html', {handler:(p,options)=>{
        if(p==='/api/me')return {user:null,csrf:'anonymous-django-csrf'};
        if(p==='/api/login')return {user:buyer,csrf:'rotated-csrf'};
    }});
    const form=s.d.querySelector('#LoginForm');
    assert.equal(form.elements.username.maxLength,150);
    form.elements.username.value='long.email.address.for.login@example.test';
    form.elements.password.value='test-password';
    fire(s,form,'submit');await flush();
    const request=s.calls.find(call=>call.pathname==='/api/login');
    assert.equal(request.options.headers['X-CSRF-Token'],'anonymous-django-csrf');
    assert.equal(JSON.parse(request.options.body).username,'long.email.address.for.login@example.test');
    s.close();
});

test('API bases accept both relative paths and trailing slashes', async () => {
    for(const base of ['/api/','http://localhost:8000/api/']) {
        const s=await open('checkout.html',{configure:data=>{data.store.apiBaseUrl=base;}});
        assert.ok(s.calls.every(call=>!new URL(call.url).pathname.includes('//')));
        assert.equal(s.calls.find(call=>call.pathname==='/api/me').url,new URL(base,'http://localhost:5502').href.replace(/\/$/,'')+'/me');
        assert.ok(s.d.querySelector('a[href="login.html?next=checkout.html#signin"]'));
        s.close();
    }
});

test('non-JSON API errors retain HTTP meaning and never expose proxy HTML', async () => {
    for(const code of [401,403,429,502]) {
        const s=await open('checkout.html',{handler:p=>p==='/api/me'?{ok:false,status:code,json:async()=>{throw new Error('<html>proxy</html>');}}:undefined});
        const text=s.d.querySelector('#checkout-content').textContent;
        assert.doesNotMatch(text,/proxy|<html>|Xizmatga ulanib/);
        assert.match(text,code===401?/Seans tugagan/:code===403?/xavfsizlik belgisi/:code===429?/So‘rovlar ko‘payib/:/so‘rovni bajara olmadi/);
        s.close();
    }
});

test('successful checkout preserves new products and extra quantities added during submission', async () => {
    let finish;
    const s=await open('checkout.html',{user:buyer,values:{cart:[{id:'f2',size:'L',quantity:2}]},handler:(p,options)=>{
        if(p==='/api/orders'&&options.method==='POST')return new Promise(resolve=>{finish=resolve;});
    }});
    const form=s.d.querySelector('#checkout-form');
    form.elements.recipient.value='QA Customer';form.elements.phone.value='+998901234567';form.elements.acknowledgement.checked=true;
    fire(s,form,'submit');await flush();
    s.w.CARA_FRONTEND.add('f2','L',1,false);s.w.CARA_FRONTEND.add('f1','M',1,false);
    finish({order:{id:'CARA-AAAAAAAAAAAA'}});await flush();
    assert.deepEqual(JSON.parse(s.w.localStorage.getItem('cara.connections.cart')),[{id:'f2',size:'L',quantity:1},{id:'f1',size:'M',quantity:1}]);
    s.close();
});

test('admin dashboard links open the seller view while customer query strings cannot grant it', async () => {
    const seller=await open('orders.html',{query:'?admin=1',user:{...buyer,role:'admin'}});
    assert.ok(seller.calls.some(call=>call.url.endsWith('/api/orders?admin=1')));
    assert.match(seller.d.querySelector('#toggle-admin').textContent,/Mening buyurtmalarim/);
    seller.close();
    const customer=await open('orders.html',{query:'?admin=1',user:buyer});
    assert.ok(customer.calls.some(call=>call.url.endsWith('/api/orders')));
    assert.equal(customer.d.querySelector('#toggle-admin'),null);
    customer.close();
});

test('a lost checkout response can be retried after reload without storing contact details', async () => {
    const cart=[{id:'f2',size:'L',quantity:2}];
    const configure=(_,w)=>{Object.defineProperty(w.crypto,'subtle',{value:require('node:crypto').webcrypto.subtle});w.TextEncoder=TextEncoder;};
    const submit=async s=>{const form=s.d.querySelector('#checkout-form');form.elements.recipient.value='Private Test Name';form.elements.phone.value='+998901234567';form.elements.acknowledgement.checked=true;fire(s,form,'submit');for(let i=0;i<10&&!s.calls.some(call=>call.pathname==='/api/orders');i++)await flush();await flush();};
    const options={user:buyer,values:{cart},configure,handler:(p,options)=>{if(p==='/api/orders'&&options.method==='POST')throw new Error('response lost');}};
    const first=await open('checkout.html',options);await submit(first);
    const key=first.calls.find(call=>call.pathname==='/api/orders').options.headers['Idempotency-Key'];
    const stored=first.w.sessionStorage.getItem('cara.checkout.retry.1');
    assert.doesNotMatch(stored,/Private Test Name|998901234567/);
    assert.equal(JSON.parse(stored).fingerprint.length,64);
    first.close();
    const reloaded=await open('checkout.html',{...options,sessionValues:{'cara.checkout.retry.1':stored}});await submit(reloaded);
    assert.equal(reloaded.calls.find(call=>call.pathname==='/api/orders').options.headers['Idempotency-Key'],key);
    reloaded.close();
});

test('all local page links, fragments, scripts and images resolve', () => {
    const pages = new Map(fs.readdirSync(root).filter(file => file.endsWith('.html')).map(file => [file, new JSDOM(code(file))]));
    for (const [file, dom] of pages) {
        for (const element of dom.window.document.querySelectorAll('[href],[src]')) {
            const raw = element.getAttribute('href') || element.getAttribute('src');
            const url = new URL(raw, `http://local.test/${file}`);
            if (url.origin !== 'http://local.test') continue;
            const target = decodeURIComponent(url.pathname.slice(1));
            assert.ok(fs.existsSync(path.join(root, target)), `${file}: ${raw}`);
            if (url.hash && pages.has(target)) assert.ok(pages.get(target).window.document.getElementById(decodeURIComponent(url.hash.slice(1))), `${file}: missing fragment ${raw}`);
        }
    }
    for (const dom of pages.values()) dom.window.close();
});

test('Live Server 5500 supports nested project paths for profiles, login, orders and checkout', async () => {
    for(const file of ['profile.html','login.html','orders.html','checkout.html']) {
        const s=await open(file,{origin:'http://127.0.0.1:5500/Cara-Frontend',user:file==='login.html'?null:buyer,values:{cart:[{id:'f2',size:'L',quantity:1}]}});
        assert.ok(s.calls.every(call=>new URL(call.url).origin==='http://127.0.0.1:5502'));
        if(file==='profile.html')assert.ok(s.d.querySelector('.profile-shell'));
        if(file==='checkout.html')assert.ok(s.d.querySelector('#checkout-form'));
        s.close();
    }
});

test('payment config failure cannot block profile or order access', async () => {
    for(const file of ['profile.html','orders.html']) {
        const s=await open(file,{user:buyer,handler:p=>{if(p==='/api/config')throw new Error('payments offline');}});
        assert.equal(s.calls.some(call=>call.pathname==='/api/config'),false);
        assert.equal(s.d.querySelector('#retry-commerce'),null);
        if(file==='profile.html')assert.ok(s.d.querySelector('.profile-shell'));
        s.close();
    }
});

test('profile retry after an API outage renders a real dashboard or guest login without a stale error', async () => {
    for(const sessionUser of [buyer,null]) {
        let offline=true;
        const s=await open('profile.html',{user:sessionUser,handler:p=>{if(p==='/api/me'&&offline)throw new Error('offline');}});
        assert.ok(s.d.querySelector('#retry-commerce'));
        offline=false;s.d.querySelector('#retry-commerce').click();await flush();
        assert.equal(s.d.querySelector('#retry-commerce'),null);
        if(sessionUser)assert.ok(s.d.querySelector('.profile-shell'));
        else assert.ok(s.d.querySelector('a[href="login.html?next=profile.html#signin"]'));
        s.close();
    }
});

test('login can recover when the initial session request failed', async () => {
    let offline=true;
    const s=await open('login.html',{handler:p=>{
        if(p==='/api/me'){if(offline)throw new Error('offline');return {user:null,csrf:'fresh-token'};}
        if(p==='/api/login')return {user:buyer,csrf:'new-token'};
    }});
    offline=false;
    const form=s.d.querySelector('#LoginForm');form.elements.username.value='buyer';form.elements.password.value='test-password';
    fire(s,form,'submit');await flush();
    assert.equal(s.calls.find(call=>call.pathname==='/api/login').options.headers['X-CSRF-Token'],'fresh-token');
    s.close();
});

test('expired profile sessions provide a sign-in link and disable sensitive actions', async () => {
    let expired=true;
    const s=await open('profile.html',{user:buyer,handler:p=>p==='/api/profile'?(expired?{ok:false,status:401,json:async()=>({error:'Seans tugagan.'})}:profileFixture()):undefined});
    assert.ok(s.d.querySelector('#profile-status a[href="login.html?next=profile.html#signin"]'));
    assert.equal(s.d.querySelector('#profile-info-form input').disabled,true);
    assert.equal(s.d.querySelector('#profile-export').disabled,true);
    assert.equal(s.d.querySelector('#profile-password-form button').disabled,true);
    expired=false;s.d.querySelector('#profile-retry').click();await flush();
    assert.equal(s.d.querySelector('#profile-export').disabled,false);
    assert.equal(s.d.querySelector('#profile-info-form input').disabled,false);
    assert.equal(s.d.querySelector('#profile-status a'),null);
    s.close();
});

test('incomplete profile data offers retry without enabling edits', async () => {
    const s=await open('profile.html',{user:buyer,handler:p=>p==='/api/profile'?{details:{}}:undefined});
    assert.equal(s.d.querySelector('#profile-info-form input').disabled,true);
    assert.equal(s.d.querySelector('#profile-retry').hidden,false);
    assert.match(s.d.querySelector('#profile-status').textContent,/Qayta urinib/);
    s.close();
});

test('orders page does not trust payment success in the URL', async () => {
    const order = { id: 'CARA-AAAAAAAAAAAA', created: Date.now(), status: 'pending', payment_method: 'click', payment_status: 'unpaid', recipient: 'QA', phone: '+998901234567', city: 'Termiz', address: '', delivery_method: 'pickup', items: [], shipping_fee: null, total: 338000, pricing_confirmed: false, notes: '' };
    const s = await open('orders.html', { query: '?success=true&paid=1', user: buyer, handler: async pathname => pathname === '/api/orders' ? { orders: [order] } : undefined });
    assert.match(s.d.querySelector('#orders-content').textContent, /To‘lanmagan/);
    assert.equal(s.d.querySelectorAll('.pay-order').length, 0);
    assert.equal(s.d.querySelectorAll('.order-manage').length, 0);
    s.close();
});
