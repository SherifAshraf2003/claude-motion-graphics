// Brand palette — the single place to change colors.
// NOTE: manasetak.com could not be reached from the render sandbox, so these
// are best-guess placeholder values. Replace them with the exact hex codes
// from the website and re-run `npm run build` — every scene picks them up.
window.BRAND = {
  ink: '#07102E',          // darkest background
  deep: '#0D1A4F',         // secondary dark background
  primary: '#3552FF',      // main brand color
  primaryDeep: '#1D2FB5',  // darker shade of the main color
  primaryLight: '#8196FF', // lighter tint of the main color
  accent: '#FFB224',       // highlight / call-to-action accent
  mint: '#17C99B',         // success
  coral: '#FF6B6B',        // extra feature color
  paper: '#F5F7FF',        // light background (end card)
  muted: '#A3AED6',        // secondary text on dark
};

(function applyBrand(b) {
  const r = document.documentElement.style;
  const map = {
    ink: '--ink', deep: '--deep', primary: '--primary', primaryDeep: '--primary-deep',
    primaryLight: '--primary-light', accent: '--accent', mint: '--mint', coral: '--coral',
    paper: '--paper', muted: '--muted',
  };
  for (const k in map) r.setProperty(map[k], b[k]);
})(window.BRAND);
