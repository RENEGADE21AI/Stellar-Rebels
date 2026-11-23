export const MAX_TIER = 15;

export const UPGRADES = {
  damage: { name: 'Weapon Damage', detail: 'Damage per shot', icon: 'fist', maxBonus: .32 },
  rate: { name: 'Fire Rate', detail: 'Shots per second', icon: 'fireRate', maxBonus: .18 },
  thrusters: { name: 'Thrusters', detail: 'Movement speed', icon: 'thrust', maxBonus: .28 },
  energy: { name: 'Energy', detail: 'Energy regeneration', icon: 'overdrive', maxBonus: .20 }
};

export const LEGACY_UPGRADES = {
  rails: { name: 'Calibrated Rails' },
  chamber: { name: 'Cycling Chamber', needs: 'rails' },
  cells: { name: 'Resonant Cells', needs: 'chamber' },
  hull: { name: 'Ablative Hull', cost: 95 }
};

const tracks = Object.keys(UPGRADES);

export function normalizeTiers(value) {
  return Object.fromEntries(tracks.map((key) => {
    const tier = value?.[key];
    return [key, Number.isInteger(tier) ? Math.max(0, Math.min(MAX_TIER, tier)) : 0];
  }));
}

export function validTiers(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== tracks.length) return false;
  return tracks.every((key) => Object.hasOwn(value, key) && Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= MAX_TIER);
}

export function tierKey(value) {
  const tiers = normalizeTiers(value);
  return tracks.map((key) => tiers[key]).join('-');
}

export function tierCost(tier) {
  return 20 + (tier - 1) * 5 + (tier >= 10 ? 10 : 0) + (tier >= 13 ? 6 : 0);
}

export function tierBenefit(key, tier) {
  return UPGRADES[key].maxBonus * (tier / MAX_TIER);
}

export function weaponStats(owned, rebalanced = true) {
  if (Array.isArray(owned)) {
    return {
      damage: (owned.includes('rails') ? 1.08 : 1) * (owned.includes('cells') ? 1.10 : 1),
      rate: owned.includes('chamber') ? 1.09 : 1,
      speed: 1,
      recharge: 1,
      hull: Number(owned.includes('hull'))
    };
  }
  const tiers = normalizeTiers(owned);
  if (!rebalanced) return { damage:1 + .25 * (tiers.damage / MAX_TIER), rate:1 + .15 * (tiers.rate / MAX_TIER),
    speed:1 + .12 * (tiers.thrusters / MAX_TIER), recharge:1 + .20 * (tiers.energy / MAX_TIER), hull:0 };
  return { damage:.94 * (1 + tierBenefit('damage', tiers.damage)), rate:1 + tierBenefit('rate', tiers.rate),
    speed:.86 * (1 + tierBenefit('thrusters', tiers.thrusters)), recharge:1 + tierBenefit('energy', tiers.energy), hull:0 };
}

const ranks = [
  ['Cadet', 0], ['Pilot', 300], ['Flight Lead', 850], ['Squadron Lead', 1700], ['Veteran', 3000],
  ['Ace', 5000], ['Senior Ace', 7800], ['Wing Ace', 11_500], ['Fleet Ace', 16_500],
  ['Distinguished Ace', 23_000], ['Elite Ace', 31_500], ['Legend', 42_000]
];

export function pilotRank(xp) {
  const position = Math.max(0, ranks.findLastIndex(([, threshold]) => xp >= threshold));
  const [name, floorXp] = ranks[position];
  return { name, level: position + 1, floorXp, nextXp: ranks[position + 1]?.[1] ?? null };
}
