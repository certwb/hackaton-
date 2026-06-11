import L from 'leaflet';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import type { Checkpoint, RouteLine } from '../types';

const statusLabels = {
  open: 'Норма',
  busy: 'Высокая нагрузка',
  critical: 'Критично',
};

function markerIcon(status: Checkpoint['status'], type: Checkpoint['type']) {
  const shape = type === 'sea' ? '●' : type === 'rail' ? '■' : '◆';
  return L.divIcon({
    className: `checkpoint-marker checkpoint-marker--${status}`,
    html: `<span>${shape}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
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
      <MapContainer center={[42.72, 52.06]} zoom={7} minZoom={6} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routes.map((route) => (
          <Polyline
            key={route.id}
            pathOptions={{
              color: route.mode === 'rail' ? '#5b5f97' : '#0f8b8d',
              weight: route.mode === 'rail' ? 4 : 5,
              dashArray: route.mode === 'rail' ? '8 8' : undefined,
              opacity: 0.78,
            }}
            positions={route.path}
          />
        ))}
        {checkpoints.map((checkpoint) => (
          <Marker
            key={checkpoint.id}
            icon={markerIcon(checkpoint.status, checkpoint.type)}
            position={[checkpoint.lat, checkpoint.lon]}
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
