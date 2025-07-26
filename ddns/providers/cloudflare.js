import { config } from '../config.js';

export class CloudflareProvider {
  constructor() {
    this.apiToken = config.cloudflare.apiToken;
    this.zoneId = config.cloudflare.zoneId;
    this.recordType = config.cloudflare.recordType;
    this.baseUrl = 'https://api.cloudflare.com/client/v4';
  }

  async getCurrentIP() {
    try {
      // Use multiple IP detection services for reliability
      const services = [
        'https://api.ipify.org',
        'https://icanhazip.com',
        'https://ipecho.net/plain'
      ];
      
      for (const service of services) {
        try {
          const response = await fetch(service, { timeout: 5000 });
          if (response.ok) {
            const ip = (await response.text()).trim();
            if (this.isValidIP(ip)) {
              return ip;
            }
          }
        } catch (error) {
          console.warn(`IP service ${service} failed:`, error.message);
          continue;
        }
      }
      
      throw new Error('All IP detection services failed');
    } catch (error) {
      throw new Error(`Failed to get current IP: ${error.message}`);
    }
  }

  isValidIP(ip) {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(ip);
  }

  async getDNSRecord(domain) {
    try {
      const url = `${this.baseUrl}/zones/${this.zoneId}/dns_records?name=${domain}&type=${this.recordType}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API error: ${data.errors?.[0]?.message || 'Unknown error'}`);
      }

      return data.result?.[0] || null;
    } catch (error) {
      throw new Error(`Failed to get DNS record: ${error.message}`);
    }
  }

  async updateDNSRecord(domain, ip, recordId) {
    try {
      const url = `${this.baseUrl}/zones/${this.zoneId}/dns_records/${recordId}`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: this.recordType,
          name: domain,
          content: ip,
          ttl: 60 // 1 minute TTL for dynamic IPs
        })
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API error: ${data.errors?.[0]?.message || 'Unknown error'}`);
      }

      return data.result;
    } catch (error) {
      throw new Error(`Failed to update DNS record: ${error.message}`);
    }
  }

  async createDNSRecord(domain, ip) {
    try {
      const url = `${this.baseUrl}/zones/${this.zoneId}/dns_records`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: this.recordType,
          name: domain,
          content: ip,
          ttl: 60
        })
      });

      if (!response.ok) {
        throw new Error(`Cloudflare API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(`Cloudflare API error: ${data.errors?.[0]?.message || 'Unknown error'}`);
      }

      return data.result;
    } catch (error) {
      throw new Error(`Failed to create DNS record: ${error.message}`);
    }
  }

  async updateIP(domain) {
    try {
      console.log(`[Cloudflare DDNS] Checking IP for ${domain}...`);
      
      const currentIP = await this.getCurrentIP();
      console.log(`[Cloudflare DDNS] Current IP: ${currentIP}`);
      
      const dnsRecord = await this.getDNSRecord(domain);
      
      if (!dnsRecord) {
        console.log(`[Cloudflare DDNS] No existing record found, creating new one...`);
        await this.createDNSRecord(domain, currentIP);
        console.log(`[Cloudflare DDNS] Created DNS record for ${domain} -> ${currentIP}`);
        return { updated: true, ip: currentIP, action: 'created' };
      }
      
      if (dnsRecord.content === currentIP) {
        console.log(`[Cloudflare DDNS] IP unchanged (${currentIP}), no update needed`);
        return { updated: false, ip: currentIP, action: 'no-change' };
      }
      
      console.log(`[Cloudflare DDNS] IP changed from ${dnsRecord.content} to ${currentIP}, updating...`);
      await this.updateDNSRecord(domain, currentIP, dnsRecord.id);
      console.log(`[Cloudflare DDNS] Updated DNS record for ${domain} -> ${currentIP}`);
      
      return { updated: true, ip: currentIP, action: 'updated', previousIP: dnsRecord.content };
    } catch (error) {
      console.error(`[Cloudflare DDNS] Error:`, error.message);
      throw error;
    }
  }
}
