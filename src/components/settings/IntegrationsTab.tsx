import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getBrandLogo, getInitialsColor } from '@/lib/brandLogos';
import { Wifi, Upload, Clock } from 'lucide-react';
import { useAccounts } from '@/hooks/useAccounts';

interface Integration {
  id: string;
  name: string;
  description: string;
  method: 'api' | 'csv' | 'planned';
  comingSoon?: boolean;
}

const INTEGRATIONS: Integration[] = [
  { id: 'wise', name: 'Wise', description: 'Auto-sync balances and transactions via API', method: 'api', comingSoon: true },
  { id: 'mercadopago', name: 'Mercado Pago', description: 'Import transactions via CSV export', method: 'csv' },
  { id: 'dolarapp', name: 'DolarApp', description: 'Import transactions via CSV export', method: 'csv' },
  { id: 'galicia', name: 'Galicia', description: 'Import transactions via CSV export', method: 'csv' },
  { id: 'deel', name: 'Deel', description: 'Auto-sync invoices and payments via API', method: 'api', comingSoon: true },
  { id: 'binance', name: 'Binance', description: 'Planned integration', method: 'planned' },
];

const METHOD_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  api: { label: 'API', variant: 'default' },
  csv: { label: 'CSV Import', variant: 'secondary' },
  planned: { label: 'Planned', variant: 'outline' },
};

export default function IntegrationsTab() {
  const { data: accounts } = useAccounts();

  function getLinkedAccounts(id: string) {
    if (!accounts) return [];
    return accounts.filter(a =>
      a.source === 'csv' && a.institution?.toLowerCase().includes(id.toLowerCase())
    );
  }

  return (
    <div className="space-y-3 mt-4">
      <p className="text-sm text-muted-foreground px-1">
        Connect your financial accounts to import transactions automatically or via CSV.
      </p>
      {INTEGRATIONS.map(integration => {
        const brand = getBrandLogo(integration.name);
        const initials = getInitialsColor(integration.name);
        const methodCfg = METHOD_LABELS[integration.method];
        const linkedAccounts = getLinkedAccounts(integration.id);

        return (
          <Card
            key={integration.id}
            className={`transition-colors ${integration.comingSoon || integration.method === 'planned' ? 'opacity-75' : 'hover:border-primary/30'}`}
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
                  {integration.comingSoon && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-amber-600 border-amber-300">
                      <Clock className="h-2.5 w-2.5 mr-0.5" /> Coming Soon
                    </Badge>
                  )}
                  {integration.method === 'planned' && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">
                      <Clock className="h-2.5 w-2.5 mr-0.5" /> Planned
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{integration.description}</p>

                {linkedAccounts.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {linkedAccounts.map((acct: any) => (
                      <Badge key={acct.id} variant="outline" className="text-[10px] h-5 px-1.5 font-medium">
                        {acct.name} · {acct.currency}
                      </Badge>
                    ))}
                  </div>
                )}

                {integration.method === 'csv' && !integration.comingSoon && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Use the <span className="font-medium text-foreground">Import</span> tab to upload CSV exports
                  </p>
                )}
              </div>
              {integration.method === 'api' && (
                <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              {integration.method === 'csv' && (
                <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
