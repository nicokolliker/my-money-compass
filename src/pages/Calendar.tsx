import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRecurringExpenses } from '@/hooks/useRecurringExpenses';
import { formatCurrency, formatUSD } from '@/lib/constants';
import { getBrandLogo, getInitialsColor } from '@/lib/brandLogos';
import { ChevronLeft, ChevronRight, CalendarDays, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, isBefore, addMonths, subMonths, getDay } from 'date-fns';

export default function CalendarPage() {
  const { data: items, isLoading } = useRecurringExpenses();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<'calendar' | 'timeline'>('timeline');

  const upcoming = useMemo(() => {
    if (!items) return [];
    const now = new Date();
    const end = addMonths(now, 1);
    return items
      .filter(i => i.is_active && i.next_due_date)
      .map(i => ({
        ...i,
        dueDate: new Date(i.next_due_date + 'T12:00:00'),
        isOverdue: isBefore(new Date(i.next_due_date + 'T12:00:00'), now) && i.status !== 'paid',
      }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [items]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start, end });
    const startPad = getDay(start);
    return { days, startPad };
  }, [currentMonth]);

  const dayEvents = useMemo(() => {
    if (!items) return {};
    const map: Record<string, typeof upcoming> = {};
    items.filter(i => i.is_active && i.next_due_date).forEach(item => {
      const d = item.next_due_date!;
      if (!map[d]) map[d] = [];
      map[d].push({
        ...item,
        dueDate: new Date(d + 'T12:00:00'),
        isOverdue: isBefore(new Date(d + 'T12:00:00'), new Date()) && item.status !== 'paid',
      } as any);
    });
    return map;
  }, [items]);

  const totalUpcoming = upcoming.reduce((s, i) => s + Math.abs(Number(i.amount)), 0);
  const overdueCount = upcoming.filter(i => i.isOverdue).length;

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Payments Calendar</h1>
        <div className="flex rounded-xl overflow-hidden border">
          <Button variant={view === 'timeline' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setView('timeline')}>Timeline</Button>
          <Button variant={view === 'calendar' ? 'secondary' : 'ghost'} size="sm" className="rounded-none h-8 text-xs" onClick={() => setView('calendar')}>Calendar</Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center"><CalendarDays className="h-4 w-4 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground">Upcoming (30d)</p>
              <p className="text-lg font-bold text-foreground">{formatUSD(totalUpcoming)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${overdueCount > 0 ? 'bg-destructive/10' : 'bg-muted'}`}>
              <AlertCircle className={`h-4 w-4 ${overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Overdue</p>
              <p className="text-lg font-bold text-foreground">{overdueCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {view === 'timeline' ? (
        <div className="space-y-2">
          {upcoming.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No upcoming payments</p>
              <p className="text-sm opacity-70">Add recurring expenses to see them here</p>
            </div>
          )}
          {upcoming.map(item => {
            const brand = getBrandLogo(item.name);
            const initials = getInitialsColor(item.name);
            const cat = (item as any).categories;
            const acc = (item as any).accounts;
            const daysUntil = Math.ceil((item.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            return (
              <Card key={item.id} className={item.isOverdue ? 'border-destructive/30' : daysUntil <= 3 ? 'border-amber-500/30' : ''}>
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
                      {item.name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{item.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {cat && <span>{cat.icon} {cat.name}</span>}
                      {acc && <><span>·</span><span>{acc.name}</span></>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-foreground tabular-nums">{formatCurrency(Math.abs(Number(item.amount)), item.currency)}</p>
                    {item.isOverdue ? (
                      <Badge variant="destructive" className="text-[9px] h-4 px-1.5">Overdue</Badge>
                    ) : daysUntil <= 3 ? (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">In {daysUntil}d</Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{daysUntil}d away</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Calendar view */
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
                const hasOverdue = events.some((e: any) => e.isOverdue);
                return (
                  <div key={key} className={`min-h-[3rem] p-0.5 rounded-lg text-center ${isToday(day) ? 'bg-primary/10 ring-1 ring-primary/30' : ''}`}>
                    <p className={`text-xs ${isToday(day) ? 'font-bold text-primary' : 'text-foreground'}`}>{format(day, 'd')}</p>
                    {events.length > 0 && (
                      <div className="flex flex-col items-center gap-0.5 mt-0.5">
                        {events.slice(0, 2).map((e: any) => (
                          <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${hasOverdue ? 'bg-destructive' : 'bg-primary'}`} title={e.name} />
                        ))}
                        {events.length > 2 && <span className="text-[8px] text-muted-foreground">+{events.length - 2}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
