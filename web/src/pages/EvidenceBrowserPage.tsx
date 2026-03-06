import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/shared/DataTable';
import { ProcessingStateBadge } from '@/components/shared/StatusBadge';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { Badge } from '@/components/ui/badge';
import { evidenceApi } from '@/api/endpoints/evidence';
import { usePagination } from '@/hooks/usePagination';
import { SOURCE_TYPE_COLORS, SOURCE_TYPE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { EvidenceEvent } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';

export function EvidenceBrowserPage() {
  const navigate = useNavigate();
  const { offset, limit, nextPage, prevPage } = usePagination(20);

  const { data, isLoading } = useQuery({
    queryKey: ['evidence', offset, limit],
    queryFn: () => evidenceApi.list(limit, offset),
  });

  const columns: Column<EvidenceEvent>[] = [
    {
      header: 'Source',
      cell: (e) => (
        <Badge variant="outline" className={cn('text-xs', SOURCE_TYPE_COLORS[e.source_type])}>
          {SOURCE_TYPE_LABELS[e.source_type]}
        </Badge>
      ),
    },
    {
      header: 'State',
      cell: (e) => <ProcessingStateBadge state={e.processing_state} />,
    },
    {
      header: 'Participants',
      cell: (e) => <span className="text-sm">{e.participants.length}</span>,
    },
    {
      header: 'Matter Hints',
      cell: (e) =>
        e.matter_hints.length > 0 ? (
          <span className="text-xs">{e.matter_hints.join(', ')}</span>
        ) : (
          '-'
        ),
    },
    {
      header: 'Received',
      cell: (e) => <DateDisplay date={e.received_at} />,
    },
    {
      header: 'Key',
      cell: (e) => (
        <span className="font-mono text-xs text-muted-foreground">
          {e.idempotency_key.slice(0, 12)}...
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Evidence Browser</h2>
        {data && (
          <span className="text-sm text-muted-foreground">{data.total} evidence events</span>
        )}
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        offset={offset}
        limit={limit}
        isLoading={isLoading}
        onRowClick={(e) => navigate(`/evidence/${e.id}`)}
        onNextPage={nextPage}
        onPrevPage={prevPage}
        emptyTitle="No evidence"
        emptyDescription="No evidence events ingested yet."
      />
    </div>
  );
}
