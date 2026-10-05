import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { SHOW_DEV_TOOLS } from '../../src/dev/flags';
import { galleryContent, galleryQuestions } from '../../src/dev/gallery';
import { Banner, Body, Card, Heading, Screen } from '../../src/ui/components';
import { Button } from '../../src/ui/controls';
import { Player, SessionComplete, type SessionSummary } from '../../src/ui/Player';

/** Dev tools only: try every question type with fictional examples. Nothing is saved. */
export default function ExerciseGallery() {
  const content = useMemo(() => galleryContent(), []);
  const [mode, setMode] = useState<'choice' | 'typed' | null>(null);
  const [round, setRound] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  if (!SHOW_DEV_TOOLS) {
    return (
      <Screen>
        <Body>This screen is only available in development builds.</Body>
      </Screen>
    );
  }

  const start = (next: 'choice' | 'typed') => {
    setSummary(null);
    setMode(next);
    setRound((r) => r + 1);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Exercise gallery' }} />
      <Banner>Dev only. Fictional examples of every question type; nothing is saved.</Banner>
      {mode === null || summary ? (
        <Card>
          <Heading>Try every question type</Heading>
          <Body muted>
            Multiple choice, identify by jersey, identify from a described photo, who-did-it, fill
            in the blank, match, timeline, higher-or-lower, and a described clip.
          </Body>
          {summary && (
            <SessionComplete title="Gallery done" summary={summary} showXp={false}>
              <Body muted>Play again in the other format to see both.</Body>
            </SessionComplete>
          )}
          <Button label="Play with options to pick" onPress={() => start('choice')} />
          <Button label="Play with typed answers" tone="secondary" onPress={() => start('typed')} />
        </Card>
      ) : (
        <Player
          key={round}
          practice={content}
          steps={galleryQuestions(content, mode === 'typed')}
          startStates={new Map()}
          onFinish={setSummary}
        />
      )}
    </Screen>
  );
}
