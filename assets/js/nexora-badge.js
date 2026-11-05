(() => {
  if (window.__nexoraBadgeLoaded) return;
  window.__nexoraBadgeLoaded = true;

  const style = document.createElement('style');
  style.textContent = `
    .nx-credit-widget {
      position: fixed; left: 14px; bottom: 18px; z-index: 9998;
      direction: rtl; font-family: inherit; line-height: 1.4;
    }
    .nx-credit-trigger {
      width: 36px; height: 36px; border: 1px solid rgba(159,121,40,.24);
      border-radius: 50%; background: rgba(255,255,255,.96); color: #9f7928;
      box-shadow: 0 2px 10px rgba(89,74,42,.12); display:flex; align-items:center;
      justify-content:center; cursor:pointer; padding:0; transition:transform .2s ease,box-shadow .2s ease;
      -webkit-tap-highlight-color:transparent;
    }
    .nx-credit-trigger:hover { transform:translateY(-2px); box-shadow:0 4px 14px rgba(89,74,42,.18); }
    .nx-credit-trigger span { font:800 17px Arial,sans-serif; letter-spacing:-1.5px; }
    .nx-credit-card {
      position:absolute; left:0; bottom:45px; width:218px; padding:14px;
      border:1px solid rgba(159,121,40,.16); border-radius:14px; background:rgba(255,255,255,.99);
      box-shadow:0 8px 28px rgba(73,61,34,.17); color:#41361e;
      opacity:0; visibility:hidden; transform:translateY(7px) scale(.98);
      transform-origin:bottom left; transition:opacity .18s ease,transform .18s ease,visibility .18s;
    }
    .nx-credit-widget.nx-open .nx-credit-card { opacity:1;visibility:visible;transform:translateY(0) scale(1); }
    .nx-credit-head { display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px; }
    .nx-credit-brand { font:800 16px Arial,sans-serif;letter-spacing:.5px;color:#9f7928; }
    .nx-credit-close { border:0;background:transparent;color:#948462;font-size:20px;cursor:pointer;padding:0 3px;line-height:1; }
    .nx-credit-caption { font-size:11px;color:#80745b;margin-bottom:10px; }
    .nx-credit-title { font-size:12px;font-weight:700;margin-bottom:10px; }
    .nx-credit-links { display:grid;gap:6px; }
    .nx-credit-links a {
      display:flex;align-items:center;gap:8px;min-height:32px;padding:5px 8px;
      border-radius:8px;background:#fcfaf4;color:#7e6020;text-decoration:none;font-size:12px;font-weight:600;
    }
    .nx-credit-links a:hover { background:#f9f4e9; }
    .nx-credit-links svg { width:15px;height:15px;flex:0 0 15px; }
    .footer-designer-credit.nexora-footer-credit {
      display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px 14px;
      padding:15px 12px;margin:0 auto;text-align:center;color:var(--text-medium,#55482b);
      font-size:.82rem;border-top:1px solid var(--border,#f2e5c9);background:var(--bg-white,#fff);
    }
    .nexora-footer-credit .nexora-credit-link { color:#9f7928;text-decoration:none;font-weight:800; }
    .nexora-footer-credit .nexora-credit-link:hover { color:#cd9e37;text-decoration:underline; }
    .nexora-footer-credit .nexora-copy { color:var(--text-medium,#55482b); }
    @media(max-width:768px) {
      .nx-credit-widget { left:10px;bottom:18px; }
      .nx-credit-trigger { width:32px;height:32px; }
      .nx-credit-trigger span { font-size:15px; }
      .nx-credit-card { bottom:40px;width:205px; }
      body:has(.bottom-nav) .nx-credit-widget { bottom:82px; }
    }
    @media(prefers-reduced-motion:reduce) { .nx-credit-trigger,.nx-credit-card { transition:none; } }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'nx-credit-widget';
  root.innerHTML = `
    <div class="nx-credit-card" role="dialog" aria-label="معلومات NEXORA">
      <div class="nx-credit-head">
        <span class="nx-credit-brand">NEXORA</span>
        <button class="nx-credit-close" type="button" aria-label="إغلاق">×</button>
      </div>
      <div class="nx-credit-caption">حلول رقمية • مواقع ومتاجر إلكترونية</div>
      <div class="nx-credit-title">تم تصميم وتطوير هذا المتجر بواسطة NEXORA</div>
      <div class="nx-credit-links">
        <a href="https://nexor-a.me/" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0-18"/></svg>
          موقع NEXORA
        </a>
        <a href="https://www.instagram.com/nexora.d09?psln=MnA1eXZib2V6c3J6" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/></svg>
          إنستغرام
        </a>
        <a href="https://wa.me/963938180405" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 3.9A11.8 11.8 0 0 0 1.5 18.1L0 24l6-1.6A12 12 0 0 0 24 12a11.9 11.9 0 0 0-4-8.1ZM12 21a9 9 0 0 1-4.6-1.3l-.3-.2-3.5.9.9-3.4-.2-.4A9 9 0 1 1 12 21Zm5-6.7c-.3-.2-1.7-.9-2-.9s-.5-.2-.7.2-.8.9-1 1.1-.4.2-.7.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.5.2-.7l.5-.6c.2-.2.2-.4.3-.6s0-.4 0-.6-.7-1.7-1-2.3c-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4s-1.2 1.2-1.2 2.8 1.2 3.2 1.4 3.4a11.8 11.8 0 0 0 4.6 4c.6.3 1.1.5 1.5.6.6.2 1.2.2 1.7.1.5-.1 1.7-.7 1.9-1.4s.2-1.3.2-1.4-.2-.2-.5-.4Z"/></svg>
          واتساب
        </a>
      </div>
    </div>
    <button class="nx-credit-trigger" type="button" aria-label="معلومات عن NEXORA" aria-expanded="false" title="NEXORA"><span>N</span></button>
  `;
  document.body.appendChild(root);

  const trigger = root.querySelector('.nx-credit-trigger');
  const close = root.querySelector('.nx-credit-close');
  const setOpen = open => {
    root.classList.toggle('nx-open', open);
    trigger.setAttribute('aria-expanded', String(open));
  };
  trigger.addEventListener('click', () => setOpen(!root.classList.contains('nx-open')));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('click', event => { if (!root.contains(event.target)) setOpen(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
})();