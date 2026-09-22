#!/bin/bash
# Runs the dashboard + public tunnel and restarts either if it dies.
cd /home/user/lead-machine || exit 1
export WHATSAPP_PHONE="+971505852438"
export SMTP_USER="ihakizimana11@gmail.com"
export PAYMENT_LINK="https://paypal.me/7900861"
export PILOT_PRICE=350
export TARGET_CITIES="auto"
export CITY_BATCH=4
export PORT=8080
while true; do
  if ! curl -s -m 3 http://localhost:8080/api/health >/dev/null 2>&1; then
    pkill -9 -f "lead-machine/server.mjs" 2>/dev/null
    node /home/user/lead-machine/server.mjs >> /tmp/ka-server.log 2>&1 &
  fi
  if ! pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
    /home/user/bin/cloudflared tunnel --url http://localhost:8080 --no-autoupdate >> /tmp/ka-tun.log 2>&1 &
  fi
  sleep 10
done
