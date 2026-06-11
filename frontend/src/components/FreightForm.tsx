import { Send, Sparkles } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import type { FreightRequestSummary, FreightResponse } from '../types';

const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function FreightForm() {
  const [cargoType, setCargoType] = useState('металлопрокат');
  const [weightTons, setWeightTons] = useState(40);
  const [pickupLocation, setPickupLocation] = useState('Актау, порт');
  const [deliveryLoc, setDeliveryLoc] = useState('Ашхабад (ТМ)');
  const [desiredDate, setDesiredDate] = useState(tomorrow);
  const [viaCheckpoint, setViaCheckpoint] = useState('');
  const [budgetKzt, setBudgetKzt] = useState(920000);
  const [result, setResult] = useState<FreightResponse | null>(null);
  const [requests, setRequests] = useState<FreightRequestSummary[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRequests() {
    setRequests(await api.freightRequests(10));
  }

  useEffect(() => {
    loadRequests().catch(() => setRequests([]));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.createFreightRequest({
        cargo_type: cargoType,
        weight_tons: weightTons,
        pickup_location: pickupLocation,
        delivery_loc: deliveryLoc,
        desired_date: desiredDate,
        budget_kzt: budgetKzt,
        via_checkpoint: viaCheckpoint || undefined,
      });
      setResult(response);
      await loadRequests();
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel freight-panel">
      <div className="panel-head">
        <div>
          <h2>Заявка на перевозку</h2>
          <span>биржа грузов для demo-сценария</span>
        </div>
        <Sparkles size={20} aria-hidden />
      </div>
      <form className="freight-form freight-form--wide" onSubmit={submit}>
        <label>
          Тип груза
          <select value={cargoType} onChange={(event) => setCargoType(event.target.value)}>
            <option>металлопрокат</option>
            <option>нефтепродукты</option>
            <option>контейнеры</option>
            <option>зерно</option>
            <option>химикаты</option>
            <option>стройматериалы</option>
          </select>
        </label>
        <label>
          Вес, т
          <input
            type="number"
            min="1"
            max="80"
            value={weightTons}
            onChange={(event) => setWeightTons(Number(event.target.value))}
          />
        </label>
        <label>
          Откуда
          <input value={pickupLocation} onChange={(event) => setPickupLocation(event.target.value)} />
        </label>
        <label>
          Куда
          <input value={deliveryLoc} onChange={(event) => setDeliveryLoc(event.target.value)} />
        </label>
        <label>
          Через
          <select value={viaCheckpoint} onChange={(event) => setViaCheckpoint(event.target.value)}>
            <option value="">Любой КПП</option>
            <option>Порт Актау</option>
            <option>КПП Темир-Баба / Гарабогаз</option>
            <option>КПП Тажен / Даут-Ата</option>
            <option>Ж/д ст. Мангистау / Мангышлак</option>
            <option>Ж/д ст. Опорная / Боранкул</option>
          </select>
        </label>
        <label>
          Дата
          <input type="date" value={desiredDate} onChange={(event) => setDesiredDate(event.target.value)} />
        </label>
        <label>
          Бюджет, KZT
          <input
            type="number"
            min="100000"
            step="50000"
            value={budgetKzt}
            onChange={(event) => setBudgetKzt(Number(event.target.value))}
          />
        </label>
        <button className="primary-button" type="submit" disabled={loading}>
          <Send size={18} aria-hidden />
          {loading ? 'Размещаем...' : 'Разместить заявку'}
        </button>
      </form>
      {result && (
        <div className="freight-result">
          <strong>{result.recommended_route.route_name}</strong>
          <p>{result.recommended_route.reason}</p>
          <div className="result-grid">
            <span>Очередь: {result.recommended_route.current_queue}</span>
            <span>Ожидание: {result.recommended_route.wait_minutes} мин</span>
            <span>Дистанция: {result.recommended_route.distance_km} км</span>
          </div>
          <ul>
            {result.top_carriers.map((carrier) => (
              <li key={carrier.id}>
                <b>{carrier.company_name}</b>
                <span>
                  {carrier.rating} / {carrier.trucks_count} машин
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {requests.length > 0 && (
        <div className="requests-list">
          <h3>Открытые заявки</h3>
          {requests.map((request) => (
            <div className="request-row" key={request.id}>
              <span>
                {request.cargo_type} · {request.weight_tons}т · {request.pickup} → {request.delivery_loc}
              </span>
              <small>{new Date(request.created_at).toLocaleDateString('ru-RU')}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
