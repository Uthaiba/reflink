const KNOWN_MODES = {
  "uwwzbljufqbzkjflpnll.supabase.co": "auth",
  "rcskuzmvyugbanygizri.supabase.co": "edge",
};

// Deployment capability selection only; authorization still belongs to the server.
export function resolvePasswordChangeMode(url, configuredMode) {
  if (configuredMode) return ["auth", "edge"].includes(configuredMode) ? configuredMode : null;
  try { return KNOWN_MODES[new URL(url).hostname] || null; }
  catch { return null; }
}

const outcome = (status) => ({ status });

async function readProfile(client, userId) {
  const response = await client.from("profiles").select("id, must_change_password")
    .eq("id", userId).single();
  if (response.error || response.data?.id !== userId ||
      typeof response.data.must_change_password !== "boolean") throw new Error("Profile unavailable");
  return response.data;
}

// No retries or fallback writes: a lost response may conceal a committed password.
export async function changeAccountPassword(client, password, mode) {
  if (!["auth", "edge"].includes(mode) || typeof password !== "string" || !password) {
    return outcome("not_started");
  }
  let userId;
  let profile;
  try {
    const session = await client.auth.getUser();
    userId = session.data?.user?.id;
    if (session.error || !userId) return outcome("not_started");
    profile = await readProfile(client, userId);
  } catch { return outcome("not_started"); }

  let passwordConfirmed = false;
  try {
    if (mode === "edge") {
      const response = await client.functions.invoke("change-password", { body: { password } });
      if (response.error) {
        // FunctionsHttpError keeps a non-2xx JSON body in its Response context.
        let partial = response.data;
        try { partial = await response.error.context?.clone().json() || partial; } catch { /* Unknown response. */ }
        return outcome(partial?.password_changed === true ? "account_pending" : "unknown");
      }
      if (response.data?.success !== true) {
        return outcome(response.data?.password_changed === true ? "account_pending" : "unknown");
      }
      passwordConfirmed = true;
    } else {
      const response = await client.auth.updateUser({ password });
      if (response.error || response.data?.user?.id !== userId) return outcome("unknown");
      passwordConfirmed = true;
      if (profile.must_change_password) {
        const saved = await client.from("profiles").update({ must_change_password: false })
          .eq("id", userId).select("id, must_change_password").single();
        if (saved.error || saved.data?.id !== userId || saved.data.must_change_password !== false) {
          return outcome("account_pending");
        }
      }
    }

    // A successful endpoint response alone is insufficient for workspace access.
    const current = await client.auth.getUser();
    if (current.error || current.data?.user?.id !== userId) return outcome("account_pending");
    const confirmed = await readProfile(client, userId);
    if (confirmed.must_change_password !== false) return outcome("account_pending");
    return { status: "confirmed", userId };
  } catch {
    return outcome(passwordConfirmed ? "account_pending" : "unknown");
  }
}
