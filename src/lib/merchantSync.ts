import { supabase } from '@/integrations/supabase/client';

/**
 * After a successful import, ensure every merchant name in the batch exists
 * in the `merchants` table so the Merchants page builds itself over time and
 * `default_category_id` can be leveraged for future categorization.
 *
 * - Dedupes by lowercase name against existing rows (RLS-scoped).
 * - Non-fatal: failures are swallowed (import already succeeded).
 * - Returns the number of merchants created.
 */
export async function syncMerchantsFromImport(
  userId: string,
  rows: Array<{
    merchant?: string | null;
    description?: string | null;
    category_id?: string | null;
  }>,
): Promise<number> {
  try {
    const wanted = new Map<string, { name: string; category_id: string | null }>();
    for (const r of rows) {
      const raw = (r.merchant || r.description || '').trim();
      if (!raw || raw.length < 2) continue;
      const key = raw.toLowerCase();
      if (!wanted.has(key)) {
        wanted.set(key, { name: raw, category_id: r.category_id ?? null });
      }
    }
    if (wanted.size === 0) return 0;

    const { data: existing } = await supabase.from('merchants').select('name');
    const have = new Set(
      ((existing || []) as Array<{ name: string }>).map((m) =>
        (m.name || '').toLowerCase(),
      ),
    );

    const toInsert = [...wanted.values()]
      .filter((w) => !have.has(w.name.toLowerCase()))
      .map((w) => ({
        user_id: userId,
        name: w.name,
        default_category_id: w.category_id,
      }));

    if (toInsert.length === 0) return 0;
    const { error } = await supabase.from('merchants').insert(toInsert);
    if (error) return 0;
    return toInsert.length;
  } catch {
    return 0;
  }
}
