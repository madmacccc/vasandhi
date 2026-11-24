# ஸ்ரீ வசந்தி நகை அடகு கடை

Browser-based billing and pawn-ledger app built with React 19, TypeScript and Vite. Features Tamil pawn receipts, printable customer/office copies, searchable ledger, interest preview, redemption tracking, customer Aadhaar number and photos (JPG/PNG/WebP, up to 20 KB each), CSV export, JSON backup/restore and an installable mobile PWA.

## Setup

1. Install Node.js 22.12 or later and run `npm install`.
2. In Supabase Dashboard, enable **Authentication → Providers → Email**, require email confirmation, and disable public sign-ups. Create or invite the shop admin in **Authentication → Users** and confirm the admin email.
3. In [supabase-setup.sql](./supabase-setup.sql), replace the admin email in the RLS policies with the exact admin email and run the SQL in Supabase SQL Editor. The script adds separate columns for every pawn-record field and backfills existing records from `record_data`.
4. Copy [.env.example](./.env.example) to `.env.local` and fill in the Supabase Project URL, Supabase anon/publishable key, and the same admin email. Never put the Supabase service-role key in the app.
5. Start the app with `npm run dev`. Open the forwarded port **5173** in your browser (Codespaces will show an **Open in Browser** prompt).

For production, run `npm run build` and deploy the generated `dist/` folder to an HTTPS static web host. Configure the site's URL in Supabase Authentication settings. On a mobile browser, open the deployed site and choose **Install app** / **Add to Home Screen** from the browser menu. The app shell can open offline after it has loaded once, but sign-in, saving and loading records still require an internet connection to Supabase. The login screen and database row-level security both restrict access to the configured admin email. Firebase accounts/passwords do not transfer; create the admin in Supabase and set a new password. Existing pawn records remain in Supabase. Keep regular JSON backups; deleting a record is permanent.

The Aadhaar number and image data are stored with each record in Supabase and are sensitive personal information. Keep the table's admin-only row-level security enabled and restrict project access. Images are stored as data URLs in `record_data` and in their dedicated table columns.
