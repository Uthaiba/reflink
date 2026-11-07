import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const twilioSid = process.env.TWILIO_ACCOUNT_SID;
const twilioToken = process.env.TWILIO_AUTH_TOKEN;
const twilioFrom = process.env.TWILIO_FROM_NUMBER;
const publicAppUrl = process.env.REFLINK_PUBLIC_URL
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json").json(body);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^+\d]/g, "");
}

async function sendTwilioSms(to, body) {
  const form = new URLSearchParams({ To: to, From: twilioFrom, Body: body });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
    }
  );
  const data = await response.json();
  if (!response.ok) throw new Error("SMS provider delivery failed.");
  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
  if (!supabaseUrl || !supabaseServiceRoleKey) return json(res, 503, { error: "SMS service backend is not configured." });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(res, 401, { error: "Authentication required." });

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData?.user) return json(res, 401, { error: "Invalid authentication token." });

  const actorId = userData.user.id;
  const { referralId, type = "referral_sent" } = req.body || {};
  if (!referralId || !["referral_sent", "referral_acknowledged"].includes(type)) {
    return json(res, 400, { error: "referralId and a supported notification type are required." });
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("id, role, facility_id, full_name")
    .eq("id", actorId)
    .single();

  const { data: referral, error: referralError } = await adminClient
    .from("referrals")
    .select(`id, referral_number, patient_identifier, urgency, referring_user_id, referring_facility_id, receiving_facility_id, status,
      receiving_facility:facilities!referrals_receiving_facility_id_fkey(name, referral_notification_phone),
      referring_facility:facilities!referrals_referring_facility_id_fkey(name, referral_notification_phone)`)
    .eq("id", referralId)
    .single();

  if (referralError || !referral) return json(res, 404, { error: "Referral not found." });

  if (type === "referral_sent") {
  const authorized =
    referral.referring_user_id === actorId &&
    profile?.role === "phc_staff" &&
    profile?.facility_id === referral.referring_facility_id &&\n    referral.status === "sent";

  if (!authorized) {
    return json(res, 403, {
      error: "Not authorized to send this referral notification."
    });
  }
} else {
  const authorized =
    profile?.role === "receiving_staff" &&
    profile?.facility_id === referral.receiving_facility_id &&\n    referral.status === "acknowledged" &&\n    Boolean(referral.acknowledged_at);

  if (!authorized) {
    return json(res, 403, {
      error: "Not authorized to send this acknowledgement notification."
    });
  }
}

  if (type === "referral_sent" && String(referral.urgency || "routine").toLowerCase() === "routine") {
    await adminClient.from("referral_notifications").insert({
      referral_id: referral.id,
      notification_type: type,
      channel: "sms",
      status: "skipped",
      error_message: "Routine referrals use dashboard notifications only; SMS is reserved for urgent and emergency referrals.",
    });
    return json(res, 200, { status: "skipped", reason: "Routine referrals use dashboard notifications only." });
  }

  const recipientFacility = type === "referral_sent" ? referral.receiving_facility : referral.referring_facility;
  const recipientPhone = normalizePhone(recipientFacility?.referral_notification_phone);

  if (!recipientPhone) {
    await adminClient.from("referral_notifications").insert({
      referral_id: referral.id,
      notification_type: type,
      channel: "sms",
      status: "skipped",
      error_message: "No designated referral notification phone is configured for the facility.",
    });
    return json(res, 200, { status: "skipped", reason: "No facility phone configured." });
  }

  if (!twilioSid || !twilioToken || !twilioFrom) {
    await adminClient.from("referral_notifications").insert({
      referral_id: referral.id,
      notification_type: type,
      channel: "sms",
      recipient_phone: recipientPhone,
      provider: "twilio",
      status: "skipped",
      error_message: "Twilio environment variables are not configured.",
    });
    return json(res, 200, { status: "skipped", reason: "SMS provider not configured." });
  }

  const message = type === "referral_sent"
  ? `REFLINK: A new ${referral.urgency?.toUpperCase() || "ROUTINE"} referral is awaiting review. Please sign in to REFLINK to view details: ${publicAppUrl || "open the REFLINK dashboard"}`
  : `REFLINK: A referral has been acknowledged. Please sign in to REFLINK to view details: ${publicAppUrl || "open the REFLINK dashboard"}`;

  try {
    const result = await sendTwilioSms(recipientPhone, message);
    await adminClient.from("referral_notifications").insert({
      referral_id: referral.id,
      notification_type: type,
      channel: "sms",
      recipient_phone: recipientPhone,
      provider: "twilio",
      provider_message_id: result.sid,
      status: "sent",
      sent_at: new Date().toISOString(),
    });
    return json(res, 200, { status: "sent" });
  } catch (error) {
    await adminClient.from("referral_notifications").insert({
      referral_id: referral.id,
      notification_type: type,
      channel: "sms",
      recipient_phone: recipientPhone,
      provider: "twilio",
      status: "failed",
      error_message: "SMS provider delivery failed.",
    });
    return json(res, 502, { error: "SMS notification could not be delivered." });
  }
}
