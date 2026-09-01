# Jay Aesthetics V3

V3 turns the coach panel from a placeholder into a usable management interface.

## Coach panel
Private route: `/coach-panel` (not linked anywhere on the public site)

Working UI sections:
- Overview
- Clients + search + client detail
- Manual client creation
- Assign/activate coaching programmes
- Programmes & pricing editor
- Exercise library
- Local development video upload
- Exercise form cues and alternatives
- Workout plan/split builder
- Nutrition plan creator
- Equivalent meal options/macros
- Weekly check-in review
- Scheduled call management
- Client conversation UI
- Payments table
- Coaching call-hours settings

## Client portal
- Dashboard
- Subscription-protected training
- Exercise form videos
- Exercise alternatives
- Subscription-protected nutrition
- Weekly check-in submission
- Progress history
- Coaching availability

## Video storage
Local development uploads are stored in `apps/api/uploads`.
This is intentionally for development only.

For production, replace local disk uploads with a persistent object/media store such as:
- Cloudinary
- Amazon S3
- Cloudflare R2

Do not deploy important client/workout media to ephemeral server disk.

## Production items still required
- Razorpay production account + webhook
- Cloud video/photo storage
- Real-time WebSocket chat
- Actual browser voice/video provider if required
- Email activation/password reset
- Admin 2FA
- Secure production sessions/httpOnly cookies
- Backups, monitoring and staging load test
