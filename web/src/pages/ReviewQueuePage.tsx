import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/DataTable';
import { DateDisplay } from '@/components/shared/DateDisplay';
import { ReviewStatusBadge } from '@/components/shared/StatusBadge';
import { reviewsApi } from '@/api/endpoints/reviews';
import { usePagination } from '@/hooks/usePagination';
import { REVIEW_REASON_COLORS, REVIEW_REASON_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ReviewItem } from '@/api/types';
import type { Column } from '@/components/shared/DataTable';

export function ReviewQueuePage() {
  const navigate = useNavigate();
  const { offset, limit, nextPage, prevPage } = usePagination(20);

  const { data, isLoading } = useQuery({
    queryKey: ['reviews', offset, limit],
    queryFn: () => reviewsApi.list(limit, offset),
  });

  const columns: Column<ReviewItem>[] = [
    {
      header: 'Reason',
      cell: (r) => (
        <Badge variant="outline" className={cn('text-xs', REVIEW_REASON_COLORS[r.reason])}>
          {REVIEW_REASON_LABELS[r.reason]}
        </Badge>
      ),
    },
    {
      header: 'Priority',
      cell: (r) => <span className="font-mono text-sm">{r.priority}</span>,
    },
    {
      header: 'Status',
      cell: (r) => <ReviewStatusBadge status={r.status} />,
    },
    {
      header: 'Candidate Task',
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.candidate_task_id.slice(0, 8)}...
        </span>
      ),
    },
    {
      header: 'Created',
      cell: (r) => <DateDisplay date={r.created_at} />,
    },
    {
      header: '',
      cell: (r) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/reviews/${r.id}`);
          }}
        >
          Review
        </Button>
      ),
      className: 'w-24',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Review Queue</h2>
        {data && (
          <span className="text-sm text-muted-foreground">{data.total} total reviews</span>
        )}
      </div>
      <DataTable
        columns={columns}
        data={data?.items ?? []}
        total={data?.total}
        offset={offset}
        limit={limit}
        isLoading={isLoading}
        onRowClick={(r) => navigate(`/reviews/${r.id}`)}
        onNextPage={nextPage}
        onPrevPage={prevPage}
        emptyTitle="No reviews"
        emptyDescription="The review queue is empty."
      />
    </div>
  );
}
