import os
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai
from google.genai import types

# ── App & CORS ────────────────────────────────────────────────────────────────
app = FastAPI(title="Last-Minute Life Saver API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # open for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic schemas ──────────────────────────────────────────────────────────
class PlanRequest(BaseModel):
    user_input: str


class ActionTask(BaseModel):
    task_name: str
    urgency_rating: float
    time_estimate_hours: float
    immediate_micro_action: str


# ── Serve frontend ───────────────────────────────────────────────────────────
FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/app", include_in_schema=False)
def serve_frontend():
    return FileResponse(str(FRONTEND_DIR / "index.html"))

# ── Gemini client (reads GEMINI_API_KEY from env) ─────────────────────────────
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

SYSTEM_PROMPT = """You are an aggressive, autonomous productivity engine.
Your job is to analyze chaotic human text, extract the single most urgent task,
evaluate its deadline proximity on a scale of 1-10, estimate the time required
to complete it, and determine the exact, immediate micro-action the user must
take right now to stop procrastinating.
Output ONLY a valid JSON object with these keys:
  task_name (string),
  urgency_rating (float 1-10),
  time_estimate_hours (float),
  immediate_micro_action (string)"""


# ── Endpoint ──────────────────────────────────────────────────────────────────
@app.post("/api/plan", response_model=ActionTask)
async def create_plan(body: PlanRequest) -> ActionTask:
    if not body.user_input.strip():
        raise HTTPException(status_code=400, detail="user_input cannot be empty")

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=body.user_input,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
            ),
        )

        raw_text: str = response.text or ""
        # Strip markdown fences if the model wraps the JSON
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]

        data = json.loads(raw_text.strip())
        return ActionTask(**data)

    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini returned non-JSON output: {exc}",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/")
def health():
    return {"status": "ok", "service": "Last-Minute Life Saver"}
