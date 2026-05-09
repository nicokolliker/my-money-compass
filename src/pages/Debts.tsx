import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, CheckCircle2, X, Plus } from 'lucide-react';
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
import { parseBancoCiudad, parseBancoCiudadObSoc, extractCardTotal } from '@/lib/importers/bancoCiudadParser';
import { parseSantander } from '@/lib/importers/santanderParser';
import { parseSplitwise, type SplitwiseRow } from '@/lib/importers/splitwiseParser';
import { inferCategoryName } from '@/hooks/useRuleSuggestions';
import { useImportLog } from '@/hooks/useImportLog';

async function extractPdfText(file: File): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      // Limpiar instancia previa si tiene versión incorrecta
      if ((window as any).pdfjsLib?.version && (window as any).pdfjsLib.version !== '3.11.174') {
        delete (window as any).pdfjsLib;
      }

      if (!(window as any).pdfjsLib) {
        await new Promise<void>((res, rej) => {
          const existing = document.querySelector('script[data-pdfjs]');
          if (existing) { res(); return; }
          const script = document.createElement('script');
          script.setAttribute('data-pdfjs', '3.11.174');
          script.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
          script.onload = () => res();
          script.onerror = () => rej(new Error('No se pudo cargar pdf.js'));
          document.head.appendChild(script);
        });
      }

      const pdfjs = (window as any).pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      resolve(text);
    } catch (e) {
      reject(e);
    }
  });
}

export default function DebtsPage() {
  const { data: accounts } = useAccountBalances();
  const { data: importLog } = useImportLog();
  const [openViejo, setOpenViejo] = useState(false);
  const [openSw, setOpenSw] = useState(false);
  const [transferTarget, setTransferTarget] = useState<any>(null);

  const viejoAccount = useMemo(() =>
    accounts?.find((a: any) => /viejo/i.test(a.name)) || null,
  [accounts]);

  const splitwiseAccount = useMemo(() =>
    accounts?.find((a: any) => /splitwise/i.test(a.name)) || null,
  [accounts]);

  const otherDebts = useMemo(() =>
    (accounts || []).filter((a: any) =>
      ['debt', 'credit_card'].includes(a.type) &&
      !/viejo|splitwise/i.test(a.name)
    ),
  [accounts]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deudas</h1>
        <p className="text-sm text-muted-foreground">Revisión y liquidación mensual</p>
      </div>

      {viejoAccount && (
        <ViejoDebtCard
          account={viejoAccount}
          importLog={importLog || []}
          onOpen={() => setOpenViejo(true)}
        />
      )}

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
            <Button variant="outline" className="w-full" onClick={() => setOpenSw(true)}>
              Cargar CSV de Splitwise →
            </Button>
          </CardContent>
        </Card>
      )}

      {otherDebts.map((a: any) => (
        <SimpleDebtCard key={a.id} account={a} onTransfer={() => setTransferTarget(a)} />
      ))}

      {!viejoAccount && !splitwiseAccount && otherDebts.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground text-center">
            No tenés cuentas de deuda activas. Creá una en Accounts con tipo "Debt".
          </CardContent>
        </Card>
      )}

      <ViejoSettlementWizard open={openViejo} onOpenChange={setOpenViejo} />
      <SplitwiseSettlementWizard open={openSw} onOpenChange={setOpenSw} />
      <TransferDialog account={transferTarget} onClose={() => setTransferTarget(null)} />
    </div>
  );
}

function ViejoDebtCard({ account, importLog, onOpen }: {
  account: any; importLog: any[]; onOpen: () => void;
}) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const balance = Number(account.computed_balance_usd || 0);
  const isDebt = balance < -0.5;

  const bcImportado = importLog.some(l =>
    ['banco_ciudad', 'santander'].includes(l.source) && l.month === currentMonth
  );

  const { data: liquidacionTxs } = useQuery({
    queryKey: ['liquidacion-check', currentMonth],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('id, description, amount_usd')
        .ilike('description', '%Liquidación%')
        .gte('date', currentMonth + '-01');
      return data || [];
    },
  });

  const yaLiquidado = (liquidacionTxs || []).length > 0;
  const liquidadoUSD = yaLiquidado
    ? Math.abs(Number(liquidacionTxs?.[0]?.amount_usd || 0))
    : 0;

  const steps = [
    {
      n: 1,
      label: 'Cargar resúmenes',
      sublabel: 'Banco Ciudad + Santander',
      done: bcImportado,
      status: bcImportado ? 'Importado este mes' : 'Pendiente',
    },
    {
      n: 2,
      label: 'Completar gastos manuales',
      sublabel: 'Expensas, Obra Social, Préstamo, Cochera...',
      done: bcImportado && yaLiquidado,
      status: yaLiquidado ? 'Completado' : bcImportado ? 'Listo para completar' : 'Esperando paso 1',
    },
    {
      n: 3,
      label: 'Pagar en Cash USD',
      sublabel: 'Vuelto ARS pendiente en Mercado Pago',
      done: yaLiquidado,
      status: yaLiquidado ? `Liquidado: ${formatUSD(liquidadoUSD)}` : 'Pendiente',
    },
  ];

  const ctaLabel = yaLiquidado
    ? 'Ver liquidación del mes'
    : bcImportado
      ? 'Continuar — completar y liquidar →'
      : 'Empezar ciclo del mes →';

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <MerchantLogo name={account.name} size={40} />
            <div className="min-w-0">
              <p className="font-semibold text-base">Viejo</p>
              <p className="text-xs text-muted-foreground capitalize">
                Ciclo {format(new Date(), 'MMMM yyyy', { locale: es })}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={cn('text-xl font-bold font-mono', isDebt ? 'text-destructive' : 'text-success')}>
              {isDebt ? '-' : ''}{formatUSD(Math.abs(balance))}
            </p>
            <p className="text-[10px] text-muted-foreground">deuda acumulada</p>
          </div>
        </div>

        <div className="divide-y divide-border border-y">
          {steps.map(step => (
            <div key={step.n} className="flex items-center gap-3 py-3">
              <div className={cn(
                'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                step.done ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
              )}>
                {step.done ? '✓' : step.n}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', step.done ? 'text-foreground' : 'text-foreground')}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.sublabel}</p>
              </div>
              <Badge variant={step.done ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                {step.status}
              </Badge>
            </div>
          ))}
        </div>

        <Button onClick={onOpen} className="w-full">{ctaLabel}</Button>
      </CardContent>
    </Card>
  );
}

function SplitwiseDebtCard({ account, importLog, onOpen }: {
  account: any; importLog: any[]; onOpen: () => void;
}) {
  const currentMonth = format(new Date(), 'yyyy-MM');
  const balance = Number(account.computed_balance_usd || 0);
  const teDebenAVos = balance > 0.5;
  const vosDebes = balance < -0.5;

  const swImports = (importLog || [])
    .filter(l => l.source === 'splitwise')
    .sort((a, b) => b.month.localeCompare(a.month));
  const lastImport = swImports[0];
  const importadoEsteMes = lastImport?.month === currentMonth;

  const steps = [
    {
      n: 1,
      label: 'Cargar CSV del mes',
      sublabel: 'splitwise.com → Tu grupo → Exportar',
      done: importadoEsteMes,
      status: importadoEsteMes
        ? 'Importado este mes'
        : lastImport
          ? `Último: ${lastImport.month}`
          : 'Sin datos aún',
    },
    {
      n: 2,
      label: 'Revisar gastos y categorías',
      sublabel: 'Confirmá en qué se gastó y quién pagó',
      done: importadoEsteMes,
      status: importadoEsteMes ? 'Revisado' : 'Pendiente',
    },
    {
      n: 3,
      label: 'Saldar deuda',
      sublabel: 'Transferencia desde tu cuenta ARS',
      done: !vosDebes,
      status: vosDebes
        ? `Debés ${formatUSD(Math.abs(balance))}`
        : teDebenAVos
          ? `Te deben ${formatUSD(balance)}`
          : 'Al día ✓',
    },
  ];

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <MerchantLogo name="Splitwise" domain="splitwise.com" size={40} />
            <div className="min-w-0">
              <p className="font-semibold text-base">Splitwise</p>
              <p className="text-xs text-muted-foreground">
                {lastImport
                  ? `Última actualización: ${lastImport.month}`
                  : 'Sin datos aún'}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            {!teDebenAVos && !vosDebes && (
              <Badge variant="secondary">Al día ✓</Badge>
            )}
            {teDebenAVos && (
              <>
                <p className="text-xl font-bold font-mono text-success">+{formatUSD(balance)}</p>
                <p className="text-[10px] text-muted-foreground">te deben</p>
              </>
            )}
            {vosDebes && (
              <>
                <p className="text-xl font-bold font-mono text-destructive">-{formatUSD(Math.abs(balance))}</p>
                <p className="text-[10px] text-muted-foreground">debés</p>
              </>
            )}
          </div>
        </div>

        <div className="divide-y divide-border border-y">
          {steps.map(step => (
            <div key={step.n} className="flex items-center gap-3 py-3">
              <div className={cn(
                'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold',
                step.done ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
              )}>
                {step.done ? '✓' : step.n}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{step.label}</p>
                <p className="text-xs text-muted-foreground">{step.sublabel}</p>
              </div>
              <Badge variant={step.done ? 'secondary' : 'outline'} className="text-[10px] shrink-0">
                {step.status}
              </Badge>
            </div>
          ))}
        </div>

        <Button onClick={onOpen} className="w-full">
          {importadoEsteMes ? 'Actualizar / saldar →' : 'Cargar CSV de este mes →'}
        </Button>
      </CardContent>
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
  return n ? Math.round(n).toLocaleString('es-AR') : '';
}

function parseARSInput(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
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
  { label: '🏦 Tarjetas', items: ['visa_ciudad', 'visa_santander', 'amex'] },
  { label: '🏠 Casa', items: ['expensas'] },
  { label: '🚗 Auto', items: ['prestamo', 'cochera', 'patente', 'multa'] },
  { label: '❤️ Salud', items: ['obra_social'] },
];

function ViejoSettlementWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: accounts } = useAccountBalances();
  const { data: categories } = useCategories();
  const { data: blueRate } = useBlueDollarRate();
  const arsToUsd = useLatestFxRate('ARS', 'USD');
  const qc = useQueryClient();

  const defaultBlueRate = blueRate?.blue_avg ? Math.round(blueRate.blue_avg) : (arsToUsd > 0 ? Math.round(1 / arsToUsd) : 1390);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [iebraFile, setIebraFile] = useState<File | null>(null);
  const [kollikerFile, setKollikerFile] = useState<File | null>(null);
  const [santFile, setSantFile] = useState<File | null>(null);
  const [bcTotalARS, setBcTotalARS] = useState(0);
  const [santTotalARS, setSantTotalARS] = useState(0);
  const [visaCiudadARS, setVisaCiudadARS] = useState(0);
  const [obSocARS, setObSocARS] = useState(0);
  const [processing, setProcessing] = useState(false);

  const [items, setItems] = useState<SettlementItem[]>([]);
  const [extraItems, setExtraItems] = useState<ExtraItem[]>([]);
  const [tcBlue, setTcBlue] = useState(defaultBlueRate);
  const [usdAPagar, setUsdAPagar] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [resultUsd, setResultUsd] = useState(0);
  const [resultVuelto, setResultVuelto] = useState(0);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setIebraFile(null); setKollikerFile(null); setSantFile(null);
      setBcTotalARS(0); setSantTotalARS(0); setVisaCiudadARS(0); setObSocARS(0);
      setExtraItems([]);
    }
  }, [open]);

  useEffect(() => {
    if (step !== 2) return;
    let saved: any = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
    setItems([
      { key: 'visa_ciudad',    label: 'VISA Ciudad',       emoji: '🏦', amountARS: visaCiudadARS || bcTotalARS, editable: (visaCiudadARS || bcTotalARS) === 0, categoryName: 'Casa' },
      { key: 'visa_santander', label: 'VISA Santander',    emoji: '🏦', amountARS: santTotalARS || saved.visa_santander || 0, editable: santTotalARS === 0, categoryName: 'Casa' },
      { key: 'amex',           label: 'AMEX Santander',    emoji: '💳', amountARS: saved.amex || 0,        editable: true, categoryName: 'Casa' },
      { key: 'expensas',       label: 'Expensas',          emoji: '🏠', amountARS: saved.expensas || 0,    editable: true, categoryName: 'Casa' },
      { key: 'prestamo',       label: 'Préstamo + Seguro', emoji: '🚗', amountARS: saved.prestamo || 0,    editable: true, categoryName: 'Auto' },
      { key: 'cochera',        label: 'Cochera + Lavado',  emoji: '🅿️', amountARS: saved.cochera || 0,     editable: true, categoryName: 'Auto' },
      { key: 'patente',        label: 'Patente',           emoji: '📋', amountARS: saved.patente || 0,     editable: true, categoryName: 'Auto' },
      { key: 'multa',          label: 'Multa',             emoji: '⚠️', amountARS: saved.multa || 0,       editable: true, categoryName: 'Auto' },
      { key: 'obra_social',    label: 'Obra Social',       emoji: '❤️', amountARS: obSocARS || saved.obra_social || 0, editable: true, categoryName: 'Salud' },
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
  }, [step, bcTotalARS, santTotalARS, visaCiudadARS, obSocARS, defaultBlueRate]);

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
      let bc = 0, sant = 0;
      let visaCiudad = 0;
      let obSoc = 0;
      const fxFallback = arsToUsd || 0.00072;
      if (iebraFile) {
        const iebraText = await extractPdfText(iebraFile);
        const rows = parseBancoCiudad(iebraText, arsToUsd || 0);
        bc += rows.reduce((s, r) => s + r.amountARS, 0);
        const { ars: visaCiudadARSExtract, usd: visaCiudadUSD } = extractCardTotal(iebraText, '1689');
        visaCiudad = visaCiudadARSExtract + (visaCiudadUSD > 0 ? visaCiudadUSD / fxFallback : 0);
      }
      if (kollikerFile) {
        const kollikerText = await extractPdfText(kollikerFile);
        const rows = parseBancoCiudadObSoc(kollikerText, fxFallback);
        bc += rows.reduce((s, r) => s + r.amountARS, 0);
        obSoc = rows.reduce((s, t) => s + t.amountARS, 0);
      }
      if (santFile) {
        const text = await extractPdfText(santFile);
        const rows = parseSantander(text, arsToUsd || 0);
        sant = rows.reduce((s, r) => s + r.amountARS, 0);
      }
      setBcTotalARS(bc);
      setSantTotalARS(sant);
      setVisaCiudadARS(visaCiudad);
      setObSocARS(obSoc);
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
      const today = new Date().toISOString().split('T')[0];
      const monthLabel = format(new Date(), 'MMMM yyyy', { locale: es });

      const tarjetaViejoAcc = accounts.find((a: any) => /viejo|tarjeta.*viejo/i.test(a.name));
      const cashAcc = accounts.find((a: any) => /cash/i.test(a.name) && a.currency === 'USD');
      const mpAcc = accounts.find((a: any) => /mercado.*pago|mercadopago/i.test(a.name));
      if (!tarjetaViejoAcc || !cashAcc || !mpAcc) {
        toast.error('Faltan cuentas: Tarjeta viejo, Cash USD y Mercado Pago');
        setSubmitting(false);
        return;
      }
      const editableItems = items.filter((i) => i.editable && i.amountARS > 0);
      const validExtras = extraItems.filter((e) => e.amountARS > 0 && e.label.trim());
      const fxArsUsd = arsToUsd || (tcBlue > 0 ? 1 / tcBlue : 0);

      const allManualItems: { label: string; amountARS: number; categoryName: string }[] = [
        ...editableItems.map((i) => ({ label: i.label, amountARS: i.amountARS, categoryName: i.categoryName })),
        ...validExtras.map((e) => ({ label: e.label, amountARS: e.amountARS, categoryName: e.categoryName })),
      ];

      for (const item of allManualItems) {
        const cat = categories.find((c: any) => c.name === item.categoryName);
        await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: tarjetaViejoAcc.id,
          date: today,
          description: `${item.label} — ${monthLabel}`,
          amount: -item.amountARS,
          currency: 'ARS',
          fx_rate: fxArsUsd,
          amount_usd: -(item.amountARS * fxArsUsd),
          type: 'expense' as const,
          category_id: cat?.id || null,
        });
      }

      await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: cashAcc.id,
        date: today,
        description: `Liquidación ${monthLabel} — viejo`,
        amount: -usdAPagar,
        currency: 'USD',
        fx_rate: 1,
        amount_usd: -usdAPagar,
        type: 'expense' as const,
        notes: JSON.stringify({
          settlement: true,
          month: format(new Date(), 'yyyy-MM'),
          breakdown: Object.fromEntries(items.filter((i) => i.amountARS > 0).map((i) => [i.key, i.amountARS])),
          tcBlue, totalARS, usdPagado: usdAPagar, vueltoARS,
        }),
      });

      if (vueltoARS > 0) {
        await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: mpAcc.id,
          date: today,
          description: `Vuelto liquidación ${monthLabel} — viejo`,
          amount: vueltoARS,
          currency: 'ARS',
          fx_rate: fxArsUsd,
          amount_usd: vueltoARS * fxArsUsd,
          type: 'income' as const,
          notes: `vuelto_settlement_${format(new Date(), 'yyyy-MM')}`,
        });
      }

      const defaults: Record<string, any> = {};
      items.filter((i) => i.editable).forEach((i) => {
        defaults[i.key] = i.amountARS;
      });
      defaults.extras = extraItems
        .filter((e) => e.label.trim())
        .map((e) => ({ label: e.label, categoryName: e.categoryName, emoji: e.emoji }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));

      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && 'Liquidar con el viejo — Subir PDFs'}
            {step === 2 && 'Liquidar con el viejo — Completar ítems'}
            {step === 3 && 'Liquidar con el viejo — Confirmar'}
            {step === 4 && 'Liquidación registrada'}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Subí los PDFs disponibles. Los faltantes podés cargarlos manualmente en el siguiente paso.
            </p>
            <FileSlot label="BC IEBRA (1689)" file={iebraFile} onChange={setIebraFile} />
            <FileSlot label="BC KOLLIKER (8157)" file={kollikerFile} onChange={setKollikerFile} />
            <FileSlot label="Santander VISA" file={santFile} onChange={setSantFile} />
            <div className="flex justify-end pt-2">
              <Button onClick={handleProcessFiles} disabled={processing}>
                {processing ? 'Procesando...' : 'Continuar →'}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              BC: ${bcTotalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS detectados · Santander: ${santTotalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS detectados
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
                      return (
                        <div key={it.key} className="flex items-center gap-3 py-2.5">
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
                          {!autoFilled ? (
                            <Select value={it.categoryName} onValueChange={(v) => updateItem(it.key, { categoryName: v })}>
                              <SelectTrigger className="w-28 h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(categories || []).map((c: any) => (<SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground w-28 shrink-0">{it.categoryName}</span>
                          )}
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
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Total ARS:</span><span className="font-mono">${totalARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">TC Blue:</span>
                <Input type="number" value={tcBlue} onChange={(e) => setTcBlue(parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right font-mono w-32" />
              </div>
              <div className="border-t pt-2 flex items-center justify-between"><span className="text-muted-foreground">USD exacto:</span><span className="font-mono">${usdExacto.toFixed(2)}</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">USD a pagar:</span>
                <Input type="number" value={usdAPagar} onChange={(e) => setUsdAPagar(parseFloat(e.target.value) || 0)} className="h-7 text-xs text-right font-mono w-32" />
              </div>
              <div className="border-t pt-2 flex items-center justify-between text-success"><span>Vuelto ARS:</span><span className="font-mono">+${vueltoARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span></div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>← Atrás</Button>
              <Button onClick={() => setStep(3)} disabled={usdAPagar <= 0}>Continuar →</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-medium mb-1">📋 Ítems contra "Tarjeta viejo":</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {items.filter((i) => i.editable && i.amountARS > 0).map((i) => (
                  <li key={i.key}>• {i.label} ${i.amountARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS → {i.categoryName}</li>
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
                <p className="text-xs text-muted-foreground">• Mercado Pago +ARS {vueltoARS.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</p>
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
              {resultVuelto > 0 && <p>ARS {resultVuelto.toLocaleString('es-AR')} pendientes de ingresar a Mercado Pago</p>}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FileSlot({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div className="overflow-hidden">
      <Label className="text-xs">{label}</Label>
      {file ? (
        <div className="mt-1 flex items-center gap-2 rounded-md border p-2 overflow-hidden">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <span className="text-xs text-foreground truncate min-w-0 flex-1">
            {file.name}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <label className="mt-1 flex items-center justify-center rounded-md border border-dashed p-3 cursor-pointer hover:bg-muted/50 text-xs text-muted-foreground gap-2">
          <Upload className="h-3 w-3" /> Subir PDF
          <input type="file" accept=".pdf" className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
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
            <FileSlot label="CSV de Splitwise" file={file} onChange={(f) => { setFile(f); setRows([]); }} />
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
