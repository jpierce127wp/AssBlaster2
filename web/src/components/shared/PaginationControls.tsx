import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  total: number;
  offset: number;
  limit: number;
  onNext: () => void;
  onPrev: () => void;
}

export function PaginationControls({
  total,
  offset,
  limit,
  onNext,
  onPrev,
}: PaginationControlsProps) {
  const start = offset + 1;
  const end = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="flex items-center justify-between px-2 py-4">
      <span className="text-sm text-muted-foreground">
        {total > 0 ? `${start}-${end} of ${total}` : 'No results'}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!hasPrev}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!hasNext}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
