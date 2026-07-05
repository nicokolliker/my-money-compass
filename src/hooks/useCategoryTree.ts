import { useMemo } from 'react';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { useFxRates } from '@/hooks/useFxRates';
import { toMonthlyAmount, toUSD } from '@/lib/money';
import { DIGITAL_SUBTYPES } from '@/lib/digitalSubtypes';

// Categories that should never appear as budget/spending rows
export const SYSTEM_CATEGORIES = [
  'Ingresos Proyectados', 'Income', 'Ingresos',
  'Transfers', 'Transferencias', 'Transfer',
  'Debt / Loans', 'Debt', 'Loans',
];

// Digital subcategory names — derived from the shared taxonomy (single source of truth)
export const DIGITAL_SUBCATEGORIES = Object.values(DIGITAL_SUBTYPES).map(d => d.label);

export interface SubcategoryNode {
  id: string;
  name: string;
  category_id: string;
  recurringMonthly: number;
}

export interface CategoryNode {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number;
  isDigital: boolean;
  children: SubcategoryNode[];
  recurringMonthly: number;
}

export function useCategoryTree() {
  const { data: categories } = useCategories();
  const { data: allSubcategories } = useSubcategories();
  const { data: recurringItems } = useRecurringExpenses();
  const { data: fxRates } = useFxRates();

  const tree = useMemo((): CategoryNode[] => {
    if (!categories) return [];

    const visibleCategories = categories.filter(c => !SYSTEM_CATEGORIES.includes(c.name));

    return visibleCategories.map(cat => {
      const isDigital = cat.name === 'Digital';

      const catRecurring = (recurringItems || [])
        .filter(r => r.is_active && ((r as any).linked_category_id === cat.id || (r as any).category_id === cat.id));

      const monthlyUsd = (r: any) => {
        const amountUsd = toUSD(Math.abs(Number(r.amount)), r.currency || 'USD', fxRates as any);
        return toMonthlyAmount(amountUsd, r.frequency);
      };

      const children: SubcategoryNode[] = isDigital
        ? (allSubcategories || [])
            .filter(s => s.category_id === cat.id)
            .map(s => {
              // Sum recurring items whose digital subtype maps to this subcategory label
              const subLabel = (s.name || '').toLowerCase();
              const subRecurring = catRecurring
                .filter(r => {
                  const key = (r as any).subtype as string | null;
                  const label = key ? DIGITAL_SUBTYPES[key]?.label?.toLowerCase() : null;
                  return label === subLabel;
                })
                .reduce((sum, r) => sum + monthlyUsd(r), 0);
              return {
                id: s.id,
                name: s.name,
                category_id: s.category_id,
                recurringMonthly: subRecurring,
              };
            })
        : [];

      const recurringMonthly = catRecurring.reduce((sum, r) => sum + monthlyUsd(r), 0);

      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        sort_order: cat.sort_order ?? 99,
        isDigital,
        children,
        recurringMonthly,
      };
    }).sort((a, b) => a.sort_order - b.sort_order);
  }, [categories, allSubcategories, recurringItems, fxRates]);

  const totalRecurringMonthly = useMemo(
    () => tree.reduce((s, c) => s + c.recurringMonthly, 0),
    [tree]
  );

  return { tree, totalRecurringMonthly };
}
