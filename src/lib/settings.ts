import { sql, type Db } from "./db";
import { decrypt, encrypt, mask } from "./crypto";

export type SsoConfig = {
  providerId: string;
  providerName: string;
  authorizeUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  fieldUid: string;
  fieldUsername: string;
  fieldName: string;
  fieldAvatar: string;
};

export type AiConfig = { providerName: string; baseUrl: string; apiKey: string; model: string };

const env = (k: string, d = "") => process.env[k] ?? d;

async function getSetting<T>(key: string, db: Db = sql): Promise<Partial<T> | null> {
  const [row] = await db<{ value: Partial<T> }[]>`SELECT value FROM site_settings WHERE key = ${key}`;
  return row?.value ?? null;
}

export async function getSsoConfig(db: Db = sql): Promise<SsoConfig> {
  const s = (await getSetting<SsoConfig & { clientSecretEnc?: string }>("sso", db)) ?? {};
  const secret = s.clientSecretEnc ? decrypt(s.clientSecretEnc) : env("SSO_CLIENT_SECRET");
  return {
    providerId: s.providerId || env("SSO_PROVIDER_ID", "inf"),
    providerName: s.providerName || env("SSO_PROVIDER_NAME", "Inf Network 通行证"),
    authorizeUrl: s.authorizeUrl || env("SSO_AUTHORIZE_URL"),
    tokenUrl: s.tokenUrl || env("SSO_TOKEN_URL"),
    userinfoUrl: s.userinfoUrl || env("SSO_USERINFO_URL"),
    clientId: s.clientId || env("SSO_CLIENT_ID"),
    clientSecret: secret,
    scope: s.scope ?? env("SSO_SCOPE", "profile"),
    fieldUid: s.fieldUid || env("SSO_FIELD_UID", "sub"),
    fieldUsername: s.fieldUsername || env("SSO_FIELD_USERNAME", "username"),
    fieldName: s.fieldName || env("SSO_FIELD_NAME", "name"),
    fieldAvatar: s.fieldAvatar || env("SSO_FIELD_AVATAR", "avatar"),
  };
}

export async function saveSsoConfig(db: Db, userId: number, input: Omit<SsoConfig, "clientSecret"> & { clientSecret?: string }) {
  const prev = (await getSetting<{ clientSecretEnc?: string }>("sso", db)) ?? {};
  const { clientSecret, ...rest } = input;
  const value = { ...rest, clientSecretEnc: clientSecret ? encrypt(clientSecret) : prev.clientSecretEnc };
  await db`INSERT INTO site_settings (key, value, updated_by) VALUES ('sso', ${db.json(value)}, ${userId})
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
}

export async function getAiConfig(db: Db = sql): Promise<AiConfig> {
  const s = (await getSetting<AiConfig & { apiKeyEnc?: string }>("ai", db)) ?? {};
  return {
    providerName: s.providerName || env("AI_PROVIDER_NAME", "DeepSeek"),
    baseUrl: (s.baseUrl || env("AI_BASE_URL", "https://api.deepseek.com")).replace(/\/+$/, ""),
    apiKey: s.apiKeyEnc ? decrypt(s.apiKeyEnc) : env("AI_API_KEY"),
    model: s.model || env("AI_MODEL", "deepseek-chat"),
  };
}

export async function publicAiConfig(db: Db = sql) {
  const c = await getAiConfig(db);
  return { providerName: c.providerName, baseUrl: c.baseUrl, model: c.model, hasKey: !!c.apiKey, keyMasked: c.apiKey ? mask(c.apiKey) : "" };
}

export async function saveAiConfig(db: Db, userId: number, input: { providerName: string; baseUrl: string; model: string; apiKey?: string }) {
  const prev = (await getSetting<{ apiKeyEnc?: string }>("ai", db)) ?? {};
  const value = {
    providerName: input.providerName,
    baseUrl: input.baseUrl,
    model: input.model,
    apiKeyEnc: input.apiKey ? encrypt(input.apiKey) : prev.apiKeyEnc,
  };
  await db`INSERT INTO site_settings (key, value, updated_by) VALUES ('ai', ${db.json(value)}, ${userId})
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
}

export const appUrl = () => (process.env.APP_URL || "http://localhost:3100").replace(/\/+$/, "");
