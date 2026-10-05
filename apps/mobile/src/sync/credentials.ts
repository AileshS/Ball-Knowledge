/** Minimum password length the app asks for (Supabase's own minimum is lower). */
export const MIN_PASSWORD_LENGTH = 8;

export type AuthMode = 'sign_in' | 'sign_up';

/** A problem with what was typed, before anything is sent; null when it's fine. */
export function credentialsProblem(email: string, password: string, mode: AuthMode): string | null {
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) return 'Enter a valid email address.';
  if (password.length === 0) return 'Enter your password.';
  if (mode === 'sign_up' && password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  return null;
}

/** Turns Supabase auth errors into plain, actionable messages. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (m.includes('email not confirmed')) {
    return 'This account still needs email confirmation. Turn off "Confirm email" in Supabase (see docs/supabase-setup.md).';
  }
  if (m.includes('password') && (m.includes('at least') || m.includes('weak'))) {
    return `That password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }
  if (m.includes('fetch') || m.includes('network')) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return message;
}
