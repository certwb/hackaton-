import { Loader2, RefreshCw } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Checkpoint, CheckpointDetails } from '../types';
import { AiForecast } from './AiForecast';

const statusText = {
  open: 'Норма',
  busy: 'Высокая нагрузка',
  critical: 'Критично',
};

export function CheckpointPanel({
  checkpoint,
  details,
  loading,
  onRefresh,
}: {
  checkpoint?: Checkpoint;
  details?: CheckpointDetails;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (!checkpoint) {
    return (
      <aside className="panel side-panel">
        <div className="empty-state">
          <strong>Выберите объект на карте</strong>
          <span>Покажем историю за 24 часа, AI-прогноз и рекомендацию водителю.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="panel side-panel">
      <div className="panel-head">
        <div>
          <h2>{checkpoint.name}</h2>
          <span>{checkpoint.note}</span>
        </div>
        <button className="icon-button" type="button" onClick={onRefresh} title="Обновить КПП" aria-label="Обновить КПП">
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
        </button>
      </div>
      <div className="checkpoint-summary">
        <div>
          <span>Статус</span>
          <strong className={`status-text status-text--${checkpoint.status}`}>{statusText[checkpoint.status]}</strong>
        </div>
        <div>
          <span>Очередь</span>
          <strong>{checkpoint.current_queue}</strong>
        </div>
        <div>
          <span>Ожидание</span>
          <strong>{checkpoint.wait_minutes} мин</strong>
        </div>
      </div>
      <div className="mini-chart">
        <ResponsiveContainer>
          <LineChart data={details?.history_24h || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e1e6ef" />
            <XAxis dataKey="hour" minTickGap={22} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={36} />
            <Tooltip formatter={(value: number) => [`${value}`, 'Очередь']} />
            <Line type="monotone" dataKey="queue_size" stroke="#ef476f" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <AiForecast checkpointId={checkpoint.id} />
    </aside>
  );
}

