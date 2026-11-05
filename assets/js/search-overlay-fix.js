/* Taqwa store: keep autocomplete directly under the search field on every page. */
(function () {
  'use strict';
  const STYLE_ID = 'taqwa-search-overlay-fix-style';
  const CSS = `
    .search-box{position:relative!important;overflow:visible!important;z-index:10020!important}
    #homeSearchSuggestions,.search-suggestions{
      position:fixed!important;box-sizing:border-box!important;z-index:2147483647!important;
      display:none;max-height:min(360px,55vh)!important;overflow-y:auto!important;overflow-x:hidden!important;
      margin:0!important;padding:6px 0!important;border:1px solid #f3ead6!important;border-radius:14px!important;
      background:#fff!important;color:#332a18!important;box-shadow:0 12px 32px rgba(85,71,40,.20)!important;
      direction:rtl!important;text-align:right!important;isolation:isolate!important;
    }
    #homeSearchSuggestions[style*="display: block"],.search-suggestions.active{display:block!important}
    #homeSearchSuggestions .suggestion-item,.search-suggestions .suggestion-item{
      display:flex!important;align-items:center!important;gap:10px!important;padding:11px 14px!important;
      min-height:48px!important;background:#fff!important;color:#332a18!important;cursor:pointer!important;
      border-bottom:1px solid #f7f4ed!important;text-align:right!important;white-space:normal!important;
    }
    #homeSearchSuggestions .suggestion-item:hover,.search-suggestions .suggestion-item:hover{background:#fbf8f1!important}
    #homeSearchSuggestions .suggestion-name,.search-suggestions .suggestion-name{color:#332a18!important;line-height:1.5!important}
    #homeSearchSuggestions .suggestion-price{color:#8a6923!important;font-size:.85rem!important;margin-top:3px!important}
    #homeSearchSuggestions .suggestion-empty,.search-suggestions .suggestion-empty{padding:14px!important;color:#6c624c!important;background:#fff!important}
    .search-btn{animation:none!important;transform:none!important;position:absolute!important;top:50%!important;translate:0 -50%!important;z-index:3!important}
  `;
  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }
  function findSearchBox() { return document.querySelector('.search-box'); }
  function visible(el) {
    if (!el || !el.isConnected) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && (el.classList.contains('active') || el.style.display === 'block');
  }
  function attachSuggestion(el) {
    if (!el || el.dataset.taqwaOverlayAttached === '1') return;
    el.dataset.taqwaOverlayAttached = '1';
    if (el.id === 'homeSearchSuggestions') el.classList.add('taqwa-home-suggestions');
    // Move the list out of transformed/overflow-clipped header and page containers.
    if (el.parentElement !== document.body) document.body.appendChild(el);
    position(el);
  }
  function position(el) {
    const box = findSearchBox();
    if (!box || !el) return;
    const r = box.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(r.width, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(r.left, window.innerWidth - width - margin));
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('left', left + 'px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('top', Math.min(r.bottom + 5, window.innerHeight - 60) + 'px', 'important');
    el.style.setProperty('width', width + 'px', 'important');
    el.style.setProperty('max-width', 'calc(100vw - 16px)', 'important');
    el.style.setProperty('z-index', '2147483647', 'important');
  }
  function refresh() {
    addStyle();
    const lists = document.querySelectorAll('#homeSearchSuggestions,.search-suggestions');
    lists.forEach(el => { attachSuggestion(el); if (visible(el)) position(el); });
  }
  function scheduleRefresh() { requestAnimationFrame(refresh); }
  function init() {
    addStyle(); refresh();
    const observer = new MutationObserver(() => scheduleRefresh());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', scheduleRefresh, { passive: true });
    window.addEventListener('scroll', scheduleRefresh, { passive: true, capture: true });
    document.addEventListener('input', e => { if (e.target && e.target.id === 'searchInput') setTimeout(refresh, 0); }, true);
    document.addEventListener('focusin', e => { if (e.target && e.target.id === 'searchInput') scheduleRefresh(); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
