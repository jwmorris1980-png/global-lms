# Global Standards LMS

This app is a K-12 standards-centered LMS warehouse. It serves curriculum paths, units, and lessons for every listed country, every grade 1-12, and every core course in the global catalog.

## Open Source

Global LMS is being prepared as an open-source education-access project. The goal is to make standards-aligned K-12 learning materials easier to access, adapt, localize, and review while keeping the platform affordable for teachers, families, and underserved communities.

This repository is licensed under the MIT License. See `LICENSE` for details.

Before publishing this repository publicly, confirm that no private credentials, API keys, customer data, payment secrets, or unpublished proprietary assets are included. Runtime secrets should be stored in `.env` locally or provider-managed secret storage in production, never committed to the repository.

## What Loads Instantly

- Prebuilt country-aware curriculum plans through `POST /api/curriculum`
- Four standards units per course, with five lesson topics per unit
- Prebuilt LMS-ready lesson packages through `POST /api/lesson`
- Teacher plan, worksheet, quiz, answer key, activity, media links, and export metadata
- Free-region and tiered pricing metadata
- A catalog endpoint at `GET /api/catalog`

The server reads prebuilt JSON packages from `warehouse/packages` first. Each package contains one full curriculum plus all lessons for that country, grade, and course. Missing packages are not silently generated unless `WAREHOUSE_PREBUILT_ONLY=false` is explicitly set.

## Generated Warehouse Data

The generated warehouse output is not committed to the public source repository because it contains a very large number of generated JSON files. The live deployment uses generated data under `warehouse/packages`, `warehouse/curriculums`, and `warehouse/lessons`, but those folders are ignored in Git.

Public contributors can work on the application, API, video matching, deployment config, and content QA tools without committing generated warehouse output. A public regeneration workflow should be added before expecting outside contributors to rebuild the full warehouse locally.

## Run Locally

```bash
npm install
npm run build
npm run server
```

The app serves the built frontend from `dist` and the API from the same Express server.

Copy `.env.example` to `.env` for local development and fill in only the values needed for the integrations you are testing.

## Stripe Payments

The marketplace uses Stripe-hosted Checkout from the backend. The payment code is already wired through:

- `GET /api/payments/config`
- `POST /api/create-checkout-session`
- `POST /api/stripe/webhook`

To finish live setup, create a Stripe webhook endpoint for:

```text
https://lms-global-682818593798.us-central1.run.app/api/stripe/webhook
```

Then run the secure Cloud Run setup helper. Enter the Stripe secret key and webhook signing secret only in the terminal, not in chat.

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-stripe-cloud-run.ps1
```

## Uptime Checks

The live backend exposes health checks at:

```text
https://www.global-lms.org/api/health
https://lms-global-682818593798.us-central1.run.app/health
```

Google Cloud Scheduler runs `global-lms-backend-heartbeat` every 5 minutes to keep the Cloud Run backend warm. Vercel also has a daily cron check for `/api/health`, which is the maximum frequency allowed on the Hobby plan.

Run a manual live check with:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-live-health.ps1
```

## API Examples

```bash
curl http://localhost:5188/api/catalog
```

```bash
curl -X POST http://localhost:5188/api/curriculum \
  -H "Content-Type: application/json" \
  -d "{\"country\":\"Rwanda\",\"grade\":\"Grade 7\",\"course\":\"Environmental Science\",\"need\":\"Full Course\"}"
```

```bash
curl -X POST http://localhost:5188/api/lesson \
  -H "Content-Type: application/json" \
  -d "{\"country\":\"Rwanda\",\"grade\":\"Grade 7\",\"course\":\"Environmental Science\",\"topic\":\"Analyze: Ecosystems and biodiversity\"}"
```
