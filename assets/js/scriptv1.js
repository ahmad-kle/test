// ============================================
// TAQWA STORE — SCRIPT V1 (index.html + about.html)
// ============================================

const firebaseConfig = window.TAQWA_CONFIG.firebase;
if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

if (window.taqwaFirebaseConfigured && !window.taqwaFirebaseConfigured()) {
    window.addEventListener('load', () => setTimeout(() => {
        if (typeof showToast === 'function') showToast('تنبيه: أضف إعدادات Firebase في assets/js/taqwa-config.js', true);
    }, 700));
}

// ============================================
// GLOBALS
// ============================================
let cart = [];
let products = [];
let categories = [];
let coupons = [];
let appliedCoupon = null;
let currentFilter = 'all';
let currentCategoryFilter = 'all';
let searchQueryHome = '';
let paymentBarcodeSettings = { enabled: false, image: '', title: '', description: '' };
let homeDisplayLimit = 20;
let homeRandomProducts = null;
let paymentReceiptUploading = false;
let homeLoadObserver = null;
let homeAutoLoadBusy = false;
let selectedPaymentMethod = 'shamcash';
let realtimeListeners = {};
let currentProductOptions = null;
let pendingOrderData = null;
let paymentReceiptBase64 = null;

// ============================================
// HELPERS
// ============================================
function formatPrice(price) { return parseFloat(price || 0).toFixed(2); }

function getOptimizedImage(url, width = 400, quality = 'auto:eco') {
    if (!url) return '';
    if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;

    // Replace an existing Cloudinary transformation instead of stacking a new one.
    // Stacked transformations can create unnecessary derived assets and increase usage.
    const safeWidth = Math.max(40, Math.min(1600, Math.round(Number(width) || 400)));
    const parts = url.split('/upload/');
    if (parts.length !== 2) return url;
    const pathParts = parts[1].split('/');
    const first = pathParts[0] || '';
    const isTransformation = /^(?:q_|f_|w_|h_|c_|dpr_|ar_|g_|e_|fl_|t_)/.test(first);
    const transform = `q_${quality},f_auto,w_${safeWidth},c_limit`;
    if (isTransformation) pathParts[0] = transform;
    else pathParts.unshift(transform);
    return parts[0] + '/upload/' + pathParts.join('/');
}

function generateTrackingCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = 'TAQ-';
    for (let i = 0; i < 6; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return r;
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function getColorBg(color) {
    const m = { 'أحمر': '#ffcdd2', 'أزرق': '#efe1c1', 'أخضر': '#c8e6c9', 'أصفر': '#fff9c4', 'أسود': '#424242', 'أبيض': '#f5f5f5', 'وردي': '#f8bbd0', 'ذهبي': '#fff8e1', 'فضي': '#ececec', 'بنفسجي': '#e1bee7' };
    return m[color] || '#e1dacb';
}

// ============================================
// CSS الإضافي
// ============================================
(function injectHomeStyles() {
    if (document.getElementById('taqwaHomeFilterStyles')) return;
    const st = document.createElement('style');
    st.id = 'taqwaHomeFilterStyles';
    st.textContent = `
        .taqwa-category-card.active {
            box-shadow: 0 0 0 3px var(--primary, #9f7928), 0 12px 32px rgba(159,121,40,0.25) !important;
            transform: translateY(-4px) !important;
            position: relative;
        }
        .taqwa-category-card.active::before {
            content: "\\f00c";
            font-family: "Font Awesome 6 Free";
            font-weight: 900;
            position: absolute;
            top: 12px;
            left: 12px;
            z-index: 5;
            background: #9f7928;
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.9rem;
            box-shadow: 0 4px 12px rgba(159,121,40,0.3);
        }
        .taqwa-category-card.active .taqwa-cat-content i.fa-arrow-left {
            transform: rotate(180deg);
            background: #9f7928 !important;
        }
        .taqwa-category-card .taqwa-cat-content i.fa-arrow-left { transition: transform 0.3s ease; }

        .taqwa-active-filter-chip {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            background: linear-gradient(135deg, #9f7928, #cd9e37);
            color: white;
            padding: 10px 14px 10px 18px;
            border-radius: 30px;
            font-size: 0.9rem;
            font-weight: 700;
            margin-bottom: 18px;
            box-shadow: 0 6px 18px rgba(159,121,40,0.25);
            animation: chipIn 0.35s ease;
        }
        @keyframes chipIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        .taqwa-active-filter-chip button {
            background: rgba(255,255,255,0.25);
            border: none;
            color: white;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 0.75rem;
            transition: background 0.2s;
        }
        .taqwa-active-filter-chip button:hover { background: rgba(255,255,255,0.4); }

        /* اقتراحات البحث — قوية جداً لضمان الظهور */
        #homeSearchSuggestions {
            position: absolute !important;
            top: calc(100% + 6px) !important;
            left: 0 !important;
            right: 0 !important;
            z-index: 999999 !important;
            background: #ffffff !important;
            border: 1px solid #f2e5c9 !important;
            border-radius: 16px !important;
            box-shadow: 0 15px 45px rgba(159,121,40,0.25) !important;
            max-height: 360px !important;
            overflow-y: auto !important;
            display: none;
        }
        #homeSearchSuggestions.active { display: block !important; }
        #homeSearchSuggestions .suggestion-item {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
            padding: 10px 14px !important;
            cursor: pointer !important;
            border-bottom: 1px solid #f9f6f0 !important;
            transition: background 0.2s !important;
        }
        #homeSearchSuggestions .suggestion-item:last-child { border-bottom: none !important; }
        #homeSearchSuggestions .suggestion-item:hover { background: #fcf8f1 !important; }
        #homeSearchSuggestions .suggestion-item img {
            width: 42px !important;
            height: 42px !important;
            border-radius: 10px !important;
            object-fit: cover !important;
            flex-shrink: 0 !important;
        }
        #homeSearchSuggestions .suggestion-name {
            font-weight: 700 !important;
            color: #2a2314 !important;
            font-size: 0.9rem !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        #homeSearchSuggestions .suggestion-price {
            font-size: 0.8rem !important;
            color: #9f7928 !important;
            font-weight: 800 !important;
            margin-top: 3px !important;
        }
        .taqwa-search-highlight { outline: 3px solid #9f7928 !important; outline-offset: 4px !important; }
        #homeSearchSuggestions .suggestion-empty {
            padding: 18px !important;
            text-align: center !important;
            color: #aea89c !important;
            font-size: 0.9rem !important;
        }
    `;
    document.head.appendChild(st);
})();

// ============================================
// BULK PRICING
// ============================================
function normalizeBulkTiers(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map(t => ({ qty: parseInt(t.qty) || 0, price: parseFloat(t.price) || 0 }))
        .filter(t => t.qty >= 2 && t.price > 0)
        .sort((a, b) => a.qty - b.qty);
}

function getIndividualBulkPrice(item, qty) {
    if (!item) return { price: parseFloat(item && item.price) || 0, applied: false, tier: null };
    const basePrice = parseFloat(item.price) || 0;
    const tiers = normalizeBulkTiers(item.bulkPricing || []);
    const count = parseInt(qty, 10) || 0;
    const eligible = tiers.filter(tier => count >= tier.qty);
    if (!eligible.length) return { price: basePrice, applied: false, tier: null };
    const tier = eligible[eligible.length - 1];
    return { price: tier.price, applied: tier.price < basePrice, tier };
}

function getEffectivePrice(item) {
    if (!item) return 0;
    const basePrice = parseFloat(item.price) || 0;
    const getTiers = (entry) => {
        const product = products.find(p => String(p.id) === String(entry.id));
        return normalizeBulkTiers((product && product.bulkPricing) || entry.bulkPricing || []);
    };

    // تفعيل أسعار الجملة للطلبية كلها إذا حقق أي منتج حدّ الجملة الخاص به.
    const wholesaleOrderActive = Array.isArray(cart) && cart.some(cartItem => {
        const tiers = getTiers(cartItem);
        return tiers.some(tier => (parseInt(cartItem.qty) || 0) >= tier.qty);
    });
    const tiers = getTiers(item);
    if (!tiers.length || !wholesaleOrderActive) return basePrice;

    // بعد تفعيل الجملة، كل منتج يأخذ سعر الجملة الخاص به؛ نستخدم أول شريحة
    // (أقل حد كمية) للمنتجات الأخرى حتى لو لم تبلغ كميتها حدّها الفردي.
    return tiers[0].price;
}

// ============================================
// DESIGNER CREDIT
// ============================================
function getDesignerCredit(style = 'minimal') {
    if (style === 'light') return `<div style="margin-top:12px;padding-top:10px;border-top:1px solid #f2e5c9;text-align:center;font-size:0.7rem;color:#aea89c"><i class="fas fa-code" style="color:#9f7928;font-size:0.65rem"></i> تصميم <strong style="color:#9f7928">المهندس أحمد كلاوي</strong> © 2026</div>`;
    if (style === 'minimal') return `<div style="margin-top:10px;padding-top:8px;border-top:1px dashed #f2e5c9;text-align:center;font-size:0.65rem;color:#aea89c"><i class="fas fa-code" style="color:#9f7928"></i> <strong style="color:#9f7928">المهندس أحمد كلاوي</strong></div>`;
    return '';
}

// ============================================
// TOAST
// ============================================
let toastTimeout = null;
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    if (toastTimeout) clearTimeout(toastTimeout);
    toast.classList.remove('active');
    toast.style.background = isError ? '#ff4757' : 'linear-gradient(135deg, #9f7928, #cd9e37)';
    toastMessage.textContent = message;
    setTimeout(() => toast.classList.add('active'), 10);
    toastTimeout = setTimeout(() => { toast.classList.remove('active'); toastTimeout = null; }, 3000);
}

// ============================================
// CART STORAGE
// ============================================
function saveCartToLocal() { localStorage.setItem('taqwa_cart', JSON.stringify(cart)); }
function loadCartFromLocal() {
    const s = localStorage.getItem('taqwa_cart');
    if (s) { try { cart = JSON.parse(s); } catch(e) { cart = []; } updateCartUI(); }
}
function saveCouponToLocal() { if (appliedCoupon) localStorage.setItem('taqwa_coupon', JSON.stringify(appliedCoupon)); else localStorage.removeItem('taqwa_coupon'); }
function loadCouponFromLocal() { const s = localStorage.getItem('taqwa_coupon'); if (s) { try { appliedCoupon = JSON.parse(s); } catch(e) { appliedCoupon = null; } } }

async function verifyCartAgainstDatabase() {
    // نتحقق من قاعدة البيانات مباشرةً، وليس من قائمة المنتجات المحمّلة سابقاً فقط.
    if (!window.taqwaFirebaseConfigured || !window.taqwaFirebaseConfigured()) {
        showToast('تعذّر التحقق من المنتجات الآن. حدّث الصفحة وحاول مجدداً.', true);
        return false;
    }
    try {
        const snap = await db.ref('products').once('value');
        const raw = snap.val() || {};
        const latest = Array.isArray(raw)
            ? raw.filter(Boolean).map((p, i) => ({ ...p, id: p.id || String(i) }))
            : Object.entries(raw).map(([id, p]) => ({ ...(p || {}), id: (p && p.id) || id }));
        const missing = [];
        const unavailable = [];
        for (const item of cart) {
            const product = latest.find(p => String(p.id) === String(item.id));
            if (!product || product.deleted === true || product.active === false || product.available === false) {
                missing.push(item.name || 'منتج');
                continue;
            }
            if (product.quantity !== undefined && Number(product.quantity) <= 0) unavailable.push(item.name || 'منتج');
        }
        if (missing.length || unavailable.length) {
            const bad = new Set([...missing, ...unavailable]);
            cart = cart.filter(item => !bad.has(item.name || 'منتج'));
            saveCartToLocal();
            updateCartUI();
            showToast(missing.length ? `لا يمكن إرسال الطلب: المنتج لم يعد موجوداً (${missing.join('، ')}). تم تحديث السلة.` : `المنتج غير متوفر حالياً (${unavailable.join('، ')}). تم تحديث السلة.`, true);
            return false;
        }
        // حدّث بيانات المنتجات من النسخة الأحدث قبل حساب السعر والإرسال.
        products = latest;
        return true;
    } catch (err) {
        console.error('Cart validation failed:', err);
        showToast('تعذّر التحقق من المنتجات من قاعدة البيانات. لم يتم إرسال الطلب.', true);
        return false;
    }
}

function filterOutOfStockItems() {
    if (products.length === 0) return false;
    let removed = false;
    cart = cart.filter(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) { removed = true; return false; }
        if (product.quantity !== undefined && product.quantity <= 0) {
            removed = true;
            showToast(`⚠️ تم إزالة "${item.name}" لأنه غير متوفر`, true);
            return false;
        }
        return true;
    });
    if (removed) { saveCartToLocal(); updateCartUI(); }
    return removed;
}

// ============================================
// CART OPERATIONS
// ============================================
function addToCart(product, selectedSize = null, selectedColor = null) {
    if (!product) return;
    if (product.quantity !== undefined && product.quantity <= 0) {
        showToast('⚠️ هذا المنتج غير متوفر حالياً', true);
        return;
    }
    const existing = cart.findIndex(it => it.id === product.id && it.selectedSize === selectedSize && it.selectedColor === selectedColor);
    if (existing !== -1) cart[existing].qty++;
    else cart.push({ ...product, qty: 1, selectedSize: selectedSize || null, selectedColor: selectedColor || null });
    saveCartToLocal();
    updateCartUI();
    showToast('✨ تمت الإضافة إلى السلة!');
}

function removeFromCart(index) { cart.splice(index, 1); saveCartToLocal(); updateCartUI(); }

function updateQty(index, change) {
    if (!cart[index]) return;
    if (change > 0) {
        const product = products.find(p => p.id === cart[index].id);
        if (product && product.quantity !== undefined && product.quantity <= 0) {
            showToast('⚠️ المنتج غير متوفر', true);
            removeFromCart(index);
            return;
        }
    }
    cart[index].qty += change;
    if (cart[index].qty <= 0) removeFromCart(index);
    else { saveCartToLocal(); updateCartUI(); }
}

// ============================================
// COUPONS
// ============================================
function isCouponValid(coupon, subtotal) {
    if (!coupon) return false;
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return false;
    if (coupon.expiryDate && Date.now() > coupon.expiryDate) return false;
    if (coupon.minAmount && subtotal < coupon.minAmount) return false;
    return true;
}

function getCouponDiscount() {
    if (!appliedCoupon) return 0;
    const subtotal = cart.reduce((s, it) => s + (getEffectivePrice(it) * it.qty), 0);
    if (!isCouponValid(appliedCoupon, subtotal)) { appliedCoupon = null; saveCouponToLocal(); return 0; }
    let d = 0;
    const v = parseFloat(appliedCoupon.value);
    if (appliedCoupon.type === 'percentage') d = (subtotal * v) / 100;
    else d = v;
    if (d > subtotal) d = subtotal;
    return d;
}

function calculateTotals() {
    const subtotal = cart.reduce((s, it) => s + (getEffectivePrice(it) * it.qty), 0);
    const discount = getCouponDiscount();
    const discountMessage = appliedCoupon ? (appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}% خصم` : `${appliedCoupon.value}$ خصم`) : '';
    const finalTotal = subtotal - discount;
    return { subtotal, discount, discountMessage, finalTotal };
}

function applyCoupon(code) {
    const coupon = coupons.find(c => c.code === code.toUpperCase());
    if (!coupon) { showToast('❌ كود غير صالح', true); return false; }
    const subtotal = cart.reduce((s, it) => s + (getEffectivePrice(it) * it.qty), 0);
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) { showToast(`❌ تم استخدام الكود ${coupon.usageLimit} مرة`, true); return false; }
    if (coupon.expiryDate && Date.now() > coupon.expiryDate) { showToast('❌ انتهت الصلاحية', true); return false; }
    if (coupon.minAmount && subtotal < coupon.minAmount) { showToast(`❌ الحد الأدنى ${coupon.minAmount}$`, true); return false; }
    appliedCoupon = { id: coupon.id, code: coupon.code, type: coupon.type, value: coupon.value, usedCount: coupon.usedCount || 0, usageLimit: coupon.usageLimit, minAmount: coupon.minAmount, expiryDate: coupon.expiryDate };
    saveCouponToLocal();
    updateCartUI();
    const dv = coupon.type === 'percentage' ? `${coupon.value}%` : `${coupon.value}$`;
    const rem = coupon.usageLimit ? (coupon.usageLimit - (coupon.usedCount || 0)) : 'غير محدود';
    showToast(`✅ تم تطبيق ${coupon.code} (خصم ${dv}) - تبقى ${rem} استخدام`);
    return true;
}

function removeCoupon() {
    appliedCoupon = null;
    saveCouponToLocal();
    updateCartUI();
    showToast('تم إلغاء كود الخصم');
}

// ============================================
// CART UI
// ============================================
function updateCartUI() {
    filterOutOfStockItems();
    const totalItems = cart.reduce((s, it) => s + it.qty, 0);
    const { subtotal, discount, discountMessage, finalTotal } = calculateTotals();

    const cartCount = document.getElementById('cartCount');
    const totalPrice = document.getElementById('totalPrice');
    const cartItemsDiv = document.getElementById('cartItems');
    const cartEmptyDiv = document.getElementById('cartEmpty');
    const cartFooterDiv = document.getElementById('cartFooter');

    if (cartCount) cartCount.textContent = totalItems;
    if (totalPrice) totalPrice.textContent = formatPrice(finalTotal) + ' $';

    if (cart.length === 0) {
        if (cartItemsDiv) cartItemsDiv.innerHTML = '';
        if (cartEmptyDiv) cartEmptyDiv.style.display = 'flex';
        if (cartFooterDiv) cartFooterDiv.style.display = 'none';
    } else {
        if (cartEmptyDiv) cartEmptyDiv.style.display = 'none';
        if (cartFooterDiv) cartFooterDiv.style.display = 'block';
        if (cartItemsDiv) {
            cartItemsDiv.innerHTML = cart.map((item, idx) => {
                const eff = getEffectivePrice(item);
                const isDisc = eff < parseFloat(item.price);
                return `
                <div class="cart-item">
                    <div class="cart-item-img"><img src="${getOptimizedImage(item.image, 80)}" alt="${item.name}"></div>
                    <div class="cart-item-details">
                        <div class="cart-item-name">${item.name}</div>
                        ${item.selectedSize ? `<div class="cart-item-size"><i class="fas fa-ruler"></i> المقاس: ${item.selectedSize}</div>` : ''}
                        ${item.selectedColor ? `<div class="cart-item-color"><i class="fas fa-palette"></i> اللون: ${item.selectedColor}</div>` : ''}
                        <div class="cart-item-price">
                            <span class="cart-unit-price">${formatPrice(eff)} $ <small style="font-size:.72em;font-weight:500;color:#8a7f69">للقطعة</small></span>
                            ${eff < parseFloat(item.price) ? `<div style="font-size:.76rem;color:#16834a;margin-top:3px;font-weight:700">✓ تم تطبيق سعر الجملة <del style="color:#9c9380;font-weight:500">${formatPrice(item.price)} $</del></div>` : ''}
                            <div style="font-size:.8rem;color:#9f7928;margin-top:4px">إجمالي المنتج: ${formatPrice(eff * item.qty)} $</div>
                        </div>
                        <div class="cart-item-qty">
                            <button class="qty-btn" onclick="updateQty(${idx}, -1)">-</button>
                            <span class="qty-value">${item.qty}</span>
                            <button class="qty-btn" onclick="updateQty(${idx}, 1)">+</button>
                            <button class="remove-item" onclick="removeFromCart(${idx})"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }

        document.querySelectorAll('.coupon-section').forEach(el => el.remove());
        const couponSection = document.createElement('div');
        couponSection.className = 'coupon-section';
        if (appliedCoupon) {
            const rem = appliedCoupon.usageLimit ? (appliedCoupon.usageLimit - (appliedCoupon.usedCount || 0)) : 'غير محدود';
            couponSection.innerHTML = `
                <div class="coupon-discount" style="display:flex;justify-content:space-between;margin-bottom:8px">
                    <span>الخصم (${discountMessage}):</span>
                    <span style="color:#2ed573">- ${formatPrice(discount)} $</span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <span style="color:#9f7928">✓ ${appliedCoupon.code} مطبق (تبقى ${rem})</span>
                    <button onclick="removeCoupon()" style="background:none;border:none;color:#ff4757;cursor:pointer">إلغاء</button>
                </div>`;
        } else {
            couponSection.innerHTML = `
                <div style="font-size:0.85rem;color:#aea89c;margin-bottom:8px">🎫 هل لديك كود خصم؟</div>
                <div class="coupon-input-group" style="display:flex;gap:8px">
                    <input type="text" id="couponInput" placeholder="أدخل كود الخصم" style="flex:1;padding:8px 12px;border:1px solid #f2e5c9;border-radius:50px">
                    <button onclick="applyCoupon(document.getElementById('couponInput').value)" style="padding:8px 16px;background:linear-gradient(135deg,#9f7928,#cd9e37);color:white;border:none;border-radius:50px;cursor:pointer">تطبيق</button>
                </div>`;
        }
        cartFooterDiv.parentNode.insertBefore(couponSection, cartFooterDiv);
    }

    const cartFooterEl = document.getElementById('cartFooter');
    if (cartFooterEl) {
        const ex = cartFooterEl.querySelector('.designer-credit-cart');
        if (ex) ex.remove();
        // لا نضيف توقيع المصمم داخل السلة.
    }

    const orderItemCount = document.getElementById('orderItemCount');
    const orderSubtotal = document.getElementById('orderSubtotal');
    const orderTotal = document.getElementById('orderTotal');
    if (orderItemCount) orderItemCount.textContent = totalItems;
    if (orderSubtotal) orderSubtotal.textContent = formatPrice(subtotal) + ' $';
    if (orderTotal) orderTotal.textContent = formatPrice(finalTotal) + ' $';

    const legacyGift = document.getElementById('orderGiftWrap');
    if (legacyGift) legacyGift.style.display = 'none';
}

// ============================================
// DATA LOADING
// ============================================
async function loadSettings() {
    try {
        const localBarcode = localStorage.getItem('taqwa_paymentBarcodeSettings');
        if (localBarcode) { try { paymentBarcodeSettings = JSON.parse(localBarcode); } catch(e) {} }
        try {
            const snap = await db.ref('settings/paymentBarcode').once('value');
            if (snap.exists()) paymentBarcodeSettings = snap.val();
        } catch(e) {}
    } catch(err) { console.error(err); }
}

async function loadData() {
    try {
        await loadSettings();
        const [catSnap, prodSnap, coupSnap] = await Promise.all([
            db.ref('categories').once('value'),
            db.ref('products').once('value'),
            db.ref('coupons').once('value')
        ]);
        categories = catSnap.exists() ? Object.keys(catSnap.val()).map(k => ({ id: k, ...catSnap.val()[k] })) : [];
        products = prodSnap.exists() ? Object.keys(prodSnap.val()).map(k => ({ id: k, ...prodSnap.val()[k] })) : [];
        coupons = coupSnap.exists() ? Object.keys(coupSnap.val()).map(k => ({ id: k, ...coupSnap.val()[k] })) : [];

        categories = categories.filter(c => c.active !== false).sort((a,b) => (a.order||0)-(b.order||0));
        products = products.filter(p => p.active !== false);
        coupons = coupons.filter(c => c.active !== false);

        renderNavbar();
        renderCategoriesGrid();
        renderFilterTabs();
        renderProducts();
        updateProductsTitle();
        updateActiveFilterChip();
        setupRealtimeListeners();
        updateCartUI();
    } catch (err) {
        console.error(err);
        showToast('خطأ في تحميل البيانات', true);
    }
}

function setupRealtimeListeners() {
    if (realtimeListeners.products) db.ref('products').off('value', realtimeListeners.products);
    realtimeListeners.products = db.ref('products').on('value', (snap) => {
        if (!snap.exists()) return;
        products = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] })).filter(p => p.active !== false);
        renderProducts();
        renderCategoriesGrid();
        updateActiveFilterChip();
        filterOutOfStockItems();
    });
    if (realtimeListeners.categories) db.ref('categories').off('value', realtimeListeners.categories);
    realtimeListeners.categories = db.ref('categories').on('value', (snap) => {
        if (!snap.exists()) return;
        categories = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] })).filter(c => c.active !== false).sort((a,b)=>(a.order||0)-(b.order||0));
        renderNavbar();
        renderCategoriesGrid();
        renderFilterTabs();
    });
    if (realtimeListeners.coupons) db.ref('coupons').off('value', realtimeListeners.coupons);
    realtimeListeners.coupons = db.ref('coupons').on('value', (snap) => {
        if (!snap.exists()) return;
        coupons = Object.keys(snap.val()).map(k => ({ id: k, ...snap.val()[k] })).filter(c => c.active !== false);
        if (appliedCoupon) {
            const up = coupons.find(c => c.id === appliedCoupon.id);
            if (up) { appliedCoupon = { ...appliedCoupon, usedCount: up.usedCount }; saveCouponToLocal(); }
            else { appliedCoupon = null; saveCouponToLocal(); }
            updateCartUI();
        }
    });
}

// ============================================
// NAVBAR
// ============================================
function renderNavbar() {
    const navList = document.getElementById('navList');
    if (!navList) return;
    let homeLi = navList.querySelector('li[data-category="all"]');
    if (!homeLi) {
        navList.innerHTML = '<li class="nav-item active" data-category="all"><a href="index.html"><i class="fas fa-home"></i> الرئيسية</a></li>';
        homeLi = navList.querySelector('li[data-category="all"]');
    }
    navList.querySelectorAll('li[data-category]:not([data-category="all"])').forEach(el => el.remove());
    categories.forEach(cat => {
        if (cat.active === false) return;
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.setAttribute('data-category', cat.id);
        if (cat.image) li.innerHTML = `<a href="category.html?cat=${cat.id}"><img src="${getOptimizedImage(cat.image, 50)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;margin-left:5px"> ${cat.name}</a>`;
        else li.innerHTML = `<a href="category.html?cat=${cat.id}"><i class="fas fa-tag"></i> ${cat.name}</a>`;
        navList.appendChild(li);
    });
}

// ============================================
// CATEGORIES GRID — عند الضغط نفلتر المنتجات تحته
// ============================================
function renderCategoriesGrid() {
    const grid = document.getElementById('dynamicCategoriesGrid');
    if (!grid) return;
    if (categories.length === 0) {
        grid.innerHTML = '<div class="taqwa-empty-products"><i class="fas fa-layer-group"></i><h3>لا توجد أقسام بعد</h3><p>سيتم عرض الأقسام هنا عند إضافتها من لوحة الإدارة.</p></div>';
        return;
    }
    grid.innerHTML = categories.map((cat, idx) => {
        const img = cat.image || 'https://via.placeholder.com/800x400?text=' + encodeURIComponent(cat.name);
        const idxStr = String(idx + 1).padStart(2, '0');
        const isActive = currentCategoryFilter === cat.id;
        return `
            <div class="taqwa-category-card ${isActive ? 'active' : ''}" data-cat-id="${cat.id}" onclick="selectCategoryFromGrid('${cat.id}')" style="cursor:pointer">
                <span class="taqwa-card-index">${idxStr}</span>
                <div class="taqwa-cat-image-wrapper">
                    <img src="${getOptimizedImage(img, 400)}" alt="${cat.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/800x400?text=Category'">
                </div>
                <div class="taqwa-cat-content">
                    <div class="taqwa-cat-text">
                        <h3>${cat.name}</h3>
                        <p>اضغط لعرض منتجات القسم</p>
                    </div>
                    <i class="fas fa-arrow-left"></i>
                </div>
            </div>`;
    }).join('');
}

window.selectCategoryFromGrid = function(catId) {
    if (currentCategoryFilter === catId) {
        currentCategoryFilter = 'all';
    } else {
        currentCategoryFilter = catId;
    }
    searchQueryHome = '';
    const inp = document.getElementById('searchInput');
    if (inp) inp.value = '';
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.classList.remove('visible');

    renderCategoriesGrid();
    renderFilterTabs();
    renderProducts();
    updateProductsTitle();
    updateActiveFilterChip();
    scrollToProducts();
};

// ============================================
// FILTER TABS
// ============================================
function renderFilterTabs() {
    const wrap = document.getElementById('filterTabs');
    if (!wrap) return;
    const tabs = [
        { id: 'all', label: 'الكل', icon: 'fa-th-large' },
        { id: 'offers', label: 'العروض', icon: 'fa-tag' },
        { id: 'newest', label: 'الأحدث', icon: 'fa-star' }
    ];
    wrap.innerHTML = tabs.map(t => {
        const isActive = currentFilter === t.id && (currentCategoryFilter === 'all') && !searchQueryHome;
        return `<button class="filter-tab ${isActive ? 'active' : ''}" data-filter="${t.id}"><i class="fas ${t.icon}"></i> ${t.label}</button>`;
    }).join('');
    wrap.querySelectorAll('.filter-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            currentCategoryFilter = 'all';
            searchQueryHome = '';
            const inp = document.getElementById('searchInput');
            if (inp) inp.value = '';
            const clearBtn = document.getElementById('clearSearchBtn');
            if (clearBtn) clearBtn.classList.remove('visible');
            renderCategoriesGrid();
            renderFilterTabs();
            renderProducts();
            updateProductsTitle();
            updateActiveFilterChip();
        });
    });
}

// ============================================
// UPDATE TITLE + CHIP
// ============================================
function updateProductsTitle() {
    const title = document.querySelector('#productsSection .section-header h2');
    if (!title) return;
    if (searchQueryHome) {
        title.innerHTML = `<i class="fas fa-search"></i> نتائج البحث عن "${searchQueryHome}"`;
    } else if (currentCategoryFilter && currentCategoryFilter !== 'all') {
        const cat = categories.find(c => c.id === currentCategoryFilter);
        if (cat) title.innerHTML = `<i class="fas fa-gears"></i> منتجات ${cat.name}`;
    } else if (currentFilter === 'offers') {
        title.innerHTML = `<i class="fas fa-tag"></i> العروض الحالية`;
    } else if (currentFilter === 'newest') {
        title.innerHTML = `<i class="fas fa-star"></i> أحدث المنتجات`;
    } else {
        title.innerHTML = `<i class="fas fa-gears"></i> قطع مختارة لعشاق الطريق`;
    }
}

function updateActiveFilterChip() {
    let chip = document.getElementById('taqwaActiveFilterChip');
    let label = '';
    if (searchQueryHome) {
        label = `🔍 البحث: "${searchQueryHome}"`;
    } else if (currentCategoryFilter && currentCategoryFilter !== 'all') {
        const cat = categories.find(c => c.id === currentCategoryFilter);
        if (cat) label = `📂 القسم: ${cat.name}`;
    } else if (currentFilter === 'offers') {
        label = '🏷️ العروض';
    } else if (currentFilter === 'newest') {
        label = '⭐ الأحدث';
    }

    if (chip) chip.remove();
    if (!label) return;
    const productsSection = document.getElementById('productsSection');
    if (!productsSection) return;
    const sectionHeader = productsSection.querySelector('.section-header');
    if (!sectionHeader) return;

    chip = document.createElement('div');
    chip.id = 'taqwaActiveFilterChip';
    chip.className = 'taqwa-active-filter-chip';
    chip.innerHTML = `
        <span>${label}</span>
        <button onclick="clearAllHomeFilters()" title="إلغاء الفلتر"><i class="fas fa-times"></i></button>
    `;
    sectionHeader.insertAdjacentElement('afterend', chip);
}

window.clearAllHomeFilters = function() {
    currentCategoryFilter = 'all';
    searchQueryHome = '';
    currentFilter = 'all';
    const inp = document.getElementById('searchInput');
    if (inp) inp.value = '';
    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn) clearBtn.classList.remove('visible');
    renderCategoriesGrid();
    renderFilterTabs();
    renderProducts();
    updateProductsTitle();
    updateActiveFilterChip();
};

function scrollToProducts() {
    const ps = document.getElementById('productsSection');
    if (!ps) return;
    const offset = 90;
    const top = ps.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo({ top, behavior: 'smooth' });
}

// ============================================
// PRODUCTS RENDER (Home)
// ============================================
function renderProducts(appendOnly = false) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    let filtered = products.filter(p => p.active !== false);

    if (currentCategoryFilter && currentCategoryFilter !== 'all') {
        filtered = filtered.filter(p => p.categoryId === currentCategoryFilter);
    }

    if (searchQueryHome) {
        const lower = searchQueryHome.toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(lower) ||
            (p.code && p.code.toLowerCase().includes(lower)) ||
            (p.desc && p.desc.toLowerCase().includes(lower))
        );
    }

    if (currentFilter === 'offers') {
        filtered = filtered.filter(p => p.oldprice && parseFloat(p.oldprice) > parseFloat(p.price));
    } else if (currentFilter === 'newest') {
        filtered = [...filtered].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }

    // ترتيب عشوائي ثابت خلال دفعات التحميل حتى لا تتكرر المنتجات أو تختفي.
    const homeLoadMarker = document.getElementById('homeLoadMoreWrap');
    if (homeLoadMarker) {
        if (appendOnly && Array.isArray(homeRandomProducts)) {
            const byId = new Map(filtered.map(p => [String(p.id), p]));
            filtered = homeRandomProducts.map(p => byId.get(String(p.id))).filter(Boolean);
            const seen = new Set(filtered.map(p => String(p.id)));
            filtered.push(...shuffleArray(Array.from(byId.values()).filter(p => !seen.has(String(p.id)))));
            homeRandomProducts = filtered.slice();
        } else {
            homeRandomProducts = shuffleArray(filtered);
            filtered = homeRandomProducts.slice();
        }
    }

    if (filtered.length === 0) {
        const lm = document.getElementById('homeLoadMoreWrap'); if (lm) lm.style.display = 'none';
        let msg = 'لا توجد منتجات';
        if (searchQueryHome) msg = `لا توجد نتائج لـ "${searchQueryHome}"`;
        else if (currentCategoryFilter !== 'all') {
            const cat = categories.find(c => c.id === currentCategoryFilter);
            msg = cat ? `لا توجد منتجات في قسم "${cat.name}"` : 'لا توجد منتجات';
        }
        grid.innerHTML = `<div class="taqwa-empty-products"><i class="fas fa-box-open"></i><h3>${msg}</h3><p>جرّب تصنيفاً آخر أو ابحث بكلمة مختلفة.</p></div>`;
        return;
    }

    const loadMoreWrap = document.getElementById('homeLoadMoreWrap');
    const loadMoreBtn = document.getElementById('homeLoadMoreBtn');
    const isHomeProductsGrid = !!loadMoreWrap && !!loadMoreBtn;
    const totalFiltered = filtered.length;
    let startIndex = 0;
    if (isHomeProductsGrid) {
        const alreadyRendered = appendOnly
            ? grid.querySelectorAll('.product-card').length
            : 0;
        startIndex = Math.min(alreadyRendered, homeDisplayLimit);
        filtered = filtered.slice(startIndex, homeDisplayLimit);
        const hasMore = totalFiltered > homeDisplayLimit;
        loadMoreWrap.style.display = hasMore || homeAutoLoadBusy ? 'block' : 'none';
        loadMoreBtn.innerHTML = homeAutoLoadBusy
            ? '<span class="home-mini-loader" aria-hidden="true"></span><span>جاري تحميل المنتجات</span>'
            : (hasMore ? '<span class="home-load-hint">مرّر لمتابعة المنتجات</span>' : '');
        if (homeLoadObserver) {
            homeLoadObserver.disconnect();
            homeLoadObserver = null;
        }
        if (hasMore && 'IntersectionObserver' in window && !homeAutoLoadBusy) {
            homeLoadObserver = new IntersectionObserver((entries) => {
                if (!entries.some(entry => entry.isIntersecting) || homeAutoLoadBusy) return;
                homeAutoLoadBusy = true;
                homeLoadObserver.disconnect();
                homeLoadObserver = null;
                loadMoreWrap.style.display = 'block';
                loadMoreBtn.innerHTML = '<span class="home-mini-loader" aria-hidden="true"></span><span>جاري تحميل المنتجات</span>';
                // Keep the existing product cards in place; append only the next batch.
                window.setTimeout(() => {
                    homeDisplayLimit += 20;
                    homeAutoLoadBusy = false;
                    renderProducts(true);
                }, 220);
            }, { root: null, rootMargin: '250px 0px', threshold: 0 });
            homeLoadObserver.observe(loadMoreWrap);
        }
    }
    const cardsHTML = filtered.map((product, index) => {
        const images = product.images && product.images.length > 0 ? product.images : [product.image];
        const mainImage = getOptimizedImage(images[0] || 'https://via.placeholder.com/400', 400);
        const quantity = product.quantity !== undefined ? product.quantity : 99;
        const isOut = quantity <= 0;
        const catName = (categories.find(c => c.id === product.categoryId) || {}).name || '';
        const subName = catName;
        const imagesHTML = images.length > 1 ? `
            <div class="product-images-multiple">
                ${images.slice(0, 3).map((img, idx) => `<img src="${getOptimizedImage(img, 250, 80)}" alt="${product.name}" class="product-thumb" data-product="${product.id}" data-index="${idx}" loading="lazy" onerror="this.style.display='none'" style="border-color:${idx === 0 ? 'var(--primary)' : 'var(--border)'}" onclick="changeProductImageHome('${product.id}', ${idx})">`).join('')}
            </div>` : '';

        return `
        <div class="product-card" data-product-id="${product.id}" style="animation:fadeInUp 0.5s ease ${index * 0.03}s forwards;opacity:0">
            <div class="product-image">
                <img id="productMainImage_${product.id}" src="${mainImage}" alt="${product.name}" class="product-main-image" loading="lazy" decoding="async" onerror="this.src='https://via.placeholder.com/400'">
                ${product.oldprice ? `<span class="product-badge badge-sale">تخفيض</span>` : ''}
                ${isOut ? `<span class="product-badge badge-outofstock">نفذت</span>` : ''}
                <button class="product-quick-view" onclick="openQuickView('${product.id}', event)"><i class="fas fa-eye"></i> نظرة سريعة</button>
                <button class="product-share-btn" onclick="shareProduct('${product.id}')" title="مشاركة"><i class="fas fa-share-alt"></i></button>
            </div>
            <div class="product-info">
                <div class="product-category">${subName}</div>
                <h3 class="product-name">${product.name}</h3>
                <div class="product-code" style="font-size:0.7rem;color:#aea89c"><i class="fas fa-barcode"></i> ${product.code || 'بدون رمز'}</div>
                ${imagesHTML}
                <div class="product-price-row">
                    <div class="product-price"><span class="current-price">${formatPrice(product.price)} $</span>${product.oldprice ? `<span class="old-price">${formatPrice(product.oldprice)} $</span>` : ''}</div>
                    <button class="add-to-cart" onclick="${isOut ? `showToast('⚠️ هذا المنتج غير متوفر حالياً', true)` : `openProductOptions('${product.id}', event)`}" style="${isOut ? 'opacity:0.5;cursor:not-allowed;' : ''}"><i class="fas ${isOut ? 'fa-times' : 'fa-plus'}"></i></button>
                </div>
                ${quantity !== undefined ? `<div style="font-size:0.65rem;color:${quantity > 5 ? '#2ed573' : quantity > 0 ? '#ffa502' : '#ff4757'};margin-top:4px">${quantity > 0 ? `📦 متبقي: ${quantity}` : '❌ غير متوفر'}</div>` : ''}
            </div>
        </div>`;
    }).join('');
    if (appendOnly && isHomeProductsGrid) {
        if (cardsHTML) grid.insertAdjacentHTML('beforeend', cardsHTML);
    } else {
        grid.innerHTML = cardsHTML;
    }
}

function changeProductImageHome(productId, imageIndex) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const images = product.images && product.images.length > 0 ? product.images : [product.image];
    if (imageIndex >= images.length) return;
    const main = document.getElementById(`productMainImage_${productId}`);
    if (main) main.src = getOptimizedImage(images[imageIndex], 400);
    document.querySelectorAll(`.product-thumb[data-product="${productId}"]`).forEach(t => t.style.borderColor = 'var(--border)');
    const active = document.querySelector(`.product-thumb[data-product="${productId}"][data-index="${imageIndex}"]`);
    if (active) active.style.borderColor = 'var(--primary)';
}

// ============================================
// SHARE PRODUCT
// ============================================
function shareProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const url = `${window.location.origin}/index.html?product=${productId}`;
    if (navigator.share) {
        navigator.share({ title: product.name, text: `🛍️ تسوق ${product.name} من متجر الكردي للزينة`, url }).catch(() => {});
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => showToast('✅ تم نسخ رابط المنتج!')).catch(() => fallbackCopy(url));
    } else fallbackCopy(url);
}
function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('✅ تم نسخ رابط المنتج!'); }
    catch { showToast('⚠️ لا يمكن النسخ', true); }
    document.body.removeChild(ta);
}

// ============================================
// PRODUCT OPTIONS MODAL
// ============================================
function openProductOptions(productId, event) {
    if (event) event.stopPropagation();
    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (product.quantity !== undefined && product.quantity <= 0) {
        showToast('⚠️ هذا المنتج غير متوفر حالياً', true);
        return;
    }
    currentProductOptions = product;
    const bulk = normalizeBulkTiers(product.bulkPricing || []);
    const modalHtml = `
        <div class="options-modal-overlay" id="optionsModalOverlay">
            <div class="options-modal">
                <div class="options-modal-header"><h3><i class="fas fa-shopping-bag"></i> ${product.name}</h3><button class="close-options-modal" onclick="closeOptionsModal()"><i class="fas fa-times"></i></button></div>
                <div class="options-modal-body">
                    <div class="options-product-img"><img src="${getOptimizedImage(product.image, 300)}" alt="${product.name}"></div>
                    <div class="options-product-price"><span id="optionsUnitPrice" class="current-price">${formatPrice(product.price)} $</span>${product.oldprice ? `<span class="old-price">${formatPrice(product.oldprice)} $</span>` : ''}<div id="optionsWholesaleStatus" style="display:none;font-size:.78rem;color:#16834a;font-weight:700;margin-top:5px">✓ تم تطبيق سعر الجملة</div><div id="optionsWholesaleTotal" style="display:none;font-size:.82rem;color:#9f7928;font-weight:700;margin-top:4px"></div></div>
                    ${product.code ? `<div class="options-product-code"><i class="fas fa-barcode"></i> رمز المنتج: ${product.code}</div>` : ''}
                    ${product.sizes && product.sizes.length ? `<div class="options-group"><label><i class="fas fa-ruler"></i> اختر المقاس:</label><div class="options-buttons" id="sizeOptions">${product.sizes.map(s => `<button class="option-btn" data-size="${s}">${s}</button>`).join('')}</div></div>` : ''}
                    ${product.colors && product.colors.length ? `<div class="options-group"><label><i class="fas fa-palette"></i> اختر اللون:</label><div class="options-buttons" id="colorOptions">${product.colors.map(c => `<button class="option-btn color-btn" data-color="${c}" style="background:${getColorBg(c)}">${c}</button>`).join('')}</div></div>` : ''}
                    <div class="options-quantity"><label><i class="fas fa-calculator"></i> الكمية:</label><div class="qty-selector"><button class="qty-dec" onclick="changeOptionsQty(-1)">-</button><span id="optionsQty">1</span><button class="qty-inc" onclick="changeOptionsQty(1)">+</button></div></div>
                    <div id="optionsPriceHint" style="text-align:center;font-size:0.85rem;color:#9f7928;margin-bottom:10px;display:none"></div>
                    <button class="btn-add-to-cart-options" onclick="addToCartWithOptions()"><i class="fas fa-shopping-bag"></i> أضف إلى السلة</button>
                    <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
                        <button onclick="shareProduct('${product.id}')" style="background:#ffffff;border:none;padding:8px 16px;border-radius:30px;cursor:pointer;color:#9f7928;font-weight:600;font-family:'Tajawal',sans-serif"><i class="fas fa-share-alt"></i> مشاركة المنتج</button>
                    </div>
                </div>
            </div>
        </div>`;
    const ex = document.getElementById('optionsModalOverlay');
    if (ex) ex.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
    window.selectedSize = null;
    window.selectedColor = null;
    window.optionsQty = 1;
    updateOptionsBulkPrice();
    document.querySelectorAll('#sizeOptions .option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sizeOptions .option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            window.selectedSize = btn.dataset.size;
        });
    });
    document.querySelectorAll('#colorOptions .option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#colorOptions .option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            window.selectedColor = btn.dataset.color;
        });
    });
}

function updateOptionsBulkPrice() {
    if (!currentProductOptions) return;
    const qty = Math.max(1, parseInt(window.optionsQty, 10) || 1);
    const result = getIndividualBulkPrice(currentProductOptions, qty);
    const unit = document.getElementById('optionsUnitPrice');
    const status = document.getElementById('optionsWholesaleStatus');
    const total = document.getElementById('optionsWholesaleTotal');
    const hint = document.getElementById('optionsPriceHint');
    if (unit) unit.textContent = `${formatPrice(result.price)} $`;
    if (status) status.style.display = result.applied ? 'block' : 'none';
    if (total) {
        total.textContent = result.applied ? `الإجمالي بسعر الجملة: ${formatPrice(result.price * qty)} $` : '';
        total.style.display = result.applied ? 'block' : 'none';
    }
    if (hint) {
        const tiers = normalizeBulkTiers(currentProductOptions.bulkPricing || []);
        const nextTier = tiers.find(tier => qty < tier.qty);
        if (!result.applied && nextTier) {
            hint.style.display = 'block';
        } else {
            hint.textContent = '';
            hint.style.display = 'none';
        }
    }
}

function changeOptionsQty(change) {
    window.optionsQty = Math.max(1, window.optionsQty + change);
    const qtySpan = document.getElementById('optionsQty');
    if (qtySpan) qtySpan.textContent = window.optionsQty;
    updateOptionsBulkPrice();
}

function addToCartWithOptions() {
    if (!currentProductOptions) return;
    if (currentProductOptions.sizes && currentProductOptions.sizes.length && !window.selectedSize) {
        showToast('⚠️ يرجى اختيار المقاس', true);
        return;
    }
    for (let i = 0; i < window.optionsQty; i++) {
        addToCart(currentProductOptions, window.selectedSize, window.selectedColor);
    }
    closeOptionsModal();
}

function closeOptionsModal() {
    const m = document.getElementById('optionsModalOverlay');
    if (m) m.remove();
    document.body.style.overflow = '';
    currentProductOptions = null;
}

if (!document.querySelector('#optionsModalStyles')) {
    const st = document.createElement('style');
    st.id = 'optionsModalStyles';
    st.textContent = `.options-modal-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center}.options-modal{background:white;border-radius:24px;width:400px;max-width:90vw;max-height:85vh;overflow-y:auto;direction:rtl}.options-modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #f2e5c9}.options-modal-header h3{color:#9f7928;font-size:1.1rem}.close-options-modal{background:none;border:none;font-size:1.2rem;cursor:pointer;color:#aea89c}.options-modal-body{padding:20px}.options-product-img{text-align:center;margin-bottom:15px}.options-product-img img{width:120px;height:120px;object-fit:cover;border-radius:16px}.options-product-price{text-align:center;margin-bottom:15px}.options-product-price .current-price{font-size:1.3rem;font-weight:800;color:#9f7928}.options-product-code{text-align:center;font-size:0.8rem;color:#aea89c;margin-bottom:15px}.options-group{margin-bottom:20px}.options-group label{display:block;margin-bottom:8px;font-weight:600;color:#2a2314}.options-buttons{display:flex;flex-wrap:wrap;gap:8px}.option-btn{padding:8px 16px;border:2px solid #f2e5c9;background:white;border-radius:30px;cursor:pointer}.option-btn.selected{background:#9f7928;color:white;border-color:#9f7928}.options-quantity{margin-bottom:20px}.options-quantity label{display:block;margin-bottom:8px;font-weight:600;color:#2a2314}.qty-selector{display:flex;align-items:center;gap:15px}.qty-selector button{width:32px;height:32px;border-radius:50%;border:1px solid #f2e5c9;background:white;cursor:pointer;font-size:1.2rem}.btn-add-to-cart-options{width:100%;padding:14px;background:linear-gradient(135deg,#9f7928,#cd9e37);color:white;border:none;border-radius:40px;font-weight:bold;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}`;
    document.head.appendChild(st);
}

// ============================================
// QUICK VIEW
// ============================================
function openQuickView(productId, event) {
    if (event) event.stopPropagation();
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const images = product.images && product.images.length > 0 ? product.images : [product.image];
    const mainImage = getOptimizedImage(images[0] || 'https://via.placeholder.com/400', 500);
    const thumbnailsHTML = images.length > 1 ? `<div class="quick-view-thumbnails" style="display:flex;gap:8px;margin-top:12px;justify-content:center;flex-wrap:wrap">${images.slice(0,3).map((img, idx) => `<img src="${getOptimizedImage(img, 250, 80)}" class="quick-view-thumb" data-index="${idx}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:2px solid ${idx === 0 ? 'var(--primary)' : 'var(--border)'};cursor:pointer" onclick="changeQuickViewImage(this, '${productId}')">`).join('')}</div>` : '';
    const modal = document.getElementById('quickViewModal');
    const body = document.getElementById('quickViewBody');
    if (!modal || !body) return;
    const bulk = normalizeBulkTiers(product.bulkPricing || []);
    body.innerHTML = `
        <div class="quick-view-img"><img id="quickViewMainImage" src="${mainImage}" alt="${product.name}"></div>
        ${thumbnailsHTML}
        <div class="quick-view-info">
            <div class="product-category">${(categories.find(c => c.id === product.categoryId) || {}).name || ''}</div>
            <h3 class="product-name">${product.name}</h3>
            <div class="product-code" style="font-size:0.8rem;color:#aea89c;margin-bottom:8px"><i class="fas fa-barcode"></i> ${product.code || 'بدون رمز'}</div>
            <p class="product-desc">${product.desc || 'لا يوجد وصف'}</p>
            <div class="product-price-row"><div class="product-price"><span class="current-price" style="font-size:1.5rem">${formatPrice(product.price)} $</span>${product.oldprice ? `<span class="old-price">${formatPrice(product.oldprice)} $</span>` : ''}</div></div>
            ${product.sizes && product.sizes.length ? `<div class="product-sizes" style="margin:10px 0"><strong><i class="fas fa-ruler"></i> المقاسات:</strong> ${product.sizes.join(', ')}</div>` : ''}
            ${product.colors && product.colors.length ? `<div class="product-colors" style="margin:10px 0"><strong><i class="fas fa-palette"></i> الألوان:</strong> ${product.colors.join(', ')}</div>` : ''}
            ${product.quantity !== undefined ? `<div style="margin:10px 0;font-size:0.85rem;color:${product.quantity > 5 ? '#2ed573' : product.quantity > 0 ? '#ffa502' : '#ff4757'}"><strong>📦 الكمية:</strong> ${product.quantity > 0 ? product.quantity : 'غير متوفر'}</div>` : ''}
            <button class="add-to-cart" onclick="${product.quantity !== undefined && product.quantity <= 0 ? `showToast('⚠️ المنتج غير متوفر', true)` : `openProductOptions('${product.id}', event); closeQuickView()`}" style="width:100%;padding:12px;border-radius:40px;gap:8px;margin-top:15px;${product.quantity !== undefined && product.quantity <= 0 ? 'opacity:0.5;cursor:not-allowed;' : ''}"><i class="fas ${product.quantity !== undefined && product.quantity <= 0 ? 'fa-times' : 'fa-shopping-bag'}"></i> ${product.quantity !== undefined && product.quantity <= 0 ? 'غير متوفر' : 'أضف إلى السلة'}</button>
        </div>`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function changeQuickViewImage(thumbEl, productId) {
    const src = getOptimizedImage(thumbEl.src, 500);
    const main = document.getElementById('quickViewMainImage');
    if (main) main.src = src;
    document.querySelectorAll('.quick-view-thumb').forEach(t => t.style.borderColor = 'var(--border)');
    thumbEl.style.borderColor = 'var(--primary)';
}

function closeQuickView() {
    const m = document.getElementById('quickViewModal');
    if (m) { m.classList.remove('active'); document.body.style.overflow = ''; }
}

// ============================================
// CART MODAL
// ============================================
function openCart() {
    filterOutOfStockItems();
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    if (sidebar && overlay) {
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeCartFn() {
    const sidebar = document.getElementById('cartSidebar');
    const overlay = document.getElementById('cartOverlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ============================================
// ORDER MODAL
// ============================================
function openOrderModal() {
    filterOutOfStockItems();
    if (cart.length === 0) {
        showToast('🛒 السلة فارغة! أضف منتجات أولاً', true);
        return;
    }
    closeCartFn();
    setTimeout(() => {
        const m = document.getElementById('orderModal');
        const o = document.getElementById('modalOverlay');
        if (m && o) {
            m.classList.add('active');
            o.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }, 300);
}

function closeOrderModal() {
    const m = document.getElementById('orderModal');
    const o = document.getElementById('modalOverlay');
    if (m && o) {
        m.classList.remove('active');
        o.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ============================================
// CONFIRM MODAL
// ============================================
function showConfirmModal(options) {
    return new Promise((resolve) => {
        const { title = 'تأكيد', message = 'هل أنت متأكد؟', icon = 'fa-question-circle', iconColor = '#9f7928', confirmText = 'تأكيد', cancelText = 'إلغاء', showCancel = true, confirmClass = 'confirm-btn-primary', details = null } = options;
        const old = document.getElementById('confirmModalOverlay');
        if (old) old.remove();
        const html = `
            <div class="confirm-modal-overlay" id="confirmModalOverlay">
                <div class="confirm-modal">
                    <div class="confirm-modal-header"><i class="fas ${icon}" style="color:${iconColor}"></i><h3>${title}</h3></div>
                    <div class="confirm-modal-body"><p>${message}</p>${details ? `<div class="confirm-modal-details">${details}</div>` : ''}</div>
                    <div class="confirm-modal-footer">
                        ${showCancel ? `<button class="confirm-btn confirm-btn-secondary" id="confirmCancelBtn"><i class="fas fa-times"></i> ${cancelText}</button>` : ''}
                        <button class="confirm-btn ${confirmClass}" id="confirmOkBtn"><i class="fas fa-check"></i> ${confirmText}</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        document.body.style.overflow = 'hidden';
        const overlay = document.getElementById('confirmModalOverlay');
        requestAnimationFrame(() => overlay.classList.add('active'));
        const close = (r) => {
            overlay.classList.remove('active');
            setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; resolve(r); }, 300);
        };
        document.getElementById('confirmOkBtn').addEventListener('click', () => close(true));
        document.getElementById('confirmCancelBtn')?.addEventListener('click', () => close(false));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        const esc = (e) => { if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc); } };
        document.addEventListener('keydown', esc);
    });
}

// ============================================
// PAYMENT STEP (شام كاش فقط)
// ============================================
function openPaymentStep(orderData) {
    pendingOrderData = orderData;
    paymentReceiptBase64 = null;
    const { subtotal, discount, finalTotal } = calculateTotals();
    const old = document.getElementById('paymentStepOverlay');
    if (old) old.remove();

    const html = `
        <div class="payment-step-overlay" id="paymentStepOverlay">
            <div class="payment-step-modal">
                <div class="payment-step-header">
                    <button class="close-payment-step" id="closePaymentStep"><i class="fas fa-times"></i></button>
                    <h3><i class="fas fa-credit-card"></i> إتمام الدفع</h3>
                    <p>اختر طريقة الدفع المناسبة</p>
                </div>
                <div class="payment-step-body">
                    <div class="order-info-summary">
                        <h4><i class="fas fa-receipt"></i> ملخص الطلب</h4>
                        <p><strong>الاسم:</strong> ${orderData.customer.fullName}</p>
                        <p><strong>الهاتف:</strong> ${orderData.customer.phone}</p>
                        <p><strong>المدينة:</strong> ${orderData.customer.city}</p>
                        <div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)">
                            <p><strong>المجموع الفرعي:</strong> ${formatPrice(subtotal)} $</p>
                            ${discount > 0 ? `<p style="color:#2ed573"><strong>الخصم:</strong> - ${formatPrice(discount)} $</p>` : ''}
                            <p style="color:#9f7928;font-weight:800;font-size:1.1rem"><strong>الإجمالي النهائي:</strong> ${formatPrice(finalTotal)} $</p>
                        </div>
                    </div>

                    <div class="payment-method-card selected" data-method="shamcash" role="button" tabindex="0" style="cursor:pointer">
                        <div class="payment-method-icon"><i class="fas fa-mobile-alt"></i></div>
                        <div class="payment-method-info"><h4>شام كاش</h4><p>أرفق صورة وصل التحويل لإتمام الطلب</p></div>
                        <div class="payment-method-check"><i class="fas fa-check"></i></div>
                    </div>
                    <div class="payment-method-card" data-method="cod" role="button" tabindex="0" style="cursor:pointer;margin-top:10px">
                        <div class="payment-method-icon"><i class="fas fa-money-bill-wave"></i></div>
                        <div class="payment-method-info"><h4>دفع عند الاستلام</h4><p>تدفع قيمة الطلب عند استلامه</p></div>
                        <div class="payment-method-check"><i class="fas fa-check"></i></div>
                    </div>

                    <div class="payment-barcode-section" id="paymentBarcodeSection">
                        <h4><i class="fas fa-qrcode"></i> ${paymentBarcodeSettings && paymentBarcodeSettings.title ? paymentBarcodeSettings.title : 'الدفع عبر شام كاش 📱'}</h4>
                        <p style="font-size:0.85rem;color:var(--text-medium);margin-bottom:12px">${paymentBarcodeSettings && paymentBarcodeSettings.description ? paymentBarcodeSettings.description : 'امسح الباركود باستخدام تطبيق شام كاش'}</p>
                        ${paymentBarcodeSettings && paymentBarcodeSettings.image ? `<img src="${getOptimizedImage(paymentBarcodeSettings.image, 300)}" alt="باركود" style="max-width:200px;border-radius:12px;border:2px solid var(--border);margin:10px auto;display:block" onerror="this.style.display='none'">` : ''}
                    </div>

                    <div class="payment-receipt-section" id="paymentReceiptSection">
                        <h4><i class="fas fa-upload"></i> إرفاق وصل الدفع</h4>
                        <p style="font-size:0.8rem;color:var(--text-medium);margin-bottom:12px">بعد إتمام الدفع، أرفق صورة الوصل</p>
                        <div class="file-upload-btn" onclick="document.getElementById('paymentStepReceiptFile').click()"><i class="fas fa-cloud-upload-alt"></i> اختر صورة الإيصال</div>
                        <input type="file" id="paymentStepReceiptFile" accept="image/*" style="display:none">
                        <div id="paymentStepFileName" style="font-size:0.75rem;color:var(--text-light);margin-top:8px;text-align:center">📁 لم يتم اختيار ملف</div>
                        <div id="paymentStepPreview" class="payment-receipt-preview" style="display:none"><img id="paymentStepPreviewImg" src="" alt="معاينة"></div>
                    </div>

                    <div class="payment-note" style="background:var(--primary-lightest);border-right:4px solid var(--primary);padding:12px 16px;border-radius:12px;margin-top:12px">
                        <i class="fas fa-info-circle" style="color:var(--primary);margin-left:8px"></i>
                        <span style="font-size:0.85rem;color:var(--text-medium)">بعد إرسال الطلب، سيتم مراجعة وصل الدفع والتواصل معك للتأكيد</span>
                    </div>
                    ${getDesignerCredit('light')}
                </div>
                <div class="payment-step-footer">
                    <button class="confirm-btn confirm-btn-secondary" id="paymentStepBack"><i class="fas fa-arrow-right"></i> رجوع</button>
                    <button class="confirm-btn confirm-btn-primary" id="paymentStepShowInvoice"><i class="fas fa-receipt"></i> عرض الفاتورة</button>
                    <button class="confirm-btn confirm-btn-primary" id="paymentStepSubmit"><i class="fas fa-paper-plane"></i> إرسال الطلب</button>
                </div>
            </div>
        </div>`;

    selectedPaymentMethod = 'shamcash';
    document.body.insertAdjacentHTML('beforeend', html);
    document.body.style.overflow = 'hidden';
    const paymentCards = document.querySelectorAll('#paymentStepOverlay .payment-method-card');
    const updatePaymentChoice = (method) => {
        selectedPaymentMethod = method;
        paymentCards.forEach(card => card.classList.toggle('selected', card.dataset.method === method));
        const barcode = document.getElementById('paymentBarcodeSection');
        const receipt = document.getElementById('paymentReceiptSection');
        if (barcode) barcode.style.display = method === 'shamcash' ? '' : 'none';
        if (receipt) receipt.style.display = method === 'shamcash' ? '' : 'none';
        const note = document.querySelector('#paymentStepOverlay .payment-note');
        if (note) note.innerHTML = method === 'cod'
          ? '<i class="fas fa-info-circle" style="color:var(--primary);margin-left:8px"></i><span style="font-size:0.85rem;color:var(--text-medium)">سيتم دفع قيمة الطلب عند الاستلام، دون الحاجة لإرفاق وصل تحويل.</span>'
          : '<i class="fas fa-info-circle" style="color:var(--primary);margin-left:8px"></i><span style="font-size:0.85rem;color:var(--text-medium)">بعد إرسال الطلب، سيتم مراجعة وصل الدفع والتواصل معك للتأكيد</span>';
    };
    paymentCards.forEach(card => {
        card.addEventListener('click', () => updatePaymentChoice(card.dataset.method));
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); updatePaymentChoice(card.dataset.method); } });
    });
    const overlay = document.getElementById('paymentStepOverlay');
    requestAnimationFrame(() => overlay.classList.add('active'));

    document.getElementById('paymentStepReceiptFile').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            paymentReceiptBase64 = null;
            document.getElementById('paymentStepPreview').style.display = 'none';
            document.getElementById('paymentStepFileName').textContent = '⚠️ اختر صورة فقط';
            return;
        }
        document.getElementById('paymentStepFileName').textContent = '⏳ جاري ضغط الصورة...';
        const reader = new FileReader();
        reader.onload = function(ev) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const maxW = 1000, maxH = 1000;
                if (w > maxW) { h = (maxW / w) * h; w = maxW; }
                if (h > maxH) { w = (maxH / h) * w; h = maxH; }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                let q = 0.9;
                const compress = () => canvas.toBlob(blob => {
                    if (!blob) return;
                    if (blob.size / 1024 <= 200 || q <= 0.35) {
                        const fr = new FileReader();
                        fr.onload = () => {
                            paymentReceiptBase64 = fr.result;
                            document.getElementById('paymentStepPreviewImg').src = fr.result;
                            document.getElementById('paymentStepPreview').style.display = 'block';
                            document.getElementById('paymentStepFileName').textContent = `⏳ جارٍ رفع الوصل... (${Math.round(blob.size/1024)}KB)`;
                            paymentReceiptUploading = true;
                            const cfg = (window.TAQWA_CONFIG || {}).cloudinary || {};
                            if (cfg.cloudName && cfg.uploadPreset && !String(cfg.cloudName).includes('YOUR_')) {
                                const fd = new FormData();
                                fd.append('file', blob, 'payment-receipt.jpg');
                                fd.append('upload_preset', cfg.uploadPreset);
                                fetch(`https://api.cloudinary.com/v1_1/${cfg.cloudName}/image/upload`, { method: 'POST', body: fd })
                                  .then(r => { if (!r.ok) throw new Error('upload failed'); return r.json(); })
                                  .then(data => {
                                    paymentReceiptBase64 = data.secure_url || fr.result;
                                    document.getElementById('paymentStepPreviewImg').src = fr.result;
                                    document.getElementById('paymentStepPreview').style.display = 'block';
                                    document.getElementById('paymentStepFileName').textContent = `✅ تم رفع الوصل بنجاح`;
                                  })
                                  .catch(err => {
                                    console.error('Receipt upload failed:', err);
                                    paymentReceiptBase64 = fr.result;
                                    document.getElementById('paymentStepFileName').textContent = `⚠️ تعذّر رفعه خارجياً؛ سيتم إرفاقه بالطلب`;
                                  })
                                  .finally(() => { paymentReceiptUploading = false; });
                            } else {
                                paymentReceiptBase64 = fr.result;
                                document.getElementById('paymentStepFileName').textContent = `✅ ${file.name} (~${Math.round(blob.size/1024)}KB)`;
                                paymentReceiptUploading = false;
                            }
                        };
                        fr.readAsDataURL(blob);
                    } else { q -= 0.06; compress(); }
                }, 'image/jpeg', q);
                compress();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('paymentStepBack').addEventListener('click', () => { closePaymentStep(); openOrderModal(); });
    document.getElementById('paymentStepShowInvoice').addEventListener('click', () => { if (pendingOrderData) showInvoicePreview(pendingOrderData); });
    document.getElementById('paymentStepSubmit').addEventListener('click', () => submitOrderWithPayment());
    document.getElementById('closePaymentStep').addEventListener('click', () => closePaymentStep());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closePaymentStep(); });
}

function closePaymentStep() {
    const overlay = document.getElementById('paymentStepOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => { overlay.remove(); document.body.style.overflow = ''; }, 300);
    }
}

// ============================================
// INVOICE PREVIEW
// ============================================
function showInvoicePreview(orderData) {
    const modal = document.getElementById('invoicePreviewModal');
    const content = document.getElementById('invoicePreviewContent');
    if (!modal || !content) return;
    const { subtotal, discount, finalTotal } = calculateTotals();
    const discountMessage = appliedCoupon ? (appliedCoupon.type === 'percentage' ? `${appliedCoupon.value}%` : `${appliedCoupon.value}$`) : '';
    const itemsHTML = orderData.items.map((item, idx) => `
        <tr>
            <td>${idx+1}</td>
            <td><img src="${getOptimizedImage(item.image || 'https://via.placeholder.com/50', 80)}" alt="${item.name}" style="width:45px;height:45px;object-fit:cover;border-radius:8px"></td>
            <td class="product-name">${item.name}${item.selectedSize ? `<br><small>مقاس: ${item.selectedSize}</small>` : ''}${item.selectedColor ? `<br><small>لون: ${item.selectedColor}</small>` : ''}</td>
            <td>${item.code || '—'}</td>
            <td>${item.qty}</td>
            <td>${formatPrice(item.price)} $</td>
            <td>${formatPrice(item.totalPrice != null ? item.totalPrice : item.price * item.qty)} $</td>
        </tr>`).join('');
    content.innerHTML = `
        <div style="direction:rtl;font-family:'Tajawal',sans-serif">
            <div class="invoice-header"><h2><i class="fas fa-receipt"></i> فاتورة الطلب - متجر الكردي للزينة</h2><button class="close-invoice" onclick="closeInvoicePreview()"><i class="fas fa-times"></i></button></div>
            <div class="invoice-info">
                <p><strong>الاسم:</strong> ${orderData.customer.fullName}</p>
                <p><strong>الهاتف:</strong> ${orderData.customer.phone}</p>
                <p><strong>المدينة:</strong> ${orderData.customer.city}</p>
                <p><strong>العنوان:</strong> ${orderData.customer.address}</p>
                <p><strong>طريقة الدفع:</strong> شام كاش 💳</p>
                ${orderData.customer.notes ? `<p><strong>ملاحظات:</strong> ${orderData.customer.notes}</p>` : ''}
                ${orderData.trackingCode ? `<p><strong>🔑 رمز التتبع:</strong> ${orderData.trackingCode}</p>` : ''}
            </div>
            <div class="invoice-table-wrapper">
                <table class="invoice-table">
                    <thead><tr><th>#</th><th>الصورة</th><th>المنتج</th><th>الرمز</th><th>العدد</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsHTML}</tbody>
                </table>
            </div>
            <div class="invoice-totals">
                <p>المجموع الفرعي: ${formatPrice(subtotal)} $</p>
                ${discount > 0 ? `<p style="color:#2ed573">الخصم (${discountMessage}): - ${formatPrice(discount)} $</p>` : ''}
                <p style="color:#9f7928;font-size:1.2rem">الإجمالي النهائي: ${formatPrice(finalTotal)} $</p>
                <p style="font-size:0.8rem">* رسوم التوصيل تحسب عند التسليم</p>
            </div>
            ${getDesignerCredit('light')}
        </div>`;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeInvoicePreview() {
    const modal = document.getElementById('invoicePreviewModal');
    if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

// ============================================
// WHATSAPP (with payment status)
// ============================================
function getWhatsAppNumber() {
    const c = window.TAQWA_CONFIG || {};
    const tryPaths = [
        c.whatsappNumber, c.whatsapp, c.phone, c.storePhone, c.supportPhone,
        c.contact && c.contact.whatsapp, c.contact && c.contact.phone,
        c.store && c.store.whatsapp, c.store && c.store.phone,
        c.support && c.support.whatsapp, c.support && c.support.phone,
        c.social && c.social.whatsapp
    ];
    for (const v of tryPaths) {
        if (v) {
            const d = String(v).replace(/\D/g, '');
            if (d.length >= 8) return d;
        }
    }
    return '';
}

function buildOrderWhatsAppUrl(order) {
    const phone = getWhatsAppNumber();
    if (!phone) return '';
    const isPaid = !!(order.paymentReceipt && (order.paymentReceipt.data || order.paymentReceipt.attached || typeof order.paymentReceipt === 'string'));
    const paymentLine = isPaid
        ? '💳 *حالة الدفع:* ✅ تم الدفع عبر شام كاش (تم إرفاق وصل التحويل)'
        : '💳 *حالة الدفع:* ⏳ لم يتم الدفع بعد (لم يتم إرفاق وصل)';
    let msg = '🛍️ *طلب جديد من متجر الكردي للزينة*\n━━━━━━━━━━━━━━━━\n';
    msg += '👤 الاسم: ' + order.customer.fullName + '\n';
    msg += '📞 الهاتف: ' + order.customer.phone + '\n';
    msg += '📍 المدينة: ' + order.customer.city + '\n';
    msg += '🏠 العنوان: ' + order.customer.address + '\n';
    if (order.customer.notes) msg += '📝 ملاحظات: ' + order.customer.notes + '\n';
    msg += '\n🔑 *رمز التتبع:* ' + (order.trackingCode || '—') + '\n\n📦 *المنتجات:*\n';
    (order.items || []).forEach(it => {
        let line = '• ' + it.name;
        if (it.selectedSize) line += ' [مقاس: ' + it.selectedSize + ']';
        if (it.selectedColor) line += ' [لون: ' + it.selectedColor + ']';
        line += ' × ' + it.qty + ' = ' + (parseFloat(it.price) * it.qty).toFixed(2) + '$\n';
        msg += line;
    });
    if (order.paymentReceipt && order.paymentReceipt.data && /^https?:\/\//i.test(order.paymentReceipt.data)) msg += '\n🧾 *رابط صورة وصل الدفع:* ' + order.paymentReceipt.data + '\n';
    msg += '\n💰 المجموع الفرعي: ' + parseFloat(order.subtotal || 0).toFixed(2) + '$\n';
    if (order.discount > 0) msg += '🎫 الخصم: -' + parseFloat(order.discount).toFixed(2) + '$\n';
    msg += '💵 *الإجمالي: ' + parseFloat(order.total || 0).toFixed(2) + '$*\n\n' + paymentLine + '\n\n⏰ ' + new Date(order.timestamp || Date.now()).toLocaleString('ar-EG');
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
}

// ============================================
// SUBMIT ORDER
// ============================================
async function submitOrderWithPayment() {
    if (!pendingOrderData) return;
    if (paymentReceiptUploading) { showToast('يرجى الانتظار حتى يكتمل رفع وصل الدفع.', true); return; }
    if (window.taqwaFirebaseConfigured && !window.taqwaFirebaseConfigured()) {
        showToast('المتجر غير مربوط بقاعدة البيانات بعد.', true);
        return;
    }
    filterOutOfStockItems();
    if (cart.length === 0) {
        showToast('⚠️ السلة فارغة', true);
        closePaymentStep();
        return;
    }
    if (!(await verifyCartAgainstDatabase())) return;
    if (cart.length === 0) { showToast('السلة فارغة بعد التحقق من المنتجات.', true); closePaymentStep(); return; }

    const trackingCode = generateTrackingCode();
    pendingOrderData.trackingCode = trackingCode;
    pendingOrderData.paymentMethod = selectedPaymentMethod || 'shamcash';
    delete pendingOrderData.giftWrap;
    delete pendingOrderData.giftWrapPrice;

    if (pendingOrderData.paymentMethod === 'cod') {
        pendingOrderData.paymentReceipt = null;
        pendingOrderData.paymentStatus = 'cash_on_delivery';
    } else if (paymentReceiptBase64) {
        pendingOrderData.paymentReceipt = { data: paymentReceiptBase64, type: 'base64_image', timestamp: Date.now() };
        pendingOrderData.paymentStatus = 'paid';
    } else {
        pendingOrderData.paymentReceipt = null;
        pendingOrderData.paymentStatus = 'pending';
    }

    const newOrderRef = db.ref('orders').push();
    // Save the private order and a separate status-only tracking record in one update.
    const orderAndTrackingUpdate = {};
    orderAndTrackingUpdate['orders/' + newOrderRef.key] = pendingOrderData;
    orderAndTrackingUpdate['publicTracking/' + trackingCode] = { status: 'new' };
    db.ref().update(orderAndTrackingUpdate, function(error) {
        if (error) {
            console.error(error);
            showToast('تعذّر إرسال الطلب. تحقق من قواعد Firebase ثم حاول مجدداً.', true);
            return;
        }
        if (pendingOrderData.coupon && pendingOrderData.coupon.id) {
            db.ref(`coupons/${pendingOrderData.coupon.id}`).once('value', function(snap) {
                const cd = snap.val();
                const cur = (cd && cd.usedCount) || 0;
                db.ref(`coupons/${pendingOrderData.coupon.id}`).update({ usedCount: cur + 1 });
            });
        }

        const orderPhone = pendingOrderData.customer.phone;
        const orderTrackingCode = pendingOrderData.trackingCode;
        const savedOrder = JSON.parse(JSON.stringify(pendingOrderData));
        const orderForWA = { ...savedOrder };
        if (orderForWA.paymentReceipt && orderForWA.paymentReceipt.data && !/^https?:\/\//i.test(orderForWA.paymentReceipt.data)) orderForWA.paymentReceipt = { attached: true };

        cart = [];
        appliedCoupon = null;
        saveCartToLocal();
        saveCouponToLocal();
        updateCartUI();
        closePaymentStep();
        closeOrderModal();
        closeCartFn();
        showToast('✅ تم إرسال الطلب بنجاح!', false);

        setTimeout(() => {
            showSuccessModal(orderPhone, orderTrackingCode);
            const waUrl = buildOrderWhatsAppUrl(orderForWA);
            if (waUrl) setTimeout(() => { window.location.href = waUrl; }, 900);
        }, 300);

        document.getElementById('orderForm')?.reset();
        pendingOrderData = null;
    });
}

// ============================================
// SUCCESS MODAL
// ============================================
function showSuccessModal(phone, trackingCode) {
    const modal = document.getElementById('successModal');
    if (!modal) return;
    const op = document.getElementById('orderPhone');
    const ot = document.getElementById('orderTime');
    const otr = document.getElementById('orderTrackingCode');
    if (op && phone) op.textContent = phone;
    if (ot) {
        const n = new Date();
        ot.textContent = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')} ${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    }
    if (otr && trackingCode) otr.textContent = trackingCode;
    const sc = modal.querySelector('.success-content');
    if (sc) {
        const tb = sc.querySelector('.success-track-btn');
        if (tb && trackingCode) tb.href = `track-order.html?code=${encodeURIComponent(trackingCode)}`;
    }
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSuccessModalAndGoHome() {
    const modal = document.getElementById('successModal');
    if (modal) modal.classList.remove('active');
    document.body.style.overflow = '';
    cart = [];
    appliedCoupon = null;
    saveCartToLocal();
    saveCouponToLocal();
    updateCartUI();
    closeCartFn();
    window.location.href = 'index.html';
}

// ============================================
// CONTACT MODAL
// ============================================
function openContactModal() {
    const m = document.getElementById('contactModal');
    const o = document.getElementById('contactModalOverlay');
    if (m && o) { m.classList.add('active'); o.classList.add('active'); document.body.style.overflow = 'hidden'; }
}
function closeContactModalFn() {
    const m = document.getElementById('contactModal');
    const o = document.getElementById('contactModalOverlay');
    if (m && o) { m.classList.remove('active'); o.classList.remove('active'); document.body.style.overflow = ''; }
}

// ============================================
// SEARCH — اقتراحات قوية جداً + بحث حقيقي
// ============================================
function normalizeSearchText(value) {
    return String(value || '').toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
        .replace(/[ـًٌٍَُِّْ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function initHomeSearch() {
    const searchBox = document.querySelector('.search-box');
    const searchInput = document.getElementById('searchInput');
    if (!searchBox || !searchInput) return;

    const old = document.getElementById('homeSearchSuggestions');
    if (old) old.remove();

    const suggestionsBox = document.createElement('div');
    suggestionsBox.id = 'homeSearchSuggestions';
    searchBox.style.position = 'relative';
    searchBox.appendChild(suggestionsBox);

    let searchTimeout;

    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const query = this.value.trim();
        const clearBtn = document.getElementById('clearSearchBtn');
        if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);

        if (query.length < 1) {
            suggestionsBox.style.display = 'none';
            if (searchQueryHome) {
                searchQueryHome = '';
                renderProducts();
                updateProductsTitle();
                updateActiveFilterChip();
            }
            return;
        }

        searchTimeout = setTimeout(() => {
            if (!Array.isArray(products) || products.length === 0) {
                suggestionsBox.innerHTML = '<div class="suggestion-empty"><i class="fas fa-spinner fa-spin" style="color:#9f7928;margin-left:6px"></i> جاري تحميل المنتجات...</div>';
                suggestionsBox.style.display = 'block';
                return;
            }

            const q = normalizeSearchText(query);
            const matches = products.filter(p => {
                if (p.active === false) return false;
                const haystack = normalizeSearchText([p.name, p.code, p.desc, p.brand, p.model].filter(Boolean).join(' '));
                return haystack.includes(q);
            }).slice(0, 6);

            if (matches.length > 0) {
                suggestionsBox.innerHTML = matches.map(p => `
                    <div class="suggestion-item" role="button" tabindex="0" onclick="selectHomeSuggestion('${p.id}')">
                        <img src="${getOptimizedImage(p.image, 60)}" alt="${p.name}" onerror="this.src='https://via.placeholder.com/60'">
                        <div style="flex:1;min-width:0">
                            <div class="suggestion-name">${p.name}</div>
                            <div class="suggestion-price">${formatPrice(p.price)} $ ${p.code ? `· ${p.code}` : ''}</div>
                        </div>
                        <i class="fas fa-chevron-left" style="color:#aea89c;font-size:0.8rem"></i>
                    </div>
                `).join('');
            } else {
                suggestionsBox.innerHTML = `<div class="suggestion-empty"><i class="fas fa-search" style="margin-left:6px"></i> لا توجد نتائج لـ "${query}"</div>`;
            }
            suggestionsBox.style.display = 'block';
        }, 120);
    });

    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            suggestionsBox.style.display = 'none';
            performHomeSearch(this.value.trim());
        } else if (e.key === 'Escape') {
            suggestionsBox.style.display = 'none';
        }
    });

    const searchBtn = searchBox.querySelector('.search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            suggestionsBox.style.display = 'none';
            performHomeSearch(searchInput.value.trim());
        });
    }

    const clearBtn = document.getElementById('clearSearchBtn');
    if (clearBtn && !clearBtn.dataset.taqwaClearBound) {
        clearBtn.dataset.taqwaClearBound = '1';
        clearBtn.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            searchInput.value = ''; searchQueryHome = '';
            clearBtn.classList.remove('visible');
            suggestionsBox.classList.remove('active'); suggestionsBox.style.display = 'none';
            currentCategoryFilter = 'all'; currentFilter = 'all';
            renderCategoriesGrid(); renderFilterTabs(); renderProducts();
            updateProductsTitle(); updateActiveFilterChip();
            searchInput.focus();
        });
    }
    document.addEventListener('click', function(e) {
        if (!searchBox.contains(e.target)) {
            suggestionsBox.classList.remove('active');
            suggestionsBox.style.display = 'none';
        }
    });
}

function performHomeSearch(query) {
    searchQueryHome = query;
    currentCategoryFilter = 'all';
    currentFilter = 'all';
    renderCategoriesGrid();
    renderFilterTabs();
    renderProducts();
    updateProductsTitle();
    updateActiveFilterChip();
    scrollToProducts();
}

window.selectHomeSuggestion = function(productId) {
    const product = products.find(p => String(p.id) === String(productId));
    if (!product) return;
    const box = document.getElementById('homeSearchSuggestions');
    if (box) { box.classList.remove('active'); box.style.display = 'none'; }
    const inp = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    if (inp) { inp.value = product.name || ''; }
    if (clearBtn) clearBtn.classList.toggle('visible', !!(product.name));
    searchQueryHome = product.name || '';
    currentCategoryFilter = 'all';
    currentFilter = 'all';
    renderCategoriesGrid(); renderFilterTabs(); renderProducts();
    updateProductsTitle(); updateActiveFilterChip();
    setTimeout(() => {
        const card = [...document.querySelectorAll('#productsGrid .product-card')].find(el => {
            const title = el.querySelector('.product-name');
            return title && normalizeSearchText(title.textContent) === normalizeSearchText(product.name);
        });
        if (card) { card.scrollIntoView({behavior:'smooth', block:'center'}); card.classList.add('taqwa-search-highlight'); setTimeout(()=>card.classList.remove('taqwa-search-highlight'),1800); }
        if (typeof openQuickView === 'function') openQuickView(product.id, null);
    }, 80);
};

// ============================================
// ORDER FORM SUBMIT
// ============================================
function attachOrderFormHandler() {
    const form = document.getElementById('orderForm');
    if (!form) return;
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        filterOutOfStockItems();
        if (cart.length === 0) {
            showToast('⚠️ السلة فارغة', true);
            return;
        }
        if (!(await verifyCartAgainstDatabase())) return;
        if (cart.length === 0) { showToast('السلة فارغة بعد التحقق من المنتجات.', true); return; }
        const fullName = document.getElementById('fullName')?.value.trim() || '';
        const phone = document.getElementById('phone')?.value.trim() || '';
        const city = document.getElementById('city')?.value || '';
        const address = document.getElementById('address')?.value.trim() || '';
        const notes = document.getElementById('notes')?.value.trim() || '';
        if (!fullName || !phone || !city || !address) {
            showToast('⚠️ يرجى ملء جميع الحقول المطلوبة', true);
            return;
        }
        const { subtotal, discount, finalTotal } = calculateTotals();
        let detailsHTML = `<div class="detail-row"><span>المجموع الفرعي:</span><strong>${formatPrice(subtotal)} $</strong></div>`;
        if (discount > 0) detailsHTML += `<div class="detail-row"><span>الخصم:</span><span class="discount-value">- ${formatPrice(discount)} $</span></div>`;
        detailsHTML += `<div class="detail-row"><span>الإجمالي النهائي:</span><span class="total-value">${formatPrice(finalTotal)} $</span></div>`;
        detailsHTML += `<div class="detail-row" style="margin-top:8px;padding-top:8px;border-top:2px solid var(--primary)"><span><i class="fas fa-info-circle"></i> ملاحظة:</span><span>سيتم التواصل معك للتأكيد</span></div>`;
        const confirmed = await showConfirmModal({
            title: '🔔 تأكيد الطلب',
            message: 'هل تريد تأكيد الطلب؟',
            icon: 'fa-clipboard-check',
            iconColor: '#9f7928',
            confirmText: 'تأكيد',
            cancelText: 'تعديل',
            details: detailsHTML
        });
        if (!confirmed) return;
        const usedCoupon = appliedCoupon ? { ...appliedCoupon } : null;
        const currentCart = [...cart];
        const enrichedCart = currentCart.map(item => {
            const fp = products.find(p => p.id === item.id) || {};
            return { ...item, image: item.image || fp.image || 'https://via.placeholder.com/50', code: item.code || fp.code || 'بدون رمز', effectivePrice: getEffectivePrice(item) };
        });
        const orderData = {
            customer: { fullName, phone, city, address, notes },
            items: enrichedCart.map(it => ({
                id: it.id, name: it.name, price: it.effectivePrice, originalPrice: parseFloat(it.price) || 0, effectivePrice: it.effectivePrice, qty: it.qty,
                totalPrice: it.effectivePrice * it.qty,
                selectedSize: it.selectedSize, selectedColor: it.selectedColor,
                image: it.image, code: it.code
            })),
            subtotal, discount, total: finalTotal,
            coupon: usedCoupon ? { id: usedCoupon.id, code: usedCoupon.code, type: usedCoupon.type, value: usedCoupon.value } : null,
            timestamp: Date.now()
        };
        closeOrderModal();
        setTimeout(() => openPaymentStep(orderData), 300);
    });
}

// ============================================
// EVENT LISTENERS
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initHomeSearch();
    loadCartFromLocal();
    loadCouponFromLocal();
    loadData();
    updateCartUI();

    document.getElementById('cartBtn')?.addEventListener('click', openCart);
    document.getElementById('bottomCartBtn')?.addEventListener('click', (e) => { e.preventDefault(); openCart(); });
    document.getElementById('closeCart')?.addEventListener('click', closeCartFn);
    document.getElementById('cartOverlay')?.addEventListener('click', closeCartFn);
    document.getElementById('checkoutBtn')?.addEventListener('click', openOrderModal);
    document.getElementById('closeModal')?.addEventListener('click', closeOrderModal);
    document.getElementById('modalOverlay')?.addEventListener('click', closeOrderModal);
    document.getElementById('successBtn')?.addEventListener('click', closeSuccessModalAndGoHome);
    document.getElementById('closeQuickView')?.addEventListener('click', closeQuickView);
    document.getElementById('quickViewModal')?.addEventListener('click', (e) => { if (e.target === document.getElementById('quickViewModal')) closeQuickView(); });
    document.getElementById('bottomContactBtn')?.addEventListener('click', (e) => { e.preventDefault(); openContactModal(); });
    document.getElementById('closeContactModal')?.addEventListener('click', closeContactModalFn);
    document.getElementById('contactModalOverlay')?.addEventListener('click', closeContactModalFn);

    attachOrderFormHandler();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeCartFn();
        closeOrderModal();
        closeQuickView();
        const sm = document.getElementById('successModal');
        if (sm && sm.classList.contains('active')) closeSuccessModalAndGoHome();
        closeContactModalFn();
        closeOptionsModal();
        closePaymentStep();
        closeInvoicePreview();
    }
});

// ============================================
// EXPORT GLOBALS
// ============================================
window.applyCoupon = applyCoupon;
window.removeCoupon = removeCoupon;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQty = updateQty;
window.openProductOptions = openProductOptions;
window.closeOptionsModal = closeOptionsModal;
window.closeInvoicePreview = closeInvoicePreview;
window.changeProductImageHome = changeProductImageHome;
window.shareProduct = shareProduct;
window.showToast = showToast;
window.buildOrderWhatsAppUrl = buildOrderWhatsAppUrl;

// ============================================
// URL PARAM: open product directly (?product=ID)
// ============================================
(function() {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get('product');
    if (productId) {
        const check = setInterval(() => {
            if (typeof products !== 'undefined' && products.length > 0) {
                clearInterval(check);
                const p = products.find(x => x.id === productId);
                if (p) setTimeout(() => openProductOptions(productId, null), 600);
                else showToast('⚠️ المنتج غير موجود', true);
            }
        }, 200);
        setTimeout(() => clearInterval(check), 5000);
    }
})();

// Splash screen hider
window.addEventListener('load', function() {
    const splash = document.getElementById('splashScreen');
    if (splash) {
        setTimeout(() => { splash.classList.add('hidden'); }, 1200);
    }
});

console.log('✅ scriptv1.js loaded — search suggestions fixed + no bulk badge on image');
// =============================================
// تسجيل الزيارة (عداد الزوار)
// =============================================
(function trackWebsiteVisit() {
    // التحقق مما إذا كان الزائر قد تم تسجيله في هذه الجلسة (لمنع التكرار عند تحديث الصفحة)
    if (sessionStorage.getItem('taqwa_visit_tracked')) return;
    
    // الحصول على تاريخ اليوم بصيغة YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10);
    const visitRef = db.ref('visits/' + today);
    
    // استخدام transaction لضمان زيادة آمنة بدون تعارض
    visitRef.transaction(function(currentCount) {
        return (currentCount || 0) + 1;
    }, function(error, committed, snapshot) {
        if (error) {
            console.error('❌ خطأ في تسجيل الزيارة:', error);
        } else if (committed) {
            console.log('✅ تم تسجيل الزيارة بنجاح. عدد اليوم:', snapshot.val());
            sessionStorage.setItem('taqwa_visit_tracked', 'true');
        }
    });
})();