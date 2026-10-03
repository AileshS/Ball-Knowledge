import { useState } from 'react';
import { useAccount } from '../src/state/Account';
import { Badge, Banner, Body, Card, Heading, Row, Screen, Title } from '../src/ui/components';
import { Button, Field } from '../src/ui/controls';

const STATUS_LABEL = {
  idle: 'Not synced yet',
  syncing: 'Syncing…',
  synced: 'Synced',
  error: 'Sync problem',
  conflict: 'Needs your choice',
} as const;

export default function AccountScreen() {
  const account = useAccount();

  if (!account.configured) {
    return (
      <Screen>
        <Title>Account</Title>
        <Body>
          Accounts aren't set up in this build yet. Your progress is saved on this device.
        </Body>
        <Body muted>
          To turn them on, add the Supabase settings to apps/mobile/.env (see .env.example) and
          restart the app.
        </Body>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Account</Title>
      {account.message && <Banner>{account.message}</Banner>}
      {account.email ? <SignedIn /> : <SignIn />}
    </Screen>
  );
}

function SignIn() {
  const { sendCode, verifyCode } = useAccount();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      await sendCode(email);
      setSentTo(email.trim());
    });
  const verify = () => run(() => verifyCode(sentTo ?? email, code));
  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <Card>
      <Heading>Sign in to sync</Heading>
      <Body muted>
        Keep your progress safe and use it on every device. We'll email you a 6-digit code — no
        password needed.
      </Body>
      {error && <Banner>{error}</Banner>}
      {sentTo === null ? (
        <>
          <Field
            label="Email address"
            placeholder="you@example.com"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            onSubmit={() => validEmail && void send()}
            editable={!busy}
          />
          <Button
            label="Email me a code"
            disabled={busy || !validEmail}
            onPress={() => void send()}
          />
        </>
      ) : (
        <>
          <Body>Enter the code sent to {sentTo}.</Body>
          <Field
            label="Sign-in code"
            placeholder="6-digit code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            onSubmit={() => code.trim().length >= 6 && void verify()}
            editable={!busy}
          />
          <Button
            label="Sign in"
            disabled={busy || code.trim().length < 6}
            onPress={() => void verify()}
          />
          <Button
            label="Use a different email"
            tone="secondary"
            disabled={busy}
            onPress={() => {
              setSentTo(null);
              setCode('');
            }}
          />
        </>
      )}
    </Card>
  );
}

function SignedIn() {
  const account = useAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = (task: () => Promise<void>) => () => {
    setError(null);
    task().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <>
      <Card>
        <Row>
          <Heading>{account.email}</Heading>
          <Badge
            label={STATUS_LABEL[account.status]}
            tone={
              account.status === 'synced'
                ? 'accent'
                : account.status === 'idle'
                  ? 'muted'
                  : 'warning'
            }
          />
        </Row>
        {account.lastSyncedAt && (
          <Body muted>Last synced {account.lastSyncedAt.toLocaleTimeString()}</Body>
        )}
        {error && <Banner>{error}</Banner>}
        {account.status === 'conflict' ? (
          <>
            <Body>
              To use {account.email} here, replace this device's progress with that account's. The
              other account's synced progress stays safe on its own account.
            </Body>
            <Button
              label={`Replace with ${account.email}'s progress`}
              onPress={attempt(account.useThisAccountHere)}
            />
          </>
        ) : (
          <Button
            label="Sync now"
            tone="secondary"
            disabled={account.status === 'syncing'}
            onPress={attempt(account.syncNow)}
          />
        )}
        <Button label="Sign out" tone="secondary" onPress={attempt(account.signOut)} />
      </Card>
      <Card>
        <Heading>Delete account</Heading>
        <Body muted>
          Permanently deletes your account and all progress synced to it. Progress on this device
          stays here.
        </Body>
        {confirmDelete ? (
          <>
            <Button
              label="Yes, permanently delete"
              tone="wrong"
              onPress={attempt(account.deleteAccount)}
            />
            <Button
              label="Keep my account"
              tone="secondary"
              onPress={() => setConfirmDelete(false)}
            />
          </>
        ) : (
          <Button
            label="Delete my account…"
            tone="secondary"
            onPress={() => setConfirmDelete(true)}
          />
        )}
      </Card>
    </>
  );
}
