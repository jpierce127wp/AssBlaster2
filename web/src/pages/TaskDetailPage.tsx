import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable } from '@/components/shared/DataTable';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { tasksApi } from '@/api/endpoints/tasks';
import { observabilityApi } from '@/api/endpoints/observability';
import { ACTION_TYPE_LABELS } from '@/lib/constants';
import type { CanonicalTaskStatus, TaskPriority, TaskEvidenceLink, AuditEntry, UpdateTaskInput } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';

const STATUS_OPTIONS: CanonicalTaskStatus[] = [
  'proposed', 'active', 'blocked', 'review_pending', 'complete', 'superseded', 'discarded',
];
const PRIORITY_OPTIONS: TaskPriority[] = ['critical', 'high', 'normal', 'low'];

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: task, isLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.get(id!),
    enabled: !!id,
  });

  const { data: evidenceData } = useQuery({
    queryKey: ['tasks', id, 'evidence'],
    queryFn: () => tasksApi.getEvidence(id!),
    enabled: !!id,
  });

  const { data: auditData } = useQuery({
    queryKey: ['audit', 'canonical_task', id],
    queryFn: () =>
      observabilityApi.audit({
        entity_type: 'canonical_task',
        entity_id: id!,
        limit: 100,
      }),
    enabled: !!id,
  });

  const [form, setForm] = useState<UpdateTaskInput>({});

  useEffect(() => {
    if (task) {
      setForm({
        canonical_summary: task.canonical_summary,
        status: task.status,
        priority: task.priority,
        due_date_kind: task.due_date_kind,
        due_date_window_start: task.due_date_window_start,
        due_date_window_end: task.due_date_window_end,
        assignee_user_id: task.assignee_user_id,
        assignee_role: task.assignee_role,
      });
    }
  }, [task]);

  const updateMutation = useMutation({
    mutationFn: (data: UpdateTaskInput) => tasksApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  if (isLoading || !task) return <LoadingSpinner />;

  const evidenceColumns: Column<TaskEvidenceLink>[] = [
    {
      header: 'Evidence ID',
      cell: (l) => (
        <span
          className="cursor-pointer font-mono text-xs text-primary underline"
          onClick={() => navigate(`/evidence/${l.evidence_event_id}`)}
        >
          {l.evidence_event_id.slice(0, 8)}...
        </span>
      ),
    },
    { header: 'Relation', accessorKey: 'relation_type' },
    { header: 'Impact', accessorKey: 'change_impact' },
    {
      header: 'Fields',
      cell: (l) => l.impacted_fields.join(', ') || '-',
    },
    { header: 'Rationale', cell: (l) => l.rationale ?? '-' },
    { header: 'Created', cell: (l) => <DateDisplay date={l.created_at} /> },
  ];

  const auditColumns: Column<AuditEntry>[] = [
    { header: 'Action', accessorKey: 'action' },
    { header: 'Actor', cell: (e) => e.actor_id ?? e.actor_type },
    { header: 'Summary', accessorKey: 'summary' },
    {
      header: 'Metadata',
      cell: (e) =>
        Object.keys(e.metadata).length > 0 ? (
          <JsonViewer data={e.metadata} maxHeight="100px" />
        ) : (
          '-'
        ),
    },
    { header: 'Time', cell: (e) => <DateDisplay date={e.created_at} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <h2 className="text-xl font-bold">Task Detail</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Editable fields */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Summary</Label>
              <Input
                value={form.canonical_summary ?? ''}
                onChange={(e) => setForm({ ...form, canonical_summary: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => v && setForm({ ...form, status: v as CanonicalTaskStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => v && setForm({ ...form, priority: v as TaskPriority })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Due Start</Label>
                <Input
                  type="date"
                  value={form.due_date_window_start ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, due_date_window_start: e.target.value || null })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Due End</Label>
                <Input
                  type="date"
                  value={form.due_date_window_end ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, due_date_window_end: e.target.value || null })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Assignee User ID</Label>
                <Input
                  value={form.assignee_user_id ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, assignee_user_id: e.target.value || null })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Assignee Role</Label>
                <Input
                  value={form.assignee_role ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, assignee_role: e.target.value || null })
                  }
                />
              </div>
            </div>
            <Button
              onClick={() => updateMutation.mutate(form)}
              disabled={updateMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" /> Save Changes
            </Button>
            {updateMutation.isError && (
              <p className="text-sm text-destructive">
                {(updateMutation.error as Error).message}
              </p>
            )}
            {updateMutation.isSuccess && (
              <p className="text-sm text-green-600">Saved successfully</p>
            )}
          </CardContent>
        </Card>

        {/* Read-only fields */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Task Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ReadOnlyField label="ID" value={task.id} mono />
            <ReadOnlyField label="Action Type" value={ACTION_TYPE_LABELS[task.action_type]} />
            <ReadOnlyField label="Target Object" value={task.target_object} />
            <ReadOnlyField label="Desired Outcome" value={task.desired_outcome} />
            <ReadOnlyField label="Matter ID" value={task.matter_id} mono />
            <ReadOnlyField label="Evidence Count" value={String(task.open_evidence_count)} />
            <div className="flex gap-4">
              <ReadOnlyField label="Human Edited At" value={task.human_edited_at} />
              <ReadOnlyField label="Human Edited By" value={task.human_edited_by} />
            </div>
            <div className="flex gap-4">
              <ReadOnlyField label="Created" value={task.created_at} />
              <ReadOnlyField label="Updated" value={task.updated_at} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Evidence & Audit */}
      <Tabs defaultValue="evidence">
        <TabsList>
          <TabsTrigger value="evidence">
            Evidence Links ({evidenceData?.entries.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="audit">
            Audit Trail ({auditData?.entries.length ?? 0})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="evidence">
          <DataTable
            columns={evidenceColumns}
            data={evidenceData?.entries ?? []}
            emptyTitle="No evidence"
            emptyDescription="No evidence links for this task."
          />
        </TabsContent>
        <TabsContent value="audit">
          <DataTable
            columns={auditColumns}
            data={auditData?.entries ?? []}
            emptyTitle="No audit entries"
            emptyDescription="No audit trail for this task."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={mono ? 'font-mono text-xs' : ''}>
        {value ? (
          value.includes('T') && value.includes('Z') ? (
            <DateDisplay date={value} relative={false} />
          ) : (
            value
          )
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </p>
    </div>
  );
}
