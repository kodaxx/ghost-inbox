import { json } from '@sveltejs/kit';
import { blockAlias } from '$lib/db.js';

export function POST({ params }) {
  const { alias } = params;
  const result = blockAlias(alias);
  return json({ success: result });
}