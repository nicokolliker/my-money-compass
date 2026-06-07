import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD } from '@/lib/constants';
import { downloadSettlementPdf } from '@/lib/settlementPdf';

export function formatARS(n: number): string {
  if (!n && n !== 0) return '';
  return '$' + Math.round(n).toLocaleString('es-AR');
}

export const ITEM_META: Record<string, { label: string; emoji: string }> = {
  visa_ciudad: { label: 'VISA Ciudad', emoji: '🏦' },
  visa_ciudad_mama: { label: 'VISA Ciudad — Mamá', emoji: '🏦' },
  visa_ciudad_papa: { label: 'VISA Ciudad — Papá', emoji: '🏦' },
  visa_santander: { label: 'VISA Santander', emoji: '🏦' },
  expensas: { label: 'Expensas', emoji: '🏠' },
  prestamo: { label: 'Préstamo + Seguro', emoji: '🚗' },
  cochera: { label: 'Cochera + Lavado', emoji: '🅿️' },
  patente: { label: 'Patente', emoji: '📋' },
  multa: { label: 'Multa', emoji: '⚠️' },
  obra_social: { label: 'Obra Social', emoji: '❤️' },
};

export const CARD_KEYS = ['visa_ciudad', 'visa_ciudad_mama', 'visa_ciudad_papa', 'visa_santander'];

export const ITEM_GROUPS: { label: string; items: string[] }[] = [
  { label: '🏦 Tarjetas', items: ['visa_ciudad_mama', 'visa_ciudad_papa', 'visa_santander'] },
  { label: '🏠 Casa', items: ['expensas'] },
  { label: '🚗 Auto', items: ['prestamo', 'cochera', 'patente', 'multa'] },
];

type RangeFilter = '6' | '12' | '24' | 'all';

export function CycleHistoryList({ importLog }: { importLog: any[] }) {
  const [open, setOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [range, setRange] = useState<RangeFilter>('12');

  const { data: liqs } = useQuery({
    queryKey: ['liquidacion-history-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, description, amount_usd, notes')
        .ilike('description', '%Liquidación%')
        .order('date', { ascending: false });
      return data || [];
    },
  });

  const byMonth = useMemo(() => {
    const m: Record<string, { tx: any; parsed: any }> = {};
    (liqs || []).forEach((tx: any) => {
      let parsed: any = null;
      try { parsed = tx.notes ? JSON.parse(tx.notes) : null; } catch {}
      const ym = parsed?.month || (typeof tx.date === 'string' ? tx.date.slice(0, 7) : '');
      if (!ym) return;
      // Prefer the entry that carries metadata (parsed.settlement)
      if (!m[ym] || (!m[ym].parsed && parsed)) m[ym] = { tx, parsed };
    });
    return m;
  }, [liqs]);

  // Build month list: union of liqs months ∪ import_log (BC/Sant) months ∪ current month
  const allMonths = useMemo(() => {
    const set = new Set<string>();
    Object.keys(byMonth).forEach((ym) => set.add(ym));
    importLog
      .filter((l: any) => ['banco_ciudad', 'santander'].includes(l.source))
      .forEach((l: any) => l.month && set.add(l.month));
    set.add(format(new Date(), 'yyyy-MM'));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [byMonth, importLog]);

  const filteredMonths = useMemo(() => {
    if (range === 'all') return allMonths;
    const n = parseInt(range, 10);
    const cutoff = new Date();
    cutoff.setDate(1);
    cutoff.setMonth(cutoff.getMonth() - (n - 1));
    const cutoffYM = format(cutoff, 'yyyy-MM');
    return allMonths.filter((ym) => ym >= cutoffYM);
  }, [allMonths, range]);

  const rows = useMemo(() => filteredMonths.map((ym) => {
    const liq = byMonth[ym];
    const hasImport = importLog.some((l: any) => ['banco_ciudad', 'santander'].includes(l.source) && l.month === ym);
    const liquidado = !!liq;
    const breakdown: Record<string, number> = liq?.parsed?.breakdown || {};
    const manualCount = Object.entries(breakdown).filter(([k, v]) => !CARD_KEYS.includes(k) && Number(v) > 0).length;
    const usd = liq?.parsed?.usdPagado ?? (liq ? Math.abs(Number(liq.tx.amount_usd) || 0) : 0);
    return {
      ym,
      label: format(new Date(ym + '-01T00:00:00'), 'MMMM yyyy', { locale: es }),
      shortLabel: format(new Date(ym + '-01T00:00:00'), "MMM ''yy", { locale: es }),
      hasImport, liquidado, manualCount, usd, parsed: liq?.parsed, tx: liq?.tx,
    };
  }), [filteredMonths, byMonth, importLog]);

  function downloadPdfFor(ym: string, parsed: any, tx: any) {
    const monthLabel = format(new Date(ym + '-01T00:00:00'), 'MMMM yyyy', { locale: es });
    const p = parsed || {};
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
      usdAPagar: Number(p.usdPagado) || Math.abs(Number(tx?.amount_usd) || 0),
      vueltoARS: Number(p.vueltoARS) || 0,
    }, `liquidacion-${ym}.pdf`);
  }

  const chartData = useMemo(() => [...rows].reverse().map((r) => ({
    month: r.shortLabel, usd: r.liquidado ? Math.round(r.usd) : 0, ym: r.ym, liquidado: r.liquidado,
  })), [rows]);

  const selected = selectedMonth ? byMonth[selectedMonth] : null;

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen}>
        <Card>
          <CardContent className="p-0">
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/40 transition-colors">
                <div>
                  <p className="text-sm font-semibold">
                    Historial de ciclos
                    {(() => {
                      const lastLiq = rows.find((r) => r.liquidado);
                      if (!lastLiq) return null;
                      return (
                        <span className="font-normal text-muted-foreground">
                          {' · '}último: <span className="font-mono text-foreground">{formatUSD(lastLiq.usd)}</span> · <span className="capitalize">{lastLiq.label}</span>
                        </span>
                      );
                    })()}
                  </p>
                  <p className="text-xs text-muted-foreground">{allMonths.length} meses registrados</p>
                </div>
                <ChevronDown className={cn('h-4 w-4 transition-transform shrink-0', open && 'rotate-180')} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t p-4">
                <Tabs defaultValue="table">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <TabsList className="h-8">
                      <TabsTrigger value="table" className="text-xs">Tabla</TabsTrigger>
                      <TabsTrigger value="chart" className="text-xs">Gráfico</TabsTrigger>
                    </TabsList>
                    <Select value={range} onValueChange={(v) => setRange(v as RangeFilter)}>
                      <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="6">Últimos 6 meses</SelectItem>
                        <SelectItem value="12">Últimos 12 meses</SelectItem>
                        <SelectItem value="24">Últimos 24 meses</SelectItem>
                        <SelectItem value="all">Todo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <TabsContent value="table" className="mt-0 -mx-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mes</TableHead>
                            <TableHead className="text-center">Resúmenes</TableHead>
                            <TableHead className="text-center">Manuales</TableHead>
                            <TableHead className="text-center">Liquidado</TableHead>
                            <TableHead className="text-right">Pagado</TableHead>
                            <TableHead className="text-center w-10">PDF</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                                Sin registros para este rango.
                              </TableCell>
                            </TableRow>
                          )}
                          {rows.map((r) => (
                            <TableRow
                              key={r.ym}
                              className={cn(r.liquidado && 'cursor-pointer')}
                              onClick={() => r.liquidado && setSelectedMonth(r.ym)}
                            >
                              <TableCell className="capitalize text-sm font-medium">{r.label}</TableCell>
                              <TableCell className="text-center text-sm">{r.hasImport ? '✓' : '—'}</TableCell>
                              <TableCell className="text-center text-sm">{r.manualCount > 0 ? `✓ (${r.manualCount})` : '—'}</TableCell>
                              <TableCell className="text-center text-sm">{r.liquidado ? <span className="text-success font-semibold">✓</span> : '—'}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{r.liquidado ? formatUSD(r.usd) : '—'}</TableCell>
                              <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                {r.liquidado ? (
                                  <button
                                    type="button"
                                    onClick={() => downloadPdfFor(r.ym, r.parsed, r.tx)}
                                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                                    title="Descargar PDF"
                                    aria-label="Descargar PDF"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                  <TabsContent value="chart" className="mt-0">
                    {chartData.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-6 text-center">Sin registros para este rango.</p>
                    ) : (
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                            <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                            <Tooltip
                              contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                              formatter={(v: any) => [formatUSD(Number(v)), 'USD pagado']}
                              cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
                            />
                            <Bar
                              dataKey="usd"
                              fill="hsl(var(--primary))"
                              radius={[4, 4, 0, 0]}
                              onClick={(d: any) => d?.ym && byMonth[d.ym] && setSelectedMonth(d.ym)}
                              cursor="pointer"
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelectedMonth(null)}>
        <DialogContent className="sm:max-w-lg w-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="capitalize">
              Liquidación {selectedMonth ? format(new Date(selectedMonth + '-01T00:00:00'), 'MMMM yyyy', { locale: es }) : ''}
            </DialogTitle>
          </DialogHeader>
          {selected ? (
            <>
              {selected.parsed ? (
                <SettlementDetail parsed={selected.parsed} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Esta liquidación es anterior y no tiene desglose detallado guardado.
                </p>
              )}
              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedMonth && downloadPdfFor(selectedMonth, selected.parsed, selected.tx)}
                >
                  <Download className="h-4 w-4 mr-1.5" /> Descargar PDF
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SettlementDetail({ parsed }: { parsed: any }) {
  const breakdown: Record<string, number> = parsed.breakdown || {};

  const groups = ITEM_GROUPS.map((g) => ({
    label: g.label,
    items: g.items
      .filter((k) => Number(breakdown[k]) > 0)
      .map((k) => ({ key: k, label: ITEM_META[k]?.label || k, amount: Number(breakdown[k]) })),
  })).filter((g) => g.items.length > 0);

  const extras = Array.isArray(parsed.extras) ? parsed.extras : [];
  if (extras.length > 0) {
    groups.push({
      label: '➕ Otros',
      items: extras.map((e: any, idx: number) => ({
        key: `extra-${idx}`,
        label: e.label || '—',
        amount: Number(e.amountARS || 0),
      })),
    });
  }

  // Recompute total robustly: breakdown + extras (cards already included in breakdown)
  const sumBreakdown = Object.values(breakdown).reduce((s: number, v) => s + Number(v || 0), 0);
  const sumExtras = extras.reduce((s: number, e: any) => s + Number(e.amountARS || 0), 0);
  const totalARS = Number(parsed.totalARS) > 0 ? Number(parsed.totalARS) : (sumBreakdown + sumExtras);

  // Category breakdown (from saved cycle metadata)
  const catBd: Record<string, number> = parsed.categoryBreakdown || {};
  const catEntries = Object.entries(catBd)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const catSum = catEntries.reduce((s, [, v]) => s + Number(v), 0) || 1;
  const CAT_COLORS = [
    'hsl(228, 91%, 64%)',  // primary
    'hsl(160, 84%, 39%)',  // green
    'hsl(24, 95%, 53%)',   // orange
    'hsl(292, 84%, 61%)',  // fuchsia
    'hsl(199, 89%, 48%)',  // sky
    'hsl(45, 93%, 47%)',   // amber
    'hsl(0, 84%, 60%)',    // red
    'hsl(258, 90%, 66%)',  // violet
    'hsl(173, 80%, 40%)',  // teal
    'hsl(330, 81%, 60%)',  // pink
  ];

  return (
    <div className="space-y-4">
      {catEntries.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">📊 Distribución por categoría</p>
            <p className="text-xs font-mono text-muted-foreground">{formatARS(catSum)}</p>
          </div>
          {/* Stacked bar */}
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
            {catEntries.map(([name, v], idx) => (
              <div
                key={name}
                className="h-full transition-all"
                style={{
                  width: `${(Number(v) / catSum) * 100}%`,
                  background: CAT_COLORS[idx % CAT_COLORS.length],
                }}
                title={`${name}: ${formatARS(Number(v))}`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="rounded-lg border divide-y">
            {catEntries.map(([name, v], idx) => {
              const pct = (Number(v) / catSum) * 100;
              return (
                <div key={name} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: CAT_COLORS[idx % CAT_COLORS.length] }}
                  />
                  <span className="flex-1 truncate font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
                  <span className="font-mono text-sm tabular-nums w-24 text-right">{formatARS(Number(v))}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.label} className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">{g.label}</p>
          <div className="rounded-lg border divide-y">
            {g.items.map((it) => (
              <div key={it.key} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">{it.label}</span>
                <span className="font-mono shrink-0 ml-2">{formatARS(it.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total ARS</span>
          <span className="font-mono font-semibold">{formatARS(totalARS)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">TC Blue</span>
          <span className="font-mono">{formatARS(parsed.tcBlue || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">USD pagado</span>
          <span className="font-mono font-semibold">{formatUSD(parsed.usdPagado || 0)}</span>
        </div>
        {Number(parsed.vueltoARS) > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Vuelto ARS</span>
            <span className="font-mono font-semibold text-success">+{formatARS(parsed.vueltoARS)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
