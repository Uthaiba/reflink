import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { changeAccountPassword, resolvePasswordChangeMode } from "../src/lib/passwordChange.js";

const userId = randomUUID();
const password = randomUUID();
const identity = (id = userId) => ({ data: { user: { id } }, error: null });
const profile = (flag = false, id = userId) => ({ data: { id, must_change_password: flag }, error: null });

function fixture(options = {}) {
  const calls = { auth: 0, edge: 0, flag: 0, ids: [] };
  let reads = 0;
  let sessions = 0;
  const client = {
    auth: {
      getUser: async () => {
        sessions++;
        if (options.sessionThrow) throw new Error("Synthetic transport error");
        return sessions === 1 ? (options.session || identity()) : (options.finalSession || identity());
      },
      updateUser: async () => {
        calls.auth++;
        if (options.authThrow) throw new Error("Synthetic timeout");
        return options.authResponse || identity();
      },
    },
    functions: {
      invoke: async (name, request) => {
        calls.edge++;
        assert.equal(name, "change-password");
        assert.deepEqual(request, { body: { password } });
        if (options.edgeThrow) throw new Error("Synthetic timeout");
        return options.edgeResponse || { data: { success: true }, error: null };
      },
    },
    from: (table) => {
      assert.equal(table, "profiles");
      let writing = false;
      const query = {
        select: () => query,
        update: (patch) => {
          calls.flag++;
          writing = true;
          assert.deepEqual(patch, { must_change_password: false });
          return query;
        },
        eq: (column, id) => {
          assert.equal(column, "id");
          calls.ids.push(id);
          return query;
        },
        single: async () => {
          if (writing) {
            if (options.flagThrow) throw new Error("Synthetic flag timeout");
            return options.flagResponse || profile(false);
          }
          reads++;
          return reads === 1
            ? (options.initialProfile || profile(options.required !== false))
            : (options.finalProfile || profile(false));
        },
      };
      return query;
    },
  };
  return { client, calls };
}

test("audited environments select their deployed password capability", () => {
  assert.equal(resolvePasswordChangeMode("https://rcskuzmvyugbanygizri.supabase.co"), "edge");
  assert.equal(resolvePasswordChangeMode("https://uwwzbljufqbzkjflpnll.supabase.co"), "auth");
});

test("unknown environments require an explicit valid capability", () => {
  assert.equal(resolvePasswordChangeMode("https://example.test"), null);
  assert.equal(resolvePasswordChangeMode("invalid"), null);
  assert.equal(resolvePasswordChangeMode("https://example.test", "edge"), "edge");
  assert.equal(resolvePasswordChangeMode("https://example.test", "unexpected"), null);
});

test("invalid capability prevents any password mutation", async () => {
  const { client, calls } = fixture();
  assert.equal((await changeAccountPassword(client, password, null)).status, "not_started");
  assert.equal(calls.auth + calls.edge + calls.flag, 0);
});

test("expired session prevents any password mutation", async () => {
  const { client, calls } = fixture({ session: { data: { user: null }, error: {} } });
  assert.equal((await changeAccountPassword(client, password, "auth")).status, "not_started");
  assert.equal(calls.auth + calls.edge + calls.flag, 0);
});

test("unreadable or mismatched profile prevents any password mutation", async () => {
  for (const initialProfile of [
    { data: null, error: {} }, profile(true, randomUUID()),
    { data: { id: userId }, error: null },
  ]) {
    const { client, calls } = fixture({ initialProfile });
    assert.equal((await changeAccountPassword(client, password, "auth")).status, "not_started");
    assert.equal(calls.auth + calls.edge + calls.flag, 0);
  }
});

test("legacy Auth path confirms the exact affected profile and final status", async () => {
  const { client, calls } = fixture();
  assert.deepEqual(await changeAccountPassword(client, password, "auth"), { status: "confirmed", userId });
  assert.equal(calls.auth, 1);
  assert.equal(calls.flag, 1);
  assert.equal(calls.edge, 0);
  assert.ok(calls.ids.every((id) => id === userId));
});

test("a recovery session needs no UI profile and an already cleared flag needs no write", async () => {
  const { client, calls } = fixture({ required: false });
  assert.equal((await changeAccountPassword(client, password, "auth")).status, "confirmed");
  assert.equal(calls.flag, 0);
});

test("failed or empty flag update is partial success, never full success", async () => {
  for (const flagResponse of [
    { data: null, error: {} }, { data: null, error: null },
    profile(true), profile(false, randomUUID()),
  ]) {
    const { client } = fixture({ flagResponse });
    assert.equal((await changeAccountPassword(client, password, "auth")).status, "account_pending");
  }
});

test("thrown flag failure preserves known password success", async () => {
  const { client } = fixture({ flagThrow: true });
  assert.equal((await changeAccountPassword(client, password, "auth")).status, "account_pending");
});

test("ambiguous Auth write never clears flags or falls back to the server", async () => {
  for (const options of [{ authThrow: true }, { authResponse: { data: null, error: {} } }]) {
    const { client, calls } = fixture(options);
    assert.equal((await changeAccountPassword(client, password, "auth")).status, "unknown");
    assert.equal(calls.auth, 1);
    assert.equal(calls.flag + calls.edge, 0);
  }
});

test("staging server path performs no browser Auth or flag writes", async () => {
  const { client, calls } = fixture();
  assert.equal((await changeAccountPassword(client, password, "edge")).status, "confirmed");
  assert.equal(calls.edge, 1);
  assert.equal(calls.auth + calls.flag, 0);
});

test("server partial-success JSON survives the non-2xx Functions response", async () => {
  const { client, calls } = fixture({
    edgeResponse: { data: null, error: { context: new Response(JSON.stringify({ password_changed: true }), { status: 500 }) } },
  });
  assert.equal((await changeAccountPassword(client, password, "edge")).status, "account_pending");
  assert.equal(calls.auth + calls.flag, 0);
});

test("lost or malformed server responses never trigger fallback password writes", async () => {
  for (const options of [
    { edgeThrow: true }, { edgeResponse: { data: {}, error: null } },
    { edgeResponse: { data: null, error: { context: new Response("invalid JSON", { status: 500 }) } } },
  ]) {
    const { client, calls } = fixture(options);
    assert.equal((await changeAccountPassword(client, password, "edge")).status, "unknown");
    assert.equal(calls.edge, 1);
    assert.equal(calls.auth + calls.flag, 0);
  }
});

test("server success with a still-required or unreadable flag remains pending", async () => {
  for (const finalProfile of [profile(true), { data: null, error: {} }]) {
    const { client } = fixture({ finalProfile });
    assert.equal((await changeAccountPassword(client, password, "edge")).status, "account_pending");
  }
});

test("account switch or expired session after a write prevents confirmation", async () => {
  for (const mode of ["auth", "edge"]) {
    const { client } = fixture({ finalSession: identity(randomUUID()) });
    assert.equal((await changeAccountPassword(client, password, mode)).status, "account_pending");
  }
});

test("preflight network failure makes no writes", async () => {
  const { client, calls } = fixture({ sessionThrow: true });
  assert.equal((await changeAccountPassword(client, password, "edge")).status, "not_started");
  assert.equal(calls.auth + calls.edge + calls.flag, 0);
});
