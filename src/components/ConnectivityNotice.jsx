import { useEffect, useState } from "react";

/**
 * Connectivity is only a browser hint, not a verified server-health check.
 * Never promise that clinical data has been saved or synchronized.
 */
export default function ConnectivityNotice() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;

  return (
    <div role="status" aria-live="polite" className="reflink-connectivity-notice">
      <strong>Connection unavailable.</strong>{" "}
      Do not assume this referral has been saved or sent. Keep a secure
      paper record and follow your facility's approved urgent referral
      procedure. Retry only after connectivity is restored and verify
      the referral appears in REFLINK before relying on it.
    </div>
  );
}
