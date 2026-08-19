// Placeholder recipe matching the Section 3 mockup exactly, so the Phase 2
// shell renders something meaningful before Phase 3+ wires it to real
// Supabase data (load_recipes + range_sessions + shot_logs joined).
export const mockRecipe = {
  title: '140gr ELD-M COMP MATCH',
  caliber: '6.5 Creedmoor',
  powder: 'H4350',
  bullet: '140gr ELD-M',
  chargeGrains: 41.5,
  coalInches: 2.825,
  primer: 'FED GM205MAR',
  brass: 'HORNADY (2x FIRED)',
  rifleModel: 'BERGARA B-14 (24" BBL)',
  distanceYards: 100,
  groupSizeMoa: 0.38,
  avgVelocity: 2710,
  stdDevFps: 4.2,
  extremeSpread: 11,
  costPerRound: 1.12,
  shots: [2710, 2705, 2714, 2708, 2712, 2703, 2711],
};
