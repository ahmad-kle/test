/* ============================================================
   متجر الكردي للزينة — هوية موحدة (نهاري أزرق) + التأثيرات
   ============================================================ */
(function () {
  document.documentElement.setAttribute('data-theme', 'light');
  var meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.content = '#fcfaf5';
})();

/* ============================================================
   التأثيرات: تقدم التمرير، زر الأعلى، الظهور التدريجي، Ripple
   ============================================================ */
(function () {
  function initTaqwaEffects() {
    if (document.body.dataset.tqEffectsReady === '1') return;
    document.body.dataset.tqEffectsReady = '1';

    var progress = document.createElement('div');
    progress.className = 'tq-progress';
    progress.setAttribute('aria-hidden', 'true');
    document.body.appendChild(progress);

    var top = document.createElement('button');
    top.className = 'tq-back-top';
    top.type = 'button';
    top.title = 'العودة إلى الأعلى';
    top.setAttribute('aria-label', 'العودة إلى أعلى الصفحة');
    top.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
    document.body.appendChild(top);
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });

    var header = document.querySelector('.main-header');
    var update = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
      top.classList.toggle('visible', window.scrollY > 420);
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();

    var candidates = 'main section, .hero-section, .taqwa-category-card, .feature-item, .products-grid > *, .track-card, .about-hero, .category-hero, .stat-card, .chart-card, .table-container, .sidebar-item, .item-card';
    var nodes = [].slice.call(document.querySelectorAll(candidates))
      .filter(function (el) { return !el.classList.contains('taqwa-empty-products'); });
    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('tq-visible');
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: .08, rootMargin: '0px 0px -25px 0px' });
      nodes.forEach(function (el, i) {
        el.classList.add('tq-reveal');
        el.style.transitionDelay = (Math.min(i % 5, 4) * 55) + 'ms';
        observer.observe(el);
      });
    } else {
      nodes.forEach(function (el) { el.classList.add('tq-visible'); });
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('button,.btn,.action-btn,.search-btn,.checkout-btn,.track-btn,.success-track-btn,.load-more-btn');
      if (!btn || btn.disabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      var rect = btn.getBoundingClientRect(), size = Math.max(rect.width, rect.height);
      var ripple = document.createElement('span');
      ripple.className = 'tq-ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX ? e.clientX - rect.left - size / 2 : rect.width / 2 - size / 2) + 'px';
      ripple.style.top = (e.clientY ? e.clientY - rect.top - size / 2 : rect.height / 2 - size / 2) + 'px';
      if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 600);
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTaqwaEffects, { once: true });
  } else initTaqwaEffects();
})();
