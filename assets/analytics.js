(() => {
  const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';
  const PROD_HOSTNAMES = ['anime-cast-now.vercel.app'];
  const OPT_OUT_KEY = 'acn_ga_off';
  const query = new URLSearchParams(location.search);
  const debugMode = query.get('ga_debug') === '1';
  const measurementIdConfigured = /^G-[A-Z0-9]{6,12}$/.test(GA_MEASUREMENT_ID) && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX';

  let optedOut = query.get('ga_optout') === '1';
  if (query.get('ga_optout') === '1' || query.get('ga_optout') === '0') {
    try {
      if (query.get('ga_optout') === '1') localStorage.setItem(OPT_OUT_KEY, '1');
      else localStorage.removeItem(OPT_OUT_KEY);
    } catch (error) {
      console.warn('[analytics:dev] Unable to update the opt-out preference.', error);
    }
  }

  try {
    optedOut = localStorage.getItem(OPT_OUT_KEY) === '1' || optedOut;
  } catch (error) {
    console.warn('[analytics:dev] Unable to read the opt-out preference.', error);
  }

  const isProduction = PROD_HOSTNAMES.includes(location.hostname);
  const enabled = !optedOut && measurementIdConfigured && (isProduction || debugMode);
  const pending = window.__acnAnalyticsQueue || [];
  let lastPageLocation = '';

  function cleanParams(params) {
    const result = {};
    for (const [key, value] of Object.entries(params || {})) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(key) || value == null) continue;
      if (typeof value === 'string') result[key] = value.slice(0, 100);
      else if (typeof value === 'number' || typeof value === 'boolean') result[key] = value;
      else result[key] = String(value).slice(0, 100);
    }
    return result;
  }

  function track(eventName, params = {}) {
    if (typeof eventName !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(eventName)) return;
    const eventParams = { ...cleanParams(params), transport_type: 'beacon' };
    if (debugMode) eventParams.debug_mode = true;

    if (!enabled) {
      console.info('[analytics:dev]', eventName, eventParams);
      return;
    }
    window.gtag('event', eventName, eventParams);
  }

  function pageView() {
    const pageLocation = location.href;
    if (pageLocation === lastPageLocation) return;
    lastPageLocation = pageLocation;
    track('page_view', {
      page_location: pageLocation,
      page_path: location.pathname,
      page_title: document.title,
    });
  }

  window.acnTrack = track;
  window.acnPageView = pageView;
  window.__acnAnalyticsQueue = null;

  if (enabled) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, { send_page_view: false, debug_mode: debugMode });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
    document.head.appendChild(script);
  }

  for (const item of pending) {
    if (item.type === 'page_view') pageView();
    else if (item.type === 'event') track(...item.args);
  }

  function clickParams(element, eventName) {
    const data = element.dataset;
    if (eventName === 'vod_click') {
      let linkHost = '';
      try {
        linkHost = new URL(element.href, location.href).hostname;
      } catch {
        return null;
      }
      return {
        vod_provider: data.gaProvider,
        work_id: data.gaWorkId,
        work_title: data.gaWorkTitle,
        va_id: data.gaVaId,
        va_name: data.gaVaName,
        link_host: linkHost,
        position: Number(data.gaPosition),
        page_type: data.gaPageType,
      };
    }
    if (eventName === 'official_site_click') {
      return { work_id: data.gaWorkId, work_title: data.gaWorkTitle, va_id: data.gaVaId };
    }
    if (eventName === 'share_x_click') return { va_id: data.gaVaId, va_name: data.gaVaName };
    if (eventName === 'copy_link_click') return { va_id: data.gaVaId };
    return null;
  }

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('[data-ga-event]') : null;
    if (!target) return;
    const eventName = target.dataset.gaEvent;
    const params = clickParams(target, eventName);
    if (params) track(eventName, params);
  });

  const search = document.querySelector('#q');
  if (search) {
    let searchTimer;
    let lastSearchTerm = '';
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const searchTerm = search.value.trim();
        const normalizedTerm = searchTerm.normalize('NFKC').toLowerCase();
        if (!normalizedTerm || normalizedTerm === lastSearchTerm) return;
        lastSearchTerm = normalizedTerm;
        track('search', {
          search_term: searchTerm,
          results_count: document.querySelectorAll('#list .row').length,
        });
      }, 800);
    });
  }

  if (optedOut) {
    console.info('[analytics:dev] GA4 disabled for this browser by its opt-out preference.');
  } else if (!measurementIdConfigured) {
    console.info('[analytics:dev] Set GA_MEASUREMENT_ID in assets/analytics.js to enable GA4.');
  } else if (!isProduction && !debugMode) {
    console.info('[analytics:dev] GA4 disabled outside production. Add ?ga_debug=1 to enable DebugView events.');
  }
})();
