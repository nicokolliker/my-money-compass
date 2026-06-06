import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useNavigate } from 'react-router-dom';

function formatARS(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function formatLongDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

export function CreditCardDebtCard() {
  const navigate = useNavigate();

  // 1) Resolve own-card account ids (used to scope the cuotas query)
  const { data: balances } = useAccountBalances();
  const ownCardAccountIds = useMemo(() => {
    const ids = (balances || [])
      .filter((acc: any) => (acc as any).is_own_card === true)
      .map((acc: any) => acc.id as string);
    return ids;
  }, [balances]);

  const hasOwnCards = ownCardAccountIds.length > 0;

  // 2) "Última actualización" from the most recent santander / banco_ciudad import
  const { data: lastImport } = useQuery({
    queryKey: ['last-card-statement-import'],
    queryFn: async () => {
      const { data } = await supabase
        .from('import_log')
        .select('source, imported_at, month')
        .in('source', ['santander', 'banco_ciudad'])
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // 3) Pending cuotas — scoped to own-card accounts
  const { data: cuotaTxs } = useQuery({
    queryKey: ['pending-cuotas-own-cards', ownCardAccountIds],
    queryFn: async () => {
      let q = supabase
        .from('transactions')
        .select('id, date, description, amount, currency, amount_usd, account_id')
        .ilike('description', '%cuota%')
        .order('date', { ascending: false })
        .limit(500);
      if (ownCardAccountIds.length > 0) {
        q = q.in('account_id', ownCardAccountIds);
      } else {
        // No own cards: return empty set
        q = q.eq('id', 'no-match');
      }
      const { data } = await q;
      return data || [];
    },
    enabled: hasOwnCards,
  });

  const pendingCuotas = useMemo(() => {
    if (!cuotaTxs) return [];
    const re = /\(Cuota\s*(\d+)\s*\/\s*(\d+)\)/i;
    const seen = new Map<string, { id: string; description: string; remaining: number; amount: number; currency: string; date: string }>();
    for (const t of cuotaTxs as any[]) {
      const desc: string = t.description || '';
      const m = desc.match(re);
      if (!m) continue;
      const x = parseInt(m[1], 10);
      const y = parseInt(m[2], 10);
      if (!Number.isFinite(x) || !Number.isFinite(y) || y <= x) continue;
      const cleanDesc = desc.replace(re, '').replace(/\s+/g, ' ').trim();
      const key = cleanDesc.toLowerCase();
      // Keep the most recent occurrence (already sorted desc by date)
      if (seen.has(key)) continue;
      seen.set(key, {
        id: t.id,
        description: cleanDesc,
        remaining: y - x,
        amount: Math.abs(Number(t.amount) || 0),
        currency: t.currency || 'ARS',
        date: t.date,
      });
    }
    return Array.from(seen.values()).sort((a, b) => a.remaining - b.remaining);
  }, [cuotaTxs]);

  const monthlyARS = pendingCuotas
    .filter((c) => c.currency === 'ARS')
    .reduce((s, c) => s + c.amount, 0);
  const monthlyOther = pendingCuotas.filter((c) => c.currency !== 'ARS');
  const longestRemaining = pendingCuotas.reduce((mx, c) => Math.max(mx, c.remaining), 0);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <Layers className="h-4 w-4 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Cuotas pendientes</p>
            <p className="text-xs text-muted-foreground">
              {lastImport?.imported_at
                ? <>Última actualización: {formatLongDate(lastImport.imported_at)}</>
                : 'Sin importaciones'}
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-5 space-y-3">
        {!hasOwnCards ? (
          <div className="text-center space-y-3">
            <p className="text-xs text-muted-foreground">
              Configurá tus tarjetas en Accounts → editar → Mi tarjeta personal
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate('/accounts')}>
              Ir a Accounts
            </Button>
          </div>
        ) : pendingCuotas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay cuotas pendientes detectadas en los resúmenes importados.
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 divide-y divide-border/60">
              {pendingCuotas.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{c.description}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {c.remaining} {c.remaining === 1 ? 'cuota restante' : 'cuotas restantes'}
                      {' · '}
                      <span className="font-mono">
                        {c.currency === 'ARS' ? formatARS(c.amount) : `${c.amount.toFixed(2)} ${c.currency}`}
                      </span>
                      <span className="text-muted-foreground/70">/mes</span>
                    </p>
                  </div>
                  <p className="text-xs font-mono font-semibold text-foreground tabular-nums shrink-0">
                    {c.currency === 'ARS'
                      ? formatARS(c.amount * c.remaining)
                      : `${(c.amount * c.remaining).toFixed(2)} ${c.currency}`}
                  </p>
                </div>
              ))}
            </div>

            {longestRemaining > 0 && (monthlyARS > 0 || monthlyOther.length > 0) && (
              <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-xs">
                <p className="text-foreground">
                  <span className="text-muted-foreground">Total comprometido: </span>
                  <span className="font-mono font-semibold">~{formatARS(monthlyARS)}</span>
                  {monthlyOther.length > 0 && (
                    <>
                      {' + '}
                      <span className="font-mono font-semibold">
                        {monthlyOther.reduce((s, c) => s + c.amount, 0).toFixed(2)} {monthlyOther[0].currency}
                      </span>
                    </>
                  )}
                  <span className="text-muted-foreground"> ARS/mes por los próximos {longestRemaining} {longestRemaining === 1 ? 'mes' : 'meses'}</span>
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
