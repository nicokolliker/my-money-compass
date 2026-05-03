import { useMemo } from 'react';
import { format, subMonths } from 'date-fns';
import { useImportLog } from '@/hooks/useImportLog';
import { useTransactions } from '@/hooks/useTransactions';
import { useBudgets } from '@/hooks/useBudgets';
import { useDerivedInstances } from '@/hooks/useRecurringInstances';
import { useRuleSuggestions } from '@/hooks/useRuleSuggestions';

export interface HomeAlert {
  id: string;
  type: 'warning' | 'info';
  message: string;
  action?: string;
  actionLabel?: string;
}

const SOURCE_LABEL: Record<string, string> = {
  arq: 'ARQ',
  mercadopago: 'MercadoPago',
  banco_ciudad: 'Banco Ciudad',
  splitwise: 'Splitwise',
  wise: 'Wise',
};

const MONTH_NAMES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTH_NAMES_ES[m - 1]} ${y}`;
}

export function useHomeAlerts() {
  const { data: importLog } = useImportLog();
  const { data: instances } = useDerivedInstances();
  const today = new Date();
  const monthStart = format(today, 'yyyy-MM') + '-01';
  const { data: budgets } = useBudgets(monthStart);
  const { data: transactions } = useTransactions();
  const suggestions = useRuleSuggestions();

  return useMemo(() => {
    const now = new Date();
    const currentMonth = format(now, 'yyyy-MM');
    const monthStart = currentMonth + '-01';
    const alerts: HomeAlert[] = [];
    const sources = ['arq', 'mercadopago', 'banco_ciudad'];
    for (const source of sources) {
      const hasCurrent = importLog?.some(l => l.source === source && l.month === currentMonth);
      const hasHistory = importLog?.some(l => l.source === source);
      if (hasHistory && !hasCurrent) {
        alerts.push({
          id: `import-${source}-${currentMonth}`,
          type: 'warning',
          message: `No importaste ${SOURCE_LABEL[source]} de ${monthLabel(currentMonth)}`,
          action: '/import',
          actionLabel: 'Ir a Import',
        });
      }
    }

    const overdue = (instances || []).filter((i: any) => i.derived === 'missing').length;
    if (overdue > 0) {
      alerts.push({
        id: 'recurring-overdue',
        type: 'warning',
        message: `${overdue} pago${overdue > 1 ? 's' : ''} recurrente${overdue > 1 ? 's' : ''} sin confirmar este mes`,
        action: '/planning/calendar',
        actionLabel: 'Ver Calendar',
      });
    }

    // Budgets >= 80%
    if (budgets && transactions) {
      const monthTxs = transactions.filter((t: any) => t.type === 'expense' && t.date >= monthStart);
      for (const b of budgets) {
        const spent = monthTxs
          .filter((t: any) => t.category_id === b.category_id)
          .reduce((s: number, t: any) => s + Math.abs(Number(t.amount_usd)), 0);
        const budgetAmt = Number(b.amount);
        if (budgetAmt <= 0) continue;
        const pct = Math.round((spent / budgetAmt) * 100);
        if (pct >= 80) {
          const cat = (b as any).categories;
          alerts.push({
            id: `budget-${b.category_id}-${currentMonth}`,
            type: pct >= 100 ? 'warning' : 'info',
            message: `${cat?.icon || '📊'} ${cat?.name || 'Categoría'} usó el ${pct}% del budget de ${monthLabel(currentMonth)}`,
            action: '/planning/budget',
            actionLabel: 'Ver Budget',
          });
        }
      }
    }

    if (suggestions.length > 0) {
      alerts.push({
        id: 'rule-suggestions',
        type: 'info',
        message: `Hay ${suggestions.length} sugerencia${suggestions.length > 1 ? 's' : ''} para mejorar la categorización`,
        action: '/rules',
        actionLabel: 'Ver sugerencias',
      });
    }

    return alerts;
  }, [importLog, instances, budgets, transactions, suggestions, monthStart]);
}
