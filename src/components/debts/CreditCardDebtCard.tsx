import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, CreditCard } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useAccountBalances } from '@/hooks/useAccounts';

const CARD_LABELS: Record<string, string> = {
  visa_ciudad_mama: 'VISA Ciudad — Mamá',
  visa_ciudad_papa: 'VISA Ciudad — Papá',
  visa_santander:   'VISA Santander',
  amex:             'AMEX Santander',
};

function formatARS(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

export function CreditCardDebtCard() {
  const [openCuotas, setOpenCuotas] = useState(false);

  // Last settlement transaction (used for per-card balances + last update date)
  const { data: lastSettlement } = useQuery({
    queryKey: ['last-settlement-for-cards'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('date, notes')
        .ilike('description', '%Liquidación%')
        .ilike('description', '%viejo%')
        .not('notes', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Pending cuotas — scan transactions whose description matches "(Cuota X/Y)"
  const { data: cuotaTxs } = useQuery({
    queryKey: ['pending-cuotas'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, description, amount, currency, amount_usd')
        .ilike('description', '%cuota%')
        .order('date', { ascending: false })
        .limit(500);
      return data || [];
    },
  });

  // Accounts that have my_card_suffix set or are flagged as own card
  const { data: ownCardAccounts } = useQuery({
    queryKey: ['own-card-accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('accounts')
        .select('id, name, my_card_suffix, is_own_card, type')
        .eq('type', 'credit_card')
        .eq('is_active', true);
      return data || [];
    },
  });

  const { settlementParsed, settlementCardSubs } = useMemo(() => {
    if (!lastSettlement?.notes) return { settlementParsed: null, settlementCardSubs: {} as Record<string, number> };
    try {
      const p = JSON.parse(lastSettlement.notes);
      return { settlementParsed: p, settlementCardSubs: (p?.cardSubtotals || {}) as Record<string, number> };
    } catch { return { settlementParsed: null, settlementCardSubs: {} as Record<string, number> }; }
  }, [lastSettlement]);

  const cardBalances = useMemo(() => {
    const bd = settlementParsed?.breakdown || {};
    const subs = settlementCardSubs;
    const rows: { key: string; label: string; ars: number }[] = [];

    // 1) Per-account rows using my_card_suffix (preferred)
    const suffixesUsed = new Set<string>();
    for (const a of (ownCardAccounts || []) as any[]) {
      const suf = a.my_card_suffix as string | null;
      if (suf && subs[suf] != null) {
        suffixesUsed.add(suf);
        rows.push({
          key: `acct-${a.id}`,
          label: `${a.name} (tarjeta •••• ${suf})`,
          ars: Number(subs[suf] || 0),
        });
      } else if (a.is_own_card) {
        // Fallback to full balance — read computed balance separately would require another query;
        // for now use the legacy breakdown key if it loosely matches the account name.
        const guess = Object.keys(bd).find(k => a.name.toLowerCase().includes(k.replace(/_/g, ' ')));
        rows.push({
          key: `acct-${a.id}`,
          label: a.name,
          ars: guess ? Number(bd[guess] || 0) : 0,
        });
      }
    }

    // 2) Legacy fallback — show breakdown keys that aren't already covered by an account suffix
    Object.keys(CARD_LABELS).forEach(k => {
      const ars = Number(bd[k] || 0);
      if (ars > 0 && !rows.some(r => r.label.includes(CARD_LABELS[k]))) {
        rows.push({ key: k, label: CARD_LABELS[k], ars });
      }
    });

    return rows.filter(r => r.ars > 0);
  }, [settlementParsed, settlementCardSubs, ownCardAccounts]);

  const pendingCuotas = useMemo(() => {
    if (!cuotaTxs) return [];
    const re = /\(Cuota\s*(\d+)\/(\d+)\)/i;
    const seen = new Set<string>();
    const out: { id: string; description: string; remaining: number; amount: number; currency: string; date: string }[] = [];
    for (const t of cuotaTxs as any[]) {
      const desc: string = t.description || '';
      const m = desc.match(re);
      if (!m) continue;
      const x = parseInt(m[1], 10);
      const y = parseInt(m[2], 10);
      if (!Number.isFinite(x) || !Number.isFinite(y) || y <= x) continue;
      const cleanDesc = desc.replace(re, '').replace(/\s+/g, ' ').trim();
      // Dedupe by clean description (keep most recent occurrence with min remaining)
      const key = cleanDesc.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: t.id,
        description: cleanDesc,
        remaining: y - x,
        amount: Math.abs(Number(t.amount) || 0),
        currency: t.currency || 'ARS',
        date: t.date,
      });
    }
    return out.sort((a, b) => a.remaining - b.remaining);
  }, [cuotaTxs]);

  const totalARS = cardBalances.reduce((s, c) => s + c.ars, 0);
  const hasData = cardBalances.length > 0 || pendingCuotas.length > 0;

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <CreditCard className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Deuda en tarjetas</p>
            <p className="text-xs text-muted-foreground">
              {lastSettlement?.date
                ? <>Última actualización: <span className="capitalize">{format(new Date(lastSettlement.date + 'T12:00:00'), "d 'de' MMMM yyyy", { locale: es })}</span></>
                : 'Sin datos aún'}
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-5 space-y-4">
        {!hasData && (
          <p className="text-xs text-muted-foreground">Subí los PDFs de tarjeta para ver el resumen</p>
        )}

        {cardBalances.length > 0 && (
          <div className="rounded-xl border border-border/60 divide-y divide-border/60">
            {cardBalances.map(c => (
              <div key={c.key} className="flex items-center justify-between px-3 py-2.5">
                <p className="text-xs font-medium text-foreground">{c.label}</p>
                <p className="text-sm font-mono font-semibold text-foreground tabular-nums">
                  {formatARS(c.ars)}
                </p>
              </div>
            ))}
            {cardBalances.length > 1 && (
              <div className="flex items-center justify-between px-3 py-2.5 bg-muted/30">
                <p className="text-xs font-semibold text-foreground">Total</p>
                <p className="text-sm font-mono font-bold text-foreground tabular-nums">
                  {formatARS(totalARS)}
                </p>
              </div>
            )}
          </div>
        )}

        {pendingCuotas.length > 0 && (
          <Collapsible open={openCuotas} onOpenChange={setOpenCuotas}>
            <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-muted/40 hover:bg-muted/60 transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">Cuotas pendientes</span>
                <span className="text-[10px] text-muted-foreground">· {pendingCuotas.length}</span>
              </div>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', openCuotas && 'rotate-180')} />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-xl border border-border/60 divide-y divide-border/60">
                {pendingCuotas.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{c.description}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.remaining} {c.remaining === 1 ? 'cuota restante' : 'cuotas restantes'}
                      </p>
                    </div>
                    <p className="text-xs font-mono font-semibold text-foreground tabular-nums shrink-0">
                      {c.currency === 'ARS' ? formatARS(c.amount) : `${c.amount.toFixed(2)} ${c.currency}`}
                    </p>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}
