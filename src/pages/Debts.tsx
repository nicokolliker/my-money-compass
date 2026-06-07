import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download } from 'lucide-react';
import { downloadSettlementPdf } from '@/lib/settlementPdf';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { useCreateTransfer } from '@/hooks/useTransactions';
import { MerchantLogo } from '@/components/MerchantLogo';
import { formatUSD } from '@/lib/constants';
import { useImportLog } from '@/hooks/useImportLog';
import { PendingCreditsBanner } from '@/components/PendingCreditsBanner';
import { CreditCardDebtCard } from '@/components/debts/CreditCardDebtCard';
import { UnifiedCycleHistory } from '@/components/debts/UnifiedCycleHistory';
import { ViejoSettlementWizard } from '@/components/debts/ViejoSettlementWizard';
import { SplitwiseSettlementWizard } from '@/components/debts/SplitwiseWizard';
import { SettlementDetail, ITEM_META, CARD_KEYS, formatARS } from '@/components/debts/CycleHistoryList';
import { usePendingCredits } from '@/hooks/usePendingCredits';

export default function DebtsPage() {
  const { data: importLog } = useImportLog();
  const { data: accounts } = useAccountBalances();
  const { data: pendingCredits } = usePendingCredits();
  const [openViejo, setOpenViejo] = useState(false);
  const [openSw, setOpenSw] = useState(false);
  const [detail, setDetail] = useState<{ parsed: any; monthLabel: string; tx: any } | null>(null);
  const [santPreviewARS, setSantPreviewARS] = useState<number>(() => {
    const v = Number(sessionStorage.getItem('viejo_santTotalARS') || 0);
    return Number.isFinite(v) ? v : 0;
  });

  const splitwiseAccount = useMemo(() =>
    accounts?.find((a: any) => /splitwise/i.test(a.name)) || null,
  [accounts]);

  const handleSantDetected = (n: number) => {
    setSantPreviewARS(n);
    try { sessionStorage.setItem('viejo_santTotalARS', String(n)); } catch {}
  };

  const hasPendingCredits = (pendingCredits || []).some((c: any) => c.status !== 'matched');

  function downloadDetailPdf() {
    if (!detail?.parsed) return;
    const p = detail.parsed;
    const ym: string = p.month || (detail.tx?.date || '').slice(0, 7);
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
      monthLabel: detail.monthLabel,
      mamaRows: p.mamaRows || [],
      papaRows: p.papaRows || [],
      santRows: p.santRows || [],
      manualItems,
      categoryBreakdown: p.categoryBreakdown || undefined,
      totalARS,
      tcBlue: Number(p.tcBlue) || 0,
      usdAPagar: Number(p.usdPagado) || Math.abs(Number(detail.tx?.amount_usd) || 0),
      vueltoARS: Number(p.vueltoARS) || 0,
    }, `liquidacion-${ym}.pdf`);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deudas y créditos</h1>
        <p className="text-sm text-muted-foreground">Revisión y liquidación mensual</p>
      </div>

      {/* SECTION 1 — Liquidaciones (inputs / actions) */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Liquidaciones
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ViejoActionCard onOpen={() => setOpenViejo(true)} />
          <SplitwiseActionCard
            account={splitwiseAccount}
            importLog={importLog || []}
            onOpen={() => setOpenSw(true)}
          />
        </div>
      </section>

      {/* SECTION 2 — Estado actual */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Estado actual
        </h2>

        {hasPendingCredits && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground/80">💚 Saldo a favor</p>
            <PendingCreditsBanner />
          </div>
        )}

        <CreditCardDebtCard />
      </section>

      {/* SECTION 3 — Historial */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Historial
        </h2>
        <UnifiedCycleHistory onRowClick={(r) => setDetail(r)} />
      </section>

      <ViejoSettlementWizard open={openViejo} onOpenChange={setOpenViejo} onSantTotalDetected={handleSantDetected} />
      <SplitwiseSettlementWizard open={openSw} onOpenChange={setOpenSw} />

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="capitalize">Liquidación — {detail?.monthLabel}</DialogTitle>
          </DialogHeader>
          {detail?.parsed && <SettlementDetail parsed={detail.parsed} />}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={downloadDetailPdf}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Descargar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViejoActionCard({ onOpen }: { onOpen: () => void }) {
  const currentMonthLabel = format(new Date(), 'MMMM', { locale: es });
  const { data: lastLiquidacion } = useQuery({
    queryKey: ['last-liquidacion-any'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('date, amount_usd')
        .ilike('description', '%Liquidación%')
        .ilike('description', '%viejo%')
        .not('notes', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const lastUsd = lastLiquidacion ? Math.abs(Number(lastLiquidacion.amount_usd) || 0) : 0;
  const lastMonth = lastLiquidacion
    ? format(new Date(lastLiquidacion.date + 'T12:00:00'), 'MMMM yyyy', { locale: es })
    : null;

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-base">👴</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Viejo</p>
            <p className="text-xs text-muted-foreground truncate">
              {lastMonth && lastUsd > 0
                ? <>Última: <span className="font-mono">{formatUSD(lastUsd)}</span> · {lastMonth}</>
                : 'Sin liquidaciones anteriores'}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" className="w-full" onClick={onOpen}>
          Liquidar <span className="capitalize">{currentMonthLabel}</span> →
        </Button>
      </CardContent>
    </Card>
  );
}

function SplitwiseActionCard({ account, importLog, onOpen }: {
  account: any; importLog: any[]; onOpen: () => void;
}) {
  const swImports = (importLog || [])
    .filter((l: any) => l.source === 'splitwise')
    .sort((a: any, b: any) => (b.imported_at || '').localeCompare(a.imported_at || ''));
  const lastImport = swImports[0];
  const lastDate = lastImport?.imported_at
    ? format(new Date(lastImport.imported_at), "d 'de' MMM yyyy", { locale: es })
    : null;
  const balance = Number(account?.computed_balance_usd || 0);

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-3">
          <MerchantLogo name="Splitwise" domain="splitwise.com" size={36} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Splitwise</p>
            <p className="text-xs text-muted-foreground truncate">
              {lastDate
                ? <>Último import: {lastDate}{Math.abs(balance) > 0.5 && <> · <span className="font-mono">{balance > 0 ? '+' : ''}${balance.toFixed(2)}</span></>}</>
                : 'Sin actividad aún'}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" className="w-full" onClick={onOpen}>
          Cargar CSV de Splitwise →
        </Button>
      </CardContent>
    </Card>
  );
}


function ViejoDebtCard({ importLog, santPreviewARS, onOpen }: {
  importLog: any[]; santPreviewARS: number; onOpen: () => void;
}) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthLabel = format(new Date(), 'MMMM yyyy', { locale: es });

  const { data: liquidacionTx } = useQuery({
    queryKey: ['liquidacion-check', currentMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, description, amount_usd, notes, date')
        .ilike('description', `%Liquidación%`)
        .ilike('description', `%viejo%`)
        .gte('date', currentMonth + '-01')
        .not('notes', 'is', null)
        .maybeSingle();
      return data;
    },
  });

  const yaLiquidado = !!liquidacionTx;

  const settlementData = useMemo(() => {
    if (!liquidacionTx?.notes) return null;
    try { return JSON.parse(liquidacionTx.notes); } catch { return null; }
  }, [liquidacionTx]);

  const { data: lastLiquidacion } = useQuery({
    queryKey: ['last-liquidacion'],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('date, notes, amount_usd')
        .ilike('description', '%Liquidación%')
        .ilike('description', '%viejo%')
        .not('notes', 'is', null)
        .lt('date', currentMonth + '-01')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const lastMonth = lastLiquidacion
    ? format(new Date(lastLiquidacion.date + 'T12:00:00'), 'MMMM yyyy', { locale: es })
    : null;
  const lastUsd = lastLiquidacion ? Math.abs(Number(lastLiquidacion.amount_usd) || 0) : 0;

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-base">
            👴
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Viejo</p>
            <p className="text-xs text-muted-foreground">
              {lastMonth && lastUsd > 0
                ? <>Última liquidación: <span className="font-mono">{formatUSD(lastUsd)}</span> · <span className="capitalize">{lastMonth}</span></>
                : 'Sin liquidaciones anteriores'}
            </p>
          </div>
        </div>
        {yaLiquidado && (
          <Badge variant="secondary" className="text-[10px]">✓ {monthLabel}</Badge>
        )}
      </div>

      <div className="px-5 py-4 space-y-3">
        {yaLiquidado && settlementData ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total ARS</p>
                <p className="text-sm font-mono font-medium text-foreground mt-0.5">
                  {'$' + Math.round(settlementData.totalARS || 0).toLocaleString('es-AR')}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">USD pagado</p>
                <p className="text-sm font-mono font-bold text-foreground mt-0.5">
                  ${(settlementData.usdPagado || 0).toLocaleString('en-US')}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Vuelto ARS</p>
                <p className="text-sm font-mono text-success mt-0.5">
                  {settlementData.vueltoARS > 0
                    ? '+$' + Math.round(settlementData.vueltoARS).toLocaleString('es-AR')
                    : '—'}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onOpen}>
              Reliquidar o ver otro mes →
            </Button>
          </>
        ) : (
          <>
            <div className="rounded-xl bg-muted/40 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">
                Estimado {monthLabel}
              </p>
              {santPreviewARS > 0 ? (
                <p className="text-sm font-mono text-foreground">
                  VISA Sant. <span className="font-semibold">{formatARS(santPreviewARS)}</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Subí los resúmenes para ver el total.
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={onOpen}>
              Liquidar →
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function SplitwiseDebtCard({ account, importLog, onOpen }: {
  account: any; importLog: any[]; onOpen: () => void;
}) {
  const currentMonth = format(new Date(), 'yyyy-MM');

  const swImports = (importLog || [])
    .filter((l: any) => l.source === 'splitwise')
    .sort((a: any, b: any) => b.month.localeCompare(a.month));
  const lastImport = swImports[0];
  const importadoEsteMes = lastImport?.month === currentMonth;

  const balance = Number(account?.computed_balance_usd || 0);
  const teDebenAVos = balance > 0.5;
  const vosDebes = balance < -0.5;
  const alDia = !teDebenAVos && !vosDebes;

  // Per-month breakdown of net balance contribution from Splitwise transactions
  const { data: monthlyBreakdown } = useQuery({
    queryKey: ['splitwise-monthly', account?.id],
    enabled: !!account?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('date, amount_usd, description')
        .eq('account_id', account.id)
        .order('date', { ascending: false });
      const groups: Record<string, { net: number; count: number }> = {};
      (data || []).forEach((t: any) => {
        const ym = typeof t.date === 'string' ? t.date.slice(0, 7) : '';
        if (!ym) return;
        if (!groups[ym]) groups[ym] = { net: 0, count: 0 };
        groups[ym].net += Number(t.amount_usd) || 0;
        groups[ym].count += 1;
      });
      return Object.entries(groups)
        .map(([ym, v]) => ({ ym, ...v }))
        .sort((a, b) => b.ym.localeCompare(a.ym))
        .slice(0, 6);
    },
  });

  return (
    <Card className="rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <MerchantLogo name="Splitwise" domain="splitwise.com" size={36} />
          <div>
            <p className="text-sm font-semibold text-foreground">Splitwise</p>
            <p className="text-xs text-muted-foreground">
              {lastImport
                ? `Última actualización: ${lastImport.month}`
                : 'Sin datos aún'}
            </p>
          </div>
        </div>
        {importadoEsteMes && (
          <Badge variant="secondary" className="text-[10px]">
            ✓ {format(new Date(), 'MMMM', { locale: es })}
          </Badge>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="text-center py-2">
          {teDebenAVos && (
            <>
              <p className="text-xs text-muted-foreground mb-1">Te deben</p>
              <p className="text-3xl font-mono font-bold text-success">
                +${Math.abs(balance).toFixed(2)} <span className="text-base font-medium text-muted-foreground">USD</span>
              </p>
            </>
          )}
          {vosDebes && (
            <>
              <p className="text-xs text-muted-foreground mb-1">Debés</p>
              <p className="text-3xl font-mono font-bold text-destructive">
                -${Math.abs(balance).toFixed(2)} <span className="text-base font-medium text-muted-foreground">USD</span>
              </p>
            </>
          )}
          {alDia && (
            <p className="text-lg font-semibold text-muted-foreground">Al día ✓</p>
          )}
        </div>

        {(monthlyBreakdown && monthlyBreakdown.length > 0) && (
          <div className="rounded-xl border border-border/60 divide-y divide-border/60">
            {monthlyBreakdown.map((g) => {
              const label = format(new Date(g.ym + '-01T12:00:00'), 'MMMM yyyy', { locale: es });
              const positive = g.net > 0;
              return (
                <div key={g.ym} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-xs font-medium capitalize text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{g.count} {g.count === 1 ? 'mov.' : 'movs.'}</p>
                  </div>
                  <p className={cn(
                    'text-xs font-mono font-semibold',
                    Math.abs(g.net) < 0.5 ? 'text-muted-foreground' : positive ? 'text-success' : 'text-destructive',
                  )}>
                    {positive ? '+' : ''}${g.net.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <Button variant="outline" size="sm" onClick={onOpen}>
          {importadoEsteMes ? 'Actualizar / saldar →' : 'Cargar CSV de Splitwise →'}
        </Button>
      </div>
    </Card>
  );
}

function SimpleDebtCard({ account, onTransfer }: { account: any; onTransfer: () => void }) {
  const balance = Number(account.computed_balance_usd || 0);
  const isDebt = balance < -0.5;
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-4">
        <MerchantLogo name={account.name} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm truncate">{account.name}</p>
            <Badge variant={isDebt ? 'destructive' : 'secondary'} className="text-[10px]">
              {isDebt ? 'Pendiente' : 'Al día ✓'}
            </Badge>
          </div>
          <p className={cn('text-sm font-mono mt-0.5', isDebt ? 'text-destructive' : 'text-success')}>
            {formatUSD(Math.abs(balance))}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onTransfer}>Registrar pago</Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Simple transfer dialog for "otras" debt accounts
// ============================================================================

function TransferDialog({ account, onClose }: { account: any; onClose: () => void }) {
  const { data: accounts } = useAccountBalances();
  const arsToUsd = useLatestFxRate('ARS', 'USD');
  const createTransfer = useCreateTransfer();
  const [fromId, setFromId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);

  useEffect(() => {
    if (account) setAmount(Math.abs(Number(account.computed_balance) || 0));
  }, [account]);

  if (!account) return null;
  const open = !!account;

  async function submit() {
    if (!fromId || amount <= 0) return;
    const fromAcc = accounts?.find((a: any) => a.id === fromId);
    const fromCurrency = fromAcc?.currency || 'USD';
    const toCurrency = account.currency || 'USD';
    const fxRate = fromCurrency === toCurrency ? 1 : (fromCurrency === 'ARS' ? (arsToUsd || 0) : (toCurrency === 'ARS' && arsToUsd > 0 ? 1 / arsToUsd : 1));
    try {
      await createTransfer.mutateAsync({
        fromAccountId: fromId,
        toAccountId: account.id,
        amount,
        fromCurrency,
        toCurrency,
        fxRate,
        toAmount: fromCurrency === toCurrency ? amount : amount * fxRate,
        date: new Date().toISOString().slice(0, 10),
        description: `Pago a ${account.name}`,
      });
      toast.success('Pago registrado');
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar pago a {account.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Pagar desde</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
              <SelectContent>
                {(accounts || []).filter((a: any) => a.is_active && a.id !== account.id).map((a: any) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Monto ({(accounts?.find((a: any) => a.id === fromId)?.currency) || ''})</Label>
            <Input type="number" value={amount || ''} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} className="mt-1" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={submit} disabled={!fromId || amount <= 0}>Registrar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
