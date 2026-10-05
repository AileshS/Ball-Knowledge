import type { MemoryTip } from '@ball-knowledge/core';
import { Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { masteredCount, masteryMap } from '../../src/rewards/mastery-map';
import { rankFor } from '../../src/rewards/ranks';
import { reviewStreak } from '../../src/rewards/streak';
import { xpTotals } from '../../src/rewards/xp';
import { startOfLocalDay } from '../../src/session/today';
import { useAppState } from '../../src/state/AppState';
import {
  Badge,
  Body,
  Card,
  Heading,
  ProgressBar,
  Row,
  Screen,
  Title,
} from '../../src/ui/components';
import { Button } from '../../src/ui/controls';

/** Rank, XP, review streak, mastery map, and saved tips (PRD §8–9). */
export default function ProgressScreen() {
  const { sport: sportId } = useLocalSearchParams<{ sport: string }>();
  const { content, scheduler, progress, log, clock, savedTips, toggleSavedTip } = useAppState();
  const sport = content.sports.find((s) => s.id === sportId);

  if (!sport || !progress) {
    return (
      <Screen>
        <Body muted>{sport ? 'Loading…' : "That sport isn't available yet."}</Body>
      </Screen>
    );
  }

  const now = clock.now();
  const sportLog = log.filter((e) => content.itemsById.get(e.itemId)?.sportId === sport.id);
  const mastered = masteredCount(content, sport.id, progress.states, scheduler.config);
  const rank = rankFor(mastered);
  const xp = xpTotals(scheduler, sportLog, startOfLocalDay(now));
  const streak = reviewStreak({ scheduler, log: sportLog, now, startOfDay: startOfLocalDay });
  const map = masteryMap(content, sport.id, progress.states, scheduler.config);
  const tips = savedTips
    .map((id) => content.tipsById.get(id))
    .filter((tip): tip is MemoryTip => tip !== undefined && tip.sportId === sport.id);

  return (
    <Screen>
      <Stack.Screen options={{ title: `${sport.name} progress` }} />
      <Card>
        <Row>
          <Title>{rank.rank.title}</Title>
          <Badge label={`Level ${rank.rank.level}`} tone="accent" />
        </Row>
        <Body>
          {mastered} mastered fact{mastered === 1 ? '' : 's'}
        </Body>
        {rank.next ? (
          <>
            <ProgressBar value={rank.progress} label={`Progress to ${rank.next.title}`} />
            <Body muted>
              {rank.toNext} more mastered fact{rank.toNext === 1 ? '' : 's'} to reach{' '}
              {rank.next.title}. Ranks only move when facts stick, not with time spent.
            </Body>
          </>
        ) : (
          <Body muted>The top rank. Keep reviewing to keep it all fresh.</Body>
        )}
      </Card>

      <Row>
        <View style={{ flex: 1 }}>
          <Card>
            <Heading>{xp.total} XP</Heading>
            <Body muted>+{xp.today} today · earned only by correct recall</Body>
          </Card>
        </View>
        <View style={{ flex: 1 }}>
          <Card>
            <Heading>
              {streak.current} day{streak.current === 1 ? '' : 's'}
            </Heading>
            <Body muted>
              Review streak · best {streak.best}
              {streak.today === 'kept' ? ' · today done' : ''}
            </Body>
          </Card>
        </View>
      </Row>

      <Heading>Mastery map</Heading>
      {map.length === 0 && <Body muted>Start a lesson to begin filling in your map.</Body>}
      {map.map((section) => (
        <Card key={section.track}>
          <Heading>{section.title}</Heading>
          {section.tiles.map((tile) => (
            <View key={tile.unitId} style={{ gap: 6 }}>
              <Row>
                <Body>{tile.title}</Body>
                <Badge
                  label={`${tile.counts.mastered}/${tile.total} mastered`}
                  tone={tile.counts.mastered === tile.total ? 'accent' : 'muted'}
                />
              </Row>
              <ProgressBar value={tile.mastered} label={`${tile.title}: mastery`} />
              <Body muted>
                {tile.counts.familiar} familiar · {tile.counts.learning} learning ·{' '}
                {tile.counts.new} new
              </Body>
            </View>
          ))}
        </Card>
      ))}

      <Heading>My tips</Heading>
      {tips.length === 0 ? (
        <Body muted>Memory tips you save during lessons show up here.</Body>
      ) : (
        tips.map((tip) => (
          <Card key={tip.id}>
            <Badge label={tip.technique} tone="accent" />
            <Heading>{tip.title}</Heading>
            <Body>{tip.body}</Body>
            <Button label="Remove" tone="secondary" onPress={() => void toggleSavedTip(tip.id)} />
          </Card>
        ))
      )}
    </Screen>
  );
}
