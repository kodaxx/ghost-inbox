import { json } from '@sveltejs/kit';
import { unblockAlias } from '$lib/db.js';

export function POST({ params }) {
  const { alias } = params;
  const result = unblockAlias(alias);
  return json({ success: result });
}