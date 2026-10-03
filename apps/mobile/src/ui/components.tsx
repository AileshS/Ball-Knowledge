import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, useTheme } from './theme';

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: t.background }}
    >
      <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.heading, { color: t.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.textMuted : t.text }]}>{children}</Text>;
}

interface CardProps {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly style?: ViewStyle;
}

export function Card({ children, onPress, disabled, accessibilityLabel, style }: CardProps) {
  const t = useTheme();
  const base = [
    styles.card,
    { backgroundColor: disabled ? t.surfaceMuted : t.surface, borderColor: t.border },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

type BadgeTone = 'primary' | 'accent' | 'muted' | 'warning';

export function Badge({ label, tone = 'muted' }: { label: string; tone?: BadgeTone }) {
  const t = useTheme();
  const colors: Record<BadgeTone, { bg: string; fg: string }> = {
    primary: { bg: t.primary, fg: t.onPrimary },
    accent: { bg: t.accent, fg: t.onPrimary },
    muted: { bg: t.surfaceMuted, fg: t.textMuted },
    warning: { bg: t.warningSurface, fg: t.warning },
  };
  return (
    <View style={[styles.badge, { backgroundColor: colors[tone].bg }]}>
      <Text style={[styles.badgeText, { color: colors[tone].fg }]}>{label}</Text>
    </View>
  );
}

/** A thin progress bar; `value` is 0–1. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, { backgroundColor: t.surfaceMuted }]}
    >
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: t.primary }]} />
    </View>
  );
}

export function Banner({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: t.warningSurface }]}>
      <Text style={[styles.body, { color: t.warning }]}>{children}</Text>
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, gap: space.md, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  banner: { borderRadius: radius.sm, padding: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
});
