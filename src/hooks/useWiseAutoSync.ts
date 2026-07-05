import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useUserId } from '@/hooks/useAuthUser';
import type { WiseSyncResult } from '@/hooks/useWiseSync';

const THROTTLE_MS = 20 * 60 * 60 * 1000; // ~1x per day

async function callWise(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke('wise-sync', {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message || 'Wise sync failed');
  if (data?.error) throw new Error(data.error);
  return data;
}

/**
 * Full sync sequence for EVERY currency that has a local "Wise" account
 * (USD, EUR, etc.) — profiles → balances → matching accounts → sync-transactions
 * per currency, aggregated into a single result. Self-contained.
 * Returns null when preconditions aren't met (no token, no Wise account at all).
 * Shared by the daily auto-sync and the manual "Sync Wise" button in Accounts.
 */
export async function performWiseSync(qc: QueryClient): Promise<WiseSyncResult | null> {
  // Local Wise accounts, any currency
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, currency')
    .eq('is_active', true);
  const wiseAccounts = (accounts || []).filter((a: any) => /wise/i.test(a.name));
  if (wiseAccounts.length === 0) return null;

  // Profile (uses server-stored token; throws if none configured)
  const profilesRes = await callWise('get-profiles');
  const profileId = profilesRes?.profiles?.[0]?.id;
  if (!profileId) return null;

  const balancesRes = await callWise('get-balances', { profileId });
  const balances: any[] = balancesRes?.balances || [];

  const aggregate: WiseSyncResult = {
    imported: 0,
    skipped: 0,
    total_fetched: 0,
    official_balance: null,
    sum_imported: 0,
    tx_count: 0,
    date_range: { start: null, end: null },
    reconciled: null,
    status: 'failed',
    diagnostics: [],
  };
  let ranAny = false;

  for (const acc of wiseAccounts) {
    const bal = balances.find(
      (b: any) => (b.currency || b.amount?.currency) === acc.currency,
    );
    if (!bal?.id) {
      aggregate.diagnostics.push(`Sin balance de Wise en ${acc.currency} — omitido.`);
      continue;
    }
    try {
      const r: WiseSyncResult = await callWise('sync-transactions', {
        profileId,
        balanceId: bal.id,
        accountId: acc.id,
        currency: acc.currency,
      });
      ranAny = true;
      aggregate.imported += r.imported || 0;
      aggregate.skipped += r.skipped || 0;
      aggregate.total_fetched += r.total_fetched || 0;
      aggregate.diagnostics.push(`${acc.currency}: ${r.imported} nuevas, ${r.skipped} ya existían.`, ...(r.diagnostics || []));
    } catch (e: any) {
      aggregate.diagnostics.push(`${acc.currency} falló: ${e.message}`);
    }
  }

  aggregate.status = ranAny ? 'success' : 'failed';

  qc.invalidateQueries({ queryKey: ['transactions'] });
  qc.invalidateQueries({ queryKey: ['account-balances'] });
  qc.invalidateQueries({ queryKey: ['accounts'] });
  qc.invalidateQueries({ queryKey: ['wise-sync-log'] });
  qc.invalidateQueries({ queryKey: ['merchants'] });
  qc.invalidateQueries({ queryKey: ['recurring-instances'] });
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.rpc('refresh_recurring_tracking', { p_user_id: user.id });
  } catch { /* non-fatal */ }

  return ranAny ? aggregate : null;
}

/**
 * Runs a silent Wise sync once per ~day on app load (localStorage throttle).
 * Only surfaces a toast when new transactions actually came in.
 */
export function useWiseAutoSync() {
  const userId = useUserId();
  const qc = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (!userId || started.current) return;
    started.current = true;

    const key = `wise-auto-sync-${userId}`;
    const last = Number(localStorage.getItem(key) || 0);
    if (Date.now() - last < THROTTLE_MS) return;

    (async () => {
      try {
        // Skip entirely if Wise was never connected (no token stored)
        const { data: settings } = await (supabase as any)
          .from('user_settings')
          .select('wise_token')
          .eq('user_id', userId)
          .maybeSingle();
        if (!settings?.wise_token) return;

        const result = await performWiseSync(qc);
        localStorage.setItem(key, String(Date.now()));
        if (result && result.imported > 0) {
          toast.success(`Wise: ${result.imported} transacciones nuevas`);
        }
      } catch (e) {
        // Silent — auto-sync must never interrupt the user.
        console.warn('[useWiseAutoSync]', e);
      }
    })();
  }, [userId, qc]);
}
