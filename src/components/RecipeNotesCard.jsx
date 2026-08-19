import { useState } from 'react';
import { NotebookPen, Check, X } from 'lucide-react';
import InfoTooltip from './InfoTooltip.jsx';
import { updateRecipeNotes } from '../lib/recipes.js';

/** Inline-editable Notes card for the Recipe Overview tab. Notes are
 * collected at recipe creation (RecipeForm.jsx) but were never displayed
 * anywhere — this both shows them and lets a user edit them at any time
 * (e.g. jotting something down mid-range-day or mid-loading-session),
 * same narrow single-field edit pattern as Sidebar's MoneySavedRow. */
export default function RecipeNotesCard({ recipeId, notes, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes || '');
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(notes || '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateRecipeNotes(recipeId, draft.trim());
      onSaved?.(draft.trim());
      setEditing(false);
    } catch (err) {
      console.error('Failed to save notes', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center text-xs uppercase tracking-wide text-slate-500">
          <NotebookPen size={13} className="mr-1.5 text-amber-400" />
          Notes
          <InfoTooltip>Free-form notes for this recipe — load process quirks, range-day observations, anything worth remembering next time.</InfoTooltip>
        </span>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="text-xs text-slate-500 hover:text-amber-400"
          >
            {notes ? 'Edit' : '+ Add'}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="e.g. Seat depth felt tight, back off .002 next batch."
            className="w-full resize-none rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
            >
              <X size={12} /> Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1 rounded bg-amber-500 px-2 py-1 text-xs font-medium text-slate-950 hover:bg-amber-400"
            >
              <Check size={12} /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      ) : notes ? (
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{notes}</p>
      ) : (
        <p className="mt-2 text-xs text-slate-600">No notes yet.</p>
      )}
    </div>
  );
}
