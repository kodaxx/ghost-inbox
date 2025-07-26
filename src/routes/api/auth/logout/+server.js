import { json } from '@sveltejs/kit';

export async function POST({ cookies }) {
  // Clear the session cookie
  cookies.delete('session', { path: '/' });
  
  return json({ success: true });
}
