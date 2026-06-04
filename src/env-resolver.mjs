// 子プロセスに渡す env の合成ロジック。
//
// 入力 (EnvSpec):
//   {
//     inheritEnv: 'all' | 'filtered' | 'none',
//     envAllowlist: string[],     // inheritEnv='filtered' のときのみ参照
//     env: { [key: string]: EnvValue },
//     envUnset: string[],
//   }
//
// EnvValue = string | null | { fromEnv: string, required?: boolean }
//   - string: リテラル値
//   - null  : unset (キーを結果から除外)
//   - { fromEnv } : processEnv[fromEnv] を参照。未定義なら unset (required=true ならエラー)
//
// 出力: { [key: string]: string }  (claude プロセスに渡す env)
//
// 設計根拠: docs/terminal-config-design.html §4

const DEFAULT_ALLOWLIST = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  'TERM', 'SHELL', 'TZ', 'TMPDIR',
]);

// sensitive キー判定: 名前にこれらの語を含むと「秘密情報」扱い。
// 直書き string は禁止し、{ fromEnv } または null のみ許可する。
const SENSITIVE_NAME_PATTERNS = [
  /KEY$/i, /_KEY$/i, /KEYS$/i,
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i, /PASSWD/i,
  /CREDENTIAL/i,
];

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isSensitiveEnvKey(key) {
  if (typeof key !== 'string') return false;
  return SENSITIVE_NAME_PATTERNS.some((re) => re.test(key));
}

/**
 * EnvSpec 全体のバリデーション。型不正・sensitive 直書き等を見つけたら throw。
 *
 * @param {unknown} spec
 * @returns {void}
 */
export function validateEnvSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new TypeError('EnvSpec must be an object');
  }
  const s = /** @type {Record<string, unknown>} */ (spec);

  if (s.inheritEnv !== undefined) {
    if (s.inheritEnv !== 'all' && s.inheritEnv !== 'filtered' && s.inheritEnv !== 'none') {
      throw new TypeError(`inheritEnv must be 'all' | 'filtered' | 'none', got: ${String(s.inheritEnv)}`);
    }
  }
  if (s.envAllowlist !== undefined) {
    if (!Array.isArray(s.envAllowlist) || !s.envAllowlist.every((x) => typeof x === 'string')) {
      throw new TypeError('envAllowlist must be string[]');
    }
  }
  if (s.envUnset !== undefined) {
    if (!Array.isArray(s.envUnset) || !s.envUnset.every((x) => typeof x === 'string')) {
      throw new TypeError('envUnset must be string[]');
    }
  }
  if (s.env !== undefined) {
    if (!s.env || typeof s.env !== 'object' || Array.isArray(s.env)) {
      throw new TypeError('env must be an object');
    }
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (s.env))) {
      validateEnvValue(k, v);
    }
  }
}

/**
 * 個別 env 値のバリデーション。sensitive キーへの string 直書きを拒否する。
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {void}
 */
function validateEnvValue(key, value) {
  if (value === null) return;
  if (typeof value === 'string') {
    if (isSensitiveEnvKey(key)) {
      throw new Error(
        `env.${key}: sensitive key cannot have a literal string value. ` +
        `Use { fromEnv: "ENV_VAR_NAME" } or null instead.`
      );
    }
    return;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = /** @type {Record<string, unknown>} */ (value);
    if (typeof v.fromEnv !== 'string' || v.fromEnv.length === 0) {
      throw new TypeError(`env.${key}: fromEnv must be a non-empty string`);
    }
    if (v.required !== undefined && typeof v.required !== 'boolean') {
      throw new TypeError(`env.${key}: required must be boolean`);
    }
    // unknown extra keys は無視 (forward-compat)
    return;
  }
  throw new TypeError(
    `env.${key}: value must be string | null | { fromEnv: string, required?: boolean }`
  );
}

/**
 * EnvSpec を実際の Record<string, string> に解決する。
 *
 * @param {object} spec
 * @param {'all'|'filtered'|'none'} [spec.inheritEnv]
 * @param {ReadonlyArray<string>} [spec.envAllowlist]
 * @param {Record<string, string | null | { fromEnv: string, required?: boolean }>} [spec.env]
 * @param {ReadonlyArray<string>} [spec.envUnset]
 * @param {Record<string, string | undefined>} [processEnv] 親 env。省略時は process.env
 * @returns {Record<string, string>}
 */
export function resolveEnv(spec, processEnv) {
  validateEnvSpec(spec);
  const parent = processEnv ?? /** @type {Record<string,string|undefined>} */ (process.env);
  const inherit = spec.inheritEnv ?? 'filtered';
  const allowlist = spec.envAllowlist ?? DEFAULT_ALLOWLIST;
  /** @type {Record<string, string>} */
  const out = {};

  // Step 1: 親 env の取り込み
  if (inherit === 'all') {
    for (const [k, v] of Object.entries(parent)) {
      if (typeof v === 'string') out[k] = v;
    }
  } else if (inherit === 'filtered') {
    for (const k of allowlist) {
      const v = parent[k];
      if (typeof v === 'string') out[k] = v;
    }
  }
  // 'none' は何もしない

  // Step 2: spec.env をマージ
  const envSpec = spec.env ?? {};
  for (const [k, v] of Object.entries(envSpec)) {
    if (v === null) {
      delete out[k];
      continue;
    }
    if (typeof v === 'string') {
      out[k] = v;
      continue;
    }
    // { fromEnv, required? }
    const ref = /** @type {{ fromEnv: string, required?: boolean }} */ (v);
    const refVal = parent[ref.fromEnv];
    if (typeof refVal === 'string' && refVal.length > 0) {
      out[k] = refVal;
    } else {
      if (ref.required) {
        throw new Error(
          `env.${k}: required value from process.env.${ref.fromEnv} is not set`
        );
      }
      delete out[k];
    }
  }

  // Step 3: envUnset を適用
  for (const k of spec.envUnset ?? []) {
    delete out[k];
  }

  return out;
}

export const DEFAULT_ENV_ALLOWLIST = DEFAULT_ALLOWLIST;
