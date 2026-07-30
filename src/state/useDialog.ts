import { create } from 'zustand';

/** One tappable action in a dialog. */
export type DialogAction = {
  label: string;
  /** Runs after the dialog closes, so navigation/async never fights the modal. */
  onPress?: () => void;
  variant?: 'primary' | 'destructive' | 'cancel';
};

export type DialogTone = 'success' | 'info' | 'danger';

export type DialogConfig = {
  title: string;
  message?: string;
  tone?: DialogTone;
  actions: DialogAction[];
};

type DialogState = {
  config: DialogConfig | null;
  show: (config: DialogConfig) => void;
  hide: () => void;
};

/**
 * A single, app-wide custom dialog — the premium replacement for the OS
 * `Alert.alert`. One host (`<DialogHost/>`, mounted at the root) renders whatever
 * config is set here, so any screen can raise a branded confirm/success pop-up
 * with `showDialog(...)` instead of the plain system sheet.
 */
export const useDialog = create<DialogState>((set) => ({
  config: null,
  show: (config) => set({ config }),
  hide: () => set({ config: null }),
}));

/** Imperative helper so callers don't need the hook to raise a dialog. */
export const showDialog = (config: DialogConfig) => useDialog.getState().show(config);
