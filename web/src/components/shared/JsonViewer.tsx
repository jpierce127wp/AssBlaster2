import { ScrollArea } from '@/components/ui/scroll-area';

interface JsonViewerProps {
  data: unknown;
  maxHeight?: string;
}

export function JsonViewer({ data, maxHeight = '300px' }: JsonViewerProps) {
  return (
    <ScrollArea style={{ maxHeight }} className="rounded-md border">
      <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">
        {JSON.stringify(data, null, 2)}
      </pre>
    </ScrollArea>
  );
}
