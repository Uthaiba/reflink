// REFLINK staging-only authenticated clinical access smoke test.
// Usage: supply all REFLINK_STAGING_* environment variables in a private shell.
// Requires real Auth accounts and a synthetic referral fixture created through
// the approved staging workflow. Does not create, update or delete any records.
// Never use production URL/keys, service_role keys or real patient records.
import { createClient } from '@supabase/supabase-js';

const required = [
  'REFLINK_STAGING_URL', 'REFLINK_STAGING_ANON_KEY',
  'REFLINK_STAGING_PHC_EMAIL', 'REFLINK_STAGING_PHC_PASSWORD',
  'REFLINK_STAGING_RECEIVING_EMAIL', 'REFLINK_STAGING_RECEIVING_PASSWORD',
  'REFLINK_STAGING_OUTSIDER_EMAIL', 'REFLINK_STAGING_OUTSIDER_PASSWORD',
  'REFLINK_STAGING_ADMIN_EMAIL', 'REFLINK_STAGING_ADMIN_PASSWORD',
  'REFLINK_STAGING_REFERRAL_ID',
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error('Missing staging test configuration:', missing.join(', '));
  process.exit(2);
}
const env = process.env;
const url = new URL(env.REFLINK_STAGING_URL);
if (url.hostname !== 'rcskuzmvyugbanygizri.supabase.co') {
  throw new Error('Refusing non-synthetic-staging Supabase project');
}
// Never allow a service-role or secret key into a user-facing acceptance runner.
const suppliedKey = env.REFLINK_STAGING_ANON_KEY;
if (suppliedKey.startsWith('sb_secret_') || suppliedKey.startsWith('sb_service_')) {
  throw new Error('Refusing Supabase secret/service-role key');
}
if (suppliedKey.split('.').length === 3) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(suppliedKey.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid JWT-shaped Supabase key');
  }
  if (claims.role !== 'anon') throw new Error('Only anon JWT keys are permitted');
} else if (!suppliedKey.startsWith('sb_publishable_')) {
  throw new Error('Expected staging publishable or anon key');
}
if (!/^[0-9a-f-]{36}$/i.test(env.REFLINK_STAGING_REFERRAL_ID)) {
  throw new Error('Expected UUID referral fixture ID');
}
const client = () => createClient(env.REFLINK_STAGING_URL, env.REFLINK_STAGING_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const actors = {};
for (const [name, role] of [
  ['PHC', 'phc_staff'], ['RECEIVING', 'receiving_staff'],
  ['OUTSIDER', 'receiving_staff'], ['ADMIN', 'administrator'],
]) {
  const api = client();
  const { data: login, error: authError } = await api.auth.signInWithPassword({
    email: env[`REFLINK_STAGING_${name}_EMAIL`],
    password: env[`REFLINK_STAGING_${name}_PASSWORD`],
  });
  if (authError || !login.user) throw new Error(`${name}: authentication failed`);
  const { data: profile, error: profileError } = await api.from('profiles')
    .select('id,role,facility_id').eq('id', login.user.id).single();
  if (profileError || !profile || profile.id !== login.user.id || profile.role !== role) {
    throw new Error(`${name}: profile or role mismatch`);
  }
  actors[name] = { api, profile };
}
const { PHC, RECEIVING, OUTSIDER, ADMIN } = actors;
if (new Set(Object.values(actors).map(({ profile }) => profile.id)).size !== 4) {
  throw new Error('All clinical test actors must use distinct Auth identities');
}
if (ADMIN.profile.facility_id !== null) {
  throw new Error('Administrator test actor must be platform-wide, not facility-assigned');
}
if (!PHC.profile.facility_id || !RECEIVING.profile.facility_id ||
    !OUTSIDER.profile.facility_id ||
    RECEIVING.profile.facility_id === OUTSIDER.profile.facility_id) {
  throw new Error('Fixtures require separate receiving and outsider facilities');
}
// Validate the facility assignment and status before any referral assertions.
// A mismatched PHC profile could otherwise produce a misleading green test.
const facilityIds = [...new Set([
  PHC.profile.facility_id, RECEIVING.profile.facility_id,
  OUTSIDER.profile.facility_id,
])];
const { data: facilities, error: facilityError } = await ADMIN.api.from('facilities')
  .select('id,facility_type,is_active').in('id', facilityIds);
if (facilityError || !facilities || facilities.length !== facilityIds.length) {
  throw new Error('Unable to validate all clinical fixture facilities');
}
const byId = new Map(facilities.map((facility) => [facility.id, facility]));
if (facilityIds.some((id) => byId.get(id)?.is_active !== true)) {
  throw new Error('Clinical fixture includes an inactive facility');
}
if (byId.get(PHC.profile.facility_id)?.facility_type !== 'primary_health_centre') {
  throw new Error('PHC staff fixture must belong to a primary health centre');
}
if (byId.get(RECEIVING.profile.facility_id)?.facility_type !== 'general_hospital') {
  throw new Error('Receiving staff fixture must belong to a general hospital');
}
if (byId.get(OUTSIDER.profile.facility_id)?.facility_type !== 'general_hospital') {
  throw new Error('Unrelated receiving staff must belong to a separate general hospital');
}
const referralId = env.REFLINK_STAGING_REFERRAL_ID;
// Never run access assertions against a real patient referral, even in staging.
// Validate the fixture through the admin session before testing other roles.
const { data: fixture, error: fixtureError } = await ADMIN.api.from('referrals')
  .select('id,is_test,referring_user_id,referring_facility_id,receiving_facility_id')
  .eq('id', referralId).maybeSingle();
if (fixtureError || !fixture || fixture.is_test !== true ||
    fixture.referring_user_id !== PHC.profile.id ||
    fixture.referring_facility_id !== PHC.profile.facility_id ||
    fixture.receiving_facility_id !== RECEIVING.profile.facility_id) {
  throw new Error('Refusing missing, non-synthetic, or misassigned referral fixture');
}
const fetchReferral = async (name) => {
  const { data, error } = await actors[name].api.from('referrals')
    .select('id,referring_user_id,receiving_facility_id')
    .eq('id', referralId).maybeSingle();
  if (error) throw new Error(`${name}: referral SELECT failed: ${error.code}`);
  return data;
};
const senderView = await fetchReferral('PHC');
if (!senderView || senderView.referring_user_id !== PHC.profile.id ||
    senderView.receiving_facility_id !== RECEIVING.profile.facility_id) {
  throw new Error('Synthetic referral fixture does not match PHC/receiving accounts');
}
for (const name of ['RECEIVING', 'ADMIN']) {
  if (!(await fetchReferral(name))) throw new Error(`${name}: expected referral not visible`);
}
if (await fetchReferral('OUTSIDER')) {
  throw new Error('SECURITY FAILURE: unrelated facility can read referral');
}
const { error: adminError } = await ADMIN.api.rpc('get_referral_analytics_summary');
if (adminError) throw new Error('Administrator analytics RPC rejected');
for (const name of ['PHC', 'RECEIVING', 'OUTSIDER']) {
  const { error } = await actors[name].api.rpc('get_referral_analytics_summary');
  if (!error) throw new Error(`SECURITY FAILURE: ${name} analytics RPC succeeded`);
}
console.log('PASS: real Auth sign-in, profile roles, referral visibility, facility isolation and analytics authorization');
for (const actor of Object.values(actors)) await actor.api.auth.signOut();
