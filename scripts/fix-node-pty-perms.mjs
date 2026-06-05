#!/usr/bin/env node
// node-pty の prebuilds 配下の spawn-helper に実行権限が無い状態で配布されてくることがあり、
// その場合 macOS では posix_spawnp が失敗して PTY が起こせない。すべての prebuilds 配下の
// spawn-helper に対して 0o755 を付け直す (Linux/Windows でも害はない)。
//
// 本 server パッケージ自身の postinstall として動かすことで、consumer 側で
// 何もしなくても npm install 後すぐに macOS で動く。
//
// このスクリプトは複数のレイアウトに対応する:
//   - consumer の hoisted node_modules: <scripts>/../../node-pty/prebuilds
//   - nested install (重複解決時):       <scripts>/../node_modules/node-pty/prebuilds
//   - monorepo root hoist (SoT 側):      <scripts>/../../../node_modules/node-pty/prebuilds

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  path.resolve(__dirname, '..', '..', 'node-pty', 'prebuilds'),
  path.resolve(__dirname, '..', 'node_modules', 'node-pty', 'prebuilds'),
  path.resolve(__dirname, '..', '..', '..', 'node_modules', 'node-pty', 'prebuilds'),
];

let touched = 0;
for (const root of candidates) {
  if (!fs.existsSync(root)) continue;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const helper = path.join(root, entry.name, 'spawn-helper');
    if (fs.existsSync(helper)) {
      try {
        fs.chmodSync(helper, 0o755);
        console.log(`[@cli-web-terminal/server] chmod 0o755 ${helper}`);
        touched += 1;
      } catch (e) {
        console.warn(
          `[@cli-web-terminal/server] chmod failed for ${helper}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
  }
}

if (touched === 0) {
  // node-pty が install されていない or 場所が違うレイアウト。
  // peerDependencies で optional なので、これ自体はエラーにしない。
  console.log('[@cli-web-terminal/server] node-pty prebuilds not found (ok: optional peer)');
}
