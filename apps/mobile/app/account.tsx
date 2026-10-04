import { useState } from 'react';
import { useAccount } from '../src/state/Account';
import { Badge, Banner, Body, Card, Heading, Row, Screen, Title } from '../src/ui/components';
import { credentialsProblem, MIN_PASSWORD_LENGTH, type AuthMode } from '../src/sync/credentials';
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
  const { signIn, signUp } = useAccount();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const creating = mode === 'sign_up';
  const submit = async () => {
    const problem = credentialsProblem(email, password, mode);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await (creating ? signUp(email, password) : signIn(email, password));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <Heading>{creating ? 'Create your account' : 'Sign in to sync'}</Heading>
      <Body muted>
        Keep your progress safe and use it on every device. Anything you've already learned on this
        device comes with you.
      </Body>
      {error && <Banner>{error}</Banner>}
      <Field
        label="Email address"
        placeholder="you@example.com"
        keyboardType="email-address"
        autoComplete="email"
        value={email}
        onChangeText={setEmail}
        onSubmit={() => void submit()}
        editable={!busy}
      />
      <Field
        label="Password"
        placeholder={creating ? `At least ${MIN_PASSWORD_LENGTH} characters` : 'Password'}
        secureTextEntry
        autoFocus={false}
        autoComplete={creating ? 'new-password' : 'current-password'}
        value={password}
        onChangeText={setPassword}
        onSubmit={() => void submit()}
        editable={!busy}
      />
      <Button
        label={busy ? 'One moment…' : creating ? 'Create account' : 'Sign in'}
        disabled={busy}
        onPress={() => void submit()}
      />
      <Button
        label={creating ? 'I already have an account' : 'New here? Create an account'}
        tone="secondary"
        disabled={busy}
        onPress={() => {
          setMode(creating ? 'sign_in' : 'sign_up');
          setError(null);
        }}
      />
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
