import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DataTable } from '@/components/shared/DataTable';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { JsonViewer } from '@/components/shared/JsonViewer';
import { observabilityApi } from '@/api/endpoints/observability';
import { AUDIT_ACTION_LABELS } from '@/lib/constants';
import type { AuditAction, AuditEntry } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';
import { ChevronDown, Search } from 'lucide-react';

const ENTITY_TYPES = [
  'evidence_event',
  'canonical_task',
  'candidate_task',
  'review_item',
  'merge_decision',
];

const AUDIT_ACTIONS: AuditAction[] = [
  'created', 'updated', 'merged', 'status_changed', 'reviewed', 'synced', 'failed', 'replayed',
];

export function AuditLogPage() {
  const navigate = useNavigate();
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [action, setAction] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', entityType, entityId, action],
    queryFn: () =>
      observabilityApi.audit({
        entity_type: entityType || undefined,
        entity_id: entityId || undefined,
        action: (action || undefined) as AuditAction | undefined,
        limit: 100,
      }),
  });

  const columns: Column<AuditEntry>[] = [
    { header: 'Entity Type', accessorKey: 'entity_type' },
    {
      header: 'Entity ID',
      cell: (e) => {
        const path =
          e.entity_type === 'canonical_task'
            ? `/tasks/${e.entity_id}`
            : e.entity_type === 'evidence_event'
              ? `/evidence/${e.entity_id}`
              : e.entity_type === 'review_item'
                ? `/reviews/${e.entity_id}`
                : null;
        return path ? (
          <span
            className="cursor-pointer font-mono text-xs text-primary underline"
            onClick={(ev) => { ev.stopPropagation(); navigate(path); }}
          >
            {e.entity_id.slice(0, 8)}...
          </span>
        ) : (
          <span className="font-mono text-xs">{e.entity_id.slice(0, 8)}...</span>
        );
      },
    },
    {
      header: 'Action',
      cell: (e) => AUDIT_ACTION_LABELS[e.action] ?? e.action,
    },
    {
      header: 'Actor',
      cell: (e) => (
        <span className="text-xs">{e.actor_id ?? e.actor_type}</span>
      ),
    },
    { header: 'Summary', cell: (e) => <span className="text-xs">{e.summary}</span> },
    {
      header: 'Metadata',
      cell: (e) =>
        Object.keys(e.metadata).length > 0 ? (
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
              <ChevronDown className="h-3 w-3 mr-1" /> JSON
            </CollapsibleTrigger>
            <CollapsibleContent>
              <JsonViewer data={e.metadata} maxHeight="200px" />
            </CollapsibleContent>
          </Collapsible>
        ) : (
          '-'
        ),
    },
    { header: 'Time', cell: (e) => <DateDisplay date={e.created_at} /> },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Audit Log</h2>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Entity Type</Label>
          <Select value={entityType} onValueChange={(v) => setEntityType(v ?? '')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {ENTITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Entity ID</Label>
          <Input
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder="Filter by ID"
            className="w-48"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={action} onValueChange={(v) => setAction(v ?? '')}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {AUDIT_ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <Search className="mr-1 h-3 w-3" /> Search
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.entries ?? []}
        isLoading={isLoading}
        emptyTitle="No audit entries"
        emptyDescription="No matching audit entries found."
      />
    </div>
  );
}
