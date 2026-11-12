(() => {
  const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';
  const PROD_HOSTNAMES = ['anime-cast-now.vercel.app'];
  const OPT_OUT_KEY = 'acn_ga_off';
  const query = new URLSearchParams(location.search);
  const debugMode = query.get('ga_debug') === '1';

  if (query.get('ga_optout') === '1' || query.get('ga_optout') === '0') {
    try {
      if (query.get('ga_optout') === '1') localStorage.setItem(OPT_OUT_KEY, '1');
      else localStorage.removeItem(OPT_OUT_KEY);
    } catch (error) {
      console.warn('[analytics:dev] Unable to update the opt-out preference.', error);
    }
  }

  let optedOut = false;
  try {
    optedOut = localStorage.getItem(OPT_OUT_KEY) === '1';
  } catch (error) {
    console.warn('[analytics:dev] Unable to read the opt-out preference.', error);
  }

  const isProduction = PROD_HOSTNAMES.includes(location.hostname);
  const enabled = !optedOut && (isProduction || debugMode);
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

  if (optedOut) {
    console.info('[analytics:dev] GA4 disabled for this browser by its opt-out preference.');
  } else if (!isProduction && !debugMode) {
    console.info('[analytics:dev] GA4 disabled outside production. Add ?ga_debug=1 to enable DebugView events.');
  }
})();
