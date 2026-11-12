import { useEffect, useState, useRef } from 'react';
import { getToken } from '../api.js';

export interface LiveStreamEvent {
  type: string;
  payload: any;
  timestamp: string;
}

export type EventCallback = (event: LiveStreamEvent) => void;

export function useLiveOrderEvents(onEvent?: EventCallback) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<LiveStreamEvent | null>(null);
  const onEventRef = useRef<EventCallback | undefined>(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: any = null;

    function connect() {
      // The app stores its access token under 'scango_access_token'; read it through api.ts so the
      // stream is authenticated (the server now rejects anonymous connections).
      const token = getToken();
      if (!token) {
        reconnectTimeout = setTimeout(connect, 4000);
        return;
      }
      const streamUrl = `/api/v1/events/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

      try {
        eventSource = new EventSource(streamUrl);

        eventSource.onopen = () => {
          setConnected(true);
        };

        const handleGenericEvent = (type: string) => (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const evt: LiveStreamEvent = {
              type,
              payload: data.payload,
              timestamp: data.timestamp || new Date().toISOString(),
            };
            setLastEvent(evt);
            if (onEventRef.current) {
              onEventRef.current(evt);
            }
          } catch (err) {
            console.error('Failed to parse SSE event:', err);
          }
        };

        // Listen for all stream event types
        const eventTypes = [
          'order.created',
          'order.paid',
          'picking.started',
          'substitution.requested',
          'substitution.responded',
          'order.ready',
          'order.collected',
          'exit.scanned',
          'exit.cleared',
          'exit.flagged',
          'amber.overtime',
          'discrepancy.escalated',
          'store.config_updated',
        ];

        for (const type of eventTypes) {
          eventSource.addEventListener(type, handleGenericEvent(type) as EventListener);
        }

        eventSource.onerror = () => {
          setConnected(false);
          eventSource?.close();
          // Auto reconnect after 4 seconds
          reconnectTimeout = setTimeout(connect, 4000);
        };
      } catch (err) {
        console.error('SSE connection error:', err);
        reconnectTimeout = setTimeout(connect, 4000);
      }
    }

    connect();

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  return { connected, lastEvent };
}