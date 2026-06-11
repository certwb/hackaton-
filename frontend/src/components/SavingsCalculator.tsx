import { Calculator } from 'lucide-react';
import { useState } from 'react';

const HOURLY_COST_USD = 20;
const SEARCH_HOURS_SAVED = 5;
const WAIT_REDUCTION = 0.3;
const AVG_WAIT_HOURS = 3;
const USD_TO_KZT = 450;

export function SavingsCalculator() {
  const [trips, setTrips] = useState(50);

  const waitSaved = Math.round(trips * AVG_WAIT_HOURS * WAIT_REDUCTION);
  const searchSaved = Math.round(trips * SEARCH_HOURS_SAVED);
  const totalHours = waitSaved + searchSaved;
  const totalUSD = Math.round(totalHours * HOURLY_COST_USD);
  const totalKZT = (totalUSD * USD_TO_KZT).toLocaleString('ru-RU');

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Калькулятор экономии</h2>
          <p className="mt-1 text-xs text-gray-400">Оценка выгоды платформы для компании</p>
        </div>
        <Calculator size={20} className="text-blue-700" aria-hidden />
      </div>

      <div className="mb-6">
        <div className="mb-2 flex justify-between text-xs text-gray-500">
          <span>Рейсов в месяц</span>
          <span className="text-sm font-semibold text-gray-900">{trips}</span>
        </div>
        <input
          type="range"
          min={5}
          max={500}
          step={5}
          value={trips}
          onChange={(event) => setTrips(Number(event.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="mt-1 flex justify-between text-xs text-gray-300">
          <span>5</span>
          <span>500</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {[
          { label: 'Часов на КПП', value: `-${waitSaved}ч`, color: 'text-green-600' },
          { label: 'Часов поиска', value: `-${searchSaved}ч`, color: 'text-blue-600' },
          { label: 'Итого часов', value: `${totalHours}ч`, color: 'text-gray-900' },
        ].map((item) => (
          <div key={item.label} className="rounded-lg bg-gray-50 px-2 py-3 text-center">
            <p className={`text-xl font-semibold leading-tight ${item.color}`}>{item.value}</p>
            <p className="mt-1 text-[11px] leading-tight text-gray-400">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-blue-50 p-3 text-center">
        <p className="mb-0.5 text-xs font-medium text-blue-500">Экономия в месяц</p>
        <p className="text-2xl font-semibold text-blue-700">~{totalKZT} ₸</p>
        <p className="text-xs text-blue-400">(${totalUSD} · при {trips} рейсах)</p>
      </div>

      <p className="mt-3 text-center text-xs text-gray-300">* средняя стоимость простоя $20/ч</p>
    </section>
  );
}
