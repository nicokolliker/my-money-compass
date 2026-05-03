import { useMemo } from 'react';
import { useCategories, useSubcategories } from '@/hooks/useCategories';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { useFxRates } from '@/hooks/useFxRates';
import { toMonthlyAmount, toUSD } from '@/lib/money';

// Categories that should never appear as budget/spending rows
export const SYSTEM_CATEGORIES = [
  'Ingresos Proyectados', 'Income', 'Ingresos',
  'Transfers', 'Transferencias', 'Transfer',
  'Debt / Loans', 'Debt', 'Loans',
];

// Digital subcategory names
export const DIGITAL_SUBCATEGORIES = ['IA', 'Creatividad & Productividad', 'Entretenimiento', 'Delivery & Movilidad'];

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

      const children: SubcategoryNode[] = isDigital
        ? (allSubcategories || [])
            .filter(s => s.category_id === cat.id)
            .map(s => ({
              id: s.id,
              name: s.name,
              category_id: s.category_id,
              recurringMonthly: 0,
            }))
        : [];

      const recurringMonthly = (recurringItems || [])
        .filter(r => r.is_active && (r as any).linked_category_id === cat.id)
        .reduce((sum, r) => {
          const amountUsd = toUSD(Math.abs(Number(r.amount)), r.currency || 'USD', fxRates as any);
          return sum + toMonthlyAmount(amountUsd, r.frequency);
        }, 0);

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
