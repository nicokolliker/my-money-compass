import { Card, CardContent } from '@/components/ui/card';
import { Layers } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

function formatARS(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

const SOURCE_LABEL: Record<string, string> = {
  mama: 'Mamá',
  papa: 'Papá',
  sant: 'Santander',
};

type Row = {
  id: string;
  source: string;
  description: string;
  amount_ars: number;
  current_installment: number;
  total_installments: number;
  remaining_installments: number;
  settlement_month: string;
};

export function InstallmentDebtsCard() {
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

  const items = rows || [];
  const totalRemaining = items.reduce(
    (s, r) => s + Number(r.amount_ars) * r.remaining_installments,
    0,
  );

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
              Detectadas en la última liquidación
            </p>
          </div>
        </div>
      </div>

      <CardContent className="p-5 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">
            Sin cuotas pendientes ✓
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 divide-y divide-border/60">
              {items.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">
                      {r.description}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      <span className="font-mono">{formatARS(Number(r.amount_ars))}</span>
                      <span className="text-muted-foreground/70">/cuota · </span>
                      quedan {r.remaining_installments} de {r.total_installments}
                      <span className="text-muted-foreground/70"> · {SOURCE_LABEL[r.source] || r.source}</span>
                    </p>
                  </div>
                  <p className="text-xs font-mono font-semibold text-foreground tabular-nums shrink-0">
                    {formatARS(Number(r.amount_ars) * r.remaining_installments)}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-xl bg-muted/40 px-3 py-2.5 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">Total deuda en cuotas:</span>
              <span className="font-mono font-semibold text-foreground">
                {formatARS(totalRemaining)} ARS
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
