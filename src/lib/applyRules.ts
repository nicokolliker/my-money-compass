import { supabase } from '@/integrations/supabase/client';

export interface RuleLite {
  keyword: string;
  match_field?: string | null;
  category_id: string | null;
}

/** Returns category_id for the first rule whose keyword is found in description/merchant. */
export function matchRuleCategory(
  rules: RuleLite[],
  description?: string | null,
  merchant?: string | null,
): string | null {
  if (!rules?.length) return null;
  const desc = (description || '').toLowerCase();
  const merch = (merchant || '').toLowerCase();
  for (const r of rules) {
    if (!r.keyword || !r.category_id) continue;
    const kw = r.keyword.toLowerCase().trim();
    if (!kw) continue;
    const field = (r.match_field || 'description').toLowerCase();
    const hay =
      field === 'merchant' ? merch :
      field === 'description' ? desc :
      `${merch} ${desc}`;
    if (hay.includes(kw)) return r.category_id;
  }
  return null;
}

/** Fetch all rules for the current user (RLS-scoped). */
export async function fetchUserRules(): Promise<RuleLite[]> {
  const { data, error } = await supabase
    .from('rules')
    .select('keyword, match_field, category_id');
  if (error) return [];
  return (data as RuleLite[]) || [];
}
