import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { observabilityApi } from '@/api/endpoints/observability';
import { pipelineApi } from '@/api/endpoints/pipeline';
import { reviewsApi } from '@/api/endpoints/reviews';
import { healthApi } from '@/api/endpoints/health';
import { syncApi } from '@/api/endpoints/sync';
import { PIPELINE_STAGES, REVIEW_REASON_COLORS, REVIEW_REASON_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  FileText,
  ListTodo,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';

export function DashboardPage() {
  const navigate = useNavigate();

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => observabilityApi.metrics(),
    refetchInterval: 30_000,
  });

  const { data: pipelineMetrics } = useQuery({
    queryKey: ['pipeline', 'metrics'],
    queryFn: () => pipelineApi.metrics(),
    refetchInterval: 30_000,
  });

  const { data: recentReviews } = useQuery({
    queryKey: ['reviews', 'recent'],
    queryFn: () => reviewsApi.list(5, 0),
    refetchInterval: 30_000,
  });

  const { data: readyStatus } = useQuery({
    queryKey: ['ready'],
    queryFn: () => healthApi.ready(),
    refetchInterval: 30_000,
    retry: false,
  });

  const { data: clioStatus } = useQuery({
    queryKey: ['clio', 'status'],
    queryFn: () => syncApi.clioStatus(),
    refetchInterval: 30_000,
    retry: false,
  });

  if (metricsLoading) return <LoadingSpinner />;

  const pm = metrics?.pipeline;
  const stats = [
    {
      label: 'Total Evidence',
      value: pm?.evidence_total ?? 0,
      icon: FileText,
      color: 'text-blue-600',
    },
    {
      label: 'Total Tasks',
      value: pm?.tasks_total ?? 0,
      icon: ListTodo,
      color: 'text-green-600',
    },
    {
      label: 'Open Reviews',
      value: pm?.reviews_open ?? 0,
      icon: ClipboardCheck,
      color: 'text-purple-600',
      onClick: () => navigate('/reviews'),
    },
    {
      label: 'Sync Conflicts',
      value: pm?.sync_conflicts ?? 0,
      icon: AlertTriangle,
      color: 'text-orange-600',
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className={cn(stat.onClick && 'cursor-pointer hover:border-primary/50')}
            onClick={stat.onClick}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={cn('h-5 w-5', stat.color)} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipeline overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Stages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-4">
              {PIPELINE_STAGES.map((stage) => {
                const m = pipelineMetrics?.[stage];
                const failed = m?.failed ?? 0;
                return (
                  <div
                    key={stage}
                    className={cn(
                      'rounded-md border p-3 text-center',
                      failed > 0 ? 'border-destructive/50 bg-destructive/5' : '',
                    )}
                  >
                    <div className="text-xs font-medium capitalize text-muted-foreground">
                      {stage}
                    </div>
                    <div className="mt-1 text-lg font-bold">{m?.waiting ?? 0}</div>
                    <div className="text-xs text-muted-foreground">waiting</div>
                    {(m?.active ?? 0) > 0 && (
                      <div className="mt-1 text-xs text-blue-600">{m?.active} active</div>
                    )}
                    {failed > 0 && (
                      <div className="mt-1 text-xs text-destructive">{failed} failed</div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* System health */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {readyStatus ? (
              <>
                <HealthRow
                  label="PostgreSQL"
                  ok={readyStatus.checks.postgres === 'ok'}
                />
                <HealthRow
                  label="Redis"
                  ok={readyStatus.checks.redis === 'ok'}
                />
                <HealthRow
                  label="Embedding Service"
                  ok={readyStatus.checks.embedding === 'ok'}
                />
                <HealthRow
                  label="Clio Connection"
                  ok={clioStatus?.connected ?? false}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Unable to reach API</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent reviews */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Open Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {recentReviews && recentReviews.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reason</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentReviews.items.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/reviews/${r.id}`)}
                  >
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('text-xs', REVIEW_REASON_COLORS[r.reason])}
                      >
                        {REVIEW_REASON_LABELS[r.reason]}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.priority}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DateDisplay date={r.created_at} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No open reviews</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HealthRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      {ok ? (
        <div className="flex items-center gap-1 text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-xs">OK</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-xs">Down</span>
        </div>
      )}
    </div>
  );
}
