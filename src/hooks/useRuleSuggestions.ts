import { useEffect, useMemo, useState } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useRules } from '@/hooks/useRules';
import { useCategories } from '@/hooks/useCategories';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { useUserSettings, useUpsertUserSettings } from '@/hooks/useUserSettings';
import {
  getCachedInferredCategory,
  inferCategoryAI,
  subscribeInferredCategory,
} from '@/lib/aiCategoryInference';

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

/**
 * @deprecated Synchronous keyword fallback. Prefer `inferCategoryAI` from
 * `@/lib/aiCategoryInference` for new code. Kept so legacy callers
 * (e.g. ViejoSettlementWizard) continue to compile.
 */
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

/**
 * Subscribe to AI inference cache updates so dependent hooks re-render
 * when new merchant classifications arrive.
 */
export function useAiInferenceVersion() {
  const [v, setV] = useState(0);
  useEffect(() => subscribeInferredCategory(() => setV((x) => x + 1)), []);
  return v;
}

const IGNORED_KEY = 'ignored_suggestions';

/** @deprecated reads localStorage only — kept as a fallback during migration. */
export function getIgnoredSuggestions(): string[] {
  try { return JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]'); } catch { return []; }
}

/**
 * Persist a dismissed suggestion. Reads the current list from Supabase
 * (user_settings.ignored_suggestion_ids) and appends to it.
 */
export async function ignoreSuggestionRemote(
  id: string,
  current: string[],
  upsert: (patch: { ignored_suggestion_ids: string[] }) => Promise<unknown> | unknown,
) {
  if (current.includes(id)) return current;
  const next = [...current, id];
  await upsert({ ignored_suggestion_ids: next });
  return next;
}

/** @deprecated localStorage-only writer. Use ignoreSuggestionRemote instead. */
export function ignoreSuggestion(id: string) {
  const list = getIgnoredSuggestions();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(IGNORED_KEY, JSON.stringify(list));
  }
}

export function useIgnoredSuggestions() {
  const { data: settings } = useUserSettings();
  const upsert = useUpsertUserSettings();
  const remoteIds = useMemo(
    () => (Array.isArray(settings?.ignored_suggestion_ids) ? (settings!.ignored_suggestion_ids as string[]) : []),
    [settings?.ignored_suggestion_ids],
  );

  // One-time migration: move localStorage entries into Supabase, then clear LS.
  useEffect(() => {
    if (!settings) return;
    const legacy = getIgnoredSuggestions();
    if (legacy.length === 0) return;
    const merged = Array.from(new Set([...remoteIds, ...legacy]));
    if (merged.length === remoteIds.length) {
      localStorage.removeItem(IGNORED_KEY);
      return;
    }
    upsert.mutate(
      { ignored_suggestion_ids: merged } as any,
      { onSuccess: () => localStorage.removeItem(IGNORED_KEY) },
    );
  }, [settings, remoteIds, upsert]);

  return {
    ids: remoteIds,
    ignore: (id: string) => {
      if (remoteIds.includes(id)) return;
      upsert.mutate({ ignored_suggestion_ids: [...remoteIds, id] } as any);
    },
  };
}

export function useRuleSuggestions() {
  const { data: transactions } = useTransactions();
  const { data: rules } = useRules();
  const { data: categories } = useCategories();
  const { data: recurring } = useRecurringExpenses();
  const { ids: ignoredIds } = useIgnoredSuggestions();

  return useMemo(() => {
    const ignored = new Set(ignoredIds);
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
