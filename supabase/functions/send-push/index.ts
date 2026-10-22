// send-push: delivers a notification via Web Push (browsers/PWA) AND APNs (native iOS).
// Reads `apns_tokens` for the user and pushes to Apple if any exist; same for `push_subscriptions` (web).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

// ─── APNs helpers ─────────────────────────────────────────────────────────
// Sign a JWT with ES256 using the .p8 auth key from Apple Developer.
// Cached because Apple allows reusing the same JWT for up to ~1 hour.
let cachedApnsJwt: { token: string; expires: number } | null = null;

function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getApnsJwt(keyId: string, teamId: string, p8: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && cachedApnsJwt.expires > now + 60) return cachedApnsJwt.token;

  const header = { alg: "ES256", kid: keyId };
  const payload = { iss: teamId, iat: now };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;

  const keyData = pemToArrayBuffer(p8);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    cryptoKey,
    new TextEncoder().encode(data),
  );
  const sigB64 = base64UrlEncode(sigBuf);
  const token = `${data}.${sigB64}`;
  cachedApnsJwt = { token, expires: now + 50 * 60 }; // refresh every 50 min
  return token;
}

async function sendApns(
  token: string,
  bundleId: string,
  jwt: string,
  payload: { title: string; body: string },
  useSandbox: boolean,
): Promise<{ ok: boolean; status: number; reason?: string }> {
  const host = useSandbox ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
        badge: 1,
      },
    }),
  });
  if (res.ok) return { ok: true, status: res.status };
  const text = await res.text();
  return { ok: false, status: res.status, reason: text };
}

// ─── Main handler ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:team@example.com";

    // APNs config (optional — if missing, native push is silently skipped)
    const apnsKeyId = Deno.env.get("APNS_KEY_ID") || "";
    const apnsTeamId = Deno.env.get("APNS_TEAM_ID") || "";
    const apnsP8 = Deno.env.get("APNS_AUTH_KEY") || "";
    const apnsSandbox = (Deno.env.get("APNS_USE_SANDBOX") || "false").toLowerCase() === "true";

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { record } = await req.json();
    if (!record || !record.user_id) {
      return new Response(JSON.stringify({ error: "Missing record or user_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, type, title, body, force } = record;
    const debug: Record<string, unknown> = {
      user_id,
      hasServiceRoleKey: !!serviceRoleKey,
      hasVapidPublic: !!vapidPublicKey,
      hasVapidPrivate: !!vapidPrivateKey,
      vapidPublicTail: vapidPublicKey ? vapidPublicKey.slice(-8) : null,
      vapidSubject,
    };

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", user_id)
      .single();
    if (profileError) debug.profileError = profileError.message;
    const prefs = profile?.notification_prefs || { enabled: true, calendar: true, chat: true };

    if (!force) {
      if (!prefs.enabled) {
        return new Response(JSON.stringify({ skipped: true, reason: "notifications disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (type === "calendar_event" && !prefs.calendar) {
        return new Response(JSON.stringify({ skipped: true, reason: "calendar notifications disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (type === "chat_message" && !prefs.chat) {
        return new Response(JSON.stringify({ skipped: true, reason: "chat notifications disabled" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const messagePayload = { title: title || "Notification", body: body || "" };

    // ─── Web Push ───────────────────────────────────────────────────────
    let webSent = 0;
    const webExpired: string[] = [];
    const webErrors: string[] = [];
    const { data: allWebSubs, error: webSubsError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);
    // EN Helper's own subscription only ever gets notebook reminders, which
    // notebook-voice sends itself. Everything else goes to the main app.
    const webSubs = (allWebSubs || []).filter((s: any) => s.app !== "helper");
    debug.webSubsCount = Array.isArray(webSubs) ? webSubs.length : null;
    if (webSubsError) debug.webSubsError = webSubsError.message;

    if (webSubs && webSubs.length > 0) {
      const payload = JSON.stringify(messagePayload);
      for (const sub of webSubs) {
        const host = (() => {
          try { return new URL(sub.endpoint).host; } catch { return "?"; }
        })();
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          webSent++;
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            webExpired.push(sub.id);
            webErrors.push(`${host} → ${err.statusCode} expired`);
          } else {
            webErrors.push(`${host} → ${err.statusCode || "?"}: ${String(err.message || err).slice(0, 200)}`);
          }
        }
      }
      if (webExpired.length > 0) {
        await supabaseAdmin.from("push_subscriptions").delete().in("id", webExpired);
      }
    }
    debug.webExpired = webExpired.length;
    if (webErrors.length > 0) debug.webErrors = webErrors.slice(0, 5);

    // ─── APNs Push ──────────────────────────────────────────────────────
    let apnsSent = 0;
    const apnsExpired: string[] = [];
    debug.apnsConfigured = !!(apnsKeyId && apnsTeamId && apnsP8);
    if (apnsKeyId && apnsTeamId && apnsP8) {
      const { data: apnsRows, error: apnsRowsError } = await supabaseAdmin
        .from("apns_tokens")
        .select("*")
        .eq("user_id", user_id);
      debug.apnsRowsCount = Array.isArray(apnsRows) ? apnsRows.length : null;
      if (apnsRowsError) debug.apnsRowsError = apnsRowsError.message;

      if (apnsRows && apnsRows.length > 0) {
        try {
          const jwt = await getApnsJwt(apnsKeyId, apnsTeamId, apnsP8);
          for (const row of apnsRows) {
            const res = await sendApns(row.token, row.bundle_id || "org.radicalrobotics.scrum", jwt, messagePayload, apnsSandbox);
            if (res.ok) apnsSent++;
            else if (res.status === 410) apnsExpired.push(row.id);
            else console.error("APNs error:", res.status, res.reason);
          }
          if (apnsExpired.length > 0) {
            await supabaseAdmin.from("apns_tokens").delete().in("id", apnsExpired);
          }
        } catch (err: any) {
          console.error("APNs JWT/send failure:", err.message);
        }
      }
    }

    const totalSent = webSent + apnsSent;
    debug.webSent = webSent;
    debug.apnsSent = apnsSent;
    if (totalSent === 0) {
      return new Response(JSON.stringify({ skipped: true, reason: "no subscriptions", debug }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ sent: totalSent, web: webSent, apns: apnsSent, expired: webExpired.length + apnsExpired.length, debug }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
