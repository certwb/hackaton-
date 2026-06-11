import { Download, RefreshCw, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { CheckpointPanel } from './components/CheckpointPanel';
import { DashboardCharts } from './components/DashboardCharts';
import { DriverChatbot } from './components/DriverChatbot';
import { FreightForm } from './components/FreightForm';
import { KpiCards } from './components/KpiCards';
import { LiveBadge } from './components/LiveBadge';
import { MangystauMap } from './components/MangystauMap';
import { OverloadAlert } from './components/OverloadAlert';
import { RouteAdvisor } from './components/RouteAdvisor';
import { RouteManager } from './components/RouteManager';
import { SavingsCalculator } from './components/SavingsCalculator';
import { useCheckpoints } from './hooks/useCheckpoints';
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
  const [routes, setRoutes] = useState<RouteLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [dashboardResponse, routesResponse] = await Promise.all([
        api.dashboard(),
        api.routes(),
      ]);
      setDashboard(dashboardResponse);
      setRoutes(routesResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const replaceRoutes = useCallback((nextRoutes: RouteLine[]) => {
    setRoutes(nextRoutes);
  }, []);

  return { dashboard, routes, loading, error, reload: load, replaceRoutes };
}

export default function App() {
  const { dashboard, routes, loading, error, reload: reloadDashboard, replaceRoutes } = useDashboardData();
  const { checkpoints, lastUpdate, error: checkpointsError, reload: reloadCheckpoints } = useCheckpoints(15000);
  const [selectedId, setSelectedId] = useState<number>();
  const [details, setDetails] = useState<CheckpointDetails>();
  const [panelLoading, setPanelLoading] = useState(false);
  const [deletingRouteId, setDeletingRouteId] = useState<string>();
  const [routeActionError, setRouteActionError] = useState<string>();
  const apiError = routeActionError || error || checkpointsError;

  const reload = useCallback(async () => {
    await Promise.all([reloadDashboard(), reloadCheckpoints()]);
  }, [reloadDashboard, reloadCheckpoints]);

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

  const deleteRoute = useCallback(
    async (route: RouteLine) => {
      if (!window.confirm(`Удалить маршрут "${route.name}"?`)) return;
      setDeletingRouteId(route.id);
      setRouteActionError(undefined);
      try {
        const response = await api.deleteRoute(route.id);
        replaceRoutes(response.routes);
      } catch (err) {
        setRouteActionError(err instanceof Error ? err.message : 'Не удалось удалить маршрут');
      } finally {
        setDeletingRouteId(undefined);
      }
    },
    [replaceRoutes],
  );

  useEffect(() => {
    if (selectedCheckpoint && !selectedId) {
      loadCheckpoint(selectedCheckpoint);
    }
  }, [loadCheckpoint, selectedCheckpoint, selectedId]);

  return (
    <div className="min-h-screen">
      <OverloadAlert checkpoints={checkpoints} />

      <main className="app min-h-screen">
        <header className="topbar">
          <div>
            <span className="eyebrow">Mangystau Logistics Monitor</span>
            <h1>Дашборд акимата и live-мониторинг КПП</h1>
          </div>
          <div className="topbar-actions">
            <LiveBadge lastUpdate={lastUpdate} />
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

        {apiError && (
          <div className="api-error" role="alert">
            API недоступен: {apiError}
          </div>
        )}

        <KpiCards />

        <section className="main-grid">
          <div className="left-column">
            <div id="map">
              <MangystauMap
                checkpoints={checkpoints}
                routes={routes}
                selectedId={selectedId}
                lastUpdate={lastUpdate}
                onSelect={loadCheckpoint}
              />
            </div>
            <DashboardCharts weeklyVolume={dashboard?.weekly_volume || []} cargoMix={dashboard?.cargo_mix || []} />
          </div>
          <div className="right-column">
            <RouteManager routes={routes} deletingId={deletingRouteId} onDelete={deleteRoute} />
            <RouteAdvisor />
            <SavingsCalculator />
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

      <DriverChatbot />
    </div>
  );
}
