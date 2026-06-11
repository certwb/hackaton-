export type CheckpointStatus = 'open' | 'busy' | 'critical';
export type CheckpointType = 'land' | 'sea' | 'rail';

export interface Checkpoint {
  id: number;
  name: string;
  type: CheckpointType;
  lat: number;
  lon: number;
  capacity_per_hour: number;
  note: string;
  current_queue: number;
  wait_minutes: number;
  utilization: number;
  status: CheckpointStatus;
  updated_at: string;
}

export interface HistoryPoint {
  logged_at: string;
  hour: string;
  queue_size: number;
  wait_minutes: number;
  trucks_passed: number;
}

export interface CheckpointDetails extends Checkpoint {
  history_24h: HistoryPoint[];
}

export interface ForecastPoint {
  hour: string;
  clock?: string;
  predicted_trucks: number;
  wait_minutes: number;
  status?: CheckpointStatus;
}

export interface Forecast {
  provider: string;
  generated_at: string;
  forecast_6h: ForecastPoint[];
  best_crossing_time: string;
  recommendation: string;
}

export interface AiForecastPoint {
  period: string;
  trucks: number;
  wait_min: number;
}

export interface AiForecastResponse {
  forecast: AiForecastPoint[];
  best_time: string;
  recommendation: string;
  confidence: number;
  provider?: string;
  generated_at?: string;
}

export interface KpiItem {
  label: string;
  value: string | number;
  unit: string;
  delta: string;
}

export interface ChartPoint {
  date?: string;
  name?: string;
  tons: number;
}

export interface AlertItem {
  severity: 'high' | 'medium';
  title: string;
  message: string;
}

export interface KpiStats {
  cargo_this_week_tons: number;
  active_shipments: number;
  avg_wait_minutes: number;
  week_growth_pct: number;
  active_checkpoints: number;
  overloaded_checkpoints: number;
}

export interface DashboardData {
  generated_at: string;
  kpi: KpiItem[];
  weekly_volume: ChartPoint[];
  cargo_mix: ChartPoint[];
  checkpoints: Checkpoint[];
  alerts: AlertItem[];
}

export interface RouteLine {
  id: string;
  name: string;
  mode: 'truck' | 'rail';
  distance_km: number;
  path: [number, number][];
}

export interface RouteDeleteResponse {
  deleted: string;
  routes: RouteLine[];
}

export interface FreightResponse {
  id: number;
  status: string;
  created_at: string;
  request: Record<string, unknown>;
  recommended_route: {
    checkpoint_id: number;
    checkpoint_name: string;
    route_name: string;
    distance_km: number;
    current_queue: number;
    wait_minutes: number;
    reason: string;
  };
  top_carriers: Array<{
    id: number;
    company_name: string;
    trucks_count: number;
    specialization: string;
    rating: number;
    phone: string;
  }>;
  sms_preview: string;
}

export interface FreightRequestSummary {
  id: number;
  status: string;
  cargo_type: string;
  weight_tons: number;
  pickup: string;
  pickup_location: string;
  delivery: string;
  delivery_loc: string;
  desired_date: string;
  budget_kzt: number;
  via_checkpoint: string;
  created_at: string;
}

export interface ChatbotResponse {
  reply: string;
  provider?: 'anthropic' | 'gemini' | 'heuristic';
}
