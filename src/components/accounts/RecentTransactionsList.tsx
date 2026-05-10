/**
 * RecentTransactionsList
 *
 * Shared last-20-transactions block for account sheets. Renders a small
 * card list and a "Ver todas →" CTA that navigates to /transactions with
 * the account pre-filtered.
 */
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
import { MerchantLogo } from '@/components/MerchantLogo';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface Props {
  accountId: string;
  accountCurrency?: string;
  onNavigate?: () => void;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

export function RecentTransactionsList({ accountId, accountCurrency, onNavigate }: Props) {
  const navigate = useNavigate();
  const { data: transactions, isLoading } = useTransactions({ accountId });
  const recent = (transactions || []).slice(0, 20);

  const goToAll = () => {
    onNavigate?.();
    navigate('/transactions', { state: { accountId } });
  };

  return (
    <>
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
                  {formatCurrency(amount, tx.currency || accountCurrency || 'USD')}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full mt-3 gap-2"
        onClick={goToAll}
      >
        Ver todas →
        <ArrowRight className="h-3.5 w-3.5 ml-auto" />
      </Button>
    </>
  );
}
