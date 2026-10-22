// notebook-voice: everything the EN Helper needs on the server.
//
//   { action: "analyze", entry_id }   right after the first recording saves:
//                                     transcribe it and fill in whatever it
//                                     already answers; returns the row
//   { action: "answer", entry_id,     one spoken answer to a follow-up
//     question, options?, audio }     question: its text, and the matching
//                                     option when the question has choices
//   { action: "finish", entry_id }    every question answered: write the
//                                     polished version (in the background)
//   { action: "process", entry_id }   the original one-shot flow, kept for
//                                     Helpers still on the old page
//
// The first four are called with the student's own token.
//   { action: "tick" }                called every 15 minutes by pg_cron
//                                     (x-cron-secret header): sends
//                                     end-of-meeting reminders and retries any
//                                     voice entry the AI hasn't finished
//
// The entry is already saved, and its attendance already claimed, before any
// of this runs. Nothing here can lose an entry: the worst case is an entry
// that shows "Polishing..." until the next tick tries again.
//
// Deploy with --no-verify-jwt: the cron call carries a shared secret, not a
// user token, so this function checks callers itself (see EN_HELPER.md).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
// @ts-ignore: esm.sh's types claim no default export; the module has one (send-push uses it the same way).
import webpush from "https://esm.sh/web-push@3.6.7";
import { transcribe, polish, cleanAiFields, extractFields, matchChoice, polishText, screenText } from "./ai.ts";
import { decodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const AUDIO_BUCKET = "notebook-audio";
const MAX_ATTEMPTS = 5;
const HOME_TEAM = "7196";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: { action?: string; entry_id?: string; question?: string; options?: string[]; audio?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const cronSecret = Deno.env.get("CRON_SECRET") || "";
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;

  try {
    if (body.action === "tick") {
      if (!isCron) return json({ error: "tick is for the scheduler" }, 401);
      return json(await tick(admin));
    }

    if (["process", "analyze", "answer", "finish"].includes(body.action || "")) {
      if (!body.entry_id) return json({ error: "entry_id required" }, 400);
      if (!isCron) {
        const caller = await callerProfile(admin, req);
        if (!caller) return json({ error: "sign in first" }, 401);
        const { data: entry } = await admin
          .from("notebook_entries").select("id, team_number").eq("id", body.entry_id).maybeSingle();
        if (!entry) return json({ error: "no such entry" }, 404);
        // A mentor on two teams (extra_teams) may be writing for either.
        const callerTeams = new Set([teamKey(caller.team_number), ...((caller.extra_teams || []) as string[]).map(teamKey)]);
        if (!callerTeams.has(teamKey(entry.team_number))) return json({ error: "not your team" }, 403);
      }

      // The student is waiting on these two, so they answer directly.
      if (body.action === "analyze") return json(await analyzeEntry(admin, body.entry_id));
      if (body.action === "answer") {
        if (!body.audio || !body.question) return json({ error: "question and audio required" }, 400);
        return json(await answerQuestion(admin, body.entry_id, body.question, body.options || [], body.audio));
      }

      if (body.action === "finish") {
        await admin.from("notebook_entries")
          .update({ ai_status: "pending", ai_attempts: 0, ai_error: null, ai_updated_at: new Date().toISOString() })
          .eq("id", body.entry_id);
      }
      // Answer straight away and keep working. The student's phone may close
      // the Helper the moment it sees "Saved", and that must not cancel this.
      const work = processEntry(admin, body.entry_id);
      // deno-lint-ignore no-explicit-any
      const rt = (globalThis as any).EdgeRuntime;
      if (rt?.waitUntil) { rt.waitUntil(work); return json({ accepted: true }, 202); }
      return json(await work);
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    console.error("notebook-voice error:", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

// ─── Who is calling ──────────────────────────────────────────────────────────

async function callerProfile(admin: SupabaseClient, req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data } = await admin.auth.getUser(token);
  const user = data?.user;
  if (!user) return null;
  const { data: profile } = await admin
    .from("profiles").select("id, display_name, team_number, extra_teams").eq("id", user.id).maybeSingle();
  return profile;
}

// NULL and '7196' both mean Radical, the same rule as src/lib/teamScope.js.
function teamKey(n: unknown): string {
  const s = String(n ?? "").trim();
  return s && s !== HOME_TEAM ? s : "";
}

// ─── One voice entry: clip -> transcript -> filled-in entry ─────────────────

async function processEntry(admin: SupabaseClient, id: string) {
  // Not set up yet: leave it waiting rather than spend its retries on errors.
  // Once the Cloudflare secrets are in, the next tick (or the student opening
  // EN Helper) picks it up with all five tries left.
  if (!Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || !Deno.env.get("CLOUDFLARE_API_TOKEN")) {
    return { id, status: "waiting for Cloudflare secrets" };
  }

  // Claim it, so two callers (the Helper and the 15 minute tick) can't both
  // spend AI allowance on the same entry.
  const { data: claimed } = await admin
    .from("notebook_entries")
    .update({ ai_status: "working", ai_updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("ai_status", ["pending", "failed"])
    .lt("ai_attempts", MAX_ATTEMPTS)
    .select("*");
  const entry = claimed?.[0];
  if (!entry) return { id, status: "skipped" };

  await admin.from("notebook_entries").update({ ai_attempts: (entry.ai_attempts || 0) + 1 }).eq("id", id);

  try {
    let transcript: string = entry.transcript || "";

    if (!transcript) {
      if (!entry.audio_path) throw new Error("No recording and no transcript");
      const { data: blob, error } = await admin.storage.from(AUDIO_BUCKET).download(entry.audio_path);
      if (error || !blob) throw new Error(`Could not download the clip: ${error?.message || "missing"}`);
      transcript = await screenText(await transcribe(new Uint8Array(await blob.arrayBuffer())));

      // Saved the moment it exists, then the clip goes. If the AI step below
      // fails, the retry starts from this text and never needs the audio.
      await admin.from("notebook_entries")
        .update({ transcript, audio_path: null }).eq("id", id);
      await admin.storage.from(AUDIO_BUCKET).remove([entry.audio_path]).catch(() => {});
    }

    // Still being answered: the transcript is all there is to do for now.
    // The write-up waits for "finish", once every question has an answer.
    if (entry.complete === false) {
      await admin.from("notebook_entries").update({
        ai_status: "transcribed", ai_error: null, ai_updated_at: new Date().toISOString(),
      }).eq("id", id);
      return { id, status: "transcribed" };
    }

    // Complete, with its answers given one by one: write it up from all of it.
    if (entry.what_did || (entry.signals || []).length) {
      const polished = await screenText(await polishText(transcript, entry));
      await admin.from("notebook_entries").update({
        polished, ai_status: "done", ai_error: null, ai_updated_at: new Date().toISOString(),
      }).eq("id", id);
      return { id, status: "done" };
    }

    // From here on, the original one-shot flow (a Helper still on the old
    // page): one recording, everything read from it.

    // Silence, or a pocket recording. The entry stays (it is still the
    // student's), but there is nothing to polish.
    if (transcript.split(/\s+/).filter(Boolean).length < 3) {
      await admin.from("notebook_entries").update({
        ai_status: "empty", ai_error: null, ai_updated_at: new Date().toISOString(),
      }).eq("id", id);
      return { id, status: "empty" };
    }

    const fields = cleanAiFields(await polish(transcript));
    fields.polished = await screenText(fields.polished);
    await admin.from("notebook_entries").update({
      ...fields,
      ai_status: "done",
      ai_error: null,
      ai_updated_at: new Date().toISOString(),
    }).eq("id", id);
    return { id, status: "done" };
  } catch (err) {
    const message = String((err as Error)?.message || err).slice(0, 500);
    console.error(`notebook-voice: entry ${id} failed:`, message);
    await admin.from("notebook_entries").update({
      ai_status: "failed", ai_error: message, ai_updated_at: new Date().toISOString(),
    }).eq("id", id);
    return { id, status: "failed", error: message };
  }
}

// ─── Every question answered ────────────────────────────────────────────────

async function ensureTranscript(admin: SupabaseClient, entry: Record<string, any>) {
  if (entry.transcript || !entry.audio_path) return entry.transcript || "";
  const { data: blob, error } = await admin.storage.from(AUDIO_BUCKET).download(entry.audio_path);
  if (error || !blob) throw new Error(`Could not download the clip: ${error?.message || "missing"}`);
  const transcript = await screenText(await transcribe(new Uint8Array(await blob.arrayBuffer())));
  await admin.from("notebook_entries").update({ transcript, audio_path: null }).eq("id", entry.id);
  await admin.storage.from(AUDIO_BUCKET).remove([entry.audio_path]).catch(() => {});
  return transcript;
}

// The first recording, read once for whatever it already answers. Only empty
// fields are filled, so nothing the student answered is overwritten, and a
// failure here just means the Helper asks every question.
async function analyzeEntry(admin: SupabaseClient, id: string) {
  const { data: entry } = await admin.from("notebook_entries").select("*").eq("id", id).maybeSingle();
  if (!entry) return { error: "no such entry" };
  if (!Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || !Deno.env.get("CLOUDFLARE_API_TOKEN")) return { entry };

  let patch: Record<string, unknown> = {};
  try {
    const transcript = await ensureTranscript(admin, entry);
    patch = { ai_status: "transcribed", ai_error: null, ai_updated_at: new Date().toISOString() };

    if (transcript.split(/\s+/).filter(Boolean).length >= 3) {
      const ai = await extractFields(transcript);
      const confirmed = new Set<string>(entry.voice_state?.confirmed || []);
      if (!entry.what_did && ai.what_did) patch.what_did = ai.what_did;
      if (!entry.why_option && ai.why_option) patch.why_option = ai.why_option;
      if (!entry.next_step && ai.next_step) patch.next_step = ai.next_step;
      if (!confirmed.has("project")) patch.category = ai.category;
      if (!confirmed.has("mentor") && ai.mentor) {
        patch.mentor_help = ai.mentor === "yes";
        confirmed.add("mentor");
      }
      if (!(entry.signals || []).length && ai.signals.length) patch.signals = ai.signals;
      const data: Record<string, Record<string, string>> = { ...(entry.signal_data || {}) };
      for (const [key, answers] of Object.entries(ai.signal_data)) data[key] = { ...answers, ...(data[key] || {}) };
      patch.signal_data = data;
      patch.voice_state = { ...(entry.voice_state || {}), confirmed: [...confirmed] };
    }
  } catch (err) {
    const message = String((err as Error)?.message || err).slice(0, 500);
    console.error(`notebook-voice: analyze ${id} failed:`, message);
    patch = { ai_error: message, ai_updated_at: new Date().toISOString() };
  }
  const { data: updated } = await admin.from("notebook_entries").update(patch).eq("id", id).select("*").maybeSingle();
  return { entry: updated || entry };
}

// One spoken answer. Its words join the transcript (the "what I said" record
// judges see), and a choice question also gets the option it matches.
async function answerQuestion(admin: SupabaseClient, id: string, question: string, options: string[], audio: string) {
  const heard = await transcribe(decodeBase64(audio), question);
  if (!heard) return { text: "", option: null };
  // Screened before it's shown back ("Got it: ...") or stored. The database's
  // word filter is applied here too, so the echo matches what's saved. If
  // nothing is left, the Helper says it didn't come through, exactly as it
  // does for silence: nobody is told something was taken out.
  const screened = await screenText(heard);
  const { data: clean } = await admin.rpc("clean_notebook_text_tidy", { t: screened });
  const said = String(clean ?? screened).trim();
  if (!said.replace(/[\s.,!?;:]/g, "")) return { text: "", option: null };
  const option = options.length ? await matchChoice(said, question, options).catch(() => null) : null;
  const { data: entry } = await admin.from("notebook_entries").select("transcript").eq("id", id).maybeSingle();
  const transcript = `${entry?.transcript || ""}\n\nQ: ${question}\nA: ${said}`.trim();
  await admin.from("notebook_entries").update({ transcript }).eq("id", id);
  return { text: said, option };
}

// ─── Every 15 minutes ───────────────────────────────────────────────────────

async function tick(admin: SupabaseClient) {
  const reminders = await sendReminders(admin).catch((err) => {
    console.error("notebook-voice: reminders failed:", err);
    return { error: String(err?.message || err) };
  });
  const retries = await retryUnfinished(admin).catch((err) => {
    console.error("notebook-voice: retries failed:", err);
    return { error: String(err?.message || err) };
  });
  return { reminders, retries };
}

// A 'working' entry older than this was abandoned mid-way (the function was
// stopped), so it goes back in the queue.
const STUCK_MINUTES = 10;
// Leave brand new entries to the Helper's own call.
const RETRY_AFTER_MINUTES = 2;
// Stay well inside the function's time limit.
const RETRIES_PER_TICK = 4;

async function retryUnfinished(admin: SupabaseClient) {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

  await admin.from("notebook_entries")
    .update({ ai_status: "failed", ai_error: "Stopped mid-way; retrying" })
    .eq("ai_status", "working")
    .lt("ai_updated_at", ago(STUCK_MINUTES));

  const { data: due } = await admin.from("notebook_entries")
    .select("id")
    .eq("source", "voice")
    .in("ai_status", ["pending", "failed"])
    .lt("ai_attempts", MAX_ATTEMPTS)
    .lt("created_at", ago(RETRY_AFTER_MINUTES))
    .order("created_at", { ascending: true })
    .limit(RETRIES_PER_TICK);

  const results = [];
  for (const row of due || []) results.push(await processEntry(admin, row.id));
  return results;
}

// Meeting times are stored as local wall-clock times ("14:00"), so "now" has
// to be read in the team's time zone, not the server's UTC.
function localNow(tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toMinutes = (hhmm: string | null) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Reminders go out this long after a meeting's scheduled end, to cover a
// meeting that runs a little over, and stop being sent this long after it.
const REMIND_AFTER_MIN = 15;
const REMIND_UNTIL_MIN = 4 * 60;

async function sendReminders(admin: SupabaseClient) {
  const tz = Deno.env.get("TEAM_TIMEZONE") || "America/Chicago";
  const { date, minutes } = localNow(tz);

  const { data: meetings } = await admin.from("calendar_events")
    .select("id, end_time, team_number")
    .eq("date_key", date)
    .eq("category", "meeting");

  const due = (meetings || []).filter((m) => {
    const end = toMinutes(m.end_time);
    return end !== null && minutes >= end + REMIND_AFTER_MIN && minutes <= end + REMIND_UNTIL_MIN;
  });
  if (due.length === 0) return { date, sent: 0 };

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:team@example.com",
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  let sent = 0;
  const doneTeams = new Set<string>();
  for (const meeting of due) {
    const team = teamKey(meeting.team_number);
    if (doneTeams.has(team)) continue; // two meetings on one day: one reminder
    doneTeams.add(team);

    // Rows for this team: Radical's are unstamped (NULL), like teamScope().
    // deno-lint-ignore no-explicit-any
    const scoped = (q: any) => (team ? q.eq("team_number", team) : q.is("team_number", null));

    const { data: sessions } = await scoped(
      admin.from("attendance_sessions").select("id").eq("session_date", date),
    );
    const session = sessions?.[0];
    if (!session) continue; // no attendance taken, so nobody to remind

    const [{ data: records }, { data: written }, { data: already }] = await Promise.all([
      admin.from("attendance_records").select("username, status, marked_by").eq("session_id", session.id),
      // An unfinished voice entry isn't written yet: its author still gets
      // the reminder, which takes them back to finish it.
      scoped(admin.from("notebook_entries").select("username").eq("meeting_date", date).eq("complete", true)),
      admin.from("notebook_reminders").select("username").eq("session_id", session.id),
    ]);

    // Everyone who was there. The notebook rule flips people who haven't
    // written yet to absent, so its absences count as "was there" too: they
    // are exactly the people this reminder is for.
    const attended = (records || [])
      .filter((r) => r.status === "present" || (r.status === "absent" && r.marked_by === "notebook-rule"))
      .map((r) => r.username);
    const skip = new Set([...(written || []), ...(already || [])].map((r) => r.username));
    const todo = [...new Set(attended)].filter((u) => !skip.has(u));
    if (todo.length === 0) continue;

    const { data: profiles } = await admin.from("profiles")
      .select("id, display_name, team_number, notification_prefs")
      .in("display_name", todo);

    for (const username of todo) {
      // Claim the reminder first; the unique key makes a second send for this
      // meeting impossible even if two ticks overlap.
      const { data: claimed } = await admin.from("notebook_reminders")
        .upsert({ session_id: session.id, username, meeting_date: date, team_number: team || null },
          { onConflict: "session_id,username", ignoreDuplicates: true })
        .select("id");
      if (!claimed?.length) continue;

      const profile = (profiles || []).find((p) => p.display_name === username && teamKey(p.team_number) === team);
      if (!profile || profile.notification_prefs?.enabled === false) continue;
      sent += await pushTo(admin, profile.id, date);
    }
  }
  return { date, sent };
}

async function pushTo(admin: SupabaseClient, userId: string, date: string) {
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs?.length) return 0;
  // EN Helper's own subscription if they installed it, so the tap opens the
  // Helper; otherwise the main app's, which opens the Helper page inside it.
  const helper = subs.filter((s) => s.app === "helper");
  const targets = helper.length ? helper : subs;

  const payload = JSON.stringify({
    title: "EN Helper",
    body: "How did today's meeting go? Tap and tell your notebook. It takes about a minute.",
    // Through the main app, the Helper opens inside Scrum and shows a way back.
    url: helper.length ? "/helper/" : "/helper/?from=app",
    tag: `en-helper-${date}`,
  });

  let sent = 0;
  const expired: string[] = [];
  for (const sub of targets) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      sent++;
    } catch (err) {
      // deno-lint-ignore no-explicit-any
      const code = (err as any)?.statusCode;
      if (code === 404 || code === 410) expired.push(sub.id);
      else console.error("notebook-voice: push failed:", code, (err as Error)?.message);
    }
  }
  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return sent ? 1 : 0;
}
