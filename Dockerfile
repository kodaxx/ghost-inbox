FROM node:20-bullseye-slim

# Update all packages to their latest versions to address vulnerabilities
RUN apt-get update && \
    apt-get upgrade -y && \
    # Install required packages for Postfix, fail2ban, and logging
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        postfix \
        libsasl2-modules \
        ca-certificates \
        fail2ban \
        iptables \
        rsyslog && \
    rm -rf /var/lib/apt/lists/*

# Create directories for application and persistent data
WORKDIR /app
RUN mkdir -p /data

# Copy package.json and package-lock.json if present, then install dependencies
COPY package.json ./
COPY svelte.config.js ./
COPY tailwind.config.js ./
COPY vite.config.js ./
# Install all dependencies (including dev) for building
RUN npm install

# Copy the rest of the application source
COPY . .

# Build the SvelteKit application
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Configure Postfix: copy configuration templates
COPY postfix/main.cf.template /etc/postfix/main.cf.template
COPY postfix/master.cf /etc/postfix/master.cf
COPY postfix/recipient_access.template /app/postfix/recipient_access.template

# Copy security configuration
COPY security/ /app/security/

# Create required directories and set permissions
RUN mkdir -p /var/log /var/run/fail2ban /var/lib/fail2ban /etc/fail2ban/filter.d && \
    chmod +x /app/security/security.js && \
    chmod +x /app/handle-email.js && \
    chmod 755 /app/security && \
    # Copy fail2ban filters to proper location
    cp /app/security/filter.d/* /etc/fail2ban/filter.d/ && \
    # Create log files with proper permissions
    touch /var/log/mail.log /var/log/ghostinbox.log && \
    chmod 644 /var/log/mail.log /var/log/ghostinbox.log

# Expose SMTP and HTTP ports
EXPOSE 25 3000

# Environment defaults
ENV NODE_ENV=production \
    DB_PATH=/data/aliases.db \
    MY_DOMAIN=example.com \
    REAL_EMAIL=you@example.com \
    ADMIN_USER=admin \
    ADMIN_PASSWORD=changeme

# Copy start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Start both Postfix and the Node server
CMD ["/start.sh"]