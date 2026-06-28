import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });


function buildSystemPrompt(workStart: string, workEnd: string, timeframeHours: number): string {
  return `You are an elite, stress-reducing scheduling assistant.
You receive an array of CRM task names and must create a realistic, focused schedule for completing them.

Rules:
- Break each task into one or more 45-minute focus blocks
- Leave exactly a 15-minute gap between every block
- Only schedule between ${workStart} and ${workEnd} local time — NEVER outside this window
- Spread work across the next ${timeframeHours} hours starting from right now
- Assign a distinct, vibrant hex background color to each unique task
- For high-priority tasks (those whose title starts with "[Urgent]" or "[High]"), add a reminder 10 minutes before the block starts

You MUST return ONLY a valid JSON array — no markdown, no explanation, no wrapper object.
Each element in the array must match this exact shape:
{
  "title": string,
  "start": string (ISO 8601 with timezone offset, e.g. "2025-01-15T09:00:00+05:30"),
  "end": string (ISO 8601, exactly 45 minutes after start),
  "backgroundColor": string (hex color, e.g. "#e85d04"),
  "reminders": [
    {
      "id": string (generate a short random alphanumeric string, e.g. "ai-r-x7k2"),
      "type": "once",
      "date": string (YYYY-MM-DD, 10 minutes before start),
      "time": string (HH:MM, 10 minutes before start),
      "dayOfWeek": 1,
      "dayOfMonth": 1,
      "month": 0,
      "yearDay": 1
    }
  ]
}

The "reminders" field is OPTIONAL. Omit it entirely for normal-priority tasks.
NEVER include reminders for tasks that are not high-priority.
`;
}

// ── Retry helper ────────────────────────────────────────────────────────────
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand") ||
    msg.includes("overloaded")
  );
}

async function generateWithRetry(
  userMessage: string,
  systemPrompt: string,
  maxAttempts = 3
): Promise<string> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userMessage,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
      });
      return response.text ?? "";
    } catch (err) {
      lastErr = err;
      if (isRetryable(err) && attempt < maxAttempts) {
        const delayMs = 2000 * attempt; // 2 s → 4 s
        console.warn(
          `[schedule/route] Gemini 503 — retry ${attempt}/${maxAttempts - 1} in ${delayMs}ms`
        );
        await new Promise((r) => setTimeout(r, delayMs));
      } else {
        throw err; // non-retryable or out of attempts
      }
    }
  }
  throw lastErr;
}

export async function POST(req: NextRequest) {
  // ── Key sanity check ────────────────────────────────────────────────────
  if (!GEMINI_API_KEY || !GEMINI_API_KEY.startsWith("AIza")) {
    return NextResponse.json(
      {
        error:
          "Invalid GEMINI_API_KEY. Get a valid key from https://aistudio.google.com/apikey — it must start with 'AIza'.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const tasks: string[] = body.tasks ?? [];
    const workStart: string = body.workStart ?? "09:00";
    const workEnd: string = body.workEnd ?? "18:00";
    const timeframeHours: number = Number(body.timeframeHours) || 48;

    if (!tasks.length) {
      return NextResponse.json({ error: "No tasks provided" }, { status: 400 });
    }

    // Build a timestamp anchor so the model knows "now"
    const now = new Date().toISOString();
    const userMessage = `Current UTC time: ${now}\n\nWork window: ${workStart} to ${workEnd}\nScheduling timeframe: next ${timeframeHours} hours\n\nCRM Tasks to schedule:\n${tasks
      .map((t, i) => `${i + 1}. ${t}`)
      .join("\n")}`;

    const systemPrompt = buildSystemPrompt(workStart, workEnd, timeframeHours);

    let raw = await generateWithRetry(userMessage, systemPrompt);

    // Strip markdown fences if present
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/```$/, "").trim();
    }

    const events = JSON.parse(raw);
    return NextResponse.json(events);
  } catch (err: unknown) {
    console.error("[schedule/route]", err);
    const message = err instanceof Error ? err.message : String(err);

    // Surface a friendly message for Gemini 503s
    const friendly = isRetryable(err)
      ? "Gemini is experiencing high demand right now. Please try again in a moment."
      : message;

    return NextResponse.json({ error: friendly }, { status: 503 });
  }
}
