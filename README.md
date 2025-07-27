# GhostInbox

GhostInbox is a self‑hosted email alias server implemented with SvelteKit for the admin dashboard, Postfix for the SMTP server, and a SQLite database (via better‑sqlite3) for state management. It allows you to receive emails at unlimited aliases on your own domain (e.g. `netflix@yourdomain.com`), forward them to a real inbox (such as a Gmail account) and reply while preserving the alias.

## Features

- **Modern Web Dashboard** – Beautiful, responsive SvelteKit interface with session-based authentication
- **Wildcard aliases** – Accept mail to any alias at your domain. Optionally disable wildcard creation via the dashboard
- **Dynamic DNS Support** – Automatic DNS updates for dynamic IP addresses (Cloudflare, DuckDNS, No-IP)
- **System Health Monitoring** – Real-time status monitoring of database, SMTP, and DDNS services
- **Mobile-Responsive Design** – Works seamlessly on desktop, tablet, and mobile devices
- **Alias Management** – Create, block/unblock, delete aliases with inline note editing
- **Forwarding & Reply Support** – Full bidirectional email flow with alias preservation
- **Dockerised** – Includes `Dockerfile` and `docker‑compose.yml` for straightforward deployment

## Quick Start

1. **Prepare a domain** and create MX records pointing to your server
2. **Set up Gmail app password** from your Google account settings
3. **Clone and configure:**
   ```bash
   git clone <repository-url>
   cd aliashub
   cp docker-compose.yml docker-compose.yml.bak  # backup
   # Edit docker-compose.yml with your settings (see Configuration section)
   docker-compose up -d
   ```
4. **Access dashboard** at `http://your-server:3000`

## Configuration

### Environment Variables

Configure GhostInbox by setting these environment variables in your `docker-compose.yml` file:

#### Core Email Settings (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `MY_DOMAIN` | Your domain name | `yourdomain.com` |
| `REAL_EMAIL` | Gmail address to receive forwarded mail | `yourname@gmail.com` |
| `GMAIL_APP_PASSWORD` | Gmail app password for SMTP relay | `abcd efgh ijkl mnop` |

#### Authentication (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| `ADMIN_USER` | Dashboard login username | `admin` |
| `ADMIN_PASSWORD` | Dashboard login password | `your-strong-password` |

#### Database Configuration (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `/data/aliases.db` | Path to SQLite database file |

#### Dynamic DNS (Optional)

Enable automatic DNS updates for dynamic IP addresses:

| Variable | Default | Description |
|----------|---------|-------------|
| `DDNS_ENABLED` | `false` | Enable/disable DDNS updates |
| `DDNS_PROVIDER` | - | Provider: `cloudflare`, `duckdns`, `noip` |
| `DDNS_DOMAIN` | `MY_DOMAIN` | Domain to update (if different from MY_DOMAIN) |
| `DDNS_INTERVAL` | `5` | Update interval in minutes |

#### Cloudflare DDNS (Required if using Cloudflare)

| Variable | Description | How to Get |
|----------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | API token with Zone:Edit permissions | [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) → Create Token |
| `CLOUDFLARE_ZONE_ID` | Zone ID for your domain | Cloudflare Dashboard → Domain Overview → Zone ID |
| `CLOUDFLARE_RECORD_TYPE` | DNS record type (default: `A`) | Usually `A` for IPv4 |

#### DuckDNS (Required if using DuckDNS)

| Variable | Description | How to Get |
|----------|-------------|------------|
| `DUCKDNS_TOKEN` | Your DuckDNS token | [DuckDNS](https://www.duckdns.org/) → Login → Token |

#### No-IP (Required if using No-IP)

| Variable | Description |
|----------|-------------|
| `NOIP_USERNAME` | Your No-IP username |
| `NOIP_PASSWORD` | Your No-IP password |

### Docker Compose Configuration

Here's a complete `docker-compose.yml` example with all options:

```yaml
version: '3.8'
services:
  ghostinbox:
    build: .
    container_name: ghostinbox
    ports:
      - "25:25"     # SMTP port
      - "3000:3000" # Web dashboard
    environment:
      # Core email settings (required)
      MY_DOMAIN: yourdomain.com
      REAL_EMAIL: yourname@gmail.com
      GMAIL_APP_PASSWORD: your_gmail_app_password
      
      # Authentication (required)
      ADMIN_USER: admin
      ADMIN_PASSWORD: your-strong-password
      
      # Optional: Database path
      DB_PATH: /data/aliases.db
      
      # Optional: Dynamic DNS with Cloudflare
      DDNS_ENABLED: true
      DDNS_PROVIDER: cloudflare
      DDNS_DOMAIN: mail.yourdomain.com  # or use MY_DOMAIN
      DDNS_INTERVAL: 5
      CLOUDFLARE_API_TOKEN: your_cloudflare_token
      CLOUDFLARE_ZONE_ID: your_zone_id
      
      # Alternative: DuckDNS configuration
      # DDNS_PROVIDER: duckdns
      # DDNS_DOMAIN: yoursubdomain.duckdns.org
      # DUCKDNS_TOKEN: your_duckdns_token
      
      # Alternative: No-IP configuration  
      # DDNS_PROVIDER: noip
      # DDNS_DOMAIN: yourhost.hopto.org
      # NOIP_USERNAME: your_username
      # NOIP_PASSWORD: your_password
      
    volumes:
      - aliases-data:/data
    restart: unless-stopped
    # Optional: Use Docker secrets for sensitive data
    # secrets:
    #   - gmail_password
    #   - admin_password
    #   - cloudflare_token

volumes:
  aliases-data:
    driver: local

# Optional: Docker secrets for production
# secrets:
#   gmail_password:
#     file: ./secrets/gmail_password.txt
#   admin_password:
#     file: ./secrets/admin_password.txt
#   cloudflare_token:
#     file: ./secrets/cloudflare_token.txt
```

### Environment File (.env)

Instead of putting secrets directly in `docker-compose.yml`, create a `.env` file:

```bash
# Core settings
MY_DOMAIN=yourdomain.com
REAL_EMAIL=yourname@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password
ADMIN_USER=admin
ADMIN_PASSWORD=your-strong-password

# DDNS settings (optional)
DDNS_ENABLED=true
DDNS_PROVIDER=cloudflare
CLOUDFLARE_API_TOKEN=your_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here
```

Then reference variables in `docker-compose.yml`:
```yaml
environment:
  MY_DOMAIN: ${MY_DOMAIN}
  REAL_EMAIL: ${REAL_EMAIL}
  GMAIL_APP_PASSWORD: ${GMAIL_APP_PASSWORD}
  # ... etc
```

## DNS Setup

### MX Records
Point your domain's MX record to your server:
```
yourdomain.com.    MX    10    mail.yourdomain.com.
mail.yourdomain.com.    A     your.server.ip.address
```

### Dynamic DNS Providers

#### Cloudflare (Recommended)
1. Add your domain to Cloudflare
2. Create an API token with Zone:Edit permissions
3. Get your Zone ID from the domain overview
4. Configure DDNS variables in docker-compose.yml

#### DuckDNS (Free Option)
1. Sign up at [duckdns.org](https://www.duckdns.org/)
2. Create a subdomain (e.g., `yourname.duckdns.org`)
3. Get your token and configure DDNS variables
4. Set your MX record to point to the DuckDNS domain

#### No-IP (Alternative)
1. Create account at [no-ip.com](https://www.noip.com/)
2. Create a hostname
3. Configure DDNS with your credentials

## Health Monitoring

The dashboard includes real-time system health monitoring:

- **Database Status**: SQLite connectivity
- **SMTP Status**: Port 25 availability  
- **DDNS Status**: Dynamic DNS configuration and updates
- **System Warnings**: Development vs production notifications

Access the health status by hovering over the status indicator in the dashboard header.

## Development

### Local Development
```bash
npm install
npm run dev
```

### Testing DDNS
```bash
# Check DDNS status
node ddns/update.js --status

# Test single update
DDNS_ENABLED=true DDNS_PROVIDER=cloudflare node ddns/update.js --once

# Run DDNS daemon
node ddns/update.js --daemon
```

## Security Considerations

- **Strong Passwords**: Always use strong passwords for `ADMIN_PASSWORD`
- **HTTPS**: Deploy behind a reverse proxy with SSL/TLS in production
- **Firewall**: Only expose necessary ports (25, 3000, or 443 if using reverse proxy)
- **Secrets Management**: Use Docker secrets or external secret management in production
- **Regular Updates**: Keep the container and dependencies updated
- **Backup**: Regularly backup the `aliases-data` volume

## Production Deployment

### With Reverse Proxy (Recommended)
```yaml
version: '3.8'
services:
  ghostinbox:
    build: .
    container_name: ghostinbox
    ports:
      - "25:25"
      - "127.0.0.1:3000:3000"  # Only local access
    environment:
      # ... your configuration
    volumes:
      - aliases-data:/data
    restart: unless-stopped
    
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl/certs
    depends_on:
      - ghostinbox
```

### Backup Strategy
```bash
# Backup database
docker run --rm -v aliases-data:/data -v $(pwd):/backup alpine tar czf /backup/aliases-backup.tar.gz /data

# Restore database  
docker run --rm -v aliases-data:/data -v $(pwd):/backup alpine tar xzf /backup/aliases-backup.tar.gz -C /
```

## Implementation Notes

- `handle-email.js` uses a simple parser to read email headers and forwards messages using the system's `sendmail` binary
- Postfix relays messages via Gmail's SMTP service with proper authentication
- The system supports full bidirectional email flow with alias preservation
- Health monitoring provides real-time status of all system components
- Dynamic DNS ensures homeservers with changing IPs maintain email connectivity

## License

This project is provided as‑is under the MIT license.  See the `LICENSE` file for details.

## Features

- **Wildcard aliases** – Accept mail to any alias at your domain.  Optionally disable wildcard creation via the dashboard.
- **Dashboard** – View all aliases, create new aliases, block/unblock and delete them. Dashboard requires authentication with credentials supplied through environment variables.
- **Forwarding** – Incoming messages are piped through a Node.js handler that updates the database and forwards the mail using Postfix via Gmail’s SMTP relay.  The `From` and `Reply‑To` headers are set to the alias so that replies from your inbox will come back through the alias service.
- **Reply support** – Replies sent from your configured inbox are detected and forwarded to the last sender recorded for each alias, keeping the alias in place.
- **Dockerised** – Includes a `Dockerfile` and `docker‑compose.yml` for straightforward deployment.  Data persists in a Docker volume.

## Getting started

1. **Prepare a domain.**  Create appropriate DNS MX records pointing to the host running GhostInbox.
2. **Set up a Gmail app password.**  In your Google account, generate an [App Password](https://support.google.com/accounts/answer/185833) and take note of it.
3. **Clone the repository and build the container.**

   ```bash
   docker-compose build
   docker-compose up -d
   ```

4. **Configure environment variables.**  Edit `docker-compose.yml` to set:
   - `MY_DOMAIN` to your domain (e.g. `yourdomain.com`).
   - `REAL_EMAIL` to the Gmail address where you want to receive forwarded mail.
   - `GMAIL_APP_PASSWORD` to the app password generated in step 2.
   - `ADMIN_USER` and `ADMIN_PASSWORD` to the credentials you wish to use for the dashboard’s HTTP basic auth.

5. **Access the dashboard.**  Navigate to `http://<host>:3000` in your browser.  When prompted, enter your admin credentials.  From here you can view and manage aliases and toggle wildcard behaviour.

6. **Mail handling.**  Postfix listens on port 25.  For any message addressed to an alias under `MY_DOMAIN` it invokes `handle-email.js`, which records the sender, updates the SQLite database, and forwards the message to your Gmail inbox.  Replies from your inbox to the alias are forwarded back to the original sender.

## Security considerations

- The dashboard is protected by HTTP basic authentication.  Always choose a strong password and deploy behind HTTPS in production.
- The SQLite database (`aliases.db`) is stored in a Docker volume (`aliases-data`) so that alias state persists across container restarts.
- Blocked aliases will cause incoming mail to be silently dropped.
- The wildcard toggle persists in the `settings` table so that it survives restarts.

## Implementation notes

- `handle-email.js` uses a very simple parser to read email headers.  It forwards messages using the system’s `sendmail` binary; Postfix relays these via Gmail.  Attachments are not explicitly parsed—messages are forwarded as plain text including original headers and body.
- To support more complex scenarios (such as multiple concurrent correspondents per alias, or attachment handling) the handler could be extended to use a full featured email parser like [mailparser](https://nodemailer.com/extras/mailparser/) and to store a conversation history.

## License

This project is provided as‑is under the MIT license.  See the `LICENSE` file for details.