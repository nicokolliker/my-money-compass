/**
 * Canonical money & finance helpers.
 *
 * Single source of truth for:
 *   - currency conversion to USD
 *   - account balance derivation
 *   - recurring expense → monthly cost
 *   - recurring instance status semantics
 *
 * NEVER duplicate this logic in components. Always import from here.
 *
 * PR3 change: AccountForBalance now includes optional official_balance.
 * computeBalance and computeBalanceUsd use official_balance as the source
 * of truth when it is set — this is how statement-driven accounts (ARQ,
 * MercadoPago) reflect the real balance after a PDF/Excel import.
 */

// ---------- FX ----------

/**
 * Fallback rates used only when no FX rate row exists yet for a pair.
 * Real rates come from the fx_rates table (Bluelytics for ARS, manual otherwise).
 */
const FALLBACK_TO_USD: Record<string, number> = {
  USD: 1,
  ARS: 0.00072, // ~1390 ARS / USD (actualizado Mayo 2026)
  EUR: 1.08,
  GBP: 1.27,
  BRL: 0.20,
  MXN: 0.058,
};

export type FxRateRow = {
  from_currency: string;
  to_currency: string;
  rate: number;
  date: string;
};

/**
 * Convert an amount in `currency` to USD using the most recent rate
 * for that pair, falling back to the table above.
 */
export function toUSD(amount: number, currency: string, rates?: FxRateRow[] | null): number {
  if (!amount) return 0;
  if (currency === 'USD') return amount;
  const row = rates?.find(r => r.from_currency === currency && r.to_currency === 'USD');
  const rate = row?.rate ?? FALLBACK_TO_USD[currency] ?? 1;
  return amount * rate;
}

// ---------- Account balance ----------

export type AccountForBalance = {
  id: string;
  currency: string;
  opening_balance: number;
  /**
   * When set (non-null), this is the authoritative balance from the most
   * recently imported bank statement. computeBalance returns this value
   * directly, ignoring the transaction-derived sum.
   *
   * Set by the Import page after a successful ARQ / MercadoPago import.
   * Also set by sync-wise for Wise accounts.
   */
  official_balance?: number | null;
};

export type TxForBalance = {
  account_id: string;
  amount: number;
  amount_usd: number;
};

/**
 * Compute an account's native-currency balance.
 *
 * Priority:
 *  1. official_balance (set after statement import) — source of truth
 *  2. opening_balance + sum(transactions.amount)    — derived
 */
export function computeBalance(account: AccountForBalance, txs: TxForBalance[]): number {
  if (account.official_balance !== null && account.official_balance !== undefined) {
    return Number(account.official_balance);
  }
  const sum = txs
    .filter(t => t.account_id === account.id)
    .reduce((s, t) => s + Number(t.amount), 0);
  return Number(account.opening_balance) + sum;
}

/**
 * Compute an account's USD-equivalent balance.
 *
 * Priority:
 *  1. official_balance converted to USD (when set)
 *  2. opening_balance (converted) + sum(transactions.amount_usd)
 */
export function computeBalanceUsd(
  account: AccountForBalance,
  txs: TxForBalance[],
  rates?: FxRateRow[] | null,
): number {
  if (account.official_balance !== null && account.official_balance !== undefined) {
    return toUSD(Number(account.official_balance), account.currency, rates);
  }
  const openingUsd = toUSD(Number(account.opening_balance), account.currency, rates);
  const txSumUsd = txs
    .filter(t => t.account_id === account.id)
    .reduce((s, t) => s + Number(t.amount_usd), 0);
  return openingUsd + txSumUsd;
}

// ---------- Recurring ----------

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** Normalize any frequency amount to a monthly figure. */
export function toMonthlyAmount(amount: number, frequency: string): number {
  switch (frequency) {
    case 'weekly': return amount * 4.33;
    case 'quarterly': return amount / 3;
    case 'yearly': return amount / 12;
    default: return amount; // monthly
  }
}

// ---------- Recurring instance status ----------

export type InstanceStatus =
  | 'expected'
  | 'due_soon'
  | 'matched'
  | 'paid_manual'
  | 'overdue'
  | 'needs_review'
  | 'mismatch'
  | 'skipped';

export const INSTANCE_STATUS_META: Record<InstanceStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' | 'info' }> = {
  matched:      { label: 'Matched',      tone: 'success' },
  paid_manual:  { label: 'Paid',         tone: 'success' },
  due_soon:     { label: 'Due soon',     tone: 'warning' },
  overdue:      { label: 'Overdue',      tone: 'danger' },
  needs_review: { label: 'Needs review', tone: 'info' },
  mismatch:     { label: 'Mismatch',     tone: 'warning' },
  expected:     { label: 'Expected',     tone: 'muted' },
  skipped:      { label: 'Skipped',      tone: 'muted' },
};

export const TONE_CLASS: Record<'success' | 'warning' | 'danger' | 'muted' | 'info', string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  danger:  'bg-destructive/10 text-destructive border-destructive/30',
  info:    'bg-primary/10 text-primary border-primary/30',
  muted:   'bg-muted text-muted-foreground border-border',
};

export function isPaidStatus(s: string): boolean {
  return s === 'matched' || s === 'paid_manual';
}

// ---------- Derived instance state (single source of truth for UI) ----------

/**
 * Canonical product-level states. These drive ALL UI: Tracking, Calendar,
 * Planning, Dashboard, Analytics. No page is allowed to inspect raw DB
 * status — always go through `deriveInstanceState`.
 *
 *  upcoming     — expected payment in the future (or today)
 *  needs_review — a candidate transaction exists but confidence is low
 *  matched      — linked to a transaction by the matching engine
 *  paid_manual  — user manually marked as paid
 *  missing      — past expected date and no suitable matched transaction
 */
export type DerivedInstanceState =
  | 'upcoming'
  | 'needs_review'
  | 'matched'
  | 'paid_manual'
  | 'missing';

export type InstanceLike = {
  status: string;
  expected_date: string; // YYYY-MM-DD
  matched_transaction_id?: string | null;
};

/** Today as YYYY-MM-DD in local time. */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function deriveInstanceState(i: InstanceLike): DerivedInstanceState {
  if (i.status === 'matched' && i.matched_transaction_id) return 'matched';
  if (i.status === 'paid_manual') return 'paid_manual';
  if (i.status === 'needs_review') return 'needs_review';
  // Anything else (expected / due_soon / overdue / mismatch) without a tx:
  // past date with no match → missing; otherwise upcoming.
  if (i.expected_date < todayISO() && !i.matched_transaction_id) return 'missing';
  return 'upcoming';
}

export const DERIVED_STATE_META: Record<DerivedInstanceState, { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' | 'info' }> = {
  matched:      { label: 'Matched',      tone: 'success' },
  paid_manual:  { label: 'Paid',         tone: 'success' },
  upcoming:     { label: 'Upcoming',     tone: 'muted' },
  needs_review: { label: 'Needs review', tone: 'info' },
  missing:      { label: 'Missing',      tone: 'danger' },
};

export function isDerivedPaid(s: DerivedInstanceState): boolean {
  return s === 'matched' || s === 'paid_manual';
}
