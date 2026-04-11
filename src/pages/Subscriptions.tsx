import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransactions } from '@/hooks/useTransactions';
import { formatUSD, formatCurrency } from '@/lib/constants';
import { Badge } from '@/components/ui/badge';
import { Repeat } from 'lucide-react';

export default function Subscriptions() {
  const { data: transactions, isLoading } = useTransactions();

  const subscriptions = useMemo(() => {
    const subs = transactions?.filter(t => t.is_subscription && t.type === 'expense') || [];
    const grouped: Record<string, { name: string; currency: string; lastAmount: number; lastAmountUsd: number; lastDate: string; count: number; accountName: string }> = {};
    subs.forEach(t => {
      const key = (t.merchant || t.description || 'Unknown').toLowerCase();
      if (!grouped[key] || t.date > grouped[key].lastDate) {
        grouped[key] = {
          name: t.merchant || t.description || 'Unknown',
          currency: t.currency,
          lastAmount: Math.abs(Number(t.amount)),
          lastAmountUsd: Math.abs(Number(t.amount_usd)),
          lastDate: t.date,
          count: (grouped[key]?.count || 0) + 1,
          accountName: (t as any).accounts?.name || '',
        };
      } else {
        grouped[key].count += 1;
      }
    });
    return Object.values(grouped).sort((a, b) => b.lastAmountUsd - a.lastAmountUsd);
  }, [transactions]);

  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.lastAmountUsd, 0);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Subscriptions</h1>

      <Card className="bg-primary text-primary-foreground">
        <CardContent className="pt-6">
          <p className="text-sm opacity-80">Est. Monthly Cost</p>
          <p className="text-3xl font-bold mt-1">{formatUSD(totalMonthly)}</p>
          <p className="text-sm opacity-80 mt-1">{subscriptions.length} active subscriptions</p>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {subscriptions.map(sub => (
          <Card key={sub.name}>
            <CardContent className="flex items-center gap-3 py-4">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                <Repeat className="h-4 w-4 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{sub.name}</p>
                <p className="text-xs text-muted-foreground">{sub.accountName} · Last: {new Date(sub.lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">{formatCurrency(sub.lastAmount, sub.currency)}</p>
                {sub.currency !== 'USD' && <p className="text-xs text-muted-foreground">≈ {formatUSD(sub.lastAmountUsd)}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
        {subscriptions.length === 0 && <p className="text-center py-8 text-muted-foreground">No subscriptions yet. Mark transactions as subscriptions to see them here.</p>}
      </div>
    </div>
  );
}
