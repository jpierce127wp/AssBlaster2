import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from './EmptyState';
import { LoadingSpinner } from './LoadingSpinner';
import { PaginationControls } from './PaginationControls';

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total?: number;
  offset?: number;
  limit?: number;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
  onNextPage?: () => void;
  onPrevPage?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function DataTable<T>({
  columns,
  data,
  total,
  offset = 0,
  limit = 20,
  isLoading,
  onRowClick,
  onNextPage,
  onPrevPage,
  emptyTitle,
  emptyDescription,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingSpinner />;
  if (data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.header} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, i) => (
              <TableRow
                key={i}
                className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : undefined}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.header} className={col.className}>
                    {col.cell
                      ? col.cell(row)
                      : col.accessorKey
                        ? String((row as Record<string, unknown>)[col.accessorKey as string] ?? '')
                        : ''}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total !== undefined && onNextPage && onPrevPage && (
        <PaginationControls
          total={total}
          offset={offset}
          limit={limit}
          onNext={onNextPage}
          onPrev={onPrevPage}
        />
      )}
    </div>
  );
}
