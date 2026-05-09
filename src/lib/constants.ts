export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  bank: 'Bank Account',
  digital_wallet: 'Digital Wallet',
  cash: 'Cash',
  credit_card: 'Credit Card',
  debt: 'Debt / Liability',
  receivable: 'Receivable',
  investment: 'Investment',
  manual: 'Manual Account',
};

export const ACCOUNT_TYPE_ICONS: Record<string, string> = {
  bank: 'Landmark',
  digital_wallet: 'Wallet',
  cash: 'Banknote',
  credit_card: 'CreditCard',
  debt: 'TrendingDown',
  receivable: 'TrendingUp',
  investment: 'LineChart',
  manual: 'FileText',
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
};

export const LIABILITY_TYPES = ['debt', 'credit_card'];
export const ASSET_TYPES = ['bank', 'digital_wallet', 'cash', 'receivable', 'investment', 'manual'];

export const CURRENCIES = ['USD', 'ARS', 'EUR', 'GBP', 'BRL', 'MXN'];

export const formatCurrency = (amount: number, currency = 'USD'): string => {
  if (currency === 'ARS') {
    return '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(amount);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatUSD = (amount: number): string => formatCurrency(amount, 'USD');
