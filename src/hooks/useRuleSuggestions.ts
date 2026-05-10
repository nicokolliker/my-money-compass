import { useEffect, useMemo } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useRules } from '@/hooks/useRules';
import { useCategories } from '@/hooks/useCategories';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { useUserSettings, useUpsertUserSettings } from '@/hooks/useUserSettings';

export type SuggestionType = 'category' | 'recurring' | 'rule';

export interface RuleSuggestion {
  id: string;
  type: SuggestionType;
  merchant: string;
  message: string;
  count: number;
  // category-specific
  suggestedCategoryName?: string;
  suggestedCategoryId?: string;
  // recurring-specific
  avgAmount?: number;
  currency?: string;
}

export function inferCategoryName(name: string): string | null {
  const n = (name || '').toUpperCase();
  if (
    n.includes('NETFLIX') || n.includes('SPOTIFY') || n.includes('APPLE') ||
    n.includes('GOOGLE') || n.includes('YOUTUBE') || n.includes('CLARO') ||
    n.includes('STARLINK') || n.includes('OPENAI') || n.includes('CHATGPT')
  ) return 'Digital';
  if (n.includes('UBER') || n.includes('CABIFY') || n.includes('COPA') || n.includes('AERO')) return 'Travel';
  if (n.includes('RAPPI') || n.includes('PEDIDOSYA') || n.includes('MERPAGO*MELI')) return 'Ocio';
  if (n.includes('CARREFOUR') || n.includes('COTO') || n.includes('DISCO') || n.includes('JUMBO')) return 'Supermercado';
  if (n.includes('YPF') || n.includes('SHELL') || n.includes('AXION')) return 'Auto';
  if (n.includes('FARMACIA') || n.includes('DROGUERIA') || n.includes('FARMACITY')) return 'Salud';
  return null;
}

const IGNORED_KEY = 'ignored_suggestions';

export function getIgnoredSuggestions(): string[] {
  try { return JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]'); } catch { return []; }
}

export function ignoreSuggestion(id: string) {
  const list = getIgnoredSuggestions();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(IGNORED_KEY, JSON.stringify(list));
  }
}

export function useRuleSuggestions() {
  const { data: transactions } = useTransactions();
  const { data: rules } = useRules();
  const { data: categories } = useCategories();
  const { data: recurring } = useRecurringExpenses();

  return useMemo(() => {
    const ignored = new Set(getIgnoredSuggestions());
    const suggestions: RuleSuggestion[] = [];
    if (!transactions) return suggestions;

    const expenses = transactions.filter((t: any) => t.type === 'expense');

    // Group by merchant key
    type Group = { key: string; name: string; txs: any[]; months: Set<string>; amounts: number[]; hasCategory: boolean };
    const groups = new Map<string, Group>();
    for (const t of expenses) {
      const name = (t.merchant || t.description || '').trim();
      if (!name) continue;
      const key = name.toUpperCase();
      let g = groups.get(key);
      if (!g) { g = { key, name, txs: [], months: new Set(), amounts: [], hasCategory: false }; groups.set(key, g); }
      g.txs.push(t);
      g.months.add(t.date.slice(0, 7));
      g.amounts.push(Math.abs(Number(t.amount_usd)));
      if (t.category_id) g.hasCategory = true;
    }

    const findCategory = (name: string) => categories?.find(c => c.name.toLowerCase() === name.toLowerCase());

    // Tipo 1 — sin categoría, 3+ veces
    for (const g of groups.values()) {
      const uncategorized = g.txs.filter(t => !t.category_id);
      if (uncategorized.length >= 3) {
        const inferred = inferCategoryName(g.name);
        if (inferred) {
          const cat = findCategory(inferred);
          const id = `cat-${g.key}`;
          if (!ignored.has(id)) {
            suggestions.push({
              id, type: 'category', merchant: g.name, count: uncategorized.length,
              suggestedCategoryName: inferred, suggestedCategoryId: cat?.id,
              message: `${g.name} aparece ${uncategorized.length} veces sin categoría → sugerimos ${inferred}`,
            });
          }
        }
      }
    }

    // Tipo 2 — recurrente: 2+ meses con monto similar
    const recurringNames = new Set((recurring || []).map(r => r.name.toLowerCase()));
    for (const g of groups.values()) {
      if (g.months.size < 2) continue;
      if (recurringNames.has(g.name.toLowerCase())) continue;
      const mean = g.amounts.reduce((s, x) => s + x, 0) / g.amounts.length;
      if (mean <= 0) continue;
      const variance = g.amounts.reduce((s, x) => s + (x - mean) ** 2, 0) / g.amounts.length;
      const stddev = Math.sqrt(variance);
      if (stddev / mean < 0.2) {
        const id = `rec-${g.key}`;
        if (!ignored.has(id)) {
          suggestions.push({
            id, type: 'recurring', merchant: g.name, count: g.months.size,
            avgAmount: mean, currency: g.txs[0].currency,
            message: `${g.name} se repite en ${g.months.size} meses (~$${mean.toFixed(2)}) → ¿agregar a Recurrentes?`,
          });
        }
      }
    }

    // Tipo 3 — keyword frecuente sin regla
    for (const g of groups.values()) {
      if (g.txs.length < 5) continue;
      const hasRule = (rules || []).some((r: any) => g.key.includes(r.keyword.toUpperCase()));
      if (hasRule) continue;
      const id = `rule-${g.key}`;
      if (ignored.has(id)) continue;
      // Si ya hay una sugerencia de categoría para este mismo merchant, no agregar la de regla
      const alreadyHasCategorySuggestion = suggestions.some(s => s.type === 'category' && s.merchant === g.name);
      if (alreadyHasCategorySuggestion) continue;
      const inferred = inferCategoryName(g.name);
      const cat = inferred ? findCategory(inferred) : undefined;
      suggestions.push({
        id, type: 'rule', merchant: g.name, count: g.txs.length,
        suggestedCategoryName: inferred || undefined, suggestedCategoryId: cat?.id,
        message: `${g.name} aparece ${g.txs.length} veces sin regla → ¿crear regla automática?`,
      });
    }

    // de-dup: a single merchant can show as both category and rule. Keep highest priority (category).
    const seen = new Set<string>();
    const order: SuggestionType[] = ['category', 'recurring', 'rule'];
    return suggestions
      .sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))
      .filter(s => {
        const k = `${s.merchant}-${s.type}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }, [transactions, rules, categories, recurring]);
}
