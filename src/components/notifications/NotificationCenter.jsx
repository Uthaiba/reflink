import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import "./NotificationCenter.css";

function notificationCopy(type) {
  if (type === "referral_sent") {
    return {
      title: "Referral sent",
      description: "A referral has been submitted and is awaiting receiving-facility action.",
    };
  }
  if (type === "referral_acknowledged") {
    return {
      title: "Referral acknowledged",
      description: "The receiving facility has acknowledged a referral.",
    };
  }
  if (type === "sla_escalation") {
    return {
      title: "Referral requires attention",
      description: "A referral has reached an escalation threshold.",
    };
  }
  return {
    title: "Referral update",
    description: "There is an update to a referral in your authorized workflow.",
  };
}

function formatNotificationTime(value) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Time unavailable"
    : date.toLocaleString();
}

export default function NotificationCenter({ userId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [realtimeState, setRealtimeState] = useState("connecting");

  const loadNotifications = useCallback(async (isRefresh = false) => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("referral_notifications")
        .select("id, notification_type, status, created_at")
        .eq("channel", "dashboard")
        .order("created_at", { ascending: false })
        .limit(20);

      if (queryError) throw queryError;
      setItems(data || []);
    } catch (loadError) {
      console.error("REFLINK NOTIFICATION LOAD ERROR:", loadError);
      setError("Notifications could not be loaded. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    loadNotifications();

    if (!userId) return () => { active = false; };

    const channel = supabase
      .channel(`referral-notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "referral_notifications",
          filter: "channel=eq.dashboard",
        },
        () => {
          if (active) loadNotifications(true);
        }
      )
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") setRealtimeState("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeState("reconnecting");
        }
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId, loadNotifications]);

  return (
    <section className="reflink-notification-center" aria-labelledby="reflink-notifications-title">
      <div className="reflink-notification-heading">
        <div>
          <span className="reflink-notification-eyebrow">WORKSPACE UPDATES</span>
          <h3 id="reflink-notifications-title">Notifications</h3>
          <p>Referral activity visible to your authorized account.</p>
        </div>
        <div className="reflink-notification-tools">
          <span className={`reflink-live-state ${realtimeState === "live" ? "is-live" : ""}`}>
            <span aria-hidden="true" />
            {realtimeState === "live" ? "Live updates" : "Live updates reconnecting"}
          </span>
          <button
            type="button"
            className="reflink-notification-refresh"
            onClick={() => loadNotifications(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="reflink-notification-message" role="status">Loading notifications…</p>
      ) : error ? (
        <div className="reflink-notification-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => loadNotifications(true)}>Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="reflink-notification-empty">
          <span aria-hidden="true">✓</span>
          <strong>You’re up to date</strong>
          <p>New referral activity will appear here when it is available to your account.</p>
        </div>
      ) : (
        <ul className="reflink-notification-list">
          {items.map((item) => {
            const copy = notificationCopy(item.notification_type);
            return (
              <li className="reflink-notification-item" key={item.id}>
                <span className="reflink-notification-icon" aria-hidden="true">↗</span>
                <div className="reflink-notification-content">
                  <div className="reflink-notification-item-heading">
                    <strong>{copy.title}</strong>
                    <span className={`reflink-notification-status status-${item.status}`}>
                      {item.status}
                    </span>
                  </div>
                  <p>{copy.description}</p>
                  <time dateTime={item.created_at}>{formatNotificationTime(item.created_at)}</time>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
