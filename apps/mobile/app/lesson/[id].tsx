import { Stack, useLocalSearchParams } from 'expo-router';
import { lessonPreview } from '../../src/model/path';
import { useAppState } from '../../src/state/AppState';
import { Badge, Body, Card, Heading, Screen, Title } from '../../src/ui/components';

export default function LessonPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { content } = useAppState();
  const lesson = lessonPreview(content, id);

  if (!lesson) {
    return (
      <Screen>
        <Body>Lesson not found.</Body>
      </Screen>
    );
  }

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
          <Body>Warm-up: {lesson.callbacks} questions on things you've already learned</Body>
        )}
        <Body>Learn: {lesson.exercises} questions on the new facts</Body>
        <Body>Recall check: {lesson.recallChecks} questions to lock it in</Body>
        {lesson.memoryTip && <Body muted>Includes a memory tip: {lesson.memoryTip}</Body>}
      </Card>
      <Card disabled accessibilityLabel="Start lesson, coming in the next update">
        <Badge label="Next update" />
        <Body muted>Playing lessons is coming in the next update.</Body>
      </Card>
    </Screen>
  );
}
