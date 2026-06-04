/**
 * Origin 完全一致の許可リスト。
 * @param {ReadonlyArray<string>} origins
 * @returns {import('./types.d.mts').Allowlist}
 */
export function createAllowlist(origins) {
  const set = new Set((origins ?? []).filter((o) => typeof o === 'string' && o.length > 0));
  return {
    has(origin) {
      if (typeof origin !== 'string' || origin.length === 0) return false;
      return set.has(origin);
    },
    values() {
      return [...set];
    },
  };
}
