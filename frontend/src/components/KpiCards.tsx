import { useEffect, useState } from 'react';
import { api } from '../api';
import type { KpiStats } from '../types';

function Card({
  label,
  value,
  sub,
  positive,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="mb-1 text-xs font-bold text-gray-500">{label}</p>
      <p className="text-2xl font-semibold leading-tight text-gray-900">{value}</p>
      {sub && <p className={`mt-1 text-xs font-bold ${positive ? 'text-green-600' : 'text-red-500'}`}>{sub}</p>}
    </article>
  );
}

export function KpiCards() {
  const [kpi, setKpi] = useState<KpiStats | null>(null);

  useEffect(() => {
    let active = true;
    api
      .kpi()
      .then((data) => {
        if (active) setKpi(data);
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, []);

  if (!kpi) {
    return (
      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Загрузка KPI">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-lg bg-white/80" />
        ))}
      </section>
    );
  }

  const fmt = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value));

  return (
    <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ключевые показатели">
      <Card
        label="Тонн за неделю"
        value={fmt(kpi.cargo_this_week_tons)}
        sub={`${kpi.week_growth_pct > 0 ? '+' : ''}${kpi.week_growth_pct}% к прошлой`}
        positive={kpi.week_growth_pct >= 0}
      />
      <Card label="Рейсов в пути" value={String(kpi.active_shipments)} />
      <Card label="Среднее ожидание" value={`${kpi.avg_wait_minutes} мин`} />
      <Card
        label="КПП активных"
        value={String(kpi.active_checkpoints)}
        sub={kpi.overloaded_checkpoints > 0 ? `${kpi.overloaded_checkpoints} перегружено` : 'все работают'}
        positive={kpi.overloaded_checkpoints === 0}
      />
    </section>
  );
}
