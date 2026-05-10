import { useMemo } from 'react';
import { useAccountBalances } from '@/hooks/useAccounts';
import { ASSET_TYPES, LIABILITY_TYPES } from '@/lib/constants';

/**
 * SINGLE source of truth for net worth and aggregate balances.
 *
 * Every page that needs "total net worth" / "total assets" / "total liabilities" /
 * "available cash" MUST use this hook. Do not recompute these in components.
 *
 * All values are derived from `useAccountBalances`, which itself uses
 * `computeBalanceUsd(account, transactions)` — opening_balance + sum(tx).
 *
 * PR1: accounts with exclude_from_net_worth = true are filtered out before
 * any net worth computation. Use this for tracking accounts like "Viejo"
 * whose real cash impact is already captured elsewhere (Cash USD outflows).
 */
export function useNetWorth() {
  const { data: accounts, isLoading } = useAccountBalances();

  return useMemo(() => {
    const list = accounts || [];
    const usd = (a: (typeof list)[number]) =>
      a.currency === 'USD' ? a.computed_balance : a.computed_balance_usd;

    // Exclude tracking accounts that should not affect net worth
    const included = list.filter(a => !(a as any).exclude_from_net_worth);

    const assets      = included.filter(a => ASSET_TYPES.includes(a.type));
    const liabilities = included.filter(a => LIABILITY_TYPES.includes(a.type));

    const totalAssetsUsd      = assets.reduce((s, a) => s + usd(a), 0);
    const totalLiabilitiesUsd = Math.abs(liabilities.reduce((s, a) => s + usd(a), 0));
    const netWorthUsd         = totalAssetsUsd - totalLiabilitiesUsd;

    // Liquid cash = sum of asset accounts only (excludes debts/credit cards)
    const liquidCashUsd = totalAssetsUsd;

    return {
      isLoading,
      accounts: list,        // full list including excluded (for Accounts page display)
      assets,
      liabilities,
      totalAssetsUsd,
      totalLiabilitiesUsd,
      netWorthUsd,
      liquidCashUsd,
    };
  }, [accounts, isLoading]);
}
