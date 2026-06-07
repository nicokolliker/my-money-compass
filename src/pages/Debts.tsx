import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Download, Check } from 'lucide-react';
import { downloadSettlementPdf } from '@/lib/settlementPdf';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { MerchantLogo } from '@/components/MerchantLogo';
import { formatUSD } from '@/lib/constants';
import { useImportLog } from '@/hooks/useImportLog';
import { CreditCardDebtCard } from '@/components/debts/CreditCardDebtCard';
import { UnifiedCycleHistory } from '@/components/debts/UnifiedCycleHistory';
import { ViejoSettlementWizard } from '@/components/debts/ViejoSettlementWizard';
import { SplitwiseSettlementWizard } from '@/components/debts/SplitwiseWizard';
import { SettlementDetail, ITEM_META, CARD_KEYS } from '@/components/debts/CycleHistoryList';
import { SplitwisePaymentDialog } from '@/components/debts/SplitwisePaymentDialog';
import { usePendingCredits, useResolvePendingCredit, type PendingCredit } from '@/hooks/usePendingCredits';

export default function DebtsPage() {
  const qc = useQueryClient();
  const { data: importLog } = useImportLog();
  const { data: accounts } = useAccountBalances();
  const { data: pendingCredits } = usePendingCredits();
  const resolveCredit = useResolvePendingCredit();
  const arsToUsd = useLatestFxRate('ARS', 'USD');

  const [openViejo, setOpenViejo] = useState(false);
  const [openSw, setOpenSw] = useState(false);
  const [openSwPay, setOpenSwPay] = useState(false);
  const [confirmingVuelto, setConfirmingVuelto] = useState<PendingCredit | null>(null);
  const [detail, setDetail] = useState<{ parsed: any; monthLabel: string; tx: any } | null>(null);

  const monthLabel = format(new Date(), 'MMMM yyyy', { locale: es });
  const currentMonth = format(new Date(), 'yyyy-MM');

  const splitwiseAccount = useMemo(
    () => accounts?.find((a: any) => /splitwise/i.test(a.name)) || null,
    [accounts],
  );
  const mpAccount = useMemo(
    () =>
      accounts?.find(
        (a: any) =>
          a.currency === 'ARS' &&
          (/mercado\s*pago/i.test(a.name) || /\bmp\b/i.test(a.name)),
      ) || null,
    [accounts],
  );

  const viejoVueltos = (pendingCredits || []).filter(
    (pc) => pc.source === 'viejo_settlement' && pc.status === 'pending',
  );

  const handleConfirmVuelto = async () => {
    if (!confirmingVuelto) return;
    if (!mpAccount) {
      toast.error('No se encontró la cuenta MercadoPago ARS');
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const today = new Date().toISOString().slice(0, 10);
      const amountArs = Number(confirmingVuelto.amount_ars) || 0;
      const amountUsd = amountArs * arsToUsd;
      const settlementMonth = confirmingVuelto.settlement_month || currentMonth;
      const monthLbl = format(
        new Date(settlementMonth + '-01T12:00:00'),
        'MMMM yyyy',
        { locale: es },
      );

      const { data: tx, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          account_id: mpAccount.id,
          date: today,
          description: `Vuelto liquidación ${monthLbl}`,
          amount: amountArs,
          currency: 'ARS',
          fx_rate: arsToUsd,
          amount_usd: amountUsd,
          type: 'income' as const,
          notes: JSON.stringify({
            vuelto_for: confirmingVuelto.id,
            settlement_month: settlementMonth,
          }),
        })
        .select('id')
        .single();
      if (error) throw error;

      await resolveCredit.mutateAsync({
        id: confirmingVuelto.id,
        transactionId: tx?.id,
      });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Vuelto registrado en MercadoPago');
      setConfirmingVuelto(null);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo registrar el vuelto');
    }
  };

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
        <h1 className="text-2xl font-bold tracking-tight capitalize">
          Liquidaciones — {monthLabel}
        </h1>
        <p className="text-sm text-muted-foreground">
          Tus dos rituales mensuales en un solo lugar
        </p>
      </div>

      {/* SECTION 1 — Twin settlement cards */}
      <section className="grid gap-4 md:grid-cols-2">
        <ViejoCard
          onOpenWizard={() => setOpenViejo(true)}
          vueltos={viejoVueltos}
          onMarkVuelto={(pc) => setConfirmingVuelto(pc)}
        />
        <SplitwiseCard
          account={splitwiseAccount}
          importLog={importLog || []}
          onOpenCsv={() => setOpenSw(true)}
          onOpenPay={() => setOpenSwPay(true)}
        />
      </section>

      {/* SECTION 2 — Estado actual */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Estado actual
        </h2>
        <CreditCardDebtCard />
      </section>

      {/* SECTION 3 — Historial */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Historial
        </h2>
        <UnifiedCycleHistory onRowClick={(r) => setDetail(r)} />
      </section>

      <ViejoSettlementWizard open={openViejo} onOpenChange={setOpenViejo} onSantTotalDetected={() => {}} />
      <SplitwiseSettlementWizard open={openSw} onOpenChange={setOpenSw} />
      <SplitwisePaymentDialog
        open={openSwPay}
        onOpenChange={setOpenSwPay}
        balanceUsd={Number(splitwiseAccount?.computed_balance_usd || 0)}
        mpAccount={mpAccount}
        splitwiseAccount={splitwiseAccount}
      />

      {/* Vuelto confirm dialog */}
      <Dialog open={!!confirmingVuelto} onOpenChange={(o) => !o && setConfirmingVuelto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar vuelto recibido</DialogTitle>
            <DialogDescription>
              Esto va a crear un ingreso en tu cuenta MercadoPago ARS por{' '}
              <span className="font-mono font-semibold text-foreground">
                +${Math.round(Number(confirmingVuelto?.amount_ars) || 0).toLocaleString('es-AR')}
              </span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmingVuelto(null)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmVuelto} disabled={resolveCredit.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settlement detail dialog */}
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

// ============================================================================
// Viejo card
// ============================================================================

function ViejoCard({
  onOpenWizard,
  vueltos,
  onMarkVuelto,
}: {
  onOpenWizard: () => void;
  vueltos: PendingCredit[];
  onMarkVuelto: (pc: PendingCredit) => void;
}) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const monthLabel = format(new Date(), 'MMMM', { locale: es });

  const { data: liquidacionEsteMes } = useQuery({
    queryKey: ['liquidacion-check', currentMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, date, amount_usd')
        .ilike('description', '%Liquidación%')
        .ilike('description', '%viejo%')
        .gte('date', currentMonth + '-01')
        .not('notes', 'is', null)
        .maybeSingle();
      return data;
    },
  });

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

  const yaLiquidado = !!liquidacionEsteMes;
  const lastUsd = lastLiquidacion ? Math.abs(Number(lastLiquidacion.amount_usd) || 0) : 0;
  const lastMonth = lastLiquidacion
    ? format(new Date(lastLiquidacion.date + 'T12:00:00'), 'MMMM yyyy', { locale: es })
    : null;

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg shrink-0">
              👴
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Al Viejo</p>
              <p className="text-xs text-muted-foreground truncate">
                {lastMonth && lastUsd > 0
                  ? <>Última: <span className="font-mono">{formatUSD(lastUsd)}</span> · <span className="capitalize">{lastMonth}</span></>
                  : 'Sin liquidaciones anteriores'}
              </p>
            </div>
          </div>
          <Badge
            variant={yaLiquidado ? 'secondary' : 'outline'}
            className="text-[10px] shrink-0"
          >
            {yaLiquidado ? '✓ Liquidado' : 'Pendiente'}
          </Badge>
        </div>

        {vueltos.map((pc) => (
          <div
            key={pc.id}
            className="rounded-xl border border-success/30 bg-success/10 p-3 space-y-2"
          >
            <p className="text-xs leading-snug text-foreground">
              <span className="mr-1">💚</span>
              <span className="font-semibold">Vuelto pendiente:</span>{' '}
              <span className="font-mono font-semibold text-success">
                +${Math.round(Number(pc.amount_ars) || 0).toLocaleString('es-AR')} ARS
              </span>
              {pc.settlement_month && (
                <> · <span className="capitalize">{pc.settlement_month}</span></>
              )}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full border-success/40 text-success hover:bg-success/10"
              onClick={() => onMarkVuelto(pc)}
            >
              <Check className="h-3.5 w-3.5 mr-1.5" />
              Marcar como recibido
            </Button>
          </div>
        ))}

        <Button variant="secondary" size="sm" className="w-full" onClick={onOpenWizard}>
          {yaLiquidado ? 'Reliquidar' : 'Liquidar'} <span className="capitalize">{monthLabel}</span> →
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Splitwise card
// ============================================================================

function SplitwiseCard({
  account,
  importLog,
  onOpenCsv,
  onOpenPay,
}: {
  account: any;
  importLog: any[];
  onOpenCsv: () => void;
  onOpenPay: () => void;
}) {
  const swImports = (importLog || [])
    .filter((l: any) => l.source === 'splitwise')
    .sort((a: any, b: any) => (b.imported_at || '').localeCompare(a.imported_at || ''));
  const lastImport = swImports[0];
  const lastDate = lastImport?.imported_at
    ? format(new Date(lastImport.imported_at), "d 'de' MMM yyyy", { locale: es })
    : null;

  const balance = Number(account?.computed_balance_usd || 0);
  const owes = balance < -0.5;
  const owed = balance > 0.5;

  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <MerchantLogo name="Splitwise" domain="splitwise.com" size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Splitwise</p>
            <p className="text-xs text-muted-foreground truncate">
              {lastDate ? <>Último import: {lastDate}</> : 'Sin actividad aún'}
            </p>
          </div>
        </div>

        <div className="text-center py-2">
          {owes && (
            <>
              <p className="text-xs text-muted-foreground mb-1">Debés</p>
              <p className="text-3xl font-mono font-bold text-destructive">
                -${Math.abs(balance).toFixed(2)}{' '}
                <span className="text-base font-medium text-muted-foreground">USD</span>
              </p>
            </>
          )}
          {owed && (
            <>
              <p className="text-xs text-muted-foreground mb-1">Te deben</p>
              <p className="text-3xl font-mono font-bold text-success">
                +${balance.toFixed(2)}{' '}
                <span className="text-base font-medium text-muted-foreground">USD</span>
              </p>
            </>
          )}
          {!owes && !owed && (
            <p className="text-sm font-medium text-muted-foreground">Sin deuda este mes ✓</p>
          )}
        </div>

        <div className="space-y-2">
          {owes && (
            <Button variant="secondary" size="sm" className="w-full" onClick={onOpenPay}>
              Registrar pago →
            </Button>
          )}
          <Button
            variant={owes ? 'outline' : 'secondary'}
            size="sm"
            className="w-full"
            onClick={onOpenCsv}
          >
            Cargar CSV de Splitwise →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
