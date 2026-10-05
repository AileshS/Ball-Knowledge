import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AccountProvider } from '../src/state/Account';
import { AppStateProvider } from '../src/state/AppState';
import { useTheme } from '../src/ui/theme';

function Navigator() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.surface },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: t.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Ball Knowledge' }} />
      <Stack.Screen name="[sport]/index" options={{ title: 'Choose a track' }} />
      <Stack.Screen name="[sport]/[track]" options={{ title: 'Learning path' }} />
      <Stack.Screen name="[sport]/review" options={{ title: 'Review' }} />
      <Stack.Screen name="[sport]/welcome" options={{ title: 'Welcome' }} />
      <Stack.Screen name="[sport]/placement" options={{ title: 'Placement quiz' }} />
      <Stack.Screen name="lesson/[id]" options={{ title: 'Lesson' }} />
      <Stack.Screen name="play/[id]" options={{ title: 'Lesson' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppStateProvider>
      <AccountProvider>
        <StatusBar style="auto" />
        <Navigator />
      </AccountProvider>
    </AppStateProvider>
  );
}
