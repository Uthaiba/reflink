// Creates one clearly labeled synthetic referral through the PHC user's RLS path.
// Never run against production. Requires real staging Auth credentials.
// Default: preflight only. Explicit REFLINK_STAGING_FIXTURE_CONFIRM=YES_STAGING_ONLY
// permits one synthetic INSERT; no updates, deletes, attachments or SMS.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const env = process.env;
const required = ['URL', 'ANON_KEY', 'PHC_EMAIL', 'PHC_PASSWORD',
  'RECEIVING_EMAIL', 'RECEIVING_PASSWORD'].map((k) => 'REFLINK_STAGING_' + k);
const missing = required.filter((k) => !env[k]);
if (missing.length) throw new Error('Missing staging configuration: ' + missing.join(', '));
const target = new URL(env.REFLINK_STAGING_URL);
if (target.username || target.password || target.search || target.hash || target.pathname !== '/')
  throw new Error('Staging URL must be the exact project origin');
if (target.protocol !== 'https:' || target.hostname !== 'rcskuzmvyugbanygizri.supabase.co')
  throw new Error('Refusing any project other than REFLINK synthetic staging');
const key = env.REFLINK_STAGING_ANON_KEY;
if (key.startsWith('sb_secret_') || key.startsWith('sb_service_'))
  throw new Error('Secret and service-role keys prohibited');
if (key.split('.').length === 3) {
  let claims;
  try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new Error('Invalid anon JWT'); }
  if (claims.role !== 'anon') throw new Error('Only anon JWT permitted');
} else if (!key.startsWith('sb_publishable_')) {
  throw new Error('Expected publishable or anon key');
}
if (env.REFLINK_STAGING_PHC_EMAIL.trim().toLowerCase() ===
    env.REFLINK_STAGING_RECEIVING_EMAIL.trim().toLowerCase())
  throw new Error('PHC and receiving actors must be distinct');
const makeClient = () => createClient(env.REFLINK_STAGING_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const phc = makeClient();
const receiving = makeClient();
try {
  async function authenticate(api, tag, expectedRole, expectedFacilityType) {
    const { data: login, error: loginError } = await api.auth.signInWithPassword({
      email: env['REFLINK_STAGING_' + tag + '_EMAIL'],
      password: env['REFLINK_STAGING_' + tag + '_PASSWORD'],
    });
    if (loginError || !login.user) throw new Error(tag + ': staging Auth sign-in failed');
    const { data: profile, error: profileError } = await api.from('profiles')
      .select('id,role,facility_id').eq('id', login.user.id).single();
    if (profileError || !profile || profile.role !== expectedRole ||
        profile.id !== login.user.id || !profile.facility_id)
      throw new Error(tag + ': profile mismatch');
    const { data: facility, error: facilityError } = await api.from('facilities')
      .select('id,name,facility_type,is_active').eq('id', profile.facility_id).single();
    if (facilityError || !facility || facility.is_active !== true ||
        facility.facility_type !== expectedFacilityType)
      throw new Error(tag + ': facility mismatch');
    return { profile, facility };
  }
  const sender = await authenticate(phc, 'PHC', 'phc_staff', 'primary_health_centre');
  const recipient = await authenticate(receiving, 'RECEIVING', 'receiving_staff', 'general_hospital');
  if (sender.facility.name !== 'REFLINK TEST PHC A' ||
      recipient.facility.name !== 'REFLINK TEST RECEIVING B' ||
      sender.facility.id === recipient.facility.id)
    throw new Error('Unexpected staging fixture facility assignment');
  const { data: existing, error: existingError } = await phc.from('referrals')
    .select('id').eq('is_test', true)
    .eq('referring_user_id', sender.profile.id)
    .eq('receiving_facility_id', recipient.profile.facility_id).limit(2);
  if (existingError) throw new Error('Cannot inspect existing synthetic referrals');
  if (existing?.length) {
    if (existing.length !== 1) throw new Error('Multiple synthetic fixtures found; manual review required');
    console.log('Existing synthetic referral fixture found. ID: ' + existing[0].id);
    console.log('No new referral inserted. Review existing fixture before acceptance.');
  } else if (env.REFLINK_STAGING_FIXTURE_CONFIRM !== 'YES_STAGING_ONLY') {
    console.log('Preflight passed; no referral inserted. Set REFLINK_STAGING_FIXTURE_CONFIRM=YES_STAGING_ONLY to insert one synthetic fixture.');
  } else {
    const nonce = randomUUID();
    const payload = {
      referral_number: 'RF-TEST-' + nonce.slice(0, 8).toUpperCase(),
      patient_identifier: 'SYNTHETIC-TEST-' + nonce.slice(0, 8).toUpperCase(),
      patient_age_months: 360,
      patient_sex: 'other',
      chief_complaint: 'SYNTHETIC TEST ONLY - NOT A PATIENT',
      clinical_summary: 'Synthetic staging authorization fixture. No real clinical information.',
      referral_reason: 'Automated access-control acceptance testing',
      urgency: 'routine',
      status: 'sent',
      referring_facility_id: sender.profile.facility_id,
      receiving_facility_id: recipient.profile.facility_id,
      referring_user_id: sender.profile.id,
      offline_client_id: nonce,
      sync_source: 'online',
      diagnosis_records: [],
      investigation_categories: [],
      investigation_records: [],
      is_test: true,
    };
    const { data: inserted, error: insertError } = await phc.from('referrals')
      .insert(payload).select('id,is_test,referring_user_id,receiving_facility_id').single();
    if (insertError || !inserted || inserted.is_test !== true ||
        inserted.referring_user_id !== sender.profile.id ||
        inserted.receiving_facility_id !== recipient.profile.facility_id)
      throw new Error('Synthetic referral creation failed; inspect staging before retry');
    console.log('Created synthetic staging referral. Set REFLINK_STAGING_REFERRAL_ID=' + inserted.id + ' for authenticated acceptance.');
  }
} finally {
  await Promise.allSettled([phc.auth.signOut(), receiving.auth.signOut()]);
}
