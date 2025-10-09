# FitTracker Setup Guide

Complete setup instructions for getting FitTracker up and running.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (free tier works fine)

## Step 1: Clone and Install

```bash
cd fittracker
npm install
```

## Step 2: Set Up Supabase

### 2.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be provisioned (takes ~2 minutes)
3. Note down your project URL and anon key

### 2.2 Set Up Environment Variables

Create a `.env.local` file in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Replace the values with your Supabase project credentials:
- **URL**: Found in Project Settings > API > Project URL
- **Anon Key**: Found in Project Settings > API > Project API keys (anon/public)

### 2.3 Run Database Migrations

1. Open your Supabase project dashboard
2. Go to the SQL Editor
3. Copy the contents of `supabase/schema.sql`
4. Paste and run the SQL in the editor
5. Verify that all tables, policies, and triggers were created successfully

You should see these tables in the Table Editor:
- profiles
- workouts
- exercises
- nutrition_logs
- weight_logs
- water_logs

### 2.4 Configure Authentication (Optional)

By default, Supabase allows email/password authentication. To customize:

1. Go to Authentication > Providers
2. Enable/disable providers as needed
3. Configure email templates in Authentication > Email Templates

## Step 3: Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

## Step 4: Create Your First Account

1. Navigate to the signup page
2. Create an account with your email and password
3. You'll be automatically logged in and redirected to the dashboard

## Step 5: Customize (Optional)

### Change Primary Color

Edit `app/globals.css` and modify the `--primary` CSS variable:

```css
--primary: 142 76% 36%; /* Green (default) */
```

Try these alternatives:
- Blue: `221 83% 53%`
- Purple: `262 83% 58%`
- Orange: `25 95% 53%`
- Pink: `330 81% 60%`

### Add App Icons for PWA

1. Create two icon files:
   - `public/icon-192.png` (192x192px)
   - `public/icon-512.png` (512x512px)

2. Use your logo or branding
3. The app is now installable on mobile devices

## Features Overview

### Dashboard
- View today's summary (calories, workouts, water)
- See recent workout history
- Track current weight vs goal

### Workouts
- Log workouts with type, duration, and calories
- View workout history
- Track different workout types

### Nutrition
- Log meals by type (breakfast, lunch, dinner, snack)
- Track calories and macros (protein, carbs, fat)
- Quick water logging
- View daily totals

### Progress
- Log weight over time
- View weight chart with trend line
- See progress toward goal weight
- Track total weight change

### Profile
- Set personal goals (target weight, daily calories)
- Update profile information
- Manage account settings

## Architecture Notes

### Server Components
Most pages use React Server Components for optimal performance:
- Data fetching happens on the server
- No client-side API calls needed
- Direct database queries via Supabase

### Client Components
Used only when necessary:
- Forms and modals
- Interactive buttons
- Client-side navigation

### Database Security
Row Level Security (RLS) ensures:
- Users only see their own data
- Automatic user ID filtering
- Secure by default

## Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import project to Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

### Production Checklist

- [ ] Set up custom domain
- [ ] Configure production Supabase project
- [ ] Add app icons for PWA
- [ ] Test on mobile devices
- [ ] Enable Supabase email confirmations
- [ ] Set up database backups
- [ ] Monitor error logs

## Troubleshooting

### "Authentication required" errors
- Check that your `.env.local` file exists and has the correct values
- Restart the dev server after adding environment variables
- Verify Supabase credentials in the dashboard

### Database errors
- Ensure all SQL migrations ran successfully
- Check RLS policies are enabled on all tables
- Verify user profile was created after signup

### Build errors
- Clear `.next` folder: `rm -rf .next`
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Check for TypeScript errors: `npm run build`

## Support

For issues or questions:
- Check the README.md for general information
- Review the database schema in `supabase/schema.sql`
- Verify environment variables are set correctly

## Next Steps

Consider adding:
- Exercise library with predefined exercises
- Photo progress tracking
- Body measurements (chest, waist, etc.)
- Workout templates
- Export data functionality
- Social features (friends, challenges)
- Integration with fitness devices
