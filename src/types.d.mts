// 型のみ宣言 (.mjs から JSDoc 経由で参照する)。

/** ws ライブラリの WebSocket 互換最小インターフェース。 */
export interface WsLike {
  readyState: number;
  readonly OPEN: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: Buffer | ArrayBuffer | Buffer[]) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
}

/** node-pty の IPty 互換最小インターフェース。 */
export interface PtyLike {
  onData(cb: (data: string) => void): void;
  onExit(cb: (info: { exitCode: number; signal?: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface AttachPtyOptions {
  /** 実行ファイル名 (PATH 解決される)。例: 'claude', 'bash'。 */
  command: string;
  args?: ReadonlyArray<string>;
  cwd?: string;
  /** 子プロセス env。process.env 継承したいなら呼び出し側で展開する。 */
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  label?: string;
}

export interface SpawnSuccess {
  ok: true;
  pty: PtyLike;
  detach(): void;
}
export interface SpawnFailure {
  ok: false;
  reason: 'spawn-error' | 'limit-exceeded';
  message: string;
}
export type AttachResult = SpawnSuccess | SpawnFailure;

export interface TokenStore {
  issue(): string;
  consume(token: string | null | undefined): boolean;
  purgeExpired(now?: number): void;
}

export interface TokenStoreOptions {
  ttlMs?: number;
  /** Next.js dev mode のような複数モジュールインスタンス環境で共有したい場合の globalThis キー。 */
  globalKey?: string;
}

export interface Allowlist {
  has(origin: string | null | undefined): boolean;
  values(): string[];
}

export interface SessionLimit {
  current(): number;
  readonly max: number;
  attachPty(ws: WsLike, opts: AttachPtyOptions): Promise<AttachResult>;
}

/** 親 env をどう取り込むかの戦略。 */
export type InheritEnvMode = 'all' | 'filtered' | 'none';

/**
 * 個別 env 値の指定方式。
 *
 * - string: リテラル値 (sensitive キーには使用不可)
 * - null  : unset (キーを結果から除外)
 * - { fromEnv } : processEnv[fromEnv] を参照。未定義なら unset
 * - { fromEnv, required: true } : 同上だが未定義ならエラー
 */
export type EnvValue =
  | string
  | null
  | { fromEnv: string; required?: boolean };

/** 子プロセスに渡す env の合成仕様。 */
export interface EnvSpec {
  inheritEnv?: InheritEnvMode;
  envAllowlist?: ReadonlyArray<string>;
  env?: Record<string, EnvValue>;
  envUnset?: ReadonlyArray<string>;
}
