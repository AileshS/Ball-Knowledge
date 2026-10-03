import { router, Stack, useLocalSearchParams } from 'expo-router';
import { trackCards } from '../../src/model/path';
import { useAppState, useCompletedLessons } from '../../src/state/AppState';
import { Badge, Body, Card, Heading, ProgressBar, Row, Screen } from '../../src/ui/components';
import { TodayCard } from '../../src/ui/TodayCard';

export default function TrackPicker() {
  const { sport: sportId } = useLocalSearchParams<{ sport: string }>();
  const { content } = useAppState();
  const completed = useCompletedLessons();
  const sport = content.sports.find((s) => s.id === sportId);

  if (!sport || sport.status !== 'live') {
    return (
      <Screen>
        <Body>That sport isn't available yet.</Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: sport.name }} />
      <TodayCard sportId={sport.id} />
      <Body muted>Pick where to start. Past and Present share one review queue.</Body>
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
