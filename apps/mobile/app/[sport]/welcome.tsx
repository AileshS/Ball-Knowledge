import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useAppState, useCompletedLessons } from '../../src/state/AppState';
import { planPlacement } from '../../src/session/placement';
import { createSeededRng } from '@ball-knowledge/retention';
import { Badge, Banner, Body, Card, Heading, Screen, Title } from '../../src/ui/components';
import { Button } from '../../src/ui/controls';

/** First visit to a sport (PRD §6): start from the basics, or place out of them. */
export default function Welcome() {
  const { sport: sportId } = useLocalSearchParams<{ sport: string }>();
  const { content, progress, scheduler, finishOnboarding } = useAppState();
  const completed = useCompletedLessons();
  const [error, setError] = useState<string | null>(null);
  const sport = content.sports.find((s) => s.id === sportId);

  if (!sport || !progress) {
    return (
      <Screen>
        <Body muted>{sport ? 'Loading…' : "That sport isn't available yet."}</Body>
      </Screen>
    );
  }

  const quiz = planPlacement({
    content,
    sportId: sport.id,
    states: progress.states,
    completedLessonIds: completed,
    scheduler,
    rng: createSeededRng(1),
  });

  const startFresh = () => {
    finishOnboarding(sport.id).then(
      () => router.replace({ pathname: '/[sport]', params: { sport: sport.id } }),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: sport.name }} />
      <Title>Welcome to {sport.name}.</Title>
      <Body muted>
        Start with the basics, or show what you already know and skip ahead. You can always come
        back to any lesson.
      </Body>
      {error && <Banner>{error}</Banner>}
      <Card>
        <Heading>New to {sport.name}?</Heading>
        <Body muted>Start from the beginning with the basics of the game.</Body>
        <Button label="Start from the beginning" onPress={startFresh} />
      </Card>
      {quiz.steps.length > 0 && (
        <Card>
          <Badge label={`${quiz.steps.length} questions · about 2 minutes`} />
          <Heading>Already know the basics?</Heading>
          <Body muted>
            Take a quick placement quiz. Get a lesson&apos;s facts right and you&apos;ll skip it;
            anything you miss, we&apos;ll teach.
          </Body>
          <Button
            label="Take the placement quiz"
            tone="secondary"
            onPress={() =>
              router.push({ pathname: '/[sport]/placement', params: { sport: sport.id } })
            }
          />
        </Card>
      )}
    </Screen>
  );
}
