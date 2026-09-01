# Final setup — everything except Razorpay

This build is ready for local use and for production deployment once the external accounts below are connected. Razorpay remains intentionally unconfigured.

## What is already wired

- Public marketing site and programme pricing
- Client signup/login
- Email verification OTP
- Forgot-password OTP
- Admin/Jay 2-factor OTP
- Client onboarding
- Paid/manual subscription gating
- Workout templates, exercise library, video uploads and alternatives
- Nutrition plans, macros and meal options
- Weekly check-ins and protected progress photos
- Progress history/weight trend
- Private client ↔ Jay messaging with access control and read tracking
- Coaching call availability, requests and meeting links
- Admin client management, private notes, leads, calls, check-ins and payment reports
- Excel exports
- Audit logs for admin actions
- PostgreSQL + Prisma
- Protected media routes
- Production-configurable persistent upload directory
- Rate limiting, Helmet, CORS, validation and graceful shutdown
- Health endpoint for hosting probes
- Razorpay code remains present but credentials can stay blank until later

## Accounts/services you need for production

1. **Domain** — e.g. `jayaesthetics.com`.
2. **Vercel** — frontend hosting.
3. **Railway or Render** — Node API hosting.
4. **Managed PostgreSQL** — Railway Postgres, Neon, Supabase Postgres, Render Postgres, etc.
5. **Resend** — sends signup OTP, password reset OTP and Jay's admin 2FA code. Add/verify your domain in Resend.
6. **Persistent disk/volume on the API host** — stores workout videos and client progress photos. Set `UPLOAD_DIR` to the mounted directory.
7. **Razorpay later** — no action required now.

No Twilio account is required. Messaging is built into the website. Calls are scheduled in the website; Jay can add a Google Meet/Zoom URL from the admin call screen or optionally expose a phone number during configured hours.

## Local Mac setup

From the project root:

```bash
npm install
cp .env.example .env
cp .env.example apps/api/.env
docker compose up -d
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Use `db:push` for the current local database. Do not use `--force-reset` if you have data you want to keep.

Local URLs:
- Website: `http://localhost:5173`
- Client: `http://localhost:5173/dashboard`
- Hidden admin portal: `http://localhost:5173/coach-panel`
- API health: `http://localhost:4000/api/health`

Development OTP codes appear in the UI when Resend is not configured. Production never returns OTP codes to the browser.

## Production environment variables

### API host

```env
NODE_ENV=production
DATABASE_URL=YOUR_MANAGED_POSTGRES_URL
JWT_SECRET=GENERATE_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS
WEB_ORIGIN=https://jayaesthetics.com,https://www.jayaesthetics.com
TRUST_PROXY=true
RESEND_API_KEY=re_...
EMAIL_FROM=Jay Aesthetics <no-reply@jayaesthetics.com>
ADMIN_EMAIL=YOUR_JAY_ADMIN_EMAIL
ADMIN_INITIAL_PASSWORD=USE_A_NEW_STRONG_PASSWORD
UPLOAD_DIR=/YOUR/PERSISTENT/VOLUME/PATH
COACH_PHONE_NUMBER=
DEV_MOCK_PAYMENTS=false
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Generate a JWT secret on the Mac with:

```bash
openssl rand -hex 32
```

### Vercel frontend

```env
VITE_API_URL=https://YOUR-API-DOMAIN/api
```

Redeploy the frontend after changing `VITE_API_URL` because Vite embeds it during build.

## First production database setup

Run against the production `DATABASE_URL` from the API deployment environment:

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
```

`NODE_ENV=production` makes the seed require `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`, and it does not create the demo client. If you rerun the production seed, the admin password is updated to the current `ADMIN_INITIAL_PASSWORD`, so remove that variable after initial setup if your host allows it, or keep it in a secure secret manager and do not casually rerun seed.

## Persistent media

Do not deploy the API without persistent storage. Workout videos and private progress photos must survive restarts/redeploys.

Attach a persistent volume to Railway/Render and point `UPLOAD_DIR` to that mount. The application serves those files only through authenticated/subscription-protected API routes.

## Resend email setup

- Create a Resend account.
- Add `jayaesthetics.com` as a sending domain.
- Add the DNS records Resend gives you at your domain registrar/DNS provider.
- Wait until the domain is verified.
- Create an API key.
- Put it in `RESEND_API_KEY` on the API host.
- Set `EMAIL_FROM` to an address on the verified domain.

After this, verification/password/admin codes are delivered by email automatically.

## Pre-launch tests

Run these before sharing the site publicly:

1. New client signup → email OTP → login.
2. Forgot password → email OTP → new password works.
3. Jay admin login → admin OTP works.
4. Create/assign a manual ACTIVE subscription from admin while Razorpay is pending.
5. Client onboarding saves.
6. Assign workout + nutrition and confirm client sees them.
7. Upload a workout video, restart/redeploy API, and verify it still plays. This proves persistent storage is correct.
8. Client submits a check-in with photos; Jay can view it.
9. Client and Jay exchange chat messages.
10. Client requests a call; Jay confirms and adds a meeting URL.
11. Excel exports download correctly.
12. Test on iPhone/Android and desktop.
13. Verify `/api/health` returns `{ "ok": true }` on the public API domain.

## Razorpay status

Nothing else needs to be done for Razorpay now. Until it is connected, Jay can activate a client's subscription manually from the admin portal for testing or offline/manual payments. When the Razorpay account is ready, add the three Razorpay secrets and configure the webhook; the rest of the payment flow is already present.
