import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';

/**
 * Top padding that keeps screen headers clear of the phone's status bar
 * (time, battery, camera cutout). Uses the real window inset when the OS
 * reports one, with a generous fallback for devices where the inset reads 0.
 */
export function useTopInset(extra = 12): number {
  const insets = useSafeAreaInsets();
  const fallback = Platform.OS === 'android' ? 34 : 28;
  return Math.max(insets.top, fallback) + extra;
}

/** Bottom padding that clears the gesture/3-button navigation bar. */
export function useBottomInset(extra = 16): number {
  const insets = useSafeAreaInsets();
  const fallback = Platform.OS === 'android' ? 20 : 16;
  return Math.max(insets.bottom, fallback) + extra;
}
