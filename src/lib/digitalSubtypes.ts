// Shared "Digital" subtype taxonomy and name-based matcher.
// Single source of truth for both the client AND the wise-sync edge function
// (keep supabase/functions/wise-sync/index.ts in sync when editing this file).

export const DIGITAL_SUBTYPES: Record<string, { label: string; icon: string }> = {
  ia:                 { label: 'IA',                          icon: '🤖' },
  creatividad:        { label: 'Creatividad & Productividad', icon: '🎨' },
  entretenimiento:    { label: 'Entretenimiento',             icon: '🎬' },
  delivery_movilidad: { label: 'Marketplace & Movilidad',     icon: '🛒' },
  otros:              { label: 'Otros',                       icon: '✨' },
};

/**
 * Explicit overrides checked BEFORE the generic map.
 * Needed for names that would otherwise match a broader keyword
 * (e.g. "Amazon Prime" contains "amazon" → Marketplace, but the user
 * classifies Prime under Otros).
 */
export const DIGITAL_NAME_OVERRIDES: Record<string, string[]> = {
  otros: ['amazon prime', 'oura'],
};

export const DIGITAL_NAME_MAP: Record<string, string[]> = {
  ia: ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'openai', 'google ai', 'midjourney', 'runway', 'gamma', 'notebooklm'],
  entretenimiento: ['netflix', 'spotify', 'youtube', 'disney', 'hbo', 'apple tv', 'paramount', 'crunchyroll', 'blinkist'],
  creatividad: ['adobe', 'figma', 'canva', 'notion', 'loom', 'grammarly', 'icloud', 'apple one', 'lovable', 'granola'],
  delivery_movilidad: ['uber', 'didi', 'rappi', 'pedidos ya', 'glovo', 'cabify', 'amazon', 'mercadolibre', 'meli', 'aliexpress', 'ebay'],
};

/** Legacy subcategory labels that were renamed; used for self-healing DB rows. */
export const DIGITAL_LEGACY_LABELS: Record<string, string> = {
  'delivery & movilidad': 'Marketplace & Movilidad',
};

/** Infer a digital subtype key from a free-text name (merchant or description). */
export function getDigitalSubtype(name: string): string {
  const lower = (name || '').toLowerCase();
  for (const [key, patterns] of Object.entries(DIGITAL_NAME_OVERRIDES)) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  for (const [key, patterns] of Object.entries(DIGITAL_NAME_MAP)) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return 'otros';
}
