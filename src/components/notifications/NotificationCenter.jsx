import { useMemo, useState } from "react";
import {
  countUnreadNotifications,
  filterNotifications,
  formatNotificationTimestamp,
  getNotificationPresentation,
} from "./notificationCenterModel.js";
import "./notification-center.css";

export default function NotificationCenter({
  notifications = [],
  loading = false,
  error = "",
  onRefresh,
  onMarkRead,
  onOpenReferral,
}) {
  const [filter, setFilter] = useState("all");
  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const unreadCount = countUnreadNotifications(safeNotifications);
  const visibleNotifications = useMemo(
    () => filterNotifications(safeNotifications, filter),
    [safeNotifications, filter]
  );

  return (
    <section className="reflink-notification-center" aria-labelledby="reflink-notifications-title">
      <header className="reflink-notification-center__header">
        <div>
          <span className="reflink-notification-center__eyebrow">WORKSPACE UPDATES</span>
          <h2 id="reflink-notifications-title">Notifications</h2>
          <p>Referral and workflow updates relevant to your account.</p>
        </div>
        <button
          type="button"
          className="reflink-notification-center__refresh"
          onClick={onRefresh}
          disabled={!onRefresh || loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <div className="reflink-notification-center__toolbar">
        <div className="reflink-notification-center__filters" role="group" aria-label="Filter notifications">
          <button
            type="button"
            className={filter === "all" ? "is-active" : ""}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All <span>{safeNotifications.length}</span>
          </button>
          <button
            type="button"
            className={filter === "unread" ? "is-active" : ""}
            aria-pressed={filter === "unread"}
            onClick={() => setFilter("unread")}
          >
            Unread <span>{unreadCount}</span>
          </button>
        </div>
        <span className="reflink-notification-center__count" aria-live="polite">
          {unreadCount === 1 ? "1 unread notification" : `${unreadCount} unread notifications`}
        </span>
      </div>

      {error ? (
        <div className="reflink-notification-center__message is-error" role="alert">{error}</div>
      ) : null}

      {loading && safeNotifications.length === 0 ? (
        <div className="reflink-notification-center__empty" role="status">
          <span className="reflink-notification-center__empty-icon" aria-hidden="true">↻</span>
          <h3>Loading notifications</h3>
          <p>Your workspace updates will appear here.</p>
        </div>
      ) : visibleNotifications.length === 0 ? (
        <div className="reflink-notification-center__empty">
          <span className="reflink-notification-center__empty-icon" aria-hidden="true">✓</span>
          <h3>{filter === "unread" ? "You're all caught up" : "No notifications yet"}</h3>
          <p>
            {filter === "unread"
              ? "There are no unread updates for this account."
              : "When an approved referral or workflow update is available, it will appear here."}
          </p>
        </div>
      ) : (
        <ul className="reflink-notification-center__list">
          {visibleNotifications.map((notification) => {
            const presentation = getNotificationPresentation(notification?.event_type);
            const unread = !notification?.read_at;
            return (
              <li className={`reflink-notification-item ${unread ? "is-unread" : ""}`} key={notification.id}>
                <span className="reflink-notification-item__marker" aria-hidden="true" />
                <div className="reflink-notification-item__content">
                  <div className="reflink-notification-item__meta">
                    <span>{presentation.category}</span>
                    <time dateTime={notification.created_at || undefined}>
                      {formatNotificationTimestamp(notification.created_at)}
                    </time>
                  </div>
                  <h3>{presentation.title}</h3>
                  <p>{presentation.description}</p>
                  <div className="reflink-notification-item__actions">
                    {notification.referral_id && onOpenReferral ? (
                      <button type="button" onClick={() => onOpenReferral(notification.referral_id)}>
                        Open referral
                      </button>
                    ) : null}
                    {unread && onMarkRead ? (
                      <button type="button" className="is-secondary" onClick={() => onMarkRead(notification.id)}>
                        Mark as read
                      </button>
                    ) : null}
                    {!unread ? <span className="reflink-notification-item__read-state">Read</span> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="reflink-notification-center__privacy">
        Notifications contain workflow references only. Referral details remain protected by your normal facility and account permissions.
      </p>
    </section>
  );
}
