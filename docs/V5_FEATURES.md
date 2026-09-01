# Jay Aesthetics V5

Same website, expanded client management.

## Added
- Client onboarding: DOB/age, height, weight, goal, training experience, contact details
- Rich individual client workspace in Coach Panel
- Tabs for overview, profile, subscription, workout, nutrition, progress, check-ins, calls, payments and private notes
- Weekly check-in fields: weight, training performance, diet adherence, energy, sleep, steps/cardio, problems and questions
- Private Jay-only coach notes

## Upgrade from V4
```bash
npm install
npm run db:generate
cd apps/api
npx prisma db push
cd ../..
npm run dev
```
Do not use `--force-reset` after real client data exists.
