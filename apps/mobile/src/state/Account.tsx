import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readSupabaseConfig } from '../sync/config';
import { friendlyAuthError } from '../sync/credentials';
import { clearOwner, ownershipFor, readOwner, writeOwner } from '../sync/owner';
import { createSupabase, supabaseRemote, type BallKnowledgeClient } from '../sync/supabase';
import { createSerialRunner } from '../sync/runner';
import { syncProgress } from '../sync/sync';
import { useAppState } from './AppState';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'conflict';

interface AccountState {
  /** False when this build has no Supabase settings: the app runs offline. */
  readonly configured: boolean;
  readonly email: string | null;
  readonly status: SyncStatus;
  readonly message: string | null;
  readonly lastSyncedAt: Date | null;
  readonly signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account and signs in (requires "Confirm email" off in Supabase). */
  readonly signUp: (email: string, password: string) => Promise<void>;
  readonly syncNow: () => Promise<void>;
  readonly signOut: () => Promise<void>;
  /** Resolves a conflict: replaces this device's progress with the signed-in account's. */
  readonly useThisAccountHere: () => Promise<void>;
  readonly deleteAccount: () => Promise<void>;
}

const AccountContext = createContext<AccountState | null>(null);

const describe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function AccountProvider({ children }: { children: ReactNode }) {
  const { repository, store, scheduler, reload } = useAppState();
  const client = useMemo<BallKnowledgeClient | null>(() => {
    const config = readSupabaseConfig();
    return config ? createSupabase(config) : null;
  }, []);
  const remote = useMemo(() => (client ? supabaseRemote(client) : null), [client]);

  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const userId = user?.id ?? null;

  // One sync at a time per signed-in user; a request made mid-sync queues exactly
  // one follow-up, so a session that just ended is never left unsynced.
  const runSync = useMemo(() => {
    if (!remote || !userId) return null;
    return createSerialRunner(async () => {
      setStatus('syncing');
      setMessage(null);
      try {
        const ownership = ownershipFor(await readOwner(store), userId);
        if (ownership === 'conflict') {
          setStatus('conflict');
          setMessage(
            'This device has progress from a different account. It was not merged into yours.',
          );
          return;
        }
        if (ownership === 'claim') await writeOwner(store, userId);
        await syncProgress(repository, remote, scheduler);
        setLastSyncedAt(new Date());
        setStatus('synced');
        // States are rebuilt from the merged log on every sync, so refresh.
        reload();
      } catch (e) {
        setStatus('error');
        setMessage(`Sync failed: ${describe(e)}`);
      }
    });
  }, [remote, userId, store, repository, scheduler, reload]);

  // Sync as soon as someone is signed in (app start or a fresh sign-in).
  useEffect(() => {
    if (runSync) void runSync();
  }, [runSync]);

  // Follow the signed-in user (token refreshes keep the same id, so no extra syncs).
  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null;
      setUser(next);
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const value = useMemo<AccountState>(() => {
    const requireClient = () => {
      if (!client) throw new Error('Accounts are not set up in this build.');
      return client;
    };
    return {
      configured: client !== null,
      email: user?.email ?? null,
      status,
      message,
      lastSyncedAt,
      async signIn(email, password) {
        const { error } = await requireClient().auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(friendlyAuthError(error.message));
      },
      async signUp(email, password) {
        const { data, error } = await requireClient().auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(friendlyAuthError(error.message));
        // With "Confirm email" off (docs/supabase-setup.md) a session comes back
        // immediately; without one, Supabase is still waiting on an email.
        if (!data.session) {
          throw new Error(
            'Account created, but Supabase is waiting for email confirmation. Turn off "Confirm email" (see docs/supabase-setup.md), then sign in.',
          );
        }
      },
      syncNow: () => (runSync ? runSync() : Promise.resolve()),
      async signOut() {
        // Progress stays on this device, still owned by this account.
        await requireClient().auth.signOut();
        setStatus('idle');
        setMessage(null);
      },
      async useThisAccountHere() {
        if (!user) return;
        await repository.clearProgress();
        await writeOwner(store, user.id);
        reload();
        if (runSync) await runSync();
      },
      async deleteAccount() {
        const c = requireClient();
        const { error } = await c.rpc('delete_my_account');
        if (error) throw new Error(error.message);
        // Server data is gone; this device keeps its copy, no longer tied to an account.
        await clearOwner(store);
        await c.auth.signOut({ scope: 'local' });
        setStatus('idle');
        setMessage('Your account and its synced data were deleted.');
      },
    };
  }, [client, user, status, message, lastSyncedAt, runSync, repository, store, reload]);

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountState {
  const state = useContext(AccountContext);
  if (!state) throw new Error('useAccount must be used inside <AccountProvider>');
  return state;
}
