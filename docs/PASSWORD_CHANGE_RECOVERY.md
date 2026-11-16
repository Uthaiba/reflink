# Password change recovery contract

Status: repository implementation; no hosted Auth, function or database change.
Browser and authenticated staging end-to-end tests remain required.

## Capability selection

The frontend calls `resolvePasswordChangeMode(VITE_SUPABASE_URL,
VITE_PASSWORD_CHANGE_MODE)`. An explicit mode must be `auth` or `edge`.
Without an override, the two environments verified by the 16 November audit use:

| API host | Mode | Existing capability |
| --- | --- | --- |
| uwwzbljufqbzkjflpnll.supabase.co | auth | Auth update plus checked own-profile update |
| rcskuzmvyugbanygizri.supabase.co | edge | Existing change-password Edge Function |

Unknown hosts require an explicit mode. This is deployment capability selection,
not an authorization policy. Do not change a build target or override its mode
without verifying the corresponding backend, CORS, profile rules and session
requirements. No service-role key belongs in the frontend.

There is no runtime fallback from the server function to Auth, or the reverse.
A timed-out response can hide a successful mutation.

## Flow and result contract

The service obtains the signed-in user and reads that user's profile before any
write. It never uses a React profile ID or a request-supplied ID to select an
account. It checks a successful result against the current signed-in identity
and re-reads the profile flag before returning confirmation.

- `not_started`: preflight/configuration failed; no password mutation attempted.
- `unknown`: a password mutation was attempted but not confirmed. No automatic
  retry, flag write or fallback password operation follows an ambiguous write.
- `account_pending`: password change is confirmed, but account-state confirmation
  failed. The password must not be changed again merely to retry flag completion.
- `confirmed`: password operation succeeded and the authenticated account's flag
  was observed false. This is not proof of complete role/RLS authorization.

The server function's `password_changed: true` body is recovered from a non-2xx
Functions response when available. Raw backend messages and password payloads
are not logged or shown.

The UI clears password fields after attempts, locks resubmission after unknown,
pending or confirmed outcomes, and supplies sign-out/recovery guidance. Its
in-flight guard prevents duplicate submissions before React rerenders. The Back
action cannot open the dashboard during a required password change. Recovery
events clear the stale UI role/profile, so a reset link does not depend on a
previously loaded profile.

## Remaining release checks

- Synthetic first login with temporary credentials, including administrator access.
- Password recovery in a new browser with no preloaded profile.
- Expired/revoked sessions and account switching during a request.
- Staging server success, explicit partial response and network timeout.
- Real profile RLS failure/zero-row results and recovery guidance.
- Sign-out and subsequent sign-in with the new password.
- Ensure the privileged endpoint preserves approved MFA/reauthentication policy.
- Server-side enforcement of any forced-password workflow: hiding a dashboard
  is not sufficient authorization.
- Confirm production capabilities independently before any production release.

Unit tests mock these protocol outcomes. They do not establish live delivery,
Auth settings, browser behavior or complete protection of forced-password access.

## API references

- https://supabase.com/docs/reference/javascript/auth-updateuser
- https://supabase.com/docs/reference/javascript/functions-invoke
