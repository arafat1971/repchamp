import type { HabitId } from '@/domain/ritual';
import { dayKey } from '@/domain/progression';
import { syncRitualNow } from '@/services/ritualSync';
import { useRitualStore } from '@/state/ritualStore';

/**
 * Tick a habit of today's ritual because it was actually done — a guided
 * breath, a meditation, a yoga flow — and publish it to the couple. Never
 * un-ticks: if it's already ticked today, it stays as it is.
 */
export function tickRitualHabit(habit: HabitId, coupleId: string | null | undefined, uid: string | null | undefined): void {
  const today = dayKey();
  const state = useRitualStore.getState();
  const ticked = state.day === today && state.ticks.includes(habit);
  const ticks = ticked ? state.ticks : state.toggle(today, habit);
  void syncRitualNow(coupleId, uid, ticks);
}
