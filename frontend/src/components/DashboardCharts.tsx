import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartPoint } from '../types';

const colors = ['#0f8b8d', '#ffb703', '#5b5f97', '#ef476f', '#118ab2', '#6a994e'];

function shortDate(value?: string) {
  if (!value) return '';
  const [, month, day] = value.split('-');
  return `${day}.${month}`;
}

export function DashboardCharts({ weeklyVolume, cargoMix }: { weeklyVolume: ChartPoint[]; cargoMix: ChartPoint[] }) {
  return (
    <section className="charts-grid">
      <article className="panel">
        <div className="panel-head">
          <h2>Грузопоток порта</h2>
          <span>14 дней</span>
        </div>
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={weeklyVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d8dee9" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={56} />
              <Tooltip formatter={(value: number) => [`${Math.round(value).toLocaleString('ru-RU')} т`, 'Объем']} />
              <Bar dataKey="tons" radius={[4, 4, 0, 0]} fill="#0f8b8d" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
      <article className="panel">
        <div className="panel-head">
          <h2>Структура грузов</h2>
          <span>по тоннажу</span>
        </div>
        <div className="chart-box chart-box--pie">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={cargoMix} dataKey="tons" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                {cargoMix.map((entry, index) => (
                  <Cell key={entry.name} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [`${Math.round(value).toLocaleString('ru-RU')} т`, 'Объем']} />
              <Legend iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </article>
    </section>
  );
}

