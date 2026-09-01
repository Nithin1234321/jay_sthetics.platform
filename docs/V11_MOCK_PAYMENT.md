# V11 — Development Mock Payment

Set in `apps/api/.env`:

```env
DEV_MOCK_PAYMENTS=true
```

Flow:
Programs → choose plan → create account/sign in → checkout → Development Test Payment → ACTIVE subscription → dashboard unlock.

No real money is charged. The endpoint is blocked automatically when `NODE_ENV=production`.
