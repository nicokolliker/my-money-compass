import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, ArrowLeftRight, BarChart3, Settings, Repeat, BookOpen, Plus, CalendarDays, Target, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useState } from 'react';
import { TransactionForm } from '@/components/transactions/TransactionForm';
import { useAuth } from '@/hooks/useAuth';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/transactions', label: 'Activity', icon: ArrowLeftRight },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/recurring', label: 'Recurring', icon: Repeat },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/budget', label: 'Budget', icon: Target },
  { path: '/rules', label: 'Rules', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_TOP = [
  { path: '/', label: 'Home', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/transactions', label: 'Activity', icon: ArrowLeftRight },
];

const MOBILE_BOTTOM = [
  { path: '/recurring', label: 'Recurring', icon: Repeat },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const { signOut, user } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 border-r bg-card/80 backdrop-blur-sm">
        <div className="flex h-16 items-center px-5 border-b">
          <h1 className="text-lg font-bold text-foreground tracking-tight">💰 FinTrack</h1>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                location.pathname === item.path
                  ? 'bg-primary text-primary-foreground shadow-soft'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t">
          <Button className="w-full rounded-xl h-11 shadow-soft" onClick={() => setShowQuickAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Quick Add
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:ml-60 pb-24 lg:pb-0">
        <div className="max-w-2xl mx-auto px-4 py-5 lg:py-8">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur-md border-t z-50 safe-area-bottom">
        <div className="flex items-center justify-around h-16">
          {MOBILE_TOP.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] font-medium transition-colors',
                location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn("h-5 w-5 transition-transform", location.pathname === item.path && "scale-110")} />
              {item.label}
            </button>
          ))}
          {/* FAB */}
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center justify-center w-13 h-13 -mt-7 rounded-2xl bg-primary text-primary-foreground shadow-elevated active:scale-95 transition-transform"
            style={{ width: 52, height: 52 }}
          >
            <Plus className="h-6 w-6" />
          </button>
          {MOBILE_BOTTOM.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1.5 px-3 text-[10px] font-medium transition-colors',
                location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className={cn("h-5 w-5 transition-transform", location.pathname === item.path && "scale-110")} />
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Quick Add Sheet */}
      <Sheet open={showQuickAdd} onOpenChange={setShowQuickAdd}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
          <TransactionForm onSuccess={() => setShowQuickAdd(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
