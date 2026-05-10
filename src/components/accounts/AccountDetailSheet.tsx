/**
 * AccountDetailSheet
 *
 * Generic slide-in panel for any account. Shows the current balance and
 * the 20 most recent transactions, with a CTA to see the full filtered
 * list on /transactions.
 */
import { useNavigate } from 'react-router-dom';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
import { MerchantLogo } from '@/components/MerchantLogo';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency, formatUSD } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  account: {
    id: string;
    name: string;
    institution?: string | null;
    currency: string;
    computed_balance: number;
    computed_balance_usd: number;
  } | null;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

export function AccountDetailSheet({ open, onClose, account }: Props) {
  const navigate = useNavigate();
  const { data: transactions, isLoading } = useTransactions(
    account ? { accountId: account.id } : undefined,
  );
  const recent = (transactions || []).slice(0, 20);

  if (!account) return null;

  const logoName = account.institution || account.name;
  const isUSD = account.currency === 'USD';

  const goToAll = () => {
    onClose();
    navigate('/transactions', { state: { accountId: account.id } });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2.5">
            <MerchantLogo name={logoName} size={32} />
            <div className="min-w-0">
              <p className="truncate">{account.name}</p>
              {account.institution && (
                <p className="text-[11px] font-normal text-muted-foreground truncate">
                  {account.institution}
                </p>
              )}
            </div>
          </SheetTitle>
        </SheetHeader>

        {/* Balance card */}
        <div className="rounded-xl bg-muted/50 border border-border p-4 mb-5">
          <p className="text-xs text-muted-foreground mb-0.5">Balance actual</p>
          <p
            className={cn(
              'text-2xl font-bold tabular-nums',
              account.computed_balance < 0 ? 'text-destructive' : 'text-foreground',
            )}
          >
            {formatCurrency(account.computed_balance, account.currency)}
          </p>
          {!isUSD && (
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
              ≈ {formatUSD(account.computed_balance_usd)}
            </p>
          )}
        </div>

        <Separator className="my-4" />

        {/* Recent transactions */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Movimientos recientes
            </h3>
            {recent.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                Últimos {recent.length}
              </span>
            )}
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Cargando...
            </p>
          ) : recent.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-4">
              Sin transacciones todavía
            </p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
              {recent.map((tx: any) => {
                const isTransfer = tx.type === 'transfer';
                const isIncome = tx.type === 'income';
                const amount = Number(tx.amount) || 0;
                const colorCls = isTransfer
                  ? 'text-muted-foreground'
                  : isIncome || amount > 0
                  ? 'text-success'
                  : 'text-destructive';
                const merchantName = tx.merchant || tx.description || '';
                return (
                  <div key={tx.id} className="flex items-center gap-2.5 px-3 py-2.5">
                    {isTransfer ? (
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    ) : (
                      <MerchantLogo name={merchantName} size={32} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {tx.description || tx.merchant || '—'}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {formatDate(tx.date)}
                        {tx.categories?.name && (
                          <span> · {tx.categories.name}</span>
                        )}
                      </p>
                    </div>
                    <p className={cn('text-xs font-mono font-semibold tabular-nums shrink-0', colorCls)}>
                      {amount > 0 ? '+' : ''}
                      {formatCurrency(amount, tx.currency || account.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <Button
            variant="outline"
            className="w-full mt-3 gap-2"
            onClick={goToAll}
          >
            Ver todas las transacciones
            <ArrowRight className="h-3.5 w-3.5 ml-auto" />
          </Button>
        </section>
      </SheetContent>
    </Sheet>
  );
}
