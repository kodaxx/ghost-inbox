<script>
  import '../app.css';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  
  $: isLoginPage = $page.url.pathname === '/login';
  
  let systemHealth = {
    status: 'checking',
    database: false,
    smtp: false,
    lastChecked: null
  };
  
  async function checkSystemHealth() {
    try {
      const response = await fetch('/api/health');
      if (response.ok) {
        systemHealth = await response.json();
      } else {
        systemHealth = {
          status: 'error',
          database: false,
          smtp: false,
          lastChecked: new Date().toISOString()
        };
      }
    } catch (error) {
      console.error('Health check failed:', error);
      systemHealth = {
        status: 'error',
        database: false,
        smtp: false,
        lastChecked: new Date().toISOString()
      };
    }
  }
  
  onMount(() => {
    if (!isLoginPage) {
      checkSystemHealth();
      // Check health every 30 seconds
      const interval = setInterval(checkSystemHealth, 30000);
      return () => clearInterval(interval);
    }
  });
  
  $: statusText = systemHealth.status === 'healthy' ? 'System Healthy' :
                  systemHealth.status === 'checking' ? 'Checking...' : 
                  systemHealth.status === 'degraded' ? 'Partial Service' : 'System Issues';
</script>

<div class="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
  {#if !isLoginPage}
    <nav class="bg-white/80 backdrop-blur-md border-b border-white/20 shadow-lg sticky top-0 z-50">
      <div class="container mx-auto px-6 py-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            <div>
              <h1 class="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">GhostInbox</h1>
              <p class="text-xs text-gray-600">Email Alias Management</p>
            </div>
          </div>
          <div class="text-sm text-gray-600 relative group">
            <span class="inline-flex items-center px-3 py-1 rounded-full cursor-help {
              systemHealth.status === 'healthy' ? 'bg-green-100 text-green-800' :
              systemHealth.status === 'checking' ? 'bg-yellow-100 text-yellow-800' :
              systemHealth.status === 'degraded' ? 'bg-orange-100 text-orange-800' :
              'bg-red-100 text-red-800'
            }">
              <div class="w-2 h-2 rounded-full mr-2 {
                systemHealth.status === 'healthy' ? 'bg-green-400' :
                systemHealth.status === 'checking' ? 'bg-yellow-400 animate-pulse' :
                systemHealth.status === 'degraded' ? 'bg-orange-400' :
                'bg-red-400'
              }"></div>
              {statusText}
            </span>
            
            <!-- Tooltip -->
            <div class="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div class="text-xs space-y-2">
                <div class="font-medium text-gray-900 mb-2">System Status</div>
                <div class="flex items-center justify-between">
                  <span>Database:</span>
                  <span class="inline-flex items-center">
                    <div class="w-1.5 h-1.5 rounded-full mr-1 {systemHealth.database ? 'bg-green-400' : 'bg-red-400'}"></div>
                    {systemHealth.database ? 'Connected' : 'Error'}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span>SMTP Port 25:</span>
                  <span class="inline-flex items-center">
                    <div class="w-1.5 h-1.5 rounded-full mr-1 {systemHealth.smtp ? 'bg-green-400' : 'bg-orange-400'}"></div>
                    {systemHealth.smtp ? 'Listening' : 'Not Available'}
                  </span>
                </div>
                {#if systemHealth.ddns}
                  <div class="flex items-center justify-between">
                    <span>Dynamic DNS:</span>
                    <span class="inline-flex items-center">
                      <div class="w-1.5 h-1.5 rounded-full mr-1 {
                        !systemHealth.ddns.enabled ? 'bg-gray-400' :
                        systemHealth.ddns.status === 'configured' ? 'bg-green-400' :
                        systemHealth.ddns.status === 'misconfigured' ? 'bg-orange-400' :
                        'bg-red-400'
                      }"></div>
                      {!systemHealth.ddns.enabled ? 'Disabled' :
                       systemHealth.ddns.status === 'configured' ? 'Active' :
                       systemHealth.ddns.status === 'misconfigured' ? 'Config Error' :
                       'Error'}
                    </span>
                  </div>
                  {#if systemHealth.ddns.enabled && systemHealth.ddns.provider}
                    <div class="flex items-center justify-between text-gray-500">
                      <span>Provider:</span>
                      <span class="capitalize">{systemHealth.ddns.provider}</span>
                    </div>
                  {/if}
                {/if}
                {#if systemHealth.warnings && systemHealth.warnings.length > 0}
                  <div class="pt-2 border-t border-gray-100">
                    <div class="text-orange-600 font-medium mb-1">Notes:</div>
                    {#each systemHealth.warnings as warning}
                      <div class="text-orange-700 text-xs">• {warning}</div>
                    {/each}
                  </div>
                {/if}
                {#if systemHealth.details?.environment}
                  <div class="flex items-center justify-between text-gray-500">
                    <span>Environment:</span>
                    <span class="capitalize">{systemHealth.details.environment}</span>
                  </div>
                {/if}
                {#if systemHealth.lastChecked}
                  <div class="text-gray-500 text-xs pt-1 border-t border-gray-100">
                    Last checked: {new Date(systemHealth.lastChecked).toLocaleTimeString()}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  {/if}
  <main class="container mx-auto px-6 py-8">
    <slot />
  </main>
</div>