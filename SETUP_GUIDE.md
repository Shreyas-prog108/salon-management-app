# Salon Management App — Setup Guide

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.11+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| Docker Desktop | Latest | `docker info` |

---

## Local Development Setup

### 1. Clone & configure backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create your `.env` file:

```bash
cp .env.example .env
```

Minimum required values in `.env`:

```env
SECRET_KEY=any-random-32-char-string
JWT_SECRET_KEY=another-random-32-char-string
DEFAULT_ADMIN_PASSWORD=yourpassword
DEFAULT_ADMIN_EMAIL=admin@yoursalon.com

# Mail (Gmail example)
MAIL_USERNAME=your@gmail.com
MAIL_PASSWORD=your-app-password   # Gmail App Password, not your login password

# SMS (optional bonus)
FAST2SMS_API_KEY=your-fast2sms-key
```

### 2. Start backend services

```bash
python start.py
```

This single command:
1. Starts Docker Desktop (if not already running)
2. Launches PostgreSQL container on port 5432
3. Launches Redis container on port 6380
4. Waits for both to be healthy
5. Starts Flask on `http://localhost:5000`
6. Starts Celery worker + beat scheduler

### 3. Frontend setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
FLASK_URL=http://localhost:5000
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

Start the dev server:

```bash
npm run dev
```

Frontend runs at **http://localhost:3000**

---

## First Run

On first startup, the backend auto-creates:
- Admin user (`admin` / value of `DEFAULT_ADMIN_PASSWORD`)
- Default services (Haircut, Hair Coloring, etc.)
- Default operating hours (Mon–Sat, 9 AM – 8 PM)

If `DEFAULT_ADMIN_PASSWORD` is not set, a secure random password is printed to the terminal:
```
[SETUP] Generated password: xK9#mP2@vL5qRn8!
```

---

## EC2 Production Deployment

### 1. Launch EC2 instance
- AMI: Ubuntu 22.04 LTS
- Instance type: t3.micro (free tier eligible)
- Security group: allow ports 22 (SSH), 80 (HTTP), 443 (HTTPS)

### 2. SSH and run setup script

```bash
ssh -i your-key.pem ubuntu@<EC2-PUBLIC-IP>
git clone https://github.com/Shreyas-prog108/salon-management-app.git
bash salon-management-app/deploy/ec2_setup.sh
```

The script installs: Python, PostgreSQL, Redis, Nginx, Gunicorn, and configures systemd services.

### 3. Configure environment

```bash
nano /opt/salon/backend/.env
```

```env
SECRET_KEY=<secure-random-string>
JWT_SECRET_KEY=<secure-random-string>
DATABASE_URL=postgresql://salon_user:salon_pass_change_me@localhost:5432/salon
REDIS_URL=redis://127.0.0.1:6379/0
CELERY_BROKER_URL=redis://127.0.0.1:6379/0
CELERY_RESULT_BACKEND=redis://127.0.0.1:6379/0
FLASK_ENV=production
DEFAULT_ADMIN_PASSWORD=<your-admin-password>
DEFAULT_ADMIN_EMAIL=<your-email>
MAIL_USERNAME=<gmail>
MAIL_PASSWORD=<app-password>
FAST2SMS_API_KEY=<key>
FRONTEND_URL=https://<your-vercel-url>
```

### 4. Start services

```bash
sudo systemctl start salon-web salon-celery salon-beat
sudo systemctl status salon-web
```

### 5. HTTPS (optional but recommended)

```bash
sudo certbot --nginx -d yourdomain.com
```

### 6. Deploy updates

```bash
bash /opt/salon/deploy/update.sh
```

---

## Frontend Deployment (Vercel)

1. Push code to GitHub
2. Go to vercel.com → New Project → import repo
3. Set root directory: `frontend`
4. Add environment variable:
   ```
   FLASK_URL=https://<your-ec2-ip-or-domain>
   ```
5. Deploy

---

## Stopping Services (Local)

```bash
# Stop Flask + Celery
Ctrl+C  (in the start.py terminal)

# Stop Docker containers (keep data)
cd backend && docker compose down

# Stop and delete database
docker compose down -v
```

---

## Common Issues

### "Redis connection refused"
```bash
# Check Docker is running
docker ps
# Restart containers
cd backend && docker compose up -d
```

### "ModuleNotFoundError"
```bash
source backend/venv/bin/activate
pip install -r backend/requirements.txt
```

### "Port 5000 already in use"
```bash
lsof -ti:5000 | xargs kill -9
```

### "Port 3000 already in use"
```bash
lsof -ti:3000 | xargs kill -9
```

### Database out of sync (new columns added)
```bash
# The app uses db.create_all() — restart Flask to auto-create new tables/columns
# For column changes on existing tables, drop and recreate:
cd backend && docker compose down -v && docker compose up -d
python start.py
```
