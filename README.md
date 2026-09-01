# Jay Aesthetics — Final Master Build

Full-stack coaching platform for Jay Aesthetics. This master includes the public site, client portal, hidden coach/admin portal, PostgreSQL/Prisma backend, secure authentication/OTP flows, coaching operations, protected media, messaging, calls, reports and deployment configuration. **Razorpay is intentionally the only external integration left for later.**

## Stack

- React + Vite + TypeScript
- Node.js + Express + TypeScript
- PostgreSQL + Prisma
- JWT + bcrypt
- Resend-ready email OTP delivery
- Protected persistent media storage
- Razorpay-ready payment backend (keys intentionally blank)

## Local start

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

Open:
- Public site: `http://localhost:5173`
- Client portal: `http://localhost:5173/dashboard`
- Hidden Jay/admin portal: `http://localhost:5173/coach-panel`
- API health: `http://localhost:4000/api/health`

Development seed:
- Admin: `admin@jayaesthetics.com` / `ChangeMe123!`
- Demo client: `client@example.com` / `ChangeMe123!`

These are development credentials only. Production seeding requires your own `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`.

## Database update for an existing local copy

If you already ran an older master, keep your data and sync the schema:

```bash
npm install
npm run db:generate
npm run db:push
npm run db:seed
npm run dev
```

Do **not** use `--force-reset` on a database containing real data.

## Production

Read [`docs/FINAL_SETUP.md`](docs/FINAL_SETUP.md). It contains the exact accounts, environment variables, database connection steps, persistent-media setup, Resend email setup, deployment checklist and pre-launch tests.

## Razorpay

Razorpay remains intentionally unconfigured. Keep these blank for now:

```env
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
```

Set `DEV_MOCK_PAYMENTS=false` in production. The application refuses to start in production if development mock payments are enabled.
