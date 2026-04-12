// Consistent category color palette for pills, icons, and charts
export const CATEGORY_COLORS: Record<string, { bg: string; text: string; hex: string }> = {
  'Food & Drink': { bg: 'bg-orange-100', text: 'text-orange-700', hex: '#f97316' },
  'Transport': { bg: 'bg-blue-100', text: 'text-blue-700', hex: '#3b82f6' },
  'Housing': { bg: 'bg-violet-100', text: 'text-violet-700', hex: '#8b5cf6' },
  'Entertainment': { bg: 'bg-pink-100', text: 'text-pink-700', hex: '#ec4899' },
  'Shopping': { bg: 'bg-amber-100', text: 'text-amber-700', hex: '#f59e0b' },
  'Health': { bg: 'bg-emerald-100', text: 'text-emerald-700', hex: '#10b981' },
  'Education': { bg: 'bg-cyan-100', text: 'text-cyan-700', hex: '#06b6d4' },
  'Subscriptions': { bg: 'bg-indigo-100', text: 'text-indigo-700', hex: '#6366f1' },
  'Travel': { bg: 'bg-teal-100', text: 'text-teal-700', hex: '#14b8a6' },
  'Personal': { bg: 'bg-rose-100', text: 'text-rose-700', hex: '#f43f5e' },
  'Gifts': { bg: 'bg-fuchsia-100', text: 'text-fuchsia-700', hex: '#d946ef' },
  'Other': { bg: 'bg-slate-100', text: 'text-slate-600', hex: '#64748b' },
  'Uncategorized': { bg: 'bg-gray-100', text: 'text-gray-600', hex: '#9ca3af' },
  'Software': { bg: 'bg-indigo-100', text: 'text-indigo-700', hex: '#6366f1' },
  'Utilities': { bg: 'bg-sky-100', text: 'text-sky-700', hex: '#0ea5e9' },
  'Insurance': { bg: 'bg-lime-100', text: 'text-lime-700', hex: '#84cc16' },
  'Groceries': { bg: 'bg-green-100', text: 'text-green-700', hex: '#22c55e' },
};

const FALLBACK_COLORS = [
  { bg: 'bg-slate-100', text: 'text-slate-600', hex: '#64748b' },
  { bg: 'bg-stone-100', text: 'text-stone-600', hex: '#78716c' },
  { bg: 'bg-zinc-100', text: 'text-zinc-600', hex: '#71717a' },
];

export function getCategoryColor(name: string) {
  if (CATEGORY_COLORS[name]) return CATEGORY_COLORS[name];
  // Hash-based fallback
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export function getCategoryHex(name: string): string {
  return getCategoryColor(name).hex;
}
