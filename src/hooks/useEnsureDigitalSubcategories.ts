import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserId } from '@/hooks/useAuthUser';
import { DIGITAL_SUBTYPES, getDigitalSubtype } from '@/lib/digitalSubtypes';

const DIGITAL_SUB_LABELS = [
  'IA',
  'Creatividad & Productividad',
  'Entretenimiento',
  'Marketplace & Movilidad',
  'Otros',
];

// Session guard so we don't run on every render / route change.
const ranForUser = new Set<string>();

/**
 * On first load after login: ensure the Digital category has its 5 subcategories
 * seeded, then backfill subcategory_id on existing Digital transactions using
 * DIGITAL_NAME_MAP matching.
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

        // Seed missing
        const missing = DIGITAL_SUB_LABELS.filter(
          (l) => !existingByLabel.has(l.toLowerCase()),
        );
        if (missing.length) {
          const { data: inserted } = await supabase
            .from('subcategories')
            .insert(missing.map((name) => ({ category_id: digitalCat.id, name })))
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

        // Backfill: Digital transactions missing subcategory_id
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
