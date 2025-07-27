#!/usr/bin/env node

// Test Gmail relay by checking mail logs and queue
import { spawn } from 'child_process';

console.log('=== Testing Gmail SMTP Relay ===');

// Function to run a command and return output
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);
    
    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    proc.on('error', reject);
  });
}

async function main() {
  try {
    console.log('\n1. Checking Postfix configuration...');
    const config = await runCommand('postconf', ['-n']);
    console.log('Postfix config (non-default values):');
    console.log(config.stdout);
    
    console.log('\n2. Checking current mail queue...');
    const queue = await runCommand('postqueue', ['-p']);
    console.log('Mail queue:');
    console.log(queue.stdout);
    
    console.log('\n3. Checking Gmail relay configuration...');
    const relay = await runCommand('postconf', ['relayhost']);
    console.log('Relay host:', relay.stdout.trim());
    
    console.log('\n4. Checking SASL configuration...');
    const sasl = await runCommand('postconf', ['smtp_sasl_auth_enable', 'smtp_sasl_password_maps']);
    console.log('SASL config:', sasl.stdout);
    
    console.log('\n5. Sending test email through Postfix...');
    const testEmail = `Subject: Direct Postfix Test
From: test@hauslab.xyz
To: kodaxx@gmail.com

This is a direct test through Postfix to Gmail.
Time: ${new Date().toISOString()}
`;
    
    const sendmail = spawn('/usr/sbin/sendmail', ['-t', '-v'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    sendmail.stdin.write(testEmail);
    sendmail.stdin.end();
    
    let sendmailOutput = '';
    sendmail.stdout.on('data', (data) => sendmailOutput += data);
    sendmail.stderr.on('data', (data) => sendmailOutput += data);
    
    sendmail.on('close', (code) => {
      console.log('Sendmail output:', sendmailOutput);
      console.log('Sendmail exit code:', code);
      
      // Wait a moment then check the logs
      setTimeout(async () => {
        console.log('\n6. Recent mail log entries:');
        const logs = await runCommand('tail', ['-20', '/var/log/mail.log']);
        console.log(logs.stdout);
        
        console.log('\n7. Checking for Gmail-related errors:');
        const gmailErrors = await runCommand('grep', ['-i', 'gmail', '/var/log/mail.log']);
        if (gmailErrors.code === 0) {
          console.log('Gmail-related log entries:');
          console.log(gmailErrors.stdout);
        } else {
          console.log('No Gmail-related entries in log');
        }
        
        console.log('\n8. Checking for SASL/authentication errors:');
        const authErrors = await runCommand('grep', ['-i', 'sasl\\|auth', '/var/log/mail.log']);
        if (authErrors.code === 0) {
          console.log('Authentication-related log entries:');
          console.log(authErrors.stdout);
        } else {
          console.log('No authentication-related entries in log');
        }
      }, 2000);
    });
    
  } catch (error) {
    console.error('Error running diagnostic:', error);
  }
}

main();
