#!/bin/bash
set -euo pipefail

# Define your local app directory and data directory
APP_DIR=~/ghostinbox
DATA_DIR=~/data
POSTFIX_DIR=$APP_DIR/postfix
SECURITY_DIR=$APP_DIR/security
BUILD_DIR=$APP_DIR/build
HANDLE_EMAIL_JS=$APP_DIR/handle-email.js
SECURITY_JS=$SECURITY_DIR/security.js
START_SH=$APP_DIR/start.sh

echo "🔄 Updating system and installing dependencies..."

sudo dnf -y install \
    postfix \
    cyrus-sasl \
    ca-certificates \
    fail2ban \
    iptables \
    rsyslog

echo "📁 Creating directories..."
mkdir -p $APP_DIR
mkdir -p $DATA_DIR
mkdir -p $POSTFIX_DIR
mkdir -p $SECURITY_DIR
mkdir -p $BUILD_DIR  # Make sure the build directory is created

echo "📦 Installing Node dependencies..."
npm install

echo "🏗️ Building the SvelteKit app..."
npm run build

echo "🧹 Pruning dev dependencies..."
npm prune --production

echo "📂 Copying Postfix configuration..."
sudo cp postfix/master.cf /etc/postfix/master.cf
sudo cp postfix/main.cf.template /etc/postfix/main.cf.template
sudo cp postfix/recipient_access.template $POSTFIX_DIR/recipient_access.template

echo "📂 Copying security files..."
# Copy security files to the correct directory
sudo cp security/security.js $SECURITY_DIR/security.js
sudo cp handle-email.js $APP_DIR/handle-email.js

echo "📂 Copying scripts..."
# Copy start.sh
sudo cp start.sh $APP_DIR/start.sh

echo "📂 Copying the build directory..."
# Copy the build directory to the app directory (adjust if needed)
cp -r build/* $BUILD_DIR/

echo "🔐 Setting up Fail2ban filters..."
sudo mkdir -p /etc/fail2ban/filter.d
sudo cp security/filter.d/* /etc/fail2ban/filter.d/

echo "📝 Creating log files..."
sudo mkdir -p /var/log /var/run/fail2ban /var/lib/fail2ban
sudo touch /var/log/mail.log /var/log/ghostinbox.log
sudo chmod 644 /var/log/mail.log /var/log/ghostinbox.log

echo "🔧 Setting permissions..."

# Check if security.js exists before setting permissions
if [ -f "$SECURITY_JS" ]; then
    sudo chmod +x $SECURITY_JS
else
    echo "⚠️ No security.js file found, skipping permission change."
fi

# Check if handle-email.js exists before setting permissions
if [ -f "$HANDLE_EMAIL_JS" ]; then
    sudo chmod +x $HANDLE_EMAIL_JS
else
    echo "⚠️ No handle-email.js file found, skipping permission change."
fi

sudo chmod +x $START_SH

# Set other permissions
chmod 755 $SECURITY_DIR

echo "🌐 Opening firewall ports..."
sudo firewall-cmd --permanent --add-port=25/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

echo "✅ Environment variables set:"
export NODE_ENV=production
export DB_PATH=$DATA_DIR/aliases.db
export MY_DOMAIN=example.com
export REAL_EMAIL=you@example.com
export ADMIN_USER=admin
export ADMIN_PASSWORD=changeme

echo "🚀 Starting app..."
chmod +x $APP_DIR/start.sh
$APP_DIR/start.sh
