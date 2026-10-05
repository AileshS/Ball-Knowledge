import type { ItemId, LessonId, UserItemState } from '@ball-knowledge/core';
import { createSeededRng } from '@ball-knowledge/retention';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { placedLessons, planPlacement, scorePlacement } from '../../src/session/placement';
import { useAccount } from '../../src/state/Account';
import { useAppState, useCompletedLessons } from '../../src/state/AppState';
import { Banner, Body, Card, Screen, Title } from '../../src/ui/components';
import { Button } from '../../src/ui/controls';
import { Player } from '../../src/ui/Player';

export default function Placement() {
  const { sport: sportId } = useLocalSearchParams<{ sport: string }>();
  const { progress } = useAppState();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Placement quiz' }} />
      {progress ? (
        <PlacementRun sportId={sportId} startStates={progress.states} />
      ) : (
        <Body muted>Loading…</Body>
      )}
    </Screen>
  );
}

function PlacementRun({
  sportId,
  startStates,
}: {
  sportId: string;
  startStates: ReadonlyMap<ItemId, UserItemState>;
}) {
  const { content, scheduler, clock, completeLesson, finishOnboarding } = useAppState();
  const { syncNow } = useAccount();
  const completed = useCompletedLessons();
  const [plan] = useState(() =>
    planPlacement({
      content,
      sportId,
      states: startStates,
      completedLessonIds: completed,
      scheduler,
      rng: createSeededRng(clock.now().getTime() % 2_147_483_647),
    }),
  );
  const answers = useRef(new Map<ItemId, boolean>());
  const [result, setResult] = useState<{ placed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async () => {
    try {
      const placed = placedLessons(plan, answers.current);
      for (const lessonId of placed) await completeLesson(lessonId as LessonId);
      await finishOnboarding(sportId);
      setResult({ placed: placed.length, total: plan.lessonIds.length });
      void syncNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) return <Banner>Couldn&apos;t save your placement: {error}</Banner>;
  if (result) {
    return (
      <Card>
        <Title>
          {result.placed === 0
            ? "Let's start at the beginning."
            : `You skipped ${result.placed} of ${result.total} lesson${result.total === 1 ? '' : 's'}.`}
        </Title>
        <Body muted>
          {result.placed === result.total
            ? 'You know these basics cold. They’ll still come back for the occasional review.'
            : 'Facts you got right will come back for review later; the rest, your lessons will teach.'}
        </Body>
        <Button
          label="Continue"
          onPress={() => router.replace({ pathname: '/[sport]', params: { sport: sportId } })}
        />
      </Card>
    );
  }
  if (plan.steps.length === 0) {
    return (
      <>
        <Body>There&apos;s nothing to place out of yet.</Body>
        <Button label="Back" onPress={() => router.back()} />
      </>
    );
  }
  return (
    <>
      <Body muted>Type what you know. A wrong answer just means we&apos;ll teach it.</Body>
      <Player
        steps={plan.steps}
        startStates={startStates}
        score={(step, exercise, correct, now, states) =>
          scorePlacement(scheduler, states, step, exercise, correct, now)
        }
        onAnswered={(step, correct) => {
          for (const itemId of step.itemIds) answers.current.set(itemId, correct);
        }}
        onFinish={() => void finish()}
      />
    </>
  );
}
