# SmartLib Backend Deployment on Render (Free Tier)

This guide deploys the backend as a **Docker Web Service** on Render so both Node.js and Python are available.

## 1) Prerequisites

- A GitHub repo containing this project
- A Render account: https://render.com
- Firebase service account JSON for your project

## 2) Confirm Local Backend Files

This backend deployment uses:

- `backend/Dockerfile`
- `backend/.dockerignore`
- `backend/.env.example`
- `backend/src/recommender/server.js`

## 3) Security Before Push

1. Make sure secrets are ignored by git.
2. Do **not** commit `serviceAccountKey.json`.
3. Store Firebase credentials in Render environment variable `FIREBASE_SERVICE_ACCOUNT_JSON`.

## 4) Push Code to GitHub

From repository root:

```powershell
git add .
git commit -m "Prepare backend for Render deployment"
git push origin main
```

## 5) Create Render Web Service

1. Open Render dashboard.
2. Click `New` -> `Web Service`.
3. Connect your GitHub repo.
4. Configure service:

- Name: `smartlib-backend` (or any unique name)
- Region: choose nearest to users
- Branch: `main`
- Root Directory: `backend`
- Runtime: `Docker`
- Instance Type: `Free`

5. Click `Create Web Service`.

Render will build using `backend/Dockerfile` and run `npm start`.

## 6) Add Environment Variables in Render

In Render service settings -> `Environment`, add:

- `PORT` = `5000`
- `PYTHON_PATH` = `python`
- `CORS_ALLOWED_ORIGINS` = `https://YOUR_NETLIFY_SITE.netlify.app,http://localhost:5500`
- `FIREBASE_SERVICE_ACCOUNT_JSON` = full Firebase service account JSON in one line
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` = base64-encoded JSON (recommended)

Notes:

- Prefer `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` and leave `FIREBASE_SERVICE_ACCOUNT_JSON` empty.
- If you use `FIREBASE_SERVICE_ACCOUNT_JSON`, keep JSON valid and fully escaped when pasted as one line.
- If your local tests use another dev frontend origin, append it in `CORS_ALLOWED_ORIGINS` separated by commas.

PowerShell command to generate base64 from `backend/serviceAccountKey.json`:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content .\serviceAccountKey.json -Raw)))
```

## 7) Trigger and Monitor Deploy

1. In Render, click `Manual Deploy` -> `Deploy latest commit` (if not auto-triggered).
2. Wait for build + deploy logs to complete.
3. Copy the Render URL, e.g. `https://smartlib-backend.onrender.com`.

## 8) Health Check

Open:

- `https://YOUR_RENDER_URL/health`

Expected JSON:

```json
{
  "status": "ok",
  "service": "smartlib-backend",
  "uptime_seconds": 12
}
```

## 9) API Smoke Test

Use Postman/curl for these endpoints:

- `GET /recommendations/:userId?limit=21`
- `POST /recommendations/:userId/generate?force=true`

If recommendation generation fails, inspect Render logs for:

- Firebase auth/config issues
- Python package install errors
- Missing `recommender.joblib` file

## 10) Connect Frontend

After backend is live:

1. Put the Render URL in frontend API config.
2. Deploy frontend to Netlify.
3. Add Netlify domain to `CORS_ALLOWED_ORIGINS`.
4. Redeploy backend if env vars changed.

## 11) Troubleshooting

- 500 with Firebase error: verify `FIREBASE_SERVICE_ACCOUNT_JSON` is valid JSON.
- CORS blocked in browser: ensure exact scheme + host in `CORS_ALLOWED_ORIGINS`.
- Python not found: set `PYTHON_PATH=python3`.
- Cold starts on free tier: first request after idle can take longer.
