import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, Plus, AlertTriangle, CheckCircle2, Clock, Upload, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useUserSettings, useUpsertUserSettings, type MonotributoConfig } from '@/hooks/useUserSettings';

const CATEGORIAS = [
  { cat: 'A', tope: 10_277_988.13, cuota: 42_386.74 },
  { cat: 'B', tope: 15_058_447.71, cuota: 48_250.78 },
  { cat: 'C', tope: 21_113_696.52, cuota: 56_501.85 },
  { cat: 'D', tope: 26_212_853.42, cuota: 72_414.10 },
  { cat: 'E', tope: 30_833_964.37, cuota: 102_537.97 },
  { cat: 'F', tope: 36_268_192.79, cuota: 128_682.29 },
  { cat: 'G', tope: 42_924_918.75, cuota: 178_564.19 },
  { cat: 'H', tope: 60_833_882.51, cuota: 222_695.42 },
  { cat: 'I', tope: 72_250_419.11, cuota: 443_065.22 },
  { cat: 'J', tope: 90_997_503.90, cuota: 666_977.68 },
  { cat: 'K', tope: 108_357_084.05, cuota: 1_381_687.90 },
];
const DEFAULT_MONOTRIBUTO: MonotributoConfig = {
  vigencia: 'Feb–Jul 2026',
  cat_actual: 'D',
  cuota_actual: 25_741,
};

function formatARS(n: number) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}
function formatUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function useInvoices() {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('periodo', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export default function MonotributoPage() {
  const qc = useQueryClient();
  const { data: invoices = [] } = useInvoices();
  const { data: settings } = useUserSettings();
  const [showForm, setShowForm] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const config: MonotributoConfig = {
    ...DEFAULT_MONOTRIBUTO,
    ...(settings?.monotributo_config || {}),
  };
  const VIGENCIA = config.vigencia;
  const CAT_ACTUAL = config.cat_actual;
  const CUOTA_ACTUAL = config.cuota_actual;

  const now = new Date();
  const currentPeriodo = format(now, 'yyyy-MM');
  const lastMonth = format(subMonths(now, 1), 'yyyy-MM');

  const last12Months = useMemo(() => {
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) months.push(format(subMonths(now, i), 'yyyy-MM'));
    return months;
     
  }, []);

  const totalARS12m = useMemo(
    () => invoices.filter(inv => last12Months.includes(inv.periodo) && inv.estado === 'emitida')
      .reduce((s, inv) => s + Number(inv.monto_ars), 0),
    [invoices, last12Months],
  );
  const totalUSD12m = useMemo(
    () => invoices.filter(inv => last12Months.includes(inv.periodo) && inv.estado === 'emitida')
      .reduce((s, inv) => s + Number(inv.monto_usd), 0),
    [invoices, last12Months],
  );

  const catActualData = CATEGORIAS.find(c => c.cat === CAT_ACTUAL)!;
  const pct = Math.min(100, (totalARS12m / catActualData.tope) * 100);
  const catCorrespondiente = CATEGORIAS.find(c => totalARS12m <= c.tope) || CATEGORIAS[CATEGORIAS.length - 1];
  const necesitaRecategorizacion = catCorrespondiente.cat !== CAT_ACTUAL;

  const tieneFacturaEsteMes = invoices.some(i => i.periodo === currentPeriodo && i.estado === 'emitida');

  const year = now.getFullYear();
  const nextRecatDate = now.getMonth() < 6 ? new Date(year, 6, 5) : new Date(year + 1, 0, 5);
  const diasParaRecat = Math.ceil((nextRecatDate.getTime() - now.getTime()) / 86400000);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Monotributo</h1>
          <p className="text-sm text-muted-foreground">Seguimiento de facturación y recategorización</p>
        </div>
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="h-4 w-4 mr-1.5" /> Registrar factura
        </Button>
      </div>

      <div className="space-y-2">
        {!tieneFacturaEsteMes && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>⚠️ No registraste la factura de {format(now, 'MMMM yyyy', { locale: es })} — recordá emitirla en ARCA</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>Registrar</Button>
          </div>
        )}
        {necesitaRecategorizacion && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span>Tu facturación anual ({formatARS(totalARS12m)}) supera el tope de Categoría {CAT_ACTUAL} ({formatARS(catActualData.tope)}) — correspondería Categoría {catCorrespondiente.cat}</span>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Badge className="text-base px-3 py-1">{CAT_ACTUAL}</Badge>
                <span className="text-sm text-muted-foreground">Locaciones de servicios</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setShowConfig(true)}
                  aria-label="Editar configuración"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Cuota mensual: {formatARS(CUOTA_ACTUAL)} · Vigencia: {VIGENCIA}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Próxima recategorización</p>
              <p className="text-sm font-semibold">{format(nextRecatDate, "d 'de' MMMM yyyy", { locale: es })}</p>
              <p className="text-xs text-muted-foreground">en {diasParaRecat} días</p>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Facturado últimos 12 meses</span>
              <span className={cn('font-semibold', pct > 80 ? 'text-destructive' : 'text-foreground')}>
                {pct.toFixed(0)}% del tope
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn('h-full transition-all', pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-amber-500' : 'bg-success')}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="font-semibold">{formatARS(totalARS12m)}</span>
              <span className="text-muted-foreground">tope {formatARS(catActualData.tope)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total USD (12m)</p>
              <p className="text-lg font-semibold">{formatUSD(totalUSD12m)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Facturas emitidas</p>
              <p className="text-lg font-semibold">
                {invoices.filter(i => last12Months.includes(i.periodo) && i.estado === 'emitida').length}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cat. correspondiente</p>
              <p className="text-lg font-semibold">
                {catCorrespondiente.cat}{necesitaRecategorizacion && ' ⚠️'}
              </p>
            </div>
          </div>

          <a
            href="https://www.afip.gob.ar/monotributo/categorias.asp"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            Ver topes actualizados en ARCA · vigentes {VIGENCIA}
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h3 className="text-sm font-semibold">Historial de facturas</h3></CardHeader>
        <CardContent className="space-y-2">
          {last12Months.slice().reverse().filter(p => p >= '2025-11').map(periodo => {
            const inv = invoices.find(i => i.periodo === periodo);
            const label = format(new Date(periodo + '-15'), 'MMMM yyyy', { locale: es });
            const isPast = periodo < currentPeriodo;
            const isCurrent = periodo === currentPeriodo;
            return (
              <div key={periodo} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                <div className="shrink-0">
                  {inv?.estado === 'emitida'
                    ? <CheckCircle2 className="h-5 w-5 text-success" />
                    : isPast
                      ? <AlertTriangle className="h-5 w-5 text-destructive" />
                      : <Clock className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium capitalize">{label}</p>
                  {inv ? (
                    <p className="text-xs text-muted-foreground truncate">
                      {formatUSD(Number(inv.monto_usd))} · TC {inv.tc_ars} · {formatARS(Number(inv.monto_ars))}
                      {inv.numero_factura && ` · Nº ${inv.numero_factura}`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {isPast ? 'Sin factura registrada' : isCurrent ? 'Mes en curso' : 'Próximo'}
                    </p>
                  )}
                </div>
                {!inv && (isCurrent || isPast) && (
                  <Button size="sm" variant="ghost" onClick={() => setShowForm(true)}>+ Registrar</Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Categorías — {VIGENCIA}</h3>
            <a
              href="https://www.afip.gob.ar/monotributo/categorias.asp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> ARCA
            </a>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          {CATEGORIAS.map(c => {
            const isActual = c.cat === CAT_ACTUAL;
            const isSugerida = c.cat === catCorrespondiente.cat && necesitaRecategorizacion;
            return (
              <div
                key={c.cat}
                className={cn(
                  'grid grid-cols-[40px_1fr_1fr_auto] gap-2 items-center text-xs py-2 px-2 rounded-md',
                  isActual && 'bg-primary/10',
                  isSugerida && 'bg-destructive/10',
                )}
              >
                <Badge variant={isActual ? 'default' : 'outline'} className="justify-center">{c.cat}</Badge>
                <span className="text-muted-foreground">{formatARS(c.tope)}/año</span>
                <span className="text-muted-foreground">{formatARS(c.cuota)}/mes</span>
                <div className="flex gap-1">
                  {isActual && <Badge variant="default" className="text-[10px]">Actual</Badge>}
                  {isSugerida && <Badge variant="destructive" className="text-[10px]">Corresponde</Badge>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <InvoiceForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['invoices'] });
          setShowForm(false);
        }}
      />

      <MonotributoConfigDialog
        open={showConfig}
        onClose={() => setShowConfig(false)}
        current={config}
      />
    </div>
  );
}

function InvoiceForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const now = new Date();
  const [periodo, setPeriodo] = useState(format(now, 'yyyy-MM'));
  const [fecha, setFecha] = useState(format(now, 'yyyy-MM-dd'));
  const [montoUSD, setMontoUSD] = useState('1500');
  const [tcARS, setTcARS] = useState('1390');
  const [nroFactura, setNroFactura] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState<{ name: string; fields: string[] } | null>(null);

  const montoARS = Number(montoUSD) * Number(tcARS);

  async function handlePdfUpload(file: File) {
    setPdfLoading(true);
    try {
      if (!(window as any).pdfjsLib) {
        await new Promise<void>((res, rej) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';
          script.onload = () => res();
          script.onerror = () => rej(new Error('No se pudo cargar pdf.js'));
          document.head.appendChild(script);
        });
      }
      const pdfjs = (window as any).pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

      const buf = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }
      // Normalize whitespace (incluye nbsp) para regex robustas
      const norm = text.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ');

      const filled: string[] = [];

      // Fecha — match cualquier dd/mm/yyyy cerca de "Emisión" o primero del doc
      const fechaMatch =
        norm.match(/Fecha\s*de\s*Emisi[oó]n[^\d]{0,15}(\d{2})\/(\d{2})\/(\d{4})/i)
        || norm.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
      if (fechaMatch) {
        const [, dd, mm, yyyy] = fechaMatch;
        setFecha(`${yyyy}-${mm}-${dd}`);
        setPeriodo(`${yyyy}-${mm}`);
        filled.push(`Período ${mm}/${yyyy}`, `Fecha ${dd}/${mm}/${yyyy}`);
      }

      const nroMatch = norm.match(/Compr(?:\.|obante)?\s*Nro[^\d]{0,10}(\d{4,5}-?\d{6,8})/i)
        || norm.match(/(\d{5}-\d{8})/);
      if (nroMatch) {
        setNroFactura(nroMatch[1]);
        filled.push(`Nº ${nroMatch[1]}`);
      }

      // Parser robusto: detecta cuál separador es decimal según posición y magnitud
      const parseNum = (s: string) => {
        const compact = s.replace(/\s/g, '');
        const lastComma = compact.lastIndexOf(',');
        const lastDot = compact.lastIndexOf('.');
        let cleaned = compact;

        if (lastComma !== -1 && lastDot !== -1) {
          cleaned = lastComma > lastDot
            ? compact.replace(/\./g, '').replace(',', '.')
            : compact.replace(/,/g, '');
        } else if (lastComma !== -1 || lastDot !== -1) {
          const sep = lastComma !== -1 ? ',' : '.';
          const parts = compact.split(sep);
          const last = parts[parts.length - 1];
          const isThousandsOnly = last.length === 3 && parts.slice(0, -1).every((part, idx) => idx === 0 ? part.length <= 3 : part.length === 3);
          cleaned = isThousandsOnly
            ? parts.join('')
            : parts.slice(0, -1).join('') + '.' + last;
        }
        return parseFloat(cleaned);
      };

      // Captura números completos: 1396.000000, 1.396,00, 1500.00, 1.500, etc.
      const NUM = '(?:\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,6})?|\\d+(?:[.,]\\d{1,6})?)';

      const tcMatch = norm.match(new RegExp(`Tipo\\s*de\\s*Cambio[^\\d-]{0,10}(${NUM})`, 'i'));
      if (tcMatch) {
        const tc = parseNum(tcMatch[1]);
        if (!isNaN(tc) && tc > 0) { setTcARS(String(tc)); filled.push(`TC ${tc}`); }
      }

      const totalMatch =
        norm.match(new RegExp(`Importe\\s*Total[^\\d-]{0,15}USD\\s*(${NUM})`, 'i'))
        || norm.match(new RegExp(`Importe\\s*Total[^\\d-]{0,15}(${NUM})`, 'i'));
      if (totalMatch) {
        const usd = parseNum(totalMatch[1]);
        if (!isNaN(usd) && usd > 0) { setMontoUSD(String(usd)); filled.push(`USD ${usd}`); }
      }

      setPdfFile({ name: file.name, fields: filled });
      toast.success('PDF leído correctamente');
    } catch (e: any) {
      toast.error('No se pudo leer el PDF: ' + (e.message || 'error desconocido'));
    } finally {
      setPdfLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const { error } = await supabase.from('invoices').upsert({
        user_id: user.id,
        periodo,
        fecha,
        monto_usd: Number(montoUSD),
        tc_ars: Number(tcARS),
        numero_factura: nroFactura || null,
        cliente: 'Pulsaclass SAS',
        estado: 'emitida',
      }, { onConflict: 'user_id,periodo' });
      if (error) throw error;
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar factura de exportación</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {pdfFile ? (
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{pdfFile.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pdfFile.fields.length > 0
                    ? `Datos extraídos: ${pdfFile.fields.join(' · ')}`
                    : 'No se pudieron extraer campos automáticamente — completá manualmente'}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPdfFile(null)}>Cambiar</Button>
            </div>
          ) : (
            <label className="block">
              <span className="text-xs text-muted-foreground mb-1.5 block">Subir PDF de la factura</span>
              <div className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-colors">
                {pdfLoading ? (
                  <p className="text-sm text-muted-foreground">Leyendo PDF...</p>
                ) : (
                  <>
                    <Upload className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground" />
                    <p className="text-sm">Arrastrá o hacé click para subir la factura</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Los campos se completan solos</p>
                  </>
                )}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePdfUpload(f);
                  }}
                />
              </div>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Período</label>
              <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Fecha de emisión</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Monto USD</label>
              <Input type="number" value={montoUSD} onChange={(e) => setMontoUSD(e.target.value)} placeholder="1500" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TC ARS/USD (factura)</label>
              <Input type="number" value={tcARS} onChange={(e) => setTcARS(e.target.value)} placeholder="1390" />
            </div>
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Monto ARS equivalente:</span>
            <span className="font-semibold">{'$' + Math.round(montoARS).toLocaleString('es-AR')}</span>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Nº de factura (opcional)</label>
            <Input value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} placeholder="0001-00000001" />
          </div>
          <p className="text-xs text-muted-foreground">
            Cliente: Empresa UY · Actividad: Servicios de asesoramiento
          </p>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Registrar factura'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MonotributoConfigDialog({
  open,
  onClose,
  current,
}: {
  open: boolean;
  onClose: () => void;
  current: MonotributoConfig;
}) {
  const [vigencia, setVigencia] = useState(current.vigencia);
  const [catActual, setCatActual] = useState(current.cat_actual);
  const [cuotaActual, setCuotaActual] = useState(String(current.cuota_actual));
  const [saving, setSaving] = useState(false);
  const upsert = useUpsertUserSettings();

  // Re-sync when the dialog re-opens with new defaults.
  useMemo(() => {
    if (open) {
      setVigencia(current.vigencia);
      setCatActual(current.cat_actual);
      setCuotaActual(String(current.cuota_actual));
    }
  }, [open, current]);

  async function handleSave() {
    setSaving(true);
    try {
      const payload: MonotributoConfig = {
        vigencia: vigencia.trim() || current.vigencia,
        cat_actual: catActual.trim().toUpperCase() || current.cat_actual,
        cuota_actual: Number(cuotaActual) || current.cuota_actual,
      };
      await upsert.mutateAsync({ monotributo_config: payload } as any);
      toast.success('Configuración actualizada');
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Monotributo</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground">Vigencia</label>
            <Input value={vigencia} onChange={(e) => setVigencia(e.target.value)} placeholder="Feb–Jul 2026" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Categoría actual</label>
            <Select
              value={catActual}
              onValueChange={(v) => {
                setCatActual(v);
                const found = CATEGORIAS.find(c => c.cat === v);
                if (found) setCuotaActual(String(found.cuota));
              }}
            >
              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => (
                  <SelectItem key={c.cat} value={c.cat}>{c.cat} — cuota {formatARS(c.cuota)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Cuota mensual (ARS)</label>
            <Input type="number" value={cuotaActual} onChange={(e) => setCuotaActual(e.target.value)} placeholder="45700.74" />
          </div>
          <p className="text-xs text-muted-foreground">
            Actualizá estos valores cuando ARCA publique nueva tabla de Monotributo.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
