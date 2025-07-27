# Docker Deployment Guide

This guide covers building the GhostInbox Docker image, uploading to Docker Hub, and deploying on TrueNAS with Cloudflare DNS configuration.

## Table of Contents
1. [Prerequisites & Gmail Setup](#prerequisites--gmail-setup)
2. [Building the Docker Image](#building-the-docker-image)
3. [Uploading to Docker Hub](#uploading-to-docker-hub)
4. [TrueNAS Deployment](#truenas-deployment)
5. [Cloudflare DDNS Setup](#cloudflare-ddns-setup)
6. [Cloudflare DNS Records](#cloudflare-dns-records)
7. [Testing the Deployment](#testing-the-deployment)

## Prerequisites & Gmail Setup

### Gmail SMTP Configuration

AliasHub uses Gmail's SMTP servers to forward emails. You'll need to set up an App Password for secure authentication.

#### Step 1: Enable 2-Factor Authentication
1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Navigate to **Security** > **2-Step Verification**
3. Follow the prompts to enable 2FA if not already enabled
4. **Note**: App Passwords require 2FA to be enabled

#### Step 2: Generate App Password
1. In Google Account Settings, go to **Security** > **App passwords**
2. Select **Mail** as the app type
3. Select **Other (Custom name)** as the device
4. Enter a name like "AliasHub SMTP" or "Email Forwarding"
5. Click **Generate**
6. **Important**: Copy the 16-character app password immediately - you won't see it again

#### Step 3: Configure Environment Variables
You'll need these values for the Docker deployment:

| Variable | Value | Example |
|----------|-------|---------|
| `GMAIL_USER` | Your Gmail address | `yourname@gmail.com` |
| `GMAIL_PASS` | The 16-character app password | `abcd efgh ijkl mnop` |
| `REAL_EMAIL` | Your Gmail address (same as GMAIL_USER) | `yourname@gmail.com` |

#### Alternative: Using G Suite/Google Workspace
If you're using Google Workspace (G Suite), the process is similar but you may need admin permissions:

1. Admin must enable **Less secure app access** (if available) OR
2. Use **OAuth 2.0** (advanced setup) OR  
3. Create a **Service Account** with Gmail API access

For most users, the standard Gmail app password method above is recommended.

#### SMTP Settings Reference
AliasHub uses these Gmail SMTP settings automatically:
- **Server**: `smtp.gmail.com`
- **Port**: `587` (STARTTLS)
- **Security**: TLS/STARTTLS
- **Authentication**: Username/Password (app password)

### Other Email Providers
While Gmail is recommended and pre-configured, you can modify the code to use other providers:

**Outlook/Hotmail**:
- Server: `smtp-mail.outlook.com`
- Port: `587`
- Requires app password setup similar to Gmail

**Custom SMTP Server**:
- You'll need to modify `handle-email.js` to use your SMTP settings
- Ensure your provider allows external SMTP connections

## Building the Docker Image

### Prerequisites
- Docker installed on your local machine
- Docker Hub account (for uploading)

### Build Commands

```bash
# Navigate to the project directory
cd /path/to/ghostinbox

# Build the Docker image
docker build -t ghostinbox:latest .

# Tag for Docker Hub (replace 'yourusername' with your Docker Hub username)
docker tag ghostinbox:latest yourusername/ghostinbox:latest
docker tag ghostinbox:latest yourusername/ghostinbox:v1.0.0
```

### Test Gmail Setup (Before Full Deployment)

Before deploying to TrueNAS, test your Gmail configuration locally:

```bash
# Test the image locally with your Gmail credentials
docker run --rm -it \
  -e MY_DOMAIN=test.example.com \
  -e REAL_EMAIL=your-email@gmail.com \
  -e GMAIL_USER=your-email@gmail.com \
  -e GMAIL_PASS="your-app-password-here" \
  -e ADMIN_USER=admin \
  -e ADMIN_PASSWORD=testpass123 \
  -p 3000:3000 \
  yourusername/ghostinbox:latest

# In another terminal, test SMTP connection
docker exec -it <container-id> node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});
transporter.verify().then(() => {
  console.log('✅ Gmail SMTP ready');
}).catch(err => {
  console.log('❌ Gmail SMTP error:', err.message);
});
"
```

### Test Local Build (Optional)

```bash
# Test the image locally
docker run --privileged -p 3000:3000 -p 25:25 \
  -e MY_DOMAIN=yourdomain.com \
  -e REAL_EMAIL=your-real-email@gmail.com \
  -e GMAIL_USER=your-email@gmail.com \
  -e GMAIL_PASS="your-16-char-app-password" \
  -e ADMIN_USER=admin \
  -e ADMIN_PASSWORD=your-secure-password \
  -v $(pwd)/data:/data \
  yourusername/ghostinbox:latest
```

## Uploading to Docker Hub

### Login and Push

```bash
# Login to Docker Hub
docker login

# Push the images
docker push yourusername/ghostinbox:latest
docker push yourusername/ghostinbox:v1.0.0
```

### Verify Upload
Visit your Docker Hub repository at `https://hub.docker.com/r/yourusername/ghostinbox` to confirm the upload.

## TrueNAS Deployment

### Step 1: Access TrueNAS Web Interface
1. Navigate to your TrueNAS web interface
2. Go to **Apps** > **Available Applications**
3. Click **Launch Docker Image**

### Step 2: Basic Configuration
- **Application Name**: `ghostinbox`
- **Image Repository**: `yourusername/ghostinbox`
- **Image Tag**: `latest` (or `v1.0.0` for specific version)

### Step 3: Container Configuration

#### Networking
- **Host Network**: ✅ Enable (required for SMTP port 25 and fail2ban)
- **Privileged Mode**: ✅ Enable (required for fail2ban iptables rules)

#### Environment Variables
Add the following environment variables:

| Variable | Value | Description |
|----------|-------|-------------|
| `MY_DOMAIN` | `yourdomain.com` | Your domain name |
| `REAL_EMAIL` | `your-email@gmail.com` | Your Gmail address for forwarding |
| `ADMIN_USER` | `admin` | Dashboard admin username |
| `ADMIN_PASSWORD` | `your-secure-password` | Dashboard admin password |
| `GMAIL_USER` | `your-email@gmail.com` | Gmail SMTP username (same as REAL_EMAIL) |
| `GMAIL_PASS` | `abcd efgh ijkl mnop` | Gmail app password (16 characters, spaces optional) |
| `CLOUDFLARE_API_TOKEN` | `your-cf-token` | Cloudflare API token (optional, for DDNS) |
| `CLOUDFLARE_ZONE_ID` | `your-zone-id` | Cloudflare zone ID (optional, for DDNS) |

**Important Gmail Notes:**
- `GMAIL_PASS` must be the 16-character app password, NOT your regular Gmail password
- Remove spaces from the app password or keep them - both formats work
- `GMAIL_USER` and `REAL_EMAIL` should typically be the same Gmail address
- Ensure 2-Factor Authentication is enabled on your Gmail account

#### Storage/Volumes
- **Host Path**: `/mnt/your-pool/ghostinbox/data`
- **Mount Path**: `/data`
- **Type**: Host Path Volume

### Step 4: Deploy
1. Click **Install** to deploy the application
2. Wait for the container to start (this may take a few minutes)
3. Check the logs for any errors

## Cloudflare DDNS Setup

### Step 1: Get Cloudflare API Token
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **My Profile** > **API Tokens**
3. Click **Create Token**
4. Use the **Custom token** template with these permissions:
   - **Zone:Zone:Read** (for your domain)
   - **Zone:DNS:Edit** (for your domain)
5. Copy the generated token

### Step 2: Get Zone ID
1. In Cloudflare Dashboard, select your domain
2. Scroll down to the **API** section in the right sidebar
3. Copy the **Zone ID**

### Step 3: Configure DDNS in Container
The DDNS will automatically update when the container starts. You can also manually trigger updates:

```bash
# Connect to the running container
docker exec -it ghostinbox /bin/bash

# Run DDNS update
node ddns/update.js
```

## Cloudflare DNS Records

### Required DNS Records

#### A Record (for web dashboard)
- **Type**: A
- **Name**: `mail` (or your preferred subdomain)
- **Content**: Your TrueNAS server's public IP
- **TTL**: Auto
- **Proxy Status**: 🟠 Proxied (optional, for DDoS protection)

#### MX Record (for email)
- **Type**: MX
- **Name**: `@` (root domain)
- **Content**: `mail.yourdomain.com`
- **Priority**: `10`
- **TTL**: Auto

#### Optional: CNAME for aliases
- **Type**: CNAME
- **Name**: `aliases`
- **Content**: `mail.yourdomain.com`
- **TTL**: Auto

### Example DNS Configuration

For domain `example.com`:

```
Type    Name      Content                    Priority  TTL
A       mail      123.45.67.89              -         Auto
MX      @         mail.example.com          10        Auto
CNAME   aliases   mail.example.com          -         Auto
TXT     @         "v=spf1 mx ~all"          -         Auto
```

### SPF Record (Recommended)
Add an SPF record to improve email deliverability:
- **Type**: TXT
- **Name**: `@`
- **Content**: `"v=spf1 mx ~all"`

## Testing the Deployment

### Test Web Dashboard
1. Visit `http://mail.yourdomain.com:3000` (or your configured subdomain)
2. Login with your admin credentials
3. Create a test alias

### Test Email Functionality

#### From TrueNAS Server
```bash
# Connect to container
docker exec -it ghostinbox /bin/bash

# Run email tests
node test-email.js
```

#### From External Source
Send a test email to one of your aliases and verify it forwards correctly.

### Test fail2ban Security
```bash
# Check fail2ban status
docker exec -it ghostinbox fail2ban-client status

# Check specific jails
docker exec -it ghostinbox fail2ban-client status ghostinbox-dashboard
docker exec -it ghostinbox fail2ban-client status ghostinbox-smtp-abuse
```

## Troubleshooting

### Common Issues

#### Container Won't Start
- Check TrueNAS logs: **Apps** > **Installed Applications** > **ghostinbox** > **Logs**
- Verify all environment variables are set correctly
- Ensure host networking and privileged mode are enabled

#### Email Not Forwarding
- **Check Gmail app password**: Verify the 16-character app password is correct (no spaces)
- **Verify Gmail user**: Ensure `GMAIL_USER` matches the account that generated the app password
- **Check 2FA**: Confirm 2-Factor Authentication is enabled on the Gmail account
- **Test SMTP connection**: Use the container's test command (see below)
- **Verify MX record**: Ensure MX record points to your server
- **Check container logs**: `docker logs ghostinbox`

#### Gmail SMTP Issues
```bash
# Test Gmail SMTP connection from within container
docker exec -it ghostinbox node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});
transporter.verify((error, success) => {
  if (error) {
    console.log('Gmail SMTP Error:', error);
  } else {
    console.log('Gmail SMTP connection successful');
  }
});
"

# Check environment variables are set correctly
docker exec -it ghostinbox printenv | grep GMAIL
```

**Common Gmail Errors:**
- `Invalid login` - App password is incorrect or 2FA not enabled
- `Less secure app access` - Use app password instead of account password  
- `Username and Password not accepted` - Double-check credentials and try regenerating app password

#### DDNS Not Updating
- Verify Cloudflare API token has correct permissions
- Check Zone ID is correct
- Review DDNS logs in container

#### Port 25 Blocked
Many ISPs block port 25. Contact your ISP or consider using a mail relay service.

### Log Locations
- Application logs: `/var/log/ghostinbox.log`
- Mail logs: `/var/log/mail.log`
- fail2ban logs: `/var/log/fail2ban.log`

## Security Considerations

1. **Change Default Passwords**: Always change the default admin password
2. **Use Strong Passwords**: Use complex passwords for all accounts
3. **Enable fail2ban**: The container includes fail2ban for intrusion prevention
4. **Regular Updates**: Keep the Docker image updated
5. **Backup Data**: Regular backup the `/data` volume

## Updating the Application

### Update Docker Image
```bash
# Pull latest image
docker pull yourusername/ghostinbox:latest

# In TrueNAS, stop the application and edit it
# Change the image tag to trigger a redeployment
# Or use the "Update" button if available
```

### Backup Before Updates
```bash
# Backup the data directory
cp -r /mnt/your-pool/ghostinbox/data /mnt/your-pool/ghostinbox/data-backup-$(date +%Y%m%d)
```

## Support

If you encounter issues:
1. Check the container logs first
2. Verify all configuration steps were followed
3. Test Gmail SMTP connection separately
4. Ensure firewall ports are open (25, 3000)
5. Test DNS resolution for your domain

## Quick Reference

### Gmail App Password Setup
1. [Google Account Security](https://myaccount.google.com/security) → **App passwords**
2. Select **Mail** → **Other (Custom name)**  
3. Enter "AliasHub" → **Generate**
4. Copy the 16-character password
5. Use in `GMAIL_PASS` environment variable

### Essential Environment Variables
```bash
MY_DOMAIN=yourdomain.com
REAL_EMAIL=your-email@gmail.com
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=abcdefghijklmnop  # App password from step 4 above
ADMIN_USER=admin
ADMIN_PASSWORD=your-secure-password
```

### DNS Records Checklist
- ✅ A record: `mail.yourdomain.com` → Your server IP
- ✅ MX record: `@` → `mail.yourdomain.com` (priority 10)
- ✅ SPF record: `"v=spf1 mx ~all"`

For additional help, refer to the main README.md or open an issue in the project repository.
