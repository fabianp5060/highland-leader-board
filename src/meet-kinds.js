// Classifies each meet on the 2026 calendar as a JV meet or a (default) invitational.
// JV dual/tri meets score separately from invitationals — the leaderboard filter uses this.
export const JV_MEET_IDS = new Set([
  "622951",
  "624931",
  "622976",
  "622978",
]);

export function kindFor(meetId) {
  return JV_MEET_IDS.has(String(meetId)) ? "jv" : "invitational";
}
