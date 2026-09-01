# V2 features
- One website: public + client + Jay admin
- Hidden admin route: /coach-panel (not linked publicly)
- Backend role protection remains required even if route is discovered
- Natural: 3 months ₹9,000; 6 months ₹15,000
- Enhanced: 3 months ₹12,000; 6 months ₹20,000
- Active-subscription middleware protects paid coaching APIs
- Exercise/form video library schema
- Exercise alternatives
- Workout split exercises
- Nutrition macro plans and equivalent meal options
- Weekly check-ins, progress measurements and strength history
- Coach availability/calling-hours schema
- Admin program editing, client list and scheduled-call APIs
- Keep workout videos/photos in object storage; PostgreSQL stores URLs/metadata
- Existing API rate limiting and relational PostgreSQL design retained

Before production: add real Razorpay webhook handling, cloud media storage, real-time chat, calling provider, admin 2FA, password reset/account activation, backups, monitoring and staging load tests.
