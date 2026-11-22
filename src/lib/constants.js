export const GRAMS_PER_OZ = 31.1034768;

// Refresh cadence (ms)
export const METALS_INTERVAL = 60_000; // live metal quotes
export const FX_INTERVAL = 5 * 60_000; // FX sources only change daily; 5 min is plenty
export const HISTORY_INTERVAL = 6 * 60 * 60_000; // charts & 7-day trend
export const FORCE_COOLDOWN = 10_000; // "Refresh now" cooldown
export const REQUEST_TIMEOUT = 6_000; // a hung source must not hold up the others

export const METALS = [
  { code: 'XAU', sym: 'Au', name: 'Gold', nameAr: 'ذهب', tint: '#E8B54A' },
  { code: 'XAG', sym: 'Ag', name: 'Silver', nameAr: 'فضة', tint: '#C9CED6' },
  { code: 'XPT', sym: 'Pt', name: 'Platinum', nameAr: 'بلاتين', tint: '#A9C4E8' },
  { code: 'XPD', sym: 'Pd', name: 'Palladium', nameAr: 'بالاديوم', tint: '#D7B9E8' },
];

// Egyptian market karats (purity = fraction of pure gold)
export const KARATS = [
  { id: '24', label: '24K', purity: 24 / 24, note: 'Pure gold' },
  { id: '22', label: '22K', purity: 22 / 24, note: '91.7%' },
  { id: '21', label: '21K', purity: 21 / 24, note: 'Most traded in Egypt' },
  { id: '18', label: '18K', purity: 18 / 24, note: '75%' },
  { id: '14', label: '14K', purity: 14 / 24, note: '58.3%' },
];
// Egyptian gold pound (جنيه ذهب): 8 g of 21K
export const GOLD_POUND = { grams: 8, purity: 0.875 };

export const UNITS = {
  g: { label: 'g', perOz: 1 / GRAMS_PER_OZ },
  oz: { label: 'oz', perOz: 1 },
  kg: { label: 'kg', perOz: 1000 / GRAMS_PER_OZ },
};
