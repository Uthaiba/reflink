import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const proposalPath = new URL(
  "../supabase/migrations/20261108000100_restrict_core_table_structural_privileges.sql",
  import.meta.url,
);
const proposal = readFileSync(proposalPath, "utf8");

describe("core table structural privilege proposal", () => {
  it("is explicitly marked as a proposal and not approved for execution", () => {
    expect(proposal).toMatch(/NOT APPROVED FOR EXECUTION/i);
    expect(proposal).toMatch(/explicit release approval/i);
  });

  it("revokes only structural privileges from authenticated on the four audited core tables", () => {
    expect(proposal).toMatch(/revoke\s+truncate,\s*trigger,\s*references/i);
    for (const table of [
      "public.referrals",
      "public.counter_referrals",
      "public.profiles",
      "public.facilities",
    ]) {
      expect(proposal).toContain(table);
    }
    expect(proposal).toMatch(/from authenticated/i);
  });

  it("does not silently change row-level policies or ordinary DML grants", () => {
    expect(proposal).not.toMatch(/create\s+policy|drop\s+policy|alter\s+table/i);
    expect(proposal).not.toMatch(/revoke\s+(all|select|insert|update|delete)/i);
    expect(proposal).not.toMatch(/grant\s+/i);
  });

  it("contains post-change privilege assertions", () => {
    expect(proposal.match(/has_table_privilege\('authenticated'/g)).toHaveLength(12);
    expect(proposal).toMatch(/still has TRUNCATE/i);
    expect(proposal).toMatch(/still has TRIGGER/i);
    expect(proposal).toMatch(/still has REFERENCES/i);
  });
});
