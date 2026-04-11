import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wallet, ArrowLeftRight, BarChart3, Settings, Repeat, BookOpen, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { TransactionForm } from '@/components/transactions/TransactionForm';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/accounts', label: 'Accounts', icon: Wallet },
  { path: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/subscriptions', label: 'Subs', icon: Repeat },
  { path: '/rules', label: 'Rules', icon: BookOpen },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:fixed lg:inset-y-0 border-r bg-card">
        <div className="flex h-14 items-center px-4 border-b">
          <h1 className="text-lg font-bold text-foreground">💰 FinTrack</h1>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                location.pathname === item.path
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t">
          <Button className="w-full" onClick={() => setShowQuickAdd(true)}>
            <Plus className="h-4 w-4 mr-2" /> Quick Add
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 lg:ml-56 pb-20 lg:pb-0">
        <div className="max-w-5xl mx-auto px-4 py-4 lg:py-6">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-card border-t z-50 safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {NAV_ITEMS.slice(0, 3).map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1 px-2 text-xs',
                location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          ))}
          {/* FAB */}
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center justify-center w-12 h-12 -mt-6 rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Plus className="h-6 w-6" />
          </button>
          {NAV_ITEMS.slice(3, 5).map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 py-1 px-2 text-xs',
                location.pathname === item.path ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
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
