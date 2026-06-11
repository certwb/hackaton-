import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { Checkpoint } from '../types';

export function useCheckpoints(intervalMs = 15000) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const data = await api.checkpoints();
      setCheckpoints(data);
      setLastUpdate(new Date());
      setError(undefined);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить КПП';
      setError(message);
      console.error(err);
      return [];
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, load]);

  return { checkpoints, lastUpdate, error, reload: load };
}
