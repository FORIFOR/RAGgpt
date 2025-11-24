import fs from "fs";
import path from "path";
import crypto from "crypto";

export type StoredUser = {
  email: string;
  name: string;
  salt: string;
  hash: string;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const USERS_PATH = path.join(DATA_DIR, "auth-users.json");
const TOKEN_COOKIE = "rag_auth";
const DEFAULT_EXP_HOURS = 24;

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_PATH)) {
    fs.writeFileSync(USERS_PATH, "[]", "utf-8");
  }
}

export function loadUsers(): StoredUser[] {
  ensureStore();
  try {
    const raw = fs.readFileSync(USERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as StoredUser[];
  } catch {
    /* ignore */
  }
  return [];
}

export function saveUsers(users: StoredUser[]) {
  ensureStore();
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), "utf-8");
}

export function findUser(email: string): StoredUser | undefined {
  const users = loadUsers();
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function createUser(email: string, password: string, name: string): StoredUser {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  return { email, name, salt, hash };
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, user: StoredUser): boolean {
  const hashed = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(user.hash, "hex"));
}

type TokenPayload = { email: string; name: string; exp: number };

function getSecret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-secret";
}

export function signToken(payload: TokenPayload): string {
  const secret = getSecret();
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const secret = getSecret();
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as TokenPayload;
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildTokenCookie(user: { email: string; name: string }) {
  const exp = Date.now() + DEFAULT_EXP_HOURS * 60 * 60 * 1000;
  const token = signToken({ email: user.email, name: user.name, exp });
  return {
    name: TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DEFAULT_EXP_HOURS * 60 * 60,
  };
}

export function clearTokenCookie() {
  return {
    name: TOKEN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export function extractTokenFromCookie(cookies: { get: (name: string) => { value: string } | undefined }) {
  return cookies.get(TOKEN_COOKIE)?.value ?? null;
}
