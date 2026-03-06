import { useState, useCallback } from 'react';

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string>(
    () => localStorage.getItem('taskmaster_api_key') ?? '',
  );

  const setApiKey = useCallback((key: string) => {
    localStorage.setItem('taskmaster_api_key', key);
    setApiKeyState(key);
  }, []);

  return { apiKey, setApiKey };
}

export function useUserId() {
  const [userId, setUserIdState] = useState<string>(
    () => localStorage.getItem('taskmaster_user_id') ?? '',
  );

  const setUserId = useCallback((id: string) => {
    localStorage.setItem('taskmaster_user_id', id);
    setUserIdState(id);
  }, []);

  return { userId, setUserId };
}
