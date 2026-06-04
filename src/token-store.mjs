import { randomBytes } from 'node:crypto';

/**
 * @param {import('./types.d.mts').TokenStoreOptions} [opts]
 * @returns {import('./types.d.mts').TokenStore}
 */
export function createTokenStore(opts = {}) {
  const ttlMs = typeof opts.ttlMs === 'number' && opts.ttlMs > 0 ? opts.ttlMs : 30_000;
  /** @type {Map<string, number>} */
  let tokens;
  if (opts.globalKey) {
    const g = /** @type {Record<string, unknown>} */ (globalThis);
    if (!(g[opts.globalKey] instanceof Map)) {
      g[opts.globalKey] = new Map();
    }
    tokens = /** @type {Map<string, number>} */ (g[opts.globalKey]);
  } else {
    tokens = new Map();
  }

  return {
    issue() {
      const token = randomBytes(32).toString('hex');
      tokens.set(token, Date.now() + ttlMs);
      return token;
    },
    consume(token) {
      if (typeof token !== 'string' || token.length === 0) return false;
      const expiresAt = tokens.get(token);
      if (expiresAt === undefined) return false;
      tokens.delete(token);
      return expiresAt > Date.now();
    },
    purgeExpired(now = Date.now()) {
      for (const [t, expiresAt] of tokens) {
        if (expiresAt <= now) tokens.delete(t);
      }
    },
  };
}
