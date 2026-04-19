import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDerivedInstances, useRefreshRecurringTracking, useMarkInstancePaid } from '@/hooks/useRecurringInstances';
import { useFxRates } from '@/hooks/useFxRates';
import { formatCurrency, formatUSD } from '@/lib/constants';
import { toUSD, isDerivedPaid, type FxRateRow } from '@/lib/money';
import { getBrandLogo, getInitialsColor } from '@/lib/brandLogos';
import { RecurringStatusBadge } from '@/components/recurring/RecurringStatusBadge';
import {
  ChevronLeft, ChevronRight, CalendarDays, AlertCircle, CreditCard, Wallet, RefreshCw, CheckCircle2,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, addMonths, subMonths, getDay } from 'date-fns';
import { toast } from 'sonner';

export default function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<'calendar' | 'timeline'>('timeline');
  const monthStart = startOfMonth(currentMonth).toISOString().split('T')[0];
  const monthEnd = endOfMonth(currentMonth).toISOString().split('T')[0];

  const { data: instances, isLoading } = useDerivedInstances({ from: monthStart, to: monthEnd });
  const { data: fxRates } = useFxRates();
  const refresh = useRefreshRecurringTracking();
  const markPaid = useMarkInstancePaid();

  const items = useMemo(() => {
    if (!instances) return [];
    return instances.map(i => ({
      ...i,
      dueDate: new Date(i.expected_date + 'T12:00:00'),
      isPaid: isDerivedPaid(i.derived),
      isMissing: i.derived === 'missing',
      isNeedsReview: i.derived === 'needs_review',
      isUpcoming: i.derived === 'upcoming',
    })).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [instances]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start);
    return { days, startPad };
  }, [currentMonth]);

  const dayEvents = useMemo(() => {
    const map: Record<string, typeof items> = {};
    items.forEach(item => {
      const d = item.expected_date;
      if (!map[d]) map[d] = [];
      map[d].push(item);
    });
    return map;
  }, [items]);

  const totalUpcoming = items
    .filter(i => !i.isPaid)
    .reduce((s, i) => s + toUSD(Number(i.expected_amount), i.expected_currency, fxRates as FxRateRow[] | undefined), 0);
  const missingCount = items.filter(i => i.isMissing).length;
  const paidCount = items.filter(i => i.isPaid).length;

  const handleRefresh = async () => {
    try {
      const r = await refresh.mutateAsync();
      toast.success(`Refreshed: ${r.matched} matched`);
    } catch (e: any) { toast.error(e.message); }
  };

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Payments Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refresh.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
          </Button>
          <div className="flex rounded-xl overflow-hidden border">
            <Button variant={view === 'timeline' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setView('timeline')}>Timeline</Button>
            <Button variant={view === 'calendar' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setView('calendar')}>Calendar</Button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><CalendarDays className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Upcoming</p>
              <p className="text-lg font-bold text-foreground">{formatUSD(totalUpcoming)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${missingCount > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
              <AlertCircle className={`h-4 w-4 ${missingCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Missing</p>
              <p className="text-lg font-bold text-foreground">{missingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Paid</p>
              <p className="text-lg font-bold text-foreground">{paidCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {view === 'timeline' ? (
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No expected payments this month</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={handleRefresh}>Generate instances</Button>
            </div>
          )}
          {items.map(item => {
            const r = (item as any).recurring_expenses;
            const name = r?.name || 'Recurring';
            const brand = getBrandLogo(name);
            const initials = getInitialsColor(name);
            const cat = r?.categories;
            const acc = r?.accounts;
            const pm = r?.payment_methods;
            const usd = toUSD(Number(item.expected_amount), item.expected_currency, fxRates as FxRateRow[] | undefined);
            const daysUntil = Math.ceil((item.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            return (
              <Card key={item.id} className={
                item.isPaid ? 'border-success/30 opacity-90' :
                item.isMissing ? 'border-destructive/30' :
                item.isNeedsReview ? 'border-amber-500/30' : ''
              }>
                <CardContent className="flex items-center gap-3 py-3.5">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-[10px] text-muted-foreground uppercase">{format(item.dueDate, 'MMM')}</p>
                    <p className="text-xl font-bold text-foreground">{format(item.dueDate, 'd')}</p>
                  </div>
                  <div className="w-px h-10 bg-border" />
                  {brand ? (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base ${brand.bg}`}>{brand.icon}</div>
                  ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${initials.bg} ${initials.text}`}>
                      {name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                      {cat && <span>{cat.icon} {cat.name}</span>}
                      {pm && <><span>·</span><span className="flex items-center gap-0.5"><CreditCard className="h-3 w-3" />{pm.name}</span></>}
                      {acc && <><span>·</span><span className="flex items-center gap-0.5"><Wallet className="h-3 w-3" />{acc.name}</span></>}
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(Number(item.expected_amount), item.expected_currency)}</p>
                    {item.expected_currency !== 'USD' && <p className="text-[10px] text-muted-foreground tabular-nums">~{formatUSD(usd)}</p>}
                    <RecurringStatusBadge state={item.derived} />
                    {!item.isPaid && !item.isMissing && (
                      <p className="text-[10px] text-muted-foreground">{daysUntil > 0 ? `${daysUntil}d away` : daysUntil === 0 ? 'Today' : `${Math.abs(daysUntil)}d overdue`}</p>
                    )}
                  </div>
                </CardContent>
                {!item.isPaid && (
                  <div className="px-4 pb-3">
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => markPaid.mutateAsync(item.id).then(() => toast.success('Marked paid'))}>
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Mark paid
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => subMonths(m, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle className="text-sm font-medium">{format(currentMonth, 'MMMM yyyy')}</CardTitle>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth(m => addMonths(m, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-px">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-1">{d}</div>
              ))}
              {Array.from({ length: calendarDays.startPad }).map((_, i) => <div key={`pad-${i}`} />)}
              {calendarDays.days.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const events = dayEvents[key] || [];
                return (
                  <div key={key} className={`min-h-[3rem] p-0.5 rounded-lg text-center ${isToday(day) ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}>
                    <p className={`text-xs ${isToday(day) ? 'font-bold text-primary' : 'text-foreground'}`}>{format(day, 'd')}</p>
                    {events.length > 0 && (
                      <div className="flex flex-col items-center gap-0.5 mt-0.5">
                        {events.slice(0, 2).map((e: any) => (
                          <div
                            key={e.id}
                            className={`w-1.5 h-1.5 rounded-full ${e.isPaid ? 'bg-success' : e.isMissing ? 'bg-destructive' : e.isNeedsReview ? 'bg-amber-500' : 'bg-muted-foreground'}`}
                            title={`${(e as any).recurring_expenses?.name} · ${e.derived}`}
                          />
                        ))}
                        {events.length > 2 && <span className="text-[8px] text-muted-foreground">+{events.length - 2}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t justify-center">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><div className="w-2 h-2 rounded-full bg-success" /> Paid</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><div className="w-2 h-2 rounded-full bg-amber-500" /> Needs review</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><div className="w-2 h-2 rounded-full bg-destructive" /> Missing</div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><div className="w-2 h-2 rounded-full bg-muted-foreground" /> Upcoming</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
