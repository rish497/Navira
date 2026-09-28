import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const authLocation = () => {
  const directory = path.resolve(process.env.NAVIRA_AUTH_DATA_DIR || '.navira-data');
  return { directory, file: path.join(directory, 'auth.json') };
};
const SESSION_COOKIE = 'navira_session';
const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;
const EMPTY_STORE = { users: [], sessions: [], updatedAt: null };
const attempts = new Map();
let storePromise;
let mutationQueue = Promise.resolve();

export class AuthError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

function cleanText(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('Enter a valid email address');
  return email;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 12) throw new AuthError('Password must contain at least 12 characters');
  if (password.length > 200) throw new AuthError('Password is too long');
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new AuthError('Password must include uppercase, lowercase, and numeric characters');
  }
  return password;
}

function scryptHash(password, salt) {
  const pepper = process.env.NAVIRA_AUTH_PEPPER || '';
  return new Promise((resolve, reject) => {
    scrypt(`${password}${pepper}`, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key.toString('hex'));
    });
  });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqualText(left, right) {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization || null,
    createdAt: user.createdAt,
  };
}

async function loadStore() {
  if (!storePromise) {
    storePromise = readFile(authLocation().file, 'utf8').then((value) => {
      const parsed = JSON.parse(value);
      return { ...EMPTY_STORE, ...parsed, users: parsed.users || [], sessions: parsed.sessions || [] };
    }).catch((error) => {
      if (error.code === 'ENOENT') return { ...EMPTY_STORE, users: [], sessions: [] };
      throw error;
    });
  }
  return storePromise;
}

async function persistStore(store) {
  store.updatedAt = new Date().toISOString();
  const { directory, file } = authLocation();
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${file}.${process.pid}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, file);
}

function mutateStore(operation) {
  const run = mutationQueue.then(async () => {
    const store = await loadStore();
    const result = await operation(store);
    await persistStore(store);
    return result;
  });
  mutationQueue = run.catch(() => undefined);
  return run;
}

function parseCookies(request) {
  return String(request.headers.cookie || '').split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name) cookies[name] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function sessionCookie(request, token, maxAge = SESSION_AGE_SECONDS) {
  const forwarded = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = forwarded === 'https' || request.socket?.encrypted;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function requestAddress(request) {
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || 'unknown';
}

function assertRateLimit(request, email) {
  const now = Date.now();
  const key = `${requestAddress(request)}:${email}`;
  const current = attempts.get(key);
  if (!current || now - current.startedAt > 15 * 60 * 1000) {
    attempts.set(key, { count: 1, startedAt: now });
    return key;
  }
  if (current.count >= 8) throw new AuthError('Too many sign-in attempts. Try again in 15 minutes.', 429);
  current.count += 1;
  return key;
}

function assertSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host !== request.headers.host) throw new Error('mismatch');
  } catch {
    throw new AuthError('Cross-origin authentication request rejected', 403);
  }
}

async function createSession(store, user, request) {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  store.sessions = store.sessions.filter((session) => new Date(session.expiresAt).getTime() > now && session.userId !== user.id);
  store.sessions.push({
    tokenHash: sha256(token),
    userId: user.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_AGE_SECONDS * 1000).toISOString(),
    addressHash: sha256(requestAddress(request)),
  });
  return token;
}

export async function registerAccount(request, payload) {
  assertSameOrigin(request);
  const role = payload.role === 'operator' ? 'operator' : 'civilian';
  const email = normalizeEmail(payload.email);
  const password = validatePassword(payload.password);
  const name = cleanText(payload.name);
  if (name.length < 2) throw new AuthError('Enter your full name');
  const organization = role === 'operator' ? cleanText(payload.organization) : null;
  if (role === 'operator') {
    if (organization.length < 2) throw new AuthError('Enter your government organization');
  }
  const result = await mutateStore(async (store) => {
    if (store.users.some((user) => user.email === email)) throw new AuthError('An account already exists for this email', 409);
    const salt = randomBytes(24).toString('base64url');
    const user = {
      id: randomUUID(), name, email, role, organization,
      passwordSalt: salt,
      passwordHash: await scryptHash(password, salt),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    store.users.push(user);
    const token = await createSession(store, user, request);
    return { profile: publicUser(user), token };
  });
  return { profile: result.profile, cookie: sessionCookie(request, result.token) };
}

export async function loginAccount(request, payload) {
  assertSameOrigin(request);
  const email = normalizeEmail(payload.email);
  const rateKey = assertRateLimit(request, email);
  const role = payload.role === 'operator' ? 'operator' : 'civilian';
  const password = String(payload.password || '');
  const result = await mutateStore(async (store) => {
    const user = store.users.find((candidate) => candidate.email === email);
    const candidateHash = user ? await scryptHash(password, user.passwordSalt) : await scryptHash(password, 'navira-invalid-account');
    const validPassword = user && safeEqualText(candidateHash, user.passwordHash);
    if (!validPassword || user.role !== role) throw new AuthError('Email, password, or selected workspace is incorrect', 401);
    const token = await createSession(store, user, request);
    return { profile: publicUser(user), token };
  });
  attempts.delete(rateKey);
  return { profile: result.profile, cookie: sessionCookie(request, result.token) };
}

export async function authenticateRequest(request) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;
  const store = await loadStore();
  const tokenHash = sha256(token);
  const now = Date.now();
  const session = store.sessions.find((candidate) => safeEqualText(candidate.tokenHash, tokenHash) && new Date(candidate.expiresAt).getTime() > now);
  if (!session) return null;
  return publicUser(store.users.find((user) => user.id === session.userId));
}

export async function requireRequestActor(request, requiredRole = null) {
  const profile = await authenticateRequest(request);
  if (!profile) throw new AuthError('Sign in is required', 401);
  if (requiredRole && profile.role !== requiredRole) throw new AuthError(`${requiredRole === 'operator' ? 'Operator' : 'Civilian'} access is required`, 403);
  request.naviraActor = profile;
  return profile;
}

export async function logoutAccount(request) {
  assertSameOrigin(request);
  const token = parseCookies(request)[SESSION_COOKIE];
  if (token) {
    const tokenHash = sha256(token);
    await mutateStore(async (store) => {
      store.sessions = store.sessions.filter((session) => !safeEqualText(session.tokenHash, tokenHash));
    });
  }
  return { cookie: sessionCookie(request, '', 0) };
}

