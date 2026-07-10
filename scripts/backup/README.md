# Backup Scripts

Keep restaurant menu, table, and order data backed up outside the public repo.

## Supabase CLI

```bash
supabase db dump --file backups/restaurant-ordering-$(date +%F).sql
```

On Windows PowerShell:

```powershell
supabase db dump --file "backups/restaurant-ordering-$(Get-Date -Format yyyy-MM-dd).sql"
```

## pg_dump

Set `DATABASE_URL` in your shell or CI secret store. Do not commit it.

```bash
pg_dump "$DATABASE_URL" > backups/restaurant-ordering-$(date +%F).sql
```

PowerShell:

```powershell
pg_dump $env:DATABASE_URL > "backups/restaurant-ordering-$(Get-Date -Format yyyy-MM-dd).sql"
```

Recommended cadence: export weekly at minimum, and before running database migrations for paid restaurants.
