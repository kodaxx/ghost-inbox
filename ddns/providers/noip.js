import { config } from '../config.js';

export class NoIPProvider {
  constructor() {
    this.username = config.noip.username;
    this.password = config.noip.password;
    this.baseUrl = 'https://dynupdate.no-ip.com/nic/update';
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
      console.log(`[No-IP DDNS] Updating IP for ${domain}...`);
      
      const currentIP = await this.getCurrentIP();
      console.log(`[No-IP DDNS] Current IP: ${currentIP}`);
      
      const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
      const url = `${this.baseUrl}?hostname=${domain}&myip=${currentIP}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'User-Agent': 'GhostInbox/1.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`No-IP API error: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.text();
      
      if (result.startsWith('good') || result.startsWith('nochg')) {
        const action = result.startsWith('good') ? 'updated' : 'no-change';
        console.log(`[No-IP DDNS] ${action === 'updated' ? 'Successfully updated' : 'IP unchanged'} ${domain} -> ${currentIP}`);
        return { updated: action === 'updated', ip: currentIP, action };
      } else {
        throw new Error(`No-IP update failed: ${result}`);
      }
    } catch (error) {
      console.error(`[No-IP DDNS] Error:`, error.message);
      throw error;
    }
  }
}
