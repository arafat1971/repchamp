/**
 * The widget's weather: a WMO weather code from Open-Meteo, folded into the
 * handful of skies the scene can paint, plus the temperature.
 */

export const WEATHER_KINDS = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export interface WeatherNow {
  kind: WeatherKind;
  tempC: number;
  /** When it was fetched, epoch ms. */
  at: number;
}

/** How long a reading stays good enough to paint. */
export const WEATHER_FRESH_MS = 3 * 60 * 60 * 1000;

/** WMO code → the scene's sky. */
export function weatherKind(code: number): WeatherKind {
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  return 'cloudy';
}

/** The emoji for a sky, for the temperature chip. */
export function weatherEmoji(kind: WeatherKind): string {
  return { clear: '☀️', cloudy: '⛅', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️' }[kind];
}

/** Hot enough that the widget suggests extra water. */
export const HOT_C = 30;

/** A reading still worth showing, or null. */
export function freshWeather(w: WeatherNow | null | undefined, now: number): WeatherNow | null {
  if (!w || !Number.isFinite(w.tempC) || !Number.isFinite(w.at)) return null;
  return now - w.at <= WEATHER_FRESH_MS ? w : null;
}
