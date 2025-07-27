#!/usr/bin/env node

/**
 * Local Email Injection Testing Tool
 * 
 * This tool injects emails directly into the local Postfix queue for testing
 * the real forwarding pipeline without requiring external mail servers.
 * 
 * Flow: Script → Postfix → handle-email.js → Gmail SMTP
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const TEST_EMAILS = [
  {
    name: "Basic forwarding test",
    from: "sender@external.com",
    to: "test@{DOMAIN}",
    subject: "Test Email #1 - Basic Forwarding",
    body: "This is a test email to verify the complete forwarding pipeline works correctly.\n\nIt should go through Postfix → handle-email.js → Gmail.",
    contentType: "text/plain"
  },
  {
    name: "HTML email test", 
    from: "newsletter@company.com",
    to: "newsletter@{DOMAIN}",
    subject: "Test Email #2 - HTML Content",
    body: `<html><body>
<h1>HTML Email Test</h1>
<p>This is an <strong>HTML email</strong> to test rich content forwarding through the complete pipeline.</p>
<ul>
  <li>Postfix receives email</li>
  <li>handle-email.js processes it</li>
  <li>Gmail SMTP sends it out</li>
</ul>
<p><a href="https://example.com">Test Link</a></p>
</body></html>`,
    contentType: "text/html"
  },
  {
    name: "Long subject test",
    from: "sender@test.com", 
    to: "longsubject@{DOMAIN}",
    subject: "Test Email #3 - This is a very long subject line to test how the system handles longer subjects that might wrap or cause issues with email processing",
    body: "Testing long subject line handling through the pipeline.",
    contentType: "text/plain"
  },
  {
    name: "Special characters test",
    from: "unicode@test.com",
    to: "unicode@{DOMAIN}", 
    subject: "Test Email #4 - Unicode: 你好 🌍 Émojis & Spécial Chärs",
    body: "Testing unicode and special characters:\n\n• Bullets\n• Émojis: 🚀 📧 ✅\n• Accents: café, naïve, piña\n• Languages: 你好世界, здравствуй мир, こんにちは世界",
    contentType: "text/plain"
  },
  {
    name: "Wildcard alias test",
    from: "support@service.com",
    to: "randomstring123@{DOMAIN}",
    subject: "Test Email #5 - Wildcard Alias",
    body: "This email is sent to a non-existent alias to test wildcard functionality.\n\nIf wildcards are enabled, this should still be forwarded.",
    contentType: "text/plain"
  }
];

function createEmailContent(email) {
  const date = new Date().toUTCString();
  const messageId = `<test-${Date.now()}@localhost>`;
  
  let content = `From: ${email.from}\n`;
  content += `To: ${email.to}\n`;
  content += `Subject: ${email.subject}\n`;
  content += `Date: ${date}\n`;
  content += `Message-ID: ${messageId}\n`;
  content += `Content-Type: ${email.contentType}; charset=UTF-8\n`;
  content += `X-Test-Email: true\n`;
  content += `\n`;
  content += email.body;
  
  return content;
}

async function sendEmailViaPostfix(emailContent, recipient) {
  return new Promise((resolve, reject) => {
    console.log(`📤 Injecting email into Postfix for ${recipient}...`);
    
    const sendmail = spawn('sendmail', ['-f', 'test@localhost', recipient], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    sendmail.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    sendmail.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    sendmail.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ Email injected successfully into Postfix queue`);
        resolve({ success: true, stdout, stderr });
      } else {
        console.log(`❌ Failed to inject email (exit code: ${code})`);
        if (stderr) console.log(`Error: ${stderr}`);
        resolve({ success: false, code, stdout, stderr });
      }
    });
    
    sendmail.on('error', (error) => {
      console.log(`💥 Sendmail process error: ${error.message}`);
      reject(error);
    });
    
    // Send the email content
    sendmail.stdin.write(emailContent);
    sendmail.stdin.end();
  });
}

async function checkPostfixStatus() {
  return new Promise((resolve) => {
    const postfix = spawn('postfix', ['status'], { stdio: ['pipe', 'pipe', 'pipe'] });
    
    postfix.on('close', (code) => {
      resolve(code === 0);
    });
    
    postfix.on('error', () => {
      resolve(false);
    });
  });
}

async function showMailQueue() {
  return new Promise((resolve) => {
    console.log('\n📬 Current mail queue:');
    const postqueue = spawn('postqueue', ['-p'], { stdio: ['pipe', 'pipe', 'pipe'] });
    
    let output = '';
    postqueue.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    postqueue.on('close', (code) => {
      if (code === 0) {
        console.log(output.trim() || 'Mail queue is empty');
      } else {
        console.log('Could not check mail queue (may need sudo)');
      }
      resolve();
    });
    
    postqueue.on('error', () => {
      console.log('Could not check mail queue - postqueue command not available');
      resolve();
    });
  });
}

async function runTest(testEmail, index) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Test ${index + 1}: ${testEmail.name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`From: ${testEmail.from}`);
  console.log(`To: ${testEmail.to}`);
  console.log(`Subject: ${testEmail.subject}`);
  
  try {
    const emailContent = createEmailContent(testEmail);
    
    // Show a preview of the email content
    console.log('\n📧 Email preview:');
    console.log('─'.repeat(40));
    console.log(emailContent.split('\n').slice(0, 8).join('\n'));
    if (emailContent.split('\n').length > 8) {
      console.log('...');
    }
    console.log('─'.repeat(40));
    
    const result = await sendEmailViaPostfix(emailContent, testEmail.to);
    
    if (result.success) {
      console.log('✅ Email successfully injected into Postfix');
      console.log('� Postfix should now process it through handle-email.js');
      console.log('� Check your Gmail for the forwarded message');
    } else {
      console.log('❌ Failed to inject email into Postfix');
      if (result.stderr) {
        console.log(`Error details: ${result.stderr}`);
      }
    }
    
  } catch (error) {
    console.log('💥 Exception occurred:');
    console.log(error.message);
  }
}

async function runAllTests() {
  console.log('🚀 Local Email Injection Testing Tool');
  console.log('====================================');
  
  // Check environment
  const domain = process.env.MY_DOMAIN;
  const realEmail = process.env.REAL_EMAIL;
  
  if (!domain) {
    console.log('❌ MY_DOMAIN environment variable not set');
    process.exit(1);
  }
  
  if (!realEmail) {
    console.log('❌ REAL_EMAIL environment variable not set');
    process.exit(1);
  }
  
  console.log(`📧 Testing domain: ${domain}`);
  console.log(`📬 Forward target: ${realEmail}`);
  
  // Check if Postfix is running
  console.log('\n🔍 Checking Postfix status...');
  const postfixRunning = await checkPostfixStatus();
  
  if (!postfixRunning) {
    console.log('❌ Postfix is not running. Please start it first:');
    console.log('   sudo systemctl start postfix');
    console.log('   # or #');
    console.log('   sudo postfix start');
    process.exit(1);
  }
  
  console.log('✅ Postfix is running');
  
  // Update test emails with actual domain
  const testsToRun = TEST_EMAILS.map(email => ({
    ...email,
    to: email.to.replace('{DOMAIN}', domain)
  }));
  
  // Show initial queue status
  await showMailQueue();
  
  console.log(`\n🎯 Running ${testsToRun.length} tests...`);
  console.log('💡 Each test will inject an email into Postfix queue');
  console.log('⚡ Postfix will process emails through handle-email.js');
  console.log('📤 handle-email.js will forward to Gmail SMTP');
  
  // Run each test
  for (let i = 0; i < testsToRun.length; i++) {
    await runTest(testsToRun[i], i);
    
    // Delay between tests
    if (i < testsToRun.length - 1) {
      console.log('\n⏳ Waiting 3 seconds before next test...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  console.log('\n🎉 All tests completed!');
  console.log('\n📬 Final mail queue status:');
  await showMailQueue();
  
  console.log('\n📋 Next steps:');
  console.log('1. Check your Gmail inbox for forwarded emails');
  console.log('2. Monitor Postfix logs: sudo tail -f /var/log/mail.log');
  console.log('3. Check mail queue: postqueue -p');
  console.log('4. If emails are stuck, try: sudo postqueue -f');
}

async function runSingleTest(testName) {
  const domain = process.env.MY_DOMAIN;
  if (!domain) {
    console.log('❌ MY_DOMAIN environment variable not set');
    process.exit(1);
  }
  
  const test = TEST_EMAILS.find(t => t.name.toLowerCase().includes(testName.toLowerCase()));
  if (!test) {
    console.log(`❌ Test "${testName}" not found.`);
    console.log('Available tests:');
    TEST_EMAILS.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
    return;
  }
  
  // Update with actual domain
  const testToRun = {
    ...test,
    to: test.to.replace('{DOMAIN}', domain)
  };
  
  await runTest(testToRun, 0);
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    await runAllTests();
  } else if (args[0] === 'list') {
    console.log('Available tests:');
    TEST_EMAILS.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}`));
  } else if (args[0] === 'test' && args[1]) {
    await runSingleTest(args[1]);
  } else if (args[0] === 'queue') {
    await showMailQueue();
  } else {
    console.log('Usage:');
    console.log('  node test-email.js              # Run all tests');
    console.log('  node test-email.js list         # List available tests');
    console.log('  node test-email.js test <name>  # Run specific test');
    console.log('  node test-email.js queue        # Show mail queue');
    console.log('');
    console.log('Examples:');
    console.log('  node test-email.js test basic');
    console.log('  node test-email.js test wildcard');
    console.log('  node test-email.js queue');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { TEST_EMAILS, runTest, createEmailContent };
