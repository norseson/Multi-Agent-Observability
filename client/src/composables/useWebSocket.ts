import { ref, onUnmounted } from "vue";
import { useEventStore } from "../stores/events";

export function useWebSocket() {
  const store = useEventStore();
  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let destroyed = false;

  function getWsUrl(): string {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }

  function connect() {
    if (destroyed) return;

    try {
      ws = new WebSocket(getWsUrl());
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      attempt = 0;
      store.setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "snapshot") {
          store.addEvents(data.events);
        } else if (data.type === "event") {
          store.addEvent(data.event);
        } else if (data.type === "ping") {
          ws?.send(JSON.stringify({ type: "pong" }));
        }
      } catch {}
    };

    ws.onclose = () => {
      store.setConnected(false);
      if (!destroyed) scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function scheduleReconnect() {
    if (destroyed) return;
    const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 1000;
    attempt++;
    reconnectTimeout = setTimeout(connect, delay + jitter);
  }

  function disconnect() {
    destroyed = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    ws?.close();
  }

  connect();

  onUnmounted(() => {
    disconnect();
  });

  return {
    reconnect: () => {
      destroyed = false;
      attempt = 0;
      ws?.close();
      connect();
    },
  };
}
