function pauseHealthDecision(player, reason = "manual", runMode = "standard") {
  const hp = Math.max(0, Math.floor(Number(player && player.hp) || 0));
  const subject = runMode === "tutorial" ? "TRAINING" : "FLIGHT";
  const action = reason === "manual" ? "PAUSED" : "AUTO-PAUSED";
  return {
    allowed: true,
    cost: 0,
    remainingHp: hp,
    message: `${subject} ${action}: NO HEALTH COST`
  };
}

globalThis.pauseHealthDecision = pauseHealthDecision;
