import { supabase } from '@/integrations/supabase/client';

/** Wise/state suffixes that are transaction states, not part of the merchant name. */
const STATE_SUFFIX_RE = /\s*[—–-]\s*(pending|withdrawn|moved|reversed|cancelled|declined)\s*$/i;

/** Names that are transfer/settlement artifacts, never real merchants. */
const BLOCKLIST_RE = /^(to\s+[a-z]{3}|liquidaci[oó]n\b.*|transferencia\b.*|balance cashback)$/i;

/**
 * Normalize a raw transaction description into a merchant name:
 * strips state suffixes ("Amazon — Pending" → "Amazon"), collapses
 * whitespace. Returns null when the result is empty or a known
 * transfer artifact.
 */
export function normalizeMerchantName(raw: string | null | undefined): string | null {
  let n = (raw || '').trim().replace(/\s+/g, ' ');
  n = n.replace(STATE_SUFFIX_RE, '').trim();
  if (n.length < 2) return null;
  if (BLOCKLIST_RE.test(n)) return null;
  return n;
}

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
      const name = normalizeMerchantName(r.merchant || r.description);
      if (!name) continue;
      const key = name.toLowerCase();
      if (!wanted.has(key)) {
        wanted.set(key, { name, category_id: r.category_id ?? null });
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


/**
 * Remove merchants whose name is just a state-suffixed or artifact variant
 * of the normalized form (e.g. "Amazon — Pending" when "Amazon" exists, or
 * "To USD — Moved"). Safe: transactions reference merchants by text name,
 * so deleting these rows loses nothing. Returns number of rows deleted.
 */
export async function cleanupMerchantArtifacts(): Promise<number> {
  try {
    const { data: merchants } = await supabase
      .from('merchants')
      .select('id, name');
    const list = (merchants || []) as Array<{ id: string; name: string }>;
    const byNorm = new Map<string, Array<{ id: string; name: string }>>();
    const toDelete: string[] = [];

    for (const m of list) {
      const norm = normalizeMerchantName(m.name);
      if (!norm) { toDelete.push(m.id); continue; } // pure artifact (e.g. "To USD — Moved")
      const key = norm.toLowerCase();
      const arr = byNorm.get(key) || [];
      arr.push(m);
      byNorm.set(key, arr);
    }

    // Within each normalized group, keep the clean-named row and drop suffixed variants.
    for (const [key, group] of byNorm) {
      if (group.length < 2) continue;
      const clean = group.find(m => m.name.toLowerCase() === key);
      if (!clean) continue;
      for (const m of group) {
        if (m.id !== clean.id) toDelete.push(m.id);
      }
    }

    if (toDelete.length === 0) return 0;
    const { error } = await supabase.from('merchants').delete().in('id', toDelete);
    if (error) return 0;
    return toDelete.length;
  } catch {
    return 0;
  }
}
