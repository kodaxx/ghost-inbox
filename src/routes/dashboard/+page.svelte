<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  
  let aliases = [];
  let wildcardEnabled = true;
  let newAlias = '';
  let newNote = '';
  let loading = false;
  let stats = { total: 0, active: 0, blocked: 0 };
  let editingNote = {}; // Track which alias is being edited
  let hideBlockedAliases = true; // Hide blocked aliases by default
  
  // Computed property to filter aliases based on toggle
  $: filteredAliases = hideBlockedAliases 
    ? aliases.filter(alias => alias.enabled) 
    : aliases;
  
  async function loadData() {
    const res = await fetch('/api/aliases');
    if (res.status === 401) {
      goto('/login');
      return;
    }
    if (res.ok) {
      aliases = await res.json();
      // Calculate stats
      stats.total = aliases.length;
      stats.active = aliases.filter(a => a.enabled).length;
      stats.blocked = aliases.filter(a => !a.enabled).length;
    }
    
    const res2 = await fetch('/api/wildcard');
    if (res2.ok) {
      const data = await res2.json();
      wildcardEnabled = data.enabled;
    }
  }
  
  onMount(loadData);
  
  async function create() {
    if (!newAlias) return;
    loading = true;
    
    try {
      const res = await fetch('/api/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: newAlias, note: newNote })
      });
      
      if (res.ok) {
        const result = await res.json();
        console.log('Alias created successfully:', result);
      } else {
        const error = await res.json();
        console.error('Failed to create alias:', error);
        alert('Failed to create alias: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating alias:', error);
      alert('Error creating alias: ' + error.message);
    }
    
    loading = false;
    newAlias = '';
    newNote = '';
    await loadData();
  }
  
  async function toggleWildcard() {
    const res = await fetch('/api/wildcard', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      wildcardEnabled = data.enabled;
    }
  }
  
  async function block(alias) {
    await fetch(`/api/aliases/${encodeURIComponent(alias)}/block`, { method: 'POST' });
    await loadData();
  }
  
  async function unblock(alias) {
    await fetch(`/api/aliases/${encodeURIComponent(alias)}/unblock`, { method: 'POST' });
    await loadData();
  }
  
  async function del(alias) {
    if (!confirm(`Delete alias ${alias}?`)) return;
    await fetch(`/api/aliases/${encodeURIComponent(alias)}`, { method: 'DELETE' });
    await loadData();
  }
  
  async function updateNote(alias, newNote) {
    try {
      const res = await fetch(`/api/aliases/${encodeURIComponent(alias)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: newNote })
      });
      
      if (res.ok) {
        editingNote[alias] = false;
        await loadData();
      } else {
        alert('Failed to update note');
      }
    } catch (error) {
      console.error('Error updating note:', error);
      alert('Error updating note');
    }
  }
  
  function startEditingNote(alias, currentNote) {
    editingNote[alias] = currentNote || '';
  }
  
  function cancelEditingNote(alias) {
    editingNote[alias] = false;
  }
  
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    goto('/login');
  }
</script>

<svelte:head>
  <title>Dashboard - GhostInbox</title>
</svelte:head>

<!-- Header with Welcome and Logout -->
<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
  <div>
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Welcome back!</h1>
    <p class="text-gray-600">Manage your email aliases and settings from your dashboard.</p>
  </div>
  <button 
    on:click={logout}
    class="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm"
  >
    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
    </svg>
    Logout
  </button>
</div>

<!-- Stats Cards -->
<div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <div class="flex items-center">
      <div class="p-2 bg-blue-100 rounded-lg">
        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
        </svg>
      </div>
      <div class="ml-4">
        <p class="text-sm font-medium text-gray-600">Total Aliases</p>
        <p class="text-2xl font-bold text-gray-900">{stats.total}</p>
      </div>
    </div>
  </div>
  
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <div class="flex items-center">
      <div class="p-2 bg-green-100 rounded-lg">
        <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      </div>
      <div class="ml-4">
        <p class="text-sm font-medium text-gray-600">Active</p>
        <p class="text-2xl font-bold text-gray-900">{stats.active}</p>
      </div>
    </div>
  </div>
  
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <div class="flex items-center">
      <div class="p-2 bg-red-100 rounded-lg">
        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"></path>
        </svg>
      </div>
      <div class="ml-4">
        <p class="text-sm font-medium text-gray-600">Blocked</p>
        <p class="text-2xl font-bold text-gray-900">{stats.blocked}</p>
      </div>
    </div>
  </div>
  
  <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
    <div class="flex items-center">
      <div class="p-2 {wildcardEnabled ? 'bg-green-100' : 'bg-gray-100'} rounded-lg">
        <svg class="w-6 h-6 {wildcardEnabled ? 'text-green-600' : 'text-gray-600'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
        </svg>
      </div>
      <div class="ml-4">
        <p class="text-sm font-medium text-gray-600">Wildcard</p>
        <p class="text-lg font-bold {wildcardEnabled ? 'text-green-600' : 'text-gray-600'}">{wildcardEnabled ? 'Enabled' : 'Disabled'}</p>
      </div>
    </div>
  </div>
</div>

<!-- Main Content Grid -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
  <!-- Create Alias Form -->
  <div class="lg:col-span-1">
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div class="flex items-center mb-6">
        <div class="p-2 bg-blue-100 rounded-lg mr-3">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900">Create New Alias</h2>
      </div>
      
      <form on:submit|preventDefault={create} class="space-y-4">
        <div>
          <label for="alias" class="block text-sm font-medium text-gray-700 mb-2">Email Alias</label>
          <div class="relative">
            <input 
              id="alias"
              type="text"
              bind:value={newAlias}
              placeholder="example"
              class="w-full px-4 py-3 pr-32 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
              required
            />
            <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span class="text-gray-500 text-sm">@yourdomain.com</span>
            </div>
          </div>
        </div>
        
        <div>
          <label for="note" class="block text-sm font-medium text-gray-700 mb-2">Note (Optional)</label>
          <textarea 
            id="note"
            bind:value={newNote}
            placeholder="Add a note to remember what this alias is for..."
            rows="3"
            class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 resize-none"
          ></textarea>
        </div>
        
        <button 
          type="submit"
          disabled={loading || !newAlias}
          class="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
        >
          {#if loading}
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Creating...
          {:else}
            Create Alias
          {/if}
        </button>
      </form>
    </div>
    
    <!-- Wildcard Settings -->
    <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center">
          <div class="p-2 bg-purple-100 rounded-lg mr-3">
            <svg class="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </div>
          <div>
            <h3 class="text-lg font-semibold text-gray-900">Wildcard Aliases</h3>
            <p class="text-sm text-gray-600">Accept emails to any non-existing alias</p>
          </div>
        </div>
      </div>
      
      <button 
        on:click={toggleWildcard}
        class="w-full py-3 px-6 rounded-lg font-medium transition-all duration-200 {wildcardEnabled 
          ? 'bg-green-600 hover:bg-green-700 text-white' 
          : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}"
      >
        {wildcardEnabled ? 'Disable Wildcards' : 'Enable Wildcards'}
      </button>
    </div>
  </div>
  
  <!-- Aliases Table -->
  <div class="lg:col-span-2">
    <div class="bg-white rounded-xl shadow-sm border border-gray-100">
      <div class="p-6 border-b border-gray-100">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <div class="p-2 bg-indigo-100 rounded-lg mr-3">
              <svg class="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
              </svg>
            </div>
            <h2 class="text-lg font-semibold text-gray-900">
              Your Aliases ({filteredAliases.length}{hideBlockedAliases && stats.blocked > 0 ? ` of ${aliases.length}` : ''})
            </h2>
          </div>
          
          <!-- Toggle for hiding blocked aliases -->
          <div class="flex items-center space-x-3">
            <label class="flex items-center space-x-3 text-sm text-gray-600" title="Toggle blocked aliases visibility">
              <span>Hide blocked aliases</span>
              
              <!-- Modern sliding toggle switch -->
              <div class="relative">
                <input 
                  type="checkbox" 
                  bind:checked={hideBlockedAliases}
                  class="sr-only"
                  on:change={() => hideBlockedAliases = !hideBlockedAliases}
                />
                <div 
                  class="toggle-bg w-11 h-6 rounded-full shadow-inner transition-colors duration-200 ease-in-out cursor-pointer {hideBlockedAliases ? 'bg-indigo-600' : 'bg-gray-200'}"
                  on:click={() => hideBlockedAliases = !hideBlockedAliases}
                  on:keydown={(e) => e.key === 'Enter' || e.key === ' ' ? hideBlockedAliases = !hideBlockedAliases : null}
                  tabindex="0"
                  role="switch"
                  aria-checked={hideBlockedAliases}
                >
                  <div class="toggle-dot absolute w-4 h-4 bg-white rounded-full shadow-md transform transition-transform duration-200 ease-in-out top-1 {hideBlockedAliases ? 'translate-x-6' : 'translate-x-1'}"></div>
                </div>
              </div>
              
              {#if stats.blocked > 0}
                <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  {stats.blocked}
                </span>
              {/if}
            </label>
          </div>
        </div>
      </div>
      
      <div class="overflow-hidden">
        {#if filteredAliases.length === 0}
          <div class="p-12 text-center">
            <div class="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
              </svg>
            </div>
            {#if aliases.length === 0}
              <h3 class="text-lg font-medium text-gray-900 mb-2">No aliases yet</h3>
              <p class="text-gray-600 mb-4">Create your first email alias to get started.</p>
            {:else}
              <h3 class="text-lg font-medium text-gray-900 mb-2">No active aliases</h3>
              <p class="text-gray-600 mb-4">All your aliases are currently blocked. Uncheck "Hide blocked aliases" to see them.</p>
            {/if}
          </div>
        {:else}
          <div class="divide-y divide-gray-200">
            {#each filteredAliases as al}
              <div class="p-4 hover:bg-gray-50 transition-colors duration-150">
                <!-- Mobile-first card layout -->
                <div class="flex flex-col space-y-3">
                  <!-- Header row with alias and status -->
                  <div class="flex items-center justify-between">
                    <div class="flex-1 min-w-0">
                      <div class="font-mono text-sm font-medium text-gray-900 truncate">
                        {al.alias}<span class="text-gray-500">@yourdomain.com</span>
                      </div>
                      {#if al.last_sender}
                        <div class="text-xs text-gray-500 mt-1">
                          Last: {al.last_sender}
                        </div>
                      {/if}
                    </div>
                    <div class="flex items-center space-x-2">
                      {#if al.enabled}
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          <div class="w-1.5 h-1.5 bg-green-400 rounded-full mr-1"></div>
                          Active
                        </span>
                      {:else}
                        <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          <div class="w-1.5 h-1.5 bg-red-400 rounded-full mr-1"></div>
                          Blocked
                        </span>
                      {/if}
                    </div>
                  </div>
                  
                  <!-- Notes section -->
                  <div class="w-full">
                    {#if editingNote[al.alias] !== false && editingNote[al.alias] !== undefined}
                      <div class="flex items-center space-x-2">
                        <input 
                          type="text" 
                          bind:value={editingNote[al.alias]}
                          placeholder="Add a note..."
                          class="flex-1 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          on:keydown={(e) => {
                            if (e.key === 'Enter') {
                              updateNote(al.alias, editingNote[al.alias]);
                            } else if (e.key === 'Escape') {
                              cancelEditingNote(al.alias);
                            }
                          }}
                        />
                        <button 
                          on:click={() => updateNote(al.alias, editingNote[al.alias])}
                          class="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button 
                          on:click={() => cancelEditingNote(al.alias)}
                          class="text-xs px-2 py-1 bg-gray-500 text-white rounded hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    {:else}
                      <div 
                        class="text-sm text-gray-600 cursor-pointer hover:text-blue-600 transition-colors"
                        on:click={() => startEditingNote(al.alias, al.notes)}
                        title="Click to edit note"
                      >
                        {#if al.notes}
                          <span class="flex items-center">
                            <svg class="w-3 h-3 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                            {al.notes}
                          </span>
                        {:else}
                          <span class="flex items-center text-gray-400 hover:text-blue-500">
                            <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                            </svg>
                            Add note...
                          </span>
                        {/if}
                      </div>
                    {/if}
                  </div>
                  
                  <!-- Footer with date and actions -->
                  <div class="flex items-center justify-between text-xs text-gray-500">
                    <div>
                      Created: {al.created_at?.slice(0, 19).replace('T', ' ') || '—'}
                    </div>
                    <div class="flex items-center space-x-2">
                      {#if al.enabled}
                        <button 
                          on:click={() => block(al.alias)}
                          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-yellow-700 bg-yellow-100 hover:bg-yellow-200 transition-colors duration-150"
                          title="Block alias"
                        >
                          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"></path>
                          </svg>
                          Block
                        </button>
                      {:else}
                        <button 
                          on:click={() => unblock(al.alias)}
                          class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-green-700 bg-green-100 hover:bg-green-200 transition-colors duration-150"
                          title="Unblock alias"
                        >
                          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          Unblock
                        </button>
                      {/if}
                      <button 
                        on:click={() => del(al.alias)}
                        class="inline-flex items-center px-2 py-1 text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 transition-colors duration-150"
                        title="Delete alias"
                      >
                        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                        </svg>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  /* Custom toggle switch styles */
  .toggle-bg {
    cursor: pointer;
  }
  
  .toggle-bg:hover {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .toggle-bg:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
  
  .toggle-dot {
    cursor: pointer;
    pointer-events: none; /* Prevent dot from interfering with clicks */
  }
  
  /* Screen reader only class for accessibility */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
