import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTransactions } from '@/hooks/useTransactions';
import { formatUSD, formatCurrency } from '@/lib/constants';
import { getCategoryColor } from '@/lib/categoryColors';
import { Badge } from '@/components/ui/badge';
import { Repeat } from 'lucide-react';

export default function Subscriptions() {
  const { data: transactions, isLoading } = useTransactions();

  const { subscriptions, byCategory } = useMemo(() => {
    const subs = transactions?.filter(t => t.is_subscription && t.type === 'expense') || [];
    const grouped: Record<string, { name: string; currency: string; lastAmount: number; lastAmountUsd: number; lastDate: string; count: number; accountName: string; categoryName: string }> = {};
    subs.forEach(t => {
      const key = (t.merchant || t.description || 'Unknown').toLowerCase();
      const catName = (t as any).categories?.name || 'Other';
      if (!grouped[key] || t.date > grouped[key].lastDate) {
        grouped[key] = {
          name: t.merchant || t.description || 'Unknown',
          currency: t.currency,
          lastAmount: Math.abs(Number(t.amount)),
          lastAmountUsd: Math.abs(Number(t.amount_usd)),
          lastDate: t.date,
          count: (grouped[key]?.count || 0) + 1,
          accountName: (t as any).accounts?.name || '',
          categoryName: catName,
        };
      } else {
        grouped[key].count += 1;
      }
    });
    const allSubs = Object.values(grouped).sort((a, b) => b.lastAmountUsd - a.lastAmountUsd);
    
    // Group by category
    const byCat: Record<string, { subs: typeof allSubs; total: number }> = {};
    allSubs.forEach(sub => {
      if (!byCat[sub.categoryName]) byCat[sub.categoryName] = { subs: [], total: 0 };
      byCat[sub.categoryName].subs.push(sub);
      byCat[sub.categoryName].total += sub.lastAmountUsd;
    });
    
    return { subscriptions: allSubs, byCategory: byCat };
  }, [transactions]);

  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.lastAmountUsd, 0);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-foreground">Subscriptions</h1>

      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-elevated">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm opacity-80 font-medium">Est. Monthly Cost</p>
          <p className="text-4xl font-extrabold mt-1 tracking-tight">{formatUSD(totalMonthly)}</p>
          <p className="text-sm opacity-80 mt-1">{subscriptions.length} active subscription{subscriptions.length !== 1 ? 's' : ''}</p>
        </CardContent>
      </Card>

      {Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total).map(([catName, { subs, total }]) => {
        const colors = getCategoryColor(catName);
        return (
          <div key={catName} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.hex }} />
                <span className="text-sm font-semibold text-foreground">{catName}</span>
              </div>
              <span className="text-sm font-bold text-muted-foreground tabular-nums">{formatUSD(total)}/mo</span>
            </div>
            <div className="space-y-2">
              {subs.map(sub => (
                <Card key={sub.name}>
                  <CardContent className="flex items-center gap-3 py-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${colors.bg} ${colors.text}`}>
                      {sub.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{sub.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">{sub.accountName}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          Last: {new Date(sub.lastDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(sub.lastAmount, sub.currency)}</p>
                      {sub.currency !== 'USD' && <p className="text-[11px] text-muted-foreground tabular-nums">≈ {formatUSD(sub.lastAmountUsd)}</p>}
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 mt-0.5 font-medium">Monthly</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {subscriptions.length === 0 && (
        <div className="text-center py-12">
          <Repeat className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No subscriptions yet.</p>
          <p className="text-sm text-muted-foreground/70">Mark transactions as subscriptions to see them here.</p>
        </div>
      )}
    </div>
  );
}
