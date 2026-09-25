/**
 * Real weather for the widget's sky — opt-in, and deliberately rough.
 *
 * Only runs when the athlete turned on "Real weather" in the widget studio.
 * Uses the phone's approximate location (precise location is blocked in the
 * manifest), rounds it to one decimal place (about 10 km) before it leaves
 * the phone, and asks Open-Meteo — no account, no key — for the current
 * conditions. At most once every half hour; any failure keeps the last
 * reading, which ages out of the widget after three hours on its own.
 */

import * as Location from 'expo-location';

import { weatherKind } from '@/domain/weather';
import { useWeatherStore } from '@/state/weatherStore';
import { useWidgetStyleStore } from '@/state/widgetStyleStore';

const REFRESH_MS = 30 * 60 * 1000;
let inFlight = false;

/** Ask for approximate location — called when the switch is turned on. */
export async function enableRealWeather(): Promise<boolean> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function refreshWeather(force = false): Promise<void> {
  if (!useWidgetStyleStore.getState().weather || inFlight) return;
  const last = useWeatherStore.getState().now;
  if (!force && last && Date.now() - last.at < REFRESH_MS) return;
  inFlight = true;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;
    const pos =
      (await Location.getLastKnownPositionAsync({ maxAge: 6 * 60 * 60 * 1000 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }));
    if (!pos) return;
    const lat = Math.round(pos.coords.latitude * 10) / 10;
    const lon = Math.round(pos.coords.longitude * 10) / 10;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
    );
    if (!res.ok) return;
    const body = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    const temp = body.current?.temperature_2m;
    const code = body.current?.weather_code;
    if (typeof temp !== 'number' || typeof code !== 'number') return;
    useWeatherStore.getState().set({ kind: weatherKind(code), tempC: Math.round(temp), south: lat < 0, at: Date.now() });
  } catch {
    // Keep the last reading; it ages out on its own.
  } finally {
    inFlight = false;
  }
}
