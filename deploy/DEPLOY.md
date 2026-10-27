# Put Sweet Eye Coffee live on your VPS

**Address:** https://app.sweeteyecoffee.com
**VPS:** 187.127.189.130 (Ubuntu, nginx 1.24, PM2 — already running 5 other apps)
**Code:** https://github.com/ankit-datatrainer/sweeteyecoffee
**Database:** your live website database on Hostinger (`u173173807_sweeteye`), through Remote MySQL — so the app and the website share the same menu, accounts and orders.

The app gets **its own folder, its own port (4600), its own PM2 process and its own nginx file**. Nothing here stops, restarts or changes your other apps.

> **Never run** `pm2 delete all`, `pm2 restart all`, `pm2 stop all`, `apt upgrade nodejs`, `ufw enable`, or delete anything in `/etc/nginx/sites-enabled/` — those can take your other apps down.

---

## Step 1 — DNS ✅ (already done)

`app` → `187.127.189.130` is correct and already working worldwide.

## Step 2 — Let the VPS reach the website database (Hostinger hPanel)

1. hPanel → **Websites → sweeteyecoffee.com → Databases → Remote MySQL**
2. **IP:** `187.127.189.130` (do **not** tick "Any Host" — that lets the whole internet try to log in)
3. **Database:** `u173173807_sweeteye` → **Create**
4. Find the database **username** on **Databases → Management** (looks like `u173173807_something`).
5. Find the **password** in the website's own settings: **Files → File Manager → public_html → `.env`** → the `DB_PASSWORD=` line.
   ⚠️ Don't use "change password" in hPanel — that would break the live website until its `.env` is updated too.

Database server name: `srv1509.hstgr.io` (port `3306`).

**Optional (makes order lists faster):** hPanel → Databases → phpMyAdmin → pick `u173173807_sweeteye` → **SQL** tab → run:

```sql
ALTER TABLE orders
  ADD INDEX orders_paid_created (awaiting_payment, created_at, id),
  ADD INDEX orders_user_paid_created (user_id, awaiting_payment, created_at),
  ADD INDEX orders_status_paid_created (status, awaiting_payment, created_at);
```

(Only adds indexes — no data is changed. If it says "Duplicate key name", they're already there.)

## Step 3 — Log in to the VPS and check it's safe

Open Windows Terminal:

```bash
ssh root@187.127.189.130
```

Run these checks — they only **look**, they change nothing:

```bash
node -v
ss -ltnp | grep ':4600 ' || echo "port 4600 is free"
nginx -v
pm2 list
```

- `node -v` must be **v20 or higher**. If it's lower, **stop here and tell me** — we'll give this app its own Node without touching the one your other apps use.
- It must say **port 4600 is free**. If something is already on 4600, tell me and we'll pick another port.

## Step 4 — Download the app

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/ankit-datatrainer/sweeteyecoffee.git sweeteye
cd /var/www/sweeteye
```

## Step 5 — Install and build (takes a few minutes)

```bash
npm --prefix server install --omit=dev --no-audit --no-fund
npm --prefix mobile install --no-audit --no-fund
npm --prefix mobile run build:web
```

The last command builds the website into `mobile/dist`. Warnings are fine; it should end with `Exported: dist`.

## Step 6 — Settings (`server/.env`)

The easiest way: copy your working `.env` from your computer to the VPS. **On your computer** (a new Windows Terminal window, not the SSH one):

```bash
scp "C:\Users\ankit\OneDrive\Desktop\Upside Down Project\Sweet Eye Coffee - Application\server\.env" root@187.127.189.130:/var/www/sweeteye/server/.env
```

Back **on the VPS**, make a new secret for logins:

```bash
openssl rand -hex 48
```

Copy what it prints, then open the settings file:

```bash
nano /var/www/sweeteye/server/.env
```

Change / add these lines (keep all the Square, Stripe, UPS and mail lines as they are):

```ini
NODE_ENV=production
PORT=4600
PUBLIC_URL=https://app.sweeteyecoffee.com

DB_HOST=srv1509.hstgr.io
DB_PORT=3306
DB_DATABASE=u173173807_sweeteye
DB_USERNAME=u173173807_...        # from Step 2
DB_PASSWORD=...                   # from Step 2
DB_SSL=true

JWT_SECRET=...                    # paste the openssl value
PAYMENTS_MODE=live
MAIL_ENABLED=true
```

Save: **Ctrl+O**, **Enter**, **Ctrl+X**. Then lock the file so only root can read it:

```bash
chmod 600 /var/www/sweeteye/server/.env
```

## Step 7 — Test the database connection

```bash
cd /var/www/sweeteye/server
node --input-type=module -e "import {pool} from './src/db.js'; const [r] = await pool.query('SELECT COUNT(*) AS n FROM products'); console.log('DATABASE OK - products:', r[0].n); process.exit(0)"
```

- **`DATABASE OK - products: …`** → go to Step 8.
- Error mentioning **certificate / self-signed** → add `DB_SSL_VERIFY=false` under `DB_SSL=true` in `.env` (still encrypted), run the test again.
- Error **"server does not support secure connection"** → change to `DB_SSL=false`, run again.
- Error **"Access denied" / "not allowed to connect"** → re-check Step 2 (IP, username, password).
  If the error shows an address with colons (IPv6, like `2a02:…`), add that address in Remote MySQL too.

## Step 8 — Start the app (PM2)

```bash
cd /var/www/sweeteye
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 list
```

You should see **sweet-eye — online**, and your 5 other apps still **online** with no change.

```bash
curl http://127.0.0.1:4600/api/health
```

Should print `{"ok":true,"payments_mode":"live"}`. If not: `pm2 logs sweet-eye --lines 40` and send me the output.

## Step 9 — Connect the address (nginx)

```bash
cp /var/www/sweeteye/deploy/nginx.conf /etc/nginx/sites-available/sweeteye
ln -s /etc/nginx/sites-available/sweeteye /etc/nginx/sites-enabled/sweeteye
nginx -t
```

- `nginx -t` says **syntax is ok / test is successful** → run: `systemctl reload nginx`
  (reload keeps your other sites running — no downtime).
- If `nginx -t` shows an **error**, do **not** reload. Undo with `rm /etc/nginx/sites-enabled/sweeteye` and send me the error.

## Step 10 — HTTPS (the padlock)

```bash
which certbot || apt install -y certbot python3-certbot-nginx
certbot --nginx -d app.sweeteyecoffee.com
```

Enter your email, agree, and if asked choose **Redirect** (HTTP → HTTPS). Certbot only edits the `sweeteye` file. Certificates renew automatically.

## Step 11 — Check it's live

- Open **https://app.sweeteyecoffee.com** on your phone and computer — menu, photos, bag, checkout.
- Open **https://app.sweeteyecoffee.com/api/health** → `{"ok":true,...}`
- `pm2 list` → all apps online.

## Step 12 — Stripe webhook (recommended, 2 minutes)

Stripe Dashboard → **Developers → Webhooks → Add endpoint**

- URL: `https://app.sweeteyecoffee.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`

Copy the **signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET` in `server/.env`, then `pm2 restart sweet-eye` (only this app).

---

## Updating the app later

On your computer, push the new code to GitHub. Then on the VPS:

```bash
cd /var/www/sweeteye
git checkout -- . && git pull
npm --prefix server install --omit=dev --no-audit --no-fund
npm --prefix mobile install --no-audit --no-fund && npm --prefix mobile run build:web
pm2 restart sweet-eye
```

## Useful commands (this app only)

| What | Command |
|---|---|
| Is it running? | `pm2 list` |
| Recent logs | `pm2 logs sweet-eye --lines 50` |
| Restart | `pm2 restart sweet-eye` |
| Stop | `pm2 stop sweet-eye` |

## Backups

- **Database:** it's your website's Hostinger database, so it's covered by Hostinger's website backups (hPanel → Files → Backups).
- **Staff-uploaded photos** live on the VPS in `/var/www/sweeteye/server/public/images` — keep a copy now and then, e.g. from your computer:
  `scp -r root@187.127.189.130:/var/www/sweeteye/server/public/images ./sweeteye-images-backup`
- **`server/.env`** — keep a copy somewhere safe (password manager).

## Phone apps

See [STORES.md](STORES.md). They already point at `https://app.sweeteyecoffee.com` (`mobile/eas.json`).
