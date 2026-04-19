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
 */
export function useNetWorth() {
  const { data: accounts, isLoading } = useAccountBalances();

  return useMemo(() => {
    const list = accounts || [];
    const usd = (a: (typeof list)[number]) =>
      a.currency === 'USD' ? a.computed_balance : a.computed_balance_usd;

    const assets = list.filter(a => ASSET_TYPES.includes(a.type));
    const liabilities = list.filter(a => LIABILITY_TYPES.includes(a.type));

    const totalAssetsUsd = assets.reduce((s, a) => s + usd(a), 0);
    const totalLiabilitiesUsd = Math.abs(liabilities.reduce((s, a) => s + usd(a), 0));
    const netWorthUsd = totalAssetsUsd - totalLiabilitiesUsd;

    // Liquid cash = sum of asset accounts only (excludes debts/credit cards)
    const liquidCashUsd = totalAssetsUsd;

    return {
      isLoading,
      accounts: list,
      assets,
      liabilities,
      totalAssetsUsd,
      totalLiabilitiesUsd,
      netWorthUsd,
      liquidCashUsd,
    };
  }, [accounts, isLoading]);
}
