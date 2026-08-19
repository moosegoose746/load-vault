import { Camera } from 'lucide-react';
import InfoTooltip from './InfoTooltip.jsx';
import { totalRoundsForFirearm, barrelLifePercentUsed } from '../lib/firearms.js';

/** Compact read-only firearm card for the Recipe Overview tab — replaces
 * the old RecipeChecklist's single plain-text "Firearm" row with the
 * actual Firearm Profile (photo, make/model, optic, barrel specs, round
 * count, barrel life if tracked), so a user looking at a recipe can see
 * at a glance which gun it's built for without switching tabs. `firearm`
 * is one entry from Dashboard's already-fetched `firearms` list (found
 * via firearms.find(f => f.id === recipe.firearmId)) — deliberately not
 * a new fetch. `roundsFiredByFirearm` is the userId -> firearmId -> count
 * map from fetchRoundsFiredByFirearm, passed straight through so this
 * card can reuse the same totalRoundsForFirearm/barrelLifePercentUsed
 * helpers the Firearms page itself uses (see lib/firearms.js), rather
 * than re-deriving the math. */
export default function FirearmSummaryCard({ firearm, roundsFiredByFirearm }) {
  if (!firearm) {
    return (
      <div className="rounded border border-dashed border-slate-700 bg-slate-900/40 p-4 text-center text-xs text-slate-500">
        No firearm linked to this recipe.
      </div>
    );
  }

  const totalRounds = totalRoundsForFirearm(firearm, roundsFiredByFirearm);
  const pct = barrelLifePercentUsed(firearm, totalRounds);
  const detailLine = [firearm.make, firearm.model].filter(Boolean).join(' ');
  const barrelLine = [
    firearm.barrel_length_inches ? `${firearm.barrel_length_inches}" barrel` : null,
    firearm.twist_rate ? `${firearm.twist_rate} twist` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded border border-slate-700 bg-slate-900/60 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-700 bg-slate-900">
          {firearm.photo_url ? (
            <img src={firearm.photo_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera size={18} className="text-slate-600" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">{firearm.name}</div>
          {detailLine && <div className="truncate text-xs text-slate-500">{detailLine}</div>}
          {firearm.optic && <div className="truncate text-[11px] text-slate-500">{firearm.optic}</div>}
          {barrelLine && <div className="truncate text-[11px] text-slate-500">{barrelLine}</div>}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2 text-xs">
        <span className="flex items-center text-slate-500">
          Rounds fired
          <InfoTooltip>Total rounds this firearm has fired — its starting count plus everything logged through Range Day sessions.</InfoTooltip>
        </span>
        <span className="font-mono text-slate-200">{totalRounds.toLocaleString()}</span>
      </div>

      {pct != null && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center">
              Barrel life
              <InfoTooltip>Estimated round count before accuracy typically starts to fall off, based on the barrel life you set for this firearm.</InfoTooltip>
            </span>
            <span className="font-mono text-slate-300">{pct}%</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
