import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("counter-referral custom validation is associated with the invalid field", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = app.indexOf("function CounterReferralForm");
  const end = app.indexOf("function AdministratorRoute", start);
  assert.ok(start >= 0 && end > start);
  const source = app.slice(start, end);

  for (const [field, inputId, errorId] of [
    ["final_diagnosis", "counter-final-diagnosis", "counter-final-diagnosis-error"],
    ["outcome", "counter-outcome", "counter-outcome-error"],
    ["referred_further_to", "counter-referred-to", "counter-referred-to-error"],
  ]) {
    assert.match(source, new RegExp(`fieldErrors\\.${field}`));
    assert.match(source, new RegExp(`id="${inputId}"`));
    assert.match(source, new RegExp(`aria-invalid=\\{Boolean\\(fieldErrors\\.${field}\\)\\}`));
    assert.match(source, new RegExp(`aria-describedby=\\{fieldErrors\\.${field} \\? "${errorId}" : undefined\\}`));
    assert.match(source, new RegExp(`id="${errorId}"`));
  }

  assert.match(source, /fieldRefs\.current\[firstInvalidField\]\?\.focus\(\)/);
  assert.match(source, /delete next\[name\]/);
});
