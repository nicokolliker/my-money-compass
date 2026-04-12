// Brand logo mapping for accounts, merchants, and subscriptions
// Uses emoji/initials as lightweight logos — no external images needed

export const BRAND_LOGOS: Record<string, { icon: string; bg: string; text: string }> = {
  // Accounts / Financial institutions
  'wise': { icon: '🌐', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'mercado pago': { icon: '🟦', bg: 'bg-sky-50', text: 'text-sky-600' },
  'galicia': { icon: '🏦', bg: 'bg-orange-50', text: 'text-orange-600' },
  'dolarapp': { icon: '💲', bg: 'bg-green-50', text: 'text-green-600' },
  'deel': { icon: '💼', bg: 'bg-blue-50', text: 'text-blue-600' },
  'jpm': { icon: '🏛️', bg: 'bg-slate-50', text: 'text-slate-700' },
  'jp morgan': { icon: '🏛️', bg: 'bg-slate-50', text: 'text-slate-700' },
  'chase': { icon: '🏛️', bg: 'bg-blue-50', text: 'text-blue-700' },
  'binance': { icon: '⬡', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  'splitwise': { icon: '🔀', bg: 'bg-teal-50', text: 'text-teal-600' },
  'paypal': { icon: '🅿️', bg: 'bg-blue-50', text: 'text-blue-600' },
  'revolut': { icon: '🔵', bg: 'bg-indigo-50', text: 'text-indigo-600' },
  'n26': { icon: '🏦', bg: 'bg-teal-50', text: 'text-teal-600' },
  'brubank': { icon: '🟣', bg: 'bg-purple-50', text: 'text-purple-600' },
  'uala': { icon: '🔴', bg: 'bg-red-50', text: 'text-red-500' },
  'ualá': { icon: '🔴', bg: 'bg-red-50', text: 'text-red-500' },
  'bbva': { icon: '🏦', bg: 'bg-blue-50', text: 'text-blue-700' },
  'santander': { icon: '🏦', bg: 'bg-red-50', text: 'text-red-600' },
  'hsbc': { icon: '🏦', bg: 'bg-red-50', text: 'text-red-600' },

  // Merchants / Subscriptions
  'spotify': { icon: '🎵', bg: 'bg-green-50', text: 'text-green-600' },
  'netflix': { icon: '🎬', bg: 'bg-red-50', text: 'text-red-600' },
  'youtube': { icon: '▶️', bg: 'bg-red-50', text: 'text-red-500' },
  'youtube premium': { icon: '▶️', bg: 'bg-red-50', text: 'text-red-500' },
  'amazon': { icon: '📦', bg: 'bg-amber-50', text: 'text-amber-600' },
  'amazon prime': { icon: '📦', bg: 'bg-amber-50', text: 'text-amber-600' },
  'uber': { icon: '🚗', bg: 'bg-slate-50', text: 'text-slate-700' },
  'uber eats': { icon: '🍔', bg: 'bg-green-50', text: 'text-green-600' },
  'rappi': { icon: '🛵', bg: 'bg-orange-50', text: 'text-orange-500' },
  'pedidosya': { icon: '🛵', bg: 'bg-red-50', text: 'text-red-500' },
  'apple': { icon: '🍎', bg: 'bg-gray-50', text: 'text-gray-700' },
  'google': { icon: '🔍', bg: 'bg-blue-50', text: 'text-blue-500' },
  'microsoft': { icon: '🪟', bg: 'bg-blue-50', text: 'text-blue-600' },
  'github': { icon: '🐙', bg: 'bg-gray-50', text: 'text-gray-700' },
  'openai': { icon: '🤖', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'chatgpt': { icon: '🤖', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'claude': { icon: '🧠', bg: 'bg-orange-50', text: 'text-orange-600' },
  'notion': { icon: '📓', bg: 'bg-gray-50', text: 'text-gray-700' },
  'slack': { icon: '💬', bg: 'bg-purple-50', text: 'text-purple-600' },
  'discord': { icon: '🎮', bg: 'bg-indigo-50', text: 'text-indigo-600' },
  'figma': { icon: '🎨', bg: 'bg-violet-50', text: 'text-violet-600' },
  'vercel': { icon: '▲', bg: 'bg-gray-50', text: 'text-gray-700' },
  'hbo': { icon: '🎭', bg: 'bg-purple-50', text: 'text-purple-600' },
  'hbo max': { icon: '🎭', bg: 'bg-purple-50', text: 'text-purple-600' },
  'disney': { icon: '🏰', bg: 'bg-blue-50', text: 'text-blue-600' },
  'disney+': { icon: '🏰', bg: 'bg-blue-50', text: 'text-blue-600' },
  'paramount': { icon: '⭐', bg: 'bg-blue-50', text: 'text-blue-700' },
  'twitch': { icon: '🟣', bg: 'bg-purple-50', text: 'text-purple-600' },
  'steam': { icon: '🎮', bg: 'bg-slate-50', text: 'text-slate-700' },
  'starbucks': { icon: '☕', bg: 'bg-green-50', text: 'text-green-700' },
  'mcdonald': { icon: '🍟', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  'mcdonalds': { icon: '🍟', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  "mcdonald's": { icon: '🍟', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  'icloud': { icon: '☁️', bg: 'bg-blue-50', text: 'text-blue-500' },
  'dropbox': { icon: '📁', bg: 'bg-blue-50', text: 'text-blue-600' },
  'linear': { icon: '🔷', bg: 'bg-violet-50', text: 'text-violet-600' },
  'gym': { icon: '💪', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'megatlon': { icon: '💪', bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'mercadolibre': { icon: '🛒', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  'mercado libre': { icon: '🛒', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  'airbnb': { icon: '🏠', bg: 'bg-rose-50', text: 'text-rose-500' },
  'booking': { icon: '🏨', bg: 'bg-blue-50', text: 'text-blue-600' },
  'zara': { icon: '👗', bg: 'bg-gray-50', text: 'text-gray-700' },
  'nike': { icon: '👟', bg: 'bg-gray-50', text: 'text-gray-700' },
  'adidas': { icon: '👟', bg: 'bg-gray-50', text: 'text-gray-700' },
  'aws': { icon: '☁️', bg: 'bg-orange-50', text: 'text-orange-600' },
  'digital ocean': { icon: '🌊', bg: 'bg-blue-50', text: 'text-blue-600' },
  'digitalocean': { icon: '🌊', bg: 'bg-blue-50', text: 'text-blue-600' },
  'supabase': { icon: '⚡', bg: 'bg-green-50', text: 'text-green-600' },
  'grammarly': { icon: '📝', bg: 'bg-green-50', text: 'text-green-600' },
  'canva': { icon: '🎨', bg: 'bg-cyan-50', text: 'text-cyan-600' },
  'zoom': { icon: '📹', bg: 'bg-blue-50', text: 'text-blue-600' },
  'whatsapp': { icon: '💬', bg: 'bg-green-50', text: 'text-green-600' },
  'telegram': { icon: '✈️', bg: 'bg-blue-50', text: 'text-blue-500' },
  'cash': { icon: '💵', bg: 'bg-emerald-50', text: 'text-emerald-600' },
};

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

/**
 * Find brand logo by matching against name (case-insensitive, partial match)
 */
export function getBrandLogo(name: string): { icon: string; bg: string; text: string } | null {
  const lower = name.toLowerCase().trim();
  
  // Exact match first
  if (BRAND_LOGOS[lower]) return BRAND_LOGOS[lower];
  
  // Partial match (brand name contained in the string)
  for (const [key, val] of Object.entries(BRAND_LOGOS)) {
    if (lower.includes(key) || key.includes(lower)) return val;
  }
  
  return null;
}

/**
 * Get category icon. Prefers DB-stored icon, falls back to hardcoded map.
 * @param name Category name
 * @param dbIcon Optional icon from DB category record
 */
export function getCategoryIcon(name: string, dbIcon?: string | null): string {
  if (dbIcon) return dbIcon;
  return CATEGORY_ICON_FALLBACKS[name] || '📌';
}

/**
 * Generate a consistent color for initials fallback based on string hash
 */
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
