// =============================================
// FIREBASE CONFIG
// =============================================
const firebaseConfig = window.TAQWA_CONFIG.firebase;
if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// =============================================
// GLOBALS
// =============================================
let currentUserRole = 'admin';
let ads = [], categories = [], products = [], coupons = [], orders = [];
let allOrdersForStats = [];
const ORDERS_PAGE_SIZE = 30;
let oldestLoadedOrder = null;
let hasMoreOrders = true;
let loadingMoreOrders = false;
let tempSizes = [], tempColors = [];
let tempBulkPricing = [];              // <-- جديد: أسعار الجملة للنموذج
let tempEditSizes = {}, tempEditColors = {};
let tempEditBulk = {};                 // <-- جديد
let lastSearchText = '';
let lastOrderSearchText = '';
let adminDisplayedCount = 20;
let currentOrderFilter = 'all';
let isAdding = false;
let ordersRealtimeQuery = null;

// =============================================
// HELPERS
// =============================================
function showToast(msg, isError = false) {
  const t = document.getElementById('adminToast');
  if(!t) return;
  t.innerText = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.style.opacity = '0', 4000);
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } [m]));
}

function formatDate(ts) {
  if (!ts) return "تاريخ غير معروف";
  const d = new Date(ts);
  return d.toLocaleString('ar-EG');
}

function formatPrice(p) {
  return parseFloat(p || 0).toFixed(2);
}

function generateProductCode() {
  return 'TAQ' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function generateTrackingCode() {
  return 'TAQ-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// =============================================
// IMAGE COMPRESSION — TARGET 150-200KB
// =============================================
function compressImageToTarget(file, options = {}) {
  const {
    targetWidth = 1000,
    targetHeight = 1200,
    minKB = 150,
    maxKB = 200,
    maxIterations = 15,
    preserveAspect = false
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('صيغة الصورة غير مدعومة'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas غير مدعوم'));

          if (preserveAspect) {
            // احتفظ بالنِسب، لا تقص
            let w = img.width, h = img.height;
            if (w > targetWidth) { h = (targetWidth / w) * h; w = targetWidth; }
            if (h > targetHeight) { w = (targetHeight / h) * w; h = targetHeight; }
            canvas.width = Math.round(w);
            canvas.height = Math.round(h);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } else {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const srcRatio = img.width / img.height;
            const dstRatio = targetWidth / targetHeight;
            let sx = 0, sy = 0, sw = img.width, sh = img.height;
            if (srcRatio > dstRatio) {
              sw = img.height * dstRatio;
              sx = (img.width - sw) / 2;
            } else {
              sh = img.width / dstRatio;
              sy = (img.height - sh) / 2;
            }
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);
          }

          let quality = 0.92;
          let iteration = 0;
          const tryCompress = () => {
            canvas.toBlob((blob) => {
              if (!blob) return reject(new Error('فشل ضغط الصورة'));
              const sizeKB = blob.size / 1024;
              if (sizeKB <= maxKB || quality <= 0.35 || iteration >= maxIterations) {
                resolve(blob);
              } else {
                quality -= 0.06;
                iteration++;
                tryCompress();
              }
            }, 'image/jpeg', quality);
          };
          tryCompress();
        } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function compressImagePreservingAspect(file, options = {}) {
  const { maxWidth = 1000, maxHeight = 500, maxKB = 80 } = options;
  if (!file || !file.type || !file.type.startsWith('image/')) {
    return Promise.reject(new Error('الملف ليس صورة'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('صيغة الصورة غير مدعومة'));
      img.onload = async () => {
        try {
          // لا نعيد ترميز الصورة الخفيفة إذا كانت أبعادها مناسبة، ولا نكبّر الصور الصغيرة.
          if (file.size <= maxKB * 1024 && img.width <= maxWidth && img.height <= maxHeight) {
            resolve(file);
            return;
          }

          const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
          const width = Math.max(1, Math.round(img.width * scale));
          const height = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas غير مدعوم');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);

          let quality = 0.84;
          let bestBlob = null;
          for (let i = 0; i < 10; i++) {
            const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
            if (!blob) throw new Error('فشل ضغط الصورة');
            bestBlob = blob;
            if (blob.size <= maxKB * 1024) break;
            quality = Math.max(0.35, quality - 0.07);
          }

          // إذا لم ينتج الضغط ملفاً أصغر، نحتفظ بالأصل بدلاً من زيادة حجمه.
          if (bestBlob.size >= file.size) {
            resolve(file);
            return;
          }
          const baseName = (file.name || 'image').replace(/\.[^.]+$/, '');
          resolve(new File([bestBlob], baseName + '.jpg', {
            type: 'image/jpeg',
            lastModified: Date.now()
          }));
        } catch (error) {
          reject(error);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function compressProductImage(file) {
  return compressImagePreservingAspect(file, { maxWidth: 800, maxHeight: 960, maxKB: 130 });
}
function compressCategoryImage(file) {
  return compressImagePreservingAspect(file, { maxWidth: 1000, maxHeight: 500, maxKB: 80 });
}
function compressGeneralImage(file) {
  return compressImageToTarget(file, { targetWidth: 800, targetHeight: 800, minKB: 50, maxKB: 110, preserveAspect: true });
}

async function uploadProductImage(file) {
  try {
    if (!window.TAQWA_CONFIG.cloudinary.cloudName || window.TAQWA_CONFIG.cloudinary.cloudName.includes('YOUR_') || !window.TAQWA_CONFIG.cloudinary.uploadPreset || window.TAQWA_CONFIG.cloudinary.uploadPreset.includes('YOUR_')) throw new Error('يرجى ضبط إعدادات Cloudinary');
    const compressed = await compressProductImage(file);
    const fd = new FormData();
    fd.append('file', compressed);
    fd.append('upload_preset', window.TAQWA_CONFIG.cloudinary.uploadPreset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${window.TAQWA_CONFIG.cloudinary.cloudName}/upload`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error('Upload failed');
    const data = await r.json();
    return data.secure_url;
  } catch (err) { console.error(err); throw err; }
}

async function uploadImage(file) {
  try {
    if (!window.TAQWA_CONFIG.cloudinary.cloudName || window.TAQWA_CONFIG.cloudinary.cloudName.includes('YOUR_') || !window.TAQWA_CONFIG.cloudinary.uploadPreset || window.TAQWA_CONFIG.cloudinary.uploadPreset.includes('YOUR_')) throw new Error('يرجى ضبط إعدادات Cloudinary');
    if (!file.type.startsWith('image/')) throw new Error('الملف ليس صورة');
    if (file.size > 8 * 1024 * 1024) throw new Error('حجم الصورة كبير جداً (الحد الأقصى 8 ميجابايت)');
    const compressed = await compressGeneralImage(file);
    const fd = new FormData();
    fd.append('file', compressed);
    fd.append('upload_preset', window.TAQWA_CONFIG.cloudinary.uploadPreset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${window.TAQWA_CONFIG.cloudinary.cloudName}/upload`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`فشل الرفع (${r.status})`);
    const data = await r.json();
    return data.secure_url;
  } catch (err) { console.error(err); throw err; }
}

async function uploadCategoryImage(file) {
  try {
    if (!window.TAQWA_CONFIG.cloudinary.cloudName || window.TAQWA_CONFIG.cloudinary.cloudName.includes('YOUR_') || !window.TAQWA_CONFIG.cloudinary.uploadPreset || window.TAQWA_CONFIG.cloudinary.uploadPreset.includes('YOUR_')) throw new Error('يرجى ضبط إعدادات Cloudinary');
    if (!file.type.startsWith('image/')) throw new Error('الملف ليس صورة');
    if (file.size > 8 * 1024 * 1024) throw new Error('حجم الصورة كبير جداً (الحد الأقصى 8 ميجابايت)');
    const compressed = await compressCategoryImage(file);
    const fd = new FormData();
    fd.append('file', compressed);
    fd.append('upload_preset', window.TAQWA_CONFIG.cloudinary.uploadPreset);
    const r = await fetch(`https://api.cloudinary.com/v1_1/${window.TAQWA_CONFIG.cloudinary.cloudName}/upload`, { method: 'POST', body: fd });
    if (!r.ok) throw new Error(`فشل الرفع (${r.status})`);
    const data = await r.json();
    return data.secure_url;
  } catch (err) { console.error(err); throw err; }
}

// =============================================
// BULK PRICING — HELPERS (جديد)
// =============================================
function normalizeBulkTiers(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(t => ({ qty: parseInt(t.qty) || 0, price: parseFloat(t.price) || 0 }))
    .filter(t => t.qty >= 2 && t.price > 0)
    .sort((a, b) => a.qty - b.qty);
}

function renderBulkContainer(containerId, tiers, removeFn, editId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  if (!tiers.length) {
    c.innerHTML = '<div style="font-size:0.75rem; color:#aea89c; padding:6px 0">لا توجد أسعار جملة بعد</div>';
    return;
  }
  c.innerHTML = tiers.map(t => `
    <div style="display:flex; align-items:center; justify-content:space-between; background:#fcf8f1; padding:6px 12px; border-radius:10px; font-size:0.8rem; gap:6px">
      <span><i class="fas fa-tags" style="color:#9f7928"></i> عند شراء <strong>${t.qty}</strong> قطعة أو أكثر → <strong style="color:#9f7928">${formatPrice(t.price)} $</strong>/قطعة</span>
      <button class="btn btn-sm btn-danger" onclick="${removeFn}(${editId ? `'${editId}',` : ''}${t.qty})" style="padding:2px 8px"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
}

window.addBulkTier = function () {
  const qtyInput = document.getElementById('bulkQtyInput');
  const priceInput = document.getElementById('bulkPriceInput');
  const qty = parseInt(qtyInput.value);
  const price = parseFloat(priceInput.value);
  if (!qty || qty < 2) return showToast('الكمية يجب أن تكون 2 أو أكثر', true);
  if (!price || price <= 0) return showToast('أدخل سعراً صحيحاً', true);
  if (tempBulkPricing.find(t => t.qty === qty)) return showToast('هذه الكمية مضافة مسبقاً', true);
  tempBulkPricing.push({ qty, price });
  tempBulkPricing = normalizeBulkTiers(tempBulkPricing);
  qtyInput.value = '';
  priceInput.value = '';
  renderBulkContainer('bulkPricingContainer', tempBulkPricing, 'removeBulkTier', null);
};

window.removeBulkTier = function (qty) {
  tempBulkPricing = tempBulkPricing.filter(t => t.qty !== qty);
  renderBulkContainer('bulkPricingContainer', tempBulkPricing, 'removeBulkTier', null);
};

window.addEditBulkTier = function (id) {
  const qtyInput = document.getElementById(`editBulkQty_${id}`);
  const priceInput = document.getElementById(`editBulkPrice_${id}`);
  const qty = parseInt(qtyInput.value);
  const price = parseFloat(priceInput.value);
  if (!qty || qty < 2) return showToast('الكمية يجب أن تكون 2 أو أكثر', true);
  if (!price || price <= 0) return showToast('أدخل سعراً صحيحاً', true);
  if (!tempEditBulk[id]) tempEditBulk[id] = [];
  if (tempEditBulk[id].find(t => t.qty === qty)) return showToast('هذه الكمية مضافة مسبقاً', true);
  tempEditBulk[id].push({ qty, price });
  tempEditBulk[id] = normalizeBulkTiers(tempEditBulk[id]);
  qtyInput.value = '';
  priceInput.value = '';
  renderBulkContainer(`editBulk_${id}`, tempEditBulk[id], 'removeEditBulkTier', id);
};

window.removeEditBulkTier = function (id, qty) {
  tempEditBulk[id] = (tempEditBulk[id] || []).filter(t => t.qty !== qty);
  renderBulkContainer(`editBulk_${id}`, tempEditBulk[id], 'removeEditBulkTier', id);
};

// =============================================
// SIDEBAR / TABS
// =============================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('active');
}

document.querySelectorAll('.sidebar-item[data-tab]').forEach(item => {
  item.addEventListener('click', function() {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    this.classList.add('active');
    const tab = this.dataset.tab;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1));
    if (target) target.classList.add('active');
    toggleSidebar();
    if (tab === 'dashboard') { renderStats(); fetchVisitorStats(); }
    if (tab === 'orders') renderOrders();
    if (tab === 'products') renderProducts();
    if (tab === 'categories') renderCategories();
    if (tab === 'subcategories') renderSubcategories();
    if (tab === 'coupons') renderCoupons();
    if (tab === 'ads') renderAds();
  });
});

// =============================================
// AUTH
// =============================================
auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.href = 'taqwa-access-r7v4k2.html'; return; }
  try {
    showToast('⏳ جاري تحميل البيانات...', false);
    const roleSnap = await db.ref(`admins/${user.uid}/role`).once('value');
    const role = roleSnap.val();
    if (role !== 'admin' && role !== 'super') {
      await auth.signOut();
      alert('هذا الحساب غير مخوّل للوصول إلى لوحة الإدارة.');
      window.location.replace('taqwa-access-r7v4k2.html');
      return;
    }
    currentUserRole = role;
    await loadAllData();
    setupOrdersRealtimeListener();
    await loadSettings();
    await fetchVisitorStats();
    setupFileInputListeners();
    renderBulkContainer('bulkPricingContainer', tempBulkPricing, 'removeBulkTier', null);
    showToast('✅ تم تحميل البيانات', false);
  } catch (e) {
    console.error(e);
    showToast('خطأ في تحميل البيانات', true);
  }
});

function logout() {
  auth.signOut().then(() => { window.location.href = 'taqwa-access-r7v4k2.html'; });
}

// =============================================
// LOAD ALL
// =============================================
async function loadAllData() {
  try {
    const [catSnap, prodSnap, couponsSnap, adsSnap] = await Promise.all([
      db.ref('categories').once('value'),
      db.ref('products').once('value'),
      db.ref('coupons').once('value'),
      db.ref('ads').once('value')
    ]);
    categories = catSnap.val() ? Object.keys(catSnap.val()).map(k => ({ id: k, ...catSnap.val()[k] })) : [];
    products = prodSnap.val() ? Object.keys(prodSnap.val()).map(k => ({ id: k, ...prodSnap.val()[k] })) : [];
    coupons = couponsSnap.val() ? Object.keys(couponsSnap.val()).map(k => ({ id: k, ...couponsSnap.val()[k] })) : [];
    orders = [];
    allOrdersForStats = [];
    oldestLoadedOrder = null;
    hasMoreOrders = true;
    ads = adsSnap.val() ? Object.keys(adsSnap.val()).map(k => ({ id: k, ...adsSnap.val()[k] })) : [];
    // ضمان وجود bulkPricing
    products.forEach(p => { if (!p.bulkPricing) p.bulkPricing = []; });
    categories.forEach(c => { if (c.order === undefined) c.order = 0; if (!c.subcategories) c.subcategories = {}; });
    categories.sort((a, b) => (a.order || 0) - (b.order || 0));
    adminDisplayedCount = 20;
    updateCategorySelects();
    renderAll();
    await loadLatestOrders();
    loadAllOrdersForStatsInBackground();
  } catch (err) { console.error(err); throw err; }
}

function renderAll() {
  renderStats(); renderOrders(); renderProducts(); renderCategories();
  renderSubcategories(); renderCoupons(); renderAds();
  updateCategorySelects(); updateNewCatOrder();
}

// =============================================
// SAVE ALL
// =============================================
async function saveAll() {
  try {
    if (currentUserRole === 'super') {
      const adsObj = {};
      ads.forEach(a => { adsObj[a.id] = { image: a.image, text: a.text, active: a.active }; });
      await db.ref('ads').set(adsObj);
    }
    const catsObj = {};
    categories.forEach(c => {
      catsObj[c.id] = { name: c.name, image: c.image, active: c.active, order: c.order || 0, subcategories: c.subcategories || {} };
    });
    await db.ref('categories').set(catsObj);

    const prodsObj = {};
    products.forEach(p => {
      const images = p.images || (p.image ? [p.image] : []);
      prodsObj[p.id] = {
        name: p.name, price: p.price, oldprice: p.oldprice || '',
        desc: p.desc || '', image: p.image || (images.length > 0 ? images[0] : ''),
        images: images, categoryId: p.categoryId, subcategoryId: p.subcategoryId || '',
        code: p.code || generateProductCode(), sizes: p.sizes || [], colors: p.colors || [],
        quantity: p.quantity !== undefined ? p.quantity : 99,
        bulkPricing: p.bulkPricing || [],
        active: p.active, createdAt: p.createdAt || null
      };
    });
    await db.ref('products').set(prodsObj);

    const couponsObj = {};
    coupons.forEach(c => {
      couponsObj[c.id] = {
        code: c.code, type: c.type, value: c.value, minAmount: c.minAmount || null,
        expiryDate: c.expiryDate || null, usageLimit: c.usageLimit || null,
        usedCount: c.usedCount || 0, active: c.active !== false
      };
    });
    await db.ref('coupons').set(couponsObj);
    renderAll();
    showToast('✅ تم الحفظ');
  } catch (err) { console.error(err); showToast('فشل الحفظ', true); }
}

// =============================================
// STATS
// =============================================
function renderStats() {
  const totalProducts = products.length;
  const activeProducts = products.filter(p => p.active !== false).length;
  const statsOrders = allOrdersForStats.length ? allOrdersForStats : orders;
  const totalOrders = statsOrders.length;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();
  let todaySales = 0, monthSales = 0, yearSales = 0;
  let newOrders = 0, processingOrders = 0, shippedOrders = 0;
  const productSales = {};
  statsOrders.forEach(o => {
    const ts = o.timestamp || 0;
    if (ts >= todayStart) todaySales += o.total || 0;
    if (ts >= monthStart) monthSales += o.total || 0;
    if (ts >= yearStart) yearSales += o.total || 0;
    const status = o.status || 'new';
    if (status === 'new') newOrders++;
    else if (status === 'processing') processingOrders++;
    else if (status === 'shipped') shippedOrders++;
    if (o.items) o.items.forEach(item => {
      const id = item.id || item.name;
      if (!productSales[id]) productSales[id] = { name: item.name, qty: 0 };
      productSales[id].qty += item.qty || 0;
    });
  });
  document.getElementById('statTotalProducts').textContent = totalProducts;
  document.getElementById('statActiveProducts').textContent = activeProducts;
  document.getElementById('statTotalOrders').textContent = totalOrders;
  document.getElementById('statTodaySales').textContent = formatPrice(todaySales) + ' $';
  document.getElementById('statMonthSales').textContent = formatPrice(monthSales) + ' $';
  document.getElementById('statYearSales').textContent = formatPrice(yearSales) + ' $';
  document.getElementById('statNewOrders').textContent = newOrders;
  document.getElementById('statProcessingOrders').textContent = processingOrders;
  document.getElementById('statShippedOrders').textContent = shippedOrders;
  const sorted = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);
  const topContainer = document.getElementById('topProductsList');
  if(topContainer) {
    if (sorted.length === 0) topContainer.innerHTML = '<span style="color:#aea89c">لا توجد مبيعات بعد</span>';
    else topContainer.innerHTML = sorted.map((p, i) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f2e5c9"><span>${i+1}. ${escapeHtml(p.name)}</span><span style="font-weight:bold;color:var(--primary)">${p.qty} قطعة</span></div>`).join('');
  }
  const chartContainer = document.getElementById('miniChart');
  if(chartContainer){
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0); days.push(d.getTime()); }
    const salesByDay = days.map(day => {
      let sum = 0;
      statsOrders.forEach(o => { if ((o.timestamp || 0) >= day && (o.timestamp || 0) < day + 86400000) sum += o.total || 0; });
      return sum;
    });
    const max = Math.max(...salesByDay, 1);
    chartContainer.innerHTML = salesByDay.map(val => `<div class="bar" style="height:${(val/max)*100}%; background:${val>0?'var(--primary)':'#ffffff'}" title="${formatPrice(val)}$"></div>`).join('');
  }
  const cAll = document.getElementById('countAll'); if(cAll) cAll.textContent = totalOrders;
  const cNew = document.getElementById('countNew'); if(cNew) cNew.textContent = newOrders;
  const cProc = document.getElementById('countProcessing'); if(cProc) cProc.textContent = processingOrders;
  const cShip = document.getElementById('countShipped'); if(cShip) cShip.textContent = shippedOrders;
}

async function fetchVisitorStats() {
  try {
    const snapshot = await db.ref('visits').once('value');
    const data = snapshot.val() || {};
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 30);
    let todayCount = 0, weekCount = 0, monthCount = 0, totalCount = 0;
    for (const [dateKey, count] of Object.entries(data)) {
      const dateTime = new Date(dateKey).getTime();
      totalCount += count;
      if (dateKey === today) todayCount = count;
      if (dateTime >= weekAgo.getTime()) weekCount += count;
      if (dateTime >= monthAgo.getTime()) monthCount += count;
    }
    const vToday = document.getElementById('visitorsToday'); if(vToday) vToday.textContent = todayCount;
    const vWeek = document.getElementById('visitorsWeek'); if(vWeek) vWeek.textContent = weekCount;
    const vMonth = document.getElementById('visitorsMonth'); if(vMonth) vMonth.textContent = monthCount;
    const vTotal = document.getElementById('visitorsTotal'); if(vTotal) vTotal.textContent = totalCount;
  } catch (err) { console.error(err); }
}

function setupOrdersRealtimeListener() {
  if (ordersRealtimeQuery) ordersRealtimeQuery.off('value');
  ordersRealtimeQuery = db.ref('orders').orderByChild('timestamp').limitToLast(ORDERS_PAGE_SIZE);
  ordersRealtimeQuery.on('value', (snapshot) => {
    const val = snapshot.val() || {};
    const latest = Object.keys(val).map(id => ({ id, ...val[id] })).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const olderLoaded = orders.filter(old => !latest.some(item => item.id === old.id));
    orders = latest.concat(olderLoaded).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    oldestLoadedOrder = orders.length ? orders[orders.length - 1] : null;
    renderOrders(); renderStats();
  }, (error) => { console.error(error); });
}

// =============================================
// ORDERS
// =============================================
async function loadLatestOrders() {
  const snap = await db.ref('orders').orderByChild('timestamp').limitToLast(ORDERS_PAGE_SIZE).once('value');
  const val = snap.val() || {};
  orders = Object.keys(val).map(id => ({ id, ...val[id] })).sort((a,b) => (b.timestamp||0)-(a.timestamp||0));
  oldestLoadedOrder = orders.length ? orders[orders.length - 1] : null;
  hasMoreOrders = orders.length === ORDERS_PAGE_SIZE;
  renderOrders(); renderStats();
}

async function loadMoreOrders() {
  if (loadingMoreOrders || !hasMoreOrders || !oldestLoadedOrder) return;
  loadingMoreOrders = true;
  const btn = document.getElementById('loadMoreOrdersBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري تحميل الطلبات...'; }
  try {
    const cursor = oldestLoadedOrder;
    const snap = await db.ref('orders').orderByChild('timestamp').endAt(cursor.timestamp || 0, cursor.id).limitToLast(ORDERS_PAGE_SIZE + 1).once('value');
    const val = snap.val() || {};
    const page = Object.keys(val).map(id => ({ id, ...val[id] })).filter(o => !orders.some(existing => existing.id === o.id)).sort((a,b) => (b.timestamp||0)-(a.timestamp||0));
    if (page.length) { orders = orders.concat(page); oldestLoadedOrder = orders[orders.length - 1]; }
    hasMoreOrders = page.length >= ORDERS_PAGE_SIZE;
    renderOrders();
  } catch (err) { showToast('تعذر تحميل المزيد من الطلبات', true); }
  finally { loadingMoreOrders = false; const b = document.getElementById('loadMoreOrdersBtn'); if (b) { b.disabled = false; b.textContent = 'تحميل 30 طلباً أقدم'; } }
}

async function loadAllOrdersForStatsInBackground() {
  try {
    const snap = await db.ref('orders').once('value');
    const val = snap.val() || {};
    allOrdersForStats = Object.keys(val).map(id => ({ id, ...val[id] }));
    renderStats();
  } catch (err) { console.error(err); }
}

function renderOrders() {
  const container = document.getElementById('ordersList');
  if (!container) return;
  let filtered = [...orders];
  if (currentOrderFilter !== 'all') filtered = filtered.filter(o => (o.status || 'new') === currentOrderFilter);
  if (lastOrderSearchText.trim()) {
    const lower = lastOrderSearchText.toLowerCase();
    filtered = filtered.filter(o => o.customer?.fullName?.toLowerCase().includes(lower) || o.customer?.phone?.includes(lower) || (o.trackingCode && o.trackingCode.toLowerCase().includes(lower)));
  }
  filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  if (filtered.length === 0) { container.innerHTML = '<div class="empty-msg">لا توجد طلبات ضمن النتائج المحمّلة</div>'; appendLoadMoreOrdersButton(container); return; }
  container.innerHTML = filtered.map(order => {
    const status = order.status || 'new';
    const statusBadge = { 'new': 'badge-status-new', 'processing': 'badge-status-processing', 'shipped': 'badge-status-shipped' } [status] || 'badge-status-new';
    const statusText = { 'new': 'جديد', 'processing': 'قيد التجهيز', 'shipped': 'تم الشحن' } [status] || 'جديد';
    const paymentMethod = order.paymentMethod || 'shamcash';
    const paymentLabel = paymentMethod === 'cod' ? 'دفع عند الاستلام 💵' : 'شام كاش 💳';
    const paidLabel = paymentMethod === 'cod' ? '💵 الدفع عند الاستلام' : ((order.paymentReceipt && (order.paymentReceipt.data || typeof order.paymentReceipt === 'string')) ? '✅ تم الدفع' : '⏳ لم يتم الدفع');
    const customer = order.customer || {};
    const customerDetails = `
      <div class="customer-details">
        <div class="detail-row"><span class="label">👤 الاسم</span><span class="value">${escapeHtml(customer.fullName || 'غير معروف')}</span></div>
        <div class="detail-row"><span class="label">📞 الهاتف</span><span class="value">${escapeHtml(customer.phone || 'غير معروف')}</span></div>
        <div class="detail-row"><span class="label">📍 المدينة</span><span class="value">${escapeHtml(customer.city || 'غير معروف')}</span></div>
        <div class="detail-row"><span class="label">🏠 العنوان</span><span class="value">${escapeHtml(customer.address || 'غير معروف')}</span></div>
        ${customer.notes ? `<div class="detail-row"><span class="label">📝 ملاحظات</span><span class="value">${escapeHtml(customer.notes)}</span></div>` : ''}
        <div class="detail-row"><span class="label">💳 طريقة الدفع</span><span class="value"><span class="badge badge-payment">${paymentLabel}</span> <span class="badge" style="background:${order.paymentReceipt?'#2ed573':'#ffa502'};color:white">${paidLabel}</span></span></div>
        ${order.trackingCode ? `<div class="detail-row"><span class="label">🔑 رمز التتبع</span><span class="value" style="direction:ltr;font-weight:800;color:var(--primary)">${order.trackingCode}</span></div>` : ''}
        ${order.coupon ? `<div class="detail-row"><span class="label">🎫 كوبون مستخدم</span><span class="value"><span class="coupon-used-badge">${escapeHtml(order.coupon.code)} (${order.coupon.type === 'percentage' ? order.coupon.value+'%' : order.coupon.value+'$'})</span></span></div>` : ''}
      </div>`;
    let itemsHtml = `<table class="invoice-table"><thead><tr><th>#</th><th>الصورة</th><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>`;
    (order.items || []).forEach((item, i) => {
      const productImage = item.image || 'https://via.placeholder.com/40';
      const sizeInfo = item.selectedSize ? `<small>مقاس: ${item.selectedSize}</small>` : '';
      const colorInfo = item.selectedColor ? `<small>لون: ${item.selectedColor}</small>` : '';
      itemsHtml += `<tr><td>${i+1}</td><td><img src="${productImage}" alt="${escapeHtml(item.name)}" onerror="this.src='https://via.placeholder.com/40'"></td><td class="product-name">${escapeHtml(item.name)} ${sizeInfo || colorInfo ? `<br>${sizeInfo} ${colorInfo}` : ''}</td><td>${item.qty}</td><td>${formatPrice(item.price)}$</td><td>${formatPrice(item.totalPrice != null ? item.totalPrice : item.price*item.qty)}$</td></tr>`;
    });
    itemsHtml += `</tbody></table>`;
    let subtotal = order.subtotal || 0;
    if (!order.subtotal && order.items) subtotal = order.items.reduce((sum, it) => sum + (parseFloat(it.price) * (it.qty || 0)), 0);
    let finalTotal = order.total || 0;
    if (!order.total && subtotal > 0) finalTotal = subtotal;
    const totalsHtml = `
      <div class="order-totals-details">
        <div class="totals-row"><span class="label">المجموع الفرعي</span><span class="value">${formatPrice(subtotal)} $</span></div>
        <div class="totals-divider"></div>
        <div class="totals-row"><span class="label" style="font-weight:800">المجموع النهائي</span><span class="value total">${formatPrice(finalTotal)} $</span></div>
      </div>`;
    return `
      <div class="item-card">
        <div class="item-header">
          <div class="item-info">
            <span class="badge badge-order">#${order.id.substring(0,8)}</span>
            <span class="badge ${statusBadge}">${statusText}</span>
            ${order.trackingCode ? `<span class="badge" style="background:#9f7928;color:white">🔑 ${order.trackingCode}</span>` : ''}
            ${order.coupon ? `<span class="badge coupon-used-badge">🎫 ${order.coupon.code}</span>` : ''}
            <span class="badge badge-payment">${paymentLabel}</span>
            <span class="badge" style="background:${order.paymentReceipt?'#2ed573':'#ffa502'};color:white">${paidLabel}</span>
          </div>
          <div class="item-actions">
            ${status !== 'processing' ? `<button class="btn btn-sm" style="background:#ffa502;color:white" onclick="updateOrderStatus('${order.id}','processing')">📦 تجهيز</button>` : ''}
            ${status !== 'shipped' ? `<button class="btn btn-sm" style="background:#2ed573;color:white" onclick="updateOrderStatus('${order.id}','shipped')">🚚 شحن</button>` : ''}
            ${status !== 'new' ? `<button class="btn btn-sm" style="background:#ce9f3b;color:white" onclick="updateOrderStatus('${order.id}','new')">↩️ إعادة</button>` : ''}
            <button class="btn btn-sm btn-danger" onclick="deleteOrder('${order.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div style="font-size:0.75rem; margin:6px 0">📅 ${formatDate(order.timestamp)}</div>
        ${customerDetails}
        ${itemsHtml}
        ${totalsHtml}
        ${order.paymentReceipt && (order.paymentReceipt.data || typeof order.paymentReceipt === 'string') ? (() => {
          const receiptSrc = typeof order.paymentReceipt === 'string' ? order.paymentReceipt : order.paymentReceipt.data;
          return `<div class="admin-payment-receipt" style="margin-top:14px;padding:12px;border:1px solid #efe0bf;border-radius:12px;background:#fdfbf7">
            <strong style="display:block;margin-bottom:8px;color:#9f7928">🧾 وصل الدفع المرفق</strong>
            <a href="${receiptSrc}" target="_blank" rel="noopener" style="display:inline-block;color:#9f7928;font-weight:700;margin-bottom:8px">فتح الوصل بالحجم الكامل</a>
            <img src="${receiptSrc}" alt="وصل الدفع" loading="lazy" style="display:block;max-width:100%;max-height:360px;object-fit:contain;border-radius:8px;background:white" onerror="this.style.display='none'">
          </div>`;
        })() : (order.paymentReceipt && order.paymentReceipt.attached ? '<div style="margin-top:12px;color:#16834a;font-weight:700">✅ تم إرفاق وصل الدفع (الرابط غير متاح للعرض)</div>' : '')}
      </div>`;
  }).join('');
  appendLoadMoreOrdersButton(container);
}

function appendLoadMoreOrdersButton(container) {
  const old = document.getElementById('loadMoreOrdersBtn'); if (old) old.remove();
  if (!hasMoreOrders) return;
  const button = document.createElement('button');
  button.id = 'loadMoreOrdersBtn';
  button.className = 'btn btn-secondary';
  button.style.cssText = 'display:block;width:100%;margin:14px 0;padding:12px;';
  button.textContent = loadingMoreOrders ? '⏳ جاري تحميل الطلبات...' : 'تحميل 30 طلباً أقدم';
  button.disabled = loadingMoreOrders;
  button.onclick = loadMoreOrders;
  container.appendChild(button);
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const order = orders.find(o => o.id === orderId) || allOrdersForStats.find(o => o.id === orderId);
    const updates = {};
    updates[`orders/${orderId}/status`] = newStatus;
    if (order && order.trackingCode) updates[`publicTracking/${order.trackingCode}/status`] = newStatus;
    await db.ref().update(updates);
    if (order) order.status = newStatus;
    const so = allOrdersForStats.find(o => o.id === orderId); if (so) so.status = newStatus;
    renderOrders(); renderStats();
    showToast(`✅ تم تحديث الحالة إلى ${newStatus}`);
  } catch (e) { showToast('خطأ في التحديث', true); }
}

window.deleteOrder = async (id) => {
  if (!confirm('حذف الطلب؟')) return;
  orders = orders.filter(o => o.id !== id);
  allOrdersForStats = allOrdersForStats.filter(o => o.id !== id);
  await db.ref(`orders/${id}`).remove();
  renderOrders(); renderStats();
  showToast('تم حذف الطلب');
};

document.querySelectorAll('.status-tab').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.status-tab').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentOrderFilter = this.dataset.status;
    renderOrders();
  });
});

// =============================================
// PRODUCTS
// =============================================
function setupFileInputListeners() {
  const fileInputs = [
    { id: 'prodImageFile1', labelId: 'prodFileName1' },
    { id: 'prodImageFile2', labelId: 'prodFileName2' },
    { id: 'prodImageFile3', labelId: 'prodFileName3' }
  ];
  fileInputs.forEach(({ id, labelId }) => {
    const input = document.getElementById(id);
    const label = document.getElementById(labelId);
    if (input && label) {
      input.removeEventListener('change', handleFileChange);
      input.addEventListener('change', handleFileChange);
      input.dataset.labelId = labelId;
    }
  });
}
function handleFileChange(e) {
  const input = e.target;
  const labelId = input.dataset.labelId;
  const label = document.getElementById(labelId);
  if (input.files.length) label.innerHTML = `📷 ${input.files[0].name} (سيُضغط إلى ~150-200KB)`;
  else label.innerHTML = '📷 لم يتم اختيار ملف';
}

function renderProducts() {
  const container = document.getElementById('productsList');
  if (!container) return;
  const totalCountEl = document.getElementById('totalProductsCount');
  if(totalCountEl) totalCountEl.textContent = products.length;
  let filtered = [...products];
  if (lastSearchText.trim()) {
    const lower = lastSearchText.toLowerCase();
    filtered = products.filter(p => p.name.toLowerCase().includes(lower) || (p.code || '').toLowerCase().includes(lower));
  }
  const toShow = filtered.slice(0, adminDisplayedCount);
  if (toShow.length === 0) { container.innerHTML = '<div class="empty-msg">لا توجد منتجات</div>'; const btn = document.getElementById('adminLoadMoreBtn'); if(btn) btn.style.display = 'none'; return; }
  container.innerHTML = toShow.map(p => {
    const firstImg = (p.images && p.images.length > 0) ? p.images[0] : (p.image || 'https://via.placeholder.com/50');
    const quantity = p.quantity !== undefined ? p.quantity : 99;
    const isOutOfStock = quantity <= 0;
    const imgStatus = (idx) => {
      const exists = p.images && p.images[idx];
      return exists ? `✅ موجودة <button class="image-delete-btn" onclick="removeProductImage('${p.id}', ${idx})" title="حذف الصورة">✖</button>` : '❌ غير موجودة';
    };
    const bulkCount = (p.bulkPricing || []).length;
    return `
      <div class="item-card">
        <div class="item-header">
          <div class="item-info">
            <img src="${firstImg}" class="item-img">
            <strong>${escapeHtml(p.name)}</strong> - ${formatPrice(p.price)}$
            <span class="badge ${isOutOfStock?'badge-inactive':'badge-active'}">${isOutOfStock?'❌ نفذت':`📦 ${quantity}`}</span>
            ${bulkCount > 0 ? `<span class="badge" style="background:#ffd93d;color:#2a2314">🏷️ ${bulkCount} سعر جملة</span>` : ''}
            <span class="badge ${p.active!==false?'badge-active':'badge-inactive'}">${p.active!==false?'نشط':'مخفي'}</span>
          </div>
          <div class="item-actions">
            <button class="btn btn-sm btn-secondary" onclick="openEditProduct('${p.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-primary" onclick="toggleProduct('${p.id}')"><i class="fas fa-eye${p.active!==false?'-slash':''}"></i></button>
            <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
        <div id="editProduct_${p.id}" class="edit-form">
          <div class="row-2"><input type="text" id="editName_${p.id}" value="${p.name}"><input type="text" id="editPrice_${p.id}" value="${p.price}"></div>
          <div class="row-2"><input type="text" id="editOld_${p.id}" value="${p.oldprice||''}"><input type="text" id="editCode_${p.id}" value="${p.code||''}"></div>
          <div class="row-2"><input type="number" id="editQuantity_${p.id}" value="${quantity}" min="0"><select id="editCat_${p.id}"></select></div>
          <select id="editSubcat_${p.id}" style="display:none"><option value=""></option></select>
          <textarea id="editDesc_${p.id}" rows="2">${p.desc||''}</textarea>
          <div id="editSizes_${p.id}"></div>
          <div id="editColors_${p.id}"></div>
          <!-- أسعار الجملة -->
          <div style="background:#fcfaf5;padding:12px;border-radius:16px;margin:12px 0">
            <label><i class="fas fa-tags"></i> أسعار الجملة (عند شراء كمية أكبر)</label>
            <div id="editBulk_${p.id}" style="display:flex;flex-direction:column;gap:6px;margin:8px 0"></div>
            <div class="row-2">
              <input type="number" id="editBulkQty_${p.id}" placeholder="الكمية (مثلاً 10)" min="2">
              <input type="number" id="editBulkPrice_${p.id}" placeholder="السعر للقطعة" step="0.01" min="0">
              <button class="btn btn-secondary" onclick="addEditBulkTier('${p.id}')">+ إضافة</button>
            </div>
          </div>
          <div style="background:#fcfaf5; padding:12px; border-radius:12px; margin:12px 0">
            <label>تغيير الصور (اختر صورة جديدة لاستبدالها)</label>
            <div class="image-upload-row">
              <div><div class="file-upload-btn" onclick="document.getElementById('editImgFile1_${p.id}').click()">الصورة 1</div><input type="file" id="editImgFile1_${p.id}" accept="image/*" style="display:none"><div id="editImgName1_${p.id}" style="font-size:0.7rem" class="image-status">${imgStatus(0)}</div></div>
              <div><div class="file-upload-btn" onclick="document.getElementById('editImgFile2_${p.id}').click()">الصورة 2</div><input type="file" id="editImgFile2_${p.id}" accept="image/*" style="display:none"><div id="editImgName2_${p.id}" style="font-size:0.7rem" class="image-status">${imgStatus(1)}</div></div>
              <div><div class="file-upload-btn" onclick="document.getElementById('editImgFile3_${p.id}').click()">الصورة 3</div><input type="file" id="editImgFile3_${p.id}" accept="image/*" style="display:none"><div id="editImgName3_${p.id}" style="font-size:0.7rem" class="image-status">${imgStatus(2)}</div></div>
            </div>
          </div>
          <div class="row-2" style="margin-top:10px">
            <button class="btn btn-sm btn-primary" onclick="updateProductData('${p.id}')">حفظ البيانات</button>
            <button class="btn btn-sm btn-secondary" onclick="document.getElementById('editProduct_${p.id}').classList.remove('open')">إلغاء</button>
          </div>
        </div>
      </div>`;
  }).join('');
  const loadMoreBtn = document.getElementById('adminLoadMoreBtn');
  if (loadMoreBtn) {
    if (toShow.length >= filtered.length || filtered.length <= adminDisplayedCount) loadMoreBtn.style.display = 'none';
    else { loadMoreBtn.style.display = 'inline-flex'; loadMoreBtn.innerHTML = `<i class="fas fa-chevron-down"></i> تحميل المزيد (${Math.min(filtered.length - toShow.length, 20)} منتج)`; }
  }
  toShow.forEach(p => populateEditForm(p.id));
}

const adminLoadMoreBtn = document.getElementById('adminLoadMoreBtn');
if(adminLoadMoreBtn) adminLoadMoreBtn.addEventListener('click', function() { adminDisplayedCount += 20; renderProducts(); });

const addProductBtn = document.getElementById('addProductBtn');
if(addProductBtn) {
  addProductBtn.onclick = async function() {
    if (isAdding) { showToast('⏳ جاري إضافة المنتج، انتظر...', false); return; }
    const btn = this;
    const name = document.getElementById('prodName').value.trim();
    const price = document.getElementById('prodPrice').value.trim();
    const categoryId = document.getElementById('prodCategory').value;
    const subcategoryId = ''; // المنتجات تُسند مباشرة إلى القسم
    const quantity = parseInt(document.getElementById('prodQuantity').value) || 0;
    if (!name || !price) { showToast('الاسم والسعر مطلوبان', true); return; }
    if (!categoryId) { showToast('اختر القسم', true); return; }
    const files = [document.getElementById('prodImageFile1'), document.getElementById('prodImageFile2'), document.getElementById('prodImageFile3')];
    const hasAnyFile = files.some(f => f.files.length > 0);
    if (!hasAnyFile) { showToast('اختر صورة رئيسية على الأقل', true); return; }
    isAdding = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الرفع...';
    showToast('⏳ جاري رفع الصور وضغطها (150-200KB)...', false);
    try {
      const urls = await Promise.all(files.filter(f => f.files.length > 0).map(f => uploadProductImage(f.files[0])));
      if (urls.length === 0) { showToast('فشل رفع الصور', true); return; }
      const newProduct = {
        id: Date.now().toString(),
        name, price: parseFloat(price) || 0,
        oldprice: document.getElementById('prodOld').value.trim() || '',
        desc: document.getElementById('prodDesc').value.trim() || '',
        images: urls, image: urls[0],
        categoryId, subcategoryId,
        code: document.getElementById('prodCode').value.trim() || generateProductCode(),
        sizes: [...tempSizes], colors: [...tempColors],
        bulkPricing: normalizeBulkTiers(tempBulkPricing),
        quantity: quantity, active: true, createdAt: Date.now()
      };
      products.push(newProduct);
      await db.ref(`products/${newProduct.id}`).set({
        name: newProduct.name, price: newProduct.price, oldprice: newProduct.oldprice,
        desc: newProduct.desc, image: newProduct.image, images: newProduct.images,
        categoryId: newProduct.categoryId, subcategoryId: newProduct.subcategoryId,
        code: newProduct.code, sizes: newProduct.sizes, colors: newProduct.colors,
        bulkPricing: newProduct.bulkPricing,
        quantity: newProduct.quantity, active: newProduct.active, createdAt: newProduct.createdAt
      });
      document.getElementById('prodName').value = '';
      document.getElementById('prodPrice').value = '';
      document.getElementById('prodOld').value = '';
      document.getElementById('prodDesc').value = '';
      document.getElementById('prodCode').value = '';
      document.getElementById('prodQuantity').value = '99';
      document.getElementById('prodCategory').value = '';
      if (document.getElementById('prodSubcategory')) document.getElementById('prodSubcategory').value = '';
      files.forEach(f => { f.value = ''; });
      document.getElementById('prodFileName1').innerHTML = '📷 لم يتم اختيار ملف';
      document.getElementById('prodFileName2').innerHTML = '📷 لم يتم اختيار ملف';
      document.getElementById('prodFileName3').innerHTML = '📷 لم يتم اختيار ملف';
      tempSizes = []; tempColors = []; tempBulkPricing = [];
      updateSizesDisplay(); updateColorsDisplay();
      renderBulkContainer('bulkPricingContainer', tempBulkPricing, 'removeBulkTier', null);
      renderProducts();
      showToast('✅ تم إضافة المنتج بنجاح', false);
    } catch (err) {
      console.error(err);
      showToast('❌ فشل الإضافة: ' + (err.message || 'خطأ'), true);
    } finally {
      isAdding = false; btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> إضافة منتج';
    }
  };
}

function updateSizesDisplay() { const c = document.getElementById('sizesContainer'); if(!c) return; c.innerHTML = tempSizes.map(s => `<span class="size-tag">${s} <button class="remove-tag" onclick="removeSize('${s}')">✖</button></span>`).join(''); }
function updateColorsDisplay() { const c = document.getElementById('colorsContainer'); if(!c) return; c.innerHTML = tempColors.map(s => `<span class="size-tag">${s} <button class="remove-tag" onclick="removeColor('${s}')">✖</button></span>`).join(''); }
window.addSize = () => { const i = document.getElementById('sizeInput'); const v = i.value.trim(); if (!v || tempSizes.includes(v)) return; tempSizes.push(v); updateSizesDisplay(); i.value = ''; };
window.removeSize = (s) => { tempSizes = tempSizes.filter(x => x !== s); updateSizesDisplay(); };
window.addColor = () => { const i = document.getElementById('colorInput'); const v = i.value.trim(); if (!v || tempColors.includes(v)) return; tempColors.push(v); updateColorsDisplay(); i.value = ''; };
window.removeColor = (c) => { tempColors = tempColors.filter(x => x !== c); updateColorsDisplay(); };

function populateEditForm(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  const catSelect = document.getElementById(`editCat_${id}`);
  if (catSelect) catSelect.innerHTML = '<option value="">اختر القسم</option>' + categories.map(c => `<option value="${c.id}" ${c.id===p.categoryId?'selected':''}>${c.name}</option>`).join('');
  const subcatSelect = document.getElementById(`editSubcat_${id}`);
  if (subcatSelect) subcatSelect.innerHTML = '<option value="">بدون فئة فرعية</option>'; 
  if (!tempEditSizes[id]) tempEditSizes[id] = [...(p.sizes || [])];
  if (!tempEditColors[id]) tempEditColors[id] = [...(p.colors || [])];
  if (!tempEditBulk[id]) tempEditBulk[id] = normalizeBulkTiers(p.bulkPricing || []);
  const sizesDiv = document.getElementById(`editSizes_${id}`);
  if (sizesDiv) sizesDiv.innerHTML = `<div style="background:#fcfaf5;padding:12px;border-radius:16px;margin:12px 0"><label>المقاسات</label><div style="display:flex;flex-wrap:wrap;gap:5px;margin:8px 0">${tempEditSizes[id].map(s=>`<span class="size-tag">${s} <button class="remove-tag" onclick="removeEditSize('${id}','${s}')">✖</button></span>`).join('')}</div><div class="row-2"><input type="text" id="editSizeInput_${id}" placeholder="مقاس"><button class="btn btn-secondary" onclick="addEditSize('${id}')">+ إضافة</button></div></div>`;
  const colorsDiv = document.getElementById(`editColors_${id}`);
  if (colorsDiv) colorsDiv.innerHTML = `<div style="background:#fcfaf5;padding:12px;border-radius:16px;margin:12px 0"><label>الألوان</label><div style="display:flex;flex-wrap:wrap;gap:5px;margin:8px 0">${tempEditColors[id].map(c=>`<span class="size-tag">${c} <button class="remove-tag" onclick="removeEditColor('${id}','${c}')">✖</button></span>`).join('')}</div><div class="row-2"><input type="text" id="editColorInput_${id}" placeholder="لون"><button class="btn btn-secondary" onclick="addEditColor('${id}')">+ إضافة</button></div></div>`;
  renderBulkContainer(`editBulk_${id}`, tempEditBulk[id], 'removeEditBulkTier', id);
  for (let i = 1; i <= 3; i++) {
    const fileInput = document.getElementById(`editImgFile${i}_${id}`);
    const label = document.getElementById(`editImgName${i}_${id}`);
    if (fileInput && label) {
      fileInput.removeEventListener('change', handleEditFileChange);
      fileInput.addEventListener('change', handleEditFileChange);
      fileInput.dataset.productId = id;
      fileInput.dataset.index = i;
    }
  }
}

function handleEditFileChange(e) {
  const input = e.target;
  const productId = input.dataset.productId;
  const index = input.dataset.index;
  const label = document.getElementById(`editImgName${index}_${productId}`);
  if (input.files.length) label.innerHTML = `📷 ${input.files[0].name} (سيُضغط)`;
  else {
    const p = products.find(x => x.id === productId);
    const exists = p && p.images && p.images[index-1];
    label.innerHTML = exists ? `✅ موجودة <button class="image-delete-btn" onclick="removeProductImage('${productId}', ${index-1})" title="حذف الصورة">✖</button>` : '❌ غير موجودة';
  }
}

window.openEditProduct = (id) => {
  const p = products.find(x => x.id === id); if (!p) return;
  tempEditSizes[id] = [...(p.sizes || [])];
  tempEditColors[id] = [...(p.colors || [])];
  tempEditBulk[id] = normalizeBulkTiers(p.bulkPricing || []);
  populateEditForm(id);
  document.getElementById(`editProduct_${id}`).classList.add('open');
};
window.addEditSize = (id) => { const input = document.getElementById(`editSizeInput_${id}`); if (!input) return; const val = input.value.trim(); if (!val || tempEditSizes[id].includes(val)) return; tempEditSizes[id].push(val); populateEditForm(id); input.value = ''; };
window.removeEditSize = (id, s) => { tempEditSizes[id] = tempEditSizes[id].filter(x => x !== s); populateEditForm(id); };
window.addEditColor = (id) => { const input = document.getElementById(`editColorInput_${id}`); if (!input) return; const val = input.value.trim(); if (!val || tempEditColors[id].includes(val)) return; tempEditColors[id].push(val); populateEditForm(id); input.value = ''; };
window.removeEditColor = (id, c) => { tempEditColors[id] = tempEditColors[id].filter(x => x !== c); populateEditForm(id); };

window.toggleProduct = async (id) => { const p = products.find(x => x.id === id); if (p) { p.active = p.active !== false ? false : true; await saveAll(); } };
window.deleteProduct = async (id) => { if (!confirm('حذف المنتج؟')) return; products = products.filter(x => x.id !== id); await saveAll(); };

window.updateProductData = async function(id) {
  const btn = event?.target?.closest('.row-2')?.querySelector('.btn-primary');
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...'; }
  try {
    if (!p.images || p.images.length === 0) p.images = p.image ? [p.image] : [];
    p.name = document.getElementById(`editName_${id}`).value;
    p.price = parseFloat(document.getElementById(`editPrice_${id}`).value) || 0;
    p.oldprice = document.getElementById(`editOld_${id}`).value || '';
    p.desc = document.getElementById(`editDesc_${id}`).value || '';
    p.quantity = parseInt(document.getElementById(`editQuantity_${id}`).value) || 0;
    p.code = document.getElementById(`editCode_${id}`).value || p.code;
    p.categoryId = document.getElementById(`editCat_${id}`).value || p.categoryId;
    p.subcategoryId = ''; // إزالة الاعتماد على الفئات الفرعية
    p.sizes = [...tempEditSizes[id]];
    p.colors = [...tempEditColors[id]];
    p.bulkPricing = normalizeBulkTiers(tempEditBulk[id] || []);
    const fileInputs = [document.getElementById(`editImgFile1_${id}`), document.getElementById(`editImgFile2_${id}`), document.getElementById(`editImgFile3_${id}`)];
    const hasNewFiles = fileInputs.some(input => input && input.files.length > 0);
    if (hasNewFiles) {
      showToast('⏳ جاري رفع الصور الجديدة وضغطها...', false);
      const currentImages = p.images || [];
      const uploadPromises = [];
      const indices = [];
      for (let i = 0; i < fileInputs.length; i++) {
        if (fileInputs[i] && fileInputs[i].files.length) { uploadPromises.push(uploadProductImage(fileInputs[i].files[0])); indices.push(i); }
      }
      const newUrls = await Promise.all(uploadPromises);
      let newImages = [...currentImages];
      indices.forEach((idx, pos) => { newImages[idx] = newUrls[pos]; });
      newImages = newImages.filter(url => url && url.trim() !== '');
      p.images = newImages;
      p.image = newImages[0] || '';
    }
    await db.ref(`products/${id}`).update({
      name: p.name, price: p.price, oldprice: p.oldprice, desc: p.desc,
      image: p.image, images: p.images, categoryId: p.categoryId,
      subcategoryId: p.subcategoryId, code: p.code, sizes: p.sizes,
      colors: p.colors, bulkPricing: p.bulkPricing,
      quantity: p.quantity, active: p.active
    });
    document.getElementById(`editProduct_${id}`).classList.remove('open');
    showToast('✅ تم تحديث المنتج', false);
    renderProducts();
  } catch (err) { console.error(err); showToast('❌ فشل التحديث: ' + (err.message || 'خطأ'), true); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = 'حفظ البيانات'; } }
};

window.removeProductImage = async (productId, index) => {
  const p = products.find(x => x.id === productId); if (!p) return;
  if (!p.images || index >= p.images.length) { showToast('الصورة غير موجودة', true); return; }
  p.images.splice(index, 1);
  p.image = p.images.length > 0 ? p.images[0] : '';
  await db.ref(`products/${productId}`).update({ images: p.images, image: p.image });
  renderProducts(); showToast('✅ تم حذف الصورة');
};

// =============================================
// CATEGORIES / SUBCATEGORIES / COUPONS / ADS / SETTINGS
// (نفس المنطق الأصلي بدون تغييرات جوهرية)
// =============================================
function renderCategories() {
  const container = document.getElementById('categoriesList');
  if (!container) return;
  container.innerHTML = categories.map(c => `
    <div class="item-card">
      <div class="item-header">
        <div class="item-info">
          <img src="${c.image||'https://via.placeholder.com/50'}" class="item-img">
          <strong>${escapeHtml(c.name)}</strong>
          <span class="badge ${c.active!==false?'badge-active':'badge-inactive'}">${c.active!==false?'نشط':'مخفي'}</span>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-secondary" onclick="openEditCat('${c.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-primary" onclick="toggleCategory('${c.id}')"><i class="fas fa-eye${c.active!==false?'-slash':''}"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteCategory('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div id="editCat_${c.id}" class="edit-form">
        <div class="row-2"><input type="text" id="editCatName_${c.id}" value="${c.name}"><input type="number" id="editCatOrder_${c.id}" value="${(c.order||0)+1}"></div>
        <div style="margin:8px 0"><label>تغيير الصورة</label><div class="file-upload-btn" onclick="document.getElementById('editCatFile_${c.id}').click()">اختر صورة جديدة</div><input type="file" id="editCatFile_${c.id}" accept="image/*" style="display:none"><div id="editCatFileName_${c.id}" style="font-size:0.7rem">📁 الحالية: ${c.image?'موجودة':'لا توجد'}</div></div>
        <div class="row-2"><button class="btn btn-sm btn-primary" onclick="updateCategory('${c.id}')">حفظ</button><button class="btn btn-sm btn-secondary" onclick="document.getElementById('editCat_${c.id}').classList.remove('open')">إلغاء</button></div>
      </div>
    </div>`).join('');
}
window.openEditCat = (id) => { document.getElementById(`editCat_${id}`).classList.add('open'); };
window.toggleCategory = async (id) => { const c = categories.find(x => x.id === id); if (c) { c.active = c.active !== false ? false : true; await saveAll(); } };
window.deleteCategory = async (id) => { if (!confirm('حذف القسم وجميع فئاته؟')) return; categories = categories.filter(x => x.id !== id); products = products.filter(x => x.categoryId !== id); await saveAll(); };
window.updateCategory = async (id) => {
  const c = categories.find(x => x.id === id); if (!c) return;
  c.name = document.getElementById(`editCatName_${id}`).value;
  c.order = parseInt(document.getElementById(`editCatOrder_${id}`).value) - 1;
  const fileInput = document.getElementById(`editCatFile_${id}`);
  if (fileInput && fileInput.files.length) { try { c.image = await uploadCategoryImage(fileInput.files[0]); } catch (err) { showToast('فشل رفع الصورة', true); return; } }
  await saveAll();
  document.getElementById(`editCat_${id}`).classList.remove('open');
  showToast('تم التحديث');
};
const addCategoryBtn = document.getElementById('addCategoryBtn');
if(addCategoryBtn) {
  addCategoryBtn.onclick = async () => {
    const name = document.getElementById('newCatName').value.trim();
    const file = document.getElementById('newCatImageFile');
    if (!name || !file.files.length) return showToast('الاسم والصورة مطلوبان', true);
    const url = await uploadCategoryImage(file.files[0]);
    categories.push({ id: Date.now().toString(), name, image: url, active: true, order: parseInt(document.getElementById('newCatOrder').value) - 1 || 0, subcategories: {} });
    await saveAll();
    document.getElementById('newCatName').value = '';
    file.value = '';
    document.getElementById('newCatFileName').innerHTML = '📁 لم يتم اختيار ملف';
    showToast('تم إضافة القسم');
  };
}

function renderSubcategories() {
  const container = document.getElementById('subcategoriesList');
  if (!container) return;
  let all = [];
  categories.forEach(cat => {
    const subs = cat.subcategories || {};
    Object.keys(subs).forEach(sid => all.push({ id: sid, ...subs[sid], categoryId: cat.id, categoryName: cat.name }));
  });
  if (all.length === 0) { container.innerHTML = '<div class="empty-msg">لا توجد فئات</div>'; return; }
  container.innerHTML = all.map(sub => `
    <div class="item-card">
      <div class="item-header">
        <div class="item-info">
          ${sub.image?`<img src="${sub.image}" class="item-img">`:'<div style="width:50px;height:50px;background:#ffffff;border-radius:12px;display:flex;align-items:center;justify-content:center"><i class="fas fa-folder"></i></div>'}
          <strong>${escapeHtml(sub.name)}</strong>
          <span class="badge" style="background:#ffffff">${sub.categoryName}</span>
          <span class="badge ${sub.active!==false?'badge-active':'badge-inactive'}">${sub.active!==false?'نشط':'مخفي'}</span>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-secondary" onclick="openEditSubcat('${sub.categoryId}','${sub.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-primary" onclick="toggleSubcategory('${sub.categoryId}','${sub.id}')"><i class="fas fa-eye${sub.active!==false?'-slash':''}"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteSubcategory('${sub.categoryId}','${sub.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div id="editSubcat_${sub.categoryId}_${sub.id}" class="edit-form">
        <input type="text" id="editSubcatName_${sub.categoryId}_${sub.id}" value="${sub.name}">
        <div style="margin:8px 0"><label>تغيير الصورة</label><div class="file-upload-btn" onclick="document.getElementById('editSubcatFile_${sub.categoryId}_${sub.id}').click()">اختر صورة جديدة</div><input type="file" id="editSubcatFile_${sub.categoryId}_${sub.id}" accept="image/*" style="display:none"><div id="editSubcatFileName_${sub.categoryId}_${sub.id}" style="font-size:0.7rem">📁 الحالية: ${sub.image?'موجودة':'لا توجد'}</div></div>
        <div class="row-2"><button class="btn btn-sm btn-primary" onclick="updateSubcategory('${sub.categoryId}','${sub.id}')">حفظ</button><button class="btn btn-sm btn-secondary" onclick="document.getElementById('editSubcat_${sub.categoryId}_${sub.id}').classList.remove('open')">إلغاء</button></div>
      </div>
    </div>`).join('');
}
window.openEditSubcat = (catId, subId) => { document.getElementById(`editSubcat_${catId}_${subId}`).classList.add('open'); };
window.toggleSubcategory = async (catId, subId) => { const cat = categories.find(c => c.id === catId); if (cat && cat.subcategories[subId]) { cat.subcategories[subId].active = cat.subcategories[subId].active !== false ? false : true; await saveAll(); } };
window.deleteSubcategory = async (catId, subId) => { if (!confirm('حذف الفئة؟')) return; const cat = categories.find(c => c.id === catId); if (cat) { delete cat.subcategories[subId]; products = products.filter(p => p.subcategoryId !== subId); await saveAll(); } };
window.updateSubcategory = async (catId, subId) => {
  const cat = categories.find(c => c.id === catId); if (!cat || !cat.subcategories[subId]) return;
  cat.subcategories[subId].name = document.getElementById(`editSubcatName_${catId}_${subId}`).value;
  const fileInput = document.getElementById(`editSubcatFile_${catId}_${subId}`);
  if (fileInput && fileInput.files.length) { try { cat.subcategories[subId].image = await uploadImage(fileInput.files[0]); } catch (err) { showToast('فشل رفع الصورة', true); return; } }
  await saveAll();
  document.getElementById(`editSubcat_${catId}_${subId}`).classList.remove('open');
  showToast('تم التحديث');
};
const addSubcategoryBtn = document.getElementById('addSubcategoryBtn');
if(addSubcategoryBtn) {
  addSubcategoryBtn.onclick = async () => {
    const name = document.getElementById('newSubcatName').value.trim();
    const catId = document.getElementById('newSubcatCategory').value;
    if (!name || !catId) return showToast('الاسم والقسم مطلوبان', true);
    const file = document.getElementById('newSubcatImageFile');
    let image = '';
    if (file.files.length) image = await uploadImage(file.files[0]);
    const cat = categories.find(c => c.id === catId);
    if (!cat.subcategories) cat.subcategories = {};
    cat.subcategories[Date.now().toString()] = { name, image, active: true };
    await saveAll();
    document.getElementById('newSubcatName').value = '';
    document.getElementById('newSubcatCategory').value = '';
    file.value = '';
    document.getElementById('newSubcatFileName').innerHTML = '📁 لم يتم اختيار ملف';
    showToast('تم إضافة الفئة');
  };
}

function renderCoupons() {
  const container = document.getElementById('couponsList');
  if (!container) return;
  if (coupons.length === 0) { container.innerHTML = '<div class="empty-msg">لا توجد كوبونات</div>'; return; }
  container.innerHTML = coupons.map(c => `
    <div class="item-card">
      <div class="item-header">
        <div class="item-info">
          <span class="badge" style="background:var(--primary);color:white;font-weight:bold">${c.code}</span>
          <span>${c.type==='percentage'?c.value+'%':c.value+'$'}</span>
          <span class="badge ${c.active!==false?'badge-active':'badge-inactive'}">${c.active!==false?'نشط':'مخفي'}</span>
          <span class="badge" style="background:#ffffff">استخدم: ${c.usedCount||0}/${c.usageLimit||'∞'}</span>
        </div>
        <div class="item-actions">
          <button class="btn btn-sm btn-primary" onclick="toggleCoupon('${c.id}')"><i class="fas fa-eye${c.active!==false?'-slash':''}"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteCoupon('${c.id}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}
window.toggleCoupon = async (id) => { const c = coupons.find(x => x.id === id); if (c) { c.active = c.active !== false ? false : true; await saveAll(); } };
window.deleteCoupon = async (id) => { coupons = coupons.filter(x => x.id !== id); await saveAll(); };
const addCouponBtn = document.getElementById('addCouponBtn');
if(addCouponBtn){
  addCouponBtn.onclick = async () => {
    const code = document.getElementById('couponCode').value.trim().toUpperCase();
    const value = parseFloat(document.getElementById('couponValue').value);
    if (!code || isNaN(value)) return showToast('الكود والقيمة مطلوبان', true);
    const usageLimit = parseInt(document.getElementById('couponUsageLimit').value) || 1;
    coupons.push({
      id: Date.now().toString(), code,
      type: document.getElementById('couponType').value, value,
      minAmount: parseFloat(document.getElementById('couponMinAmount').value) || null,
      expiryDate: document.getElementById('couponExpiry').value ? new Date(document.getElementById('couponExpiry').value).getTime() : null,
      usageLimit, usedCount: 0, active: true
    });
    await saveAll();
    document.getElementById('couponCode').value = '';
    document.getElementById('couponValue').value = '';
    document.getElementById('couponMinAmount').value = '';
    document.getElementById('couponExpiry').value = '';
    document.getElementById('couponUsageLimit').value = '1';
    showToast('تم إضافة الكوبون');
  };
}

function renderAds() {
  const container = document.getElementById('adsList');
  if (!container) return;
  const isSuper = (currentUserRole === 'super');
  if (ads.length === 0) { container.innerHTML = `<div class="empty-msg">لا توجد إعلانات${isSuper ? '' : ' (للقراءة فقط)'}</div>`; return; }
  container.innerHTML = ads.map(a => `
    <div class="item-card">
      <div class="item-header">
        <div class="item-info">
          <img src="${a.image}" class="item-img">
          <span>${a.text||''}</span>
          <span class="badge ${a.active!==false?'badge-active':'badge-inactive'}">${a.active!==false?'نشط':'مخفي'}</span>
        </div>
        <div class="item-actions">
          ${isSuper ? `
          <button class="btn btn-sm btn-secondary" onclick="openEditAd('${a.id}')"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-primary" onclick="toggleAd('${a.id}')"><i class="fas fa-eye${a.active!==false?'-slash':''}"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteAd('${a.id}')"><i class="fas fa-trash"></i></button>
          ` : `<span style="font-size:0.7rem;color:#aea89c">للقراءة فقط</span>`}
        </div>
      </div>
      ${isSuper ? `
      <div id="editAd_${a.id}" class="edit-form">
        <input type="text" id="editAdText_${a.id}" value="${a.text||''}" placeholder="نص الإعلان">
        <div style="margin:8px 0"><label>تغيير الصورة</label><div class="file-upload-btn" onclick="document.getElementById('editAdFile_${a.id}').click()">اختر صورة جديدة</div><input type="file" id="editAdFile_${a.id}" accept="image/*" style="display:none"><div id="editAdFileName_${a.id}" style="font-size:0.7rem">📁 الحالية: ${a.image?'موجودة':'لا توجد'}</div></div>
        <div class="row-2"><button class="btn btn-sm btn-primary" onclick="updateAd('${a.id}')">حفظ</button><button class="btn btn-sm btn-secondary" onclick="document.getElementById('editAd_${a.id}').classList.remove('open')">إلغاء</button></div>
      </div>` : ''}
    </div>`).join('');
  const addForm = document.querySelector('#tabAds .form-card');
  if (addForm) addForm.style.display = isSuper ? 'block' : 'none';
}
window.openEditAd = (id) => { if (currentUserRole !== 'super') return showToast('غير مصرح', true); document.getElementById(`editAd_${id}`).classList.add('open'); };
window.toggleAd = async (id) => { if (currentUserRole !== 'super') return showToast('غير مصرح', true); const a = ads.find(x => x.id === id); if (a) { a.active = a.active !== false ? false : true; await saveAll(); } };
window.deleteAd = async (id) => { if (currentUserRole !== 'super') return showToast('غير مصرح', true); if (!confirm('حذف الإعلان؟')) return; ads = ads.filter(x => x.id !== id); await saveAll(); };
window.updateAd = async (id) => {
  if (currentUserRole !== 'super') return showToast('غير مصرح', true);
  const a = ads.find(x => x.id === id); if (!a) return;
  a.text = document.getElementById(`editAdText_${id}`).value.trim();
  const fileInput = document.getElementById(`editAdFile_${id}`);
  if (fileInput && fileInput.files.length) { try { a.image = await uploadImage(fileInput.files[0]); } catch (err) { showToast('فشل رفع الصورة', true); return; } }
  await saveAll();
  document.getElementById(`editAd_${id}`).classList.remove('open');
  showToast('تم تحديث الإعلان');
};
const addAdBtn = document.getElementById('addAdBtn');
if(addAdBtn){
  addAdBtn.onclick = async () => {
    if (currentUserRole !== 'super') return showToast('غير مصرح', true);
    const file = document.getElementById('newAdImageFile');
    if (!file.files.length) return showToast('اختر صورة', true);
    const url = await uploadImage(file.files[0]);
    ads.push({ id: Date.now().toString(), image: url, text: document.getElementById('newAdText').value || '', active: true });
    await saveAll();
    file.value = '';
    document.getElementById('newAdFileName').innerHTML = '📁 لم يتم اختيار ملف';
    document.getElementById('newAdText').value = '';
    showToast('تم إضافة الإعلان');
  };
}

async function loadSettings() {
  try {
    const barcode = await db.ref('settings/paymentBarcode').once('value');
    if (barcode.exists()) {
      const data = barcode.val();
      const tEl = document.getElementById('paymentBarcodeTitle'); if(tEl) tEl.value = data.title || '';
      const dEl = document.getElementById('paymentBarcodeDesc'); if(dEl) dEl.value = data.description || '';
      const eEl = document.getElementById('paymentBarcodeEnabled'); if(eEl) eEl.value = data.enabled ? 'true' : 'false';
      if (data.image) {
        const fEl = document.getElementById('paymentBarcodeFileName'); if(fEl) fEl.innerHTML = `✅ الصورة موجودة <a href="${data.image}" target="_blank">عرض</a>`;
      }
    }
  } catch (e) { console.error(e); }
}
const savePaymentBarcodeBtn = document.getElementById('savePaymentBarcodeBtn');
if(savePaymentBarcodeBtn){
  savePaymentBarcodeBtn.onclick = async function() {
    try {
      const fileInput = document.getElementById('paymentBarcodeFile');
      let imageUrl = null;
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        if (!file.type.startsWith('image/')) { showToast('اختر ملف صورة', true); return; }
        if (file.size > 8 * 1024 * 1024) { showToast('حجم كبير (الحد الأقصى 8 ميجابايت)', true); return; }
        imageUrl = await uploadImage(file);
      } else {
        const currentSnap = await db.ref('settings/paymentBarcode').once('value');
        imageUrl = (currentSnap.val() || {}).image || null;
      }
      await db.ref('settings/paymentBarcode').set({
        title: document.getElementById('paymentBarcodeTitle').value,
        description: document.getElementById('paymentBarcodeDesc').value,
        enabled: document.getElementById('paymentBarcodeEnabled').value === 'true',
        image: imageUrl
      });
      if (imageUrl) document.getElementById('paymentBarcodeFileName').innerHTML = `✅ الصورة موجودة <a href="${imageUrl}" target="_blank">عرض</a>`;
      else document.getElementById('paymentBarcodeFileName').innerHTML = '📁 لم يتم اختيار ملف';
      fileInput.value = '';
      showToast('✅ تم حفظ إعدادات الباركود', false);
    } catch (err) { console.error(err); showToast('فشل: ' + err.message, true); }
  };
}
const paymentBarcodeFile = document.getElementById('paymentBarcodeFile');
if(paymentBarcodeFile){
  paymentBarcodeFile.addEventListener('change', function(e) {
    if (e.target.files.length > 0) document.getElementById('paymentBarcodeFileName').innerHTML = `📁 ${e.target.files[0].name} (سيتم الرفع عند الحفظ)`;
    else document.getElementById('paymentBarcodeFileName').innerHTML = '📁 لم يتم اختيار ملف';
  });
}

function updateCategorySelects() {
  ['prodCategory', 'newSubcatCategory'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">اختر القسم</option>' + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  });
  const prodCatEl = document.getElementById('prodCategory');
  if(prodCatEl) {
    prodCatEl.addEventListener('change', function() {
      const catId = this.value;
      const sub = document.getElementById('prodSubcategory');
      const cat = categories.find(c => c.id === catId);
      let opts = '<option value="">اختر الفئة</option>';
      if (cat && cat.subcategories) opts += Object.keys(cat.subcategories).map(sid => `<option value="${sid}">${cat.subcategories[sid].name}</option>`).join('');
      if (sub) sub.innerHTML = opts;
    });
  }
}
function updateNewCatOrder() {
  const el = document.getElementById('newCatOrder'); if(!el) return;
  const max = categories.length > 0 ? Math.max(...categories.map(c => c.order || 0)) : -1;
  el.value = max + 2;
}
window.clearSearch = function(inputId, btnId) {
  const inp = document.getElementById(inputId);
  if (inp) { inp.value = ''; inp.dispatchEvent(new Event('input')); }
  const btn = document.getElementById(btnId); if (btn) btn.style.display = 'none';
};
const searchProducts = document.getElementById('searchProducts');
if(searchProducts) searchProducts.addEventListener('input', function() { lastSearchText = this.value.trim(); adminDisplayedCount = 20; renderProducts(); document.getElementById('clearSearchProducts').style.display = lastSearchText ? 'flex' : 'none'; });
const searchOrders = document.getElementById('searchOrders');
if(searchOrders) searchOrders.addEventListener('input', function() { lastOrderSearchText = this.value.trim(); renderOrders(); document.getElementById('clearSearchOrders').style.display = lastOrderSearchText ? 'flex' : 'none'; });

// معاينة قص صورة القسم
document.addEventListener('change', async (event) => {
  const input = event.target;
  if (!input || input.type !== 'file' || !/^newCatImageFile$|^editCatFile_/.test(input.id)) return;
  const file = input.files && input.files[0];
  const nameId = input.id === 'newCatImageFile' ? 'newCatFileName' : input.id.replace('editCatFile_', 'editCatFileName_');
  const nameLabel = document.getElementById(nameId);
  if (!file) return;
  if (!file.type.startsWith('image/')) { if (nameLabel) nameLabel.textContent = 'الرجاء اختيار صورة'; input.value = ''; return; }
  if (file.size > 8 * 1024 * 1024) { if (nameLabel) nameLabel.textContent = 'حجم الصورة كبير (الحد 8MB)'; input.value = ''; return; }
  if (nameLabel) nameLabel.textContent = 'جارٍ تجهيز الصورة (150-200KB)…';
  try {
    const croppedBlob = await compressCategoryImage(file);
    const previewId = `categoryCropPreview_${input.id}`;
    let preview = document.getElementById(previewId);
    if (!preview) {
      preview = document.createElement('div'); preview.id = previewId;
      preview.style.cssText = 'margin:10px 0 14px;max-width:520px;border:1px solid #f2e5c9;border-radius:14px;overflow:hidden;background:#fcfaf5;';
      const anchor = nameLabel || input; anchor.insertAdjacentElement('afterend', preview);
    }
    if (preview.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
    const objectUrl = URL.createObjectURL(croppedBlob);
    preview.dataset.objectUrl = objectUrl;
    preview.innerHTML = '<div style="padding:7px 10px;font-size:12px;color:#806220;background:#fcf8f1">معاينة الصورة بعد قصّها</div><img alt="معاينة" style="display:block;width:100%;aspect-ratio:5/2;object-fit:cover" />';
    preview.querySelector('img').src = objectUrl;
    if (nameLabel) nameLabel.textContent = `تم تجهيز: ${file.name} (~${Math.round(croppedBlob.size/1024)}KB)`;
  } catch (error) { if (nameLabel) nameLabel.textContent = 'تعذر تجهيز الصورة، جرّب أخرى'; }
});

console.log('✅ admin.js loaded — image compression 150-200KB + bulk pricing');