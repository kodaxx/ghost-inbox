<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  
  onMount(() => {
    goto('/login');
  });
</script>

<div class="flex items-center justify-center min-h-screen">
  <div class="text-center">
    <h1 class="text-2xl font-bold mb-4">GhostInbox</h1>
    <p class="text-gray-600">Redirecting to login...</p>
  </div>
</div>