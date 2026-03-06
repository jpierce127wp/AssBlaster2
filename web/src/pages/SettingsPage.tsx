import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useApiKey, useUserId } from '@/hooks/useApiKey';
import { healthApi } from '@/api/endpoints/health';
import { CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';

export function SettingsPage() {
  const { apiKey, setApiKey } = useApiKey();
  const { userId, setUserId } = useUserId();
  const [showKey, setShowKey] = useState(false);
  const [keyInput, setKeyInput] = useState(apiKey);
  const [userInput, setUserInput] = useState(userId);

  const testMutation = useMutation({
    mutationFn: () => healthApi.health(),
  });

  const handleSave = () => {
    setApiKey(keyInput);
    setUserId(userInput);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Settings</h2>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="text-base">API Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder="Enter your API key"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Reviewer Name / User ID</Label>
            <Input
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Used for decided_by and X-User-Id header"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSave}>Save</Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending}
            >
              Test Connection
            </Button>
          </div>

          {testMutation.isSuccess && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="text-green-600">
                Connection successful! API is reachable.
              </AlertDescription>
            </Alert>
          )}

          {testMutation.isError && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                Connection failed. Check your API key and ensure the backend is running.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
