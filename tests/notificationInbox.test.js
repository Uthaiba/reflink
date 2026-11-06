import test from "node:test";
import assert from "node:assert/strict";
import {
  createNotificationInboxAdapter,
  NotificationInboxError,
} from "../src/lib/notificationInbox.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NOTIFICATION_1 = "11111111-1111-4111-8111-111111111111";
const NOTIFICATION_2 = "22222222-2222-4222-8222-222222222222";
const REFERRAL_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_AT = "2026-11-06T08:00:00.000Z";

function makeClient({ userId = USER_A, authError = null, rows = [], queryError = null, rpcError = null } = {}) {
  const calls = { auth: 0, from: [], select: [], eq: [], order: [], limit: [], or: [], rpc: [] };
  const query = {
    select(...args) { calls.select.push(args); return this; },
    eq(...args) { calls.eq.push(args); return this; },
    order(...args) { calls.order.push(args); return this; },
    limit(...args) { calls.limit.push(args); return this; },
    or(...args) { calls.or.push(args); return this; },
    then(resolve, reject) {
      return Promise.resolve({ data: rows, error: queryError }).then(resolve, reject);
    },
  };

  const client = {
    auth: {
      async getUser() {
        calls.auth += 1;
        return { data: { user: userId ? { id: userId } : null }, error: authError };
      },
    },
    from(table) {
      calls.from.push(table);
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      return { data: null, error: rpcError };
    },
  };
  return { client, calls };
}

function notification(id = NOTIFICATION_1) {
  return {
    id,
    event_type: "referral_acknowledgement_due",
    template_key: "referral_ack_due.v1",
    referral_id: REFERRAL_ID,
    created_at: CREATED_AT,
    read_at: null,
    recipient_user_id: "should-not-be-returned",
    patient_name: "should-not-be-returned",
  };
}

test("adapter requires the authenticated Supabase client contract", () => {
  assert.throws(
    () => createNotificationInboxAdapter({}),
    (error) => error instanceof NotificationInboxError && error.code === "INBOX_UNAVAILABLE",
  );
});

test("list uses the authenticated owner, a minimal projection and stable descending pagination", async () => {
  const { client, calls } = makeClient({ rows: [notification(), notification(NOTIFICATION_2)] });
  const adapter = createNotificationInboxAdapter(client);
  const result = await adapter.listMyNotifications({ limit: 1, recipientUserId: NOTIFICATION_2 });

  assert.equal(calls.auth, 1);
  assert.deepEqual(calls.from, ["notification_inbox"]);
  assert.deepEqual(calls.select, [["id,event_type,template_key,referral_id,created_at,read_at"]]);
  assert.deepEqual(calls.eq, [["recipient_user_id", USER_A]]);
  assert.deepEqual(calls.order, [
    ["created_at", { ascending: false }],
    ["id", { ascending: false }],
  ]);
  assert.deepEqual(calls.limit, [[2]]);
  assert.equal(result.notifications.length, 1);
  assert.equal(result.notifications[0].id, NOTIFICATION_1);
  assert.equal("recipient_user_id" in result.notifications[0], false);
  assert.equal("patient_name" in result.notifications[0], false);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.nextCursor, { createdAt: CREATED_AT, id: NOTIFICATION_1 });
});

test("cursor pagination is validated and owner-scoped", async () => {
  const { client, calls } = makeClient({ rows: [] });
  const adapter = createNotificationInboxAdapter(client);
  await adapter.listMyNotifications({
    before: { createdAt: CREATED_AT, id: NOTIFICATION_1 },
  });
  assert.equal(calls.or.length, 1);
  assert.match(calls.or[0][0], /created_at\.lt\.2026-11-06T08:00:00\.000Z/);
  assert.match(calls.or[0][0], /id\.lt\.11111111-1111-4111-8111-111111111111/);

  await assert.rejects(
    adapter.listMyNotifications({ before: { createdAt: CREATED_AT, id: "bad-id),id.neq.null" } }),
    (error) => error.code === "INVALID_INPUT",
  );
  await assert.rejects(
    adapter.listMyNotifications({ limit: 51 }),
    (error) => error.code === "INVALID_INPUT",
  );
});

test("unauthenticated list fails before querying the inbox", async () => {
  const { client, calls } = makeClient({ userId: null });
  const adapter = createNotificationInboxAdapter(client);
  await assert.rejects(
    adapter.listMyNotifications(),
    (error) => error.code === "AUTH_REQUIRED",
  );
  assert.deepEqual(calls.from, []);
});

test("list query failures return a generic error without leaking database details", async () => {
  const { client } = makeClient({ queryError: { message: "relation public.notification_inbox does not exist" } });
  const adapter = createNotificationInboxAdapter(client);
  await assert.rejects(
    adapter.listMyNotifications(),
    (error) => error.code === "INBOX_UNAVAILABLE" && !error.message.includes("relation public"),
  );
});

test("mark-read uses only the owner-authenticated RPC and never direct table updates", async () => {
  const { client, calls } = makeClient();
  const adapter = createNotificationInboxAdapter(client);
  await adapter.markMyNotificationRead(NOTIFICATION_1);
  assert.equal(calls.auth, 1);
  assert.deepEqual(calls.from, []);
  assert.deepEqual(calls.rpc, [{
    name: "mark_notification_read",
    args: { p_notification_id: NOTIFICATION_1 },
  }]);
});

test("mark-read rejects malformed IDs and fails closed when unauthenticated or RPC is unavailable", async () => {
  const malformed = makeClient();
  const malformedAdapter = createNotificationInboxAdapter(malformed.client);
  await assert.rejects(
    malformedAdapter.markMyNotificationRead("not-a-uuid"),
    (error) => error.code === "INVALID_INPUT",
  );
  assert.equal(malformed.calls.auth, 0);
  assert.deepEqual(malformed.calls.rpc, []);

  const signedOut = makeClient({ userId: null });
  await assert.rejects(
    createNotificationInboxAdapter(signedOut.client).markMyNotificationRead(NOTIFICATION_1),
    (error) => error.code === "AUTH_REQUIRED",
  );
  assert.deepEqual(signedOut.calls.rpc, []);

  const failedRpc = makeClient({ rpcError: { message: "permission denied for function" } });
  await assert.rejects(
    createNotificationInboxAdapter(failedRpc.client).markMyNotificationRead(NOTIFICATION_1),
    (error) => error.code === "INBOX_UNAVAILABLE" && !error.message.includes("permission denied"),
  );
});


test("cursor preserves PostgreSQL microsecond precision", async () => {
  const preciseTimestamp = "2026-11-06T08:00:00.123456+00:00";
  const { client, calls } = makeClient({ rows: [] });
  const adapter = createNotificationInboxAdapter(client);
  await adapter.listMyNotifications({
    before: { createdAt: preciseTimestamp, id: NOTIFICATION_1 },
  });
  assert.match(calls.or[0][0], /2026-11-06T08:00:00\.123456\+00:00/);
});

test("unknown event and template keys are normalized to generic allowlist values", async () => {
  const unsafeRow = {
    ...notification(),
    event_type: "patient_name_should_not_be_a_template_key",
    template_key: "arbitrary_payload.v9",
  };
  const { client } = makeClient({ rows: [unsafeRow] });
  const result = await createNotificationInboxAdapter(client).listMyNotifications();
  assert.equal(result.notifications[0].event_type, "unknown");
  assert.equal(result.notifications[0].template_key, "unknown.v1");
});
