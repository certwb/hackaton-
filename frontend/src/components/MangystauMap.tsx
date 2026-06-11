import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import type { Checkpoint, RouteLine } from '../types';

const statusLabels = {
  open: 'Норма',
  busy: 'Высокая нагрузка',
  critical: 'Критично',
};

const verifiedPositions: Array<{ match: string; position: [number, number] }> = [
  { match: 'Порт Актау', position: [43.60049, 51.22873] },
  { match: 'Темир-Баба', position: [41.924313, 52.661606] },
  { match: 'Гарабогаз', position: [41.924313, 52.661606] },
  { match: 'Карабогаз', position: [41.924313, 52.661606] },
  { match: 'Тажен', position: [44.892222, 55.981944] },
  { match: 'Мангистау', position: [43.696951, 51.308965] },
  { match: 'Мангышлак', position: [43.696951, 51.308965] },
  { match: 'Опорная', position: [46.20838, 54.47317] },
  { match: 'Боранкул', position: [46.20838, 54.47317] },
];

function markerIcon(status: Checkpoint['status'], type: Checkpoint['type']) {
  return L.divIcon({
    className: `checkpoint-marker checkpoint-marker--${status} checkpoint-marker--${type}`,
    html: '<span />',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -9],
  });
}

function checkpointPosition(checkpoint: Checkpoint): [number, number] {
  const verified = verifiedPositions.find((item) => checkpoint.name.includes(item.match));
  return verified?.position ?? [checkpoint.lat, checkpoint.lon];
}

export function MangystauMap({
  checkpoints,
  routes,
  selectedId,
  lastUpdate,
  onSelect,
}: {
  checkpoints: Checkpoint[];
  routes: RouteLine[];
  selectedId?: number;
  lastUpdate?: Date | null;
  onSelect: (checkpoint: Checkpoint) => void;
}) {
  return (
    <section className="map-shell" aria-label="Карта логистики Мангистау">
      <MapContainer center={[44.1, 53.6]} zoom={5} minZoom={5} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routes.map((route) => (
          <Polyline
            key={route.id}
            smoothFactor={0}
            pathOptions={{
              color: route.mode === 'rail' ? '#5b5f97' : '#0f8b8d',
              weight: route.mode === 'rail' ? 3 : 4,
              dashArray: route.mode === 'rail' ? '8 8' : undefined,
              opacity: 0.68,
            }}
            positions={route.path}
          />
        ))}
        {checkpoints.map((checkpoint) => (
          <Marker
            key={checkpoint.id}
            icon={markerIcon(checkpoint.status, checkpoint.type)}
            position={checkpointPosition(checkpoint)}
            eventHandlers={{ click: () => onSelect(checkpoint) }}
          >
            <Popup>
              <div className="map-popup">
                <strong>{checkpoint.name}</strong>
                <span>{statusLabels[checkpoint.status]}</span>
                <span>Очередь: {checkpoint.current_queue}</span>
                <span>Ожидание: {checkpoint.wait_minutes} мин</span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <div className="map-legend" aria-label="Легенда карты">
        <span>
          <i className="legend-dot legend-dot--open" /> Норма
        </span>
        <span>
          <i className="legend-dot legend-dot--busy" /> Высокая
        </span>
        <span>
          <i className="legend-dot legend-dot--critical" /> Критично
        </span>
      </div>
      <div className="live-pill">
        <span className="live-dot">
          <span />
        </span>
        LIVE · обновлено {lastUpdate ? lastUpdate.toLocaleTimeString('ru-RU') : '--:--'}
      </div>
      {selectedId && <div className="map-selection">Выбран объект #{selectedId}</div>}
    </section>
  );
}
