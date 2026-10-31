
(() => {
    'use strict';
    const $ = selector => document.querySelector(selector);
    const $$ = selector => [...document.querySelectorAll(selector)];
    const page = location.pathname.split('/').pop() || 'index.html';
    const query = new URLSearchParams(location.search);
    const data = window.CARA_DATA;
    const store = data.store;
    const socialLinks = (store.socialLinks || []).filter(link => /^https?:\/\//.test(link.url || ''));
    socialLinks.forEach(link => { store[link.id] = link.url; });
    const products = data.products;
    const ids = products.map(item => item.id);
    const product = id => products.find(item => item.id === id);
    // Keep UZS display identical even in browsers without the Uzbek ICU locale.
    const money = value => new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0
    }).format(value).replace(/,/g, ' ') + ' so‘m';
    const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    $$('[data-store]').forEach(node => { if (typeof store[node.dataset.store] === 'string') node.textContent = store[node.dataset.store]; });
    $$('[data-contact="phone"]').forEach(link => { link.href = 'tel:' + store.phone; link.textContent = store.phoneDisplay; });
    $$('[data-social]').forEach(link => {
        const socialUrl = store[link.dataset.social];
        link.href = typeof socialUrl === 'string' && /^https?:\/\//.test(socialUrl) ? socialUrl : 'support.html#social';
        const platform = socialLinks.find(entry => entry.id === link.dataset.social)?.label;
        if (link.closest('.icon')) link.setAttribute('aria-label', platform + ': ' + store.username);
    });
    $$('[data-store-summary]').forEach(node => { node.textContent = `${store.city} · ${store.phoneDisplay} · WhatsApp orqali bog‘laning`; });
    $('[data-store-map]')?.setAttribute('src', store.mapEmbed);
    const storageKey = key => `cara.connections.${key}`;
    function read(key, fallback) {
        try { return JSON.parse(localStorage.getItem(storageKey(key))) ?? fallback; }
        catch { return fallback; }
    }
    function message(title, text, cartLink = false) {
        let dialog = $('#connection-message');
        if (!dialog) {
            dialog = document.createElement('dialog');
            dialog.id = 'connection-message';
            dialog.setAttribute('aria-labelledby', 'connection-message-title');
            dialog.style.cssText = 'margin:auto;padding:24px;max-width:min(90vw,480px);border:1px solid #cce7d0;border-radius:4px';
            dialog.innerHTML = '<h4 id="connection-message-title"></h4><p id="connection-message-text"></p><a href="cart.html" id="connection-cart-link">Savatni ochish</a><form method="dialog"><button class="normal">Yopish</button></form>';
            document.body.append(dialog);
        }
        $('#connection-message-title').textContent = title;
        $('#connection-message-text').textContent = text;
        $('#connection-cart-link').hidden = !cartLink;
        if (typeof dialog.showModal === 'function') {
            if (!dialog.open) dialog.showModal();
        } else {
            alert(`${title}\n${text}`);
        }
    }
    function save(key, value) {
        try { localStorage.setItem(storageKey(key), JSON.stringify(value)); return true; }
        catch { message('Saqlab bo‘lmadi', 'Brauzer xotirasi band yoki o‘chirilgan. O‘zgarish saqlanmadi.'); return false; }
    }
    function cart() {
        const items = read('cart', []);
        const valid = Array.isArray(items) ? items.filter(item => item && typeof item === 'object').map(item => ({
            id: item.id, size: ({Small:'S', Large:'L'})[item.size] || item.size, quantity: item.quantity
        })).filter(item => product(item.id)?.sizes.includes(item.size) && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99) : [];
        const merged = new Map();
        for (const item of valid) {
            const key = JSON.stringify([item.id, item.size]);
            const previous = merged.get(key);
            if (previous) previous.quantity = Math.min(99, previous.quantity + item.quantity);
            else if (merged.size < 50) merged.set(key, item);
        }
        return [...merged.values()];
    }
    function wishlist() {
        const items = read('wishlist', []);
        return Array.isArray(items) ? [...new Set(items.filter(id => product(id)))] : [];
    }
    function add(id, size = 'L', quantity = 1, showMessage = true) {
        if (!product(id)?.sizes.includes(size) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            message('Tanlovni tekshiring', 'O‘lchamni va 1 dan 99 gacha butun miqdorni tanlang.');
            return;
        }
        const items = cart();
        const existing = items.find(item => item.id === id && item.size === size);
        if (existing && existing.quantity + quantity > 99) {
            message('Miqdor chegarasi', 'Bir mahsulotning bitta o‘lchamidan ko‘pi bilan 99 dona qo‘shish mumkin.');
            return;
        }
        if (!existing && items.length >= 50) {
            message('Savat chegarasi', 'Savatda ko‘pi bilan 50 xil mahsulot va o‘lcham bo‘lishi mumkin.');
            return;
        }
        if (existing) existing.quantity += quantity;
        else items.push({id, size, quantity});
        if (save('cart', items)) {
            updateCartLabels();
            if (showMessage) message('Savatga qo‘shildi', `${product(id).name} (${size}) × ${quantity} savatga qo‘shildi.`, true);
            return true;
        }
    }
    function updateCartLabels() {
        const count = cart().reduce((sum, item) => sum + item.quantity, 0);
        $$('#header a[href="cart.html"]').forEach(link => {
            link.setAttribute('aria-label', `Savat, ${count} dona`);
            let badge = link.querySelector('.cart-count');
            if (!badge) { badge = document.createElement('span'); badge.className = 'cart-count'; badge.setAttribute('aria-hidden','true'); link.append(badge); }
            badge.textContent = String(count); badge.hidden = count === 0;
        });
    }

    // Keep the original menu markup and appearance.
    const bar = $('#bar'), close = $('#close'), nav = $('#navbar');
    function toggleMenu(open) {
        nav?.classList.toggle('active', open);
        bar?.setAttribute('aria-expanded', String(open));
        if (open) nav?.querySelector('a')?.focus();
    }
    nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => toggleMenu(false)));
    bar?.addEventListener('click', () => toggleMenu(!nav.classList.contains('active')));
    bar?.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleMenu(!nav.classList.contains('active')); }
    });
    close?.addEventListener('click', event => { event.preventDefault(); toggleMenu(false); bar?.focus(); });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && nav?.classList.contains('active')) { toggleMenu(false); bar?.focus(); }
        if (event.key === 'Tab' && nav?.classList.contains('active')) {
            const links = [...nav.querySelectorAll('a,button')].filter(link => getComputedStyle(link).display !== 'none' && getComputedStyle(link.parentElement).display !== 'none');
            const first = links[0], last = links.at(-1);
            if (!nav.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
            else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
    });
    document.addEventListener('click', event => { if (!event.target.closest('#header')) toggleMenu(false); });
    window.matchMedia?.('(min-width:800px)').addEventListener('change', event => { if (event.matches) toggleMenu(false); });

    // Existing cards keep their images, descriptions, stars and cart icon.
    $$('.pro').forEach(card => {
        const image = card.querySelector('img');
        const id = image?.getAttribute('src')?.match(/\/([fn][1-8])\.jpg$/)?.[1];
        if (!id) return;
        const item = product(id);
        if (!item) return;
        image.alt = item.name;
        card.querySelector('.des span').textContent = item.brand;
        card.querySelector('.des h5').textContent = item.name;
        card.querySelector('.des h4').textContent = money(item.price);
        card.dataset.productId = id;
        const imageLink = document.createElement('a');
        imageLink.href = `sproduct.html?id=${id}`;
        imageLink.setAttribute('aria-label', `${product(id).name} mahsulotini ko‘rish`);
        image.before(imageLink);
        imageLink.append(image);
        const cartLink = card.querySelector('a:has(.cart)');
        if (cartLink) {
            cartLink.href = 'cart.html';
            cartLink.dataset.add = id;
            const defaultSize = item.sizes.includes('L') ? 'L' : item.sizes[0];
            cartLink.dataset.size = defaultSize;
            cartLink.setAttribute('aria-label', `${product(id).name} — ${defaultSize} o‘lchamni savatga qo‘shish`);
        }
    });
    document.addEventListener('click', event => {
        const addLink = event.target.closest('[data-add]');
        if (addLink) { event.preventDefault(); event.stopPropagation(); add(addLink.dataset.add,addLink.dataset.size); return; }
        const linked = event.target.closest('[data-link]');
        if (linked && !event.target.closest('a')) { location.href = linked.dataset.link; return; }
        const card = event.target.closest('.pro');
        if (card && !event.target.closest('a,button,input,select')) location.href = `sproduct.html?id=${card.dataset.productId}`;
    });
    function linkElement(node, url, label) {
        if (!node) return;
        node.dataset.link = url;
        node.setAttribute('role', 'link');
        node.setAttribute('tabindex', '0');
        node.setAttribute('aria-label', label);
        node.removeAttribute('aria-hidden');
        node.addEventListener('keydown', event => {
            if (event.key === 'Enter') { event.preventDefault(); location.href = url; }
        });
    }
    const featureLinks = ['support.html#delivery', 'shop.html', 'shop.html', 'shop.html', 'contact.html', 'support.html#help'];
    $$('#feature .fe-box').forEach((node, index) => linkElement(node, featureLinks[index], node.textContent.trim()));
    $$('.install .row img').forEach(image => linkElement(image, 'support.html#apps', 'Mobil foydalanish haqida'));
    $$('.install > img').forEach(image => linkElement(image, 'support.html#payments', 'To‘lov haqida'));

    if (page === 'shop.html') {
        const cards = $$('.pro');
        const onlySaved = query.get('wishlist') === '1';
        const list = onlySaved ? cards.filter(card => wishlist().includes(card.dataset.productId)) : cards;
        const maxPage = Math.max(1, Math.ceil(list.length / 8));
        const current = Math.min(maxPage, Math.max(1, parseInt(query.get('page'), 10) || 1));
        const visible = new Set(list.slice((current - 1) * 8, current * 8));
        cards.forEach(card => { card.hidden = !visible.has(card); });
        if (onlySaved) {
            $('#page-header h2').textContent = 'Saqlanganlar';
            $('#page-header p').textContent = list.length ? 'Saqlab qo‘ygan mahsulotlaringiz' : 'Hali mahsulot saqlanmadi. Mahsulotni ochib, Saqlab qo‘yish tugmasini bosing.';
            if (!list.length) {
                const empty = document.createElement('div'); empty.className = 'empty-state';
                empty.innerHTML = '<h3>Saqlangan mahsulotlar yo‘q</h3><p>Katalogdan yoqtirgan mahsulotingizni ochib, saqlab qo‘ying.</p><a class="button" href="shop.html">Katalogni ko‘rish</a>';
                $('#products1 .pro-container').after(empty);
            }
        }
        $('#pagination').hidden = maxPage === 1;
        $$('#pagination a').forEach((link, index) => {
            const target = index < 2 ? index + 1 : Math.min(current + 1, maxPage);
            link.href = `shop.html?${onlySaved ? 'wishlist=1&' : ''}page=${target}#products1`;
            if (index < 2 && index + 1 === current) link.setAttribute('aria-current', 'page');
            if (index === 2 && current === maxPage) { link.hidden = true; }
        });
    }

    if (page === 'sproduct.html') {
        let selected = query.get('id') || 'f1';
        const details = $('.single-pro-details');
        const main = $('#MainImg');
        const addButton = $('[data-product-add]');
        const size = details.querySelector('select');
        const quantity = details.querySelector('input[type="number"]');
        const wish = document.createElement('button');
        wish.type = 'button'; wish.className = 'normal'; wish.dataset.wishlistToggle = '';
        addButton.after(document.createTextNode(' '), wish);
        function showProduct(id) {
            const changed = selected !== id;
            selected = id;
            if (changed || size.options.length === 0) { size.value = ''; quantity.value = '1'; }
            const previousSize = size.value;
            size.innerHTML = '<option value="">O‘lcham tanlang</option>' + product(id).sizes.map(value => `<option value="${escape(value)}">${escape(value)}</option>`).join('');
            size.value = product(id).sizes.includes(previousSize) ? previousSize : '';
            main.src = product(id).image;
            main.alt = `${product(id).name}`;
            details.querySelector('h4').textContent = product(id).name;
            details.querySelector('h6').textContent = `Bosh sahifa / ${product(id).category}`;
            details.querySelector('h2').textContent = money(product(id).price);
            details.querySelector('span').textContent = product(id).description;
            document.title = `${product(id).name} | ${store.name}`;
            wish.textContent = wishlist().includes(id) ? 'Saqlanganlardan olish' : 'Saqlab qo‘yish';
            wish.setAttribute('aria-pressed', String(wishlist().includes(id)));
            $$('.small-img').forEach(image => image.setAttribute('aria-pressed', String(image.dataset.productId === id)));
            history.replaceState(null, '', `sproduct.html?id=${id}`);
            document.dispatchEvent(new CustomEvent('cara:product-selected', {detail: {id}}));
        }
        if (!product(selected)) {
            addButton.disabled = true; wish.disabled = true;
            details.querySelector('h4').textContent = 'Mahsulot topilmadi';
            details.querySelector('h2').textContent = '—';
            size.disabled = true; quantity.disabled = true;
            main.hidden = true; $('.small-img-group').hidden = true;
            details.querySelector('span').textContent = 'Bu mahsulot havolasi noto‘g‘ri. Katalog sahifasiga qayting.';
            const back = document.createElement('a'); back.className = 'button'; back.href = 'shop.html'; back.textContent = 'Katalogga qaytish'; details.append(back);
        } else {
            const index = ids.indexOf(selected);
            $$('.small-img').forEach((image, offset) => {
                const id = ids[(index + offset) % ids.length];
                image.src = product(id).image;
                image.dataset.productId = id;
                image.alt = `${product(id).name} mahsulotini ko‘rish`;
                image.tabIndex = 0;
                image.setAttribute('role', 'button');
                image.onclick = () => showProduct(id);
                image.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showProduct(id); } });
            });
            showProduct(selected);
        }
        addButton.addEventListener('click', () => {
            if (!size.value) { size.focus(); size.setCustomValidity('O‘lchamni tanlang.'); size.reportValidity(); return; }
            add(selected, size.value, Number(quantity.value));
        });
        size.addEventListener('change', () => size.setCustomValidity(''));
        wish.addEventListener('click', () => {
            const saved = wishlist();
            if (save('wishlist', saved.includes(selected) ? saved.filter(id => id !== selected) : [...saved, selected])) showProduct(selected);
        });
    }

    function renderCart() {
        const root = $('.cart-1');
        if (!root) return;
        const items = cart();
        if (!items.length) {
            root.innerHTML = '<div class="cart-header"><h2>Savatingiz bo‘sh</h2></div><p><a href="shop.html">Xaridni davom ettirish</a></p>';
            return;
        }
        const total = items.reduce((sum, item) => sum + product(item.id).price * item.quantity, 0);
        root.innerHTML = `<div class="cart-header"><h2>Savatingiz</h2></div><div class="section-p1"><div style="overflow-x:auto"><table style="width:100%;text-align:left;border-spacing:12px"><caption>Tanlangan mahsulotlaringiz</caption><thead><tr><th scope="col">Mahsulot</th><th scope="col">O‘lcham</th><th scope="col">Narx</th><th scope="col">Miqdor</th><th scope="col">Summa</th><th scope="col">O‘chirish</th></tr></thead><tbody>${items.map((item, index) => {
            const p = product(item.id);
            return `<tr><td><a href="sproduct.html?id=${item.id}"><img src="${p.image}" alt="${escape(p.name)}" width="80"><br>${escape(p.name)}</a></td><td>${item.size}</td><td>${money(p.price)}</td><td><input type="number" value="${item.quantity}" min="1" max="99" step="1" data-quantity="${index}" aria-label="${escape(p.name)}, ${item.size} uchun miqdor" style="width:60px"></td><td>${money(p.price * item.quantity)}</td><td><button class="normal" type="button" data-remove="${index}" aria-label="${escape(p.name)}, ${item.size} ni o‘chirish">O‘chirish</button></td></tr>`;
        }).join('')}</tbody></table></div><h4>Jami: ${money(total)}</h4><div class="cart-actions"><a class="button" href="checkout.html">Buyurtmani rasmiylashtirish</a><a href="shop.html">Xaridni davom ettirish</a></div></div>`;
    }
    renderCart();
    document.addEventListener('change', event => {
        const input = event.target.closest('[data-quantity]');
        if (!input) return;
        const quantity = Number(input.value);
        const items = cart();
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
            renderCart(); message('Miqdorni tekshiring', '1 dan 99 gacha butun miqdorni kiriting.'); return;
        }
        if (items[Number(input.dataset.quantity)]) {
            items[Number(input.dataset.quantity)].quantity = quantity;
            if (save('cart', items)) { renderCart(); updateCartLabels(); }
        }
    });
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-remove]');
        if (!button) return;
        const items = cart(); items.splice(Number(button.dataset.remove), 1);
        if (save('cart', items)) { renderCart(); updateCartLabels(); }
    });

    if (page === 'blog.html') {
        const boxes = $$('#blog .blog-box');
        const article = Number(query.get('article'));
        const current = query.get('page') === '2' ? 2 : 1;
        const paragraphs = data.articles.map(article => article.body);
        boxes.forEach((box, index) => {
            const articleData = data.articles[index];
            if (articleData) {
                box.querySelector('.blog-details h4').textContent = articleData.title;
                box.querySelector('.blog-details p').textContent = articleData.summary;
            }
            box.hidden = query.has('article') ? article !== index + 1 : !(index >= (current - 1) * 3 && index < current * 3);
            if (article === index + 1) {
                const paragraph = document.createElement('p'); paragraph.textContent = paragraphs[index];
                box.querySelector('.blog-details a').before(paragraph);
                const back = box.querySelector('.blog-details a'); back.href = 'blog.html'; back.textContent = 'BLOGGA QAYTISH';
            }
        });
        if (query.has('article') && (!Number.isInteger(article) || article < 1 || article > boxes.length)) {
            const note = document.createElement('div'); note.className = 'empty-state'; note.innerHTML = '<h2>Maqola topilmadi</h2><p>Bu havola bo‘yicha maqola yo‘q.</p><a class="button" href="blog.html">Blogga qaytish</a>'; $('#blog').append(note);
        }
        if (article || query.has('article')) $('#pagination').hidden = true;
        $$('#pagination a').forEach((link, index) => {
            if (index < 2 && index + 1 === current) link.setAttribute('aria-current', 'page');
            if (index === 2 && current === 2) link.hidden = true;
        });
    }

    function authTab(tab) {
        const signup = tab === 'signup';
        $('#LoginForm').hidden = signup;
        $('#RegForm').hidden = !signup;
        $$('.form-btn button').forEach(button => {
            const active = button.id === (signup ? 'signup' : 'signin');
            button.setAttribute('aria-selected', String(active));
            button.tabIndex = active ? 0 : -1;
        });
        const feedback = $('#auth-feedback'); if (feedback) feedback.textContent = '';
    }
    if (page === 'login.html') {
        authTab(location.hash === '#signup' ? 'signup' : 'signin');
        window.addEventListener('hashchange', () => authTab(location.hash === '#signup' ? 'signup' : 'signin'));
        $$('.form-btn button').forEach((button, i) => {
            button.addEventListener('click', () => { authTab(button.id); location.hash = button.id; });
            button.addEventListener('keydown', event => {
                if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - i;
                const target = $$('.form-btn button')[next]; authTab(target.id); location.hash = target.id; target.focus();
            });
        });
        $$('#LoginForm, #RegForm').forEach(form => {
            [...form.querySelectorAll('input')].forEach(input => {
                input.required = true;
                input.setAttribute('aria-label', input.placeholder);
                input.name = input.type === 'email' ? 'email' : input.type === 'password' ? 'password' : 'username';
                input.autocomplete = input.type === 'password' ? (form.id === 'RegForm' ? 'new-password' : 'current-password') : input.name;
                input.maxLength = input.type === 'password' ? 128 : input.type === 'email' || form.id === 'LoginForm' ? 150 : 30;
                if (form.id === 'LoginForm' && input.type === 'text') {
                    input.placeholder = 'Foydalanuvchi nomi yoki email';
                    input.setAttribute('aria-label', input.placeholder);
                }
                if (form.id === 'RegForm') input.minLength = input.type === 'password' ? 8 : input.type === 'text' ? 3 : 5;
            });
            form.addEventListener('submit', event => {
                event.preventDefault();
                if (!form.reportValidity()) return;
                if (window.CARA_COMMERCE) {
                    window.CARA_COMMERCE.authenticate(form);
                    return;
                }
                form.querySelector('input[type="password"]').value = '';
                message('Kirish xizmati hozircha faol emas', 'Hisob yaratish va kirish xizmati hali ulanmagan. Hisob yaratilmadi, parolingiz yuborilmadi va saqlanmadi.');
            });
        });
    }
    const contact = $('#contact-form');
    if (contact) {
        if (query.has('subject')) contact.elements.namedItem('subject').value = query.get('subject').slice(0, 150);
        contact.addEventListener('submit', event => {
            event.preventDefault();
            if (!contact.reportValidity()) return;
            if (['name','subject','message'].some(name => !contact.elements.namedItem(name).value.trim())) {
                message('Formani to‘ldiring', 'Ism, mavzu va xabarni kiriting.'); return;
            }
            const fields = Object.fromEntries(new FormData(contact));
            const text = `Assalomu alaykum!\nIsm: ${fields.name.trim()}\nMavzu: ${fields.subject.trim()}\n\n${fields.message.trim()}`;
            location.href = store.whatsapp + '?text=' + encodeURIComponent(text);
        });
    }
    window.addEventListener('storage', event => {
        if (event.key !== null && !event.key.startsWith('cara.connections.')) return;
        renderCart(); updateCartLabels();
        document.dispatchEvent(new CustomEvent('cara:cart-updated'));
        if (page === 'shop.html' && query.get('wishlist') === '1') location.reload();
        if (page === 'sproduct.html') {
            const button = $('[data-wishlist-toggle]'); const selected = new URLSearchParams(location.search).get('id');
            if (button && product(selected)) { button.textContent = wishlist().includes(selected) ? 'Saqlanganlardan olish' : 'Saqlab qo‘yish'; button.setAttribute('aria-pressed', String(wishlist().includes(selected))); }
        }
    });
    updateCartLabels();
    window.CARA_FRONTEND = {cart, wishlist, money, product, add, save, message, updateCartLabels};
})();


