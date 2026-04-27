// Brand logo mapping using Clearbit Logo API.
// Maps brand name variations → domain, then we build a logo URL from the domain.

export const BRAND_DOMAINS: Record<string, string> = {
  // Financial
  'wise':               'wise.com',
  'mercado pago':       'mercadopago.com',
  'mercadopago':        'mercadopago.com',
  'galicia':            'bancogalicia.com.ar',
  'dolarapp':           'dolarapp.com',
  'deel':               'deel.com',
  'jpm':                'jpmorgan.com',
  'jp morgan':          'jpmorgan.com',
  'jpmorgan':           'jpmorgan.com',
  'chase':              'chase.com',
  'binance':            'binance.com',
  'paypal':             'paypal.com',
  'revolut':            'revolut.com',
  'bbva':               'bbva.com',
  'santander':          'santander.com',
  'hsbc':               'hsbc.com',

  // Streaming & Entertainment
  'netflix':            'netflix.com',
  'spotify':            'spotify.com',
  'youtube':            'youtube.com',
  'youtube premium':    'youtube.com',
  'amazon prime':       'amazon.com',
  'amazon':             'amazon.com',
  'hbo':                'hbomax.com',
  'hbo max':            'hbomax.com',
  'max':                'max.com',
  'disney':             'disneyplus.com',
  'disney+':            'disneyplus.com',
  'paramount':          'paramountplus.com',
  'paramount+':         'paramountplus.com',
  'apple tv':           'tv.apple.com',
  'apple tv+':          'tv.apple.com',
  'apple music':        'music.apple.com',
  'apple one':          'apple.com',
  'twitch':             'twitch.tv',
  'crunchyroll':        'crunchyroll.com',
  'espn':               'espn.com',
  'river':              'cariverplate.com.ar',
  'river plate':        'cariverplate.com.ar',

  // AI & Productivity
  'openai':             'openai.com',
  'chatgpt':            'openai.com',
  'claude':             'anthropic.com',
  'anthropic':          'anthropic.com',
  'google':             'google.com',
  'google ai':          'google.com',
  'gemini':             'google.com',
  'perplexity':         'perplexity.ai',
  'gamma':              'gamma.app',
  'runway':             'runwayml.com',
  'midjourney':         'midjourney.com',
  'elevenlabs':         'elevenlabs.io',
  'notion':             'notion.so',
  'notebooklm':         'notebooklm.google.com',
  'microsoft':          'microsoft.com',
  'github':             'github.com',
  'figma':              'figma.com',
  'canva':              'canva.com',
  'adobe':              'adobe.com',
  'adobe creative':     'adobe.com',
  'loom':               'loom.com',
  'grammarly':          'grammarly.com',
  'blinkist':           'blinkist.com',
  'blinkst':            'blinkist.com',
  'slack':              'slack.com',
  'discord':            'discord.com',
  'icloud':             'icloud.com',
  'dropbox':            'dropbox.com',
  'vercel':             'vercel.com',
  'linear':             'linear.app',
  'duolingo':           'duolingo.com',
  'headspace':          'headspace.com',
  'calm':               'calm.com',
  'fitia':              'fitia.app',

  // Transport & Delivery
  'uber':               'uber.com',
  'uber eats':          'ubereats.com',
  'uberone':            'uber.com',
  'uber one':           'uber.com',
  'didi':               'didiglobal.com',
  'cabify':             'cabify.com',
  'rappi':              'rappi.com',
  'pedidosya':          'pedidosya.com',
  'pedidos ya':         'pedidosya.com',
  'glovo':              'glovoapp.com',

  // Argentine services
  'personal':           'personal.com.ar',
  'movistar':           'movistar.com.ar',
  'claro':              'claro.com.ar',
  'flow':               'flow.com.ar',
  'edesur':             'edesur.com.ar',
  'edenor':             'edenor.com',
  'metrogas':           'metrogas.com.ar',
  'osde':               'osde.com.ar',
  'swiss medical':      'swissmedical.com.ar',
  'galeno':             'galeno.com.ar',
  'sancor salud':       'sancorsalud.com.ar',
  'farmacity':          'farmacity.com',
  'mercadolibre':       'mercadolibre.com.ar',
  'mercado libre':      'mercadolibre.com.ar',
  'wework':             'wework.com',
  'starbucks':          'starbucks.com',
  'whole foods':        'wholefoodsmarket.com',
  'airbnb':             'airbnb.com',
  'booking':            'booking.com',
  'booking.com':        'booking.com',
  'steam':              'steampowered.com',
  'apple':              'apple.com',
  'coto':               'coto.com.ar',
};

export function getBrandDomain(name: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Exact match
  if (BRAND_DOMAINS[lower]) return BRAND_DOMAINS[lower];

  // Partial match — check if any key is contained in the name
  for (const [key, domain] of Object.entries(BRAND_DOMAINS)) {
    if (lower.includes(key) || (key.length >= 4 && key.includes(lower))) return domain;
  }

  return null;
}

export function getBrandLogoUrl(name: string): string | null {
  const domain = getBrandDomain(name);
  if (!domain) return null;
  return `https://logo.clearbit.com/${domain}`;
}

// Backwards compatibility — returns null so callers fall through to other rendering paths.
export function getBrandLogo(_name: string): null {
  return null;
}

// Fallback category icons - only used when DB category has no icon set
const CATEGORY_ICON_FALLBACKS: Record<string, string> = {
  'Food & Drink': '🍔',
  'Transport': '🚗',
  'Housing': '🏠',
  'Entertainment': '🎬',
  'Shopping': '🛍️',
  'Health': '💊',
  'Education': '📚',
  'Subscriptions': '🔄',
  'Travel': '✈️',
  'Personal': '👤',
  'Gifts': '🎁',
  'Other': '📌',
  'Uncategorized': '❓',
  'Software': '💻',
  'Utilities': '⚡',
  'Insurance': '🛡️',
  'Groceries': '🥬',
  'Income': '💰',
  'Salary': '💰',
  'Freelance': '💻',
  'Investment': '📈',
  'Transfer': '🔄',
};

export function getCategoryIcon(name: string, dbIcon?: string | null): string {
  if (dbIcon) return dbIcon;
  return CATEGORY_ICON_FALLBACKS[name] || '📌';
}

const AVATAR_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-700' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-violet-100', text: 'text-violet-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-rose-100', text: 'text-rose-700' },
  { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
];

export function getInitialsColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
