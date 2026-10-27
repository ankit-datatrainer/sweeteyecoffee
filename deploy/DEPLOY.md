# Deploying Sweet Eye Coffee to the Hostinger VPS

One Node process serves everything on the VPS: the API (`/api`), the menu photos (`/images`) and the web app (every other address). nginx sits in front for HTTPS, compression and request limits. The phone apps (App Store / Play Store builds) talk to the same `https://yourdomain.com`.

Replace `yourdomain.com` everywhere below with your real domain.

## 0. Before you start

- Point the domain's **A record** (and `www`) at the VPS IP in your DNS (Hostinger → Domains → DNS).
- VPS OS: Ubuntu 22.04 / 24.04 (Hostinger's default templates).
- Have the `server/.env` from this computer ready; you'll copy its keys.

## 1. Server packages (once)

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install nginx mariadb-server certbot python3-certbot-nginx ufw fail2ban unattended-upgrades
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt -y install nodejs
sudo npm install -g pm2
```

Firewall — only SSH and web are reachable; MySQL and port 4000 stay private:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

`fail2ban` blocks repeated SSH password guesses out of the box. Better still, use SSH keys and set `PasswordAuthentication no` in `/etc/ssh/sshd_config`.

## 2. Database

```bash
sudo mysql_secure_installation          # set a root password, remove test DB, disallow remote root
sudo mysql
```

```sql
CREATE DATABASE sweet_eye_coffee CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'sweeteye'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON sweet_eye_coffee.* TO 'sweeteye'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Export the **current** database from phpMyAdmin on this computer (Export → SQL), upload it, then:

```bash
sudo mysql sweet_eye_coffee < sweet_eye_coffee.sql
```

(The app user only gets read/write on rows — it can't drop tables even if something went wrong.)

## 3. App code

Upload this project folder (without `node_modules`, `mobile/node_modules`, `server/node_modules`, `server/.image-cache`) to `/var/www/sweeteye`, e.g. with `scp`, SFTP or git. Then:

```bash
cd /var/www/sweeteye
npm --prefix server ci --omit=dev
npm --prefix mobile ci
npm --prefix mobile run build:web        # builds the web app into mobile/dist
```

## 4. Settings — `server/.env`

```bash
cp server/.env.example server/.env
nano server/.env
chmod 600 server/.env
```

Fill it in from your local `server/.env`, and change these for the server:

```ini
NODE_ENV=production
PUBLIC_URL=https://yourdomain.com
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=sweeteye
DB_PASSWORD=the password from step 2
JWT_SECRET=          # new value: run  openssl rand -hex 48
PAYMENTS_MODE=live
MAIL_ENABLED=true
```

`PUBLIC_URL` is important: it's used for photo links, Stripe's return pages and to lock the API to your own website (CORS). A new `JWT_SECRET` signs everyone out once, which is fine at launch.

## 5. Start it

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup          # run the command it prints, so it starts after a reboot
curl http://127.0.0.1:4000/api/health      # → {"ok":true,...}
```

## 6. nginx + HTTPS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/sweeteye
sudo sed -i 's/yourdomain.com/YOUR-REAL-DOMAIN/g' /etc/nginx/sites-available/sweeteye
sudo ln -s /etc/nginx/sites-available/sweeteye /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com --redirect
```

Open `https://yourdomain.com` — the web app loads; `https://yourdomain.com/api/health` answers.

## 7. Stripe webhook (recommended)

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://yourdomain.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`

Copy its signing secret into `STRIPE_WEBHOOK_SECRET` and `pm2 restart sweet-eye`. (Payments already confirm when the customer returns to the app; the webhook covers people who close the page right after paying.)

Square needs nothing extra — the app uses the same location as the website.

## 8. Updating later

```bash
cd /var/www/sweeteye
# upload / git pull the new code, then:
npm --prefix server ci --omit=dev
npm --prefix mobile ci && npm --prefix mobile run build:web
pm2 restart sweet-eye
```

## 9. Backups

Daily database backup, keeping 14 days:

```bash
sudo mkdir -p /var/backups/sweeteye
sudo crontab -e
# add:
30 3 * * * mysqldump --single-transaction sweet_eye_coffee | gzip > /var/backups/sweeteye/db-$(date +\%F).sql.gz && find /var/backups/sweeteye -mtime +14 -delete
```

Also back up `server/.env` and `server/public/images` (staff-uploaded photos) somewhere off the server. Hostinger's VPS snapshots are a good extra layer.

## Phone apps

See `deploy/STORES.md` for building and submitting the iOS and Android apps. They point at `https://yourdomain.com`, so do the steps above first.
