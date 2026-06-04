import { attachPty } from './pty-bridge.mjs';

/**
 * セッション数キャップ付き attachPty。上限超過時は ws を 1013 close。
 * @param {number} max
 * @returns {import('./types.d.mts').SessionLimit}
 */
export function createSessionLimit(max) {
  let active = 0;
  return {
    max,
    current() {
      return active;
    },
    async attachPty(ws, opts) {
      if (active >= max) {
        const message = `session limit ${active}/${max}`;
        try {
          ws.send(JSON.stringify({ type: 'error', message }));
        } catch {}
        try {
          ws.close(1013, 'limit-exceeded');
        } catch {}
        return { ok: false, reason: 'limit-exceeded', message };
      }
      active += 1;
      const result = await attachPty(ws, opts);
      if (!result.ok) {
        active -= 1;
        return result;
      }
      ws.on('close', () => {
        active -= 1;
      });
      return result;
    },
  };
}
