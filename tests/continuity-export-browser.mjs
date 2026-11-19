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
      rpc:async(name)=>({data:name==='get_admin_continuity_milestones'?${JSON.stringify(fixture)}:[]})
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
  console.log('Continuity chart, table, CSV and both monthly draft views passed.');
} finally {await browser?.close(); await server.close();}
