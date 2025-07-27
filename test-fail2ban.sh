#!/bin/bash

# Test script to verify fail2ban configuration
echo "🔍 Testing fail2ban configuration..."

# Test the ghostinbox-dashboard filter
echo ""
echo "Testing ghostinbox-dashboard filter..."
echo "[$(date)] Login failed - invalid credentials for testuser from 192.168.1.100" | fail2ban-regex - /etc/fail2ban/filter.d/ghostinbox-dashboard.conf

# Test the ghostinbox-smtp-abuse filter  
echo ""
echo "Testing ghostinbox-smtp-abuse filter..."
echo "$(date) mail postfix/smtpd[12345]: connect from unknown[192.168.1.200]" | fail2ban-regex - /etc/fail2ban/filter.d/ghostinbox-smtp-abuse.conf

echo ""
echo "✅ Test completed. Check output above for filter matches."
