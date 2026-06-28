# Last-Minute Life Saver ⚡

> AI-powered deadline rescue tool — sync your Linear backlog, let Gemini 2.5 Flash
> schedule your week, and stop procrastinating.

**Live Demo:** <!-- Add your deployed Cloud Run URL here -->

## ✨ Features

- 🤖 **Gemini 2.5 Flash** schedules your Linear issues into 45-minute focus blocks
- 📅 **FullCalendar** interactive week/day view — drag a slot to create deadlines
- 🔐 **Clerk authentication** — sign in to load your personal Linear queue
- 🎨 Animated glassmorphic UI with real-time wave canvas background
- ⏰ Customizable work hours and scheduling window (1–168 hours)
- 💾 Events persist in `localStorage` across sessions

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Calendar | FullCalendar (react) |
| AI | Google Gemini 2.5 Flash (`@google/genai`) |
| Auth | Clerk (`@clerk/nextjs`) |
| CRM | Linear SDK (`@linear/sdk`) |
| Hosting | Google Cloud Run (via AI Studio) |

## 🚀 Local Development

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/vibe2ship.git
cd vibe2ship

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in your keys in .env.local

# 4. Start dev server
npm run dev
# Visit http://localhost:3000
```

## 🔑 Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CLERK_SECRET_KEY` | Clerk secret key |
| `LINEAR_API_KEY` | Linear personal API key |

Copy `.env.example` to `.env.local` and fill in your values. **Never commit `.env.local`.**

## 🏗 How It Works

1. **Sign in** via Clerk — the app fetches your open Linear issues
2. Set your **work hours** and **scheduling window** in the sidebar
3. Click **Sync CRM Tasks** — Gemini 2.5 Flash generates time-boxed focus blocks
4. View and drag events in the **FullCalendar** week view
5. Use **Add Deadline** or drag a calendar slot to create manual events

## 📁 Project Structure

```
src/
  app/
    page.tsx          # Main UI (calendar + control panel)
    layout.tsx        # Root layout with Clerk provider
    globals.css       # Global styles & CSS variables
    api/
      linear/         # GET  /api/linear  — fetch Linear issues
      schedule/       # POST /api/schedule — Gemini scheduling
    components/
      DeadlineModal   # Manual deadline creation modal
backend/
  main.py             # Legacy FastAPI server (reference only)
```

## 📜 License

MIT
