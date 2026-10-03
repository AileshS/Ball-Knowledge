import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
      <Stack.Screen name="lesson/[id]" options={{ title: 'Lesson' }} />
      <Stack.Screen name="play/[id]" options={{ title: 'Lesson' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AppStateProvider>
      <StatusBar style="auto" />
      <Navigator />
    </AppStateProvider>
  );
}
