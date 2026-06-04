/**
 * @param {import('./types.d.mts').WsLike} ws
 * @param {string} payload
 */
function safeSend(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(payload);
  } catch {
    // 既に閉じている
  }
}

/**
 * WebSocket と PTY 子プロセスを双方向にブリッジする。
 *
 * - WS→PTY: `{ type: 'input', data }` / `{ type: 'resize', cols, rows }`
 * - PTY→WS: `{ type: 'output', data }` / `{ type: 'exit', code }`
 *
 * node-pty は `await import('node-pty')` で遅延ロードする。ホスト OS で
 * `npm install` してもこの関数を呼ばない限りネイティブビルドは触れない
 * (Docker image 内でのみ実行する設計と相性が良い)。
 *
 * @param {import('./types.d.mts').WsLike} ws
 * @param {import('./types.d.mts').AttachPtyOptions} opts
 * @returns {Promise<import('./types.d.mts').AttachResult>}
 */
export async function attachPty(ws, opts) {
  const logger = opts.logger ?? console;
  const label = opts.label ?? '[pty]';

  /** @type {typeof import('node-pty')} */
  let nodePty;
  try {
    nodePty = await import('node-pty');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`${label} node-pty import failed: ${msg}`);
    safeSend(ws, JSON.stringify({ type: 'error', message: 'node-pty not available' }));
    try {
      ws.close(1011, 'node-pty unavailable');
    } catch {}
    return { ok: false, reason: 'spawn-error', message: msg };
  }

  /** @type {import('./types.d.mts').PtyLike} */
  let pty;
  try {
    pty = /** @type {import('./types.d.mts').PtyLike} */ (
      /** @type {unknown} */ (
        nodePty.spawn(opts.command, [...(opts.args ?? [])], {
          name: 'xterm-256color',
          cols: opts.cols ?? 80,
          rows: opts.rows ?? 24,
          cwd: opts.cwd,
          env: opts.env,
        })
      )
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`${label} spawn failed: ${msg}`);
    safeSend(ws, JSON.stringify({ type: 'error', message: `spawn failed: ${msg}` }));
    try {
      ws.close(1011, 'spawn failed');
    } catch {}
    return { ok: false, reason: 'spawn-error', message: msg };
  }

  pty.onData((data) => {
    safeSend(ws, JSON.stringify({ type: 'output', data }));
  });

  pty.onExit(({ exitCode }) => {
    safeSend(ws, JSON.stringify({ type: 'exit', code: exitCode ?? 0 }));
    try {
      ws.close(1000, 'pty exit');
    } catch {}
  });

  const onMessage = (/** @type {Buffer | ArrayBuffer | Buffer[]} */ raw) => {
    let text;
    try {
      if (Array.isArray(raw)) text = Buffer.concat(raw).toString('utf8');
      else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString('utf8');
      else text = /** @type {Buffer} */ (raw).toString('utf8');
    } catch {
      return;
    }
    /** @type {{ type?: string; data?: string; cols?: number; rows?: number } | null} */
    let msg = null;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'input' && typeof msg.data === 'string') {
      pty.write(msg.data);
      return;
    }
    if (msg.type === 'resize') {
      const cols = Number(msg.cols);
      const rows = Number(msg.rows);
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
      const c = Math.max(1, Math.min(1000, Math.floor(cols)));
      const r = Math.max(1, Math.min(1000, Math.floor(rows)));
      try {
        pty.resize(c, r);
      } catch {
        // pty 終了済み
      }
    }
  };
  const onClose = () => {
    try {
      pty.kill('SIGHUP');
    } catch {
      // already exited
    }
  };
  const onError = (/** @type {Error} */ e) => {
    logger.warn(`${label} ws error:`, e?.message ?? e);
  };
  ws.on('message', onMessage);
  ws.on('close', onClose);
  ws.on('error', onError);

  return {
    ok: true,
    pty,
    detach() {
      try {
        pty.kill('SIGHUP');
      } catch {}
    },
  };
}
