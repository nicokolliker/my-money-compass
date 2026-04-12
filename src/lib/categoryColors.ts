// Fixed category color system — consistent across charts, tags, icons
// Maps category names to their designated colors

export const CATEGORY_COLORS: Record<string, { bg: string; text: string; hex: string }> = {
  // Core categories with fixed colors per design system
  'Food & Drink':    { bg: 'bg-red-100',     text: 'text-red-600',     hex: '#EF4444' },
  'Food & Drinks':   { bg: 'bg-red-100',     text: 'text-red-600',     hex: '#EF4444' },
  'Groceries':       { bg: 'bg-red-100',     text: 'text-red-600',     hex: '#EF4444' },
  'Transport':       { bg: 'bg-blue-100',    text: 'text-blue-600',    hex: '#3B82F6' },
  'Transportation':  { bg: 'bg-blue-100',    text: 'text-blue-600',    hex: '#3B82F6' },
  'Shopping':        { bg: 'bg-pink-100',    text: 'text-pink-600',    hex: '#EC4899' },
  'Health':          { bg: 'bg-green-100',   text: 'text-green-600',   hex: '#22C55E' },
  'Healthcare':      { bg: 'bg-green-100',   text: 'text-green-600',   hex: '#22C55E' },
  'Subscriptions':   { bg: 'bg-violet-100',  text: 'text-violet-600',  hex: '#8B5CF6' },
  'Software':        { bg: 'bg-violet-100',  text: 'text-violet-600',  hex: '#8B5CF6' },
  'Housing':         { bg: 'bg-orange-100',  text: 'text-orange-600',  hex: '#F97316' },
  'Rent':            { bg: 'bg-orange-100',  text: 'text-orange-600',  hex: '#F97316' },
  'Entertainment':   { bg: 'bg-fuchsia-100', text: 'text-fuchsia-600', hex: '#D946EF' },
  'Education':       { bg: 'bg-cyan-100',    text: 'text-cyan-600',    hex: '#06B6D4' },
  'Travel':          { bg: 'bg-teal-100',    text: 'text-teal-600',    hex: '#14B8A6' },
  'Personal':        { bg: 'bg-rose-100',    text: 'text-rose-600',    hex: '#F43F5E' },
  'Gifts':           { bg: 'bg-fuchsia-100', text: 'text-fuchsia-600', hex: '#D946EF' },
  'Utilities':       { bg: 'bg-sky-100',     text: 'text-sky-600',     hex: '#0EA5E9' },
  'Insurance':       { bg: 'bg-lime-100',    text: 'text-lime-600',    hex: '#84CC16' },
  'Other':           { bg: 'bg-slate-100',   text: 'text-slate-500',   hex: '#64748B' },
  'Uncategorized':   { bg: 'bg-gray-100',    text: 'text-gray-500',    hex: '#9CA3AF' },
};

// Chart color palette — max 6 distinct colors for clean charts
export const CHART_COLORS = ['#EF4444', '#3B82F6', '#EC4899', '#22C55E', '#8B5CF6', '#F97316'];

const FALLBACK = { bg: 'bg-slate-100', text: 'text-slate-500', hex: '#64748B' };

/**
 * Get category color. Prefers DB-stored HSL color, falls back to hardcoded map.
 */
export function getCategoryColor(name: string, dbColor?: string | null) {
  if (dbColor) {
    return {
      bg: 'bg-transparent',
      text: 'text-foreground',
      hex: `hsl(${dbColor})`,
      hsl: dbColor,
    };
  }
  const found = CATEGORY_COLORS[name];
  if (found) return { ...found, hsl: undefined };

  // Hash-based fallback for unknown categories
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const keys = Object.keys(CATEGORY_COLORS);
  const pick = CATEGORY_COLORS[keys[Math.abs(hash) % keys.length]];
  return { ...(pick || FALLBACK), hsl: undefined };
}

export function getCategoryHex(name: string, dbColor?: string | null): string {
  if (dbColor) return `hsl(${dbColor})`;
  return getCategoryColor(name).hex;
}
