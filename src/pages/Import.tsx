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
import { parseBancoCiudad, parseBancoCiudadObSoc } from '@/lib/importers/bancoCiudadParser';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';

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

      const dupCount = rows.filter((r) => r.duplicate).length;
      setResultMsg(`${toImport.length} transacciones importadas, ${dupCount} duplicados ignorados`);
      toast.success('Importación completa');
      setRows([]);
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
      const dups = mpRows.filter((r) => r.duplicate).length;
      setMpResultMsg(`${toImport.length} transacciones importadas, ${dups} duplicados ignorados`);
      toast.success('Importación completa');
      setMpRows([]);
      setMpFile(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setMpImporting(false);
    }
  }

  const mpSelectedCount = mpRows.filter((r) => r.selected && !r.duplicate).length;
  const mpDupCount = mpRows.filter((r) => r.duplicate).length;

  // ---- Banco Ciudad state ----
  const [bcFile, setBcFile] = useState<File | null>(null);
  const [bcProcessing, setBcProcessing] = useState(false);
  const [bcRows, setBcRows] = useState<PreviewRow[]>([]);
  const [bcImporting, setBcImporting] = useState(false);
  const [bcResultMsg, setBcResultMsg] = useState<string | null>(null);

  const bcAccount = useMemo(
    () =>
      accounts?.find((a) => /tarjeta/i.test(a.name) && /ciudad/i.test(a.name)) ||
      accounts?.find((a) => /tarjeta/i.test(a.name)) ||
      null,
    [accounts],
  );

  async function handleBcProcess() {
    if (!bcFile) return;
    setBcProcessing(true);
    setBcResultMsg(null);
    try {
      const text = await extractPdfText(bcFile);
      const parsed = parseBancoCiudad(text, arsToUsd || 0);
      if (parsed.length === 0) {
        toast.error('No se encontraron consumos de la tarjeta 1689');
        setBcRows([]);
        return;
      }
      const ids = parsed.map((p) => p.external_id);
      const { data: existing } = await supabase
        .from('transactions')
        .select('external_id')
        .in('external_id', ids);
      const dupSet = new Set((existing || []).map((r: any) => r.external_id));
      setBcRows(
        parsed.map((p) => ({
          ...p,
          duplicate: dupSet.has(p.external_id),
          selected: !dupSet.has(p.external_id),
        })),
      );
      toast.success(`${parsed.length} consumos detectados`);
    } catch (e: any) {
      toast.error(e.message || 'Error al procesar PDF');
    } finally {
      setBcProcessing(false);
    }
  }

  async function handleBcImport() {
    if (!bcAccount) {
      toast.error('No se encontró cuenta de tarjeta');
      return;
    }
    const toImport = bcRows.filter((r) => r.selected && !r.duplicate);
    if (toImport.length === 0) return;
    setBcImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const payload = toImport.map((r) => {
        const fxRate = r.amountARS > 0 && r.amountUSD > 0 ? r.amountUSD / r.amountARS : (arsToUsd || 0);
        return {
          user_id: user.id,
          account_id: bcAccount.id,
          date: r.date,
          description: r.description,
          merchant: r.description,
          amount: -r.amountARS,
          currency: 'ARS',
          fx_rate: fxRate,
          amount_usd: -r.amountUSD,
          type: 'expense' as const,
          external_id: r.external_id,
          raw_imported_description: r.description,
        };
      });
      const { error } = await supabase.from('transactions').insert(payload);
      if (error) throw error;
      const dups = bcRows.filter((r) => r.duplicate).length;
      setBcResultMsg(`${toImport.length} consumos importados, ${dups} duplicados ignorados`);
      toast.success('Importación completa');
      setBcRows([]);
      setBcFile(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al importar');
    } finally {
      setBcImporting(false);
    }
  }

  const bcSelectedCount = bcRows.filter((r) => r.selected && !r.duplicate).length;
  const bcDupCount = bcRows.filter((r) => r.duplicate).length;

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
        <h1 className="text-2xl font-bold text-foreground">Import</h1>
        <p className="text-sm text-muted-foreground">Importá estados de cuenta de tus integraciones</p>
      </div>

      {/* ARQ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">ARQ</CardTitle>
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
              <div className="flex gap-2 flex-wrap">
                <Badge>{selectedCount} seleccionadas</Badge>
                {dupCount > 0 && <Badge variant="secondary">{dupCount} duplicadas</Badge>}
              </div>
              {renderPreviewTable(rows, toggleRow)}
              <Button
                onClick={handleImport}
                disabled={importing || selectedCount === 0 || !arqAccount}
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
          <CardTitle className="text-base">MercadoPago</CardTitle>
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
              <div className="flex gap-2 flex-wrap">
                <Badge>{mpSelectedCount} seleccionadas</Badge>
                {mpDupCount > 0 && <Badge variant="secondary">{mpDupCount} duplicadas</Badge>}
              </div>
              {renderPreviewTable(mpRows, (i) =>
                setMpRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r))),
              )}
              <Button
                onClick={handleMpImport}
                disabled={mpImporting || mpSelectedCount === 0 || !mpAccount}
                className="w-full"
              >
                {mpImporting ? 'Importando...' : `Importar ${mpSelectedCount} seleccionadas`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Banco Ciudad — Tarjeta viejo */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Banco Ciudad — Tarjeta viejo</CardTitle>
          <p className="text-xs text-muted-foreground pt-1">
            Solo se importan consumos de la tarjeta 1689 (N. Kolliker)
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PdfDropzone label="Resumen (.pdf)" file={bcFile} onFile={setBcFile} />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleBcProcess} disabled={!bcFile || bcProcessing}>
              <Upload className="h-4 w-4 mr-2" />
              {bcProcessing ? 'Procesando...' : 'Procesar'}
            </Button>
            {!bcAccount && (
              <Badge variant="outline" className="text-amber-600">
                No se encontró cuenta de tarjeta
              </Badge>
            )}
          </div>

          {bcResultMsg && (
            <div className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> {bcResultMsg}
            </div>
          )}

          {bcRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge>{bcSelectedCount} seleccionadas</Badge>
                {bcDupCount > 0 && <Badge variant="secondary">{bcDupCount} duplicadas</Badge>}
              </div>
              {renderPreviewTable(bcRows, (i) =>
                setBcRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r))),
              )}
              <Button
                onClick={handleBcImport}
                disabled={bcImporting || bcSelectedCount === 0 || !bcAccount}
                className="w-full"
              >
                {bcImporting ? 'Importando...' : `Importar ${bcSelectedCount} seleccionadas`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wise */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Wise</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Próximamente</p>
        </CardContent>
      </Card>
    </div>
  );
}
