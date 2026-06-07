import { supabase } from '@/integrations/supabase/client';
import { DIGITAL_SUBTYPES, getDigitalSubtype } from './digitalSubtypes';

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

// ---------- Digital subcategory resolution ----------

export interface DigitalSubcatMap {
  digitalCategoryId: string | null;
  /** lowercase subcategory label -> subcategory id */
  byLabel: Record<string, string>;
}

/** Look up the Digital category and its subcategories so callers can map subtypes -> subcategory_id. */
export async function fetchDigitalSubcatMap(): Promise<DigitalSubcatMap> {
  const { data: cats } = await supabase
    .from('categories')
    .select('id, name')
    .ilike('name', 'digital')
    .limit(1);
  const digitalCategoryId = (cats && cats[0]?.id) || null;
  if (!digitalCategoryId) return { digitalCategoryId: null, byLabel: {} };
  const { data: subs } = await supabase
    .from('subcategories')
    .select('id, name')
    .eq('category_id', digitalCategoryId);
  const byLabel: Record<string, string> = {};
  for (const s of (subs || []) as Array<{ id: string; name: string }>) {
    byLabel[(s.name || '').toLowerCase()] = s.id;
  }
  return { digitalCategoryId, byLabel };
}

/**
 * If categoryId is the Digital category, infer the digital subtype from the
 * given name signal (merchant/description) and return the matching subcategory_id.
 * Returns null otherwise.
 */
export function resolveDigitalSubcategoryId(
  categoryId: string | null,
  signal: string,
  map: DigitalSubcatMap,
): string | null {
  if (!categoryId || !map.digitalCategoryId || categoryId !== map.digitalCategoryId) return null;
  const key = getDigitalSubtype(signal);
  const label = DIGITAL_SUBTYPES[key]?.label;
  if (!label) return null;
  return map.byLabel[label.toLowerCase()] || null;
}
