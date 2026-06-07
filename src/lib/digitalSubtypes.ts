// Shared "Digital" subtype taxonomy and name-based matcher.
// Mirrors what was originally defined inline in RecurringExpenses.tsx so
// transactions and recurrings agree on the same values.

export const DIGITAL_SUBTYPES: Record<string, { label: string; icon: string }> = {
  ia:                 { label: 'IA',                          icon: '🤖' },
  creatividad:        { label: 'Creatividad & Productividad', icon: '🎨' },
  entretenimiento:    { label: 'Entretenimiento',             icon: '🎬' },
  delivery_movilidad: { label: 'Marketplace & Movilidad',     icon: '🛒' },
  otros:              { label: 'Otros',                       icon: '✨' },
};

export const DIGITAL_NAME_MAP: Record<string, string[]> = {
  ia: ['chatgpt', 'claude', 'gemini', 'perplexity', 'copilot', 'openai', 'google ai', 'midjourney', 'runway', 'gamma', 'notebooklm'],
  entretenimiento: ['netflix', 'spotify', 'youtube', 'disney', 'hbo', 'apple tv', 'paramount', 'crunchyroll', 'blinkist'],
  creatividad: ['adobe', 'figma', 'canva', 'notion', 'loom', 'grammarly', 'icloud', 'apple one', 'lovable', 'granola'],
  delivery_movilidad: ['uber', 'didi', 'rappi', 'pedidos ya', 'glovo', 'cabify', 'amazon', 'mercadolibre', 'meli', 'aliexpress', 'ebay'],
};

/** Infer a digital subtype from a free-text name (merchant or description). */
export function getDigitalSubtype(name: string): string {
  const lower = (name || '').toLowerCase();
  for (const [key, patterns] of Object.entries(DIGITAL_NAME_MAP)) {
    if (patterns.some(p => lower.includes(p))) return key;
  }
  return 'otros';
}
