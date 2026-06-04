<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>@cli-web-terminal/server</title>
</head>
<body>

<h1>@cli-web-terminal/server</h1>

<p>
ブラウザのターミナルパネル (<code>@cli-web-terminal/react</code>) をサーバ側で受ける primitive 群。WebSocket と node-pty 子プロセスを双方向にブリッジし、短期 token と Origin allowlist で軽い認可を提供する。
</p>

<p>
特定のコマンドに依存しない。<code>command</code> と <code>args</code> を渡せば任意の bin (claude / bash / codex / python REPL 等) を spawn できる。req-web では <code>claude</code> を渡している。
</p>

<h2>API</h2>

<h3>attachPty</h3>

<pre><code>import { attachPty } from '@cli-web-terminal/server';

const result = await attachPty(ws, {
  command: process.env.CLAUDE_BIN || 'claude',
  args: resume ? ['-c'] : [],
  cwd: '/workspace',
  env: { ...process.env, TERM: 'xterm-256color', FORCE_COLOR: '3' },
});
if (!result.ok) {
  console.error('attach failed:', result.message);
}
</code></pre>

<ul>
  <li><strong>WS→PTY</strong>: <code>{ type: 'input', data }</code> / <code>{ type: 'resize', cols, rows }</code></li>
  <li><strong>PTY→WS</strong>: <code>{ type: 'output', data }</code> / <code>{ type: 'exit', code }</code></li>
  <li>node-pty は <code>await import('node-pty')</code> で遅延ロード。ホスト OS 側で <code>npm install</code> しても、attachPty を呼ばない限りネイティブビルドは展開されない（Docker image 内のみで実行する設計と相性が良い）</li>
</ul>

<h3>createTokenStore</h3>

<pre><code>import { createTokenStore } from '@cli-web-terminal/server';

const tokens = createTokenStore({
  ttlMs: 30_000,
  globalKey: '__app_term_tokens__',  // Next.js dev mode 用 (optional)
});

const t = tokens.issue();           // → 32 byte hex
const ok = tokens.consume(t);       // 1 度だけ true、再消費 / 期限切れは false
tokens.purgeExpired();              // 定期 GC 用 (任意)
</code></pre>

<p>
Next.js dev mode は Route Handler と custom server が別モジュールインスタンスとして読み込まれることがあるため、同じ store を共有させたければ <code>globalKey</code> を指定する。production では不要。
</p>

<h3>createAllowlist</h3>

<pre><code>import { createAllowlist } from '@cli-web-terminal/server';

const allow = createAllowlist([
  `http://127.0.0.1:${port}`,
  `http://localhost:${port}`,
  ...(process.env.MY_APP_ALLOWED_ORIGINS?.split(',') ?? []),
]);

if (!allow.has(req.headers.origin)) return reject(403);
</code></pre>

<h3>createSessionLimit</h3>

<pre><code>import { createSessionLimit } from '@cli-web-terminal/server';

const limit = createSessionLimit(8);
const result = await limit.attachPty(ws, opts);
console.log('active:', limit.current(), '/', limit.max);
</code></pre>

<p>
<code>attachPty</code> のラッパー。上限超過時は ws を 1013 で close し、<code>{ ok: false, reason: 'limit-exceeded' }</code> を返す。
</p>

<h2>peerDependencies</h2>

<ul>
  <li><code>ws</code> (^8) — required</li>
  <li><code>node-pty</code> (^1) — optional。実際に attachPty を呼ぶ環境 (Docker image) でのみ install すればよい</li>
</ul>

<h2>利用者の Dockerfile snippet</h2>

<pre><code># Debian / Ubuntu 系 (glibc) 推奨。Alpine / musl は未検証。
RUN apt-get update &amp;&amp; apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    &amp;&amp; rm -rf /var/lib/apt/lists/*

# 自分のアプリの package.json と一緒に node-pty を install
RUN npm install node-pty@^1
</code></pre>

<h2>非対応</h2>

<ul>
  <li>WebSocket upgrade / token route 自体の組み込みはフレームワーク依存なので利用者の Next.js / Express / Fastify ハンドラ側で組む</li>
  <li>Alpine (musl) / Windows ネイティブ環境 (cygwin 経由除く) は node-pty の制約により未サポート</li>
</ul>

</body>
</html>
