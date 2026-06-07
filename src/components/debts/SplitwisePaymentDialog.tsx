import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useLatestFxRate } from '@/hooks/useFxRates';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  balanceUsd: number; // negative = user owes
  mpAccount: any | null;
  splitwiseAccount: any | null;
}

export function SplitwisePaymentDialog({
  open,
  onOpenChange,
  balanceUsd,
  mpAccount,
  splitwiseAccount,
}: Props) {
  const qc = useQueryClient();
  const arsToUsd = useLatestFxRate('ARS', 'USD'); // e.g. 0.00066
  const usdToArs = arsToUsd > 0 ? 1 / arsToUsd : 1000;

  const owedUsd = Math.abs(balanceUsd);
  const suggestedArs = Math.round(owedUsd * usdToArs);

  const monthLabel = format(new Date(), 'MMMM yyyy', { locale: es });
  const ym = format(new Date(), 'yyyy-MM');

  const [amountArs, setAmountArs] = useState<number>(suggestedArs);
  const [memo, setMemo] = useState<string>(`Pago Splitwise — ${monthLabel}`);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmountArs(suggestedArs);
      setMemo(`Pago Splitwise — ${monthLabel}`);
    }
  }, [open, suggestedArs, monthLabel]);

  async function submit() {
    if (!mpAccount) {
      toast.error('No se encontró la cuenta MercadoPago ARS');
      return;
    }
    if (amountArs <= 0) {
      toast.error('Ingresá un monto válido');
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');
      const today = new Date().toISOString().slice(0, 10);
      const amountUsd = amountArs * arsToUsd;
      const groupId = crypto.randomUUID();

      // 1. Debit MP ARS
      const { error: e1 } = await supabase.from('transactions').insert({
        user_id: user.id,
        account_id: mpAccount.id,
        date: today,
        description: memo || `Pago Splitwise — ${monthLabel}`,
        amount: -amountArs,
        currency: 'ARS',
        fx_rate: arsToUsd,
        amount_usd: -amountUsd,
        type: 'expense' as const,
        notes: JSON.stringify({
          splitwise_payment: true,
          settlement_month: ym,
          group_id: groupId,
        }),
      });
      if (e1) throw e1;

      // 2. Credit Splitwise USD account (reduces what user owes)
      if (splitwiseAccount) {
        const { error: e2 } = await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: splitwiseAccount.id,
          date: today,
          description: `Pago Splitwise (MP) — ${monthLabel}`,
          amount: amountUsd,
          currency: 'USD',
          fx_rate: 1,
          amount_usd: amountUsd,
          type: 'adjustment' as const,
          notes: JSON.stringify({
            splitwise_payment: true,
            settlement_month: ym,
            group_id: groupId,
          }),
        });
        if (e2) throw e2;
      }

      toast.success('Pago registrado');
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['splitwise-monthly'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar el pago');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar pago a Splitwise</DialogTitle>
          <DialogDescription>
            Saldo actual: <span className="font-mono">-${owedUsd.toFixed(2)} USD</span>
            {' · '}≈ ${suggestedArs.toLocaleString('es-AR')} ARS
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Monto ARS (transferido desde MP)</Label>
            <Input
              type="number"
              value={amountArs || ''}
              onChange={(e) => setAmountArs(parseFloat(e.target.value) || 0)}
              className="mt-1 font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              ≈ ${(amountArs * arsToUsd).toFixed(2)} USD al TC actual
            </p>
          </div>
          <div>
            <Label className="text-xs">Memo</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="mt-1"
              placeholder="Pago Splitwise — mes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting || amountArs <= 0}>
            {submitting ? 'Registrando…' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
