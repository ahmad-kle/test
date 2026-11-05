/* متجر الكردي للزينة — حركات الواجهة فقط (لا تلمس منطق المتجر) */
(function () {
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1) شريط تقدم التمرير */
  function initProgress() {
    var bar = document.createElement('div'); bar.id = 'kdProg'; bar.setAttribute('aria-hidden', 'true');
    bar.innerHTML = '<i></i>'; document.body.appendChild(bar);
    var i = bar.firstChild, tick = false;
    function upd() {
      var m = document.documentElement.scrollHeight - innerHeight;
      i.style.width = (m > 0 ? Math.min(scrollY / m, 1) * 100 : 0) + '%'; tick = false;
    }
    addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(upd); } }, { passive: true });
    upd();
  }

  /* 2) عجلة الدراجة: تدور أسرع مع سرعة التمرير، وتنطلق عند الضغط عليها */
  function initWheel() {
    var w = document.querySelector('.kurdi-wheel');
    if (!w || reduce) return;
    var r = w.querySelector('.kw-spin'), hero = document.querySelector('.hero-section') || w;
    var IDLE = 0.35, ang = 0, spd = IDLE, tgt = IDLE, ly = scrollY, lt = performance.now(), vis = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; }).observe(hero);
    addEventListener('scroll', function () {
      var t = performance.now(), dy = Math.abs(scrollY - ly);
      tgt = Math.max(tgt, IDLE + Math.min(dy / Math.max(t - lt, 1) * 9, 30)); ly = scrollY; lt = t;
    }, { passive: true });
    w.addEventListener('click', function () { tgt = 34; if (navigator.vibrate) navigator.vibrate([20, 30, 20]); });
    (function loop() {
      tgt += (IDLE - tgt) * 0.03; spd += (tgt - spd) * 0.12;
      if (vis) {
        ang = (ang + spd) % 360; r.style.transform = 'rotate(' + ang + 'deg)';
        w.style.setProperty('--rev', Math.min(spd / 30, 1).toFixed(2));
      }
      requestAnimationFrame(loop);
    })();
    setTimeout(function () { tgt = 28; }, 3000);   // "تشغيل المحرك" بعد اختفاء الشاشة الافتتاحية
  }

  /* 3) نبضة عدّاد السلة + دائرة ذهبية تطير من زر الإضافة إلى السلة */
  var lastAdd = null;
  function initCart() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.add-to-cart, .btn-add-to-cart-options');
      if (b) lastAdd = { r: b.getBoundingClientRect(), t: Date.now() };
    }, true);
    var c = document.querySelector('.cart-count');
    if (!c || !window.MutationObserver) return;
    var prev = parseInt(c.textContent, 10) || 0;
    new MutationObserver(function () {
      var n = parseInt(c.textContent, 10) || 0;
      c.classList.remove('tq-pop'); void c.offsetWidth; c.classList.add('tq-pop');
      if (n > prev && lastAdd && Date.now() - lastAdd.t < 2500 && !reduce && c.animate) fly(lastAdd.r);
      prev = n;
    }).observe(c, { childList: true, characterData: true, subtree: true });
  }
  function fly(s) {
    var tgt = innerWidth > 820 ? document.getElementById('cartBtn') : document.getElementById('bottomCartBtn');
    if (!tgt) return;
    var d = tgt.getBoundingClientRect(), f = document.createElement('i'); f.className = 'kd-fly'; document.body.appendChild(f);
    var x0 = s.left + s.width / 2, y0 = s.top + s.height / 2, x1 = d.left + d.width / 2, y1 = d.top + d.height / 2;
    f.animate([
      { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1)' },
      { transform: 'translate(' + (x0 + x1) / 2 + 'px,' + (Math.min(y0, y1) - 60) + 'px) scale(1.3)', offset: 0.5 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.3)', opacity: 0.4 }
    ], { duration: 650, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = function () { f.remove(); };
  }

  function init() { initProgress(); initWheel(); initCart(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
