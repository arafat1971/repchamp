import { createContext, useContext, useEffect, useState, type RefObject } from 'react';
import { useWindowDimensions, type View } from 'react-native';

/**
 * Lets a scrolling `Screen` tell the rows inside it that the viewport moved,
 * without re-rendering them: a ping is a nudge to re-measure, nothing more.
 */
export interface ViewportPing {
  ping: () => void;
  subscribe: (fn: () => void) => () => void;
}

export function createViewportPing(): ViewportPing {
  const listeners = new Set<() => void>();
  return {
    ping: () => listeners.forEach((fn) => fn()),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const ViewportPingContext = createContext<ViewportPing | null>(null);

/**
 * True while `ref`'s view is within `margin` of the window — for pausing
 * endless animation on something scrolled out of sight. An off-screen
 * animation is not free: it still runs every frame on the UI thread, and an
 * animated SVG makes Android re-record its whole drawing each time.
 *
 * Starts true so a card that mounts in view never flashes still, and falls
 * back to a slow poll so it recovers if nothing ever pings (a view outside a
 * `Screen`, or content that moves without a scroll).
 */
export function useOnScreen(ref: RefObject<View | null>, margin = 160): boolean {
  const { height: windowHeight } = useWindowDimensions();
  const ping = useContext(ViewportPingContext);
  const [onScreen, setOnScreen] = useState(true);

  useEffect(() => {
    let alive = true;
    const check = () => {
      ref.current?.measureInWindow((_x, y, w, h) => {
        // Not laid out yet (or unmounted): no information, keep the last answer.
        if (!alive || (w === 0 && h === 0)) return;
        const visible = y + h > -margin && y < windowHeight + margin;
        setOnScreen((prev) => (prev === visible ? prev : visible));
      });
    };
    const first = setTimeout(check, 350);
    const poll = setInterval(check, 1500);
    const unsubscribe = ping?.subscribe(check);
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(poll);
      unsubscribe?.();
    };
  }, [ref, ping, margin, windowHeight]);

  return onScreen;
}
