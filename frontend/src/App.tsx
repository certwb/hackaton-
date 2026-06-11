import { Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { CheckpointPanel } from './components/CheckpointPanel';
import { DashboardCharts } from './components/DashboardCharts';
import { FreightForm } from './components/FreightForm';
import { KpiBar } from './components/KpiBar';
import { MangystauMap } from './components/MangystauMap';
import type { Checkpoint, CheckpointDetails, DashboardData, RouteLine } from './types';

function exportDashboard(data?: DashboardData) {
  if (!data) return;
  const rows = [
    ['metric', 'value', 'unit', 'delta'],
    ...data.kpi.map((item) => [item.label, item.value, item.unit, item.delta]),
    [],
    ['checkpoint', 'queue', 'wait_minutes', 'status'],
    ...data.checkpoints.map((item) => [item.name, item.current_queue, item.wait_minutes, item.status]),
  ];
  const csv = rows.map((row) => row.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mangystau-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function useDashboardData() {
  const [dashboard, setDashboard] = useState<DashboardData>();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [routes, setRoutes] = useState<RouteLine[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [dashboardResponse, checkpointsResponse, routesResponse] = await Promise.all([
        api.dashboard(),
        api.checkpoints(),
        api.routes(),
      ]);
      setDashboard(dashboardResponse);
      setCheckpoints(checkpointsResponse);
      setRoutes(routesResponse);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(async () => {
      try {
        const response = await api.checkpoints();
        setCheckpoints(response);
        setLastUpdate(new Date());
      } catch {
        return;
      }
    }, 20000);
    return () => window.clearInterval(timer);
  }, [load]);

  return { dashboard, checkpoints, routes, lastUpdate, loading, error, reload: load };
}

export default function App() {
  const { dashboard, checkpoints, routes, lastUpdate, loading, error, reload } = useDashboardData();
  const [selectedId, setSelectedId] = useState<number>();
  const [details, setDetails] = useState<CheckpointDetails>();
  const [panelLoading, setPanelLoading] = useState(false);

  const selectedCheckpoint = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.id === selectedId) || checkpoints[1] || checkpoints[0],
    [checkpoints, selectedId],
  );

  const loadCheckpoint = useCallback(async (checkpoint: Checkpoint) => {
    setSelectedId(checkpoint.id);
    setPanelLoading(true);
    try {
      const detailsResponse = await api.checkpointDetails(checkpoint.id);
      setDetails(detailsResponse);
    } finally {
      setPanelLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCheckpoint && !selectedId) {
      loadCheckpoint(selectedCheckpoint);
    }
  }, [loadCheckpoint, selectedCheckpoint, selectedId]);

  return (
    <main className="app min-h-screen">
      <header className="topbar">
        <div>
          <span className="eyebrow">Mangystau Logistics Monitor</span>
          <h1>Дашборд акимата и live-мониторинг КПП</h1>
        </div>
        <div className="topbar-actions">
          <button className="secondary-button" type="button" onClick={reload} disabled={loading}>
            <RefreshCw size={18} aria-hidden />
            Обновить
          </button>
          <button className="primary-button" type="button" onClick={() => exportDashboard(dashboard)}>
            <Download size={18} aria-hidden />
            CSV
          </button>
        </div>
      </header>

      {error && (
        <div className="api-error" role="alert">
          API недоступен: {error}
        </div>
      )}

      <KpiBar items={dashboard?.kpi || []} />

      <section className="main-grid">
        <div className="left-column">
          <MangystauMap
            checkpoints={checkpoints}
            routes={routes}
            selectedId={selectedId}
            lastUpdate={lastUpdate}
            onSelect={loadCheckpoint}
          />
          <DashboardCharts weeklyVolume={dashboard?.weekly_volume || []} cargoMix={dashboard?.cargo_mix || []} />
        </div>
        <div className="right-column">
          <CheckpointPanel
            checkpoint={selectedCheckpoint}
            details={details}
            loading={panelLoading}
            onRefresh={() => selectedCheckpoint && loadCheckpoint(selectedCheckpoint)}
          />
          <section className="panel alert-panel">
            <div className="panel-head">
              <h2>Оперативные алерты</h2>
              <ShieldAlert size={20} aria-hidden />
            </div>
            {(dashboard?.alerts || []).length === 0 ? (
              <p className="muted">Критичных очередей нет.</p>
            ) : (
              <ul className="alert-list">
                {dashboard?.alerts.map((alert) => (
                  <li key={alert.title}>
                    <strong>{alert.title}</strong>
                    <span>{alert.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>

      <FreightForm />
    </main>
  );
}
