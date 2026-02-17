export function truncateHash(hash: string, length = 8): string {
  return hash.length > length ? hash.slice(0, length) : hash;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - then) / 1000));

  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function eventColor(eventType: string): string {
  switch (eventType) {
    case "PreToolUse":
      return "#3b82f6"; // blue-500
    case "PostToolUse":
      return "#22c55e"; // green-500
    case "Notification":
      return "#f59e0b"; // amber-500
    case "run.summary":
    case "run.end":
      return "#3b82f6"; // blue-500
    default:
      return "#6b7280"; // gray-500
  }
}

export function eventBadgeClasses(eventType: string): string {
  switch (eventType) {
    case "PreToolUse":
      return "bg-blue-500/20 text-blue-400";
    case "PostToolUse":
      return "bg-green-500/20 text-green-400";
    case "Notification":
      return "bg-amber-500/20 text-amber-400";
    case "run.summary":
      return "bg-blue-500/20 text-blue-300";
    case "run.end":
      return "bg-blue-500/20 text-blue-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
