import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';

import { useNetWorth } from '@/hooks/useNetWorth';
import { useTransactions } from '@/hooks/useTransactions';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { useDerivedInstances } from '@/hooks/useRecurringInstances';
import { formatUSD, formatCurrency } from '@/lib/constants';
import { getCategoryColor } from '@/lib/categoryColors';
import { getCategoryIcon } from '@/lib/brandLogos';
import { MerchantLogo } from '@/components/MerchantLogo';
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, CalendarDays, DollarSign, ChevronRight, CheckCircle2 } from 'lucide-react';
import { usePrivacyMode, maskAmount } from '@/hooks/usePrivacyMode';
import { useBlueDollarRate } from '@/hooks/useBlueDollar';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { RecurringStatusBadge } from '@/components/recurring/RecurringStatusBadge';
import { DemoDataBanner } from '@/components/DemoDataBanner';
import { useDemoData } from '@/hooks/useDemoData';
import { useHomeAlerts } from '@/hooks/useHomeAlerts';
import { cn } from '@/lib/utils';
import { FundFlowDiagram } from '@/components/accounts/FundFlowDiagram';
import { PendingCreditsBanner } from '@/components/PendingCreditsBanner';
import { isDerivedPaid } from '@/lib/money';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isLoading } = useNetWorth();
  const { data: transactions } = useTransactions();
  const { data: blueDollar } = useBlueDollarRate();
  const { data: recurringItems } = useRecurringExpenses();
  const { data: instances } = useDerivedInstances();
  const { netWorthUsd: netWorth, totalAssetsUsd: totalAssets, totalLiabilitiesUsd: totalLiabilities } = useNetWorth();
  const { hasDemoData, onCleared: onDemoCleared } = useDemoData();
  const alerts = useHomeAlerts();
  const { isPrivate } = usePrivacyMode();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const prevMonthStart = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12-01`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}-01`;

  const monthExpenses = transactions?.filter(t => t.type === 'expense' && t.date >= monthStart) || [];
  const prevMonthExpenses = transactions?.filter(t => t.type === 'expense' && t.date >= prevMonthStart && t.date < monthStart) || [];
  const totalMonthSpending = Math.abs(monthExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const totalPrevMonthSpending = Math.abs(prevMonthExpenses.reduce((s, t) => s + Number(t.amount_usd), 0));
  const momChange = totalPrevMonthSpending > 0 ? ((totalMonthSpending - totalPrevMonthSpending) / totalPrevMonthSpending) * 100 : 0;

  const monthIncome = Math.abs(transactions?.filter(t => t.type === 'income' && t.date >= monthStart).reduce((s, t) => s + Number(t.amount_usd), 0) || 0);
  const monthSavings = monthIncome - totalMonthSpending;

  const topCategories = useMemo(() => {
    const map: Record<string, { name: string; total: number; icon: string | null; color: string | null; isDigital: boolean; children: { name: string; total: number }[] }> = {};
    monthExpenses.forEach(t => {
      const cat = (t as any).categories;
      const catName = cat?.name || 'Sin categoría';
      if (!map[catName]) map[catName] = { name: catName, total: 0, icon: cat?.icon || null, color: cat?.color || null, isDigital: catName === 'Digital', children: [] };
      map[catName].total += Math.abs(Number(t.amount_usd));
      if (catName === 'Digital') {
        const subName = (t as any).subcategories?.name || 'Otros';
        const existing = map[catName].children.find(c => c.name === subName);
        if (existing) existing.total += Math.abs(Number(t.amount_usd));
        else map[catName].children.push({ name: subName, total: Math.abs(Number(t.amount_usd)) });
      }
    });
    Object.values(map).forEach(c => c.children.sort((a, b) => b.total - a.total));
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [monthExpenses]);

  const maxCatSpend = topCategories[0]?.total || 1;

  const upcoming = useMemo(() => {
    return (instances || [])
      .filter((i: any) => i.derived === 'upcoming' || i.derived === 'needs_review' || i.derived === 'missing')
      .sort((a: any, b: any) => (a.expected_date > b.expected_date ? 1 : -1))
      .slice(0, 4);
  }, [instances]);

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      {hasDemoData && <DemoDataBanner onCleared={onDemoCleared} />}

      <PageHeader
        eyebrow={format(now, "EEEE d 'de' MMMM, yyyy", { locale: es })}
        eyebrowIcon={CalendarDays}
        title={`${greeting()}, Nico`}
        description="Resumen de tu actividad financiera y patrimonio."
      />

      {/* Net Worth */}
      <Card className="border-border">
        <CardContent className="pt-6 pb-6">
          <p className="text-xs uppercase tracking-[0.14em] text-primary/80 font-semibold">Net Worth</p>
          <p className="font-display text-4xl font-semibold mt-1.5 tracking-tight flowit-gradient-text">
            {maskAmount(formatUSD(netWorth), isPrivate)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Actualizado hoy</p>
        </CardContent>
      </Card>


      <FundFlowDiagram />

      {/* Este mes */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Este mes</h2>
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-success/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1.5 text-success text-xs font-medium mb-1"><TrendingUp className="h-3.5 w-3.5" /> Ingresos</div>
              <p className="text-lg font-bold text-foreground">{formatUSD(monthIncome)}</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/20">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1.5 text-destructive text-xs font-medium mb-1"><TrendingDown className="h-3.5 w-3.5" /> Gastos</div>
              <p className="text-lg font-bold text-foreground">{formatUSD(totalMonthSpending)}</p>
              {momChange !== 0 && (
                <p className={`text-[10px] flex items-center gap-0.5 mt-0.5 font-medium ${momChange > 0 ? 'text-destructive' : 'text-success'}`}>
                  {momChange > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {Math.abs(momChange).toFixed(0)}% vs mes anterior
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium mb-1">Ahorro</div>
              <p className={cn('text-lg font-bold', monthSavings >= 0 ? 'text-foreground' : 'text-destructive')}>{formatUSD(monthSavings)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alertas */}
      <PendingCreditsBanner variant="inline" />
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => (
            <div key={alert.id} className={cn(
              'flex items-center justify-between px-4 py-2.5 rounded-xl text-sm',
              alert.type === 'warning'
                ? 'bg-destructive/10 text-destructive border border-destructive/20'
                : 'bg-primary/10 text-primary border border-primary/20'
            )}>
              <span>{alert.message}</span>
              {alert.action && (
                <button onClick={() => navigate(alert.action!)} className="text-xs font-semibold underline shrink-0 ml-3">
                  {alert.actionLabel}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Próximos pagos */}
      {upcoming.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" /> Próximos pagos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((inst: any) => {
              const r = inst.recurring_expenses;
              const pm = r?.payment_methods;
              const dueDate = new Date(inst.expected_date + 'T12:00:00');
              return (
                <div key={inst.id} className="flex items-center gap-3 py-1.5">
                  <MerchantLogo name={r?.name || ''} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{r?.name || 'Recurrente'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {format(dueDate, 'd MMM', { locale: es })}{pm ? ` · ${pm.name}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground tabular-nums">{formatCurrency(Math.abs(Number(inst.expected_amount)), inst.expected_currency)}</p>
                    <RecurringStatusBadge state={inst.derived} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Mayor gasto este mes */}
      {topCategories.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Mayor gasto este mes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topCategories.map(cat => {
              const colors = getCategoryColor(cat.name, cat.color);
              const pct = totalMonthSpending > 0 ? (cat.total / totalMonthSpending * 100) : 0;
              const barPct = (cat.total / maxCatSpend) * 100;
              return (
                <div key={cat.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{getCategoryIcon(cat.name, cat.icon)}</span>
                      <span className="font-medium text-foreground">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                    <span className="font-semibold text-foreground tabular-nums">{formatUSD(cat.total)}</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barPct}%`, backgroundColor: colors.hex }} />
                  </div>
                  {cat.isDigital && cat.children.length > 0 && (
                    <div className="pl-7 pt-1.5 space-y-1.5">
                      {cat.children.map(child => {
                        const childPct = cat.total > 0 ? (child.total / cat.total * 100) : 0;
                        const childBarPct = (child.total / maxCatSpend) * 100;
                        return (
                          <div key={child.name} className="space-y-0.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">↳ {child.name}</span>
                              <span className="text-foreground tabular-nums font-medium">{formatUSD(child.total)} <span className="text-muted-foreground">({childPct.toFixed(0)}%)</span></span>
                            </div>
                            <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${childBarPct}%`, backgroundColor: colors.hex, opacity: 0.6 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Dólar Blue */}
      {blueDollar && (
        <Card className="border-primary/20">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-muted-foreground">Dólar Blue</p>
              <p className="text-sm font-bold text-foreground">
                1 USD = {blueDollar.blue_avg ? Math.round(blueDollar.blue_avg).toLocaleString('es-AR') : Math.round(1 / blueDollar.rate).toLocaleString('es-AR')} ARS
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
