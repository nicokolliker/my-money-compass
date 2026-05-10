import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, CreditCard, Layers } from 'lucide-react';
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

// Format like: "31 de julio de 2026" (lowercase month, no capitalize-each-word)
function formatLongDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : d;
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

export function CreditCardDebtCard() {
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

  const { data: balances } = useAccountBalances();
  const ownCardAccounts = useMemo(
    () => (balances || []).filter((a: any) => a.type === 'credit_card' && a.is_own_card && a.is_active !== false),
    [balances]
  );

  const { settlementParsed, settlementCardSubs } = useMemo(() => {
    if (!lastSettlement?.notes) return { settlementParsed: null, settlementCardSubs: {} as Record<string, number> };
    try {
      const p = JSON.parse(lastSettlement.notes);
      return { settlementParsed: p, settlementCardSubs: (p?.cardSubtotals || {}) as Record<string, number> };
    } catch { return { settlementParsed: null, settlementCardSubs: {} as Record<string, number> }; }
  }, [lastSettlement]);

  type Row = { key: string; name: string; suffix?: string; ars: number; note?: string };

  const cardBalances = useMemo<Row[]>(() => {
    const subs = settlementCardSubs;
    const rows: Row[] = [];

    if (ownCardAccounts.length > 0) {
      for (const a of ownCardAccounts as any[]) {
        const suf = a.my_card_suffix as string | null;
        if (suf && subs[suf] != null) {
          rows.push({ key: `acct-${a.id}`, name: a.name, suffix: suf, ars: Number(subs[suf] || 0) });
        } else {
          const bal = Math.abs(Number(a.computed_balance) || 0);
          rows.push({ key: `acct-${a.id}`, name: a.name, ars: bal, note: 'tarjeta completa' });
        }
      }
    } else {
      // Legacy fallback: derive from settlement breakdown
      const bd = (settlementParsed?.breakdown || {}) as Record<string, number>;
      Object.keys(CARD_LABELS).forEach((k) => {
        const ars = Number(bd[k] || 0);
        if (ars > 0) rows.push({ key: k, name: CARD_LABELS[k], ars });
      });
    }

    return rows.filter((r) => r.ars > 0);
  }, [settlementCardSubs, ownCardAccounts, settlementParsed]);

  const totalARS = cardBalances.reduce((s, c) => s + c.ars, 0);
  const noOwnConfigured = ownCardAccounts.length === 0;
  const someMissingSuffix = ownCardAccounts.some((a: any) => !a.my_card_suffix);

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
                ? <>Última actualización: {formatLongDate(lastSettlement.date)}</>
                : 'Sin datos aún'}
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-5 space-y-3">
        {cardBalances.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Subí los PDFs de tarjeta para ver el resumen
          </p>
        ) : (
          <div className="rounded-xl border border-border/60 divide-y divide-border/60">
            {cardBalances.map((c) => (
              <div key={c.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                  {c.note && <p className="text-[10px] text-muted-foreground">({c.note})</p>}
                </div>
                <p className="text-[11px] font-mono text-muted-foreground tabular-nums">
                  {c.suffix ? `····${c.suffix}` : ''}
                </p>
                <p className="text-sm font-mono font-semibold text-foreground tabular-nums">
                  {formatARS(c.ars)}
                </p>
              </div>
            ))}
            {cardBalances.length >= 2 && (
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 bg-muted/30">
                <p className="text-xs font-semibold text-foreground">Total</p>
                <span />
                <p className="text-sm font-mono font-bold text-foreground tabular-nums">
                  {formatARS(totalARS)}
                </p>
              </div>
            )}
          </div>
        )}

        {(noOwnConfigured || someMissingSuffix) && (
          <p className="text-[10px] text-muted-foreground/80 italic">
            {noOwnConfigured
              ? 'Configurá tus tarjetas en Accounts → "Mi tarjeta personal" para ver tus saldos individuales.'
              : 'Algunas tarjetas no tienen los últimos 4 dígitos configurados. Editá la cuenta para personalizar.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Pending installments (cuotas) — separate card
// ============================================================================
export function PendingInstallmentsCard() {
  const [open, setOpen] = useState(true);

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

  if (pendingCuotas.length === 0) return null;

  return (
    <Card className="rounded-2xl overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <Layers className="h-4 w-4 text-foreground" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Cuotas pendientes</p>
              <p className="text-xs text-muted-foreground">{pendingCuotas.length} {pendingCuotas.length === 1 ? 'compra' : 'compras'} en curso</p>
            </div>
          </div>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5">
            <div className="rounded-xl border border-border/60 divide-y divide-border/60">
              {pendingCuotas.map((c) => (
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
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
