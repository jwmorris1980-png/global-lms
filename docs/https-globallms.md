# Fix HTTPS for globallms.org

Checked on 8 October 2026 from outside the server.

## What is broken

`https://globallms.org` and `https://www.globallms.org` fail before any page loads. The TLS handshake returns alert 80 (`tlsv1 alert internal error`) and the server sends no certificate. `http://globallms.org` does load, and it is not the course site. It is Hostinger’s parking page (“Parked Domain name on Hostinger DNS system”), served by `hcdn`.

DNS for that domain:

| Name | Record |
| --- | --- |
| `globallms.org` | `A 2.57.91.91` |
| `www.globallms.org` | `CNAME globallms.org` |
| Nameservers | `ns1.dns-parking.com`, `ns2.dns-parking.com` |

Those are Hostinger’s parking nameservers. The parking network answers on port 443 but does not have a certificate for this name, so browsers report a secure-connection error. A 504 is a different failure (a proxy gave up waiting). It is not what `globallms.org` is doing right now.

The course site is already on Vercel and already has a working free certificate:

| Name | What it does |
| --- | --- |
| `https://global-lms.org` | Vercel, HTTP 307 to `https://www.global-lms.org/` |
| `https://www.global-lms.org` | Vercel, HTTP 200, the app |
| `https://lms-all-languages.vercel.app` | Same app |
| `https://lms-global-682818593798.us-central1.run.app/health` | Cloud Run API, HTTP 200 |

`www.global-lms.org` uses `CNAME cname.vercel-dns-0.com`. The apex `global-lms.org` uses Vercel’s `A 76.76.21.21`. Nothing in this repository can change Hostinger DNS or attach a domain in the Vercel dashboard. Those two clicks are the fix. Do not buy an SSL certificate. Vercel issues a free Let’s Encrypt certificate after DNS points at it.

`vercel.json` and `server.cjs` already send `Strict-Transport-Security`. That header is not what breaks `globallms.org`. The parked host never finishes TLS, so the browser never sees the header. Do not submit `globallms.org` to the HSTS preload list until HTTPS has worked for a while.

The live Vercel site is also an older build than this repository (the public HTML title is still “Personalized K-12 Learning Warehouse”, last modified 3 October 2026). Merging this pull request does not publish it. Run the free deploy steps at the end.

## Point globallms.org at the same free Vercel project

1. Open [vercel.com](https://vercel.com) and the project that already serves `www.global-lms.org`.
2. Go to **Settings → Domains**.
3. Add `globallms.org`.
4. Add `www.globallms.org`.
5. For each one, set **Redirect to** `www.global-lms.org`. Visitors who type the short name then land on the site that already has a certificate. Vercel will show the DNS records it wants. Use those if they differ from the ones below.
6. Leave the project on the Hobby plan. Custom domains and certificates are included.

## Replace the Hostinger parking DNS

1. Sign in to [hpanel.hostinger.com](https://hpanel.hostinger.com).
2. Open **Domains → globallms.org**.
3. Open **DNS / Nameservers**. You should see `ns1.dns-parking.com` and `ns2.dns-parking.com`. That is the parking page.

Use one of these. Do not do both.

### A. Vercel nameservers (simplest)

1. In the Vercel domain screen, choose the option to use Vercel DNS. It shows two nameservers, usually `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.
2. In Hostinger, choose **Change nameservers** and enter exactly the two names Vercel shows.
3. Save.

### B. Keep DNS at Hostinger

1. In Hostinger, switch the domain off parking nameservers onto Hostinger’s normal nameservers (the button is **Use Hostinger nameservers**). Parking nameservers do not give you a real DNS zone.
2. Open the DNS zone and delete the parking `A` record `2.57.91.91`.
3. Add an `A` record: host `@`, value `76.76.21.21`. If Vercel’s domain screen shows a different IP, use that IP.
4. Add a `CNAME`: host `www`, value `cname.vercel-dns.com`. If Vercel shows `cname.vercel-dns-0.com`, use that instead.
5. Remove any `AAAA` records for `@` and `www`. A leftover IPv6 address will keep the broken parking host in the mix.

## Wait, then check

DNS often updates within an hour and can take up to 24 hours. Then:

1. Open `https://globallms.org`. It should redirect to `https://www.global-lms.org/` with a normal padlock. The certificate will say Let’s Encrypt or Vercel. You should not see a TLS error or the Hostinger parking page.
2. Open `https://www.globallms.org` and confirm the same redirect.
3. Open `http://globallms.org` and confirm it jumps to HTTPS. Vercel does that redirect. Do not install a paid Hostinger SSL add-on.

If the Vercel domain screen says the certificate is still provisioning, wait and refresh. Do not upload a custom certificate.

## If www.global-lms.org shows a 504

That is the Vercel rewrite waiting on the Cloud Run API (`/api/*` in `vercel.json` proxies to `lms-global` in `us-central1`). The API health check was responding on 8 October 2026. Cloud Run is allowed to scale to zero on the free tier, which can make the first request slow.

1. In Google Cloud Console (project `gen-lang-client-0007979237`), open **Cloud Scheduler** and confirm `global-lms-backend-heartbeat` is enabled. It should call the Cloud Run `/health` URL every 5 minutes. Scheduler’s free tier covers that job. Do not set a minimum instance. That is a paid setting.
2. Open `https://lms-global-682818593798.us-central1.run.app/health`. A JSON `ok` means the API is up. A 504 on the Vercel domain with a healthy Cloud Run URL means the rewrite target is wrong or the service is still cold. Retry once.
3. Redeploy only after the code in this pull request is merged, using the steps below.

## Publish this pull request (free)

The homepage, free lesson, and marketplace filter are in the repo. They are not on the public site until both hosts are updated.

### Vercel (the pages)

1. GitHub → this repository → **Actions**.
2. Open **Deploy production to Vercel**.
3. **Run workflow** on `main` after this pull request is merged.
4. The repository secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` must already be set. The workflow file is `.github/workflows/deploy-vercel.yml`.
5. Hard-refresh `https://www.global-lms.org` (Ctrl+Shift+R). The title should be “Short, affordable courses made by teachers.”

### Cloud Run (the API)

The browser hides “test” and “Untitled Lesson” even before this step. The API keeps returning them until Cloud Run is redeployed. From a machine already logged in with `gcloud`:

```bash
gcloud config set project gen-lang-client-0007979237
gcloud run deploy lms-global --source . --region us-central1 --allow-unauthenticated
```

Do not pass `--set-env-vars` or `--update-env-vars` on that command. A plain deploy keeps the Stripe keys and other variables already on the service. The `Dockerfile` in this repo is what Cloud Run builds.
