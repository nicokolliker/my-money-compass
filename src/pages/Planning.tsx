import { useLocation, useNavigate } from 'react-router-dom';
import RecurringExpenses from './RecurringExpenses';
import BudgetPage from './Budget';

type PlanningTab = 'recurring' | 'budget';

const SECTION_META: Record<PlanningTab, { label: string; description: string }> = {
  recurring: { label: 'Recurring', description: 'Library of recurring items + payments calendar' },
  budget: { label: 'Budget', description: 'Planificación mensual y anual' },
};

export default function Planning({ initialTab }: { initialTab?: PlanningTab } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab: PlanningTab = initialTab || (location.state as any)?.tab || 'recurring';
  const meta = SECTION_META[tab];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleNavigate = (t: PlanningTab) => {
    const map: Record<PlanningTab, string> = {
      recurring: '/planning/recurring',
      budget: '/planning/budget',
    };
    navigate(map[t], { replace: true });
  };

  const fullWidth = tab === 'budget';

  return (
    <div className={fullWidth ? 'space-y-4' : 'space-y-4 max-w-5xl'}>
      <div className={fullWidth ? 'relative left-1/2 w-screen -translate-x-1/2 px-4 lg:w-[calc(100vw-18rem)] lg:px-6' : ''}>
        <h1 className="text-2xl font-bold text-foreground">{meta.label}</h1>
        <p className="text-sm text-muted-foreground">{meta.description}</p>
      </div>

      {tab === 'recurring' && <RecurringExpenses embedded />}
      {tab === 'budget' && <BudgetPage embedded />}
    </div>
  );
}
