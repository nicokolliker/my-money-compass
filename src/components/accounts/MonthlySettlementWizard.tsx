import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAccountBalances } from '@/hooks/useAccounts';
import { useLatestFxRate } from '@/hooks/useFxRates';
import { useBlueDollarRate } from '@/hooks/useBlueDollar';
import { useCreateTransaction } from '@/hooks/useTransactions';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function MonthlySettlementWizard({ open, onOpenChange }: Props) {
  const { data: accounts } = useAccountBalances();
  const arsToUsd = useLatestFxRate('ARS', 'USD');
  const { data: blueDollar } = useBlueDollarRate();
  const createTx = useCreateTransaction();

  const tarjetaViejoAccount = accounts?.find(a =>
    a.name.toLowerCase().includes('tarjeta') || a.name.toLowerCase().includes('viejo')
  );
  const cashUsdAccount = accounts?.find(a =>
    a.name.toLowerCase().includes('cash') && a.currency === 'USD'
  );
  const mercadoPagoAccount = accounts?.find(a =>
    a.name.toLowerCase().includes('mercado') || a.name.toLowerCase().includes('pago')
  );

  const deudaARS = Math.abs(tarjetaViejoAccount?.computed_balance || 0);

  const defaultTc = useMemo(() => {
    if (blueDollar?.blue_avg) return Math.round(blueDollar.blue_avg);
    if (arsToUsd && arsToUsd > 0) return Math.round(1 / arsToUsd);
    return 1390;
  }, [blueDollar, arsToUsd]);

  const [step, setStep] = useState(1);
  const [tcBlue, setTcBlue] = useState(defaultTc);
  const [usdAPagar, setUsdAPagar] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTcBlue(defaultTc);
      const exact = deudaARS / Math.max(defaultTc, 1);
      setUsdAPagar(Math.ceil(exact / 100) * 100);
    }
  }, [open, defaultTc, deudaARS]);

  const usdExacto = deudaARS / Math.max(tcBlue, 1);
  const vueltoARS = Math.round(usdAPagar * tcBlue - deudaARS);

  const missing: string[] = [];
  if (!tarjetaViejoAccount) missing.push('Tarjeta viejo');
  if (!cashUsdAccount) missing.push('Cash USD');
  if (!mercadoPagoAccount) missing.push('Mercado Pago');

  const fmtARS = (n: number) => `ARS ${Math.round(n).toLocaleString('es-AR')}`;
  const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

  async function confirm() {
    if (!tarjetaViejoAccount || !cashUsdAccount || !mercadoPagoAccount) return;
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await createTx.mutateAsync({
        account_id: cashUsdAccount.id,
        date: today,
        amount: -usdAPagar,
        currency: 'USD',
        amount_usd: -usdAPagar,
        fx_rate: 1,
        type: 'expense',
        description: 'Liquidación mensual — viejo',
        category_id: null,
      } as any);

      await createTx.mutateAsync({
        account_id: tarjetaViejoAccount.id,
        date: today,
        amount: deudaARS,
        currency: 'ARS',
        amount_usd: usdAPagar,
        fx_rate: 1 / tcBlue,
        type: 'adjustment',
        description: 'Liquidación mensual — cancela deuda',
      } as any);

      if (vueltoARS > 0) {
        await createTx.mutateAsync({
          account_id: mercadoPagoAccount.id,
          date: today,
          amount: vueltoARS,
          currency: 'ARS',
          amount_usd: vueltoARS * arsToUsd,
          fx_rate: arsToUsd,
          type: 'income',
          description: 'Vuelto liquidación — viejo',
        } as any);
      }

      toast.success(
        `Liquidación registrada: ${fmtUSD(usdAPagar)} pagados${vueltoARS > 0 ? `, ${fmtARS(vueltoARS)} recibidos` : ''}`
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Error al registrar la liquidación');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Liquidación mensual' : 'Confirmar liquidación'}
          </DialogTitle>
        </DialogHeader>

        {missing.length > 0 ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <p className="font-medium mb-1">No se encontraron las siguientes cuentas:</p>
            <ul className="list-disc pl-5">
              {missing.map(m => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              Verificá que existan en Accounts.
            </p>
          </div>
        ) : step === 1 ? (
          <div className="space-y-4">
            <div className="rounded-md border p-4 bg-muted/30">
              <p className="text-xs text-muted-foreground">Deuda acumulada con el viejo</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{fmtARS(deudaARS)}</p>
              <p className="text-xs text-muted-foreground mt-1">balance de "{tarjetaViejoAccount?.name}"</p>
            </div>

            <div>
              <Label htmlFor="tc">Tipo de cambio blue</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  id="tc"
                  type="number"
                  value={tcBlue}
                  onChange={e => setTcBlue(Math.max(1, Number(e.target.value) || 0))}
                />
                <span className="text-sm text-muted-foreground whitespace-nowrap">ARS por USD</span>
              </div>
            </div>

            <div className="rounded-md border p-4">
              <p className="text-xs text-muted-foreground">USD a pagar</p>
              <p className="text-2xl font-bold tabular-nums mt-1">{fmtUSD(usdExacto)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                redondeado: <span className="font-semibold">{fmtUSD(Math.ceil(usdExacto / 100) * 100)}</span>
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => {
                  setUsdAPagar(Math.ceil(usdExacto / 100) * 100);
                  setStep(2);
                }}
              >
                Siguiente →
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Se van a crear estas transacciones:</p>

            <div className="space-y-2">
              <div className="rounded-md border p-3 flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">💸 {cashUsdAccount?.name}</p>
                  <p className="text-xs text-muted-foreground">Liquidación mensual — viejo</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-destructive">−{fmtUSD(usdAPagar)}</p>
              </div>

              <div className="rounded-md border p-3 flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium">✅ {tarjetaViejoAccount?.name}</p>
                  <p className="text-xs text-muted-foreground">cancela deuda</p>
                </div>
                <p className="text-sm font-semibold tabular-nums">+{fmtARS(deudaARS)}</p>
              </div>

              {vueltoARS > 0 && (
                <div className="rounded-md border p-3 flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium">💰 {mercadoPagoAccount?.name}</p>
                    <p className="text-xs text-muted-foreground">Vuelto liquidación — viejo</p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-emerald-600">+{fmtARS(vueltoARS)}</p>
                </div>
              )}
              {vueltoARS < 0 && (
                <p className="text-xs text-destructive">
                  El monto USD no alcanza a cubrir la deuda. Aumentá el USD a pagar.
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="usd">USD a pagar</Label>
              <Input
                id="usd"
                type="number"
                value={usdAPagar}
                onChange={e => setUsdAPagar(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1"
              />
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                ← Atrás
              </Button>
              <Button onClick={confirm} disabled={submitting || usdAPagar <= 0}>
                {submitting ? 'Registrando…' : 'Confirmar y registrar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
