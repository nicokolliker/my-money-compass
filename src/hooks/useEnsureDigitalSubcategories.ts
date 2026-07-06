import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserId } from '@/hooks/useAuthUser';
import {
  DIGITAL_SUBTYPES,
  DIGITAL_LEGACY_LABELS,
  getDigitalSubtype,
} from '@/lib/digitalSubtypes';

// Session guard so we don't run on every render / route change.
const ranForUser = new Set<string>();

/**
 * On first load after login:
 * 1. Self-heal legacy subcategory names (e.g. 'Delivery & Movilidad' →
 *    'Marketplace & Movilidad'): rename if the new one doesn't exist yet,
 *    or merge (re-point transactions, delete the old row) if both exist.
 * 2. Seed any missing Digital subcategories.
 * 3. Backfill subcategory_id on Digital transactions that don't have one,
 *    using the shared name matcher. Manual assignments are never touched
 *    (we only fill NULLs).
 */
export function useEnsureDigitalSubcategories() {
  const userId = useUserId();

  useEffect(() => {
    if (!userId || ranForUser.has(userId)) return;
    ranForUser.add(userId);

    (async () => {
      try {
        // Find Digital category for this user
        const { data: cats } = await supabase
          .from('categories')
          .select('id, name')
          .ilike('name', 'digital')
          .limit(1);
        const digitalCat = cats?.[0];
        if (!digitalCat) return;

        // Existing subs
        const { data: existingSubs } = await supabase
          .from('subcategories')
          .select('id, name')
          .eq('category_id', digitalCat.id);

        const existingByLabel = new Map<string, string>();
        for (const s of (existingSubs || []) as Array<{ id: string; name: string }>) {
          existingByLabel.set((s.name || '').toLowerCase(), s.id);
        }

        // --- Self-heal legacy renames ---
        for (const [legacyLower, newLabel] of Object.entries(DIGITAL_LEGACY_LABELS)) {
          const legacyId = existingByLabel.get(legacyLower);
          if (!legacyId) continue;
          const newId = existingByLabel.get(newLabel.toLowerCase());

          if (!newId) {
            // Simple rename in place — transactions keep pointing to the same id.
            await supabase
              .from('subcategories')
              .update({ name: newLabel })
              .eq('id', legacyId);
            existingByLabel.delete(legacyLower);
            existingByLabel.set(newLabel.toLowerCase(), legacyId);
          } else if (newId !== legacyId) {
            // Both exist → merge: move transactions to the new one, drop the old.
            await supabase
              .from('transactions')
              .update({ subcategory_id: newId })
              .eq('subcategory_id', legacyId);
            await supabase.from('subcategories').delete().eq('id', legacyId);
            existingByLabel.delete(legacyLower);
          }
        }

        // --- Seed missing (labels derived from the shared taxonomy) ---
        const wantedLabels = Object.values(DIGITAL_SUBTYPES).map((d) => d.label);
        const missing = wantedLabels.filter(
          (l) => !existingByLabel.has(l.toLowerCase()),
        );
        if (missing.length) {
          const { data: inserted } = await supabase
            .from('subcategories')
            .insert(missing.map((name) => ({ category_id: digitalCat.id, name, user_id: userId })))
            .select('id, name');
          for (const s of (inserted || []) as Array<{ id: string; name: string }>) {
            existingByLabel.set((s.name || '').toLowerCase(), s.id);
          }
        }

        // Build subtype-key -> subcategory_id map
        const keyToSubId: Record<string, string> = {};
        for (const [key, def] of Object.entries(DIGITAL_SUBTYPES)) {
          const id = existingByLabel.get(def.label.toLowerCase());
          if (id) keyToSubId[key] = id;
        }

        // --- Self-heal recurring_expenses.subtype ---
        // An older selector bug stored the subcategory UUID (or the label)
        // instead of the subtype key ('ia', 'entretenimiento', ...). Those
        // rows never aggregate into their Budget subcategory. Normalize them.
        try {
          const validKeys = new Set(Object.keys(DIGITAL_SUBTYPES));
          const labelToKey = new Map<string, string>();
          for (const [key, def] of Object.entries(DIGITAL_SUBTYPES)) {
            labelToKey.set(def.label.toLowerCase(), key);
          }
          const subIdToKey = new Map<string, string>();
          for (const [key, id] of Object.entries(keyToSubId)) {
            subIdToKey.set(id, key);
          }
          const { data: recs } = await supabase
            .from('recurring_expenses')
            .select('id, subtype')
            .eq('user_id', userId)
            .not('subtype', 'is', null);
          for (const r of (recs || []) as Array<{ id: string; subtype: string | null }>) {
            const st = (r.subtype || '').trim();
            if (!st || validKeys.has(st)) continue;
            const fixed = subIdToKey.get(st) || labelToKey.get(st.toLowerCase()) || null;
            if (fixed) {
              await supabase
                .from('recurring_expenses')
                .update({ subtype: fixed } as any)
                .eq('id', r.id);
            }
          }
        } catch (e) {
          console.warn('[useEnsureDigitalSubcategories] subtype heal failed', e);
        }

        // --- Self-heal recurring_expenses.subtype mismatches ---
        // Recurring items created via the "mark as recurring" dialog didn't
        // apply the same override logic as regular transactions (e.g. Amazon
        // Prime -> 'otros' vs the generic 'amazon' -> Marketplace match).
        // Recompute from the name and fix if it disagrees.
        try {
          const { data: digitalRecurrings } = await supabase
            .from('recurring_expenses')
            .select('id, name, subtype')
            .eq('category_id', digitalCat.id)
            .eq('user_id', userId);
          for (const r of (digitalRecurrings || []) as Array<{ id: string; name: string; subtype: string | null }>) {
            const correct = getDigitalSubtype(r.name);
            if (correct && correct !== r.subtype) {
              await supabase.from('recurring_expenses').update({ subtype: correct }).eq('id', r.id);
            }
          }
        } catch (e) {
          console.warn('[useEnsureDigitalSubcategories] recurring subtype heal failed', e);
        }

        // --- Backfill: Digital transactions missing subcategory_id ---
        const { data: txs } = await supabase
          .from('transactions')
          .select('id, merchant, description, subcategory_id')
          .eq('user_id', userId)
          .eq('category_id', digitalCat.id)
          .is('subcategory_id', null);

        if (!txs?.length) return;

        // Group ids by target subcategory_id for batch updates
        const byTarget = new Map<string, string[]>();
        for (const t of txs as Array<{ id: string; merchant: string | null; description: string | null }>) {
          const signal = `${t.merchant || ''} ${t.description || ''}`.trim();
          const key = getDigitalSubtype(signal);
          const subId = keyToSubId[key];
          if (!subId) continue;
          const arr = byTarget.get(subId) || [];
          arr.push(t.id);
          byTarget.set(subId, arr);
        }

        for (const [subId, ids] of byTarget) {
          // chunk to avoid huge IN lists
          for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            await supabase
              .from('transactions')
              .update({ subcategory_id: subId })
              .in('id', chunk);
          }
        }
      } catch (e) {
        console.warn('[useEnsureDigitalSubcategories] failed', e);
      }
    })();
  }, [userId]);
}
