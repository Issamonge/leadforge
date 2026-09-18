#!/bin/bash
# Keeps the Lead Machine dashboard + public tunnel alive. Restarts either if it dies.
cd /home/user/lead-machine || exit 1
export WHATSAPP_PHONE="+971505852438"
export PAYMENT_LINK="https://paypal.me/7900861"
export PILOT_PRICE=350
export TARGET_CITIES="Dubai"
export PORT=8080
echo "[supervisor] started $(date -u)"
while true; do
  if ! curl -s -m 3 http://localhost:8080/api/health >/dev/null 2>&1; then
    pkill -9 -f "lead-machine/server.mjs" 2>/dev/null
    setsid node /home/user/lead-machine/server.mjs >> /tmp/sup-server.log 2>&1 < /dev/null &
    echo "[supervisor] started server $(date -u)" >> /tmp/sup-events.log
  fi
  if ! pgrep -f "cloudflared tunnel" >/dev/null 2>&1; then
    setsid /home/user/bin/cloudflared tunnel --url http://localhost:8080 --no-autoupdate >> /tmp/sup-tun.log 2>&1 < /dev/null &
    echo "[supervisor] started tunnel $(date -u)" >> /tmp/sup-events.log
  fi
  sleep 12
done
