import type { Checkpoint } from '../types';

export function OverloadAlert({ checkpoints }: { checkpoints: Checkpoint[] }) {
  const overloaded = checkpoints.filter(
    (checkpoint) => checkpoint.current_queue / Math.max(checkpoint.capacity_per_hour, 1) >= 0.8,
  );

  if (overloaded.length === 0) return null;

  return (
    <button
      type="button"
      className="w-full border-b border-red-200 bg-red-50 px-4 py-2.5 text-left transition-colors hover:bg-red-100"
      onClick={() => document.getElementById('map')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
    >
      <span className="mx-auto flex w-full max-w-[1440px] items-center gap-3">
        <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-red-800">
          <strong>Перегрузка:</strong>{' '}
          {overloaded.map((checkpoint) => `${checkpoint.name} — ожидание ${checkpoint.wait_minutes} мин`).join(' · ')}
        </span>
        <span className="hidden flex-shrink-0 text-xs font-medium text-red-500 sm:inline">перейти к карте</span>
      </span>
    </button>
  );
}
