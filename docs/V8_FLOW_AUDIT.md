# V8 Flow Audit

V8 is a corrective release after reviewing the full public → payment → client → coach flow.

Fixed:
- Existing client can choose a programme, sign in, and continue to the same checkout.
- Get Started no longer creates an account without a selected plan.
- Public consultation scheduling is restored.
- Public message/lead form is restored.
- Razorpay signature comparison no longer risks length errors.
- Razorpay webhook activation added, so successful payment can activate access even if the browser closes.
- Recent pending Razorpay orders are reused to reduce duplicate pending subscriptions.
- Paid media is no longer exposed through a public `/uploads` route.
- Exercise videos are fetched through authenticated subscription-protected media API.
- Weekly progress photo upload added and protected.
- Client chat is now functional (polling; real-time WebSocket can be added later).
- Client call requests are functional and restricted to configured coaching hours.
- Optional direct `tel:` call is available only to active subscribers and only during configured hours if COACH_PHONE_NUMBER is set.
- Leads are visible/manageable in the coach portal.
- Active-client counts ignore expired subscriptions.
- API async errors are caught instead of crashing the Node server.
- Login has a dedicated rate limit.
- Client progress includes a basic weight trend chart.

Still external-service dependent:
- Razorpay requires Jay's real TEST/LIVE keys.
- Browser-native voice/video calling requires a provider if you want VoIP rather than a protected phone call.
- Production media should move from local disk to Cloudinary/S3/R2.
- Production auth should move from localStorage JWTs to secure httpOnly cookies + admin 2FA.
- Email verification/password reset and push/email notifications still need an email provider.

Additional audit fixes:
- Fixed modal conditional rendering so Schedule Call / Message Jay no longer accidentally render the signup form underneath.
- Coaching call date/time inputs are interpreted explicitly as India Standard Time (IST).
- Legacy local `/uploads/...` exercise URLs are transparently routed through the new protected media API.
