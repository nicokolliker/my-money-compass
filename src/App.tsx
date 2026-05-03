import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import Planning from "./pages/Planning";
import Rules from "./pages/Rules";
import ImportPage from "./pages/Import";
import IntegrationsPage from "./pages/Integrations";
import Settings from "./pages/Settings";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/planning" element={<Navigate to="/planning/recurring" replace />} />
        <Route path="/planning/recurring" element={<Planning initialTab="recurring" />} />
        <Route path="/planning/calendar" element={<Planning initialTab="calendar" />} />
        <Route path="/planning/budget" element={<Planning initialTab="budget" />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/rules/categories" element={<Rules initialTab="categories" />} />
        <Route path="/rules/merchants" element={<Rules initialTab="merchants" />} />
        <Route path="/rules/fx" element={<Rules initialTab="fx" />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        {/* Legacy redirects */}
        <Route path="/recurring" element={<Navigate to="/planning/recurring" replace />} />
        <Route path="/calendar" element={<Navigate to="/planning/calendar" replace />} />
        <Route path="/budget" element={<Navigate to="/planning/budget" replace />} />
        <Route path="/system/categories" element={<Navigate to="/rules/categories" replace />} />
        <Route path="/system/merchants" element={<Navigate to="/rules/merchants" replace />} />
        <Route path="/system/fx" element={<Navigate to="/rules/fx" replace />} />
        <Route path="/system/integrations" element={<Navigate to="/integrations" replace />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

function AuthGuard() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Auth />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthGuard />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
