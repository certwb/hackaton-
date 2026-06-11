import type {
  AiForecastResponse,
  Checkpoint,
  CheckpointDetails,
  ChatbotResponse,
  DashboardData,
  Forecast,
  FreightRequestSummary,
  FreightResponse,
  KpiStats,
  RouteDeleteResponse,
  RouteLine,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  checkpoints: () => request<Checkpoint[]>('/api/checkpoints'),
  kpi: () => request<KpiStats>('/api/analytics/kpi'),
  chatbot: (message: string) =>
    request<ChatbotResponse>('/api/chatbot', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  dashboard: () => request<DashboardData>('/api/analytics/dashboard'),
  checkpointDetails: (id: number) => request<CheckpointDetails>(`/api/checkpoints/${id}/status`),
  checkpointForecast: (id: number) => request<Forecast>(`/api/checkpoints/${id}/forecast`),
  aiForecast: (id: number) =>
    request<AiForecastResponse>(`/api/ai/forecast/${id}`, {
      method: 'POST',
    }),
  freightRequests: (limit = 10) => request<FreightRequestSummary[]>(`/api/freight-requests?limit=${limit}`),
  routes: () => request<RouteLine[]>('/api/routes'),
  deleteRoute: (id: string) =>
    request<RouteDeleteResponse>(`/api/routes/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  createFreightRequest: (payload: {
    cargo_type: string;
    weight_tons: number;
    pickup_location: string;
    delivery_loc: string;
    desired_date: string;
    budget_kzt: number;
    via_checkpoint?: string;
  }) =>
    request<FreightResponse>('/api/freight-requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
