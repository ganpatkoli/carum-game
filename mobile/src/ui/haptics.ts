import * as Haptics from 'expo-haptics';
import { useSettings } from '../store/settings';

export const haptic = (kind: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') => {
  if (!useSettings.getState().vibration) return;
  try {
    if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (kind === 'error') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    else Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy);
  } catch { /* unsupported */ }
};
