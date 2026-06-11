import { CheckCircle2, Loader2, Route as RouteIcon } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import type { Checkpoint } from '../types';

const CITIES = ['Актау', 'Астана', 'Алматы', 'Атырау', 'Актобе', 'Шымкент'];
const DESTINATIONS = ['Ашхабад (ТМ)', 'Баку (АЗ)', 'Тбилиси (ГЕ)', 'Стамбул (ТР)', 'Ташкент (УЗ)'];

interface CheckpointOption extends Checkpoint {
  recommendation: string;
}

export function RouteAdvisor() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState<CheckpointOption[] | null>(null);
  const [loading, setLoading] = useState(false);

  async function advise() {
    if (!from || !to) return;
    setLoading(true);
    try {
      const checkpoints = await api.checkpoints();
      const relevant = checkpoints.filter((checkpoint) => {
        if (to.includes('ТМ')) return checkpoint.name.includes('Карабогаз') || checkpoint.name.includes('Темир');
        if (to.includes('УЗ')) return checkpoint.name.includes('Тажен');
        return checkpoint.type !== 'rail';
      });
      const options = relevant.length > 0 ? relevant : checkpoints.filter((checkpoint) => checkpoint.type === 'land');
      const advised = options
        .sort((a, b) => a.wait_minutes - b.wait_minutes)
        .slice(0, 2)
        .map((checkpoint) => ({
          ...checkpoint,
          recommendation:
            checkpoint.wait_minutes < 60
              ? 'Въезжайте сейчас — очередь минимальная'
              : `Рекомендуем после ${new Date(Date.now() + checkpoint.wait_minutes * 60000).toLocaleTimeString('ru-RU', {
                  hour: '2-digit',
                  minute: '2-digit',
                })} — нагрузка снизится`,
        }));
      setResult(advised);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Рекомендатор маршрута</h2>
        <RouteIcon size={20} className="text-teal-700" aria-hidden />
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-gray-500">
          Откуда
          <select
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900"
          >
            <option value="">Выберите город...</option>
            {CITIES.map((city) => (
              <option key={city}>{city}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-gray-500">
          Куда
          <select
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900"
          >
            <option value="">Выберите направление...</option>
            {DESTINATIONS.map((destination) => (
              <option key={destination}>{destination}</option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={advise}
        disabled={!from || !to || loading}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-40"
      >
        {loading ? <Loader2 className="spin" size={18} aria-hidden /> : <RouteIcon size={18} aria-hidden />}
        {loading ? 'Анализируем...' : 'Найти оптимальный маршрут'}
      </button>

      {result && (
        <div className="mt-4 grid gap-2">
          {result.map((checkpoint, index) => (
            <article
              key={checkpoint.id}
              className={`rounded-lg border p-3 text-sm ${
                index === 0 ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-gray-900">
                  {index === 0 && <CheckCircle2 size={16} className="flex-shrink-0 text-green-600" aria-hidden />}
                  <span className="truncate">{checkpoint.name}</span>
                </span>
                <span className={`flex-shrink-0 text-xs font-bold ${checkpoint.wait_minutes < 60 ? 'text-green-600' : 'text-orange-500'}`}>
                  {checkpoint.wait_minutes} мин
                </span>
              </div>
              <p className="text-xs leading-relaxed text-gray-500">{checkpoint.recommendation}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
