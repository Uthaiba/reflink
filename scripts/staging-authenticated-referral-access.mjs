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
  if (profileError || !profile || profile.role !== role) {
    throw new Error(`${name}: profile or role mismatch`);
  }
  actors[name] = { api, profile };
}
const { PHC, RECEIVING, OUTSIDER, ADMIN } = actors;
if (!PHC.profile.facility_id || !RECEIVING.profile.facility_id ||
    !OUTSIDER.profile.facility_id ||
    RECEIVING.profile.facility_id === OUTSIDER.profile.facility_id) {
  throw new Error('Fixtures require separate receiving and outsider facilities');
}
const referralId = env.REFLINK_STAGING_REFERRAL_ID;
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
const { error: outsiderError } = await OUTSIDER.api.rpc('get_referral_analytics_summary');
if (!outsiderError) throw new Error('SECURITY FAILURE: outsider analytics RPC succeeded');
console.log('PASS: real Auth sign-in, profile roles, referral visibility, facility isolation and analytics authorization');
for (const actor of Object.values(actors)) await actor.api.auth.signOut();
