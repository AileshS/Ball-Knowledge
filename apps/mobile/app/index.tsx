import { router } from 'expo-router';
import { awaitingReview, sportCards } from '../src/model/path';
import { SHOW_DEV_TOOLS } from '../src/dev/flags';
import { useAccount } from '../src/state/Account';
import { useAppState } from '../src/state/AppState';
import { Badge, Banner, Body, Card, Heading, Row, Screen, Title } from '../src/ui/components';

export default function SportPicker() {
  const { content, error } = useAppState();
  const account = useAccount();
  const pending = awaitingReview(content);

  return (
    <Screen>
      <Title>Get real ball knowledge.</Title>
      <Body muted>
        Learn a sport's rules, eras, and today's players, and actually remember them.
      </Body>
      {error && <Banner>Couldn't load your progress: {error}</Banner>}
      {content.mode === 'dev' && pending > 0 && (
        <Banner>Preview build: {pending} fact(s) are still awaiting review.</Banner>
      )}
      {account.configured && (
        <Card
          accessibilityLabel={
            account.email ? `Account: ${account.email}` : 'Sign in to sync your progress'
          }
          onPress={() => router.push('/account')}
        >
          <Row>
            <Body>
              {account.email ? `Signed in as ${account.email}` : 'Sign in to sync your progress'}
            </Body>
            <Badge
              label={account.email ? 'Account' : 'Sign in'}
              tone={account.email ? 'muted' : 'primary'}
            />
          </Row>
        </Card>
      )}
      {SHOW_DEV_TOOLS && (
        <Card
          accessibilityLabel="Developer: exercise gallery"
          onPress={() => router.push('/dev/gallery')}
        >
          <Row>
            <Body>Exercise gallery (dev only)</Body>
            <Badge label="Dev" />
          </Row>
        </Card>
      )}
      <Heading>Choose a sport</Heading>
      {sportCards(content).map((sport) => (
        <Card
          key={sport.id}
          disabled={!sport.live}
          accessibilityLabel={
            sport.live ? `${sport.name}, start learning` : `${sport.name}, coming soon`
          }
          onPress={() => router.push({ pathname: '/[sport]', params: { sport: sport.id } })}
        >
          <Row>
            <Heading>{sport.name}</Heading>
            <Badge
              label={sport.live ? 'Live' : 'Coming soon'}
              tone={sport.live ? 'primary' : 'muted'}
            />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
