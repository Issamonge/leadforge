#!/bin/bash
cd /home/user/lead-machine
export WHATSAPP_PHONE="+971505852438"
export PAYPAL_EMAIL="ihakizimana11@gmail.com"
export PILOT_PRICE=350
export DAILY_TARGET=30
export DAILY_SEND_CAP=25
export SEND_OUTREACH=true
export PORT=8080
export URGENT_CALL=false
export PAYMENT_LINK='https://paypal.me/7900861'
exec node /home/user/lead-machine/server.mjs
