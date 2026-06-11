import { Activity, Clock3, Coins, PackageCheck } from 'lucide-react';
import type { KpiItem } from '../types';

const icons = [PackageCheck, Activity, Clock3, Coins];

export function KpiBar({ items }: { items: KpiItem[] }) {
  return (
    <section className="kpi-grid" aria-label="Сводные KPI">
      {items.map((item, index) => {
        const Icon = icons[index] || Activity;
        return (
          <article className="kpi-card" key={item.label}>
            <div className="kpi-icon">
              <Icon size={18} aria-hidden />
            </div>
            <div>
              <p>{item.label}</p>
              <strong>
                {item.value} <span>{item.unit}</span>
              </strong>
              <small>{item.delta}</small>
            </div>
          </article>
        );
      })}
    </section>
  );
}

