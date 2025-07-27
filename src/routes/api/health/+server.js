import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';

let securityManagerInstance = null;

// Safely initialize SecurityManager
async function getSecurityManager() {
  if (!securityManagerInstance) {
    try {
      const { SecurityManager } = await import('../../../../security/security.js');
      securityManagerInstance = new SecurityManager();
    } catch (error) {
      console.warn('SecurityManager initialization failed:', error.message);
      return null;
    }
  }
  return securityManagerInstance;
}

const execCommand = (command, args, timeout = 5000) => {
  return new Promise((resolve) => {
    const process = spawn(command, args, { timeout });
    let stdout = '';
    let stderr = '';
    
    process.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    process.on('error', (error) => {
      resolve({ code: -1, stdout: '', stderr: error.message });
    });
    
    // Handle timeout
    setTimeout(() => {
      process.kill();
      resolve({ code: -1, stdout: '', stderr: 'Command timeout' });
    }, timeout);
  });
};

// Check if port 25 is listening
async function checkSMTPPort() {
  try {
    console.log('Checking SMTP port 25...');
    
    // First try lsof to check if port 25 is listening
    let result = await execCommand('lsof', ['-i', ':25']);
    console.log('lsof result:', { code: result.code, stdout: result.stdout.substring(0, 200) });
    
    if (result.code === 0 && result.stdout.includes(':25')) {
      return true;
    }
    
    // Fallback to netstat
    result = await execCommand('netstat', ['-an']);
    console.log('netstat result code:', result.code);
    
    if (result.code === 0) {
      const lines = result.stdout.split('\n');
      const port25Lines = lines.filter(line => line.includes('.25 ') || line.includes(':25 '));
      console.log('Port 25 lines found:', port25Lines.length);
      
      const listeningPort25 = port25Lines.some(line => 
        line.includes('LISTEN') || line.includes('*:25')
      );
      
      if (listeningPort25) {
        console.log('Found port 25 listening');
        return true;
      }
    }
    
    // Try ss command (modern replacement for netstat)
    result = await execCommand('ss', ['-tuln']);
    if (result.code === 0 && result.stdout.includes(':25 ')) {
      console.log('Found port 25 via ss command');
      return true;
    }
    
    console.log('Port 25 not found listening');
    return false;
  } catch (error) {
    console.error('SMTP port check failed:', error);
    return false;
  }
}

// Check database connectivity by trying to make an alias request
async function checkDatabase() {
  try {
    console.log('Checking database connectivity...');
    
    // Make an internal request to the aliases endpoint to test database
    const response = await fetch('http://localhost:5173/api/aliases', {
      headers: {
        'Cookie': 'session=authenticated'
      }
    });
    
    if (response.ok) {
      console.log('Database check successful via aliases API');
      return true;
    } else {
      console.log('Database check failed - aliases API returned:', response.status);
      return false;
    }
  } catch (error) {
    console.error('Database check failed:', error.message);
    return false;
  }
}

// Check DDNS status
async function checkDDNS() {
  try {
    const ddnsEnabled = process.env.DDNS_ENABLED === 'true';
    
    if (!ddnsEnabled) {
      return { enabled: false, status: 'disabled' };
    }
    
    const provider = process.env.DDNS_PROVIDER;
    const domain = process.env.DDNS_DOMAIN || process.env.MY_DOMAIN;
    
    if (!provider || !domain) {
      return { 
        enabled: true, 
        status: 'misconfigured',
        error: 'Missing DDNS_PROVIDER or DDNS_DOMAIN'
      };
    }
    
    // Try to get DDNS status by running the status command
    const result = await execCommand('node', ['./ddns/update.js', '--status'], 10000);
    
    if (result.code === 0) {
      return { 
        enabled: true, 
        status: 'configured',
        provider,
        domain,
        details: result.stdout.substring(0, 500)
      };
    } else {
      return { 
        enabled: true, 
        status: 'error',
        provider,
        domain,
        error: result.stderr || result.stdout
      };
    }
  } catch (error) {
    console.error('DDNS check failed:', error);
    return { 
      enabled: process.env.DDNS_ENABLED === 'true', 
      status: 'error',
      error: error.message 
    };
  }
}

// Check security system status
async function checkSecurity() {
  try {
    const securityManager = await getSecurityManager();
    if (!securityManager) {
      return {
        status: 'unavailable',
        fail2ban: false,
        activeBans: 0,
        recentEvents: 0,
        error: 'Security manager initialization failed'
      };
    }
    
    const stats = securityManager.getSecurityStats();
    
    // Check if fail2ban is running
    const fail2banCheck = await execCommand('fail2ban-client', ['status'], 3000);
    const fail2banRunning = fail2banCheck.code === 0;
    
    return {
      status: 'operational',
      fail2ban: fail2banRunning,
      activeBans: stats.activeBans,
      recentEvents: stats.recentEvents,
      details: `${stats.activeBans} active bans, ${stats.recentEvents} recent security events`
    };
  } catch (error) {
    console.error('Security check failed:', error);
    return {
      status: 'error',
      error: error.message,
      fail2ban: false,
      activeBans: 0
    };
  }
}

export async function GET() {
  try {
    console.log('=== Health Check Started ===');
    
    const [databaseHealth, smtpHealth, ddnsHealth, securityHealth] = await Promise.all([
      checkDatabase(),
      checkSMTPPort(),
      checkDDNS(),
      checkSecurity()
    ]);
    
    // Determine overall status
    let overallStatus = 'healthy';
    let warnings = [];
    
    if (!databaseHealth) {
      overallStatus = 'error';
    } else if (!smtpHealth) {
      overallStatus = 'degraded';
      warnings.push('SMTP port 25 not accessible - this is normal in development mode');
    }
    
    // Add DDNS warnings if applicable
    if (ddnsHealth.enabled && ddnsHealth.status === 'misconfigured') {
      warnings.push('DDNS is enabled but misconfigured');
    } else if (ddnsHealth.enabled && ddnsHealth.status === 'error') {
      warnings.push('DDNS system encountered an error');
    }
    
    // Add security warnings if applicable
    if (securityHealth.status === 'error') {
      warnings.push('Security system error: ' + securityHealth.error);
    } else if (!securityHealth.fail2ban) {
      warnings.push('Fail2ban is not running - reduced protection against abuse');
    } else if (securityHealth.activeBans > 10) {
      warnings.push(`High number of active IP bans (${securityHealth.activeBans}) - potential ongoing attack`);
    }
    
    const result = {
      status: overallStatus,
      database: databaseHealth,
      smtp: smtpHealth,
      ddns: ddnsHealth,
      security: securityHealth,
      lastChecked: new Date().toISOString(),
      warnings: warnings,
      details: {
        database: databaseHealth ? 'Database accessible via API' : 'Database connection failed',
        smtp: smtpHealth ? 'SMTP port 25 is listening' : 'SMTP port 25 not accessible (normal in dev mode)',
        ddns: ddnsHealth.enabled ? 
          `DDNS ${ddnsHealth.status} (${ddnsHealth.provider || 'no provider'})` : 
          'DDNS disabled',
        security: securityHealth.fail2ban ? 
          `Security active: ${securityHealth.activeBans} banned IPs, ${securityHealth.recentEvents} recent events` :
          'Security monitoring available but fail2ban not running',
        environment: process.env.NODE_ENV || 'development'
      }
    };
    
    console.log('Health check result:', result);
    return json(result);
  } catch (error) {
    console.error('Health check error:', error);
    
    return json({
      status: 'error',
      database: false,
      smtp: false,
      ddns: { enabled: false, status: 'unknown' },
      lastChecked: new Date().toISOString(),
      error: error.message,
      warnings: ['Health check system encountered an error']
    }, { status: 500 });
  }
}
