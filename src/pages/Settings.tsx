import { Navigate } from 'react-router-dom';

// Settings is deprecated as a top-level destination. Sub-areas live in
// /rules (data management) and /integrations (active integrations).
export default function Settings({ initialTab }: { initialTab?: string } = {}) {
  if (initialTab === 'integrations') return <Navigate to="/integrations" replace />;
  if (initialTab === 'import') return <Navigate to="/import" replace />;
  if (initialTab === 'categories') return <Navigate to="/rules" state={{ tab: 'categories' }} replace />;
  if (initialTab === 'merchants') return <Navigate to="/rules" state={{ tab: 'merchants' }} replace />;
  if (initialTab === 'fx') return <Navigate to="/rules" state={{ tab: 'fx' }} replace />;
  return <Navigate to="/rules" replace />;
}
