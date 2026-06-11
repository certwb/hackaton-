export function LiveBadge({ lastUpdate }: { lastUpdate: Date | null }) {
  const timeStr = lastUpdate
    ? lastUpdate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--';

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      LIVE · {timeStr}
    </span>
  );
}
