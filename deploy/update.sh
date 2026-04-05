#!/bin/bash
# Quick update script — run after git push to redeploy
set -e
APP_DIR="/opt/salon"

echo "Pulling latest code..."
git -C $APP_DIR pull

echo "Installing new dependencies..."
$APP_DIR/backend/venv/bin/pip install -r $APP_DIR/backend/requirements.txt -q

echo "Restarting services..."
sudo systemctl restart salon-web salon-celery salon-beat

echo "Done! Status:"
sudo systemctl status salon-web --no-pager -l | tail -5
