# FitTracker

A modern fitness tracking web application built with Next.js, Supabase, and Tailwind CSS.

## Features

- 💪 Workout tracking and exercise library
- 🍎 Nutrition logging with calorie counting
- 📊 Progress tracking (weight, measurements, photos)
- 🏠 Dashboard with daily summaries
- 👤 User profiles and goals
- 📱 Mobile-first responsive design
- 🔒 Secure authentication with Supabase

## Tech Stack

- **Framework**: Next.js 15.5.4 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn/ui (Radix UI)
- **Language**: TypeScript
- **Date Handling**: date-fns
- **Icons**: lucide-react

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```

4. Add your Supabase credentials to `.env.local`

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3001](http://localhost:3001) in your browser
   - Or if using nginx reverse proxy: [http://localhost:8080/app2](http://localhost:8080/app2)

### Mobile (Expo)

The native client lives in `mobile/` and is built with Expo Router.

```bash
cd mobile
npm install
npm run start
```

Configure your Supabase credentials via `mobile/.env` (see `mobile/README.md` for details) and scan the QR code with Expo Go or run `npm run ios` to launch the simulator.

## Project Structure

```
fittracker/
├── app/
│   ├── (app)/              # Protected routes
│   │   ├── layout.tsx      # Bottom nav wrapper
│   │   ├── page.tsx        # Dashboard
│   │   ├── workouts/
│   │   ├── nutrition/
│   │   ├── progress/
│   │   └── profile/
│   ├── (auth)/             # Auth routes
│   │   ├── login/
│   │   └── signup/
│   ├── layout.tsx          # Root layout
│   └── globals.css
├── components/
│   ├── ui/                 # shadcn components
│   ├── nav/                # Navigation
│   └── [features]/         # Feature components
├── lib/
│   ├── supabase/
│   │   ├── server.ts
│   │   └── client.ts
│   └── utils.ts
└── types/                  # TypeScript types
```

## License

MIT
