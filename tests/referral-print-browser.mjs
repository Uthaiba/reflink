// Local synthetic fixture only: no hosted authentication or clinical API access.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import { chromium } from 'playwright';
import { build, createServer } from 'vite';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const referral = {
  referral_number: 'RF-SYNTHETIC-PRINT', patient_identifier: 'SYNTHETIC-PRINT-001',
  patient_age_months: 360, patient_sex: 'other', status: 'discharged', urgency: 'routine',
  referring_facility: { name: 'SYNTHETIC PHC A', lga: 'Test LGA A', state: 'Yobe' }, receiving_facility: { name: 'SYNTHETIC RECEIVING B', lga: 'Test LGA B', state: 'Yobe' },
  chief_complaint: 'SYNTHETIC TEST ONLY — referral workflow verification.',
  clinical_summary: 'Fictional case for testing. No real patient information.',
  physical_findings: 'Synthetic examination entry — not clinical findings.', treatment_given: 'No treatment administered. Software test only.',
  referral_reason: 'Synthetic end-to-end test of receiving-facility acknowledgement and feedback.',
  assessment_findings: 'Synthetic receiving-facility assessment for SYNTHETIC-PRINT-001.', final_diagnosis: 'Simulated ankle sprain for workflow testing.',
  diagnosis_status: 'provisional', diagnosis_category: 'Injury / Trauma', disposition: 'admitted',
  clinical_feedback: 'Test feedback for SYNTHETIC PHC A. Reference E2E-001.',
  admission_at: '2026-11-17T17:55:00Z', ward_unit: 'Synthetic Test Ward B',
  admission_diagnosis: 'Simulated ankle sprain for workflow testing.', clinical_progress: 'Synthetic admission note for E2E-001',
  discharge_diagnosis: 'Simulated ankle sprain for workflow testing.', condition_at_discharge: 'Synthetic case marked stable for discharge workflow testing.',
  discharge_medications: 'None. Synthetic software test.', follow_up_plan: 'Synthetic follow-up with REFLINK TEST PHC A to verify receipt of discharge feedback. Reference E2E-001.',
  created_at: '2026-11-17T15:25:54Z', acknowledged_at: '2026-11-17T16:44:30Z',
  patient_arrived_at: '2026-11-17T17:19:32Z', assessment_completed_at: '2026-11-17T17:55:41Z', discharged_at: '2026-11-17T18:07:04Z',
};
const harness = `<!doctype html><html><body><div id="root"></div><script type="module">
import React from 'react'; import {createRoot} from 'react-dom/client';
import {PrintReferralSheet, NewReferralForm} from '/src/App.jsx';
import '/src/index.css';
createRoot(document.getElementById('root')).render(location.search === '?draft' ? React.createElement(NewReferralForm, {ownerId:'synthetic',referringFacilityId:'test'}) : React.createElement('div', {style:{height:'5000px'}}, 'SCREEN CONTENT MUST NOT PRINT', React.createElement(PrintReferralSheet,{referral:${JSON.stringify(referral)}})));
</script></body></html>`;
await build({logLevel:'warn'});
const server = await createServer({
  define: { 'import.meta.env.VITE_ENCRYPTED_DRAFTS_ENABLED': JSON.stringify('true'), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://synthetic.invalid'), 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-public-client') },
  server: { host: '127.0.0.1', port: 4181, strictPort: true },
  plugins: [{name:'synthetic-print-harness', transform(code, id) {
    if (id.endsWith('/src/App.jsx')) return code + '\nexport { NewReferralForm };';
  }, configureServer(server) {
    // Serve the generated worker and its bundled assets on the form fixture's origin.
    server.middlewares.use((req, res, next) => {
      const path = req.url.split('?')[0];
      if (path !== '/reflink-sw.js' && !/^\/assets\/[\w.-]+\.(js|css)$/.test(path)) return next();
      res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'application/javascript');
      res.end(readFileSync('dist' + path));
    });
    server.middlewares.use('/__synthetic-print', async (_req,res) => { res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__synthetic-print',harness)); });
  }}],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless:true,...(process.env.REFLINK_CHROMIUM_PATH ? {executablePath:process.env.REFLINK_CHROMIUM_PATH} : {})});
  const context = await browser.newContext({timezoneId:'UTC',locale:'en-US'});
  await context.route('**/*',route=>new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4181/__synthetic-print');
  await page.locator('body > .printable-referral-sheet').waitFor({state:'attached'});
  assert.equal(await page.locator('.printable-referral-sheet').isVisible(),false);
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('#root').isVisible(),false,'Screen content must leave the print layout');
  const sheet = page.locator('.printable-referral-sheet');
  for (const expected of ['SYNTHETIC PHC A','SYNTHETIC RECEIVING B','Inpatient Information','Synthetic Test Ward B','Discharge Information',referral.follow_up_plan,'Disposition at Assessment','Patient Discharged']) assert.ok((await sheet.textContent()).includes(expected),expected);
  const logo = sheet.locator('img[src="/reflink-logo.png"]');
  await logo.evaluate(image => image.decode());
  assert.ok(await logo.isVisible());
  const closure=sheet.locator('tr').filter({hasText:'Referral Completed'});
  assert.ok((await closure.textContent()).includes('Not recorded'));
  assert.equal(await sheet.evaluate(el=>getComputedStyle(el).position),'static');
  mkdirSync('test-results',{recursive:true});
  const pdf=await page.pdf({path:'test-results/synthetic-referral.pdf',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<div style="font-size:8px;width:100%;text-align:center">REFLINK · Healthcare Referrals</div>',footerTemplate:'<div style="font-size:8px;width:100%;text-align:center">Synthetic preview — <span class="pageNumber"></span>/<span class="totalPages"></span></div>'});
  const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;
  assert.ok(pages>=1 && pages<=2,`Expected at most two populated pages for this fixture; got ${pages}`);
  const pdfText = execFileSync('pdftotext',['-layout','test-results/synthetic-referral.pdf','-'],{encoding:'utf8'});
  const pageTexts = pdfText.split('\f');
  if (!pageTexts.at(-1).trim()) pageTexts.pop();
  assert.equal(pageTexts.length,pages);
  assert.ok(pageTexts.every(text => /PATIENT INFORMATION|RECEIVING FACILITY UPDATE|DISCHARGE INFORMATION|REFERRAL CONTINUITY/.test(text)), 'Every page must contain clinical sections, not only a footer');
  for (const value of ['SYNTHETIC PHC A','SYNTHETIC RECEIVING B','Synthetic Test Ward B','Discharge Information','Synthetic follow-up','6:07:04 PM','Disposition at Assessment']) assert.ok(pdfText.replace(/\s+/g, " ").toLowerCase().includes(value.toLowerCase()),`Missing PDF content: ${value}`);
  assert.ok(!pdfText.includes('SCREEN CONTENT MUST NOT PRINT'));
  const draftPage = await context.newPage();
  let releaseLogo;
  const logoGate = new Promise(resolve => { releaseLogo = resolve; });
  await draftPage.route('**/reflink-logo.png', async route => {
    await logoGate;
    await route.fulfill({path:'public/reflink-logo.png', contentType:'image/png'});
  });
  await draftPage.goto('http://127.0.0.1:4181/__synthetic-print?draft');
  await draftPage.evaluate(() => {
    window.print = () => {
      const image = document.querySelector('.printable-referral-sheet .official-document-logo');
      window.printedLogoWidth = image?.naturalWidth || 0;
    };
  });
  await draftPage.getByRole('button', {name:/Print Draft/}).click();
  await draftPage.locator('.printable-referral-sheet').waitFor({state:'attached'});
  await draftPage.waitForTimeout(150);
  assert.equal(await draftPage.evaluate(() => window.printedLogoWidth), undefined);
  releaseLogo();
  await draftPage.waitForFunction(() => window.printedLogoWidth > 0);
  await draftPage.emulateMedia({media:'print'});
  assert.ok(await draftPage.locator('.printable-referral-sheet .official-document-logo').isVisible());
  assert.ok((await draftPage.locator('.printable-referral-sheet').textContent()).includes('DRAFT REFERRAL'));
  const offlinePage = await context.newPage();
  await offlinePage.goto('http://127.0.0.1:4181/__synthetic-print?draft');
  await offlinePage.evaluate(async () => {
    await navigator.serviceWorker.register('/reflink-sw.js');
    await navigator.serviceWorker.ready;
  });
  await offlinePage.reload();
  await offlinePage.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await offlinePage.locator('[name="patient_identifier"]').fill('SYNTHETIC-OFFLINE-PRINT');
  await offlinePage.evaluate(() => { window.print = () => { window.draftPrinted = true; }; });
  await context.setOffline(true);
  assert.equal(await offlinePage.evaluate(() => navigator.onLine), false);
  await offlinePage.getByRole('button', {name:/Print Draft/}).click();
  await offlinePage.waitForFunction(() => window.draftPrinted);
  await offlinePage.emulateMedia({media:'print'});
  const offlineLogo = offlinePage.locator('.printable-referral-sheet .official-document-logo');
  assert.ok(await offlineLogo.isVisible());
  assert.ok(await offlineLogo.evaluate(image => image.naturalWidth > 0));
  const offlinePdf = 'test-results/offline-phc-draft.pdf';
  await offlinePage.pdf({path:offlinePdf, preferCSSPageSize:true, printBackground:false});
  const offlineText = execFileSync('pdftotext',[offlinePdf,'-'],{encoding:'utf8'});
  assert.ok(offlineText.includes('SYNTHETIC-OFFLINE-PRINT'));
  assert.ok(offlineText.includes('DRAFT REFERRAL'));
  assert.match(execFileSync('pdfimages',['-list',offlinePdf],{encoding:'utf8'}), /\bimage\b/);
  const profileDir = mkdtempSync(join(tmpdir(), 'reflink-draft-test-'));
  const secret = randomUUID();
  const storageKey = 'reflink-encrypted-draft-v1:synthetic';
  const openProfile = () => chromium.launchPersistentContext(profileDir, {
    headless:true, ...(process.env.REFLINK_CHROMIUM_PATH ? {executablePath:process.env.REFLINK_CHROMIUM_PATH} : {})
  });
  let profile;
  try {
    profile = await openProfile();
    const first = await profile.newPage();
    await first.goto('http://127.0.0.1:4181/__synthetic-print?draft');
    await first.locator('[name="patient_identifier"]').fill('SYNTHETIC-RESTART');
    await profile.setOffline(true);
    await first.locator('#draft-passphrase').fill(secret);
    await first.getByRole('button', {name:'Save encrypted draft'}).click();
    await first.getByText(/Encrypted draft saved on this device/).waitFor();
    const readEnvelope = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
    const original = await readEnvelope(first);
    assert.ok(original.draftId);
    assert.ok(!JSON.stringify(original).includes('SYNTHETIC-RESTART'));
    await profile.close();
    profile = await openProfile();
    const second = await profile.newPage();
    await second.goto('http://127.0.0.1:4181/__synthetic-print?draft');
    await second.locator('#draft-passphrase').fill(secret);
    second.once('dialog', dialog => dialog.accept());
    await second.getByRole('button', {name:'Restore draft'}).click();
    await second.getByText(/Draft restored\. Review/).waitFor();
    assert.equal(await second.locator('[name="patient_identifier"]').inputValue(), 'SYNTHETIC-RESTART');
    await second.locator('#draft-passphrase').fill(secret);
    await second.getByRole('button', {name:'Save encrypted draft'}).click();
    await second.getByText(/Encrypted draft saved on this device/).waitFor();
    assert.equal((await readEnvelope(second)).draftId, original.draftId);
  } finally {
    await profile?.close();
    rmSync(profileDir, {recursive:true, force:true});
  }
  assert.deepEqual(errors,[]);
  writeFileSync('test-results/referral-print-result.json',JSON.stringify({pages,checks:'portal isolation, facilities, admission, discharge, timestamps and closure semantics passed'},null,2));
  console.log(`synthetic_referral_print: passed (${pages} pages)`);
} finally { await browser?.close(); await server.close(); }
