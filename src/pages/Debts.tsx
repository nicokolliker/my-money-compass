import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, CheckCircle2, X, Plus, ChevronDown, Download } from 'lucide-react';
import { downloadSettlementPdf } from '@/lib/settlementPdf';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { useBlueDollarRate } from '@/hooks/useBlueDollar';
import { useCreateTransfer } from '@/hooks/useTransactions';
import { MerchantLogo } from '@/components/MerchantLogo';
import { formatUSD } from '@/lib/constants';
import { parseBancoCiudad, extractCardTotal } from '@/lib/importers/bancoCiudadParser';
import { parseSantander } from '@/lib/importers/santanderParser';
import type { ParsedTransaction } from '@/lib/importers/arqParser';
import { parseSplitwise, type SplitwiseRow } from '@/lib/importers/splitwiseParser';
import { inferCategoryName } from '@/hooks/useRuleSuggestions';
import { useImportLog } from '@/hooks/useImportLog';
import { extractPdfText } from '@/lib/pdfReader';
import { parseAmexTotal } from '@/lib/importers/amexParser';
import { usePendingCredits } from '@/hooks/usePendingCredits';

export default function DebtsPage() {
  const { data: importLog } = useImportLog();
  const { data: accounts } = useAccountBalances();
  const { data: pendingCredits } = usePendingCredits();
  const [openViejo, setOpenViejo] = useState(false);
  const [openSw, setOpenSw] = useState(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deudas y créditos</h1>
        <p className="text-sm text-muted-foreground">Revisión y liquidación mensual</p>
      </div>

      {(pendingCredits || []).length > 0 && (
        <Card className="rounded-2xl border-success/40 bg-success/10">
          <CardContent className="p-4 space-y-2">
            {(pendingCredits || []).map((pc) => (
              <p key={pc.id} className="text-sm text-foreground leading-snug">
                <span className="mr-1">💚</span>
                <span className="font-semibold">Saldo a favor:</span>{' '}
                <span className="font-mono font-semibold text-success">
                  +{formatARS(pc.amount_ars)}
                </span>
                {pc.settlement_month && (
                  <> de liquidación <span className="capitalize">{pc.settlement_month}</span></>
                )}{' '}
                <span className="text-muted-foreground">— llegará por MercadoPago</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <ViejoDebtCard
        importLog={importLog || []}
        santPreviewARS={santPreviewARS}
        onOpen={() => setOpenViejo(true)}
      />

      {splitwiseAccount ? (
        <SplitwiseDebtCard
          account={splitwiseAccount}
          importLog={importLog || []}
          onOpen={() => setOpenSw(true)}
        />
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-3">
              <MerchantLogo name="Splitwise" domain="splitwise.com" size={36} />
              <div>
                <p className="text-sm font-semibold">Splitwise</p>
                <p className="text-xs text-muted-foreground">Sin actividad aún</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Cargá tu primer CSV para empezar a trackear los gastos del grupo.
            </p>
            <Button variant="outline" size="sm" onClick={() => setOpenSw(true)}>
              Cargar CSV de Splitwise →
            </Button>
          </CardContent>
        </Card>
      )}

      <ViejoCycleHistory importLog={importLog || []} />

      <ViejoSettlementWizard open={openViejo} onOpenChange={setOpenViejo} onSantTotalDetected={handleSantDetected} />
      <SplitwiseSettlementWizard open={openSw} onOpenChange={setOpenSw} />
    </div>
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
// Viejo Settlement Wizard — 4 pasos
// ============================================================================

const STORAGE_KEY = 'settlement_defaults';

function formatARS(n: number): string {
  if (!n && n !== 0) return '';
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function parseARSInput(v: string): number {
  return parseFloat(v.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')) || 0;
}

const NUMERIC_INPUT_CLS = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

interface ExtraItem {
  id: string;
  label: string;
  amountARS: number;
  categoryName: string;
  emoji: string;
}

interface SettlementItem {
  key: string;
  label: string;
  emoji: string;
  amountARS: number;
  editable: boolean;
  labelEditable?: boolean;
  categoryName: string;
}

const ITEM_GROUPS: { label: string; items: string[] }[] = [
  { label: '🏦 Tarjetas', items: ['visa_ciudad_mama', 'visa_ciudad_papa', 'visa_santander', 'amex'] },
  { label: '🏠 Casa', items: ['expensas'] },
  { label: '🚗 Auto', items: ['prestamo', 'cochera', 'patente', 'multa'] },
];

function ViejoSettlementWizard({ open, onOpenChange, onSantTotalDetected }: { open: boolean; onOpenChange: (v: boolean) => void; onSantTotalDetected?: (n: number) => void }) {
  const { data: accounts } = useAccountBalances();
  const { data: categories } = useCategories();
  const { data: blueRate } = useBlueDollarRate();
  const arsToUsd = useLatestFxRate('ARS', 'USD');
  const qc = useQueryClient();

  const defaultBlueRate = blueRate?.blue_avg ? Math.round(blueRate.blue_avg) : (arsToUsd > 0 ? Math.round(1 / arsToUsd) : 1390);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [settlementMonth, setSettlementMonth] = useState<string>(() => {
    const today = new Date();
    const day = today.getDate();
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    if (day < 20) d.setMonth(d.getMonth() - 1);
    return format(d, 'yyyy-MM');
  });
  const [iebraFile, setIebraFile] = useState<File | null>(null);
  const [kollikerFile, setKollikerFile] = useState<File | null>(null);
  const [santFile, setSantFile] = useState<File | null>(null);
  const [amexFile, setAmexFile] = useState<File | null>(null);
  const [amexARS, setAmexARS] = useState(0);
  const [bcTotalARS, setBcTotalARS] = useState(0);
  const [santTotalARS, setSantTotalARS] = useState(0);
  const [visaCiudadMamaARS, setVisaCiudadMamaARS] = useState(0);
  const [visaCiudadPapaARS, setVisaCiudadPapaARS] = useState(0);
  const [processing, setProcessing] = useState(false);

  const [iebraRows, setIebraRows] = useState<(ParsedTransaction & { categoryName: string; selected: boolean })[]>([]);
  const [kollikerRows, setKollikerRows] = useState<(ParsedTransaction & { categoryName: string; selected: boolean })[]>([]);
  const [santRows, setSantRows] = useState<(ParsedTransaction & { categoryName: string; selected: boolean })[]>([]);

  const [items, setItems] = useState<SettlementItem[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [tcBlue, setTcBlue] = useState(defaultBlueRate);
  const [usdAPagar, setUsdAPagar] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resultUsd, setResultUsd] = useState(0);
  const [resultVuelto, setResultVuelto] = useState(0);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const monthOptions = useMemo(() => {
    const arr: { ym: string; label: string }[] = [];
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    if (today.getDate() < 20) start.setMonth(start.getMonth() - 1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
      arr.push({ ym: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: es }) });
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setSettlementMonth(format(new Date(), 'yyyy-MM'));
      setIebraFile(null); setKollikerFile(null); setSantFile(null); setAmexFile(null); setAmexARS(0);
      setBcTotalARS(0); setSantTotalARS(0); setVisaCiudadMamaARS(0); setVisaCiudadPapaARS(0);
      setExtraItems([]);
      setItems([]);
      setIebraRows([]); setKollikerRows([]); setSantRows([]);
      setUsdAPagar(0);
      setResultUsd(0); setResultVuelto(0);
    }
  }, [open]);

  useEffect(() => {
    if (step !== 2) return;
    let saved: any = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
    setItems([
      { key: 'visa_ciudad_mama', label: 'VISA Ciudad — Mamá', emoji: '🏦', amountARS: visaCiudadMamaARS, editable: visaCiudadMamaARS === 0, categoryName: '' },
      { key: 'visa_ciudad_papa', label: 'VISA Ciudad — Papá', emoji: '🏦', amountARS: visaCiudadPapaARS, editable: visaCiudadPapaARS === 0, categoryName: '' },
      { key: 'visa_santander', label: 'VISA Santander',    emoji: '🏦', amountARS: santTotalARS || saved.visa_santander || 0, editable: santTotalARS === 0, categoryName: '' },
      { key: 'amex',           label: 'AMEX Santander',    emoji: '💳', amountARS: amexARS || saved.amex || 0, editable: true, categoryName: 'Casa' },
      { key: 'expensas',       label: 'Expensas',          emoji: '🏠', amountARS: saved.expensas || 0,    editable: true, categoryName: 'Casa' },
      { key: 'prestamo',       label: 'Préstamo + Seguro', emoji: '🚗', amountARS: saved.prestamo || 0,    editable: true, categoryName: 'Auto' },
      { key: 'cochera',        label: 'Cochera + Lavado',  emoji: '🅿️', amountARS: saved.cochera || 0,     editable: true, categoryName: 'Auto' },
      { key: 'patente',        label: 'Patente',           emoji: '📋', amountARS: saved.patente || 0,     editable: true, categoryName: 'Auto' },
      { key: 'multa',          label: 'Multa',             emoji: '⚠️', amountARS: saved.multa || 0,       editable: true, categoryName: 'Auto' },
    ]);
    if (Array.isArray(saved.extras)) {
      setExtraItems(saved.extras.map((e: any) => ({
        id: crypto.randomUUID(),
        label: e.label || '',
        amountARS: 0,
        categoryName: e.categoryName || 'Casa',
        emoji: e.emoji || '📌',
      })));
    } else {
      setExtraItems([]);
    }
    setTcBlue(defaultBlueRate);
  }, [step, bcTotalARS, santTotalARS, visaCiudadMamaARS, visaCiudadPapaARS, amexARS, defaultBlueRate]);

  const totalARS = items.reduce((s, i) => s + (i.amountARS || 0), 0) + extraItems.reduce((s, i) => s + (i.amountARS || 0), 0);
  const usdExacto = tcBlue > 0 ? totalARS / tcBlue : 0;
  useEffect(() => { setUsdAPagar(Math.round(usdExacto / 100) * 100); }, [usdExacto]);
  const vueltoARS = Math.max(0, usdAPagar * tcBlue - totalARS);

  function updateItem(key: string, patch: Partial<SettlementItem>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleProcessFiles() {
    setProcessing(true);
    try {
      const fxFallback = arsToUsd || 0.00072;
      let sant = 0, visaCiudadMama = 0, visaCiudadPapa = 0;

      const bcFiles = [iebraFile, kollikerFile].filter((f): f is File => !!f);
      const allMama: ParsedTransaction[] = [];
      const allPapa: ParsedTransaction[] = [];
      for (const f of bcFiles) {
        const text = await extractPdfText(f);
        // Card 1689 (mamá) — todos los gastos
        const mamaRows = parseBancoCiudad(text, fxFallback, '1689');
        if (mamaRows.length > 0) {
          const { ars: vcARS, usd: vcUSD } = extractCardTotal(text, '1689');
          visaCiudadMama += vcARS + (vcUSD > 0 ? vcUSD / fxFallback : 0);
          allMama.push(...mamaRows);
        }
        // Card 8157 (papá) — solo OB SOC / PODER JUD
        const papaRows = parseBancoCiudad(text, fxFallback, '8157')
          .filter((r) => /OB\s*SOC|PODER\s*JUD/i.test(r.description));
        if (papaRows.length > 0) {
          visaCiudadPapa += papaRows.reduce((s, r) => s + r.amountARS, 0);
          allPapa.push(...papaRows);
        }
      }
      // Dedup por external_id
      const dedup = (arr: ParsedTransaction[]) => {
        const seen = new Set<string>();
        return arr.filter((r) => {
          const k = r.external_id || `${r.date}-${r.description}-${r.amountARS}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      };
      const mamaDedup = dedup(allMama);
      const papaDedup = dedup(allPapa);

      setIebraRows(mamaDedup.map(r => ({
        ...r,
        categoryName: inferCategoryName(r.description) || 'Casa',
        selected: true,
      })));
      setKollikerRows(papaDedup.map(r => ({
        ...r,
        categoryName: inferCategoryName(r.description) || 'Casa',
        selected: true,
      })));

      if (santFile) {
        const text = await extractPdfText(santFile);
        const rows = parseSantander(text, fxFallback);
        sant = rows.reduce((s, r) => s + r.amountARS, 0);
        setSantRows(rows.map(r => ({
          ...r,
          categoryName: inferCategoryName(r.description) || 'Casa',
          selected: true,
        })));
      }

      setBcTotalARS(visaCiudadMama + visaCiudadPapa);
      setSantTotalARS(sant);
      if (sant > 0) onSantTotalDetected?.(sant);
      setVisaCiudadMamaARS(visaCiudadMama);
      setVisaCiudadPapaARS(visaCiudadPapa);

      if (amexFile) {
        const text = await extractPdfText(amexFile);
        const total = parseAmexTotal(text);
        setAmexARS(total);
      }

      setStep(2);
    } catch (e: any) {
      toast.error(e.message || 'Error procesando PDFs');
    } finally {
      setProcessing(false);
    }
  }

  async function handleConfirm() {
    if (!accounts || !categories) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const currentYM = format(new Date(), 'yyyy-MM');
      const isCurrentMonth = settlementMonth === currentYM;
      const settlementDate = isCurrentMonth
        ? new Date().toISOString().split('T')[0]
        : (() => {
            const [y, m] = settlementMonth.split('-').map(Number);
            return `${settlementMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
          })();
      const monthLabel = format(
        new Date(settlementMonth + '-01T00:00:00'),
        'MMMM yyyy',
        { locale: es }
      );

      // ── Obtener o crear cuenta virtual "Viejo" (oculta en Accounts) ──
      let tarjetaViejoAcc: any = accounts.find((a: any) => /viejo/i.test(a.name));

      // PR1: ensure existing Viejo account is excluded from net worth
      if (tarjetaViejoAcc && !tarjetaViejoAcc.exclude_from_net_worth) {
        await supabase
          .from('accounts')
          .update({ exclude_from_net_worth: true } as any)
          .eq('id', tarjetaViejoAcc.id);
      }

      if (!tarjetaViejoAcc) {
        const { data: newAcc, error: accErr } = await supabase
          .from('accounts')
          .insert({
            user_id: user.id,
            name: 'Viejo',
            type: 'debt',
            currency: 'ARS',
            opening_balance: 0,
            is_active: true,
            exclude_from_net_worth: true,   // PR1: tracking-only, impact captured in Cash USD
          } as any)
          .select()
          .single();
        if (accErr) throw accErr;
        tarjetaViejoAcc = newAcc;
      }

      const cashAcc = accounts.find(
        (a: any) => /cash/i.test(a.name) && a.currency === 'USD'
      );
      const mpAcc = accounts.find((a: any) =>
        /mercado.*pago|mercadopago/i.test(a.name)
      );

      if (!cashAcc || !mpAcc) {
        toast.error('Faltan cuentas: Cash USD y/o Mercado Pago');
        setSubmitting(false);
        return;
      }

      const fxArsUsd = arsToUsd || (tcBlue > 0 ? 1 / tcBlue : 0.00072);

      // ── Limpiar transacciones previas del mismo mes ──────────────────
      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .eq('account_id', tarjetaViejoAcc.id)
        .gte('date', settlementMonth + '-01')
        .lte('date', settlementMonth + '-31');

      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .eq('account_id', cashAcc.id)
        .ilike('description', `%${monthLabel}%`)
        .ilike('description', '%viejo%');

      await supabase
        .from('transactions')
        .delete()
        .eq('user_id', user.id)
        .eq('account_id', mpAcc.id)
        .ilike('description', `%${monthLabel}%`)
        .ilike('description', '%viejo%');

      // ── PASO 1: Filas del PDF → cuenta Viejo en ARS ─────────────────
      const allPdfRows = [
        ...iebraRows.filter(r => r.selected),
        ...kollikerRows.filter(r => r.selected),
        ...santRows.filter(r => r.selected),
      ];

      for (const row of allPdfRows) {
        const cat = categories.find((c: any) => c.name === row.categoryName);
        const isCuota = /cuota/i.test(row.description);
        const txDate = isCuota ? settlementDate : (row.date || settlementDate);
        await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: tarjetaViejoAcc.id,
          date: txDate,
          description: row.description,
          amount: -row.amountARS,
          currency: 'ARS',
          fx_rate: fxArsUsd,
          amount_usd: -(row.amountARS * fxArsUsd),
          type: 'expense' as const,
          category_id: cat?.id || null,
          external_id: row.external_id
            ? `viejo-${settlementMonth}-${row.external_id}`
            : null,
        });
      }

      // ── PASO 2: Ítems manuales → cuenta Viejo en ARS ────────────────
      const manualLines = [
        ...items.filter(i => i.amountARS > 0),
        ...extraItems.filter(e => e.amountARS > 0 && e.label.trim()),
      ];

      for (const item of manualLines) {
        const cat = categories.find((c: any) => c.name === item.categoryName);
        await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: tarjetaViejoAcc.id,
          date: settlementDate,
          description: `${item.label} — ${monthLabel}`,
          amount: -item.amountARS,
          currency: 'ARS',
          fx_rate: fxArsUsd,
          amount_usd: -(item.amountARS * fxArsUsd),
          type: 'expense' as const,
          category_id: cat?.id || null,
        });
      }

      // ── PASO 3: Pago total al viejo → Cash USD ───────────────────────
      // Build per-key breakdown (cards + manual items by item key) and
      // per-category aggregated breakdown (categoryName → ARS).
      const breakdown: Record<string, number> = {};
      for (const it of items) {
        if (it.amountARS > 0) breakdown[it.key] = (breakdown[it.key] || 0) + it.amountARS;
      }
      const extrasForNotes = extraItems
        .filter((e) => e.amountARS > 0 && e.label.trim())
        .map((e) => ({ label: e.label, amountARS: e.amountARS, categoryName: e.categoryName, emoji: e.emoji }));

      const categoryBreakdown: Record<string, number> = {};
      const addCat = (name: string | undefined, ars: number) => {
        if (!ars || ars <= 0) return;
        const key = (name && name.trim()) || 'Sin categoría';
        categoryBreakdown[key] = (categoryBreakdown[key] || 0) + ars;
      };
      for (const r of allPdfRows) addCat(r.categoryName, r.amountARS);
      for (const it of items.filter((i) => i.amountARS > 0)) addCat(it.categoryName, it.amountARS);
      for (const e of extrasForNotes) addCat(e.categoryName, e.amountARS);

      const settlementNotes = JSON.stringify({
        settlement: true,
        month: settlementMonth,
        tcBlue,
        totalARS,
        usdPagado: usdAPagar,
        vueltoARS,
        breakdown,
        extras: extrasForNotes,
        categoryBreakdown,
      });

      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: cashAcc.id,
        date: settlementDate,
        description: `Liquidación ${monthLabel} — viejo`,
        amount: -usdAPagar,
        currency: 'USD',
        fx_rate: 1,
        amount_usd: -usdAPagar,
        type: 'expense' as const,
        notes: settlementNotes,
      });

      // ── PASO 4: Vuelto esperado → pending_credit (no auto tx) ─────────
      // Clear prior pending credit for the same source+month, then insert.
      await supabase
        .from('pending_credits' as any)
        .delete()
        .eq('user_id', user.id)
        .eq('source', 'viejo_settlement')
        .eq('settlement_month', settlementMonth);

      if (vueltoARS > 0) {
        await supabase.from('pending_credits' as any).insert({
          user_id: user.id,
          amount_ars: vueltoARS,
          amount_usd: vueltoARS * fxArsUsd,
          source: 'viejo_settlement',
          expected_via_account_id: mpAcc.id,
          settlement_month: settlementMonth,
          status: 'pending',
        } as any);
        qc.invalidateQueries({ queryKey: ['pending-credits'] });
      }

      // ── Guardar defaults para el próximo mes ─────────────────────────
      const defaults: Record<string, any> = {};
      items.filter(i => i.editable).forEach(i => {
        defaults[i.key] = i.amountARS;
      });
      defaults.extras = extraItems
        .filter(e => e.label.trim())
        .map(e => ({ label: e.label, categoryName: e.categoryName, emoji: e.emoji }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));

      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      qc.invalidateQueries({ queryKey: ['liquidacion-history-all'] });
      qc.invalidateQueries({ queryKey: ['liquidacion-check'] });
      qc.invalidateQueries({ queryKey: ['import-log'] });
      setResultUsd(usdAPagar);
      setResultVuelto(vueltoARS);
      setStep(4);
    } catch (e: any) {
      toast.error(e.message || 'Error al confirmar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle className="capitalize">
            {step === 1 && 'Liquidar con el viejo — Subir PDFs'}
            {step === 2 && `Liquidar ${format(new Date(settlementMonth + '-01T00:00:00'), 'MMMM yyyy', { locale: es })} — Completar ítems`}
            {step === 3 && `Liquidar ${format(new Date(settlementMonth + '-01T00:00:00'), 'MMMM yyyy', { locale: es })} — Confirmar`}
            {step === 4 && 'Liquidación registrada'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-6 px-6">

        {step === 1 && (
          <>
            <div className="space-y-4 min-w-0 overflow-hidden">
              <div className="space-y-1.5">
                <Label className="text-xs">Mes a liquidar</Label>
                <Select value={settlementMonth} onValueChange={setSettlementMonth}>
                  <SelectTrigger className="w-full capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {monthOptions.map((m) => (
                      <SelectItem key={m.ym} value={m.ym} className="capitalize">{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Subí los PDFs disponibles. Los faltantes podés cargarlos manualmente en el siguiente paso.
              </p>
              <FileSlot label="BC mamá (resumen)" file={iebraFile} onChange={setIebraFile} />
              <FileSlot label="BC papá (resumen)" file={kollikerFile} onChange={setKollikerFile} />
              <FileSlot label="Santander VISA" file={santFile} onChange={setSantFile} />
              <FileSlot label="AMEX Santander" file={amexFile} onChange={setAmexFile} />
            </div>
            <DialogFooter className="border-t pt-4 mt-4 min-w-0">
              <Button onClick={handleProcessFiles} disabled={processing}>
                {processing ? 'Procesando...' : 'Continuar →'}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (() => {
          type Row = ParsedTransaction & { categoryName: string; selected: boolean };
          type RowSrc = 'iebra' | 'kolliker' | 'sant';
          const setterFor = (src: RowSrc) =>
            src === 'iebra' ? setIebraRows : src === 'kolliker' ? setKollikerRows : setSantRows;
          const rowsFor = (key: string): { rows: Row[]; src: RowSrc } | null => {
            if (key === 'visa_ciudad_mama') return { rows: iebraRows, src: 'iebra' };
            if (key === 'visa_ciudad_papa') return { rows: kollikerRows, src: 'kolliker' };
            if (key === 'visa_santander') return { rows: santRows, src: 'sant' };
            return null;
          };
          const renderPdfRows = (key: string) => {
            const data = rowsFor(key);
            if (!data || data.rows.length === 0) return null;
            const { rows, src } = data;
            const setter = setterFor(src);
            const arsIdx: number[] = [];
            const usdIdx: number[] = [];
            rows.forEach((r, i) => (r.matched ? usdIdx.push(i) : arsIdx.push(i)));
            const renderRow = (i: number) => {
              const r = rows[i];
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 last:border-0">
                  <input
                    type="checkbox"
                    checked={r.selected}
                    onChange={(e) => setter((prev) => prev.map((x, j) => j === i ? { ...x, selected: e.target.checked } : x))}
                    className="shrink-0 accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate font-medium">{r.description}</p>
                    <p className="text-[10px] text-muted-foreground">{r.date}</p>
                  </div>
                  <span className="text-xs font-mono text-foreground shrink-0 min-w-[80px] text-right">
                    {r.matched
                      ? 'US$' + r.amountUSD.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '$' + Math.round(r.amountARS).toLocaleString('es-AR')}
                  </span>
                  <Select
                    value={r.categoryName}
                    onValueChange={(v) => setter((prev) => prev.map((x, j) => j === i ? { ...x, categoryName: v } : x))}
                  >
                    <SelectTrigger className="w-24 h-7 text-[11px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(categories || []).map((c: any) => (
                        <SelectItem key={c.id} value={c.name} className="text-xs">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            };
            const expanded = !!expandedDetails[key];
            const selectedCount = rows.filter(r => r.selected).length;
            return (
              <div className="mt-1 mb-2 border rounded-lg overflow-hidden bg-muted/20">
                <button
                  type="button"
                  onClick={() => setExpandedDetails(prev => ({ ...prev, [key]: !prev[key] }))}
                  className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                >
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {expanded ? '▾' : '▸'} Detalle ({selectedCount}/{rows.length} seleccionadas)
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {arsIdx.length > 0 && `· ${arsIdx.length} ARS`}
                    {usdIdx.length > 0 && ` · ${usdIdx.length} USD`}
                  </span>
                </button>
                {expanded && (
                  <div>
                    {arsIdx.length > 0 && (
                      <>
                        <div className="px-3 py-1 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-b">
                          En ARS · {arsIdx.length}
                        </div>
                        {arsIdx.map(renderRow)}
                      </>
                    )}
                    {usdIdx.length > 0 && (
                      <>
                        <div className="px-3 py-1 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-t border-b">
                          En USD · {usdIdx.length}
                        </div>
                        {usdIdx.map(renderRow)}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          };
          return (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              BC: {formatARS(bcTotalARS)} ARS detectados · Santander: {formatARS(santTotalARS)} ARS detectados
            </p>
            <div className="space-y-1">
              {ITEM_GROUPS.map((group) => {
                const groupItems = group.items
                  .map((key) => items.find((it) => it.key === key))
                  .filter((it): it is SettlementItem => !!it);
                if (groupItems.length === 0) return null;
                return (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border/50">
                      {group.label}
                    </p>
                    {groupItems.map((it) => {
                      const autoFilled = !it.editable;
                      const isCard = CARD_KEYS.includes(it.key);
                      return (
                        <div key={it.key}>
                          <div className="flex items-center gap-3 py-2.5">
                            <span className="text-base w-6 shrink-0">{it.emoji}</span>
                            <span className={cn('text-sm flex-1 min-w-0 truncate', autoFilled ? 'text-foreground' : 'text-muted-foreground')}>
                              {it.label}
                              {autoFilled && <span className="ml-1 text-[10px] text-muted-foreground">🔒</span>}
                            </span>
                            {autoFilled ? (
                              <span className="text-sm font-mono text-foreground w-32 text-right shrink-0">{formatARS(it.amountARS)}</span>
                            ) : (
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={formatARS(it.amountARS)}
                                onChange={(e) => updateItem(it.key, { amountARS: parseARSInput(e.target.value) })}
                                className={cn('w-32 text-right text-sm h-8 shrink-0', NUMERIC_INPUT_CLS)}
                                placeholder="0"
                              />
                            )}
                            {!autoFilled && !isCard ? (
                              <Select value={it.categoryName} onValueChange={(v) => updateItem(it.key, { categoryName: v })}>
                                <SelectTrigger className="w-28 h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {(categories || []).map((c: any) => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="w-28 shrink-0" />
                            )}
                          </div>
                          {renderPdfRows(it.key)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {extraItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide py-2 border-b border-border/50">
                    ➕ Otros
                  </p>
                  {extraItems.map((extra) => (
                    <div key={extra.id} className="flex items-center gap-3 py-2.5">
                      <span className="text-base w-6 shrink-0">📌</span>
                      <Input
                        value={extra.label}
                        onChange={(e) => setExtraItems((prev) => prev.map((x) => x.id === extra.id ? { ...x, label: e.target.value } : x))}
                        className="flex-1 min-w-0 text-sm h-8"
                        placeholder="Concepto"
                      />
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={formatARS(extra.amountARS)}
                        onChange={(e) => {
                          const num = parseARSInput(e.target.value);
                          setExtraItems((prev) => prev.map((x) => x.id === extra.id ? { ...x, amountARS: num } : x));
                        }}
                        className={cn('w-28 text-right text-sm h-8 shrink-0', NUMERIC_INPUT_CLS)}
                        placeholder="0"
                      />
                      <Select
                        value={extra.categoryName}
                        onValueChange={(v) => setExtraItems((prev) => prev.map((x) => x.id === extra.id ? { ...x, categoryName: v } : x))}
                      >
                        <SelectTrigger className="w-28 h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(categories || []).map((c: any) => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                        </SelectContent>
                      </Select>
                      <button
                        type="button"
                        onClick={() => setExtraItems((prev) => prev.filter((x) => x.id !== extra.id))}
                        className="text-muted-foreground hover:text-destructive shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => setExtraItems((prev) => [...prev, {
                  id: crypto.randomUUID(),
                  label: '',
                  amountARS: 0,
                  categoryName: 'Casa',
                  emoji: '📌',
                }])}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 py-2 w-full"
              >
                <Plus className="h-4 w-4" /> Agregar concepto
              </button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Total ARS:</span><span className="font-mono">{formatARS(totalARS)}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">TC Blue:</span>
                <Input type="number" value={tcBlue} onChange={(e) => setTcBlue(parseFloat(e.target.value) || 0)} className={cn('h-7 text-xs text-right font-mono w-32', NUMERIC_INPUT_CLS)} />
              </div>
              <div className="border-t pt-2 flex items-center justify-between"><span className="text-muted-foreground">USD exacto:</span><span className="font-mono">${usdExacto.toFixed(2)}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">USD a pagar:</span>
                <Input type="number" value={usdAPagar} onChange={(e) => setUsdAPagar(parseFloat(e.target.value) || 0)} className={cn('h-7 text-xs text-right font-mono w-32', NUMERIC_INPUT_CLS)} />
              </div>
              <div className="border-t pt-2 flex items-center justify-between text-success"><span>Vuelto ARS:</span><span className="font-mono">+{formatARS(vueltoARS)}</span></div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>← Atrás</Button>
              <Button onClick={() => setStep(3)} disabled={usdAPagar <= 0}>Continuar →</Button>
            </div>
          </div>
          );
        })()}

        {step === 3 && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium mb-1">📋 Ítems contra "Tarjeta viejo":</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {items.filter((i) => i.editable && i.amountARS > 0).map((i) => (
                  <li key={i.key}>• {i.label} {formatARS(i.amountARS)} ARS → {i.categoryName}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium mb-1">💸 Pago al viejo:</p>
              <p className="text-xs text-muted-foreground">• Cash USD −${usdAPagar.toLocaleString()}</p>
            </div>
            {vueltoARS > 0 && (
              <div>
                <p className="font-medium mb-1">💰 Vuelto esperado:</p>
                <p className="text-xs text-muted-foreground">• Mercado Pago +{formatARS(vueltoARS)} ARS</p>
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>← Atrás</Button>
              <Button onClick={handleConfirm} disabled={submitting}>
                {submitting ? 'Registrando...' : 'Confirmar y registrar'}
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="rounded-md border p-4 bg-success/10 text-sm space-y-1">
              <p className="font-medium">✅ Liquidación registrada</p>
              <p>Pagaste ${resultUsd.toLocaleString()} USD al viejo</p>
              {resultVuelto > 0 && <p>{formatARS(resultVuelto)} ARS pendientes de ingresar a Mercado Pago</p>}
            </div>
            <div className="flex justify-between gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const monthLabel = format(new Date(settlementMonth + '-01T00:00:00'), 'MMMM yyyy', { locale: es });
                  const allRows = [
                    ...iebraRows.filter(r => r.selected),
                    ...kollikerRows.filter(r => r.selected),
                    ...santRows.filter(r => r.selected),
                  ];
                  const catBd: Record<string, number> = {};
                  const addC = (n: string | undefined, v: number) => {
                    if (!v || v <= 0) return;
                    const k = (n && n.trim()) || 'Sin categoría';
                    catBd[k] = (catBd[k] || 0) + v;
                  };
                  for (const r of allRows) addC(r.categoryName, r.amountARS);
                  for (const i of items.filter(x => x.amountARS > 0)) addC(i.categoryName, i.amountARS);
                  for (const e of extraItems.filter(x => x.amountARS > 0 && x.label.trim())) addC(e.categoryName, e.amountARS);
                  await downloadSettlementPdf({
                    monthLabel,
                    mamaRows: iebraRows.filter(r => r.selected),
                    papaRows: kollikerRows.filter(r => r.selected),
                    santRows: santRows.filter(r => r.selected),
                    manualItems: [
                      ...items.filter(i => i.editable && i.amountARS > 0).map(i => ({ label: i.label, amountARS: i.amountARS, categoryName: i.categoryName })),
                      ...extraItems.filter(e => e.amountARS > 0 && e.label.trim()).map(e => ({ label: e.label, amountARS: e.amountARS, categoryName: e.categoryName })),
                    ],
                    categoryBreakdown: catBd,
                    totalARS, tcBlue, usdAPagar: resultUsd, vueltoARS: resultVuelto,
                  }, `liquidacion-${settlementMonth}.pdf`);
                }}
              >
                <Download className="h-4 w-4 mr-1.5" /> Descargar PDF
              </Button>
              <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
            </div>
          </div>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FileSlot({ label, file, onChange, accept = '.pdf' }: { label: string; file: File | null; onChange: (f: File | null) => void; accept?: string }) {
  const acceptLabel = accept.replace(/^\./, '').toUpperCase().split(',')[0];
  return (
    <div className="overflow-hidden min-w-0 w-full" style={{ maxWidth: '100%' }}>
      <Label className="text-xs">{label}</Label>
      {file ? (
        <div style={{ maxWidth: '100%' }} className="mt-1 flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-muted/30 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              flex: 1,
            }}
            className="text-xs"
          >
            {file.name}
          </span>
          <button type="button" onClick={() => onChange(null)} className="shrink-0 ml-1">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <label className="mt-1 flex items-center justify-center rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 text-xs text-muted-foreground gap-2">
          <Upload className="h-3 w-3" /> Subir {acceptLabel}
          <input type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
        </label>
      )}
    </div>
  );
}

// ============================================================================
// Splitwise Settlement Wizard — 2 pasos
// ============================================================================

function SplitwiseSettlementWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: accounts } = useAccountBalances();
  const { data: categories } = useCategories();
  const arsToUsd = useLatestFxRate('ARS', 'USD');
  const qc = useQueryClient();
  const createTransfer = useCreateTransfer();

  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<(SplitwiseRow & { categoryName?: string | null })[]>([]);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payFromId, setPayFromId] = useState<string>('');
  const [splitwiseAccId, setSplitwiseAccId] = useState<string | null>(null);

  const splitwiseAcc = accounts?.find((a: any) => /splitwise/i.test(a.name));

  async function ensureSplitwiseAccount(userId: string): Promise<string> {
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .ilike('name', 'Splitwise')
      .eq('user_id', userId)
      .maybeSingle();
    if (existing?.id) return existing.id;
    const { data: created, error } = await supabase
      .from('accounts')
      .insert({
        user_id: userId,
        name: 'Splitwise',
        type: 'receivable',
        currency: 'USD',
        opening_balance: 0,
        is_active: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    return created.id;
  }
  const splitwiseBalance = Number(splitwiseAcc?.computed_balance_usd || 0);
  const splitwiseDebt = splitwiseBalance < 0 ? Math.abs(splitwiseBalance) : 0;

  useEffect(() => {
    if (!open) {
      setStep(1); setFile(null); setRows([]);
    }
  }, [open]);

  useEffect(() => {
    if (!payFromId && accounts) {
      const ars = accounts.find((a: any) => a.currency === 'ARS' && a.is_active);
      if (ars) setPayFromId(ars.id);
    }
  }, [accounts, payFromId]);

  async function handleProcess() {
    if (!file) return;
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const accId = await ensureSplitwiseAccount(user.id);
      setSplitwiseAccId(accId);
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      const text = await file.text();
      const parsed = parseSplitwise(text, 'nicolaskolliker', arsToUsd || 0);
      if (parsed.length === 0) {
        toast.error('No se encontraron gastos');
        setRows([]);
        return;
      }
      setRows(parsed.map((p) => ({ ...p, categoryName: inferCategoryName(p.description) })));
      toast.success(`${parsed.length} filas detectadas`);
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setProcessing(false);
    }
  }

  function updateCat(idx: number, name: string) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, categoryName: name } : r)));
  }

  async function doImport(alsoSettle: boolean) {
    if (!accounts) return;
    const cashUsd = accounts.find((a: any) => /cash/i.test(a.name) && a.currency === 'USD');
    if (!cashUsd) { toast.error('No se encontró Cash USD'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const expenses = rows.filter((r) => r.swType === 'expense');
      const receivables = rows.filter((r) => r.swType === 'receivable');

      const payload: any[] = [];
      for (const r of expenses) {
        const catId = r.categoryName ? (categories?.find((c: any) => c.name === r.categoryName)?.id || null) : null;
        payload.push({
          user_id: user.id,
          account_id: cashUsd.id,
          date: r.date,
          description: r.description,
          amount: -r.amountUSD,
          currency: 'USD',
          fx_rate: 1,
          amount_usd: -r.amountUSD,
          type: 'expense',
          external_id: r.external_id,
          category_id: catId,
        });
      }
      if (splitwiseAccId) {
        for (const r of receivables) {
          const catId = r.categoryName ? (categories?.find((c: any) => c.name === r.categoryName)?.id || null) : null;
          payload.push({
            user_id: user.id,
            account_id: splitwiseAccId,
            date: r.date,
            description: r.description,
            amount: -r.amountUSD,
            currency: 'USD',
            fx_rate: 1,
            amount_usd: -r.amountUSD,
            type: 'expense',
            external_id: r.external_id,
            category_id: catId,
          });
        }
      }
      if (payload.length > 0) {
        const { error } = await supabase.from('transactions').insert(payload);
        if (error) throw error;
      }

      if (alsoSettle && splitwiseAcc && splitwiseDebt > 0 && payFromId) {
        const fromAcc = accounts.find((a: any) => a.id === payFromId);
        const fromCurrency = fromAcc?.currency || 'USD';
        const fxRate = fromCurrency === 'USD' ? 1 : (arsToUsd || 0);
        const fromAmount = fromCurrency === 'USD' ? splitwiseDebt : (arsToUsd > 0 ? splitwiseDebt / arsToUsd : splitwiseDebt);
        await createTransfer.mutateAsync({
          fromAccountId: payFromId,
          toAccountId: splitwiseAcc.id,
          amount: fromAmount,
          fromCurrency,
          toCurrency: 'USD',
          fxRate,
          toAmount: splitwiseDebt,
          date: new Date().toISOString().slice(0, 10),
          description: 'Saldo Splitwise',
        });
      }

      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      toast.success(alsoSettle ? 'Importado y saldo cancelado' : 'Importado');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setSubmitting(false);
    }
  }

  const totalPaid = rows.filter((r) => r.swType === 'expense').reduce((s, r) => s + r.amountUSD, 0);
  const totalOwed = rows.filter((r) => r.swType === 'receivable').reduce((s, r) => s + r.amountUSD, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 1 ? 'Splitwise — Subir CSV' : 'Splitwise — Confirmar'}</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <FileSlot label="CSV de Splitwise" file={file} accept=".csv" onChange={(f) => { setFile(f); setRows([]); }} />
            {file && rows.length === 0 && (
              <Button onClick={handleProcess} disabled={processing}>{processing ? 'Procesando...' : 'Procesar CSV'}</Button>
            )}
            {rows.length > 0 && (
              <>
                <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Fecha</TableHead>
                        <TableHead className="text-xs">Descripción</TableHead>
                        <TableHead className="text-xs">Cat.</TableHead>
                        <TableHead className="text-xs text-right">Monto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs whitespace-nowrap">{r.date}</TableCell>
                          <TableCell className="text-xs">
                            <div className="truncate max-w-[140px]">{r.description}</div>
                            <Badge variant={r.swType === 'expense' ? 'default' : 'secondary'} className="text-[9px] mt-0.5">
                              {r.swType === 'expense' ? 'Vos pagaste' : 'Te deben'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Select value={r.categoryName || ''} onValueChange={(v) => updateCat(idx, v)}>
                              <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="—" /></SelectTrigger>
                              <SelectContent>
                                {(categories || []).map((c: any) => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-xs text-right font-mono">${r.amountUSD.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)}>Continuar →</Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 text-sm">
            <div className="space-y-1">
              <p>Gastos donde vos pagaste: <span className="font-mono">${totalPaid.toFixed(2)}</span> (expense desde Cash USD)</p>
              <p>Gastos donde otros pagaron: <span className="font-mono">${totalOwed.toFixed(2)}</span> (acumulado en Splitwise)</p>
            </div>
            {splitwiseAcc && splitwiseDebt > 0 && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs">Saldo actual Splitwise: <span className="font-mono text-destructive">−${splitwiseDebt.toFixed(2)}</span></p>
                <div>
                  <Label className="text-xs">Pagar desde</Label>
                  <Select value={payFromId} onValueChange={setPayFromId}>
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(accounts || []).filter((a: any) => a.is_active && !/splitwise/i.test(a.name)).map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Monto: ${splitwiseDebt.toFixed(2)} USD
                  {arsToUsd > 0 && ` ≈ ARS ${(splitwiseDebt / arsToUsd).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                </p>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>← Atrás</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => doImport(false)} disabled={submitting}>Solo importar</Button>
                {splitwiseAcc && splitwiseDebt > 0 && (
                  <Button onClick={() => doImport(true)} disabled={submitting || !payFromId}>Importar y saldar</Button>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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

// ============================================================================
// Viejo — Historial de ciclos
// ============================================================================

const ITEM_META: Record<string, { label: string; emoji: string }> = {
  visa_ciudad: { label: 'VISA Ciudad', emoji: '🏦' },
  visa_ciudad_mama: { label: 'VISA Ciudad — Mamá', emoji: '🏦' },
  visa_ciudad_papa: { label: 'VISA Ciudad — Papá', emoji: '🏦' },
  visa_santander: { label: 'VISA Santander', emoji: '🏦' },
  amex: { label: 'AMEX Santander', emoji: '💳' },
  expensas: { label: 'Expensas', emoji: '🏠' },
  prestamo: { label: 'Préstamo + Seguro', emoji: '🚗' },
  cochera: { label: 'Cochera + Lavado', emoji: '🅿️' },
  patente: { label: 'Patente', emoji: '📋' },
  multa: { label: 'Multa', emoji: '⚠️' },
  obra_social: { label: 'Obra Social', emoji: '❤️' },
};

const CARD_KEYS = ['visa_ciudad', 'visa_ciudad_mama', 'visa_ciudad_papa', 'visa_santander', 'amex'];

type RangeFilter = '6' | '12' | '24' | 'all';

function ViejoCycleHistory({ importLog }: { importLog: any[] }) {
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

function SettlementDetail({ parsed }: { parsed: any }) {
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
            <span className="font-mono">{formatARS(parsed.vueltoARS)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
