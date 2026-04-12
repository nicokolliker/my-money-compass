// Account type icon + color mapping
export const ACCOUNT_TYPE_STYLE: Record<string, { emoji: string; bg: string; text: string }> = {
  bank: { emoji: '🏦', bg: 'bg-blue-100', text: 'text-blue-700' },
  digital_wallet: { emoji: '📱', bg: 'bg-violet-100', text: 'text-violet-700' },
  cash: { emoji: '💵', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  credit_card: { emoji: '💳', bg: 'bg-orange-100', text: 'text-orange-700' },
  debt: { emoji: '📋', bg: 'bg-red-100', text: 'text-red-700' },
  receivable: { emoji: '📥', bg: 'bg-teal-100', text: 'text-teal-700' },
  investment: { emoji: '📈', bg: 'bg-amber-100', text: 'text-amber-700' },
  manual: { emoji: '✏️', bg: 'bg-gray-100', text: 'text-gray-700' },
};

export function getAccountStyle(type: string) {
  return ACCOUNT_TYPE_STYLE[type] || ACCOUNT_TYPE_STYLE.manual;
}
