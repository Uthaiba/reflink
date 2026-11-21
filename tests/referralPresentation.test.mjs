import test from 'node:test';
import assert from 'node:assert/strict';
import { referralJourney, filterReceivingReferrals } from '../src/lib/referralPresentation.js';

test('discharge does not invent formal closure and both events survive later closure', () => {
  const referral = { status: 'discharged', discharged_at: '2026-11-17T18:07:04Z' };
  let steps = referralJourney(referral);
  assert.equal(steps.find(s => s.key === 'discharged').timestamp, referral.discharged_at);
  assert.equal(steps.find(s => s.key === 'completed').timestamp, undefined);
  steps = referralJourney({ ...referral, completed_at: '2026-11-18T10:00:00Z' });
  assert.equal(steps.find(s => s.key === 'completed').timestamp, '2026-11-18T10:00:00Z');
  assert.equal(steps.find(s => s.key === 'discharged').timestamp, referral.discharged_at);
});

test('receiving views retain access to discharged and completed records', () => {
  const rows = ['sent','admitted','discharged','completed'].map(status => ({status}));
  assert.deepEqual(filterReceivingReferrals(rows).map(r => r.status), ['sent','admitted']);
  assert.deepEqual(filterReceivingReferrals(rows, 'closed').map(r => r.status), ['discharged','completed']);
  assert.deepEqual(filterReceivingReferrals(rows, 'all'), rows);
});
