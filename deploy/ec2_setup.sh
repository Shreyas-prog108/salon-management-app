#!/bin/bash
# EC2 Ubuntu 22.04 — Salon Management App Setup
# Run as: bash ec2_setup.sh
set -e

echo "=== [1/7] System update ==="
sudo apt-get update -y && sudo apt-get upgrade -y

echo "=== [2/7] Installing packages ==="
sudo apt-get install -y python3 python3-pip python3-venv \
    postgresql postgresql-contrib \
    redis-server \
    nginx \
    git certbot python3-certbot-nginx \
    build-essential libpq-dev

echo "=== [3/7] PostgreSQL setup ==="
sudo systemctl enable postgresql && sudo systemctl start postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='salon_user'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE USER salon_user WITH PASSWORD 'salon_pass_change_me';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='salon'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE salon OWNER salon_user;"
echo "PostgreSQL ready: salon DB created"

echo "=== [4/7] Redis setup ==="
sudo systemctl enable redis-server && sudo systemctl start redis-server
echo "Redis ready"

echo "=== [5/7] App setup ==="
APP_DIR="/opt/salon"
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Clone or pull repo
if [ -d "$APP_DIR/.git" ]; then
    git -C $APP_DIR pull
else
    git clone https://github.com/Shreyas-prog108/salon-management-app.git $APP_DIR
fi

# Python venv
python3 -m venv $APP_DIR/backend/venv
$APP_DIR/backend/venv/bin/pip install --upgrade pip
$APP_DIR/backend/venv/bin/pip install -r $APP_DIR/backend/requirements.txt

# Create .env
if [ ! -f "$APP_DIR/backend/.env" ]; then
    cp $APP_DIR/backend/.env.example $APP_DIR/backend/.env
    echo "⚠️  Edit $APP_DIR/backend/.env with your values before starting!"
fi

# Uploads folder
mkdir -p $APP_DIR/backend/uploads $APP_DIR/backend/exports $APP_DIR/backend/logs
echo "App files ready at $APP_DIR"

echo "=== [6/7] Systemd services ==="
APP_VENV="$APP_DIR/backend/venv/bin"

# Flask (Gunicorn)
sudo tee /etc/systemd/system/salon-web.service > /dev/null <<EOF
[Unit]
Description=Salon Flask App (Gunicorn)
After=network.target postgresql.service redis.service

[Service]
User=$USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_VENV/gunicorn -w 2 -b 127.0.0.1:5000 wsgi:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Celery Worker
sudo tee /etc/systemd/system/salon-celery.service > /dev/null <<EOF
[Unit]
Description=Salon Celery Worker
After=network.target redis.service

[Service]
User=$USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_VENV/celery -A celery_app worker --loglevel=info --pool=solo -n salon-worker@%h
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Celery Beat
sudo tee /etc/systemd/system/salon-beat.service > /dev/null <<EOF
[Unit]
Description=Salon Celery Beat Scheduler
After=network.target redis.service

[Service]
User=$USER
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_VENV/celery -A celery_app beat --loglevel=info --pidfile=
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable salon-web salon-celery salon-beat

echo "=== [7/7] Nginx config ==="
sudo tee /etc/nginx/sites-available/salon > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 20M;

    location /uploads/ {
        alias /opt/salon/backend/uploads/;
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/salon /etc/nginx/sites-enabled/salon
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

echo ""
echo "======================================"
echo " Setup complete!"
echo " Next steps:"
echo "  1. Edit /opt/salon/backend/.env"
echo "  2. sudo systemctl start salon-web salon-celery salon-beat"
echo "  3. sudo systemctl status salon-web"
echo "  4. For HTTPS: sudo certbot --nginx -d yourdomain.com"
echo "======================================"
