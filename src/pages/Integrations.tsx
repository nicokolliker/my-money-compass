import IntegrationsTab from '@/components/settings/IntegrationsTab';

export default function IntegrationsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Active Integrations</h1>
        <p className="text-sm text-muted-foreground">Connected services and their sync status</p>
      </div>
      <IntegrationsTab />
    </div>
  );
}
