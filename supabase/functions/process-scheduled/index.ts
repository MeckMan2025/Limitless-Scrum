import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:team@example.com";

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all pending scheduled notifications that are due
    const { data: due, error: fetchErr } = await supabaseAdmin
      .from("scheduled_notifications")
      .select("*")
      .eq("status", "pending")
      .lte("send_at", new Date().toISOString());

    if (fetchErr) {
      console.error("Failed to fetch scheduled notifications:", fetchErr);
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!due || due.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all user profiles once, with their teams: a reminder goes only to
    // the team it was scheduled for. Radical is spelled NULL, '' or '7196'.
    const { data: allProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, notification_prefs, team_number, extra_teams");
    const teamKey = (t: unknown) => {
      const s = String(t ?? "").trim();
      return s === "" || s === "7196" ? "7196" : s;
    };
    const onTeam = (p: any, team: string) =>
      teamKey(p.team_number) === team ||
      (p.extra_teams || []).some((x: unknown) => teamKey(x) === team);

    let totalProcessed = 0;

    for (const sn of due) {
      // Mark as sent first to prevent duplicate processing by concurrent callers
      const { error: updateErr } = await supabaseAdmin
        .from("scheduled_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", sn.id)
        .eq("status", "pending"); // Only update if still pending (idempotent)

      if (updateErr) {
        console.error(`Failed to mark ${sn.id} as sent:`, updateErr);
        continue;
      }

      // Send in-app + push notifications to everyone on the reminder's team
      // (including the creator: they scheduled it, but they still want their
      // own reminder).
      const team = teamKey(sn.team_number);
      const profiles = (allProfiles || []).filter((p: any) => onTeam(p, team));
      if (profiles) {
        for (const p of profiles) {

          const notifId =
            String(Date.now()) +
            Math.random().toString(36).slice(2) +
            p.id.slice(0, 4);

          const baseBody = sn.body || "";
          const bodyWithSender = sn.created_by
            ? (baseBody ? `${baseBody} · scheduled by ${sn.created_by}` : `Scheduled by ${sn.created_by}`)
            : baseBody;

          const notifRecord = {
            id: notifId,
            user_id: p.id,
            type: sn.type || "calendar_event",
            title: sn.title,
            body: bodyWithSender,
            force: sn.force || false,
          };

          // Insert in-app notification
          await supabaseAdmin.from("notifications").insert(notifRecord);

          // Send web push (same pattern as send-push)
          const prefs = p.notification_prefs || {
            enabled: true,
            calendar: true,
            chat: true,
          };

          let shouldPush = true;
          if (!notifRecord.force) {
            if (!prefs.enabled) shouldPush = false;
            if (
              notifRecord.type === "calendar_event" &&
              !prefs.calendar
            )
              shouldPush = false;
          }

          if (shouldPush) {
            const { data: allSubscriptions } = await supabaseAdmin
              .from("push_subscriptions")
              .select("*")
              .eq("user_id", p.id);
            // Not EN Helper's: it only ever gets notebook reminders.
            const subscriptions = (allSubscriptions || []).filter((s: any) => s.app !== "helper");

            if (subscriptions && subscriptions.length > 0) {
              const payload = JSON.stringify({
                title: notifRecord.title || "Notification",
                body: notifRecord.body || "",
              });
              const expiredIds: string[] = [];

              for (const sub of subscriptions) {
                try {
                  await webpush.sendNotification(
                    {
                      endpoint: sub.endpoint,
                      keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    payload
                  );
                } catch (err: any) {
                  if (err.statusCode === 410 || err.statusCode === 404) {
                    expiredIds.push(sub.id);
                  } else {
                    console.error("Push send error:", err.statusCode, err.message);
                  }
                }
              }

              if (expiredIds.length > 0) {
                await supabaseAdmin
                  .from("push_subscriptions")
                  .delete()
                  .in("id", expiredIds);
              }
            }
          }
        }
      }

      totalProcessed++;
    }

    return new Response(
      JSON.stringify({ processed: totalProcessed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("process-scheduled error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
