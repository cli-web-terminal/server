export type {
  WsLike,
  PtyLike,
  AttachPtyOptions,
  AttachResult,
  SpawnSuccess,
  SpawnFailure,
  TokenStore,
  TokenStoreOptions,
  Allowlist,
  SessionLimit,
  InheritEnvMode,
  EnvValue,
  EnvSpec,
} from './types.d.mts';

import type { WsLike, AttachPtyOptions, AttachResult } from './types.d.mts';
import type { TokenStore, TokenStoreOptions } from './types.d.mts';
import type { Allowlist, SessionLimit } from './types.d.mts';
import type { EnvSpec } from './types.d.mts';

export function attachPty(ws: WsLike, opts: AttachPtyOptions): Promise<AttachResult>;
export function createTokenStore(opts?: TokenStoreOptions): TokenStore;
export function createAllowlist(origins: ReadonlyArray<string>): Allowlist;
export function createSessionLimit(max: number): SessionLimit;

export function resolveEnv(
  spec: EnvSpec,
  processEnv?: Record<string, string | undefined>,
): Record<string, string>;
export function validateEnvSpec(spec: unknown): void;
export function isSensitiveEnvKey(key: string): boolean;
export const DEFAULT_ENV_ALLOWLIST: ReadonlyArray<string>;
