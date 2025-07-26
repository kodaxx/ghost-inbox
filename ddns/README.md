# Dynamic DNS (DDNS) System

GhostInbox includes a modular Dynamic DNS system that automatically updates your domain's DNS records when your IP address changes. This is essential for home servers with dynamic IP addresses.

## Features

- **Multiple Providers**: Supports Cloudflare, DuckDNS, No-IP, and extensible for custom providers
- **Automatic Updates**: Monitors IP changes and updates DNS records automatically  
- **Health Monitoring**: Integrated with the system health dashboard
- **Docker Integration**: Seamlessly integrated with the container startup process
- **Flexible Configuration**: Environment variable based configuration
- **Reliable IP Detection**: Uses multiple IP detection services for redundancy

## Supported Providers

### Cloudflare
- ✅ Full API support with zone management
- ✅ Low TTL for fast propagation
- ✅ Automatic record creation if missing
- ✅ IPv4 support (IPv6 coming soon)

### DuckDNS  
- ✅ Simple token-based authentication
- ✅ Perfect for home labs and testing
- ✅ Free service with good reliability

### No-IP
- ✅ Username/password authentication  
- ✅ Wide variety of free domains
- ✅ Good for personal projects

## Quick Setup

### 1. Choose Your Provider

**Option A: Cloudflare (Recommended)**
```bash
# Get API token from https://dash.cloudflare.com/profile/api-tokens
# Get Zone ID from your domain overview in Cloudflare
DDNS_ENABLED=true
DDNS_PROVIDER=cloudflare
DDNS_DOMAIN=mail.yourdomain.com
CLOUDFLARE_API_TOKEN=your_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here
```

**Option B: DuckDNS (Free & Easy)**
```bash
# Get token from https://www.duckdns.org/
DDNS_ENABLED=true
DDNS_PROVIDER=duckdns
DDNS_DOMAIN=yoursubdomain.duckdns.org
DUCKDNS_TOKEN=your_token_here
```

**Option C: No-IP**
```bash
DDNS_ENABLED=true
DDNS_PROVIDER=noip
DDNS_DOMAIN=yourhost.hopto.org
NOIP_USERNAME=your_username
NOIP_PASSWORD=your_password
```

### 2. Add to Your Environment

Add the configuration to your `.env` file or Docker environment variables.

### 3. Deploy

The DDNS system will automatically start when you run the container:

```bash
docker-compose up -d
```

## Manual Testing

Test your DDNS configuration:

```bash
# Check configuration
node ddns/update.js --status

# Run a single update
node ddns/update.js --once

# Run continuously (daemon mode)
node ddns/update.js --daemon
```

## Configuration Options

| Variable | Default | Description |
|----------|---------|-------------|
| `DDNS_ENABLED` | `false` | Enable/disable DDNS updates |
| `DDNS_PROVIDER` | - | Provider: `cloudflare`, `duckdns`, `noip` |
| `DDNS_DOMAIN` | `MY_DOMAIN` | Domain to update |
| `DDNS_INTERVAL` | `5` | Update interval in minutes |

### Provider-Specific Variables

**Cloudflare:**
- `CLOUDFLARE_API_TOKEN` - API token with Zone:Edit permissions
- `CLOUDFLARE_ZONE_ID` - Zone ID from domain overview  
- `CLOUDFLARE_RECORD_TYPE` - Record type (default: A)

**DuckDNS:**
- `DUCKDNS_TOKEN` - Your DuckDNS token

**No-IP:**
- `NOIP_USERNAME` - Your No-IP username
- `NOIP_PASSWORD` - Your No-IP password

## Health Monitoring

The DDNS system is integrated with the application health dashboard. Check the status indicator in the header to see:

- 🟢 **Active**: DDNS is working and up to date
- 🟠 **Config Error**: DDNS enabled but misconfigured  
- 🔴 **Error**: DDNS system encountered an error
- ⚫ **Disabled**: DDNS is disabled

Hover over the status indicator for detailed information including provider and last update time.

## Troubleshooting

### Common Issues

1. **"Configuration error: Missing DDNS_PROVIDER"**
   - Set `DDNS_PROVIDER` to `cloudflare`, `duckdns`, or `noip`

2. **"Cloudflare API error: 401 Unauthorized"**
   - Check your `CLOUDFLARE_API_TOKEN` is correct
   - Ensure the token has Zone:Edit permissions

3. **"DuckDNS update failed"**
   - Verify your `DUCKDNS_TOKEN` is correct
   - Ensure your domain ends with `.duckdns.org`

4. **"No-IP authentication failed"**
   - Check your `NOIP_USERNAME` and `NOIP_PASSWORD`
   - Ensure your No-IP account is active

### Debug Mode

Enable verbose logging:

```bash
DEBUG=ddns node ddns/update.js --once
```

### Check System Health

Monitor DDNS status through the web interface or API:

```bash
curl http://localhost:3000/api/health | jq '.ddns'
```

## Adding Custom Providers

To add a new DDNS provider:

1. Create `/ddns/providers/yourprovider.js`
2. Implement the provider class with `updateIP(domain)` method
3. Add configuration validation in `/ddns/config.js`
4. Update the manager in `/ddns/manager.js`

See existing providers for examples.

## Security Considerations

- Store API tokens securely (use Docker secrets in production)
- Use least-privilege API tokens when possible
- Monitor DDNS logs for suspicious activity
- Consider using short TTL values for faster failover

## Production Deployment

For production use:

1. Use Docker secrets for sensitive values:
   ```yaml
   secrets:
     - cloudflare_token
   environment:
     CLOUDFLARE_API_TOKEN_FILE: /run/secrets/cloudflare_token
   ```

2. Set appropriate update intervals (don't spam DNS providers)

3. Monitor DDNS health through your monitoring system

4. Consider backup providers for redundancy
