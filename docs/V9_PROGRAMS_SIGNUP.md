# V9 Programs + Signup UX

V9 fixes the navigation gap around login, signup, and programme pricing.

New routes:
- `/programs` — dedicated coaching programmes + pricing page
- `/signup?programId=...` — dedicated create-account / sign-in page tied to the selected programme
- `/checkout?programId=...` — payment review and Razorpay checkout
- `/dashboard` — client portal
- `/coach-panel` — private coach/admin portal

Flow:
Public site → Programs → choose exact programme → Create Account OR Sign In → Checkout → Payment verification → Dashboard unlock.

Client login now clearly links to Create Account / Join Coaching rather than only showing a login form.
