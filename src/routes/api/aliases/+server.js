import { json } from '@sveltejs/kit';
import { allAliases, createAlias } from '$lib/db.js';

/**
 * GET /api/aliases
 * Returns a JSON array of all known aliases.
 */
export function GET() {
  console.log('GET /api/aliases called');
  
  try {
    const aliases = allAliases();
    console.log('Retrieved aliases:', aliases.length, 'aliases');
    return json(aliases);
  } catch (error) {
    console.error('Error in GET /api/aliases:', error);
    return json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/aliases
 * Creates a new alias. Expects JSON body with `alias` and optional `note`.
 */
export async function POST({ request }) {
  console.log('POST /api/aliases called');
  
  try {
    const data = await request.json();
    console.log('Request data:', data);
    
    const alias = (data.alias || '').trim();
    const note = (data.note || '').trim();
    
    console.log('Processed alias:', alias, 'note:', note);
    
    if (!alias) {
      console.log('Missing alias');
      return new Response('Missing alias', { status: 400 });
    }
    
    // prevent @ symbol in alias
    const sanitized = alias.replace(/@.*$/, '');
    console.log('Sanitized alias:', sanitized);
    
    const created = createAlias(sanitized, null, note);
    console.log('Alias creation result:', created);
    
    if (created) {
      return json({ success: true });
    }
    return json({ success: false, error: 'Alias already exists' }, { status: 400 });
  } catch (error) {
    console.error('Error in POST /api/aliases:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}