import { Loader2, MapPinned, Trash2 } from 'lucide-react';
import type { RouteLine } from '../types';

export function RouteManager({
  routes,
  deletingId,
  onDelete,
}: {
  routes: RouteLine[];
  deletingId?: string;
  onDelete: (route: RouteLine) => void;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900">Маршруты на карте</h2>
        <MapPinned size={20} className="text-teal-700" aria-hidden />
      </div>

      {routes.length === 0 ? (
        <p className="text-sm text-gray-500">Активных маршрутов нет.</p>
      ) : (
        <div className="grid gap-2">
          {routes.map((route) => {
            const deleting = deletingId === route.id;
            return (
              <article
                key={route.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{route.name}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {route.mode === 'truck' ? 'Авто' : 'Ж/д'} · {route.distance_km} км
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(route)}
                  disabled={deleting}
                  className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                  title="Удалить маршрут"
                  aria-label={`Удалить маршрут ${route.name}`}
                >
                  {deleting ? <Loader2 className="spin" size={16} aria-hidden /> : <Trash2 size={16} aria-hidden />}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
