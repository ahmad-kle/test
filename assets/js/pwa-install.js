/* متجر الكردي للزينة — تثبيت التطبيق (PWA) وتحسين تجربة وضع التطبيق
   لا يلمس منطق المتجر. أزرار التثبيت: #installAppBtnHeader و #installAppBtn */
(() => {
  'use strict';
  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const isFirefox = /firefox|fxios/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios|edgios|opr\/|opios|android/i.test(ua);
  const isSamsung = /samsungbrowser/i.test(ua);
  const isDesktop = !isIOS && !isAndroid;
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|Line\/|Telegram|; wv\)/i.test(ua);
  const secure = window.isSecureContext;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches || window.navigator.standalone === true;
  const $ = s => document.querySelector(s);

  if (standalone()) document.documentElement.classList.add('kd-standalone');

  /* ---------- Service Worker + تحديث + اتصال ---------- */
  let wantReload = false;
  function toast(html, btnText, onBtn, sticky) {
    let t = document.getElementById('kdBar');
    if (!t) { t = document.createElement('div'); t.id = 'kdBar'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = '<span></span>';
    t.firstChild.textContent = html;
    if (btnText) { const b = document.createElement('button'); b.type = 'button'; b.textContent = btnText; b.onclick = onBtn; t.appendChild(b); }
    t.classList.add('show'); clearTimeout(t._h);
    if (!sticky) t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }
  if ('serviceWorker' in navigator && (/^https:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname))) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js', { scope: './' }).then(reg => {
        const ask = w => toast('يتوفر تحديث جديد للمتجر', 'تحديث الآن', () => { wantReload = true; w.postMessage('SKIP_WAITING'); }, true);
        if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
        });
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      }).catch(() => {});
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (wantReload) location.reload(); });
  }
  window.addEventListener('offline', () => toast('أنت غير متصل بالإنترنت', null, null, true));
  window.addEventListener('online', () => toast('عاد الاتصال بالإنترنت'));
  if (!navigator.onLine) window.addEventListener('load', () => toast('أنت غير متصل بالإنترنت', null, null, true));

  /* ---------- زر التثبيت ---------- */
  const buttons = [document.getElementById('installAppBtnHeader'), document.getElementById('installAppBtn')].filter(Boolean);
  if (!buttons.length) return;
  const setVisible = v => buttons.forEach(b => { b.hidden = !v; b.classList.toggle('installed', !v); });
  if (standalone()) { setVisible(false); return; }
  setVisible(true);

  let deferred = window.__kdBip || null;               // التقط مبكراً من الـ head
  window.addEventListener('kd-bip', () => { deferred = window.__kdBip; });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; window.__kdBip = e; });
  window.addEventListener('appinstalled', () => {
    deferred = null; window.__kdBip = null; setVisible(false);
    toast('تم تثبيت التطبيق بنجاح 🎉');
  });
  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', e => { if (e.matches) setVisible(false); });

  /* ---------- نافذة الإرشاد حسب المتصفح ---------- */
  function guide() {
    const steps = [];
    let title = 'تثبيت التطبيق', note = '';
    if (inApp) {
      title = 'افتح المتجر في المتصفح';
      steps.push('أنت تتصفح من داخل تطبيق آخر (فيسبوك / إنستغرام / واتساب...) وهو لا يدعم التثبيت.',
        'اضغط ⋮ أو زر المشاركة ثم اختر «فتح في المتصفح».',
        isIOS ? 'يُفضَّل فتحه في Safari.' : 'يُفضَّل فتحه في Chrome.');
    } else if (!secure) {
      title = 'التثبيت يحتاج اتصالاً آمناً';
      steps.push('افتح المتجر عبر رابط يبدأ بـ https:// (أو localhost أثناء التجربة).');
    } else if (isIOS) {
      steps.push(isSafari ? 'اضغط زر المشاركة ⬆︎ أسفل الشاشة.' : 'اضغط زر المشاركة ⬆︎ في المتصفح.',
        'مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية».', 'اضغط «إضافة».');
      note = isSafari ? '' : 'إذا لم يظهر الخيار، افتح المتجر في Safari.';
    } else if (isAndroid && isFirefox) {
      steps.push('افتح قائمة المتصفح ⋮.', 'اختر «تثبيت» أو «إضافة إلى الشاشة الرئيسية».');
    } else if (isAndroid) {
      steps.push('افتح قائمة المتصفح ⋮ في الأعلى.', isSamsung ? 'اختر «إضافة الصفحة إلى» ثم «الشاشة الرئيسية».' : 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'اضغط «تثبيت».');
      note = 'إذا كان التطبيق مثبّتاً سابقاً فافتحه من الشاشة الرئيسية. وإذا لم يظهر الخيار فجرّب Chrome.';
    } else if (isDesktop && isSafari) {
      steps.push('من قائمة «ملف» اختر «إضافة إلى Dock».');
    } else if (isDesktop && isFirefox) {
      title = 'المتصفح لا يدعم التثبيت';
      steps.push('Firefox على الكمبيوتر لا يدعم تثبيت التطبيقات.', 'افتح المتجر في Chrome أو Edge للتثبيت.');
    } else {
      steps.push('اضغط أيقونة التثبيت ⊕ في يمين شريط العنوان.', 'أو افتح القائمة ⋮ واختر «تثبيت متجر الكردي للزينة».');
      note = 'إذا كان التطبيق مثبّتاً سابقاً فافتحه من قائمة التطبيقات لديك.';
    }
    const ov = document.createElement('div'); ov.className = 'kd-modal'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const box = document.createElement('div'); box.className = 'kd-modal-box';
    const h = document.createElement('h3'); h.textContent = title; box.appendChild(h);
    const ol = document.createElement('ol'); steps.forEach(s => { const li = document.createElement('li'); li.textContent = s; ol.appendChild(li); }); box.appendChild(ol);
    if (note) { const p = document.createElement('p'); p.textContent = note; box.appendChild(p); }
    const row = document.createElement('div'); row.className = 'kd-modal-row';
    if (inApp && navigator.clipboard) {
      const c = document.createElement('button'); c.type = 'button'; c.textContent = 'نسخ الرابط';
      c.onclick = () => navigator.clipboard.writeText(location.href.split('#')[0]).then(() => { c.textContent = 'تم النسخ ✓'; }).catch(() => {}); row.appendChild(c);
    }
    const x = document.createElement('button'); x.type = 'button'; x.className = 'ghost'; x.textContent = 'حسناً'; row.appendChild(x);
    box.appendChild(row); ov.appendChild(box); document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    x.onclick = close; ov.addEventListener('click', e => { if (e.target === ov) close(); }); document.addEventListener('keydown', esc); x.focus();
  }

  buttons.forEach(b => b.addEventListener('click', async () => {
    if (deferred) {
      const ev = deferred; deferred = null; window.__kdBip = null;
      try {
        ev.prompt();
        const choice = await ev.userChoice;
        if (choice && choice.outcome === 'accepted') setVisible(false);
      } catch (e) { guide(); }
      return;
    }
    guide();
  }));
})();
