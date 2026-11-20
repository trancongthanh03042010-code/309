import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredSocialToken } from '../../services/socialApi';

export type WsHandler = (event: string, payload: unknown) => void;

export function useSocialWS(enabled: boolean, onEvent: WsHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let closedByUser = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const connect = () => {
      const token = getStoredSocialToken();
      if (!token || closedByUser) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/social?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'ping' }));
          }
        }, 25000);
      };

      ws.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.data)) as { event?: string; payload?: unknown };
          if (parsed.event) {
            handlerRef.current(parsed.event, parsed.payload);
          }
        } catch {
          // ignore invalid frames
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (pingTimer) clearInterval(pingTimer);
        if (!closedByUser) {
          attempt = Math.min(5, attempt + 1);
          retryTimer = setTimeout(connect, 1000 * attempt);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closedByUser = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (pingTimer) clearInterval(pingTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled]);

  const sendWs = useCallback((event: string, payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, payload }));
      return true;
    }
    return false;
  }, []);

  return { connected, sendWs };
}
