import { useEffect, useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useCategories } from '@/hooks/useCategories';
import {
  useIgnoredSuggestions,
  useAiInferenceVersion,
} from '@/hooks/useRuleSuggestions';
import {
  getCachedInferredCategory,
  inferCategoryAI,
} from '@/lib/aiCategoryInference';

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
  const aiVersion = useAiInferenceVersion();

  const categoryNames = useMemo(
    () => (categories || []).map((c) => c.name),
    [categories],
  );

  // Group uncategorized expenses by merchant.
  const baseGroups = useMemo(() => {
    const groups = new Map<string, UncategorizedMerchant>();
    if (!transactions) return groups;
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
    return groups;
  }, [transactions]);

  // Kick off AI inference for merchants past the threshold.
  useEffect(() => {
    if (categoryNames.length === 0) return;
    for (const g of baseGroups.values()) {
      if (g.count < minCount) continue;
      if (getCachedInferredCategory(g.name) !== undefined) continue;
      void inferCategoryAI(g.name, categoryNames);
    }
  }, [baseGroups, categoryNames, minCount]);

  return useMemo<UncategorizedMerchant[]>(() => {
    const ignored = new Set(ignoredIds);
    const findCategory = (name: string) =>
      categories?.find((c) => c.name.toLowerCase() === name.toLowerCase());

    const out: UncategorizedMerchant[] = [];
    for (const g of baseGroups.values()) {
      if (g.count < minCount) continue;
      if (ignored.has(g.id)) continue;
      const m: UncategorizedMerchant = {
        ...g,
        avgAmount: g.avgAmount / g.count,
      };
      const cached = getCachedInferredCategory(m.name);
      const inferredName = cached === undefined ? null : cached;
      if (inferredName) {
        const cat = findCategory(inferredName);
        m.inferredCategoryName = inferredName;
        m.inferredCategoryId = cat?.id;
      }
      out.push(m);
    }
    return out.sort((a, b) => b.count - a.count);
    // aiVersion forces recompute when AI cache updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseGroups, categories, ignoredIds, minCount, aiVersion]);
}
