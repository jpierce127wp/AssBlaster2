import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { syncApi } from '@/api/endpoints/sync';
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';

export function ClioSyncPage() {
  const [taskId, setTaskId] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [oauthResult, setOauthResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected === 'true') {
      setOauthResult({ type: 'success', message: 'Successfully connected to Clio!' });
      queryClient.refetchQueries({ queryKey: ['clio', 'status'] });
      setSearchParams({}, { replace: true });
    } else if (error) {
      setOauthResult({ type: 'error', message: error });
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, queryClient]);

  const { data: clioStatus, isLoading } = useQuery({
    queryKey: ['clio', 'status'],
    queryFn: () => syncApi.clioStatus(),
    retry: false,
  });

  const syncMutation = useMutation({
    mutationFn: () => syncApi.syncTask(taskId),
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Clio Sync</h2>

      {oauthResult?.type === 'success' && (
        <Alert>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>{oauthResult.message}</AlertDescription>
        </Alert>
      )}

      {oauthResult?.type === 'error' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{oauthResult.message}</AlertDescription>
        </Alert>
      )}

      {/* Connection status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Checking...</p>
          ) : clioStatus?.connected ? (
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium text-green-600">Connected to Clio</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                <span className="font-medium text-destructive">Not connected</span>
              </div>
              <Button
                variant="outline"
                onClick={() => window.open('/api/v1/clio/authorize', '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Connect to Clio
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-md space-y-1">
              <Label>Canonical Task ID</Label>
              <Input
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                placeholder="Enter task ID to sync"
              />
            </div>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={!taskId || syncMutation.isPending}
            >
              Sync Now
            </Button>
          </div>

          {syncMutation.isSuccess && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Sync result:{' '}
                <Badge variant="outline" className="ml-1">
                  {syncMutation.data.action}
                </Badge>
                {syncMutation.data.clio_task_id && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    Clio ID: {syncMutation.data.clio_task_id}
                  </span>
                )}
                {syncMutation.data.details && (
                  <p className="mt-1 text-xs">{syncMutation.data.details}</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {syncMutation.isError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                {(syncMutation.error as Error).message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
