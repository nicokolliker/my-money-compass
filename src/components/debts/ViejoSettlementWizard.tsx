import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, CheckCircle2, X, Plus, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useCategories } from '@/hooks/useCategories';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { useBlueDollarRate } from '@/hooks/useBlueDollar';
import { downloadSettlementPdf } from '@/lib/settlementPdf';
import { parseBancoCiudad, extractCardTotal, extractAllCardSubtotals } from '@/lib/importers/bancoCiudadParser';
import { parseSantanderWithSubtotals } from '@/lib/importers/santanderParser';
import type { ParsedTransaction } from '@/lib/importers/arqParser';
import { inferCategoryName } from '@/hooks/useRuleSuggestions';
import { extractPdfText } from '@/lib/pdfReader';
import { CARD_KEYS, ITEM_GROUPS, formatARS } from './CycleHistoryList';

const STORAGE_KEY = 'settlement_defaults';

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

export function ViejoSettlementWizard({ open, onOpenChange, settlementMonth, onSantTotalDetected }: { open: boolean; onOpenChange: (v: boolean) => void; settlementMonth: string; onSantTotalDetected?: (n: number) => void }) {
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
  const [cardSubtotals, setCardSubtotals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!open) {
      setStep(1);
      setIebraFile(null); setKollikerFile(null); setSantFile(null);
      setBcTotalARS(0); setSantTotalARS(0); setVisaCiudadMamaARS(0); setVisaCiudadPapaARS(0);
      setExtraItems([]);
      setItems([]);
      setIebraRows([]); setKollikerRows([]); setSantRows([]);
      setUsdAPagar(0);
      setResultUsd(0); setResultVuelto(0);
      setCardSubtotals({});
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
  }, [step, bcTotalARS, santTotalARS, visaCiudadMamaARS, visaCiudadPapaARS, defaultBlueRate]);

  const totalARS = items.reduce((s, i) => s + (i.amountARS || 0), 0) + extraItems.reduce((s, i) => s + (i.amountARS || 0), 0);
  const usdExacto = tcBlue > 0 ? totalARS / tcBlue : 0;
  useEffect(() => { setUsdAPagar(Math.ceil(usdExacto / 100) * 100); }, [usdExacto, tcBlue]);
  const diferencia = usdAPagar * tcBlue - totalARS;
  const vueltoARS = Math.max(0, diferencia);

  function updateItem(key: string, patch: Partial<SettlementItem>) {
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleProcessFiles() {
    setProcessing(true);
    try {
      const fxFallback = arsToUsd || 0.00072;
      let sant = 0, visaCiudadMama = 0, visaCiudadPapa = 0;
      const subtotals: Record<string, number> = {};

      const bcFiles = [iebraFile, kollikerFile].filter((f): f is File => !!f);
      const allMama: ParsedTransaction[] = [];
      const allPapa: ParsedTransaction[] = [];
      for (const f of bcFiles) {
        const text = await extractPdfText(f);
        // Accumulate per-card subtotals from THIS PDF
        const bcSubs = extractAllCardSubtotals(text);
        for (const [k, v] of Object.entries(bcSubs)) {
          subtotals[k] = (subtotals[k] || 0) + v;
        }
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
        const { transactions: rows, cardSubtotals: santSubs } = parseSantanderWithSubtotals(text, fxFallback, '5829');
        for (const [k, v] of Object.entries(santSubs)) {
          subtotals[k] = (subtotals[k] || 0) + v;
        }
        sant = rows.reduce((s, r) => s + r.amountARS, 0);
        setSantRows(rows.map(r => ({
          ...r,
          categoryName: inferCategoryName(r.description) || 'Casa',
          selected: true,
        })));
      }

      setCardSubtotals(subtotals);

      setBcTotalARS(visaCiudadMama + visaCiudadPapa);
      setSantTotalARS(sant);
      if (sant > 0) onSantTotalDetected?.(sant);
      setVisaCiudadMamaARS(visaCiudadMama);
      setVisaCiudadPapaARS(visaCiudadPapa);

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
        vueltoARS: diferencia,
        diferencia,
        carry_over_ars: 0,
        breakdown,
        extras: extrasForNotes,
        categoryBreakdown,
        cardSubtotals,
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

      if (diferencia > 0) {
        await supabase.from('pending_credits' as any).insert({
          user_id: user.id,
          amount_ars: diferencia,
          amount_usd: diferencia * fxArsUsd,
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

      // ── Auto-mark matching recurring instances as paid ──────────────
      try {
        const monthStart = settlementMonth + '-01';
        const [ysm, msm] = settlementMonth.split('-').map(Number);
        const monthEnd = new Date(ysm, msm, 0).toISOString().split('T')[0];
        const labels = [
          ...items.filter(i => i.amountARS > 0).map(i => i.label),
          ...extraItems.filter(e => e.amountARS > 0 && e.label.trim()).map(e => e.label),
        ];
        const normalize = (s: string) => (s || '')
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const labelTokens = labels.map(l => {
          const n = normalize(l);
          return { full: n, words: n.split(' ').filter(w => w.length >= 4) };
        });
        const { data: pendingInsts } = await supabase
          .from('recurring_instances')
          .select('id, status, recurring_id, recurring_expenses!recurring_id(name)')
          .eq('user_id', user.id)
          .gte('expected_date', monthStart)
          .lte('expected_date', monthEnd)
          .not('status', 'in', '("matched","paid_manual","skipped")');
        const toMark: string[] = [];
        for (const inst of (pendingInsts || []) as any[]) {
          const rname = normalize(inst.recurring_expenses?.name || '');
          if (!rname) continue;
          const rwords = rname.split(' ').filter((w: string) => w.length >= 4);
          const match = labelTokens.some(lt => {
            if (!lt.full) return false;
            if (lt.full.includes(rname) || rname.includes(lt.full)) return true;
            return lt.words.some(w => rname.includes(w)) || rwords.some(w => lt.full.includes(w));
          });
          if (match) toMark.push(inst.id);
        }
        if (toMark.length > 0) {
          const note = `Incluido en liquidación ${settlementMonth}`;
          await supabase
            .from('recurring_instances')
            .update({ status: 'paid_manual', matched_at: new Date().toISOString(), notes: note } as any)
            .in('id', toMark);
          qc.invalidateQueries({ queryKey: ['recurring-instances'] });
        }
      } catch (autoMarkErr) {
        // Fail silently — settlement itself already succeeded
        console.warn('auto-mark recurring failed', autoMarkErr);
      }


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
              <p className="text-xs text-muted-foreground">
                Liquidando <span className="font-semibold capitalize text-foreground">{format(new Date(settlementMonth + '-01T12:00:00'), 'MMMM yyyy', { locale: es })}</span>. Subí los PDFs disponibles. Los faltantes podés cargarlos manualmente en el siguiente paso.
              </p>
              <FileSlot label="BC mamá (resumen)" file={iebraFile} onChange={setIebraFile} />
              <FileSlot label="BC papá (resumen)" file={kollikerFile} onChange={setKollikerFile} />
              <FileSlot label="Santander VISA" file={santFile} onChange={setSantFile} />
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
              {diferencia > 0 ? (
                <div className="border-t pt-2 space-y-0.5">
                  <div className="flex items-center justify-between text-success"><span>Vuelto ARS:</span><span className="font-mono">+{formatARS(diferencia)}</span></div>
                  <p className="text-[11px] text-muted-foreground">Tu viejo te devuelve esta diferencia por MercadoPago</p>
                </div>
              ) : (
                <div className="border-t pt-2 flex items-center justify-between text-success"><span>Exacto ✓</span><span /></div>
              )}
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
            {diferencia > 0 && (
              <div>
                <p className="font-medium mb-1">💰 Vuelto esperado:</p>
                <p className="text-xs text-muted-foreground">• Mercado Pago +{formatARS(diferencia)} ARS</p>
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



export function FileSlot({ label, file, onChange, accept = '.pdf' }: { label: string; file: File | null; onChange: (f: File | null) => void; accept?: string }) {
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
