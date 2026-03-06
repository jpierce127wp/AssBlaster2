import { useQuery } from '@tanstack/react-query';
import { Wifi, WifiOff } from 'lucide-react';
import { healthApi } from '@/api/endpoints/health';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Header() {
  const { data, isError } = useQuery({
    queryKey: ['health'],
    queryFn: () => healthApi.health(),
    refetchInterval: 30_000,
    retry: false,
  });

  const isConnected = !!data && !isError;

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <h1 className="text-sm font-medium text-muted-foreground">
        Legal Task Extraction Pipeline
      </h1>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-2 text-sm">
            {isConnected ? (
              <>
                <Wifi className="h-4 w-4 text-green-500" />
                <span className="text-green-600">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-destructive" />
                <span className="text-destructive">Disconnected</span>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {isConnected ? 'API connection active' : 'Cannot reach API — check settings'}
        </TooltipContent>
      </Tooltip>
    </header>
  );
}
