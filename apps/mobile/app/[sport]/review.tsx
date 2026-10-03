import type { ItemId, UserItemState } from '@ball-knowledge/core';
import { createSeededRng } from '@ball-knowledge/retention';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { planReview } from '../../src/session/plan';
import { startOfLocalDay, todaySummary } from '../../src/session/today';
import { useAccount } from '../../src/state/Account';
import { useAppState } from '../../src/state/AppState';
import { Body, Screen } from '../../src/ui/components';
import { Button } from '../../src/ui/controls';
import { Player, SessionComplete, type SessionSummary } from '../../src/ui/Player';

export default function ReviewSession() {
  const { sport } = useLocalSearchParams<{ sport: string }>();
  const { progress } = useAppState();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Review' }} />
      {progress ? (
        <ReviewRun sportId={sport} startStates={progress.states} />
      ) : (
        <Body muted>Loading…</Body>
      )}
    </Screen>
  );
}

function ReviewRun({
  sportId,
  startStates,
}: {
  sportId: string;
  startStates: ReadonlyMap<ItemId, UserItemState>;
}) {
  const { content, scheduler, clock, progress, log } = useAppState();
  const { syncNow } = useAccount();
  const [steps] = useState(() => {
    const now = clock.now();
    const today = todaySummary({
      content,
      sportId,
      states: startStates,
      completedLessons: progress?.completedLessons ?? new Map(),
      log,
      scheduler,
      now,
      dayStart: startOfLocalDay(now),
    });
    return planReview(
      content,
      today.reviewItemIds,
      startStates,
      scheduler,
      createSeededRng(now.getTime() % 2_147_483_647),
    );
  });
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  if (steps.length === 0) {
    return (
      <>
        <Body>Nothing to review right now. Nice work.</Body>
        <Button label="Back" onPress={() => router.back()} />
      </>
    );
  }
  if (summary) {
    return (
      <SessionComplete title="Review done!" summary={summary}>
        <Body muted>Missed facts come back sooner; the ones you knew are spaced further out.</Body>
        <Button label="Back" onPress={() => router.back()} />
      </SessionComplete>
    );
  }
  return (
    <Player
      steps={steps}
      startStates={startStates}
      onFinish={(result) => {
        setSummary(result);
        void syncNow();
      }}
    />
  );
}
