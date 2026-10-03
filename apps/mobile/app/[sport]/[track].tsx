import { TrackSchema } from '@ball-knowledge/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { learningPath, TRACK_INFO, type LessonStatus, type UnitStatus } from '../../src/model/path';
import { useAppState, useCompletedLessons } from '../../src/state/AppState';
import { Badge, Body, Card, Heading, ProgressBar, Row, Screen } from '../../src/ui/components';

const LESSON_BADGE: Record<LessonStatus, { label: string; tone: 'primary' | 'accent' | 'muted' }> =
  {
    completed: { label: 'Done', tone: 'accent' },
    available: { label: 'Start', tone: 'primary' },
    locked: { label: 'Locked', tone: 'muted' },
  };

const UNIT_NOTE: Record<UnitStatus, string> = {
  completed: 'Unit complete',
  available: '',
  locked: 'Finish the earlier units to unlock',
  coming_soon: 'Coming soon',
};

export default function LearningPath() {
  const params = useLocalSearchParams<{ sport: string; track: string }>();
  const track = TrackSchema.safeParse(params.track);
  const { content, scheduler, progress } = useAppState();
  const completed = useCompletedLessons();

  const units = useMemo(
    () =>
      track.success
        ? learningPath({
            content,
            sportId: params.sport,
            track: track.data,
            completedLessonIds: completed,
            states: progress?.states ?? new Map(),
            scheduler,
            now: new Date(),
          })
        : [],
    [content, params.sport, track.success, track.data, completed, progress, scheduler],
  );

  if (!track.success) {
    return (
      <Screen>
        <Body>Unknown track.</Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: TRACK_INFO[track.data].title }} />
      {units.length === 0 && <Body muted>No units in this track yet.</Body>}
      {units.map((unit) => (
        <Card key={unit.id} disabled={unit.status === 'locked' || unit.status === 'coming_soon'}>
          <Row>
            <Heading>{unit.title}</Heading>
            {unit.health.needsRefresh && <Badge label="Needs a refresh" tone="warning" />}
          </Row>
          {UNIT_NOTE[unit.status] !== '' && <Body muted>{UNIT_NOTE[unit.status]}</Body>}
          <ProgressBar
            value={unit.health.total === 0 ? 0 : unit.health.mastered / unit.health.total}
            label={`${unit.title}: ${unit.health.mastered} of ${unit.health.total} facts mastered`}
          />
          <Body muted>
            {unit.health.mastered} of {unit.health.total} facts mastered
          </Body>
          {unit.lessons.map((lesson, i) => (
            <Card
              key={lesson.id}
              disabled={lesson.status === 'locked'}
              accessibilityLabel={`Lesson ${i + 1}: ${lesson.title}, ${LESSON_BADGE[lesson.status].label}`}
              onPress={() => router.push({ pathname: '/lesson/[id]', params: { id: lesson.id } })}
            >
              <Row>
                <Body>
                  {i + 1}. {lesson.title}
                </Body>
                <Badge {...LESSON_BADGE[lesson.status]} />
              </Row>
              <Body muted>
                {lesson.minutes} min · {lesson.newItems} new facts
              </Body>
            </Card>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
