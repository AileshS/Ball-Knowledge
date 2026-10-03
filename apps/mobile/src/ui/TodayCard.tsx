import { router } from 'expo-router';
import { startOfLocalDay, todaySummary } from '../session/today';
import { useAppState } from '../state/AppState';
import { Badge, Body, Card, Heading, Row } from './components';
import { Button } from './controls';

/** Today's small, finishable goal (PRD §9), then "you're done for today." */
export function TodayCard({ sportId }: { sportId: string }) {
  const { content, scheduler, progress, log, clock, advanceDays } = useAppState();
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
  });
  const reviewsLeft = today.reviewItemIds.length;
  const lessonLeft = today.lessonGoal > today.lessonsDoneToday && today.nextLesson;

  return (
    <Card>
      <Row>
        <Heading>Today</Heading>
        {today.done ? (
          <Badge label="Done" tone="accent" />
        ) : (
          <Badge label="Daily goal" tone="primary" />
        )}
      </Row>
      {today.done ? (
        <>
          <Body>You're done for today. Come back tomorrow — your memory does the rest.</Body>
          {today.nextLesson && today.lessonsDoneToday > 0 && (
            <Body muted>Next up tomorrow: {today.nextLesson.title}</Body>
          )}
        </>
      ) : (
        <>
          {reviewsLeft > 0 && (
            <Button
              label={`Review ${reviewsLeft} fact${reviewsLeft === 1 ? '' : 's'}`}
              onPress={() =>
                router.push({ pathname: '/[sport]/review', params: { sport: sportId } })
              }
            />
          )}
          {lessonLeft && today.nextLesson && (
            <Button
              label={`New lesson: ${today.nextLesson.title}`}
              tone={reviewsLeft > 0 ? 'secondary' : 'primary'}
              onPress={() =>
                router.push({ pathname: '/lesson/[id]', params: { id: today.nextLesson!.id } })
              }
            />
          )}
          {today.deferred > 0 && (
            <Body muted>
              {today.deferred} more due — they'll wait for tomorrow so today stays short.
            </Body>
          )}
        </>
      )}
      {today.reviewsDoneToday > 0 && (
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
