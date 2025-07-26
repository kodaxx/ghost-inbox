import { config } from '../config.js';

export class DuckDNSProvider {
  constructor() {
    this.token = config.duckdns.token;
    this.baseUrl = 'https://www.duckdns.org/update';
  }

  async getCurrentIP() {
    try {
      const response = await fetch('https://api.ipify.org', { timeout: 5000 });
      if (response.ok) {
        const ip = (await response.text()).trim();
        if (this.isValidIP(ip)) {
          return ip;
        }
      }
      throw new Error('Failed to get IP from ipify');
    } catch (error) {
      throw new Error(`Failed to get current IP: ${error.message}`);
    }
  }

  isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }

  async updateIP(domain) {
    try {
      console.log(`[DuckDNS DDNS] Updating IP for ${domain}...`);
      
      const currentIP = await this.getCurrentIP();
      console.log(`[DuckDNS DDNS] Current IP: ${currentIP}`);
      
      // Extract subdomain from full domain (e.g., "mysite.duckdns.org" -> "mysite")
      const subdomain = domain.replace('.duckdns.org', '');
      
      const url = `${this.baseUrl}?domains=${subdomain}&token=${this.token}&ip=${currentIP}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`DuckDNS API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.text();
      
      if (result.trim() === 'OK') {
        console.log(`[DuckDNS DDNS] Successfully updated ${domain} -> ${currentIP}`);
        return { updated: true, ip: currentIP, action: 'updated' };
      } else {
        throw new Error(`DuckDNS update failed: ${result}`);
      }
    } catch (error) {
      console.error(`[DuckDNS DDNS] Error:`, error.message);
      throw error;
    }
  }
}
