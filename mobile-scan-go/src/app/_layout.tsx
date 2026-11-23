import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../core/queryClient';
import { LiveEvents } from '../core/liveEvents';
import { OfflineBanner } from '../shared/OfflineBanner';
import { FeedbackHost } from '../shared/ui/feedback';
import { LocaleProvider } from '../core/i18n';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LiveEvents />
        <StatusBar style="auto" />
        <OfflineBanner />
        <LocaleProvider>
          <FeedbackHost>
            <Stack screenOptions={{ headerShown: false }} />
          </FeedbackHost>
        </LocaleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
