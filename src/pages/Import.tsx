import ImportTab from '@/components/settings/ImportTab';

export default function ImportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Import</h1>
        <p className="text-sm text-muted-foreground">Upload CSV statements, download templates and reconcile transactions</p>
      </div>
      <ImportTab />
    </div>
  );
}
