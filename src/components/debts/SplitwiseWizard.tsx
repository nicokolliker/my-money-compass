import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { parseSplitwise } from '@/lib/importers/splitwiseParser';
import { FileSlot } from './ViejoSettlementWizard';

export function SplitwiseSettlementWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: accounts } = useAccountBalances();
  const arsToUsd = useLatestFxRate('ARS', 'USD');
  const qc = useQueryClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<import('@/lib/importers/splitwiseParser').SplitwiseParseResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (!open) { setStep(1); setFile(null); setResult(null); }
  }, [open]);

  function deriveGroupName(f: File | null): string {
    if (!f) return '';
    const base = f.name.replace(/\.csv$/i, '').replace(/[-_]+/g, ' ').trim();
    return base || '';
  }

  async function handleProcess() {
    if (!file) return;
    setProcessing(true);
    try {
      const text = await file.text();
      const parsed = parseSplitwise(text, 'nicolaskolliker', arsToUsd || 0, undefined, deriveGroupName(file));
      if (parsed.rows.length === 0) {
        toast.error('No se encontraron gastos en el CSV');
        setResult(null);
        return;
      }
      setResult(parsed);
      toast.success(`${parsed.rows.length} gastos detectados`);
    } catch (e: any) {
      toast.error(e.message || 'Error procesando el CSV');
    } finally {
      setProcessing(false);
    }
  }

  // Previous calendar month (yyyy-mm) and human label e.g. "Mayo 2026"
  const lastMonthInfo = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = format(d, "LLLL yyyy", { locale: es });
    return { ym, label: label.charAt(0).toUpperCase() + label.slice(1) };
  }, []);

  // Rows to reconcile = last month + Nico owes (userAmount < 0)
  const toImport = useMemo(() => {
    if (!result) return [];
    return result.rows.filter(
      (r) => r.date.startsWith(lastMonthInfo.ym) && r.userAmount < 0,
    );
  }, [result, lastMonthInfo.ym]);

  async function handleConfirm() {
    if (!result) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const accId = splitwiseAcc?.id || (await ensureSplitwiseAccount(user.id));

      if (toImport.length === 0) {
        toast.message('No hay gastos a conciliar.');
        onOpenChange(false);
        return;
      }

      const groupLabel = result.groupName || 'grupo';
      const rows = toImport.map((r) => {
        const abs = Math.abs(r.userAmount);
        const amountUSD = r.currency === 'USD'
          ? abs
          : r.currency === 'ARS'
            ? (arsToUsd > 0 ? +(abs * arsToUsd).toFixed(2) : 0)
            : abs;
        return {
          user_id: user.id,
          account_id: accId,
          date: r.date,
          description: `Splitwise — ${groupLabel}: ${r.description}`,
          amount: -abs,
          currency: r.currency,
          fx_rate: r.currency === 'USD' ? 1 : (arsToUsd || 1),
          amount_usd: -amountUSD,
          type: 'expense' as const,
          external_id: r.external_id,
        };
      });

      const { error } = await supabase.from('transactions').insert(rows);
      if (error) throw error;

      await supabase.from('import_log').insert({
        user_id: user.id,
        source: 'splitwise',
        month: lastMonthInfo.ym,
        transaction_count: rows.length,
      });

      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['account-balances'] });
      qc.invalidateQueries({ queryKey: ['import-log'] });

      toast.success(`${rows.length} gastos importados`);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error importando gastos');
    } finally {
      setSubmitting(false);
    }
  }

  const net = result?.netBalance ?? 0;
  const isPositive = net > 0.005;
  const isNegative = net < -0.005;
  const groupLabel = result?.groupName || 'grupo';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Splitwise — Conciliar gastos</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <FileSlot label="CSV de Splitwise" file={file} accept=".csv" onChange={(f) => { setFile(f); setResult(null); }} />
            {file && !result && (
              <Button onClick={handleProcess} disabled={processing} className="w-full">
                {processing ? 'Procesando...' : 'Procesar CSV'}
              </Button>
            )}
            {result && (
              <div className="space-y-3">
                <div className="rounded-xl border divide-y">
                  <div className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Grupo</span>
                    <span className="font-medium capitalize">{groupLabel}</span>
                  </div>
                  <div className="flex justify-between px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Balance neto</span>
                    <span className={cn(
                      'font-mono font-semibold',
                      isPositive && 'text-success',
                      isNegative && 'text-destructive',
                    )}>
                      {isPositive ? '+' : isNegative ? '−' : ''}
                      {result.currency === 'ARS'
                        ? '$' + Math.round(Math.abs(net)).toLocaleString('es-AR')
                        : '$' + Math.abs(net).toFixed(2)}
                      {' '}{result.currency}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 py-2 text-xs text-muted-foreground">
                    <span>Transacciones</span>
                    <span>
                      {result.rows.length} gastos
                      {result.earliestDate && ` · desde ${result.earliestDate}`}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 py-2 text-xs text-muted-foreground">
                    <span>Moneda</span>
                    <span>{result.currency}</span>
                  </div>
                </div>
                <div className="rounded-xl border p-3 space-y-2">
                  <div>
                    <p className="text-sm font-semibold">Gastos a conciliar — {lastMonthInfo.label}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Solo lo que otros pagaron por vos
                    </p>
                  </div>
                  {toImport.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No hay gastos pagados por otros en {lastMonthInfo.label}.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto divide-y -mx-1">
                      {toImport.map((r, i) => {
                        const abs = Math.abs(r.userAmount);
                        return (
                          <div key={i} className="flex justify-between px-1 py-1.5 text-xs gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{r.description}</p>
                              <p className="text-muted-foreground font-mono">{r.date}</p>
                            </div>
                            <span className="font-mono text-destructive shrink-0">
                              −{r.currency === 'ARS'
                                ? '$' + Math.round(abs).toLocaleString('es-AR')
                                : '$' + abs.toFixed(2)}
                              {' '}{r.currency}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleConfirm}
                  className="w-full"
                  disabled={submitting || toImport.length === 0}
                >
                  {submitting
                    ? 'Importando...'
                    : `Importar ${toImport.length} gastos a registrar →`}
                </Button>
              </div>
            )}
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
