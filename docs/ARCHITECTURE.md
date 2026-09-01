# Architecture notes

## Why PostgreSQL

Client, payment, subscription and progress data are relational. PostgreSQL gives:
- transactions for payment + subscription activation
- unique constraints for payment IDs and emails
- indexes for common dashboard queries
- reliable backups and migrations
- strong consistency

## Database design choices

The schema separates:
- users
- client profiles
- programs
- subscriptions
- payments
- leads
- appointments
- messages
- check-ins
- workout plans
- nutrition plans

This prevents one giant client table from becoming difficult to maintain.

## Capacity target: 100 concurrent users

100 concurrent users is not a high load for this architecture if deployed correctly.

The important parts are:
1. Managed PostgreSQL with pooled connections.
2. Avoid returning every client at once; admin clients are paginated.
3. Indexed fields for status, dates, relationships and common lookups.
4. Static frontend served through a CDN.
5. API rate limiting.
6. Keep uploaded progress photos in object storage such as S3/Cloudinary, not directly in PostgreSQL.
7. Keep only photo URLs in the database.
8. Use background jobs later for emails, reminders and large reports.

## When traffic grows

At higher load, add:
- Redis for caching/rate limits
- a queue such as BullMQ
- object storage + CDN
- horizontal API replicas
- read replicas for reporting
- WebSocket infrastructure for real-time chat
