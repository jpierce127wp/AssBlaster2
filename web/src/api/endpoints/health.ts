import type { HealthStatus, ReadyStatus } from '../types';

// Health endpoints are outside /api/v1, so use fetch directly
export const healthApi = {
  health: async () => {
    const res = await fetch('/health');
    if (!res.ok) throw new Error('Health check failed');
    return res.json() as Promise<HealthStatus>;
  },

  ready: async () => {
    const res = await fetch('/ready');
    if (!res.ok) throw new Error('Ready check failed');
    return res.json() as Promise<ReadyStatus>;
  },
};
