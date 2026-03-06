import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/shared/DataTable';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { PriorityBadge } from '@/components/shared/PriorityBadge';
import { routingApi } from '@/api/endpoints/routing';
import { ACTION_TYPE_LABELS } from '@/lib/constants';
import type { ActionType, RoutingRule, TaskPriority } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';
import { Plus, Trash2 } from 'lucide-react';

const ACTION_TYPES: ActionType[] = [
  'filing', 'discovery', 'deposition', 'correspondence',
  'research', 'meeting', 'review', 'drafting', 'other',
];
const PRIORITIES: TaskPriority[] = ['critical', 'high', 'normal', 'low'];

export function RoutingRulesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    practice_area: '',
    action_type: '' as string,
    assignee_user_id: '',
    assignee_role: '',
    priority: '' as string,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['routing-rules'],
    queryFn: () => routingApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      routingApi.create({
        practice_area: form.practice_area,
        action_type: (form.action_type || undefined) as ActionType | undefined,
        assignee_user_id: form.assignee_user_id || undefined,
        assignee_role: form.assignee_role || undefined,
        priority: (form.priority || undefined) as TaskPriority | undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['routing-rules'] });
      setForm({ practice_area: '', action_type: '', assignee_user_id: '', assignee_role: '', priority: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => routingApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['routing-rules'] }),
  });

  const columns: Column<RoutingRule>[] = [
    { header: 'Practice Area', accessorKey: 'practice_area' },
    {
      header: 'Action Type',
      cell: (r) => r.action_type ? ACTION_TYPE_LABELS[r.action_type] : 'Any',
    },
    { header: 'Assignee User', cell: (r) => r.assignee_user_id ?? '-' },
    { header: 'Assignee Role', cell: (r) => r.assignee_role ?? '-' },
    {
      header: 'Priority',
      cell: (r) => r.priority ? <PriorityBadge priority={r.priority} /> : '-',
    },
    { header: 'Created', cell: (r) => <DateDisplay date={r.created_at} /> },
    {
      header: '',
      cell: (r) => (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          }
          title="Delete routing rule?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => deleteMutation.mutate(r.id)}
        />
      ),
      className: 'w-12',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Routing Rules</h2>
        <Dialog>
          <DialogTrigger render={<Button size="sm" />}>
            <Plus className="mr-1 h-3 w-3" /> Add Rule
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Routing Rule</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Practice Area *</Label>
                <Input
                  value={form.practice_area}
                  onChange={(e) => setForm({ ...form, practice_area: e.target.value })}
                  placeholder="e.g. litigation"
                />
              </div>
              <div className="space-y-1">
                <Label>Action Type</Label>
                <Select value={form.action_type} onValueChange={(v) => setForm({ ...form, action_type: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    {ACTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{ACTION_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Assignee User ID</Label>
                <Input
                  value={form.assignee_user_id}
                  onChange={(e) => setForm({ ...form, assignee_user_id: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Assignee Role</Label>
                <Input
                  value={form.assignee_role}
                  onChange={(e) => setForm({ ...form, assignee_role: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v ?? '' })}>
                  <SelectTrigger><SelectValue placeholder="Default" /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Cancel
              </DialogClose>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!form.practice_area || createMutation.isPending}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyTitle="No routing rules"
        emptyDescription="No routing rules configured."
      />
    </div>
  );
}
