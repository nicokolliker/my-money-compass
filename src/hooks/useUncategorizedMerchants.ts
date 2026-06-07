import { useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import { useIgnoredSuggestions, inferCategoryName } from '@/hooks/useRuleSuggestions';

export interface UncategorizedMerchant {
  id: string;             // ignore-key
  key: string;            // upper merchant key
  name: string;           // display name
  count: number;
  avgAmount: number;
  currency: string;
  txIds: string[];
  inferredCategoryId?: string;
  inferredCategoryName?: string;
}

/** Expenses without category, grouped by merchant, count >= minCount, ignored filtered. */
export function useUncategorizedMerchants(minCount = 2) {
  const { data: transactions } = useTransactions();
  const { data: categories } = useCategories();
  const { ids: ignoredIds } = useIgnoredSuggestions();

  return useMemo<UncategorizedMerchant[]>(() => {
    if (!transactions) return [];
    const ignored = new Set(ignoredIds);
    const groups = new Map<string, UncategorizedMerchant>();

    for (const t of transactions as any[]) {
      if (t.type !== 'expense') continue;
      if (t.category_id) continue;
      const name = (t.merchant || t.description || '').trim();
      if (!name) continue;
      const key = name.toUpperCase();
      let g = groups.get(key);
      if (!g) {
        g = {
          id: `uncat-${key}`,
          key,
          name,
          count: 0,
          avgAmount: 0,
          currency: t.currency || 'USD',
          txIds: [],
        };
        groups.set(key, g);
      }
      g.txIds.push(t.id);
      g.count += 1;
      g.avgAmount += Math.abs(Number(t.amount) || 0);
    }

    const findCategory = (name: string) =>
      categories?.find(c => c.name.toLowerCase() === name.toLowerCase());

    const out: UncategorizedMerchant[] = [];
    for (const g of groups.values()) {
      if (g.count < minCount) continue;
      if (ignored.has(g.id)) continue;
      g.avgAmount = g.avgAmount / g.count;
      const inferredName = inferCategoryName(g.name);
      if (inferredName) {
        const cat = findCategory(inferredName);
        g.inferredCategoryName = inferredName;
        g.inferredCategoryId = cat?.id;
      }
      out.push(g);
    }
    return out.sort((a, b) => b.count - a.count);
  }, [transactions, categories, ignoredIds]);
}
