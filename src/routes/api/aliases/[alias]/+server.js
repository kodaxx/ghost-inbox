import { json } from '@sveltejs/kit';
import { deleteAlias, updateAliasNote } from '$lib/db.js';

export function DELETE({ params }) {
  const { alias } = params;
  const result = deleteAlias(alias);
  return json({ success: result });
}

export async function PATCH({ params, request }) {
  try {
    const { alias } = params;
    const data = await request.json();
    const { note } = data;
    
    const result = updateAliasNote(alias, note || '');
    return json({ success: result });
  } catch (error) {
    console.error('Error updating alias note:', error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
}