import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSpreadsheet, Upload, CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAccounts } from '@/hooks/useAccounts';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { parseArqStatements, type ParsedTransaction } from '@/lib/importers/arqParser';
import { parseMercadoPago } from '@/lib/importers/mercadoPagoParser';
import { useImportLog } from '@/hooks/useImportLog';
import { MerchantLogo } from '@/components/MerchantLogo';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';


pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

async function extractPdfText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(' ') + '\n';
  }
  return text;
}

interface PreviewRow extends ParsedTransaction {
  selected: boolean;
  duplicate: boolean;
}

const MONTH_LABELS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function detectPredominantMonth(txs: { date: string }[]): string {
  const counts = new Map<string, number>();
  for (const t of txs) {
    const m = (t.date || '').slice(0, 7);
    if (!m) continue;
    counts.set(m, (counts.get(m) || 0) + 1);
  }
  let best = '';
  let max = 0;
  for (const [m, c] of counts) {
    if (c > max) {
      max = c;
      best = m;
    }
  }
  return best || new Date().toISOString().slice(0, 7);
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_LABELS_FULL[m - 1]} ${y}`;
}

function MonthConfirm({
  month,
  onChange,
  count,
}: {
  month: string;
  onChange: (m: string) => void;
  count: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground text-xs">Resumen detectado:</span>
      <span className="font-medium text-foreground">{formatMonth(month)}</span>
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => onChange(shiftMonth(month, -1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => onChange(shiftMonth(month, 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">— {count} transacciones encontradas</span>
    </div>
  );
}

function FileDropzone({
  label,
  file,
  onFile,
  accept = 'application/pdf',
  acceptLabel = 'PDF',
}: {
  label: string;
  file: File | null;
  onFile: (f: File | null) => void;
  accept?: string;
  acceptLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className="border-2 border-dashed border-border rounded-lg p-4 flex flex-col items-center gap-2 hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
      <p className="text-xs font-medium text-foreground">{label}</p>
      {file ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate max-w-[180px]">{file.name}</span>
          <button onClick={(e) => { e.stopPropagation(); onFile(null); }} className="text-muted-foreground hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">Arrastrá o hacé click ({acceptLabel})</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
      />
    </div>
  );
}

const PdfDropzone = (props: { label: string; file: File | null; onFile: (f: File | null) => void }) => (
  <FileDropzone {...props} accept="application/pdf" acceptLabel="PDF" />
);

export default function ImportPage() {
  const { data: accounts } = useAccounts();
  const arsToUsd = useLatestFxRate('ARS', 'USD');

  const [arsFile, setArsFile] = useState<File | null>(null);
  const [usdFile, setUsdFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  const arqAccount = useMemo(() => {
    if (!accounts) return null;
    return (
      accounts.find((a) => a.currency === 'ARS' && /arq|dolarapp/i.test(a.name)) ||
      accounts.find((a) => /arq|dolarapp/i.test(a.name)) ||
      null
    );
  }, [accounts]);

  const [arqMonth, setArqMonth] = useState<string>('');
  const qc = useQueryClient();

  async function handleProcess() {
    if (!arsFile) {
      toast.error('Subí el estado ARS');
      return;
    }
    setProcessing(true);
    setResultMsg(null);
    try {
      const [arsText, usdText] = await Promise.all([
        extractPdfText(arsFile),
        usdFile ? extractPdfText(usdFile) : Promise.resolve(''),
      ]);
      const parsed = parseArqStatements(usdText, arsText, arsToUsd || 0);
      if (parsed.length === 0) {
        toast.error('No se encontraron transacciones en el PDF');
        setRows([]);
        return;
      }

      // Detect duplicates by external_id
      const ids = parsed.map((p) => p.external_id);
      const { data: existing } = await supabase
        .from('transactions')
        .select('external_id')
        .in('external_id', ids);
      const dupSet = new Set((existing || []).map((r: any) => r.external_id));

      setRows(
        parsed.map((p) => ({
          ...p,
          duplicate: dupSet.has(p.external_id),
          selected: !dupSet.has(p.external_id) && p.type !== 'transfer',
        })),
      );
      setArqMonth(detectPredominantMonth(parsed));
      toast.success(`${parsed.length} transacciones detectadas`);
    } catch (e: any) {
      toast.error(e.message || 'Error al procesar PDF');
    } finally {
      setProcessing(false);
    }
  }

  function toggleRow(i: number) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)));
  }

  async function handleImport() {
    if (!arqAccount) {
      toast.error('No se encontró cuenta ARQ/DolarApp en ARS');
      return;
    }
    const toImport = rows.filter((r) => r.selected && !r.duplicate);
    if (toImport.length === 0) {
      toast.error('Seleccioná al menos una fila');
      return;
    }
    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload = toImport.map((r) => {
        const fxRate = r.amountARS > 0 ? r.amountUSD / r.amountARS : (arsToUsd || 0);
        const isTransfer = r.type === 'transfer';
        return {
          user_id: user.id,
          account_id: arqAccount.id,
          date: r.date,
          description: r.description,
          merchant: r.transferTarget || r.description,
          amount: -r.amountARS,
          currency: 'ARS',
          fx_rate: fxRate,
          amount_usd: -r.amountUSD,
          type: isTransfer ? ('transfer' as const) : ('expense' as const),
          external_id: r.external_id,
          raw_imported_description: r.description,
        };
      });

      const { error } = await supabase.from('transactions').insert(payload);
      if (error) throw error;

      if (arqMonth) {
        await supabase.from('import_log').upsert(
          {
            user_id: user.id,
            source: 'arq',
            month: arqMonth,
            transaction_count: toImport.length,
            imported_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,source,month' },
        );
        qc.invalidateQueries({ queryKey: ['import-log'] });
      }

      const dupCount = rows.filter((r) => r.duplicate).length;
      setResultMsg(`${toImport.length} transacciones importadas, ${dupCount} duplicados ignorados`);
      toast.success('Importación completa');
      setRows([]);
      setArqMonth('');
      setArsFile(null);
      setUsdFile(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setImporting(false);
    }
  }

  const selectedCount = rows.filter((r) => r.selected && !r.duplicate).length;
  const dupCount = rows.filter((r) => r.duplicate).length;

  // ---- MercadoPago state ----
  const [mpFile, setMpFile] = useState<File | null>(null);
  const [mpProcessing, setMpProcessing] = useState(false);
  const [mpRows, setMpRows] = useState<PreviewRow[]>([]);
  const [mpImporting, setMpImporting] = useState(false);
  const [mpResultMsg, setMpResultMsg] = useState<string | null>(null);
  const [mpMonth, setMpMonth] = useState<string>('');

  const mpAccount = useMemo(
    () => accounts?.find((a) => /mercado\s*pago|mercadopago/i.test(a.name)) || null,
    [accounts],
  );

  async function handleMpProcess() {
    if (!mpFile) return;
    setMpProcessing(true);
    setMpResultMsg(null);
    try {
      const buf = await mpFile.arrayBuffer();
      const parsed = parseMercadoPago(buf, arsToUsd || 0);
      if (parsed.length === 0) {
        toast.error('No se encontraron transacciones');
        setMpRows([]);
        return;
      }
      const ids = parsed.map((p) => p.external_id);
      const { data: existing } = await supabase
        .from('transactions')
        .select('external_id')
        .in('external_id', ids);
      const dupSet = new Set((existing || []).map((r: any) => r.external_id));
      setMpRows(
        parsed.map((p) => ({
          ...p,
          duplicate: dupSet.has(p.external_id),
          selected: !dupSet.has(p.external_id),
        })),
      );
      setMpMonth(detectPredominantMonth(parsed));
      toast.success(`${parsed.length} transacciones detectadas`);
    } catch (e: any) {
      toast.error(e.message || 'Error al procesar archivo');
    } finally {
      setMpProcessing(false);
    }
  }

  async function handleMpImport() {
    if (!mpAccount) {
      toast.error('No se encontró cuenta MercadoPago');
      return;
    }
    const toImport = mpRows.filter((r) => r.selected && !r.duplicate);
    if (toImport.length === 0) return;
    setMpImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const fxRate = arsToUsd || 0;
      const payload = toImport.map((r) => {
        const isIncome = r.type === 'income';
        const sign = isIncome ? 1 : -1;
        return {
          user_id: user.id,
          account_id: mpAccount.id,
          date: r.date,
          description: r.description,
          merchant: r.description,
          amount: sign * r.amountARS,
          currency: 'ARS',
          fx_rate: fxRate,
          amount_usd: sign * r.amountUSD,
          type: (isIncome ? 'income' : 'expense') as any,
          external_id: r.external_id,
          raw_imported_description: r.description,
        };
      });
      const { error } = await supabase.from('transactions').insert(payload);
      if (error) throw error;
      if (mpMonth) {
        await supabase.from('import_log').upsert(
          {
            user_id: user.id,
            source: 'mercadopago',
            month: mpMonth,
            transaction_count: toImport.length,
            imported_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,source,month' },
        );
        qc.invalidateQueries({ queryKey: ['import-log'] });
      }
      const dups = mpRows.filter((r) => r.duplicate).length;
      setMpResultMsg(`${toImport.length} transacciones importadas, ${dups} duplicados ignorados`);
      toast.success('Importación completa');
      setMpRows([]);
      setMpMonth('');
      setMpFile(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setMpImporting(false);
    }
  }

  const mpSelectedCount = mpRows.filter((r) => r.selected && !r.duplicate).length;
  const mpDupCount = mpRows.filter((r) => r.duplicate).length;



  // ---- Wise CSV state ----
  const wiseSectionRef = useRef<HTMLDivElement>(null);
  const [wiseFile, setWiseFile] = useState<File | null>(null);
  const [wiseProcessing, setWiseProcessing] = useState(false);
  const [wiseRows, setWiseRows] = useState<(PreviewRow & { _currency?: string; _amount?: number })[]>([]);
  const [wiseImporting, setWiseImporting] = useState(false);
  const [wiseResultMsg, setWiseResultMsg] = useState<string | null>(null);
  const [wiseMonth, setWiseMonth] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('section=wise')) {
      setTimeout(() => wiseSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    }
  }, []);

  async function handleWiseProcess() {
    if (!wiseFile) return;
    setWiseProcessing(true);
    setWiseResultMsg(null);
    try {
      const text = await wiseFile.text();
      const { parseWiseCsv } = await import('@/lib/importers/wiseCsvParser');
      const parsed = parseWiseCsv(text) as any[];
      if (parsed.length === 0) {
        toast.error('No se encontraron transacciones');
        setWiseRows([]);
        return;
      }
      const ids = parsed.map((p) => p.external_id);
      const { data: existing } = await supabase
        .from('transactions')
        .select('external_id')
        .in('external_id', ids);
      const dupSet = new Set((existing || []).map((r: any) => r.external_id));
      setWiseRows(
        parsed.map((p) => ({
          ...p,
          duplicate: dupSet.has(p.external_id),
          selected: !dupSet.has(p.external_id),
        })),
      );
      setWiseMonth(detectPredominantMonth(parsed));
      toast.success(`${parsed.length} transacciones detectadas`);
    } catch (e: any) {
      toast.error(e.message || 'Error al procesar CSV');
    } finally {
      setWiseProcessing(false);
    }
  }

  async function handleWiseImport() {
    const toImport = wiseRows.filter((r) => r.selected && !r.duplicate);
    if (toImport.length === 0) return;
    setWiseImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload: any[] = [];
      for (const r of toImport) {
        const cur = (r._currency || 'USD').toUpperCase();
        const amt = r._amount ?? r.amountUSD;
        const acct = accounts?.find(a => /wise/i.test(a.name) && a.currency === cur);
        if (!acct) continue;
        const isIncome = r.type === 'income';
        const sign = isIncome ? 1 : -1;
        payload.push({
          user_id: user.id,
          account_id: acct.id,
          date: r.date,
          description: r.description,
          merchant: r.description,
          amount: sign * amt,
          currency: cur,
          fx_rate: cur === 'USD' ? 1 : 0,
          amount_usd: cur === 'USD' ? sign * amt : 0,
          type: (isIncome ? 'income' : 'expense') as any,
          external_id: r.external_id,
          raw_imported_description: r.description,
        });
      }
      if (payload.length === 0) {
        toast.error('No se encontraron cuentas Wise correspondientes');
        return;
      }
      const { error } = await supabase.from('transactions').insert(payload);
      if (error) throw error;
      if (wiseMonth) {
        await supabase.from('import_log').upsert(
          {
            user_id: user.id,
            source: 'wise',
            month: wiseMonth,
            transaction_count: payload.length,
            imported_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,source,month' },
        );
        qc.invalidateQueries({ queryKey: ['import-log'] });
      }
      const dups = wiseRows.filter((r) => r.duplicate).length;
      setWiseResultMsg(`${payload.length} transacciones importadas, ${dups} duplicados ignorados`);
      toast.success('Importación completa');
      setWiseRows([]);
      setWiseMonth('');
      setWiseFile(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setWiseImporting(false);
    }
  }

  const wiseSelectedCount = wiseRows.filter((r) => r.selected && !r.duplicate).length;
  const wiseDupCount = wiseRows.filter((r) => r.duplicate).length;

  function renderPreviewTable(
    items: PreviewRow[],
    onToggle: (i: number) => void,
    showCuotas = false,
  ) {
    return (
      <div className="border rounded-lg max-h-[420px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Descripción</TableHead>
              <TableHead className="text-xs text-right">ARS</TableHead>
              <TableHead className="text-xs text-right">USD</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r, i) => (
              <TableRow key={r.external_id} className={r.duplicate ? 'opacity-50' : ''}>
                <TableCell>
                  <Checkbox
                    checked={r.selected}
                    disabled={r.duplicate}
                    onCheckedChange={() => onToggle(i)}
                  />
                </TableCell>
                <TableCell className="text-xs">{r.date}</TableCell>
                <TableCell className="text-xs max-w-[260px] truncate">{r.description}</TableCell>
                <TableCell className="text-xs text-right font-mono tabular-nums">
                  {r.amountARS.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </TableCell>
                <TableCell className="text-xs text-right font-mono tabular-nums">
                  {r.amountUSD ? r.amountUSD.toFixed(2) : '—'}
                  {!r.matched && r.amountUSD > 0 && r.type !== 'transfer' && (
                    <span className="ml-1 text-[10px] text-muted-foreground">est.</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.duplicate ? (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">Ya importado</Badge>
                  ) : r.type === 'income' ? (
                    <Badge className="text-[10px] h-4 px-1.5 bg-green-600 hover:bg-green-600/90">Ingreso</Badge>
                  ) : r.type === 'transfer' ? (
                    <Badge className="text-[10px] h-4 px-1.5 bg-orange-500 hover:bg-orange-500/90">Transfer</Badge>
                  ) : r.type === 'fee' ? (
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Fee</Badge>
                  ) : (
                    <Badge variant="default" className="text-[10px] h-4 px-1.5">Gasto</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Extractos</h1>
        <p className="text-sm text-muted-foreground">Importá extractos de tus cuentas para registrar el detalle de gastos</p>
      </div>

      <ImportStatusPanel />

      {/* ARQ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MerchantLogo name="DolarApp" domain="dolarapp.com" size={28} />
            ARQ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PdfDropzone label="Estado USD (.pdf)" file={usdFile} onFile={setUsdFile} />
            <PdfDropzone label="Estado ARS (.pdf)" file={arsFile} onFile={setArsFile} />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleProcess} disabled={!arsFile || processing}>
              <Upload className="h-4 w-4 mr-2" />
              {processing ? 'Procesando...' : 'Procesar'}
            </Button>
            {!usdFile && arsFile && (
              <p className="text-xs text-muted-foreground">
                Sin estado USD usaremos el tipo de cambio del día (1 ARS = {arsToUsd?.toFixed(6) || '—'} USD)
              </p>
            )}
            {!arqAccount && (
              <Badge variant="outline" className="text-amber-600">
                No se encontró cuenta ARQ/DolarApp
              </Badge>
            )}
          </div>

          {resultMsg && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> {resultMsg}
            </div>
          )}

          {rows.length > 0 && (
            <div className="space-y-3">
              <MonthConfirm month={arqMonth} onChange={setArqMonth} count={rows.length} />
              <div className="flex gap-2 flex-wrap">
                <Badge>{selectedCount} seleccionadas</Badge>
                {dupCount > 0 && <Badge variant="secondary">{dupCount} duplicadas</Badge>}
              </div>
              {renderPreviewTable(rows, toggleRow)}
              <Button
                onClick={handleImport}
                disabled={importing || selectedCount === 0 || !arqAccount || !arqMonth}
                className="w-full"
              >
                {importing ? 'Importando...' : `Importar ${selectedCount} seleccionadas`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MercadoPago */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MerchantLogo name="MercadoPago" size={28} />
            MercadoPago
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FileDropzone
              label="Reporte (.xlsx)"
              file={mpFile}
              onFile={setMpFile}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              acceptLabel="XLSX"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleMpProcess} disabled={!mpFile || mpProcessing}>
              <Upload className="h-4 w-4 mr-2" />
              {mpProcessing ? 'Procesando...' : 'Procesar'}
            </Button>
            {!mpAccount && (
              <Badge variant="outline" className="text-amber-600">
                No se encontró cuenta MercadoPago
              </Badge>
            )}
          </div>

          {mpResultMsg && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> {mpResultMsg}
            </div>
          )}

          {mpRows.length > 0 && (
            <div className="space-y-3">
              <MonthConfirm month={mpMonth} onChange={setMpMonth} count={mpRows.length} />
              <div className="flex gap-2 flex-wrap">
                <Badge>{mpSelectedCount} seleccionadas</Badge>
                {mpDupCount > 0 && <Badge variant="secondary">{mpDupCount} duplicadas</Badge>}
              </div>
              {renderPreviewTable(mpRows, (i) =>
                setMpRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r))),
              )}
              <Button
                onClick={handleMpImport}
                disabled={mpImporting || mpSelectedCount === 0 || !mpAccount || !mpMonth}
                className="w-full"
              >
                {mpImporting ? 'Importando...' : `Importar ${mpSelectedCount} seleccionadas`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>



      {/* Wise CSV (manual) */}
      <div ref={wiseSectionRef}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MerchantLogo name="Wise" size={28} />
              Wise (manual)
            </CardTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Si la integración API falla, importá el CSV exportado desde wise.com.
              Las cuentas se identifican por moneda (USD/EUR).
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FileDropzone
                label="Wise statement (.csv)"
                file={wiseFile}
                onFile={setWiseFile}
                accept=".csv,text/csv"
                acceptLabel="CSV"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleWiseProcess} disabled={!wiseFile || wiseProcessing}>
                <Upload className="h-4 w-4 mr-2" />
                {wiseProcessing ? 'Procesando...' : 'Procesar'}
              </Button>
            </div>

            {wiseResultMsg && (
              <div className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" /> {wiseResultMsg}
              </div>
            )}

            {wiseRows.length > 0 && (
              <div className="space-y-3">
                <MonthConfirm month={wiseMonth} onChange={setWiseMonth} count={wiseRows.length} />
                <div className="flex gap-2 flex-wrap">
                  <Badge>{wiseSelectedCount} seleccionadas</Badge>
                  {wiseDupCount > 0 && <Badge variant="secondary">{wiseDupCount} duplicadas</Badge>}
                </div>
                {renderPreviewTable(wiseRows as PreviewRow[], (i) =>
                  setWiseRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r))),
                )}
                <Button
                  onClick={handleWiseImport}
                  disabled={wiseImporting || wiseSelectedCount === 0 || !wiseMonth}
                  className="w-full"
                >
                  {wiseImporting ? 'Importando...' : `Importar ${wiseSelectedCount} seleccionadas`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>



    </div>
  );
}

const SOURCES: { key: 'arq' | 'mercadopago' | 'wise'; label: string }[] = [
  { key: 'arq', label: 'ARQ ARS' },
  { key: 'mercadopago', label: 'MercadoPago' },
  { key: 'wise', label: 'Wise (manual)' },
];

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function ImportStatusPanel() {
  const { data } = useImportLog();

  const { months, statusBySource, pending } = useMemo(() => {
    const today = new Date();
    const months: { key: string; label: string; year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.push({
        key: ymKey(d),
        label: MONTH_LABELS[d.getMonth()],
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }
    const currentKey = ymKey(today);
    const prevKey = ymKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));

    const statusBySource: Record<string, Record<string, 'has' | 'empty' | 'warn'>> = {};
    const pending: { source: string; monthLabel: string }[] = [];

    for (const src of SOURCES) {
      const matching = (data || []).filter((t) => t.source === src.key);
      const monthsWithData = new Set<string>(matching.map((t) => t.month));
      let earliest: string | null = null;
      for (const m of monthsWithData) if (!earliest || m < earliest) earliest = m;
      const hasHistory = monthsWithData.size > 0;

      const row: Record<string, 'has' | 'empty' | 'warn'> = {};
      for (const m of months) {
        if (monthsWithData.has(m.key)) {
          row[m.key] = 'has';
        } else if (
          hasHistory &&
          earliest &&
          m.key >= earliest &&
          (m.key === currentKey || m.key === prevKey)
        ) {
          row[m.key] = 'warn';
          const lbl = `${MONTH_LABELS_FULL[m.month]} ${m.year}`;
          pending.push({ source: src.label, monthLabel: lbl });
        } else {
          row[m.key] = 'empty';
        }
      }
      statusBySource[src.key] = row;
    }
    return { months, statusBySource, pending };
  }, [data]);

  const pendingMsg = useMemo(() => {
    if (pending.length === 0) return null;
    const byMonth = new Map<string, string[]>();
    for (const p of pending) {
      if (!byMonth.has(p.monthLabel)) byMonth.set(p.monthLabel, []);
      byMonth.get(p.monthLabel)!.push(p.source);
    }
    const parts = Array.from(byMonth.entries()).map(([month, sources]) => {
      const list =
        sources.length === 1
          ? sources[0]
          : sources.length === 2
          ? `${sources[0]} y ${sources[1]}`
          : `${sources.slice(0, -1).join(', ')} y ${sources[sources.length - 1]}`;
      return `${list} — ${month}`;
    });
    return `Tenés resúmenes pendientes de cargar: ${parts.join('; ')}`;
  }, [pending]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Estado de importaciones</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium pb-2 pr-3"></th>
                {months.map((m) => (
                  <th key={m.key} className="text-center font-medium pb-2 px-2 min-w-[44px]">
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((src) => (
                <tr key={src.key} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium text-foreground">{src.label}</td>
                  {months.map((m) => {
                    const s = statusBySource[src.key]?.[m.key];
                    return (
                      <td key={m.key} className="text-center py-2 px-2">
                        {s === 'has' && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 text-sm">
                            ✓
                          </span>
                        )}
                        {s === 'warn' && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 text-sm">
                            ⚠
                          </span>
                        )}
                        {s === 'empty' && (
                          <span className="inline-block text-muted-foreground/50">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pendingMsg ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50/60 dark:bg-amber-950/20 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">{pendingMsg}</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-green-300/40 bg-green-50/60 dark:bg-green-950/20 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-xs text-green-700 dark:text-green-300">Todo al día ✓</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

