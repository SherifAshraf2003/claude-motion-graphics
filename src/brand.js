// Brand palette from the Manasetak Brand Guideline v1.0 (2026).
// Values were read from the guideline's vector artwork. Note: the PDF's
// "Secondary Color" page has its two hex labels swapped; the swatches
// themselves are Purple #AD46FF and Orange #FF6900, which is what we use.
window.BRAND = {
  // primary
  blue: '#00A6F4',        // Manasetak Blue
  navy: '#052F4A',        // Manasetak Navy
  navyDeep: '#001B31',    // deepest navy (icon artwork, p.16)
  logoBlue: '#31A8FF',    // monogram light blue
  blue400: '#33B8F6', blue300: '#66CAF8', blue200: '#99DBFB', blue100: '#CCEDFD', blue50: '#E5F6FE',
  // secondary
  purple: '#AD46FF', purple300: '#CE90FF', purple50: '#F7ECFF',
  orange: '#FF6900', orange400: '#FF8733', orange50: '#FFF0E5',
  // neutrals used across the guideline
  bg: '#F0F9FF',          // subtle blue page background
  gray700: '#364153', gray500: '#6A7282', gray400: '#99A1AF', gray300: '#D1D5DC',
};

// Semantic roles used by the film.
Object.assign(window.BRAND, {
  primary: BRAND.blue,
  primaryDeep: BRAND.navy,
  primaryLight: BRAND.blue300,
  accent: BRAND.orange,
  success: BRAND.blue,
});

(function applyBrand(b) {
  const r = document.documentElement.style;
  const kebab = k => '--' + k.replace(/([A-Z])/g, '-$1').replace(/(\d+)/g, '-$1').toLowerCase().replace(/--/g, '-');
  for (const k in b) r.setProperty(kebab(k), b[k]);
})(window.BRAND);
