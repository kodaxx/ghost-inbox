import { config, validateConfig } from './config.js';
import { CloudflareProvider } from './providers/cloudflare.js';
import { DuckDNSProvider } from './providers/duckdns.js';
import { NoIPProvider } from './providers/noip.js';

export class DDNSManager {
  constructor() {
    this.provider = null;
    this.intervalId = null;
    this.lastUpdate = null;
    this.lastIP = null;
  }

  init() {
    const validation = validateConfig();
    
    if (!validation.valid) {
      if (config.enabled) {
        console.error(`[DDNS] Configuration error: ${validation.message}`);
        throw new Error(validation.message);
      } else {
        console.log(`[DDNS] ${validation.message}`);
        return false;
      }
    }

    if (!config.enabled) {
      console.log('[DDNS] Dynamic DNS is disabled');
      return false;
    }

    // Initialize the appropriate provider
    switch (config.provider) {
      case 'cloudflare':
        this.provider = new CloudflareProvider();
        break;
      case 'duckdns':
        this.provider = new DuckDNSProvider();
        break;
      case 'noip':
        this.provider = new NoIPProvider();
        break;
      default:
        throw new Error(`Unsupported DDNS provider: ${config.provider}`);
    }

    console.log(`[DDNS] Initialized with provider: ${config.provider}`);
    console.log(`[DDNS] Domain: ${config.domain}`);
    console.log(`[DDNS] Update interval: ${config.interval / 1000 / 60} minutes`);
    
    return true;
  }

  async updateNow() {
    if (!this.provider) {
      throw new Error('DDNS provider not initialized');
    }

    try {
      const result = await this.provider.updateIP(config.domain);
      this.lastUpdate = new Date();
      this.lastIP = result.ip;
      
      return {
        success: true,
        ...result,
        timestamp: this.lastUpdate
      };
    } catch (error) {
      console.error('[DDNS] Update failed:', error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  start() {
    if (!this.provider) {
      const initialized = this.init();
      if (!initialized) {
        return false;
      }
    }

    // Do an initial update
    this.updateNow().then(result => {
      if (result.success) {
        console.log(`[DDNS] Initial update successful: ${result.ip}`);
      } else {
        console.error(`[DDNS] Initial update failed: ${result.error}`);
      }
    });

    // Set up periodic updates
    this.intervalId = setInterval(async () => {
      const result = await this.updateNow();
      if (!result.success) {
        console.error(`[DDNS] Periodic update failed: ${result.error}`);
      }
    }, config.interval);

    console.log('[DDNS] Started periodic updates');
    return true;
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[DDNS] Stopped periodic updates');
    }
  }

  getStatus() {
    return {
      enabled: config.enabled,
      provider: config.provider,
      domain: config.domain,
      interval: config.interval / 1000 / 60, // minutes
      lastUpdate: this.lastUpdate,
      lastIP: this.lastIP,
      isRunning: this.intervalId !== null
    };
  }
}

// Export a singleton instance
export const ddnsManager = new DDNSManager();
