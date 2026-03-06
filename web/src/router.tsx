import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReviewQueuePage } from '@/pages/ReviewQueuePage';
import { ReviewDetailPage } from '@/pages/ReviewDetailPage';
import { TaskListPage } from '@/pages/TaskListPage';
import { TaskDetailPage } from '@/pages/TaskDetailPage';
import { EvidenceBrowserPage } from '@/pages/EvidenceBrowserPage';
import { EvidenceDetailPage } from '@/pages/EvidenceDetailPage';
import { PipelineMonitorPage } from '@/pages/PipelineMonitorPage';
import { IdentityManagementPage } from '@/pages/IdentityManagementPage';
import { RoutingRulesPage } from '@/pages/RoutingRulesPage';
import { AuditLogPage } from '@/pages/AuditLogPage';
import { ClioSyncPage } from '@/pages/ClioSyncPage';
import { IngestPage } from '@/pages/IngestPage';
import { SettingsPage } from '@/pages/SettingsPage';

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'reviews', element: <ReviewQueuePage /> },
      { path: 'reviews/:id', element: <ReviewDetailPage /> },
      { path: 'tasks', element: <TaskListPage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'evidence', element: <EvidenceBrowserPage /> },
      { path: 'evidence/:id', element: <EvidenceDetailPage /> },
      { path: 'pipeline', element: <PipelineMonitorPage /> },
      { path: 'identity', element: <IdentityManagementPage /> },
      { path: 'routing', element: <RoutingRulesPage /> },
      { path: 'audit', element: <AuditLogPage /> },
      { path: 'clio', element: <ClioSyncPage /> },
      { path: 'ingest', element: <IngestPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
