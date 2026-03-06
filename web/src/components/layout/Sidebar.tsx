import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ClipboardCheck,
  ListTodo,
  FileText,
  Activity,
  Users,
  Route,
  ScrollText,
  RefreshCw,
  Upload,
  Settings,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { reviewsApi } from '@/api/endpoints/reviews';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/reviews', icon: ClipboardCheck, label: 'Reviews', showBadge: true },
  { to: '/tasks', icon: ListTodo, label: 'Tasks' },
  { to: '/evidence', icon: FileText, label: 'Evidence' },
  { to: '/pipeline', icon: Activity, label: 'Pipeline' },
  { to: '/identity', icon: Users, label: 'Identity' },
  { to: '/routing', icon: Route, label: 'Routing' },
  { to: '/audit', icon: ScrollText, label: 'Audit Log' },
  { to: '/clio', icon: RefreshCw, label: 'Clio Sync' },
  { to: '/ingest', icon: Upload, label: 'Ingest' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const { data: reviews } = useQuery({
    queryKey: ['reviews', 'open-count'],
    queryFn: () => reviewsApi.list(1, 0),
    refetchInterval: 30_000,
  });

  const openCount = reviews?.total ?? 0;

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-sidebar">
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-lg font-semibold text-sidebar-foreground">TaskMaster2</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ to, icon: Icon, label, showBadge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {showBadge && openCount > 0 && (
              <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
                {openCount}
              </Badge>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
