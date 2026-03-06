import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DataTable } from '@/components/shared/DataTable';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { pipelineApi } from '@/api/endpoints/pipeline';
import { PIPELINE_STAGES } from '@/lib/constants';
import type { FailedJob } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';
import { ChevronDown, RefreshCw } from 'lucide-react';

export function PipelineMonitorPage() {
  const queryClient = useQueryClient();
  const [failedStageFilter, setFailedStageFilter] = useState<string>('all');

  const { data: metrics, isLoading } = useQuery({
    queryKey: ['pipeline', 'metrics'],
    queryFn: () => pipelineApi.metrics(),
    refetchInterval: 10_000,
  });

  const { data: failedJobs } = useQuery({
    queryKey: ['pipeline', 'failed-jobs', failedStageFilter],
    queryFn: () =>
      pipelineApi.failedJobs(
        failedStageFilter === 'all' ? undefined : failedStageFilter,
      ),
    refetchInterval: 10_000,
  });

  const pauseMutation = useMutation({
    mutationFn: (stage: string) => pipelineApi.pause(stage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: (stage: string) => pipelineApi.resume(stage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  const retryMutation = useMutation({
    mutationFn: (stage: string) => pipelineApi.retryFailed(stage),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
  });

  if (isLoading) return <LoadingSpinner />;

  // Compute totals
  const totals = { waiting: 0, active: 0, completed: 0, failed: 0 };
  for (const stage of PIPELINE_STAGES) {
    const m = metrics?.[stage];
    if (m) {
      totals.waiting += m.waiting;
      totals.active += m.active;
      totals.completed += m.completed;
      totals.failed += m.failed;
    }
  }

  const failedColumns: Column<FailedJob>[] = [
    { header: 'Stage', accessorKey: 'stage' },
    {
      header: 'Reason',
      cell: (j) => (
        <span className="text-xs line-clamp-2">{j.failedReason}</span>
      ),
    },
    { header: 'Attempts', accessorKey: 'attemptsMade' },
    {
      header: 'Data',
      cell: (j) => (
        <Collapsible>
          <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
            <ChevronDown className="h-3 w-3 mr-1" /> View
          </CollapsibleTrigger>
          <CollapsibleContent>
            <JsonViewer data={j.data} maxHeight="200px" />
          </CollapsibleContent>
        </Collapsible>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Pipeline Monitor</h2>

      {/* Stage cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {PIPELINE_STAGES.map((stage) => {
          const m = metrics?.[stage];
          return (
            <Card key={stage}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm capitalize">{stage}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <span className="text-muted-foreground">Waiting</span>
                  <span className="font-bold text-right">{m?.waiting ?? 0}</span>
                  <span className="text-muted-foreground">Active</span>
                  <span className="font-bold text-right text-blue-600">
                    {m?.active ?? 0}
                  </span>
                  <span className="text-muted-foreground">Done</span>
                  <span className="font-bold text-right text-green-600">
                    {m?.completed ?? 0}
                  </span>
                  <span className="text-muted-foreground">Failed</span>
                  <span className="font-bold text-right text-destructive">
                    {m?.failed ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <Switch
                    onCheckedChange={(checked) => {
                      if (checked) resumeMutation.mutate(stage);
                      else pauseMutation.mutate(stage);
                    }}
                    defaultChecked
                  />
                  <span className="text-xs text-muted-foreground">Active</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Totals */}
      <Card>
        <CardContent className="flex items-center gap-6 py-4">
          <span className="text-sm font-medium">Totals:</span>
          <Badge variant="outline">{totals.waiting} waiting</Badge>
          <Badge variant="outline" className="text-blue-600">{totals.active} active</Badge>
          <Badge variant="outline" className="text-green-600">{totals.completed} completed</Badge>
          <Badge variant="outline" className="text-destructive">{totals.failed} failed</Badge>
        </CardContent>
      </Card>

      {/* Failed jobs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Failed Jobs</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={failedStageFilter} onValueChange={(v) => setFailedStageFilter(v ?? 'all')}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {PIPELINE_STAGES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {failedStageFilter !== 'all' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => retryMutation.mutate(failedStageFilter)}
                disabled={retryMutation.isPending}
              >
                <RefreshCw className="mr-1 h-3 w-3" /> Retry All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {retryMutation.isSuccess && (
            <p className="mb-2 text-sm text-green-600">
              Retried successfully.
            </p>
          )}
          <DataTable
            columns={failedColumns}
            data={failedJobs?.items ?? []}
            emptyTitle="No failed jobs"
            emptyDescription="All pipeline stages are healthy."
          />
        </CardContent>
      </Card>
    </div>
  );
}
