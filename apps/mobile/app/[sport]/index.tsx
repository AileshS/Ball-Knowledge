import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { hasStarted, trackCards } from '../../src/model/path';
import type { ChosenTrack } from '../../src/session/preferences';
import { useAppState, useCompletedLessons } from '../../src/state/AppState';
import { Badge, Body, Card, Heading, ProgressBar, Row, Screen } from '../../src/ui/components';
import { Button } from '../../src/ui/controls';
import { TodayCard } from '../../src/ui/TodayCard';

const CHOICES: readonly { track: ChosenTrack; label: string }[] = [
  { track: 'past', label: 'Past' },
  { track: 'present', label: 'Present' },
];

export default function TrackPicker() {
  const { sport: sportId } = useLocalSearchParams<{ sport: string }>();
  const { content, progress, preferences, setTrack } = useAppState();
  const completed = useCompletedLessons();
  const sport = content.sports.find((s) => s.id === sportId);

  if (!sport || sport.status !== 'live') {
    return (
      <Screen>
        <Body>That sport isn&apos;t available yet.</Body>
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

  const prefs = preferences.get(sport.id);
  if (!prefs?.onboarded && !hasStarted(content, sport.id, progress.states, completed)) {
    return <Redirect href={{ pathname: '/[sport]/welcome', params: { sport: sport.id } }} />;
  }
  const chosen = prefs?.track ?? null;

  return (
    <Screen>
      <Stack.Screen options={{ title: sport.name }} />
      <TodayCard sportId={sport.id} />
      <Card>
        <Row>
          <Heading>Your track</Heading>
          {chosen && <Badge label={chosen === 'past' ? 'Past' : 'Present'} tone="primary" />}
        </Row>
        <Body muted>
          After Foundations, new lessons come from your track. Switch any time; reviews from both
          tracks share one queue.
        </Body>
        <Row>
          {CHOICES.map(({ track, label }) => (
            <Button
              key={track}
              label={label}
              tone="secondary"
              selected={chosen === track}
              accessibilityLabel={`Make ${label} my track`}
              onPress={() => void setTrack(sport.id, track)}
            />
          ))}
        </Row>
      </Card>
      {trackCards(content, sport.id, completed).map((card) => {
        const ready = card.lessonCount > 0;
        return (
          <Card
            key={card.track}
            disabled={!ready}
            accessibilityLabel={ready ? `${card.title} track` : `${card.title} track, coming soon`}
            onPress={() =>
              router.push({
                pathname: '/[sport]/[track]',
                params: { sport: sport.id, track: card.track },
              })
            }
          >
            <Row>
              <Heading>{card.title}</Heading>
              {ready ? (
                <Badge
                  label={`${card.completedLessons}/${card.lessonCount} lessons`}
                  tone="primary"
                />
              ) : (
                <Badge label="Coming soon" />
              )}
            </Row>
            <Body muted>{card.blurb}</Body>
            {ready && (
              <ProgressBar
                value={card.completedLessons / card.lessonCount}
                label={`${card.title}: ${card.completedLessons} of ${card.lessonCount} lessons done`}
              />
            )}
          </Card>
        );
      })}
    </Screen>
  );
}
