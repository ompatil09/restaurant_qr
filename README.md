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

Menu and branding image uploads use the public `menu-images` Storage bucket created by `database/premium_menu_part3.sql`.

Because this project uses a lightweight custom/localStorage restaurant login instead of Supabase Auth, database writes are protected through scoped RPC functions, while Storage uploads use the public anon upload policy for this bucket. Use a production Supabase Auth setup before storing private media.

Uploaded images are validated before upload:

- Allowed types: JPG, PNG, WebP
- Max file size: 3 MB
- Invalid files are rejected with `Image must be less than 3 MB.` when oversized

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

Manual Netlify deploy steps:

1. Push this code to GitHub.
2. Open Netlify.
3. Add a new site from Git.
4. Select the repository.
5. Set build command to `npm run build`.
6. Set publish directory to `dist`.
7. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
8. Deploy.

Local `.env` files are ignored by `.gitignore` and must not be committed.

## License

MIT
