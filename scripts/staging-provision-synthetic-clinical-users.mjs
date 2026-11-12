// Staging-only synthetic user provisioning. Requires a real administrator session.
// Run with private REFLINK_STAGING_* environment variables. No service-role keys.
import { createClient } from '@supabase/supabase-js';
const e = process.env;
const required = ['URL','ANON_KEY','ADMIN_EMAIL','ADMIN_PASSWORD',
  'PHC_EMAIL','PHC_PASSWORD','RECEIVING_EMAIL','RECEIVING_PASSWORD',
  'OUTSIDER_EMAIL','OUTSIDER_PASSWORD'].map((name) => 'REFLINK_STAGING_' + name);
const missing = required.filter((name) => !e[name]);
if (missing.length) throw new Error('Missing configuration: ' + missing.join(', '));
const target = new URL(e.REFLINK_STAGING_URL);
if (target.protocol !== 'https:' || target.hostname !== 'rcskuzmvyugbanygizri.supabase.co' ||
    target.username || target.password || target.search || target.hash || target.pathname !== '/')
  throw new Error('Only the exact REFLINK synthetic staging origin is permitted');
const key = e.REFLINK_STAGING_ANON_KEY;
if (key.startsWith('sb_secret_') || key.startsWith('sb_service_'))
  throw new Error('Refusing secret/service-role key');
if (key.split('.').length === 3) {
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
  if (claims.role !== 'anon') throw new Error('Expected anon JWT');
} else if (!key.startsWith('sb_publishable_')) throw new Error('Expected publishable key');
const actors = [
  ['PHC','phc_staff','REFLINK TEST PHC A','primary_health_centre'],
  ['RECEIVING','receiving_staff','REFLINK TEST RECEIVING B','general_hospital'],
  ['OUTSIDER','receiving_staff','REFLINK TEST RECEIVING D','general_hospital'],
];
const emails = [e.REFLINK_STAGING_ADMIN_EMAIL, ...actors.map(([tag]) => e['REFLINK_STAGING_' + tag + '_EMAIL'])];
if (new Set(emails.map((s) => s.trim().toLowerCase())).size !== 4)
  throw new Error('All four actors must have distinct email addresses');
const api = createClient(e.REFLINK_STAGING_URL, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
try {
  const { data: login, error: authError } = await api.auth.signInWithPassword({
    email: e.REFLINK_STAGING_ADMIN_EMAIL, password: e.REFLINK_STAGING_ADMIN_PASSWORD,
  });
  if (authError || !login.user) throw new Error('Administrator sign-in failed');
  const { data: profile, error: profileError } = await api.from('profiles')
    .select('id,role,facility_id').eq('id', login.user.id).single();
  if (profileError || profile?.id !== login.user.id ||
      profile?.role !== 'administrator' || profile.facility_id !== null)
    throw new Error('Authenticated user is not a staging administrator');
  const { data: facilities, error: facilityError } = await api.from('facilities')
    .select('id,name,facility_type,is_active').in('name', actors.map((a) => a[2]));
  if (facilityError || facilities?.length !== 3 ||
      new Set(facilities.map((f) => f.name)).size !== 3)
    throw new Error('Required staging facilities missing or ambiguous');
  const prepared = actors.map(([tag,role,name,type]) => {
    const facility = facilities.find((f) => f.name === name);
    if (!facility || facility.facility_type !== type || facility.is_active !== true)
      throw new Error('Incorrect or inactive staging facility for ' + tag);
    return { tag, role, facilityId: facility.id };
  });
  if (e.REFLINK_STAGING_PROVISION_CONFIRM !== 'YES_STAGING_ONLY') {
    console.log('Preflight passed. No accounts created. Set REFLINK_STAGING_PROVISION_CONFIRM=YES_STAGING_ONLY to create accounts.');
  } else {
    for (const {tag,role,facilityId} of prepared) {
      const { data, error } = await api.functions.invoke('create-user', {
        body: { email: e['REFLINK_STAGING_' + tag + '_EMAIL'].trim().toLowerCase(),
          password: e['REFLINK_STAGING_' + tag + '_PASSWORD'],
          full_name: 'REFLINK Synthetic ' + tag, role, facility_id: facilityId },
      });
      if (error || data?.success !== true || data.user?.role !== role ||
          data.user?.facility_id !== facilityId)
        throw new Error('Provisioning stopped at ' + tag + '; inspect staging before retrying');
      console.log('Created synthetic ' + tag + ' user (credentials not printed)');
    }
  }
} finally {
  await api.auth.signOut();
}
