#!/usr/bin/env node

// Complete email flow test
import { spawn } from 'child_process';

console.log('=== Complete Email Flow Test ===');

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
    console.log('\n1. Testing DNS resolution...');
    const dns = await runCommand('nslookup', ['smtp.gmail.com']);
    if (dns.code === 0) {
      console.log('✅ DNS resolution working');
      console.log('Gmail SMTP IP:', dns.stdout.match(/Address: ([\d.]+)/)?.[1] || 'Not found');
    } else {
      console.log('❌ DNS resolution failed');
      console.log('Error:', dns.stderr);
    }
    
    console.log('\n2. Testing Postfix configuration...');
    const config = await runCommand('postconf', ['relayhost', 'smtp_sasl_auth_enable']);
    console.log('Postfix relay config:', config.stdout);
    
    console.log('\n3. Checking SASL password file...');
    const saslCheck = await runCommand('ls', ['-la', '/etc/postfix/sasl_passwd*']);
    if (saslCheck.code === 0) {
      console.log('✅ SASL password files exist');
      console.log(saslCheck.stdout);
    } else {
      console.log('❌ SASL password files missing');
    }
    
    console.log('\n4. Testing email handler...');
    const testEmail = `Subject: Complete Flow Test
From: test@localhost
To: test@hauslab.xyz

This is a complete flow test.
Time: ${new Date().toISOString()}
`;
    
    // Test handle-email.js directly
    const handler = spawn('node', ['/app/handle-email.js', 'test@hauslab.xyz'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    handler.stdin.write(testEmail);
    handler.stdin.end();
    
    let handlerOutput = '';
    handler.stdout.on('data', (data) => handlerOutput += data);
    handler.stderr.on('data', (data) => handlerOutput += data);
    
    handler.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Email handler test passed');
        console.log('Handler output:', handlerOutput);
      } else {
        console.log('❌ Email handler test failed');
        console.log('Handler output:', handlerOutput);
      }
      
      // Check mail queue after handler test
      setTimeout(async () => {
        console.log('\n5. Checking mail queue...');
        const queue = await runCommand('postqueue', ['-p']);
        
        if (queue.stdout.includes('Mail queue is empty')) {
          console.log('✅ Mail queue is empty (good - emails processed)');
        } else {
          console.log('📬 Mail queue has pending messages:');
          console.log(queue.stdout);
          
          // Try to flush the queue
          console.log('\n6. Flushing mail queue...');
          await runCommand('postqueue', ['-f']);
          
          // Wait and check again
          setTimeout(async () => {
            console.log('\n7. Re-checking queue after flush...');
            const queueAfter = await runCommand('postqueue', ['-p']);
            console.log(queueAfter.stdout);
            
            // Check recent mail logs
            console.log('\n8. Recent mail delivery attempts:');
            const logs = await runCommand('tail', ['-10', '/var/log/mail.log']);
            console.log(logs.stdout);
          }, 3000);
        }
      }, 2000);
    });
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

main();
