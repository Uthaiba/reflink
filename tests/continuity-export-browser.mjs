import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createServer} from 'vite';

const fixture = [
  {milestone:'Hospital feedback sent', referral_count:5, small_cell_suppressed:false},
  {milestone:'PHC follow-up performed', referral_count:3, small_cell_suppressed:true},
];
const harness = `<div id="root"></div><script type="module">
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import Report from '/src/components/dashboards/PublicHealthIntelligence.jsx';
    createRoot(document.querySelector('#root')).render(React.createElement(Report));
  </script>`;
const server = await createServer({envFile:false, server:{host:'127.0.0.1',port:0},
  plugins:[{name:'local-report-fixture',enforce:'pre',configureServer(vite) {
    vite.middlewares.use('/fixture', async (_, res) => {
      res.setHeader('Content-Type','text/html');
      res.end(await vite.transformIndexHtml('/fixture',harness));
    });
  },transform(_,id){
    if(id.endsWith('/src/lib/supabase.js')) return `export const supabase={
      auth:{getUser:async()=>({data:{user:{id:'fixture'}}})},
      from:()=>({select:()=>({eq:()=>({single:async()=>({data:{role:'administrator'}})})})}),
      rpc:async(name)=>globalThis.failContinuity && name==='get_admin_continuity_milestones'
        ? {error:{message:'Synthetic connection interruption'}}
        : ({data:name==='get_admin_continuity_milestones'?(globalThis.continuityRows ?? ${JSON.stringify(fixture)}):[]})
    }`;
  }}]});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined});
  const page = await browser.newPage();
  const origin = server.resolvedUrls.local[0];
  await page.goto(origin+'fixture');
  await page.locator('#rphi-month').fill('2026-11');
  await page.getByRole('button',{name:'Generate report'}).click();
  await page.locator('#rphi-dataset').selectOption('continuity');
  const bars=page.locator('.aggregate-bars li');
  assert.deepEqual(await bars.locator('strong').allTextContents(),['5','Withheld / unavailable']);
  assert.equal(await bars.nth(1).locator('.aggregate-bar-track > span').count(),0);
  assert.deepEqual(await page.locator('tbody tr td:last-child').allTextContents(),['5','Suppressed / unavailable']);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download Continuity.*CSV/}).click();
  const csv=await readFile(await (await download).path(),'utf8');
  assert.deepEqual(csv.split('\r\n').slice(-2),['"Hospital feedback sent","5"','"PHC follow-up performed","Suppressed / unavailable"']);
  await page.getByText('Read the traceable draft', {exact:true}).click();
  const draft = await page.locator('.aggregate-draft pre').innerText();
  assert.ok(draft.includes('Hospital feedback sent: referral count = 5. [get_admin_continuity_milestones; row 1; field referral_count]'));
  assert.ok(!draft.includes('PHC follow-up performed'));
  assert.ok(draft.includes('1 count cells withheld or unavailable.'));
  const draftDownload = page.waitForEvent('download');
  await page.getByRole('button', {name:'Download draft for review'}).click();
  const downloadedDraft = await readFile(await (await draftDownload).path(), 'utf8');
  assert.equal(downloadedDraft, draft);
  await page.locator('#rphi-month').fill('2026-12');
  const exports = page.getByRole('button',{name:/^Download/});
  assert.equal(await exports.count(),0);
  await page.evaluate(()=>{globalThis.failContinuity=true;});
  await page.getByRole('button',{name:'Generate report'}).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await exports.count(),0);
  assert.equal(await page.locator('.aggregate-bars, .rphi-table').count(),0);
  await page.evaluate(()=>{globalThis.failContinuity=false;});
  await page.getByRole('button',{name:'Generate report'}).click();
  await page.getByRole('button',{name:'Download draft for review'}).waitFor();
  assert.ok((await page.locator('.aggregate-draft pre').textContent()).includes('2026-12-01 to 2026-12-31'));
  assert.equal(await page.getByRole('alert').count(),0);
  // Match the three outputs from the November staging calculation check.
  for (const counts of [[7, 5], [null, null], [0, 0]]) {
    const rows = fixture.map(({milestone}, index) => ({
      milestone, referral_count: counts[index], small_cell_suppressed: counts[index] === null,
    }));
    await page.reload();
    await page.evaluate(rows => { globalThis.continuityRows = rows; }, rows);
    await page.locator('#rphi-month').fill('2026-11');
    await page.getByRole('button', {name:'Generate report'}).click();
    await page.locator('#rphi-dataset').selectOption('continuity');
    await bars.first().waitFor();
    const cells = counts.map(n => n === null ? 'Suppressed / unavailable' : String(n));
    assert.deepEqual(await page.locator('tbody tr td:last-child').allTextContents(), cells);
    assert.deepEqual(await bars.locator('strong').allTextContents(),
      counts.map(n => n === null ? 'Withheld / unavailable' : String(n)));
    const pendingCsv = page.waitForEvent('download');
    await page.getByRole('button', {name:/Download Continuity.*CSV/}).click();
    const text = await readFile(await (await pendingCsv).path(), 'utf8');
    assert.deepEqual(text.split('\r\n').slice(-2), rows.map((row, i) => `"${row.milestone}","${cells[i]}"`));
    await page.getByText('Read the traceable draft', {exact:true}).click();
    const narrative = await page.locator('.aggregate-draft pre').innerText();
    for (const [i, row] of rows.entries()) {
      if (counts[i] === null) assert.ok(!narrative.includes(row.milestone));
      else assert.ok(narrative.includes(`${row.milestone}: referral count = ${counts[i]}. [get_admin_continuity_milestones; row ${i+1}; field referral_count]`));
    }
    const pendingDraft = page.waitForEvent('download');
    await page.getByRole('button', {name:'Download draft for review'}).click();
    assert.equal(await readFile(await (await pendingDraft).path(), 'utf8'), narrative);
  }
  console.log('Continuity chart, table, CSV and both monthly draft views passed.');
} finally {await browser?.close(); await server.close();}
