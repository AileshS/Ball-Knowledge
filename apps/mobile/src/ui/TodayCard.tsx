import { router } from 'expo-router';
import { startOfLocalDay, todaySummary } from '../session/today';
import { useAppState } from '../state/AppState';
import { Badge, Body, Card, Heading, Row } from './components';
import { Button } from './controls';

/** What's due now and the next lesson. No daily goal or stop (ADR 0006). */
export function TodayCard({ sportId }: { sportId: string }) {
  const { content, scheduler, progress, log, clock, advanceDays, preferences } = useAppState();
  if (!progress) return null;

  const now = clock.now();
  const today = todaySummary({
    content,
    sportId,
    states: progress.states,
    completedLessons: progress.completedLessons,
    log,
    scheduler,
    now,
    dayStart: startOfLocalDay(now),
    chosenTrack: preferences.get(sportId)?.track ?? null,
  });
  const due = today.reviewItemIds.length;

  return (
    <Card>
      <Row>
        <Heading>Today</Heading>
        {today.caughtUp ? (
          <Badge label="Caught up" tone="accent" />
        ) : (
          <Badge label={`${due} due`} tone="primary" />
        )}
      </Row>
      {due > 0 && (
        <Button
          label={`Review ${due} fact${due === 1 ? '' : 's'}`}
          onPress={() => router.push({ pathname: '/[sport]/review', params: { sport: sportId } })}
        />
      )}
      {today.caughtUp && <Body>Nothing due for review right now.</Body>}
      {today.nextLesson && (
        <Button
          label={`Next lesson: ${today.nextLesson.title}`}
          tone={due > 0 ? 'secondary' : 'primary'}
          onPress={() =>
            router.push({ pathname: '/lesson/[id]', params: { id: today.nextLesson!.id } })
          }
        />
      )}
      {!today.nextLesson && <Body muted>You've finished every lesson available so far.</Body>}
      {(today.reviewsDoneToday > 0 || today.lessonsDoneToday > 0) && (
        <Body muted>
          Reviewed today: {today.reviewsDoneToday} · Lessons today: {today.lessonsDoneToday}
        </Body>
      )}
      {__DEV__ && (
        <Card>
          <Body muted>
            Dev clock: {clock.offsetDays === 0 ? 'real time' : `+${clock.offsetDays} day(s)`} ·{' '}
            {now.toDateString()}
          </Body>
          <Row>
            <Button label="+1 day" tone="secondary" onPress={() => void advanceDays(1)} />
            <Button label="+7 days" tone="secondary" onPress={() => void advanceDays(7)} />
          </Row>
        </Card>
      )}
    </Card>
  );
}
