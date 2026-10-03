import { router, Stack, useLocalSearchParams } from 'expo-router';
import { lessonPreview, lessonStatus } from '../../src/model/path';
import { useAppState, useCompletedLessons } from '../../src/state/AppState';
import { Badge, Body, Card, Heading, Screen, Title } from '../../src/ui/components';
import { Button } from '../../src/ui/controls';

export default function LessonPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { content, scheduler, progress, clock } = useAppState();
  const completed = useCompletedLessons();
  const lesson = lessonPreview(content, id);

  if (!lesson) {
    return (
      <Screen>
        <Body>Lesson not found.</Body>
      </Screen>
    );
  }

  const status = lessonStatus(
    {
      content,
      completedLessonIds: completed,
      states: progress?.states ?? new Map(),
      scheduler,
      now: clock.now(),
    },
    lesson.id,
  );
  const start = () => router.push({ pathname: '/play/[id]', params: { id: lesson.id } });

  return (
    <Screen>
      <Stack.Screen options={{ title: lesson.unitTitle }} />
      <Title>{lesson.title}</Title>
      <Body muted>
        About {lesson.minutes} minutes · {lesson.callbacks + lesson.exercises + lesson.recallChecks}{' '}
        questions
      </Body>
      <Card>
        <Heading>You'll learn</Heading>
        {lesson.learns.map((label) => (
          <Body key={label}>• {label}</Body>
        ))}
      </Card>
      <Card>
        <Heading>How it goes</Heading>
        {lesson.callbacks > 0 && (
          <Body>Warm-up: up to {lesson.callbacks} questions on things you've already learned</Body>
        )}
        <Body>Learn: {lesson.exercises} questions on the new facts</Body>
        <Body>Recall check: {lesson.recallChecks} questions to lock it in</Body>
        {lesson.memoryTip && <Body muted>Includes a memory tip: {lesson.memoryTip}</Body>}
      </Card>
      {status === 'available' && <Button label="Start lesson" onPress={start} />}
      {status === 'completed' && (
        <>
          <Badge label="Completed" tone="accent" />
          <Button label="Practice again" tone="secondary" onPress={start} />
        </>
      )}
      {status === 'locked' && <Body muted>Finish the earlier lessons to unlock this one.</Body>}
    </Screen>
  );
}
