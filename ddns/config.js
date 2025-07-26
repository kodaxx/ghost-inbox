/**
 * Dynamic DNS Configuration
 * 
 * Set DDNS_ENABLED=true and DDNS_PROVIDER to enable dynamic DNS updates
 * 
 * Environment Variables:
 * - DDNS_ENABLED: true/false (default: false)
 * - DDNS_PROVIDER: cloudflare/duckdns/noip/custom (default: none)
 * - DDNS_INTERVAL: Update interval in minutes (default: 5)
 * - DDNS_DOMAIN: Domain to update (required if enabled)
 * 
 * Provider-specific variables:
 * Cloudflare:
 * - CLOUDFLARE_API_TOKEN: API token with Zone:Edit permissions
 * - CLOUDFLARE_ZONE_ID: Zone ID for your domain
 * 
 * DuckDNS:
 * - DUCKDNS_TOKEN: Your DuckDNS token
 * 
 * No-IP:
 * - NOIP_USERNAME: Your No-IP username
 * - NOIP_PASSWORD: Your No-IP password
 */

export const config = {
  enabled: process.env.DDNS_ENABLED === 'true',
  provider: process.env.DDNS_PROVIDER || null,
  interval: parseInt(process.env.DDNS_INTERVAL || '5') * 60 * 1000, // Convert minutes to ms
  domain: process.env.DDNS_DOMAIN || process.env.MY_DOMAIN,
  
  // Provider-specific configs
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    zoneId: process.env.CLOUDFLARE_ZONE_ID,
    recordType: process.env.CLOUDFLARE_RECORD_TYPE || 'A'
  },
  
  duckdns: {
    token: process.env.DUCKDNS_TOKEN
  },
  
  noip: {
    username: process.env.NOIP_USERNAME,
    password: process.env.NOIP_PASSWORD
  }
};

export function validateConfig() {
  if (!config.enabled) {
    return { valid: true, message: 'Dynamic DNS is disabled' };
  }
  
  if (!config.domain) {
    return { valid: false, message: 'DDNS_DOMAIN or MY_DOMAIN must be set' };
  }
  
  switch (config.provider) {
    case 'cloudflare':
      if (!config.cloudflare.apiToken || !config.cloudflare.zoneId) {
        return { 
          valid: false, 
          message: 'Cloudflare requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID' 
        };
      }
      break;
      
    case 'duckdns':
      if (!config.duckdns.token) {
        return { valid: false, message: 'DuckDNS requires DUCKDNS_TOKEN' };
      }
      break;
      
    case 'noip':
      if (!config.noip.username || !config.noip.password) {
        return { valid: false, message: 'No-IP requires NOIP_USERNAME and NOIP_PASSWORD' };
      }
      break;
      
    default:
      return { valid: false, message: `Unsupported DDNS provider: ${config.provider}` };
  }
  
  return { valid: true, message: 'Configuration valid' };
}
