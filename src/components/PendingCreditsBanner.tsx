import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { usePendingCredits, useResolvePendingCredit, type PendingCredit } from '@/hooks/usePendingCredits';

function formatARS(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

interface Props {
  variant?: 'card' | 'inline';
}

export function PendingCreditsBanner({ variant = 'card' }: Props) {
  const { data: pendingCredits } = usePendingCredits();
  const resolve = useResolvePendingCredit();
  const [confirming, setConfirming] = useState<PendingCredit | null>(null);

  const items = (pendingCredits || []).filter(pc => pc.status === 'pending');
  if (items.length === 0) return null;

  const handleConfirm = async () => {
    if (!confirming) return;
    try {
      await resolve.mutateAsync({ id: confirming.id });
      toast.success('Saldo a favor marcado como recibido');
      setConfirming(null);
    } catch (e: any) {
      toast.error(e.message || 'No se pudo confirmar');
    }
  };

  const renderItem = (pc: PendingCredit) => (
    <div key={pc.id} className="flex items-start justify-between gap-3">
      <div className="text-sm leading-snug">
        <p className="text-foreground">
          <span className="mr-1">💚</span>
          <span className="font-semibold">Saldo a favor:</span>{' '}
          <span className="font-mono font-semibold text-success">
            +{formatARS(pc.amount_ars)}
          </span>
          {pc.settlement_month && (
            <> de liquidación <span className="capitalize">{pc.settlement_month}</span></>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Puede llegar de parte de tu viejo o tu vieja
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="border-success/40 text-success hover:bg-success/10 shrink-0"
        onClick={() => setConfirming(pc)}
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        Marcar como recibido
      </Button>
    </div>
  );

  const content = <div className="space-y-3">{items.map(renderItem)}</div>;

  return (
    <>
      {variant === 'card' ? (
        <Card className="rounded-2xl border-success/40 bg-success/10">
          <CardContent className="p-4">{content}</CardContent>
        </Card>
      ) : (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3">{content}</div>
      )}

      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recepción</DialogTitle>
            <DialogDescription>
              ¿Confirmás que recibiste aproximadamente{' '}
              <span className="font-mono font-semibold text-foreground">
                {confirming ? formatARS(confirming.amount_ars) : ''}
              </span>{' '}
              por MercadoPago?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm} disabled={resolve.isPending}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
