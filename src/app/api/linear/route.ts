import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { LinearClient } from "@linear/sdk";

// ── Priority label map ─────────────────────────────────────────────────────
const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export async function GET() {
  // ── Clerk auth gate — must be signed in ──────────────────────────────────
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Linear API key ───────────────────────────────────────────────────────
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "LINEAR_API_KEY is not set in environment variables." },
      { status: 500 }
    );
  }

  try {
    const linearClient = new LinearClient({ apiKey });

    // Use linear.viewer — the personal API key already authenticates as the
    // workspace user who created it, so no email-based lookup is needed.
    const me = await linearClient.viewer;

    // Fetch active (non-completed, non-canceled) issues assigned to this user
    const issuesPage = await me.assignedIssues({
      filter: {
        completedAt: { null: true },
        canceledAt:  { null: true },
      },
      first: 50,
    });

    // Map each issue to a human-readable string for Gemini
    const tasks: string[] = issuesPage.nodes.map((issue) => {
      const priorityLabel = PRIORITY_LABELS[issue.priority ?? 0] ?? "No priority";
      const prefix =
        issue.priority && issue.priority <= 2
          ? `[Priority: ${priorityLabel}] `
          : "";
      return `${prefix}${issue.title}`;
    });

    return NextResponse.json(tasks);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[linear/route] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
