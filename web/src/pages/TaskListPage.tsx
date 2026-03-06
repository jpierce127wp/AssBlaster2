import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/shared/DataTable';
import { TaskStatusBadge } from '@/components/shared/StatusBadge';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { tasksApi } from '@/api/endpoints/tasks';
import { syncApi } from '@/api/endpoints/sync';
import { usePagination } from '@/hooks/usePagination';
import { ACTION_TYPE_LABELS } from '@/lib/constants';
import type { CanonicalTask } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';
import { MoreHorizontal } from 'lucide-react';

export function TaskListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { offset, limit, nextPage, prevPage } = usePagination(20);
  const [openOnly, setOpenOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', openOnly, offset, limit],
    queryFn: () =>
      openOnly
        ? tasksApi.listOpen(limit, offset)
        : tasksApi.list(limit, offset),
  });

  const recomputeMutation = useMutation({
    mutationFn: (id: string) => tasksApi.recompute(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const syncMutation = useMutation({
    mutationFn: (id: string) => syncApi.syncTask(id),
  });

  const columns: Column<CanonicalTask>[] = [
    {
      header: 'Summary',
      cell: (t) => (
        <span className="text-sm line-clamp-1 max-w-xs">{t.canonical_summary}</span>
      ),
    },
    {
      header: 'Status',
      cell: (t) => <TaskStatusBadge status={t.status} />,
    },
    {
      header: 'Priority',
      cell: (t) => <PriorityBadge priority={t.priority} />,
    },
    {
      header: 'Action',
      cell: (t) => <span className="text-xs">{ACTION_TYPE_LABELS[t.action_type]}</span>,
    },
    {
      header: 'Assignee',
      cell: (t) => (
        <span className="text-sm">{t.assignee_user_id ?? t.assignee_role ?? '-'}</span>
      ),
    },
    {
      header: 'Matter',
      cell: (t) => (
        <span className="text-xs font-mono text-muted-foreground">
          {t.matter_id ? t.matter_id.slice(0, 8) + '...' : '-'}
        </span>
      ),
    },
    {
      header: 'Due',
      cell: (t) => <DateDisplay date={t.due_date_window_start} />,
    },
    {
      header: 'Evidence',
      cell: (t) => <span className="text-sm">{t.open_evidence_count}</span>,
    },
    {
      header: 'Updated',
      cell: (t) => <DateDisplay date={t.updated_at} />,
    },
    {
      header: '',
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()} />}
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/tasks/${t.id}`)}>
              View
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => recomputeMutation.mutate(t.id)}
            >
              Recompute
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => syncMutation.mutate(t.id)}
            >
              Sync to Clio
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: 'w-12',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tasks</h2>
        <div className="flex items-center gap-2">
          <Switch
            id="open-only"
            checked={openOnly}
            onCheckedChange={setOpenOnly}
          />
          <Label htmlFor="open-only" className="text-sm">Open only</Label>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        offset={offset}
        limit={limit}
        isLoading={isLoading}
        onRowClick={(t) => navigate(`/tasks/${t.id}`)}
        onNextPage={nextPage}
        onPrevPage={prevPage}
        emptyTitle="No tasks"
        emptyDescription="No canonical tasks found."
      />
    </div>
  );
}
