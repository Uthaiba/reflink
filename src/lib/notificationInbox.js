const NOTIFICATION_COLUMNS = "id,event_type,template_key,referral_id,created_at,read_at";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const ALLOWED_EVENT_TYPES = new Set([
  "referral_sent",
  "referral_acknowledged",
  "referral_acknowledgement_due",
]);
const ALLOWED_TEMPLATE_KEYS = new Set([
  "referral_sent.v1",
  "referral_acknowledged.v1",
  "referral_ack_due.v1",
]);

const ERROR_MESSAGES = Object.freeze({
  AUTH_REQUIRED: "Sign in again to view your notifications.",
  INVALID_INPUT: "The notification request is invalid.",
  INBOX_UNAVAILABLE: "Notifications are temporarily unavailable. Please try again.",
});

export class NotificationInboxError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.INBOX_UNAVAILABLE);
    this.name = "NotificationInboxError";
    this.code = code;
  }
}

function assertSupabaseClient(client) {
  if (
    !client
    || typeof client.auth?.getUser !== "function"
    || typeof client.from !== "function"
    || typeof client.rpc !== "function"
  ) {
    throw new NotificationInboxError("INBOX_UNAVAILABLE");
  }
}

function validatePageSize(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new NotificationInboxError("INVALID_INPUT");
  }
  return limit;
}

function normalizeCursor(before) {
  if (before == null) return null;
  if (
    typeof before !== "object"
    || typeof before.createdAt !== "string"
    || !TIMESTAMP_PATTERN.test(before.createdAt)
    || typeof before.id !== "string"
    || !UUID_PATTERN.test(before.id)
  ) {
    throw new NotificationInboxError("INVALID_INPUT");
  }

  const timestamp = new Date(before.createdAt);
  if (Number.isNaN(timestamp.getTime())) {
    throw new NotificationInboxError("INVALID_INPUT");
  }

  // Preserve PostgreSQL timestamp precision (up to microseconds). Converting
  // through Date#toISOString would truncate sub-millisecond cursor precision.
  return {
    createdAt: before.createdAt,
    id: before.id.toLowerCase(),
  };
}

function normalizeNotification(row) {
  if (
    !row
    || typeof row.id !== "string"
    || !UUID_PATTERN.test(row.id)
    || typeof row.event_type !== "string"
    || typeof row.template_key !== "string"
    || typeof row.created_at !== "string"
    || !TIMESTAMP_PATTERN.test(row.created_at)
    || Number.isNaN(new Date(row.created_at).getTime())
    || (row.read_at != null && (
      typeof row.read_at !== "string"
      || !TIMESTAMP_PATTERN.test(row.read_at)
      || Number.isNaN(new Date(row.read_at).getTime())
    ))
  ) {
    throw new NotificationInboxError("INBOX_UNAVAILABLE");
  }

  return {
    id: row.id,
    event_type: ALLOWED_EVENT_TYPES.has(row.event_type) ? row.event_type : "unknown",
    template_key: ALLOWED_TEMPLATE_KEYS.has(row.template_key) ? row.template_key : "unknown.v1",
    referral_id: typeof row.referral_id === "string" && UUID_PATTERN.test(row.referral_id)
      ? row.referral_id
      : null,
    created_at: row.created_at,
    read_at: row.read_at || null,
  };
}

async function requireAuthenticatedUserId(client) {
  const { data, error } = await client.auth.getUser();
  const userId = data?.user?.id;
  if (error || typeof userId !== "string" || !UUID_PATTERN.test(userId)) {
    throw new NotificationInboxError("AUTH_REQUIRED");
  }
  return userId;
}

/**
 * Creates a narrow, authenticated adapter for the future user-owned inbox.
 * The inbox relation and mark_notification_read RPC are intentionally not
 * created or wired by this module; both must be approved and tested in a
 * synthetic-data Supabase environment before the UI can use this adapter.
 */
export function createNotificationInboxAdapter(supabaseClient) {
  assertSupabaseClient(supabaseClient);

  return Object.freeze({
    async listMyNotifications({ limit = DEFAULT_PAGE_SIZE, before = null } = {}) {
      const pageSize = validatePageSize(limit);
      const cursor = normalizeCursor(before);
      const userId = await requireAuthenticatedUserId(supabaseClient);

      let query = supabaseClient
        .from("notification_inbox")
        .select(NOTIFICATION_COLUMNS)
        .eq("recipient_user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(pageSize + 1);

      if (cursor) {
        const cursorFilter = "created_at.lt." + cursor.createdAt
          + ",and(created_at.eq." + cursor.createdAt + ",id.lt." + cursor.id + ")";
        query = query.or(cursorFilter);
      }

      const { data, error } = await query;
      if (error || !Array.isArray(data)) {
        throw new NotificationInboxError("INBOX_UNAVAILABLE");
      }

      const hasMore = data.length > pageSize;
      const visibleRows = data.slice(0, pageSize).map(normalizeNotification);
      const lastVisible = visibleRows.at(-1);

      return {
        notifications: visibleRows,
        hasMore,
        nextCursor: hasMore && lastVisible
          ? { createdAt: lastVisible.created_at, id: lastVisible.id }
          : null,
      };
    },

    async markMyNotificationRead(notificationId) {
      if (typeof notificationId !== "string" || !UUID_PATTERN.test(notificationId)) {
        throw new NotificationInboxError("INVALID_INPUT");
      }

      await requireAuthenticatedUserId(supabaseClient);
      const { error } = await supabaseClient.rpc("mark_notification_read", {
        p_notification_id: notificationId,
      });

      if (error) {
        throw new NotificationInboxError("INBOX_UNAVAILABLE");
      }
      // The RPC is deliberately non-enumerating: absent, foreign-owned and
      // already-read IDs must not be distinguishable by the browser client.
    },
  });
}
