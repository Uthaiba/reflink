// Synthetic-only browser checks. No hosted API, account or patient records.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { createServer, preview } from "vite";

execFileSync("npm", ["run", "build"], { stdio: "pipe", env: { ...process.env,
  VITE_SUPABASE_URL: "https://reflink-synthetic.invalid", VITE_SUPABASE_ANON_KEY: "synthetic-public-client",
  VITE_PWA_ENABLED: "true",
} });
const production = await preview({ preview: { host: "127.0.0.1", port: 4179, strictPort: true } });
const harness = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import AggregateChart from '/src/components/dashboards/AggregateChart.jsx';
import '/src/aggregate-reporting.css';
const dataset = {title:'Synthetic facility activity', columns:['facility_label','referral_count','completed_count'],rows:[{facility_label:'Synthetic facility A',referral_count:12,completed_count:8},{facility_label:'Synthetic facility B',referral_count:null,completed_count:null}]};
createRoot(document.getElementById('root')).render(React.createElement(AggregateChart,{dataset}));
</script></body></html>`;
const mobileHarness = harness.slice(0, harness.indexOf("import AggregateChart")) + `
import HospitalFeedback from '/src/components/HospitalFeedback.jsx';
import PhcFollowUp from '/src/components/PhcFollowUp.jsx';
import '/src/index.css';
import '/src/App.css';
import '/src/reflink-theme-professional.css';
import '/src/reflink-clinical-accessibility.css';
createRoot(document.getElementById('root')).render(React.createElement('main', {},
  React.createElement(HospitalFeedback, {referral:{id:'synthetic',status:'discharged'},onComplete:()=>{}}),
  React.createElement(PhcFollowUp, {referralId:'synthetic'})));
</script></body></html>`;
const development = await createServer({ define: {
  'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://reflink-synthetic.invalid'),
  'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('synthetic-public-client'),
}, server: { host: "127.0.0.1", port: 4180, strictPort: true }, plugins: [{ name: "synthetic-browser-harness", configureServer(server) {
  server.middlewares.use("/__mobile-continuity", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__mobile-continuity", mobileHarness));
  });
  server.middlewares.use("/__synthetic-chart", async (_request, response) => {
    response.setHeader("Content-Type", "text/html");
    response.end(await server.transformIndexHtml("/__synthetic-chart", harness));
  });
} }] });
let browser;
try {
  await development.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.REFLINK_CHROMIUM_PATH ? { executablePath: process.env.REFLINK_CHROMIUM_PATH } : {}) });
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4179/");
  await page.waitForFunction(() => document.getElementById("root")?.textContent.includes("REFLINK"));
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller != null);
  const cachedPaths = await page.evaluate(async () => {
    const keys = [];
    for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) keys.push(new URL(request.url).pathname);
    return keys;
  });
  assert.ok(cachedPaths.includes("/index.html"));
  assert.ok(cachedPaths.every((path) => path === "/index.html" || path === "/manifest.webmanifest" || path === "/reflink-icon.svg" || /^\/assets\/[^/]+\.(js|css)$/.test(path)));
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.getElementById("root")?.textContent.includes("REFLINK"));
  assert.ok((await page.locator("body").textContent()).includes("Connection unavailable"));
  console.log("browser_offline_static_shell_and_cache_boundary: passed");
  await context.setOffline(false);
  await page.goto("http://127.0.0.1:4180/__synthetic-chart");
  await page.getByRole("heading", { name: "Synthetic facility activity visualization" }).waitFor();
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Chart overflow at ${width}px`);
    assert.ok((await page.locator(".aggregate-bars").textContent()).includes("Withheld / unavailable"));
  }
  await page.getByLabel("Count indicator").focus();
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.getByLabel("Count indicator").inputValue(), "completed_count");
  assert.ok((await page.locator(".aggregate-bars").textContent()).includes("8"));
  console.log("browser_aggregate_chart_keyboard_suppression_and_responsive_layout: passed");
  await page.route("https://reflink-synthetic.invalid/**", route => route.fulfill({json: []}));
  await page.goto("http://127.0.0.1:4180/__mobile-continuity");
  await page.getByRole("button", {name: /send final feedback/i}).waitFor();
  await page.getByRole("button", {name: /save follow-up entry/i}).waitFor();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({width, height: 844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Continuity form overflow at ${width}px`);
    assert.ok(await page.locator(".continuity-panel fieldset label").evaluateAll(labels =>
      labels.length > 0 && labels.every(label => getComputedStyle(label).display === "grid")));
  }
  console.log("browser_continuity_form_responsive_layout: passed");

  const user = { id: "00000000-0000-4000-8000-000000000001", email: "phc@example.invalid" };
  const profile = { id: user.id, role: "phc_staff", full_name: "Synthetic tester", facility_id: "test-facility", must_change_password: false };
  const marker = "SYNTHETIC-SIGNOUT-CASE";
  const referral = { id: "test-referral", referral_number: marker, patient_identifier: marker, status: "discharged", urgency: "routine" };
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = () => [encode({alg:"HS256",typ:"JWT"}), encode({sub:user.id, exp:Math.floor(Date.now()/1000)+3600}), "dGVzdA"].join(".");
  let addendum;
  let authorId;
  let logoutReceived = false;
  await page.unroute("https://reflink-synthetic.invalid/**");
  await context.route("https://reflink-synthetic.invalid/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/auth/v1/logout") {
      logoutReceived = true;
      return route.fulfill({status:204});
    }
    if (path === "/rest/v1/rpc/phc_follow_up_history") {
      const fields = route.request().postDataJSON();
      return route.fulfill({json: fields.p_operation ? [{kind:fields.p_kind, encounter_at:fields.p_encounter, outcome:fields.p_outcome}] : []});
    }
    if (path === "/rest/v1/rpc/closed_record_addenda") {
      const fields = route.request().postDataJSON();
      assert.equal(fields.p_referral, referral.id);
      if (fields.p_action === "request") {
        authorId = user.id;
        addendum = {id:fields.p_request, amendment:fields.p_amendment, reason:fields.p_reason,
          requested_at:"2025-01-03T12:00:00Z", status:"pending"};
      } else if (fields.p_action === "approved") {
        assert.notEqual(user.id, authorId);
        assert.equal(fields.p_request, addendum.id);
        addendum.status = "approved";
        addendum.reviewed_at = "2025-01-04T12:00:00Z";
      }
      return route.fulfill({json:addendum ? [{...addendum, can_review:user.id !== authorId && addendum.status === "pending"}] : []});
    }
    const responses = {
      "/rest/v1/counter_referrals": [{final_diagnosis:"Synthetic diagnosis", outcome:"improved", created_at:"2025-01-01T12:00:00Z"}],
      "/auth/v1/token": {access_token:token(), refresh_token:"synthetic-refresh", expires_in:3600, token_type:"bearer", user},
      "/auth/v1/user": user,
      "/rest/v1/profiles": profile,
      "/rest/v1/referrals": [referral],
      "/rest/v1/rpc/get_facility_user_count": 1
    };
    return route.fulfill({json:responses[path] ?? []});
  });
  async function signIn(tab) {
    await tab.goto("http://127.0.0.1:4180/");
    await tab.getByRole("button", {name:"Sign In", exact:true}).first().click();
    await tab.locator('input[type="email"]').fill(user.email);
    await tab.locator('input[type="password"]').fill(crypto.randomUUID());
    await tab.getByRole("button", {name:"Sign In", exact:true}).last().click();
  }
  await signIn(page);
  async function tabTo(control) {
    for (let tabs = 0; tabs < 100; tabs++) {
      if (await control.evaluate(el => el === document.activeElement)) return;
      await page.keyboard.press("Tab");
    }
    assert.fail("Control was unreachable by Tab");
  }
  const referralButton = page.getByRole("button").filter({hasText:marker});
  await referralButton.waitFor();
  await tabTo(referralButton);
  await page.keyboard.press("Enter");
  const feedback = page.getByRole("region", {name:"Final hospital feedback"});
  await feedback.getByText("improved", {exact:true}).waitFor();
  assert.match(await feedback.ariaSnapshot(), /improved/);
  const followUp = page.getByRole("region", {name:"PHC follow-up"});
  const result = followUp.getByRole("combobox", {name:"Contact result"});
  await result.waitFor();
  await tabTo(result);
  await page.keyboard.press("End");
  const time = followUp.getByLabel("Encounter or attempt time");
  await tabTo(time);
  // Chromium's US date control advances after month and day; Tab exits the year segment.
  await page.keyboard.type("01022025");
  await page.keyboard.press("Tab");
  await page.keyboard.type("1200");
  await page.keyboard.press("p");
  assert.equal(await time.inputValue(), "2025-01-02T12:00");
  await tabTo(followUp.getByRole("textbox", {name:"Outcome", exact:true}));
  await page.keyboard.type("Synthetic keyboard encounter");
  await tabTo(followUp.getByRole("button", {name:"Save follow-up entry"}));
  await page.keyboard.press("Enter");
  await followUp.getByRole("status").filter({hasText:"Follow-up entry saved."}).waitFor();
  assert.match(await followUp.ariaSnapshot(), /Encounter performed.*Synthetic keyboard encounter/);
  await page.getByRole("heading", {name:"Referral Timeline"}).waitFor();
  // Create a same-document history entry while the clinical details are open.
  await page.evaluate(() => history.pushState(null, "", "#referral-review"));
  const dashboard = await context.newPage();
  await signIn(dashboard);
  await dashboard.getByRole("button", {name:"Sign Out", exact:true}).click();
  await dashboard.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  await page.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  assert.ok(logoutReceived);
  assert.equal(await page.getByText(marker, {exact:false}).count(), 0);
  await page.goBack();
  await page.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  assert.equal(await page.getByText(marker, {exact:false}).count(), 0);
  assert.equal(await page.getByRole("heading", {name:"Referral Timeline"}).count(), 0);
  console.log("browser_signout_and_same_document_back: passed");

  await signIn(page);
  await page.getByRole("button").filter({hasText:marker}).click();
  await page.getByRole("heading", {name:"Referral Timeline"}).waitFor();
  await page.goto("about:blank");
  await signIn(dashboard);
  await dashboard.getByRole("button", {name:"Sign Out", exact:true}).click();
  await dashboard.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  await page.goBack();
  await page.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  assert.equal(await page.getByText(marker, {exact:false}).count(), 0);

  // Exercise the persisted path even when Chromium chooses a fresh navigation.
  await signIn(page);
  await page.getByRole("button").filter({hasText:marker}).click();
  await page.getByRole("heading", {name:"Referral Timeline"}).waitFor();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", {persisted:true})));
  assert.equal(await page.locator("html").evaluate(el => getComputedStyle(el).visibility), "hidden");
  await Promise.all([
    page.waitForNavigation(),
    page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", {persisted:true})))
  ]);
  await page.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  assert.equal(await page.getByText(marker, {exact:false}).count(), 0);
  console.log("browser_cross_document_back_and_persisted_restore: passed");

  referral.status = "completed";
  async function openCompletedReferral() {
    await signIn(page);
    await page.getByRole("button").filter({hasText:marker}).click();
    await feedback.getByText("improved", {exact:true}).waitFor();
  }
  await openCompletedReferral();
  const timeline = page.getByRole("heading", {name:"Referral Timeline", exact:true});
  assert.equal(await timeline.count(), 1, "PHC referral must have one timeline");
  const addenda = page.getByRole("region", {name:"Clinical addenda"});
  await addenda.locator("summary").click();
  await addenda.getByLabel("Reason for correction").fill("Clarify the recorded outcome");
  await addenda.getByLabel("Proposed addendum", {exact:false}).fill("Synthetic clarification");
  await addenda.getByRole("button", {name:"Request clinical review"}).click();
  await addenda.getByText("Pending review", {exact:true}).waitFor();
  assert.equal(await addenda.getByRole("button", {name:"Approve addendum"}).count(), 0);
  await signIn(dashboard);
  await dashboard.getByRole("button", {name:"Sign Out", exact:true}).click();
  await page.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  user.id = "00000000-0000-4000-8000-000000000002";
  user.email = "reviewer@example.invalid";
  profile.id = user.id;
  await openCompletedReferral();
  await addenda.getByRole("button", {name:"Approve addendum"}).click();
  await addenda.getByText("Approved addendum", {exact:true}).waitFor();
  await addenda.getByText("Synthetic clarification", {exact:true}).waitFor();
  await feedback.getByText("improved", {exact:true}).waitFor();
  console.log("browser_independent_addendum_review: passed");

  await signIn(dashboard);
  await dashboard.getByRole("button", {name:"Sign Out", exact:true}).click();
  await page.getByRole("button", {name:"Sign In", exact:true}).first().waitFor();
  profile.role = "receiving_staff";
  referral.status = "under_assessment";
  await page.setViewportSize({width:390, height:844});
  await signIn(page);
  const assessment = page.getByRole("button", {name:"Continue Clinical Assessment"});
  await assessment.waitFor();
  await tabTo(assessment);
  await page.keyboard.press("Enter");
  await timeline.waitFor();
  assert.equal(await timeline.count(), 1, "Receiving referral must have one timeline");
  console.log("browser_single_timeline_both_roles: passed");
} finally {
  await browser?.close();
  await development.close();
  await new Promise((resolve) => production.httpServer.close(resolve));
}

await import("./continuity-export-browser.mjs");
