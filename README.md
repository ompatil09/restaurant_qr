# FoodOrder - Restaurant QR Ordering Counter Dashboard

Focused QR ordering for restaurants that run orders from one billing counter or kitchen counter screen.

## Features

- Secure table QR ordering with random `table_token` URLs
- Customer menu at `/order/:restaurantSlug/:tableToken`
- Dynamic full-menu customer search
- Cart and order placement without online payment
- Live Orders counter screen with Supabase Realtime
- Status flow: `new -> accepted -> preparing -> ready -> served`, plus `cancelled`
- Menu Management for item/category/price/description/image URL and availability
- Tables & QR Codes for table creation, QR download, printing, disabling, and token regeneration
- Premium menu fields: image upload, food type, best seller, recommended, and custom tags
- KOT browser printing from each live order
- Daily sales summary and top selling items
- Table-wise current bill/history for today's orders
- GST bill summary with CGST/SGST settings
- Admin PIN protection for deleting menu items and marking items unavailable
- Restaurant manager password change for temporary and normal passwords
- Lazy-loaded customer menu images with lightweight placeholders
- 3 MB JPG/PNG/WebP upload validation
- Date-range optimized order summaries and reports

Do not use predictable table URLs such as `/order/spice-cafe/table/07`. Use URLs such as `/order/spice-cafe/tbl_8Kx91LpQwZs73Hd2`.

## Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- Supabase PostgreSQL + Realtime
- React Router
- Lucide React
- qrcode.react

## Setup

```bash
npm install
```

Create `.env`:

```bash
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

For a new Supabase project, run:

```text
database/setup.sql
```

For an existing project after Part 1, run:

```text
database/customer_ordering_part1.sql
database/counter_dashboard_part2.sql
database/premium_menu_part3.sql
database/counter_premium_part3b.sql
database/production_hardening_part4.sql
database/security_hardening_part5.sql
database/subscription_auth_fixes_part6.sql
```

If your Supabase project was already created before these migrations, run the files above in order from the Supabase SQL editor. They are written to be idempotent with `ADD COLUMN IF NOT EXISTS` where possible.

## Table QR System

Each row in `tables` has:

- `table_number`: human-facing table name, such as `07`, `A1`, or `Family Room`
- `table_token`: random unguessable QR token
- `is_active`: disabled tables no longer validate for customer ordering

Create a table:

```sql
INSERT INTO tables (restaurant_id, table_number)
SELECT id, '07'
FROM restaurants
WHERE slug = 'spice-cafe';
```

Fetch QR tokens:

```sql
SELECT table_number, table_token
FROM tables
WHERE restaurant_id = (SELECT id FROM restaurants WHERE slug = 'spice-cafe');
```

QR URL format:

```text
/order/spice-cafe/<table_token>
```

Regenerating a table token changes `table_token`, so old QR URLs stop working. Disabling a table sets `is_active = false`, keeps old orders, and blocks that QR from placing new orders.

## Counter Dashboard

Restaurant users work from `/restaurant`.

- `/restaurant` - Live Orders
- `/restaurant/menu` - Menu Management
- `/restaurant/tables` - Tables & QR Codes
- `/restaurant/settings` - Settings

Live Orders cards show table number, order number, items with quantities, customer notes, total amount, time, and status. New orders appear through Supabase Realtime and play a loud notification sound.

The Live Orders screen also includes:

- `Print KOT` on every order card. This opens a thermal-printer-friendly browser print slip with restaurant name, table, order number, time, items, notes, and status.
- Daily summary cards for today's orders, revenue before GST, open orders, served orders, top item today, and most active table.
- Top selling items for today, last 7 days, and last 30 days.
- Table-wise current bill/history using today's non-cancelled orders grouped by table.
- Bill printing with subtotal, optional CGST/SGST, grand total, and the note: `Please pay using the UPI QR placed on your table or at the counter.`

This app still does not process online payments. The UPI QR is only displayed/configured as a payment instruction for the physical counter/table flow.

## Restaurant Settings

Restaurant users can configure:

- Logo URL/upload
- Theme color
- Customer welcome message
- UPI QR image URL/upload
- GST display on printed bills
- CGST and SGST percentages
- Admin PIN

The admin PIN must be 4 to 6 digits. The raw PIN is not stored in localStorage. The app stores a hash in the `restaurants.admin_pin_hash` column and asks for the PIN only when deleting a menu item or marking an available item unavailable. Adding items, editing items, marking items available, viewing orders, printing KOTs, and printing bills do not ask for the PIN.

## Manager Passwords

Restaurant managers log in with the temporary password generated during admin approval. In `/restaurant/settings`, managers can change that password.

- Temporary-password users see: `Please change your temporary password.`
- Temporary-password users set a new password without re-entering the generated password.
- Normal users must enter their current password.
- New passwords must be at least 8 characters.
- On success, `users.temp_password` becomes `false`.
- Raw passwords are never stored in localStorage.

## Customer GST Note

The customer menu and cart show:

```text
Prices shown are excluding GST. CGST/SGST may be added in final bill.
```

Final GST is shown only on the printed bill summary when GST display is enabled in restaurant settings.

## Supabase Storage

Menu and branding image uploads use the public-read `menu-images` Storage bucket created by `database/premium_menu_part3.sql`.

Because this project uses a lightweight custom/localStorage restaurant login instead of Supabase Auth, database writes are protected through scoped RPC functions. `database/security_hardening_part5.sql` narrows Storage uploads to the `menu/` and `branding/` folders, JPG/PNG/WebP MIME types, and 3 MB metadata. For stricter production security, move uploads behind a Netlify Function or Supabase Edge Function that uses server-only credentials and verifies the restaurant session before uploading.

Uploaded images are validated before upload:

- Allowed types: JPG, PNG, WebP
- Max file size: 3 MB
- Magic-byte validation for JPEG, PNG, and WebP
- SVG is rejected
- Original filenames are not trusted; uploaded filenames are generated by the app

Customer menu images use lazy loading, fixed dimensions, a skeleton placeholder, and a fallback placeholder for broken URLs.

## Query Optimization

Live Orders uses realtime only for today's active counter view and refetches today's orders after order changes. Reports do not subscribe to realtime. Reports fetch only the selected range: today, last 7 days, or last 30 days.

Part 4 adds these RPC helpers:

- `restaurant_change_password`
- `restaurant_list_orders_range`
- `get_daily_sales_summary`
- `get_top_selling_items`
- `get_table_order_history`

Part 4 also adds indexes for orders by restaurant/date/status/table, menu items by restaurant/availability, and tables by restaurant/token/active status.

## Backup Strategy

For paid restaurants, do not rely only on a free-plan/no-backup setup. Export the database weekly at minimum, and always before running migrations.

Supabase dashboard option:

1. Open Supabase Dashboard.
2. Go to your project.
3. Use Database backup/export tools available for your plan.
4. Store the SQL export outside this public repo.

CLI examples are in `scripts/backup/README.md`.

Example with `pg_dump`:

```bash
pg_dump "$DATABASE_URL" > backups/restaurant-ordering-$(date +%F).sql
```

Never commit `.env`, database passwords, or backup files. This repo ignores `backups/`, `*.dump`, and `*.sql.backup`, but migration files inside `database/` are intentionally tracked.

## Realtime Setup

The SQL migrations add these tables to `supabase_realtime` where possible:

- `orders`
- `menu_items`
- `tables`

In Supabase, confirm realtime replication is enabled for those tables. Customer menu updates use `menu_items` realtime events, and the counter screen uses `orders` realtime events.

## Build

```bash
npm run build
```

## Security Hardening

Run this migration manually in the Supabase SQL editor before shipping:

```text
database/security_hardening_part5.sql
database/subscription_auth_fixes_part6.sql
```

It adds:

- `rate_limits` table with hashed identifiers
- `check_rate_limit`, `record_rate_limit_attempt`, and `clear_rate_limit` RPC helpers
- rate-limited `admin_login`, `restaurant_login`, `submit_registration_request`, `restaurant_change_password`, and `create_customer_order`
- input constraints for restaurants, registration requests, tables, menu items, and orders
- narrowed Storage policies for menu/branding image uploads

Production Netlify environment variables:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Only use `VITE_` variables for public frontend values. Do not add service-role keys, database passwords, JWT secrets, or private API tokens to frontend code. `.env`, `.env.local`, `.netlify/`, `backups/`, dumps, and SQL backups are ignored by git.

Current production blockers to understand:

- True per-IP rate limiting is not possible from a static frontend that calls Supabase directly. Use Netlify Functions or Supabase Edge Functions for IP-aware throttling.
- The custom localStorage auth model prevents perfect RLS for admin and restaurant dashboards. Supabase Auth or a server-side API layer is required for strict per-user RLS enforcement.
- Storage upload authorization is narrowed but still not equivalent to authenticated server-side upload enforcement.

## Subscription Billing

Part 6 adds Stripe monthly subscription support for the Restaurant Plan at `₹1000/month`.

Manual Supabase migration:

```text
database/subscription_auth_fixes_part6.sql
database/stripe_billing_hardening_part7.sql
```

Netlify environment variables required for billing:

```env
STRIPE_SECRET_KEY=sk_live_or_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_RESTAURANT_MONTHLY=price_...
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
APP_SESSION_SECRET=at-least-32-random-characters
APP_URL=https://your-existing-netlify-site.netlify.app
```

Hosted Stripe Checkout does not need a frontend publishable key. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_SESSION_SECRET` must exist only in Netlify Function environment variables. Rotate any secret that has been pasted into source code, chat, logs, or tickets before using it.

Test keys and test Price objects only create simulated payments. To accept real money, activate the Stripe account and payouts, create the Product and Price in live mode, and replace the Netlify values with the matching live secret, live Price ID, and live webhook signing secret.

Stripe dashboard setup:

1. Create a product named `Restaurant Plan`.
2. Add a recurring monthly price for `₹1000` in INR.
3. Copy the price ID into `STRIPE_PRICE_ID_RESTAURANT_MONTHLY`.
4. Add a webhook endpoint:
   `https://your-existing-netlify-site.netlify.app/.netlify/functions/stripe-webhook`
5. Subscribe the webhook to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
6. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

Data retention rule:

- Subscription expiry never deletes menu items, tables, orders, reports, images, or settings.
- During grace period, the app keeps working and shows a payment warning.
- After grace expiry, manager login still works, Billing/Settings remain available, customer ordering is blocked, and core dashboard areas are locked until payment succeeds.

## Password Reset Flow

This app uses custom restaurant login, so password reset is admin-mediated:

1. Manager opens `/forgot-password`.
2. Manager enters registered email.
3. The app creates a database reset request without revealing whether the email exists.
4. Admin opens `/admin/password-resets`.
5. Admin approves the request and receives a generated temporary password.
6. Manager logs in with that temporary password and changes it in Settings.

## Post-Implementation Security Scan Prompt

Run this as the next Codex Security task:

```text
Run a standard repository-wide security scan focusing on authentication, authorization, table/order ID manipulation, price tampering, payment verification, admin APIs, file uploads, secrets, database rules, and vulnerable dependencies. Do not modify code; provide validated findings ranked by severity.
```

Safe deployment checklist:

```bash
npm install
npm audit
npm outdated
npm run build
```

The production build is output to `dist`.

## Netlify Deployment

This project is ready for Netlify using `netlify.toml`.

Netlify build settings:

- Build command: `npm run build`
- Publish directory: `dist`

Required Netlify environment variables:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
```

Use the Supabase anon/publishable key only. Do not use a `service_role` key in the frontend.

The included SPA redirect keeps client-side routes working on refresh:

- `/order/:restaurantSlug/:tableToken`
- `/admin/login`
- `/restaurant`

## Connect Netlify to GitHub for automatic deploys

The repository and `netlify.toml` are ready for continuous deployment, but the
existing Netlify site must be linked to GitHub by a Netlify account owner:

1. Push this project to GitHub.
2. Open the Netlify dashboard.
3. Open the existing deployed site. Do not create a second site.
4. Go to `Site configuration -> Build & deploy -> Continuous deployment`.
5. Click `Link repository` or `Connect to Git provider`.
6. Choose GitHub and approve the requested Netlify GitHub access.
7. Select this repository and the production branch, normally `main`.
8. Confirm the build command is `npm run build`.
9. Confirm the publish directory is `dist`.
10. Add the required environment variables in Netlify without committing them:

```env
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_RESTAURANT_MONTHLY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
APP_SESSION_SECRET
APP_URL
```

`APP_SESSION_SECRET` must be a random value of at least 32 characters.
`VITE_*` values are included in the browser bundle; never put a Stripe secret
or the Supabase service-role key in a `VITE_*` variable.

11. Trigger the first deploy and confirm the production URL still points to the
    existing Netlify site.
12. After the repository is linked, every push to the selected production
    branch automatically starts a Netlify build and production deploy.

Client-side routes are covered by the SPA redirect in `netlify.toml`, including
`/login`, `/register`, `/admin/login`, `/restaurant/...`, and
`/order/:restaurantSlug/:tableToken`.

## Future update workflow

```bash
git status
git add .
git commit -m "Describe changes"
git push
```

After the repository link is complete, Netlify automatically builds and updates
the live website from the selected branch.

Local `.env` files are ignored by `.gitignore` and must not be committed.

## License

MIT
