/**
 * AccountReconciliationSheet — generic destination-account version
 * of ArqReconciliationSheet. Shows pending transfers received from
 * an upstream account (e.g. ARQ) and the reconciliation history.
 */
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle, CheckCircle2, ArrowRight, Upload,
  Clock, TrendingDown, Wallet,
} from 'lucide-react';
import { MerchantLogo } from '@/components/MerchantLogo';
import {
  usePendingReconciliations,
  useReconciliationHistory,
} from '@/hooks/useAccountReconciliation';
import { formatUSD } from '@/lib/constants';
import { RecentTransactionsList } from './RecentTransactionsList';

interface Props {
  open: boolean;
  onClose: () => void;
  accountId: string;
  accountName: string;
  accountInstitution?: string | null;
  balanceUsd: number;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

export function AccountReconciliationSheet({
  open, onClose, accountId, accountName, accountInstitution, balanceUsd,
}: Props) {
  const navigate = useNavigate();
  const { data: pending = [] } = usePendingReconciliations(accountId);
  const { data: history = [] } = useReconciliationHistory(accountId);

  const reconciled = history.filter(r => r.status === 'reconciled').slice(0, 6);
  const totalPending = pending.reduce(
    (s, r) => s + Math.max(0, Number(r.transfer_amount_usd) - Number(r.total_spent_usd ?? 0)),
    0,
  );

  const goToImport = () => {
    onClose();
    navigate('/import');
  };

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">

        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2.5">
            <MerchantLogo name={accountInstitution || accountName} size={28} />
            <span>{accountName}</span>
          </SheetTitle>
        </SheetHeader>

        <div className="rounded-xl bg-muted/50 border border-border p-4 mb-5">
          <p className="text-xs text-muted-foreground mb-0.5">Balance actual</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {formatUSD(balanceUsd)}
          </p>
          {totalPending > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1 mt-1.5">
              <AlertTriangle className="h-3 w-3" />
              {formatUSD(totalPending)} pendiente de conciliar
            </p>
          )}
        </div>

        {pending.length > 0 && (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Sin conciliar
              </h3>
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-[10px]">
                {pending.length} transferencia{pending.length > 1 ? 's' : ''}
              </Badge>
            </div>

            <div className="space-y-2">
              {pending.map(r => {
                const transferred = Number(r.transfer_amount_usd);
                const spent = Number(r.total_spent_usd ?? 0);
                const remaining = Math.max(0, transferred - spent);
                const pct = transferred > 0 ? Math.min(100, (spent / transferred) * 100) : 0;
                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(r.transfer_date)}
                        </p>
                        {r.transfer_description && (
                          <p className="text-[10px] text-muted-foreground truncate max-w-[220px]">
                            {r.transfer_description}
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 shrink-0">
                        {spent > 0 ? 'Parcial' : 'Pendiente'}
                      </Badge>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Transferido</span>
                        <span className="font-mono font-semibold tabular-nums">{formatUSD(transferred)}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Conciliado</span>
                        <span className="font-mono font-semibold tabular-nums text-foreground">{formatUSD(spent)}</span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-amber-600 font-medium">Resta</span>
                        <span className="font-mono font-bold tabular-nums text-amber-600">{formatUSD(remaining)}</span>
                      </div>
                    </div>

                    {remaining > 0 && r.last_import_date && (
                      <p className="text-[10px] text-muted-foreground italic border-t border-amber-200/50 dark:border-amber-800/50 pt-1.5">
                        Conciliaste {formatUSD(spent)} el {r.last_import_date}. Podés tener más gastos desde entonces.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <Button className="w-full mt-3 gap-2" onClick={goToImport}>
              <Upload className="h-4 w-4" />
              Subir extracto {accountName}
              <ArrowRight className="h-3.5 w-3.5 ml-auto" />
            </Button>
            <p className="text-[10px] text-muted-foreground text-center mt-1.5">
              Importá el extracto para cerrar la conciliación y registrar los gastos
            </p>
          </section>
        )}

        {pending.length === 0 && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-3 mb-5 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <p className="text-xs text-success font-medium">Todo conciliado</p>
          </div>
        )}

        <Separator className="my-4" />

        <section>
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
            Historial de conciliaciones
          </h3>

          {reconciled.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Aún no hay conciliaciones completadas
            </p>
          ) : (
            <div className="space-y-2">
              {reconciled.map(r => {
                const spent = Number(r.total_spent_usd ?? 0);
                const balance = Number(r.balance_after_usd ?? 0);
                const deposited = Number(r.transfer_amount_usd);
                return (
                  <div
                    key={r.id}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatUSD(deposited)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatDate(r.transfer_date)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] text-success border-success/40 shrink-0"
                      >
                        ✓ {r.period ?? '—'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
                      <div className="flex items-center gap-1.5">
                        <TrendingDown className="h-3 w-3 text-destructive shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground">Gastado</p>
                          <p className="text-xs font-mono font-semibold text-destructive">
                            -{formatUSD(spent)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Wallet className="h-3 w-3 text-success shrink-0" />
                        <div>
                          <p className="text-[10px] text-muted-foreground">Balance</p>
                          <p className="text-xs font-mono font-semibold text-success">
                            {formatUSD(balance)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <Separator className="my-4" />

        <section>
          <h3 className="text-sm font-semibold mb-3">Últimas transacciones</h3>
          <RecentTransactionsList
            accountId={accountId}
            onNavigate={onClose}
          />
        </section>

      </SheetContent>
    </Sheet>
  );
}
