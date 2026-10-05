import { router } from 'expo-router';
import { masteredCount } from '../rewards/mastery-map';
import { rankFor } from '../rewards/ranks';
import { reviewStreak } from '../rewards/streak';
import { startOfLocalDay } from '../session/today';
import { useAppState } from '../state/AppState';
import { Badge, Body, Card, Heading, Row } from './components';

/** Rank and streak at a glance; opens the full progress screen. */
export function ProgressCard({ sportId }: { sportId: string }) {
  const { content, scheduler, progress, log, clock } = useAppState();
  if (!progress) return null;
  const rank = rankFor(masteredCount(content, sportId, progress.states, scheduler.config));
  const sportLog = log.filter((e) => content.itemsById.get(e.itemId)?.sportId === sportId);
  const streak = reviewStreak({
    scheduler,
    log: sportLog,
    now: clock.now(),
    startOfDay: startOfLocalDay,
  });
  return (
    <Card
      accessibilityLabel={`Your progress: ${rank.rank.title}, ${streak.current} day review streak`}
      onPress={() => router.push({ pathname: '/[sport]/progress', params: { sport: sportId } })}
    >
      <Row>
        <Heading>Your progress</Heading>
        <Badge label={rank.rank.title} tone="accent" />
      </Row>
      <Body muted>
        Review streak: {streak.current} day{streak.current === 1 ? '' : 's'} · Mastery map, XP, and
        My tips
      </Body>
    </Card>
  );
}
