# Authentication & Account Security

Implemented in the master project:

- Email verification with a 6-digit one-time code.
- Codes expire after 10 minutes and are single-use.
- Verification attempts are capped per code.
- Forgot-password / reset-password OTP flow.
- Jay/admin requires a second one-time verification code after a correct password.
- Production login and verification endpoints are rate-limited.
- Development mode returns the generated code in the UI so the flow can be tested without an email/SMS provider.

## Production requirement

Before launch, connect an email or SMS provider and remove development-code display. The database/flow is already structured for that integration.

## Database update

The master schema adds `User.emailVerifiedAt`. After pulling the master locally:

```bash
npm install
npm run db:generate
cd apps/api
npx prisma db push
npm run db:seed
cd ../..
npm run dev
```

Do not use `--force-reset` once real client data exists.
