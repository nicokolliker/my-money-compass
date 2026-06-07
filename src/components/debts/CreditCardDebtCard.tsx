import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function formatARS(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function formatLongDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return format(date, "d 'de' MMMM 'de' yyyy", { locale: es });
}

type Row = {
  id: string;
  source: string;
  description: string;
  amount_ars: number;
  current_installment: number;
  total_installments: number;
  remaining_installments: number;
};

export function CreditCardDebtCard() {
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

  const { data: rows } = useQuery<Row[]>({
    queryKey: ['installment-debts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('installment_debts' as any)
        .select('*')
        .gt('remaining_installments', 0)
        .order('remaining_installments', { ascending: true });
      return (data as any) || [];
    },
  });

  const pendingCuotas = useMemo(() => {
    return (rows || []).map((r) => ({
      id: r.id,
      description: r.description,
      remaining: r.remaining_installments,
      amount: Number(r.amount_ars) || 0,
      currency: 'ARS',
    }));
  }, [rows]);

  const monthlyARS = pendingCuotas.reduce((s, c) => s + c.amount, 0);
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
        {pendingCuotas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            Sin cuotas pendientes ✓
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
                      <span className="font-mono">{formatARS(c.amount)}</span>
                      <span className="text-muted-foreground/70">/mes</span>
                    </p>
                  </div>
                  <p className="text-xs font-mono font-semibold text-foreground tabular-nums shrink-0">
                    {formatARS(c.amount * c.remaining)}
                  </p>
                </div>
              ))}
            </div>

            {longestRemaining > 0 && monthlyARS > 0 && (
              <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-xs">
                <p className="text-foreground">
                  <span className="text-muted-foreground">Total comprometido: </span>
                  <span className="font-mono font-semibold">~{formatARS(monthlyARS)}</span>
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
