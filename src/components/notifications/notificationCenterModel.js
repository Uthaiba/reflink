const EVENT_PRESENTATION = Object.freeze({
  referral_sent: {
    title: "New referral received",
    description: "A referral has been sent to your facility. Sign in to review the referral securely.",
    category: "Referral",
  },
  referral_acknowledged: {
    title: "Referral acknowledged",
    description: "The receiving facility has acknowledged a referral. Review its current status.",
    category: "Referral",
  },
  referral_acknowledgement_due: {
    title: "Acknowledgement deadline reached",
    description: "A referral is awaiting acknowledgement. Review the referral and follow your facility's escalation procedure.",
    category: "Workflow",
  },
});

export function getNotificationPresentation(eventType) {
  return EVENT_PRESENTATION[eventType] || {
    title: "REFLINK notification",
    description: "A workflow update is available. Sign in to REFLINK to review it.",
    category: "Update",
  };
}

export function filterNotifications(notifications, filter = "all") {
  const safeList = Array.isArray(notifications) ? notifications : [];
  if (filter === "unread") return safeList.filter((item) => !item?.read_at);
  return safeList;
}

export function countUnreadNotifications(notifications) {
  return filterNotifications(notifications, "unread").length;
}

export function formatNotificationTimestamp(value, locale) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(locale || undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
