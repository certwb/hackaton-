import { Bot, Loader2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import type { AiForecastResponse } from '../types';

export function AiForecast({ checkpointId }: { checkpointId: number }) {
  const [data, setData] = useState<AiForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function loadForecast() {
    setLoading(true);
    setError(undefined);
    try {
      setData(await api.aiForecast(checkpointId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI forecast failed');
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="ai-forecast-action">
        <button className="ai-button" type="button" onClick={loadForecast} disabled={loading}>
          {loading ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          {loading ? 'Анализирую...' : 'AI-прогноз'}
        </button>
        {error && <span className="ai-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="forecast">
      <div className="forecast-head">
        <Bot size={18} />
        <strong>AI-прогноз</strong>
        <span>{data.provider || 'ai'}</span>
      </div>
      <div className="forecast-strip forecast-strip--compact">
        {data.forecast.map((point) => (
          <div key={point.period}>
            <span>{point.period}</span>
            <strong>{point.trucks}</strong>
            <small>{point.wait_min} мин</small>
          </div>
        ))}
      </div>
      <p>{data.recommendation}</p>
      <p className="ai-confidence">
        Лучшее время: {data.best_time} · Точность: {Math.round(data.confidence * 100)}%
      </p>
    </div>
  );
}

