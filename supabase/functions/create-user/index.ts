import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  provisionAccount,
} from "../_shared/accountProvisioningPolicy.js";

const canonicalOrigin = "https://reflink-yobe.vercel.app";
const configuredOrigins = (Deno.env.get("REFLINK_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([canonicalOrigin, ...configuredOrigins]);

const corsHeadersFor = (origin: string | null): HeadersInit => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
};

const json = (
  body: Record<string, unknown>,
  status = 200,
  origin: string | null = null,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(origin), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = corsHeadersFor(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405, origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, error: "Account provisioning is temporarily unavailable." }, 500, origin);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ success: false, error: "Authentication required." }, 401, origin);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authorization.slice("Bearer ".length);
    const { data: { user: requester }, error: authError } = await admin.auth.getUser(token);
    if (authError || !requester) {
      return json({ success: false, error: "Authentication could not be verified." }, 401, origin);
    }

    const { data: requesterProfile, error: requesterProfileError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", requester.id)
      .maybeSingle();

    if (requesterProfileError) {
      return json({ success: false, error: "Administrator access required." }, 403, origin);
    }

    const outcome = await provisionAccount({
      requesterProfile,
      body: await req.json(),
      findActiveFacility: async (facilityId: string) => {
        const { data: facility, error } = await admin
          .from("facilities")
          .select("id, is_active")
          .eq("id", facilityId)
          .maybeSingle();
        return !error && facility?.is_active === true;
      },
      createAuthUser: async ({ email, password, fullName }) => {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        return { user: data?.user ?? null, error };
      },
      createProfile: async (profileInput) => {
        const { data, error } = await admin
          .from("profiles")
          .insert(profileInput)
          .select("id, full_name, phone, role, facility_id")
          .single();
        return { profile: data, error };
      },
      deleteAuthUser: async (userId: string) =>
        await admin.auth.admin.deleteUser(userId),
    });

    return json(outcome.body, outcome.status, origin);
  } catch {
    // Never log request bodies, credentials, tokens or patient information.
    return json({ success: false, error: "Unexpected account-provisioning error." }, 500, origin);
  }
});
