import type { Exercise } from '@ball-knowledge/core';
import { StyleSheet, Text, View } from 'react-native';
import { Body } from './components';
import { radius, space, useTheme } from './theme';

/**
 * What the question is asked *through*, shown above the prompt:
 * - jersey: a plain drawn jersey with the number (no team colors or marks);
 * - photo / clip: the text description of the image or moment. Media stays off
 *   until it's licensed (ADR 0005), and the text fallback always works.
 * Other cues (name, stat, timeline) need nothing beyond the prompt.
 */
export function CueCard({ exercise }: { exercise: Exercise }) {
  const t = useTheme();
  if (exercise.visual?.kind === 'jersey') {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Jersey number ${exercise.visual.number}`}
        style={styles.jerseyWrap}
      >
        <View
          style={[styles.sleeves, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}
        />
        <View style={[styles.jersey, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
          <Text style={[styles.number, { color: t.text }]}>{exercise.visual.number}</Text>
        </View>
      </View>
    );
  }
  if ((exercise.cue === 'photo' || exercise.cue === 'clip') && exercise.textFallback) {
    return (
      <View style={[styles.moment, { backgroundColor: t.surfaceMuted, borderColor: t.border }]}>
        <Body>{exercise.textFallback}</Body>
        {exercise.type === 'clip' && (
          <Body muted>Moment described · {exercise.clip.sourceName}</Body>
        )}
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  jerseyWrap: { alignItems: 'center', paddingVertical: space.sm },
  sleeves: {
    position: 'absolute',
    top: space.sm,
    width: 168,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  jersey: {
    width: 112,
    height: 120,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { fontSize: 56, fontWeight: '900', letterSpacing: -1 },
  moment: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
});
