const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");

const root = __dirname;
const port = Number(process.env.PORT || 5000);
const SESSION_DAYS = 14;
const loginAttempts = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > 100_000) req.destroy();
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function validUsername(value) {
  return typeof value === "string" && /^[a-z0-9_]{3,24}$/i.test(value);
}

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPassword(value) {
  return typeof value === "string" && value.length >= 10;
}

function getCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(part => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }));
}

async function currentUser(req) {
  const rawToken = getCookies(req).genesis_session;
  if (!rawToken) return null;
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.username, u.email, u.role, u.status, u.created_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.status = 'ACTIVE'`,
    [tokenHash(rawToken)]
  );
  return result.rows[0] || null;
}

async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: "Authentication required." });
    return null;
  }
  return user;
}

async function createSession(userId, res) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))",
    [userId, tokenHash(rawToken), SESSION_DAYS]
  );
  setCookie(res, "genesis_session", encodeURIComponent(rawToken), { maxAge: SESSION_DAYS * 86400 });
}

function clearSession(res) {
  setCookie(res, "genesis_session", "", { maxAge: 0 });
}

async function authSignup(req, res) {
  const body = await readBody(req);
  const fullName = String(body.fullName || "").trim();
  const username = String(body.username || "").trim().toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const password = body.password;
  if (fullName.length < 2 || fullName.length > 80) return json(res, 400, { error: "Enter your full name." });
  if (!validUsername(username)) return json(res, 400, { error: "Username must be 3–24 letters, numbers, or underscores." });
  if (!validEmail(email)) return json(res, 400, { error: "Enter a valid email address." });
  if (!validPassword(password)) return json(res, 400, { error: "Password must be at least 10 characters." });
  if (body.confirmPassword !== password) return json(res, 400, { error: "Passwords do not match." });
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO users (full_name, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, full_name, username, email, role, created_at",
      [fullName, username, email, passwordHash]
    );
    const user = inserted.rows[0];
    const wallet = await client.query("INSERT INTO wallets (user_id) VALUES ($1) RETURNING id", [user.id]);
    await client.query(
      "INSERT INTO wallet_balances (wallet_id, asset_id) SELECT $1, id FROM assets WHERE enabled = TRUE",
      [wallet.rows[0].id]
    );
    await client.query("COMMIT");
    await createSession(user.id, res);
    json(res, 201, { user });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") return json(res, 409, { error: "That username or email is already in use." });
    throw error;
  } finally {
    client.release();
  }
}

async function authLogin(req, res) {
  const body = await readBody(req);
  const identifier = String(body.identifier || "").trim().toLowerCase();
  const ip = req.socket.remoteAddress || "unknown";
  const attempt = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 900_000 };
  if (Date.now() > attempt.resetAt) { attempt.count = 0; attempt.resetAt = Date.now() + 900_000; }
  if (attempt.count >= 10) return json(res, 429, { error: "Too many attempts. Try again later." });
  const result = await pool.query(
    "SELECT id, full_name, username, email, password_hash, role, created_at FROM users WHERE email = $1 OR username = $1",
    [identifier]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(String(body.password || ""), user.password_hash))) {
    attempt.count += 1; loginAttempts.set(ip, attempt);
    return json(res, 401, { error: "The login details are not correct." });
  }
  loginAttempts.delete(ip);
  delete user.password_hash;
  await createSession(user.id, res);
  json(res, 200, { user });
}

async function configApi(res) {
  const [assets, products, token, pairs] = await Promise.all([
    pool.query("SELECT id, name, symbol, icon_url, decimals, enabled, deposit_enabled, withdrawal_enabled, investment_enabled, conversion_enabled FROM assets WHERE enabled = TRUE ORDER BY CASE WHEN symbol = 'G' THEN 0 ELSE 1 END, name"),
    pool.query("SELECT p.id, p.name, a.symbol AS asset, p.minimum_amount, p.maximum_amount, p.reward_rate, p.rate_unit, p.duration_terms, p.fee_rate, p.status, p.risk_terms FROM investment_products p JOIN assets a ON a.id = p.asset_id WHERE p.status = 'ACTIVE' ORDER BY p.created_at"),
    pool.query("SELECT value FROM platform_settings WHERE key = 'genesis_token'"),
    pool.query("SELECT value FROM platform_settings WHERE key = 'conversion_pairs'")
  ]);
  json(res, 200, {
    assets: assets.rows,
    products: products.rows,
    genesis: token.rows[0]?.value || null,
    conversions: pairs.rows[0]?.value || { pairs: [] }
  });
}

async function walletApi(req, res, user) {
  const result = await pool.query(
    `SELECT a.name, a.symbol, a.icon_url, a.decimals, COALESCE(wb.amount, 0) AS amount
     FROM assets a LEFT JOIN wallets w ON w.user_id = $1
     LEFT JOIN wallet_balances wb ON wb.wallet_id = w.id AND wb.asset_id = a.id
     WHERE a.enabled = TRUE ORDER BY CASE WHEN a.symbol = 'G' THEN 0 ELSE 1 END, a.name`,
    [user.id]
  );
  json(res, 200, { assets: result.rows });
}

async function portfolioApi(req, res, user) {
  const investments = await pool.query(
    `SELECT i.id, a.symbol AS asset, i.principal, i.started_at, i.status, p.reward_rate, p.rate_unit, p.name
     FROM investments i JOIN investment_products p ON p.id = i.product_id
     JOIN assets a ON a.id = p.asset_id WHERE i.user_id = $1 ORDER BY i.created_at DESC`,
    [user.id]
  );
  const rewards = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total_generated,
      COALESCE(SUM(amount) FILTER (WHERE accrued_at >= CURRENT_DATE), 0) AS today_generated
     FROM g_rewards WHERE user_id = $1`,
    [user.id]
  );
  json(res, 200, { investments: investments.rows, rewards: rewards.rows[0] });
}

async function userApi(req, res, user) {
  json(res, 200, { user });
}

async function api(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/config") return configApi(res);
  if (req.method === "GET" && pathname === "/api/session") return json(res, 200, { user: await currentUser(req) });
  if (req.method === "POST" && pathname === "/api/auth/signup") return authSignup(req, res);
  if (req.method === "POST" && pathname === "/api/auth/login") return authLogin(req, res);
  if (req.method === "POST" && pathname === "/api/auth/logout") { clearSession(res); return json(res, 200, { ok: true }); }
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method === "GET" && pathname === "/api/me") return userApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/wallet") return walletApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/portfolio") return portfolioApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/admin") {
    if (user.role !== "ADMIN") return json(res, 403, { error: "Admin authorization required." });
    return json(res, 200, { authorized: true });
  }
  json(res, 404, { error: "API route not found." });
}

async function requestHandler(req, res) {
  try {
    const pathname = decodeURIComponent((req.url || "/").split("?")[0]);
    if (pathname.startsWith("/api/")) return await api(req, res, pathname);
    const file = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = path.join(root, file);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.message === "Invalid JSON body" ? 400 : 500, { error: "The server could not complete that request." });
  }
}

const server = http.createServer(requestHandler);
server.listen(port, "0.0.0.0", () => console.log(`Genesis preview running on port ${port}`));