import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getBrandLogo, getInitialsColor } from '@/lib/brandLogos';
import { Wifi, Upload, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import WiseTab from './WiseTab';
import { useState } from 'react';
import { useWiseSyncLog } from '@/hooks/useWiseSync';
import { useAccounts } from '@/hooks/useAccounts';

interface Integration {
  id: string;
  name: string;
  description: string;
  method: 'api' | 'csv' | 'planned';
  connected?: boolean;
}

const INTEGRATIONS: Integration[] = [
  { id: 'wise', name: 'Wise', description: 'Sync balances and transactions via API', method: 'api' },
  { id: 'mercadopago', name: 'Mercado Pago', description: 'Import transactions via CSV export', method: 'csv' },
  { id: 'dolarapp', name: 'DolarApp', description: 'Import transactions via CSV export', method: 'csv' },
  { id: 'galicia', name: 'Galicia', description: 'Import transactions via CSV export', method: 'csv' },
  { id: 'binance', name: 'Binance', description: 'Planned integration', method: 'planned' },
];

const METHOD_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  api: { label: 'API', variant: 'default' },
  csv: { label: 'CSV Import', variant: 'secondary' },
  planned: { label: 'Planned', variant: 'outline' },
};

export default function IntegrationsTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: syncLog } = useWiseSyncLog();
  const { data: accounts } = useAccounts();

  const wiseAccounts = accounts?.filter(a => (a as any).source === 'wise') || [];
  const lastWiseSync = syncLog?.[0];
  const isWiseConnected = !!lastWiseSync && lastWiseSync.status === 'success';

  function getIntegrationStatus(id: string) {
    if (id === 'wise') {
      return {
        connected: isWiseConnected,
        lastSync: lastWiseSync?.created_at ? new Date(lastWiseSync.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null,
        linkedAccounts: wiseAccounts.length,
      };
    }
    return { connected: false, lastSync: null, linkedAccounts: 0 };
  }

  return (
    <div className="space-y-3 mt-4">
      {INTEGRATIONS.map(integration => {
        const brand = getBrandLogo(integration.name);
        const initials = getInitialsColor(integration.name);
        const methodCfg = METHOD_LABELS[integration.method];
        const isExpanded = expanded === integration.id;
        const status = getIntegrationStatus(integration.id);

        return (
          <div key={integration.id}>
            <Card
              className={`cursor-pointer transition-colors hover:border-primary/30 ${isExpanded ? 'border-primary/40' : ''}`}
              onClick={() => setExpanded(isExpanded ? null : integration.id)}
            >
              <CardContent className="flex items-center gap-3 py-4">
                {brand ? (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${brand.bg}`}>{brand.icon}</div>
                ) : (
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${initials.bg} ${initials.text}`}>
                    {integration.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{integration.name}</p>
                    <Badge variant={methodCfg.variant} className="text-[9px] h-4 px-1.5">{methodCfg.label}</Badge>
                    {status.connected && (
                      <Badge variant="default" className="text-[9px] h-4 px-1.5 bg-success/10 text-success border-success/20">
                        <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Connected
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{integration.description}</p>
                  {status.connected && (
                    <div className="flex items-center gap-3 mt-1">
                      {status.lastSync && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <RefreshCw className="h-2.5 w-2.5" /> Last sync: {status.lastSync}
                        </span>
                      )}
                      {status.linkedAccounts > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {status.linkedAccounts} account{status.linkedAccounts !== 1 ? 's' : ''} linked
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {integration.method === 'api' && !status.connected && (
                  <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                {integration.method === 'csv' && (
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </CardContent>
            </Card>
            {isExpanded && integration.id === 'wise' && <WiseTab />}
            {isExpanded && integration.method === 'csv' && (
              <Card className="mt-1 border-dashed">
                <CardContent className="py-4 text-center">
                  <p className="text-sm text-muted-foreground">
                    Use the <span className="font-medium text-foreground">Import</span> tab in Settings to upload CSV exports from {integration.name}
                  </p>
                </CardContent>
              </Card>
            )}
            {isExpanded && integration.method === 'planned' && (
              <Card className="mt-1 border-dashed">
                <CardContent className="py-4 text-center">
                  <p className="text-sm text-muted-foreground">This integration is planned for a future release</p>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })}
    </div>
  );
}
