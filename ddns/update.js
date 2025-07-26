#!/usr/bin/env node

/**
 * Dynamic DNS Update Script
 * 
 * This script can be run standalone or integrated into the application startup.
 * It supports multiple DNS providers and can run once or continuously.
 */

import { ddnsManager } from './manager.js';

function printUsage() {
  console.log(`
GhostInbox Dynamic DNS Updater

Usage:
  node ddns/update.js [options]

Options:
  --once, -o          Run update once and exit
  --daemon, -d        Run as daemon with periodic updates (default)
  --status, -s        Show current configuration and status
  --help, -h          Show this help message

Environment Variables:
  DDNS_ENABLED        Enable/disable DDNS (true/false)
  DDNS_PROVIDER       Provider: cloudflare, duckdns, noip
  DDNS_INTERVAL       Update interval in minutes (default: 5)
  DDNS_DOMAIN         Domain to update (or use MY_DOMAIN)

Provider-specific variables:
  Cloudflare:         CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID
  DuckDNS:           DUCKDNS_TOKEN
  No-IP:             NOIP_USERNAME, NOIP_PASSWORD

Examples:
  # Run once and exit
  DDNS_ENABLED=true DDNS_PROVIDER=cloudflare node ddns/update.js --once
  
  # Run as daemon
  DDNS_ENABLED=true DDNS_PROVIDER=cloudflare node ddns/update.js --daemon
  
  # Check status
  node ddns/update.js --status
`);
}

async function runOnce() {
  try {
    const initialized = ddnsManager.init();
    if (!initialized) {
      console.log('DDNS is not enabled or not configured');
      process.exit(0);
    }

    console.log('Running DDNS update...');
    const result = await ddnsManager.updateNow();
    
    if (result.success) {
      console.log(`✅ Update successful: ${result.ip}`);
      if (result.action === 'updated') {
        console.log(`   Changed from: ${result.previousIP || 'unknown'}`);
      } else if (result.action === 'no-change') {
        console.log('   IP unchanged, no update needed');
      } else if (result.action === 'created') {
        console.log('   Created new DNS record');
      }
      process.exit(0);
    } else {
      console.error(`❌ Update failed: ${result.error}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

function runDaemon() {
  try {
    const started = ddnsManager.start();
    if (!started) {
      console.log('DDNS is not enabled or not configured');
      process.exit(0);
    }

    console.log('🚀 DDNS daemon started');
    
    // Graceful shutdown handling
    const shutdown = () => {
      console.log('\\n⏹️  Shutting down DDNS daemon...');
      ddnsManager.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process alive
    setInterval(() => {
      // Check if the manager is still running
      const status = ddnsManager.getStatus();
      if (!status.isRunning) {
        console.error('❌ DDNS manager stopped unexpectedly');
        process.exit(1);
      }
    }, 30000); // Check every 30 seconds

  } catch (error) {
    console.error(`❌ Failed to start DDNS daemon: ${error.message}`);
    process.exit(1);
  }
}

function showStatus() {
  try {
    const status = ddnsManager.getStatus();
    
    console.log('\\n📊 DDNS Status:');
    console.log(`   Enabled:      ${status.enabled}`);
    console.log(`   Provider:     ${status.provider || 'none'}`);
    console.log(`   Domain:       ${status.domain || 'none'}`);
    console.log(`   Interval:     ${status.interval} minutes`);
    console.log(`   Running:      ${status.isRunning}`);
    console.log(`   Last Update:  ${status.lastUpdate ? status.lastUpdate.toISOString() : 'never'}`);
    console.log(`   Last IP:      ${status.lastIP || 'unknown'}`);
    
    if (status.enabled && !status.provider) {
      console.log('\\n⚠️  DDNS is enabled but no provider is configured');
    }
    
  } catch (error) {
    console.error(`❌ Error getting status: ${error.message}`);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag) || args.includes(flag.split(',')[1]);

if (hasFlag('--help,-h')) {
  printUsage();
  process.exit(0);
}

if (hasFlag('--status,-s')) {
  showStatus();
  process.exit(0);
}

if (hasFlag('--once,-o')) {
  runOnce();
} else {
  // Default to daemon mode
  runDaemon();
}
