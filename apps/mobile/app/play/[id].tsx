import type { ItemId, Lesson, UserItemState } from '@ball-knowledge/core';
import { createSeededRng } from '@ball-knowledge/retention';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { lessonStatus } from '../../src/model/path';
import { planLesson } from '../../src/session/plan';
import { useAccount } from '../../src/state/Account';
import { useAppState, useCompletedLessons } from '../../src/state/AppState';
import { Body, Screen } from '../../src/ui/components';
import { Button } from '../../src/ui/controls';
import { Player, SessionComplete, type SessionSummary } from '../../src/ui/Player';

export default function PlayLesson() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { content, scheduler, progress, clock } = useAppState();
  const completed = useCompletedLessons();
  const lesson = content.lessonsById.get(id);

  if (!lesson) {
    return (
      <Screen>
        <Body>Lesson not found.</Body>
      </Screen>
    );
  }
  if (!progress) {
    return (
      <Screen>
        <Body muted>Loading…</Body>
      </Screen>
    );
  }
  const status = lessonStatus(
    {
      content,
      completedLessonIds: completed,
      states: progress.states,
      scheduler,
      now: clock.now(),
    },
    lesson.id,
  );
  return (
    <Screen>
      <Stack.Screen options={{ title: lesson.title }} />
      {status === 'locked' ? (
        <Body>This lesson is still locked.</Body>
      ) : (
        <LessonRun lesson={lesson} startStates={progress.states} />
      )}
    </Screen>
  );
}

/** Mounted once progress is loaded; the plan is fixed for the whole lesson. */
function LessonRun({
  lesson,
  startStates,
}: {
  lesson: Lesson;
  startStates: ReadonlyMap<ItemId, UserItemState>;
}) {
  const { content, scheduler, clock, completeLesson } = useAppState();
  const { syncNow } = useAccount();
  const [steps] = useState(() => {
    const now = clock.now();
    return planLesson({
      content,
      lesson,
      states: startStates,
      scheduler,
      now,
      rng: createSeededRng(now.getTime() % 2_147_483_647),
    });
  });
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = (result: SessionSummary) => {
    completeLesson(lesson.id).then(
      () => {
        setSummary(result);
        void syncNow();
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  };

  if (error) return <Body>Couldn't save lesson progress: {error}</Body>;
  if (summary) {
    return (
      <SessionComplete title="Lesson complete!" summary={summary}>
        <Body muted>
          These facts will come back for review right when you're about to forget them.
        </Body>
        <Button label="Back" onPress={() => router.back()} />
      </SessionComplete>
    );
  }
  return <Player steps={steps} startStates={startStates} onFinish={finish} />;
}
