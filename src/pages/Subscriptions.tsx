import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useTransactions } from '@/hooks/useTransactions';
import { formatUSD, formatCurrency } from '@/lib/constants';
import { getCategoryColor } from '@/lib/categoryColors';
import { getBrandLogo, getInitialsColor, getCategoryIcon } from '@/lib/brandLogos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Repeat, DollarSign, TrendingUp, Calendar } from 'lucide-react';

export default function Subscriptions() {
  const { data: transactions, isLoading } = useTransactions();
  const [viewMode, setViewMode] = useState<'monthly' | 'yearly'>('monthly');

  const { subscriptions, byCategory } = useMemo(() => {
    const subs = transactions?.filter(t => t.is_subscription && t.type === 'expense') || [];
    const grouped: Record<string, { name: string; currency: string; lastAmount: number; lastAmountUsd: number; lastDate: string; count: number; accountName: string; categoryName: string; categoryIcon: string | null; categoryColor: string | null; dates: string[] }> = {};
    subs.forEach(t => {
      const key = (t.merchant || t.description || 'Unknown').toLowerCase();
      const cat = (t as any).categories;
      const catName = cat?.name || 'Other';
      if (!grouped[key]) {
        grouped[key] = {
          name: t.merchant || t.description || 'Unknown',
          currency: t.currency,
          lastAmount: Math.abs(Number(t.amount)),
          lastAmountUsd: Math.abs(Number(t.amount_usd)),
          lastDate: t.date,
          count: 0,
          accountName: (t as any).accounts?.name || '',
          categoryName: catName,
          categoryIcon: cat?.icon || null,
          categoryColor: cat?.color || null,
          dates: [],
        };
      }
      grouped[key].count += 1;
      grouped[key].dates.push(t.date);
      if (t.date > grouped[key].lastDate) {
        grouped[key].lastDate = t.date;
        grouped[key].lastAmount = Math.abs(Number(t.amount));
        grouped[key].lastAmountUsd = Math.abs(Number(t.amount_usd));
      }
    });
    const allSubs = Object.values(grouped).sort((a, b) => b.lastAmountUsd - a.lastAmountUsd);
    const byCat: Record<string, { subs: typeof allSubs; total: number; icon: string | null; color: string | null }> = {};
    allSubs.forEach(sub => {
      if (!byCat[sub.categoryName]) byCat[sub.categoryName] = { subs: [], total: 0, icon: sub.categoryIcon, color: sub.categoryColor };
      byCat[sub.categoryName].subs.push(sub);
      byCat[sub.categoryName].total += sub.lastAmountUsd;
    });
    return { subscriptions: allSubs, byCategory: byCat };
  }, [transactions]);

  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.lastAmountUsd, 0);
  const totalYearly = totalMonthly * 12;
  const multiplier = viewMode === 'yearly' ? 12 : 1;

  const getNextBilling = (lastDate: string) => {
    const d = new Date(lastDate + 'T12:00:00');
    d.setDate(d.getDate() + 30);
    return d;
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Recurring Expenses</h1>
        <div className="flex rounded-xl overflow-hidden border">
          <Button variant={viewMode === 'monthly' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setViewMode('monthly')}>Monthly</Button>
          <Button variant={viewMode === 'yearly' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setViewMode('yearly')}>Yearly</Button>
        </div>
      </div>

      {/* Summary */}
      <Card className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground border-0 shadow-elevated">
        <CardContent className="pt-6 pb-6">
          <p className="text-sm opacity-80 font-medium">Est. {viewMode === 'yearly' ? 'Yearly' : 'Monthly'} Cost</p>
          <p className="text-4xl font-extrabold mt-1 tracking-tight">{formatUSD(viewMode === 'yearly' ? totalYearly : totalMonthly)}</p>
          <div className="flex gap-4 mt-3 text-sm opacity-80">
            <span>{subscriptions.length} recurring expense{subscriptions.length !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{viewMode === 'yearly' ? `${formatUSD(totalMonthly)}/mo` : `${formatUSD(totalYearly)}/yr`}</span>
          </div>
        </CardContent>
      </Card>

      {/* Insights */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><DollarSign className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Yearly Total</p>
              <p className="text-base font-bold text-foreground">{formatUSD(totalYearly)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">Top Category</p>
              <p className="text-base font-bold text-foreground truncate">
                {Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total)[0]?.[0] || '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grouped */}
      {Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total).map(([catName, { subs, total, icon, color }]) => (
        <div key={catName} className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-base">{getCategoryIcon(catName, icon)}</span>
              <span className="text-sm font-semibold text-foreground">{catName}</span>
            </div>
            <span className="text-sm font-bold text-muted-foreground tabular-nums">{formatUSD(total * multiplier)}/{viewMode === 'yearly' ? 'yr' : 'mo'}</span>
          </div>
          <div className="space-y-2">
            {subs.map(sub => {
              const brand = getBrandLogo(sub.name);
              const initials = getInitialsColor(sub.name);
              const nextBilling = getNextBilling(sub.lastDate);
              const isUpcoming = nextBilling.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

              return (
                <Card key={sub.name}>
                  <CardContent className="flex items-center gap-3 py-4">
                    {brand ? (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${brand.bg}`}>{brand.icon}</div>
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${initials.bg} ${initials.text}`}>
                        {sub.name[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{sub.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">{sub.accountName}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Next: {nextBilling.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                        {isUpcoming && <Badge variant="secondary" className="text-[9px] h-3.5 px-1">Soon</Badge>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(sub.lastAmount * multiplier, sub.currency)}</p>
                      {sub.currency !== 'USD' && <p className="text-[11px] text-muted-foreground tabular-nums">≈ {formatUSD(sub.lastAmountUsd * multiplier)}</p>}
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 mt-0.5 font-medium">Monthly</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      {subscriptions.length === 0 && (
        <div className="text-center py-12">
          <Repeat className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No recurring expenses yet.</p>
          <p className="text-sm text-muted-foreground/70">Mark transactions as recurring to see them here.</p>
        </div>
      )}
    </div>
  );
}
