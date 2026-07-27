import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

import { useSettingsStore } from '@/state/settingsStore';

/**
 * Rep feedback: a short beep, a haptic tick and optional spoken cues.
 *
 * Every entry point checks the athlete's settings itself, so callers in the duel
 * loop stay free of `if (settings.sound)` noise.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const SOURCES = {
  rep: require('../../assets/sounds/rep.wav'),
  count: require('../../assets/sounds/count.wav'),
  go: require('../../assets/sounds/go.wav'),
  win: require('../../assets/sounds/win.wav'),
  lose: require('../../assets/sounds/lose.wav'),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

export type SoundName = keyof typeof SOURCES;

const players = new Map<SoundName, AudioPlayer>();

/**
 * Pre-creates every player up front.
 *
 * Creating one lazily on the first rep costs tens of milliseconds — enough for
 * the beep to land noticeably after the rep it is confirming.
 */
export async function prepareAudio(): Promise<void> {
  try {
    // Duck rather than interrupt: the athlete's own music should keep playing,
    // and the app must stay audible when the ringer switch is silent.
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      interruptionMode: 'mixWithOthers',
    });

    for (const [name, source] of Object.entries(SOURCES) as [SoundName, number][]) {
      if (!players.has(name)) players.set(name, createAudioPlayer(source));
    }
  } catch {
    // Audio is a nicety; never let it block a session from starting.
  }
}

export function releaseAudio(): void {
  for (const player of players.values()) {
    try {
      player.release();
    } catch {
      // Already released.
    }
  }
  players.clear();
}

function play(name: SoundName): void {
  if (!useSettingsStore.getState().sound) return;
  try {
    const player = players.get(name);
    if (!player) return;
    // Rewind so rapid reps retrigger instead of being swallowed mid-playback.
    player.seekTo(0);
    player.play();
  } catch {
    // Ignore — a missed beep must never interrupt a set.
  }
}

export const playRepSound = () => play('rep');
export const playCountSound = () => play('count');
export const playGoSound = () => play('go');
export const playWinSound = () => play('win');
export const playLoseSound = () => play('lose');

export function repHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function lightImpactHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function selectionHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  void Haptics.selectionAsync();
}

export function successHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function failureHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

export function lockHaptic(): void {
  if (!useSettingsStore.getState().haptics) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

/** Combined beep + tick fired on each counted rep. */
export function repFeedback(): void {
  playRepSound();
  repHaptic();
}

export function speak(text: string): void {
  if (!useSettingsStore.getState().voiceCoach) return;
  Speech.stop();
  Speech.speak(text, { rate: 1.05, pitch: 1 });
}

export function stopSpeaking(): void {
  Speech.stop();
}
