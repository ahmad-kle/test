// ============================================
// TAQWA CONFIG — إعدادات المتجر
// ============================================
window.TAQWA_CONFIG = {
    // Firebase — استبدل هذه البيانات ببياناتك الحقيقية
    firebase: {
     apiKey: "AIzaSyCLcoFRpzk6UQj-3N4cAH3xF0hs1TWRkF8",
    authDomain: "altaqwa-ad9ee.firebaseapp.com",
    databaseURL: "https://altaqwa-ad9ee-default-rtdb.firebaseio.com",
    projectId: "altaqwa-ad9ee",
    storageBucket: "altaqwa-ad9ee.firebasestorage.app",
    messagingSenderId: "337216014662",
    appId: "1:337216014662:web:b27df52503dd7f1ba4fd47",
    measurementId: "G-ZNE56BDF4B"
    },

    // Cloudinary — استبدل هذه البيانات ببياناتك
    cloudinary: {
        cloudName: "dnw006vnx",
        uploadPreset: "taqwa123"
    },

    // رقم واتساب — بدون + أو 00 (مثال: 9639XXXXXXXX)
    whatsappNumber: "963956351837",

    // اسم المتجر
    storeName: "متجر الكردي للزينة",
    storeAddress: "الدانا طريق دير حسان بعد مفرق 22",
    storeSocial: { tiktok: "https://www.tiktok.com/@altaqwaa_7?_r=1&_t=ZG-9An8oWxO6u8", facebook: "https://www.facebook.com/share/1JH1j35Rk4/?mibextid=wwXIfr", instagram: "https://www.instagram.com/altaqwaa_7?cplk=Y3p5NDc5ODlqMncw" }
};

// Helper: هل تم إعداد Firebase؟
window.taqwaFirebaseConfigured = function() {
    const f = window.TAQWA_CONFIG.firebase;
    if (!f || !f.apiKey || !f.databaseURL) return false;
    if (f.apiKey.includes('YOUR_') || f.databaseURL.includes('YOUR_')) return false;
    return true;
};

// Helper: بناء رابط واتساب للطلب
window.taqwaBuildWhatsAppUrl = function(order) {
    if (!order || !order.customer) return '';
    const c = window.TAQWA_CONFIG || {};
    const tryPaths = [
        c.whatsappNumber, c.whatsapp, c.phone, c.storePhone, c.supportPhone,
        c.contact && c.contact.whatsapp, c.contact && c.contact.phone,
        c.store && c.store.whatsapp, c.store && c.store.phone,
        c.support && c.support.whatsapp, c.support && c.support.phone,
        c.social && c.social.whatsapp
    ];
    let phone = '';
    for (const v of tryPaths) {
        if (v) {
            const d = String(v).replace(/\D/g, '');
            if (d.length >= 8) { phone = d; break; }
        }
    }
    if (!phone) return '';

    // حالة الدفع
    const isPaid = !!(order.paymentReceipt && (order.paymentReceipt.data || order.paymentReceipt.attached || typeof order.paymentReceipt === 'string'));
    const paymentLine = isPaid
        ? '💳 *حالة الدفع:* ✅ تم الدفع عبر شام كاش (تم إرفاق وصل التحويل)'
        : '💳 *حالة الدفع:* ⏳ لم يتم الدفع بعد (لم يتم إرفاق وصل)';

    let msg = '🛍️ *طلب جديد من متجر الكردي للزينة*\n';
    msg += '━━━━━━━━━━━━━━━━\n';
    msg += '👤 الاسم: ' + order.customer.fullName + '\n';
    msg += '📞 الهاتف: ' + order.customer.phone + '\n';
    msg += '📍 المدينة: ' + order.customer.city + '\n';
    msg += '🏠 العنوان: ' + order.customer.address + '\n';
    if (order.customer.notes) msg += '📝 ملاحظات: ' + order.customer.notes + '\n';
    msg += '\n🔑 *رمز التتبع:* ' + (order.trackingCode || '—') + '\n';
    msg += '\n📦 *المنتجات:*\n';
    (order.items || []).forEach(it => {
        let line = '• ' + it.name;
        if (it.selectedSize) line += ' [مقاس: ' + it.selectedSize + ']';
        if (it.selectedColor) line += ' [لون: ' + it.selectedColor + ']';
        line += ' × ' + it.qty + ' = ' + (parseFloat(it.price) * it.qty).toFixed(2) + '$\n';
        msg += line;
    });
    msg += '\n💰 المجموع الفرعي: ' + parseFloat(order.subtotal || 0).toFixed(2) + '$\n';
    if (order.discount > 0) msg += '🎫 الخصم: -' + parseFloat(order.discount).toFixed(2) + '$\n';
    msg += '💵 *الإجمالي: ' + parseFloat(order.total || 0).toFixed(2) + '$*\n';
    msg += '\n' + paymentLine + '\n';
    msg += '\n⏰ ' + new Date(order.timestamp || Date.now()).toLocaleString('ar-EG');
    return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg);
};