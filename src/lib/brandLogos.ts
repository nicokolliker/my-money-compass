// Brand logo mapping using Clearbit Logo API.
// Maps brand name variations → domain, then we build a logo URL from the domain.

export const BRAND_DOMAINS: Record<string, string> = {
  // Financial
  'splitwise':          'splitwise.com',
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

  // Supermarkets, convenience & retail (LATAM + Spain)
  'dia':                'dia.es',
  'dia supermercado':   'dia.es',
  'oxxo':               'oxxo.com',
  'carrefour':          'carrefour.com.ar',
  'jumbo':              'jumbo.com.ar',
  'disco':              'disco.com.ar',
  'vea':                'veadigital.com.ar',
  'walmart':            'walmart.com',
  'la comer':           'lacomer.com.mx',
  'soriana':            'soriana.com',
  'chedraui':           'chedraui.com.mx',
  '7-eleven':           '7-eleven.com',
  'seven eleven':       '7-eleven.com',
  'mercadona':          'mercadona.es',
  'lidl':               'lidl.es',
  'aldi':               'aldi.es',
  'el corte ingles':    'elcorteingles.es',
  'fnac':               'fnac.es',
  'ikea':               'ikea.com',
  'zara':               'zara.com',
  'h&m':                'hm.com',
  'uniqlo':             'uniqlo.com',
  'decathlon':          'decathlon.com',
  'petco':              'petco.com',

  // AI / dev tools (additions)
  'lovable':            'lovable.dev',
  'granola':            'granola.ai',
  'cursor':             'cursor.com',
  'v0':                 'v0.dev',
  'replit':             'replit.com',
  'supabase':           'supabase.com',
  'cloudflare':         'cloudflare.com',
  'anthropic claude':   'anthropic.com',
  'openrouter':         'openrouter.ai',

  // Food, delivery & restaurants (additions)
  'mcdonalds':          'mcdonalds.com',
  "mcdonald's":         'mcdonalds.com',
  'mcdonald':           'mcdonalds.com',
  'burger king':        'burgerking.com',
  'kfc':                'kfc.com',
  'subway':             'subway.com',
  'dominos':            'dominos.com',
  "domino's":           'dominos.com',
  'pizza hut':          'pizzahut.com',
  'starbucks coffee':   'starbucks.com',
  'granier':            'granier.com',
  'lamucca':            'lamucca.es',

  // Travel & airlines (additions)
  'copa air':           'copaair.com',
  'copa airlines':      'copaair.com',
  'aerolineas':         'aerolineas.com.ar',
  'aerolineas argentinas': 'aerolineas.com.ar',
  'latam':              'latamairlines.com',
  'iberia':             'iberia.com',
  'vueling':            'vueling.com',
  'ryanair':            'ryanair.com',
  'renfe':              'renfe.com',
  'expedia':            'expedia.com',

  // Health & pharmacy (additions)
  'farmacia':           'farmacia.es',
  'drogueria':          'farmacity.com',

  // Misc utilities/services
  'naranja':            'naranjax.com',
  'naranja x':          'naranjax.com',
  'ualá':               'uala.com.ar',
  'uala':               'uala.com.ar',
  'brubank':            'brubank.com',
  'belo':               'belo.app',
  'lemon':              'lemon.me',
  'prex':                'prexcard.com',
  'bbva argentina':     'bbva.com.ar',
  'icbc':               'icbc.com.ar',
  'macro':              'macro.com.ar',
  'supervielle':        'supervielle.com.ar',
  'patagonia':          'bancopatagonia.com.ar',
  'comafi':             'comafi.com.ar',
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
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

// Backwards compatibility — returns null so callers fall through to other rendering paths.
// Typed loosely to allow legacy `.bg` / `.icon` / `.text` access on the (always-null) result.
export function getBrandLogo(_name: string): { icon: string; bg: string; text: string } | null {
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
