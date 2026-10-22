// The AI half of notebook-voice: clip -> transcript -> filled-in entry.
// Kept apart from index.ts so it can be tried on its own against Workers AI
// (see EN_HELPER.md, "Trying the AI step").

import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import schema from "./notebookSchema.json" with { type: "json" };

// The speech model is fixed. The text model can be swapped with the\n// CF_TEXT_MODEL secret (it must be one Workers AI lists as supporting JSON mode).
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";
const DEFAULT_TEXT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Words a shop full of FTC students says that speech-to-text gets wrong.
// Whisper gets this as a hint before it listens, and the polish step gets it
// to repair whatever still came out misheard ("odd geometry" -> odometry).
// Add this season's game pieces and your own part names freely.
const GLOSSARY = [
  "FTC", "FIRST Tech Challenge", "engineering notebook", "Inspire Award", "Think Award",
  "Control Award", "Design Award", "Innovate Award", "Motivate Award", "Connect Award",
  "odometry", "dead wheels", "encoder", "IMU", "gyro", "PID", "feedforward", "kP", "kD",
  "servo", "motor", "gear ratio", "torque", "RPM", "drivetrain", "mecanum", "tank drive",
  "intake", "outtake", "linear slides", "viper slides", "lift", "claw", "wrist", "arm", "pivot",
  "Control Hub", "Expansion Hub", "Driver Hub", "REV", "goBILDA", "Tetrix", "Android Studio",
  "OnBot Java", "Blocks", "FTC SDK", "Road Runner", "Pedro Pathing", "AprilTag", "Limelight",
  "autonomous", "auto", "TeleOp", "driver practice", "scrimmage", "qualifier", "league meet",
  "alliance", "match", "CAD", "Onshape", "Fusion 360", "3D print", "PLA", "PETG", "TPU",
  "polycarbonate", "aluminum extrusion", "standoff", "bearing", "shaft", "hex shaft", "zip tie",
];

// ─── Cloudflare Workers AI ──────────────────────────────────────────────────

async function runModel(model: string, input: unknown) {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!account || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  // A spent daily allowance comes back here too. The entry is marked failed
  // and the tick tries again; the allowance resets at 00:00 UTC.
  if (!res.ok) throw new Error(`Workers AI ${model} ${res.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  if (data?.success === false) throw new Error(`Workers AI ${model}: ${JSON.stringify(data.errors).slice(0, 300)}`);
  return data.result;
}

// `question`, when given, is what the student was just asked: it tells
// Whisper what kind of answer to expect.
export async function transcribe(audio: Uint8Array, question = ""): Promise<string> {
  const context = question
    ? `A student on an FTC robotics team answering: "${question}"`
    : "A student on an FTC robotics team describing today's meeting.";
  const result = await runModel(WHISPER_MODEL, {
    audio: encodeBase64(audio),
    language: "en",
    vad_filter: true,
    initial_prompt: `${context} ${GLOSSARY.join(", ")}.`,
  });
  return String(result?.text || "").trim();
}

type SignalSchema = (typeof schema.signals)[number];

// The answer the model must give, with every fixed choice as an enum, so JSON
// mode can't hand back an option the app doesn't have.
function answerSchema(full = true) {
  const signalData: Record<string, unknown> = {};
  for (const sig of schema.signals as SignalSchema[]) {
    const props: Record<string, unknown> = {};
    for (const q of sig.questions) {
      // Free-text answers are capped: left open, the model sometimes loops
      // inside one ("and then with the new setup...") until it runs out of
      // room and the whole answer is cut off.
      props[q.id] = "options" in q && q.options ? { type: "string", enum: q.options } : { type: "string", maxLength: 160 };
    }
    signalData[sig.key] = { type: "object", properties: props };
  }
  return {
    type: "object",
    properties: {
      category: { type: "string", enum: schema.categories },
      what_did: { type: "string" },
      why_option: { type: "string", enum: schema.whyOptions },
      why_note: { type: "string" },
      mentor_help: { type: "boolean" },
      mentor_name: { type: "string" },
      next_step: { type: "string" },
      signals: { type: "array", items: { type: "string", enum: schema.signals.map((s) => s.key) } },
      ...(full ? { signal_data: { type: "object", properties: signalData } } : {}),
      polished: { type: "string", maxLength: 2500 },
    },
    required: ["category", "what_did", "why_option", "signals", ...(full ? ["signal_data"] : []), "polished"],
  };
}

function systemPrompt() {
  const signals = (schema.signals as SignalSchema[]).map((s) => {
    const qs = s.questions.map((q) => {
      const when = "onlyWhen" in q && q.onlyWhen ? ` (only when ${q.onlyWhen})` : "";
      const opts = "options" in q && q.options ? ` One of: ${q.options.map((o) => `"${o}"`).join(", ")}` : " Free text.";
      return `    - ${q.id}: ${q.label}${when}${opts}`;
    }).join("\n");
    return `- ${s.key}: "${s.label}" (${s.helper})\n${qs}`;
  }).join("\n");

  return `You turn a high school FTC robotics student's spoken recap of a team meeting into their engineering notebook entry.

The transcript is the student's own words and is the only source of facts. The microphone may have picked up other people nearby: leave out anything that isn't the student describing their work, and never include profanity, insults, or anything not appropriate for a school notebook. Never add a fact, number, part, person, result or plan that the student did not say. If something wasn't said, leave that answer out rather than guessing.

Fields:
- category: Technical (building, hardware, mechanical design, CAD), Programming (code, software, autonomous, sensors), or Business (outreach, fundraising, sponsors, marketing, the notebook itself).
- what_did: one plain sentence saying what they worked on.
- why_option: the closest reason this work mattered, from the allowed list. Robot building, fixing or testing work almost always "Directly advances the robot design" or "Fixes a critical bug or issue". Use "Other" (and say why in why_note) only when nothing on the list is close.
- mentor_help: true only if they said a mentor or coach helped. mentor_name only if they named one.
- next_step: what they said happens next, or empty.
- signals: every one of these the student clearly described, usually one to four. If an adult or teammate helped them, that is "help". If they worked with a named teammate, that is "collaborated". Testing something is "tested"; changing something because of a result is "improved". Never include one that wasn't described.
${signals}
- signal_data: an object with one key per signal you chose. Under each, answer that signal's questions that the transcript answers, in a few words each (under 15). Choice answers must be one of that question's options exactly. Leave out questions the transcript doesn't answer.
- polished: the notebook entry itself. First person, past tense, written the way a thoughtful student would write it: clear, specific, and in their voice. Keep every concrete detail they gave (measurements, counts, part names, what failed, what they changed and why). Fix speech-to-text mistakes using this glossary: ${GLOSSARY.join(", ")}. Remove filler ("um", "like", "so yeah"). Two short paragraphs at most. Do not use em dashes. Do not use headings or bullet points.

Answer with JSON only. Use straight double quotes for every key and string, never curly quotes.

Example. Transcript: "So I was coding the arm, um, the PID was overshooting like crazy so Sam and I lowered kP and tried it a bunch, it's way better now, still a little wobble. Tomorrow add feedforward."
Answer:
{"category":"Programming","what_did":"I tuned the PID controller on the arm.","why_option":"Fixes a critical bug or issue","why_note":"","mentor_help":false,"mentor_name":"","next_step":"Add feedforward to the arm controller.","signals":["tested","improved","collaborated"],"signal_data":{"tested":{"what":"The arm's PID tuning after lowering kP","how":"Repeated trials","outcome":"It partly worked"},"improved":{"what":"Lowered kP on the arm's PID controller","why":"Test results","better":"Somewhat","next":"Add feedforward"},"collaborated":{"who":"Someone in my group","what":"Tuning the arm's PID controller"}},"polished":"I worked on the arm code with Sam. The PID controller was overshooting a lot, so we lowered kP and tested it several times. It is much better now, but there is still a little wobble. Next time I plan to add feedforward."}`;
}

// JSON mode isn't airtight: now and then the model closes a string with a
// curly quote, and the answer won't parse. Try what it sent, then the same
// with curly quotes straightened, from either place Workers AI puts it.
// deno-lint-ignore no-explicit-any
function readAnswer(result: any) {
  for (const c of [result?.response, result?.choices?.[0]?.message?.content]) {
    if (c && typeof c === "object") return c;
    if (typeof c !== "string") continue;
    for (const text of [c, c.replace(/[\u201C\u201D]/g, '"')]) {
      try {
        const out = JSON.parse(text);
        if (out && typeof out === "object") return out;
      } catch { /* try the next */ }
    }
  }
  return null;
}

export async function polish(transcript: string) {
  const model = Deno.env.get("CF_TEXT_MODEL") || DEFAULT_TEXT_MODEL;
  const ask = (full: boolean, temperature: number) => runModel(model, {
    messages: [
      { role: "system", content: systemPrompt() + (full ? "" : "\n\nThis time leave out signal_data.") },
      { role: "user", content: `Transcript:\n"""${transcript}"""` },
    ],
    response_format: { type: "json_schema", json_schema: answerSchema(full) },
    max_tokens: 1500,
    temperature,
  });
  // The full answer twice (the second with no randomness), then once without
  // the follow-up answers, which is where the model goes wrong when it does.
  // An entry without follow-ups still gets its write-up, category and signals.
  for (const [full, temperature] of [[true, 0.2], [true, 0], [false, 0]] as const) {
    const out = readAnswer(await ask(full, temperature));
    if (out) return full ? out : { ...out, signal_data: {} };
    console.warn(`notebook-voice: unreadable answer (full=${full}, temperature=${temperature})`);
  }
  throw new Error("The AI's answer wasn't valid JSON, three times");
}

// The model is asked for valid choices, but this is the check that counts:
// anything outside the app's own lists is dropped, never stored.
// deno-lint-ignore no-explicit-any
export function cleanAiFields(ai: any) {
  const text = (v: unknown, max: number) =>
    typeof v === "string" ? v.replace(/\s*\u2014\s*/g, ", ").trim().slice(0, max) : "";

  const signalKeys = new Set(schema.signals.map((s) => s.key));
  const signals = [...new Set<string>(Array.isArray(ai?.signals) ? ai.signals : [])].filter((k) => signalKeys.has(k));

  const signal_data: Record<string, Record<string, string>> = {};
  for (const key of signals) {
    const sig = (schema.signals as SignalSchema[]).find((s) => s.key === key)!;
    const given = ai?.signal_data?.[key] || {};
    const answers: Record<string, string> = {};
    for (const q of sig.questions) {
      const v = text(given[q.id], 500);
      if (!v) continue;
      if ("options" in q && q.options && !q.options.includes(v)) continue;
      answers[q.id] = v;
    }
    signal_data[key] = answers;
  }

  const why_option = schema.whyOptions.includes(ai?.why_option) ? ai.why_option : "Other";
  const mentor_help = ai?.mentor_help === true;
  return {
    category: schema.categories.includes(ai?.category) ? ai.category : "Technical",
    what_did: text(ai?.what_did, 300),
    why_option,
    why_note: why_option === "Other" ? text(ai?.why_note, 300) : "",
    mentor_help,
    mentor_name: mentor_help ? text(ai?.mentor_name, 80) : "",
    next_step: text(ai?.next_step, 300),
    signals,
    signal_data,
    polished: text(ai?.polished, 4000),
  };
}

// ─── EN Helper, part 2: every question answered ─────────────────────────────
//
// The first recording is read once for whatever it already answers
// (extractFields). The Helper asks the student everything still empty, one
// question at a time, and each spoken answer is transcribed (and matched to
// a choice when the question has choices). At the end, polishText writes the
// notebook version from everything the student said.

// The first pass. Unlike polish(), it must leave a question empty when the
// student didn't actually answer it: the Helper asks those, and a guessed
// answer would skip a question the student never answered.
export async function extractFields(transcript: string) {
  const model = Deno.env.get("CF_TEXT_MODEL") || DEFAULT_TEXT_MODEL;
  const signalData: Record<string, unknown> = {};
  for (const sig of schema.signals as SignalSchema[]) {
    const props: Record<string, unknown> = {};
    for (const q of sig.questions) {
      props[q.id] = "options" in q && q.options
        ? { type: "string", enum: ["", ...q.options] }
        : { type: "string", maxLength: 160 };
    }
    signalData[sig.key] = { type: "object", properties: props };
  }
  const answerSchema = {
    type: "object",
    properties: {
      category: { type: "string", enum: schema.categories },
      what_did: { type: "string", maxLength: 300 },
      why_option: { type: "string", enum: ["", ...schema.whyOptions] },
      mentor: { type: "string", enum: ["yes", "no", "not said"] },
      next_step: { type: "string", maxLength: 300 },
      signals: { type: "array", items: { type: "string", enum: schema.signals.map((s) => s.key) } },
      signal_data: { type: "object", properties: signalData },
    },
    required: ["category", "what_did", "why_option", "mentor", "next_step", "signals", "signal_data"],
  };
  const signals = (schema.signals as SignalSchema[]).map((s) => {
    const qs = s.questions.map((q) => {
      const opts = "options" in q && q.options ? ` One of: ${q.options.map((o) => `"${o}"`).join(", ")}` : " Free text.";
      return `    - ${q.id}: ${q.label}${opts}`;
    }).join("\n");
    return `- ${s.key}: "${s.label}" (${s.helper})\n${qs}`;
  }).join("\n");

  const system = `A high school FTC robotics student recorded a spoken recap of a team meeting. Fill in their engineering notebook entry from it.

The microphone may have picked up other people nearby. Use only what the student says about their own work, and never include profanity, insults, or anything not appropriate for a school notebook.

This is a first pass: anything you leave empty, the student will be asked next. So only fill in what the student actually said. Never guess, never infer, never fill a field just because it is likely. Empty is always the right answer when they didn't say it.

- category: Technical (building, hardware, mechanical design, CAD), Programming (code, software, autonomous, sensors), or Business (outreach, fundraising, sponsors, marketing, the notebook). Always pick one.
- what_did: one plain first-person sentence saying what they worked on, or empty.
- why_option: only if they said why the work mattered; otherwise "".
- mentor: "yes" if they said a mentor or coach helped, "no" if they said they did it on their own, otherwise "not said".
- next_step: what they said happens next, or empty.
- signals: which of these they described. Usually one to three.
${signals}
- signal_data: one key per signal you chose. Under each, only the questions their words answer, in a few words each (under 15). Choice answers must be one of the options exactly; use "" when not said.

Answer with JSON only, using straight double quotes.`;

  const ask = (temperature: number) => runModel(model, {
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Transcript:\n"""${transcript}"""` },
    ],
    response_format: { type: "json_schema", json_schema: answerSchema },
    max_tokens: 1200,
    temperature,
  });
  for (const temperature of [0.1, 0]) {
    const out = readAnswer(await ask(temperature));
    if (out) return cleanExtract(out);
  }
  throw new Error("The AI's first pass wasn't valid JSON, twice");
}

// deno-lint-ignore no-explicit-any
function cleanExtract(ai: any) {
  const text = (v: unknown, max: number) =>
    typeof v === "string" ? v.replace(/\s*\u2014\s*/g, ", ").trim().slice(0, max) : "";
  const signalKeys = new Set(schema.signals.map((s) => s.key));
  const signals = [...new Set<string>(Array.isArray(ai?.signals) ? ai.signals : [])].filter((k) => signalKeys.has(k));
  const signal_data: Record<string, Record<string, string>> = {};
  for (const key of signals) {
    const sig = (schema.signals as SignalSchema[]).find((s) => s.key === key)!;
    const given = ai?.signal_data?.[key] || {};
    const answers: Record<string, string> = {};
    for (const q of sig.questions) {
      const v = text(given[q.id], 300);
      if (!v) continue;
      if ("options" in q && q.options && !q.options.includes(v)) continue;
      answers[q.id] = v;
    }
    signal_data[key] = answers;
  }
  return {
    category: schema.categories.includes(ai?.category) ? ai.category : "Technical",
    what_did: text(ai?.what_did, 300),
    why_option: schema.whyOptions.includes(ai?.why_option) ? ai.why_option : "",
    mentor: ai?.mentor === "yes" || ai?.mentor === "no" ? ai.mentor : "",
    next_step: text(ai?.next_step, 300),
    signals,
    signal_data,
  };
}

// A spoken answer to a choice question, matched to one of its options. Returns
// the option exactly, or null when the answer fits none (the Helper then shows
// the choices to tap).
export async function matchChoice(said: string, question: string, options: string[]) {
  if (!said.trim() || !options.length) return null;
  const lower = said.toLowerCase();
  const exact = options.find((o) => lower.includes(o.toLowerCase()));
  if (exact) return exact;
  const model = Deno.env.get("CF_TEXT_MODEL") || DEFAULT_TEXT_MODEL;
  const result = await runModel(model, {
    messages: [
      { role: "system", content: "You match a student's spoken answer to one of the listed options. Reply with only the option's number, or 0 if none of them fits what they said." },
      { role: "user", content: `Question: ${question}\nOptions:\n${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}\nThey said: "${said}"` },
    ],
    max_tokens: 5,
    temperature: 0,
  });
  const n = parseInt(String(result?.response ?? result?.choices?.[0]?.message?.content ?? "").match(/\d+/)?.[0] || "0", 10);
  return n >= 1 && n <= options.length ? options[n - 1] : null;
}

// The notebook version, from everything the student said and chose. Plain
// text, not JSON: there is nothing to parse, so nothing to break.
// deno-lint-ignore no-explicit-any
export async function polishText(transcript: string, entry: any) {
  const model = Deno.env.get("CF_TEXT_MODEL") || DEFAULT_TEXT_MODEL;
  const chose: string[] = [];
  if (entry.why_option) chose.push(`Why it mattered: ${entry.why_option === "Other" ? entry.why_note : entry.why_option}`);
  if (entry.engagement) chose.push(`Engagement: ${entry.engagement}${entry.engagement_note ? ` (${entry.engagement_note})` : ""}`);
  if (entry.mentor_help) chose.push(`A mentor helped: ${entry.mentor_name || "yes"}${entry.mentor_note ? `, ${entry.mentor_note}` : ""}`);
  for (const [key, answers] of Object.entries(entry.signal_data || {})) {
    const sig = (schema.signals as SignalSchema[]).find((s) => s.key === key);
    if (!sig) continue;
    const parts = sig.questions
      .map((q) => (answers as Record<string, string>)[q.id] ? `${q.label} ${(answers as Record<string, string>)[q.id]}` : "")
      .filter(Boolean);
    chose.push(`${sig.label}. ${parts.join(" ")}`);
  }
  if (entry.next_step) chose.push(`Next: ${entry.next_step}`);

  const result = await runModel(model, {
    messages: [
      {
        role: "system",
        content: `You write a high school FTC robotics student's engineering notebook entry from their own spoken words and the answers they gave.

The microphone may have picked up other people nearby: leave out anything that isn't the student describing their work. Never include profanity, insults, innuendo, or anything not appropriate for a school notebook, even if it appears in what they said.

Use only what they said and chose. Never add a fact, number, part, person, result or plan they didn't give. First person, past tense, written the way a thoughtful student would write it: clear, specific, and in their voice. Keep every concrete detail (measurements, counts, part names, what failed, what they changed and why). Fix speech-to-text mistakes using this glossary: ${GLOSSARY.join(", ")}. Remove filler ("um", "like", "so yeah"). Two or three short paragraphs at most. No headings, no bullet points, no em dashes. Reply with the entry only.`,
      },
      {
        role: "user",
        content: `What they said (their recap, then their answers to follow-up questions):\n"""${transcript}"""\n\nWhat they chose:\n${chose.join("\n") || "(nothing)"}`,
      },
    ],
    max_tokens: 700,
    temperature: 0.3,
  });
  const text = String(result?.response ?? result?.choices?.[0]?.message?.content ?? "")
    .replace(/\s*\u2014\s*/g, ", ").trim();
  if (!text) throw new Error("The AI wrote nothing");
  return text.slice(0, 4000);
}

// ─── Keeping it school-appropriate ──────────────────────────────────────────
//
// The microphone hears the whole shop, so a transcript can pick up someone
// swearing nearby. Two layers keep that out of the notebook:
//   1. here, the AI reads the text a sentence at a time and takes out any
//      sentence that isn't fit for a school notebook, listed words or not;
//   2. in the database, clean_notebook_text() (supabase/en_helper_clean.sql)
//      takes every listed word out of everything a voice entry stores. That one
//      can't miss and can't be skipped; this one catches what a list can't.
// Both take things out silently. A "[removed]" marker would tell everyone
// reading the notebook (and the student, in the "Got it" line) that something
// was said, and it's often someone nearby who said it.

const SCREEN_RULES = `You check sentences from a high school student's robotics engineering notebook. They were spoken and transcribed, and the microphone may also have picked up other people nearby.

List the number of every sentence that contains any of: profanity or swearing (even mild, partly censored, or misspelled), sexual content or innuendo, insults or put-downs aimed at another person (including "your mom" jokes), slurs, threats or violent remarks aimed at people, crude or bathroom humor, or anything else a teacher would not want in a school notebook.

Do NOT list normal robotics and school talk, even when it uses words like kill (a motor or program), killed it, shoot, shooter, screw, nuts, ball bearings, hot glue, or blow a fuse. Do NOT list a sentence just because it is off topic or casual, and do NOT list a student being hard on themselves about a mistake ("that was stupid of me, but I fixed it"): honest reflection belongs in a notebook.

Answer with JSON: {"remove": [numbers]}, and an empty list when every sentence is fine.`;

const splitSentences = (text: string) =>
  text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

// Returns the text without its inappropriate sentences. If the check itself
// fails, the text goes on unchanged: the database's word filter still applies
// when it's saved.
export async function screenText(text: string): Promise<string> {
  if (!text || !text.trim()) return text;
  const paragraphs = text.split(/\n+/);
  const all: { p: number; s: string }[] = [];
  paragraphs.forEach((para, p) => splitSentences(para).forEach((s) => all.push({ p, s })));
  if (!all.length) return text;
  try {
    const model = Deno.env.get("CF_TEXT_MODEL") || DEFAULT_TEXT_MODEL;
    const result = await runModel(model, {
      messages: [
        { role: "system", content: SCREEN_RULES },
        { role: "user", content: all.map((x, i) => `${i + 1}. ${x.s}`).join("\n") },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { type: "object", properties: { remove: { type: "array", items: { type: "integer" } } }, required: ["remove"] },
      },
      max_tokens: 200,
      temperature: 0,
    });
    const out = readAnswer(result);
    const remove = new Set<number>((Array.isArray(out?.remove) ? out.remove : []).map((n: number) => n - 1));
    if (!remove.size) return text;
    const kept = paragraphs.map((_, p) =>
      all.map((x, i) => ({ ...x, i }))
        .filter((x) => x.p === p)
        .filter((x) => !remove.has(x.i))
        .map((x) => x.s)
        .join(" ")
    );
    return kept.filter(Boolean).join("\n\n").trim();
  } catch (err) {
    console.warn("notebook-voice: screen failed, word filter only:", (err as Error)?.message);
    return text;
  }
}
