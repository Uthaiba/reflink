function matchesPatch(record, patch) {
  return Object.entries(patch).every(([field, expected]) => {
    if (!Object.hasOwn(record, field)) return false;
    const actual = record[field];
    if (field.endsWith("_at") && actual != null && expected != null) {
      const left = Date.parse(actual), right = Date.parse(expected);
      return Number.isFinite(left) && Number.isFinite(right) && left === right;
    }
    return actual === expected;
  });
}

export async function commitClinicalUpdate(client, referralId, expectedStatus, patch) {
  try {
    const response = await client.from("referrals").update(patch)
      .eq("id", referralId).eq("status", expectedStatus).select().single();
    if (!response.error && response.data?.id === referralId && typeof response.data.referral_number === "string" && matchesPatch(response.data, patch)) {
      return { data: response.data, recovered: false };
    }
  } catch { /* A lost response may conceal a committed write. */ }

  try {
    const fields = [...new Set(["id", "referral_number", ...Object.keys(patch)])].join(", ");
    const response = await client.from("referrals").select(fields).eq("id", referralId).single();
    if (!response.error && response.data?.id === referralId && typeof response.data.referral_number === "string" && matchesPatch(response.data, patch)) {
      return { data: response.data, recovered: true };
    }
  } catch { /* A failed recovery read must not escape as a misleading save error. */ }

  throw new Error("CLINICAL_SAVE_UNCONFIRMED");
}
