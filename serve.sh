#!/bin/bash
cd /home/user/lead-machine
export WHATSAPP_PHONE="+971505852438"
export CALLMEBOT_API_KEY="${CALLMEBOT_API_KEY:-}"
export SMTP_USER="ihakizimana11@gmail.com"
export SMTP_PASS="${SMTP_PASS:-}"
export PAYMENT_LINK="https://paypal.me/7900861"
export PILOT_PRICE=350
export TARGET_CITIES="auto"
export CITY_BATCH=4
export PORT=8080
exec node server.mjs
