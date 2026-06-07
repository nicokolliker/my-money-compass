import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Download, History } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/constants';
import { MerchantLogo } from '@/components/MerchantLogo';
import { downloadSettlementPdf } from '@/lib/settlementPdf';
import { useImportLog } from '@/hooks/useImportLog';

const CARD_KEYS = ['visa_ciudad_mama', 'visa_ciudad_papa', 'visa_santander'];

const ITEM_META: Record<string, { label: string }> = {
  visa_ciudad_mama: { label: 'VISA Ciudad — Mamá' },
  visa_ciudad_papa: { label: 'VISA Ciudad — Papá' },
  visa_santander:   { label: 'VISA Santander' },
  expensas: { label: 'Expensas' },
  prestamo: { label: 'Préstamo' },
  cochera:  { label: 'Cochera' },
  patente:  { label: 'Patente' },
  multa:    { label: 'Multa' },
};

type HistoryRow = {
  id: string;
  date: string; // yyyy-mm-dd
  kind: 'viejo' | 'splitwise';
  title: string;
  subtitle?: string;
  amountUsd?: number;
  count?: number;
  parsed?: any;
  tx?: any;
};

export function UnifiedCycleHistory({ onRowClick }: { onRowClick?: (row: { parsed: any; monthLabel: string; tx: any }) => void }) {
  const [open, setOpen] = useState(false);
  const { data: importLog } = useImportLog();

  const { data: liqs } = useQuery({
    queryKey: ['liquidacion-history-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, description, amount_usd, notes')
        .ilike('description', '%Liquidación%')
        .ilike('description', '%viejo%')
        .order('date', { ascending: false });
      return data || [];
    },
  });

  const rows = useMemo<HistoryRow[]>(() => {
    const out: HistoryRow[] = [];

    // Viejo settlements
    for (const tx of (liqs || []) as any[]) {
      let parsed: any = null;
      try { parsed = tx.notes ? JSON.parse(tx.notes) : null; } catch {}
      const month: string = parsed?.month || (typeof tx.date === 'string' ? tx.date.slice(0, 7) : '');
      const monthLabel = month
        ? format(new Date(month + '-01T12:00:00'), 'MMMM yyyy', { locale: es })
        : 'Liquidación';
      out.push({
        id: `viejo-${tx.id}`,
        date: tx.date,
        kind: 'viejo',
        title: `Liquidación Viejo — ${monthLabel}`,
        amountUsd: Math.abs(Number(tx.amount_usd) || 0),
        parsed,
        tx,
      });
    }

    // Splitwise imports
    for (const l of (importLog || []) as any[]) {
      if (l.source !== 'splitwise') continue;
      const date = (l.imported_at || '').slice(0, 10) || (l.month ? l.month + '-01' : '');
      if (!date) continue;
      out.push({
        id: `sw-${l.id || `${l.month}-${l.imported_at}`}`,
        date,
        kind: 'splitwise',
        title: `Import Splitwise — ${l.month || ''}`.trim(),
        count: Number(l.transaction_count || 0),
      });
    }

    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [liqs, importLog]);

  function downloadPdfFor(row: HistoryRow) {
    if (row.kind !== 'viejo' || !row.parsed) return;
    const p = row.parsed;
    const ym: string = p.month || row.date.slice(0, 7);
    const monthLabel = format(new Date(ym + '-01T00:00:00'), 'MMMM yyyy', { locale: es });
    const breakdown: Record<string, number> = p.breakdown || {};
    const manualItems: any[] = Object.entries(breakdown)
      .filter(([k, v]) => !CARD_KEYS.includes(k) && Number(v) > 0)
      .map(([k, v]) => ({ label: ITEM_META[k]?.label || k, amountARS: Number(v) }));
    if (Array.isArray(p.extras)) {
      for (const e of p.extras) manualItems.push({ label: e.label, amountARS: e.amountARS, categoryName: e.categoryName });
    }
    const sumBreakdown = Object.values(breakdown).reduce((s: number, v) => s + Number(v || 0), 0);
    const sumExtras = (p.extras || []).reduce((s: number, e: any) => s + Number(e.amountARS || 0), 0);
    const totalARS = Number(p.totalARS) > 0 ? Number(p.totalARS) : (sumBreakdown + sumExtras);
    void downloadSettlementPdf({
      monthLabel,
      mamaRows: p.mamaRows || [],
      papaRows: p.papaRows || [],
      santRows: p.santRows || [],
      manualItems,
      categoryBreakdown: p.categoryBreakdown || undefined,
      totalARS,
      tcBlue: Number(p.tcBlue) || 0,
      usdAPagar: Number(p.usdPagado) || Math.abs(Number(row.tx?.amount_usd) || 0),
      vueltoARS: Number(p.vueltoARS) || 0,
    }, `liquidacion-${ym}.pdf`);
  }

  return (
    <Card className="rounded-2xl overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <History className="h-4 w-4 text-foreground" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">Historial de ciclos</p>
              <p className="text-xs text-muted-foreground">
                {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
              </p>
            </div>
          </div>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="p-0">
            <div className="border-t border-border/50 divide-y divide-border/50">
              {rows.length === 0 && (
                <div className="px-5 py-6 text-center text-xs text-muted-foreground">
                  Sin registros aún.
                </div>
              )}
              {rows.map((r) => {
                const clickable = r.kind === 'viejo' && !!onRowClick;
                const ym = r.parsed?.month || r.date.slice(0, 7);
                return (
                  <div
                    key={r.id}
                    className={cn(
                      'flex items-center gap-3 px-5 py-3 transition-colors',
                      clickable && 'cursor-pointer hover:bg-muted/30',
                    )}
                    onClick={clickable
                      ? () => onRowClick?.({
                          parsed: r.parsed || { month: ym },
                          monthLabel: format(new Date(ym + '-01T12:00:00'), 'MMMM yyyy', { locale: es }),
                          tx: r.tx,
                        })
                      : undefined}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {r.kind === 'viejo' ? (
                        <span className="text-base leading-none">👴</span>
                      ) : (
                        <MerchantLogo name="Splitwise" domain="splitwise.com" size={28} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate capitalize">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(r.date + 'T12:00:00'), "d 'de' MMM yyyy", { locale: es })}
                        {r.count != null && ` · ${r.count} movs`}
                      </p>
                    </div>
                    {r.amountUsd != null && r.amountUsd > 0 && (
                      <p className="text-sm font-mono font-semibold text-foreground tabular-nums shrink-0">
                        {formatUSD(r.amountUsd)}
                      </p>
                    )}
                    {r.kind === 'viejo' && r.parsed ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={(e) => { e.stopPropagation(); downloadPdfFor(r); }}
                        title="Descargar PDF"
                        aria-label="Descargar PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <span className="w-7 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
