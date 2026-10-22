# CardVault

A responsive React + TypeScript business-card notebook with Google sign-in, persistent Supabase sessions, per-user private collections, digital business cards, independent contact extraction and organization research, live camera capture, and ZIP export.

## Features

- Google OAuth sign-in with persistent sessions. Users normally return directly to their collection on the same browser/device.
- Every authenticated user has a separate collection, enforced by the API and Supabase Row Level Security policies.
- Create, edit, search, select, and delete notes with multiple business-card images.
- Take a photo using the laptop webcam or a phone camera, or upload existing images.
- Download a single note or selected notes as a ZIP. Each note folder contains `note.txt` and the original image files.
- Private Supabase Storage bucket; the service key is used only by the Express server.

## Requirements

- Node.js 20.19+ or 22.12+ recommended.
- A Supabase project.

## 1. Configure Supabase

1. Create or select your Supabase project.
2. In Google Cloud Console, create an OAuth Client ID for a Web application. Add Supabase's callback URL (`https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`) as an authorized redirect URI.
3. In **Supabase → Authentication → Providers → Google**, enable Google and enter the Google OAuth Client ID and Client Secret.
4. In **Authentication → URL Configuration**, set the Site URL to your local URL while developing (for example `http://localhost:5173`) and add redirect URLs for `http://localhost:5173`, `http://127.0.0.1:5173`, and your deployed CardVault URL.
5. Open **SQL Editor → New query**, paste `supabase/schema.sql`, and run it in the V2 project.
6. In **Project Settings → API Keys**, copy:
   - Project URL
   - Publishable key (starts with `sb_publishable_`; browser-safe)
   - Secret key (starts with `sb_secret_`; server-only). The legacy `service_role` key can also be used if that's what your project provides.
7. In the project root, copy `.env.example` to `.env` and fill the values:

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SIDE_SECRET_KEY
VITE_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
PORT=8000
NODE_ENV=development
```

`SUPABASE_URL` and `VITE_SUPABASE_URL` should be the same URL. The publishable key is not a secret, but the `SUPABASE_SERVICE_ROLE_KEY` is highly privileged: never put it in a `VITE_` variable, frontend source, or public repository. Do not commit `.env`.

The SQL creates a private `business-card-images` bucket with a 10 MB per-image limit and JPEG, PNG, and WebP allowlist. Keep the bucket private.

### Existing CardVault database

If you previously ran the older shared-workspace schema, this schema adds `user_id`. Existing notes without a user ID are not displayed to anonymous users. Export/back up any old notes before changing schemas if you need to keep them.

## 2. Install and run locally

From the project root:

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal, usually `http://localhost:5173`.

The first visit shows **Continue with Google**. After successful Google OAuth, Supabase stores a persistent session and CardVault opens the user’s collection on later visits. Users can sign out from the top bar. If a user clears site storage or revokes the session, they must sign in again. Signing in on another device with the same Google account opens the same user collection.

## 3. Camera support

- On the same laptop, `http://localhost:5173` can access a webcam after browser permission is granted.
- On a deployed site, use HTTPS. Browsers generally block camera access on ordinary HTTP origins other than localhost.
- The app prefers the rear-facing camera on phones when available and provides a switch-camera control.
- If permission was denied, allow camera access in the browser's site settings.

## 4. Download notes

Open a note and choose **Download**, use the note's three-dot menu to download one note, or select multiple note cards and click **Download (N)**. The app downloads a ZIP containing each note's `note.txt` and original image files.

## 5. Deploy

Deploy the app as a Node service that can run both Vite's built frontend and the Express API:

1. Set all five environment values shown above in the hosting provider's environment settings.
2. Set `NODE_ENV=production`.
3. Build with `npm run build`.
4. Start with `npm start`.
5. Configure HTTPS on the public URL.

Do not expose the Supabase secret key to the browser. The Express API validates each Supabase access token and scopes reads, updates, deletes, and exports to that user ID. Keep the server and dependencies updated. Anonymous accounts are convenient but do not prove a person's real identity; for sensitive data, add a real sign-in/recovery option and rate limiting.

## 6. Modular AI backend

The Python FastAPI AI service is separated by responsibility:

- `backend/app/main.py` — application setup and route registration.
- `backend/app/api/ai_routes.py` — authenticated extraction and research endpoints.
- `backend/app/services/gemini_service.py` — Gemini client, JSON parsing, and model fallback.
- `backend/app/services/extraction_service.py` — image-to-contact extraction without web search.
- `backend/app/services/research_service.py` — organization research and report generation using Gemini Google Search grounding.
- `backend/app/dependencies.py` — Supabase session verification and note ownership checks.

The model priority is `gemini-3.8-flash`, `gemini-3.6-flash`, then `gemini-3.5-flash`. The selected model IDs must be available to your Google AI project and support Google Search grounding for research. Extraction uses Gemini image understanding only and does not search the web. Organization research uses Gemini's built-in Google Search grounding with the same user-provided Gemini key. Google Search grounding availability, quota, and billing depend on the user's Google AI project and selected model.

Copy `backend/.env.example` to `backend/.env` and fill in the V2 Supabase URL and server-only Supabase secret. Each signed-in user supplies their own Gemini API key in the app; do not put a user's Gemini key in `.env`. Run the Python service from the `backend` folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8001
```

Health check: `http://127.0.0.1:8001/health`.

The independent actions are:

- `POST /api/ai/extract` — extracts contact fields and stores them in `notes.extracted_contact`.
- `POST /api/ai/research` — researches the extracted company name and stores the report in `notes.company_report` and sources in `notes.research_sources`.

## 7. Authentication and data security

- The first visit shows **Continue with Google**. Supabase stores a persistent session and refreshes tokens automatically.
- The frontend uses only the publishable key. The Supabase secret/service-role key stays server-side.
- The Express API verifies each bearer token and scopes every query to that authenticated user ID.
- RLS policies protect notes and image records; storage policies restrict the private image bucket to paths under `users/{user_id}/...`. Server-side service-role operations bypass RLS, so explicit owner checks in the server remain necessary.
- Use the new V2 Supabase project. Do not point the V2 environment at the V1 project if V1 must remain untouched.
- Existing legacy notes with no `user_id` will not be visible to a signed-in user. Back up and explicitly migrate any records you want to retain.

## Troubleshooting

- **Google sign-in fails:** verify the Google provider is enabled, the Google Cloud OAuth callback is set to `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`, and the app URL is allowlisted in Supabase Auth URL Configuration.
- **API says session is invalid:** confirm the frontend and both backends use the same V2 Supabase project URL; sign out and sign in again.
- **Storage/database setup error:** confirm the schema ran successfully, the bucket is private, and the server-only secret key is correct.
- **Gemini quota error:** check the Google AI project's model-specific quota and billing; fallback cannot bypass project-wide quota exhaustion.
- **Research fails:** confirm the user's Gemini API key has access to a model that supports Google Search grounding, and check that project's quota and billing. No separate web-search key is required.
- **Camera won't open on phone:** use HTTPS and grant camera permission.


## User-provided Gemini API key

CardVault V2 accepts a user's own Gemini API key from **My Gemini API Key** in the left navigation. The backend validates the key and encrypts it using `GEMINI_KEY_ENCRYPTION_KEY` before storing it in the `user_settings` table for the authenticated Supabase user. The raw key is never returned to the browser and is not stored in plaintext. Each AI request verifies the signed-in user and decrypts only that user's saved key. Run the updated `supabase/schema.sql` and configure `GEMINI_KEY_ENCRYPTION_KEY` in `backend/.env` before using persistent key storage.

The key is used for two independent Gemini calls: (1) contact extraction from card images, with no web search, and (2) organization research using Gemini's built-in Google Search grounding. Grounding source URLs returned by Gemini are stored with the report. 

### Local AI settings

- `backend/.env`: Supabase URL and server-side Supabase secret, model fallback names, and CORS origins. Do not add a Gemini key here when using per-user keys.
- Root `.env`: Supabase URL/publishable key and `VITE_AI_API_URL=http://localhost:8001`.
- Start FastAPI from `backend` using `python -m uvicorn app.main:app --reload --port 8001`.


## Persistent per-user Gemini API keys

Run the updated `supabase/schema.sql` in the V2 Supabase project's SQL Editor to create the `user_settings` table. This table stores only an encrypted Gemini API key, a last-four-character hint, and a timestamp. The backend encrypts/decrypts the key using `GEMINI_KEY_ENCRYPTION_KEY`; raw keys are never returned to the browser.

Generate a Fernet encryption key from the backend virtual environment:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Copy the generated value into `backend/.env` as `GEMINI_KEY_ENCRYPTION_KEY=...`. Keep it secret and back it up securely. If you lose or change this key, existing saved Gemini API keys cannot be decrypted and users will need to save their keys again. Restart FastAPI after changing `.env`.

The user must be signed in to save, test, or remove their key. The backend verifies the Supabase access token and scopes key operations to that authenticated user.
