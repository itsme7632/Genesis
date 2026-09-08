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

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

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
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new ApiError(400, "Invalid JSON body.")); }
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

function decimalInput(value, label = "Amount") {
  const normalized = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(normalized)) {
    throw new ApiError(400, `${label} must be a valid positive decimal.`);
  }
  if (normalized === "0" || /^0\.0+$/.test(normalized)) {
    throw new ApiError(400, `${label} must be greater than zero.`);
  }
  return normalized;
}

function decimalPlaces(value) {
  const [, fraction = ""] = String(value).split(".");
  return fraction.length;
}

function frequencySeconds(value) {
  return { DAILY: 86400, WEEKLY: 604800, MONTHLY: 2592000 }[value] || null;
}

async function currentUser(req) {
  const rawToken = getCookies(req).genesis_session;
  if (!rawToken) return null;
  const result = await pool.query(
    `SELECT u.id, u.full_name, u.username, u.email, u.role, u.account_type, u.status, u.created_at
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

function requireAdmin(user) {
  if (user.role !== "ADMIN") throw new ApiError(403, "Admin authorization required.");
}

function requireDevelopmentEnvironment() {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
    throw new ApiError(404, "Development testing is unavailable in this environment.");
  }
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
  if (fullName.length < 2 || fullName.length > 80) throw new ApiError(400, "Enter your full name.");
  if (!validUsername(username)) throw new ApiError(400, "Username must be 3–24 letters, numbers, or underscores.");
  if (!validEmail(email)) throw new ApiError(400, "Enter a valid email address.");
  if (!validPassword(password)) throw new ApiError(400, "Password must be at least 10 characters.");
  if (body.confirmPassword !== password) throw new ApiError(400, "Passwords do not match.");
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      "INSERT INTO users (full_name, username, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, full_name, username, email, role, account_type, created_at",
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
    if (error.code === "23505") throw new ApiError(409, "That username or email is already in use.");
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
  if (attempt.count >= 10) throw new ApiError(429, "Too many attempts. Try again later.");
  const result = await pool.query(
    "SELECT id, full_name, username, email, password_hash, role, account_type, created_at FROM users WHERE email = $1 OR username = $1",
    [identifier]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(String(body.password || ""), user.password_hash))) {
    attempt.count += 1; loginAttempts.set(ip, attempt);
    throw new ApiError(401, "The login details are not correct.");
  }
  loginAttempts.delete(ip);
  delete user.password_hash;
  await createSession(user.id, res);
  json(res, 200, { user });
}

async function setting(key, client = pool) {
  const result = await client.query("SELECT value FROM platform_settings WHERE key = $1", [key]);
  return result.rows[0]?.value || null;
}

async function enabledConfig() {
  const [assets, products, token, pairs] = await Promise.all([
    pool.query(
      `SELECT id, name, symbol, icon_url, decimals, enabled, deposit_enabled, withdrawal_enabled,
              investment_enabled, conversion_enabled
       FROM assets WHERE enabled = TRUE
       ORDER BY CASE WHEN symbol = 'G' THEN 0 ELSE 1 END, name`
    ),
    pool.query(
      `SELECT p.id, p.name, p.asset_id, a.symbol AS asset, p.minimum_amount, p.maximum_amount,
              p.reward_rate, p.rate_unit, p.reward_frequency, p.duration_days, p.duration_terms,
              p.fee_rate, p.status, p.risk_terms
       FROM investment_products p JOIN assets a ON a.id = p.asset_id
       WHERE p.status = 'ACTIVE' AND a.enabled = TRUE AND a.investment_enabled = TRUE
       ORDER BY p.created_at`
    ),
    setting("genesis_token"),
    setting("conversion_pairs")
  ]);
  return {
    assets: assets.rows,
    products: products.rows,
    genesis: token || null,
    conversions: pairs || { pairs: [] }
  };
}

async function configApi(res) {
  json(res, 200, await enabledConfig());
}

async function ensureAccrualWallet(client, userId) {
  const result = await client.query(
    `SELECT w.id AS wallet_id, a.id AS asset_id, a.symbol
     FROM wallets w CROSS JOIN assets a
     WHERE w.user_id = $1 AND a.symbol = 'G'
     FOR UPDATE`,
    [userId]
  );
  if (!result.rows[0]) throw new ApiError(409, "Your Genesis wallet is not configured.");
  return result.rows[0];
}

async function accrueRewards(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gWallet = await ensureAccrualWallet(client, userId);
    const genesis = await setting("genesis_token", client);
    const gPrice = String(genesis?.referencePrice || "");
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(gPrice) || Number(gPrice) <= 0) {
      await client.query("COMMIT");
      return { accounted: 0 };
    }

    const investments = await client.query(
      `SELECT i.id, i.user_id, i.principal, i.started_at, i.end_at,
              p.reward_rate, p.reward_frequency, p.rate_unit
       FROM investments i JOIN investment_products p ON p.id = i.product_id
       WHERE i.user_id = $1 AND i.status = 'ACTIVE'
       FOR UPDATE`,
      [userId]
    );
    let accounted = 0;
    for (const investment of investments.rows) {
      const seconds = frequencySeconds(investment.reward_frequency || investment.rate_unit);
      if (!seconds) continue;
      const inserted = await client.query(
        `WITH investment AS (
           SELECT $1::uuid AS id, $2::uuid AS user_id, $3::numeric AS principal,
                  $4::numeric AS reward_rate, $5::numeric AS g_price,
                  $6::timestamptz AS started_at, $7::timestamptz AS end_at
         ),
         periods AS (
           SELECT gs AS period_index,
                  i.started_at + (gs * $8::numeric) * interval '1 second' AS period_start,
                  i.started_at + ((gs + 1) * $8::numeric) * interval '1 second' AS period_end
           FROM investment i
           CROSS JOIN LATERAL generate_series(
             0,
             GREATEST(
               FLOOR(EXTRACT(EPOCH FROM (LEAST(NOW(), COALESCE(i.end_at, NOW())) - i.started_at)) / $8::numeric)::integer - 1,
               -1
             ),
             1
           ) gs
         )
         INSERT INTO g_rewards (
           user_id, investment_id, amount, reward_value, reference_rate, g_price_used,
           period_key, calculation_start, calculation_end, source, status
         )
         SELECT i.user_id, i.id,
                (i.principal * i.reward_rate / 100) / i.g_price,
                i.principal * i.reward_rate / 100,
                i.reward_rate,
                i.g_price,
                to_char(p.period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
                p.period_start,
                p.period_end,
                'ELAPSED_TIME',
                'ACCOUNTED'
         FROM periods p CROSS JOIN investment i
         ON CONFLICT (investment_id, period_key) DO NOTHING
         RETURNING id, user_id, investment_id, amount, reward_value, g_price_used, period_key,
                   calculation_start, calculation_end`,
        [
          investment.id,
          investment.user_id,
          investment.principal,
          investment.reward_rate,
          gPrice,
          investment.started_at,
          investment.end_at,
          seconds
        ]
      );
      for (const reward of inserted.rows) {
        const transaction = await client.query(
          `INSERT INTO transactions
             (user_id, asset_id, type, amount, reference_id, status, metadata)
           VALUES ($1, $2, 'G_REWARD', $3, $4, 'COMPLETED', $5::jsonb)
           RETURNING id`,
          [
            userId,
            gWallet.asset_id,
            reward.amount,
            reward.id,
            JSON.stringify({
              investmentId: reward.investment_id,
              rewardValue: reward.reward_value,
              gPriceUsed: reward.g_price_used,
              periodKey: reward.period_key,
              source: "ELAPSED_TIME"
            })
          ]
        );
        await client.query(
          "UPDATE g_rewards SET transaction_id = $1 WHERE id = $2",
          [transaction.rows[0].id, reward.id]
        );
        await client.query(
          `INSERT INTO g_generation_events
             (user_id, investment_id, amount, calculation_start, calculation_end, reward_id, period_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (investment_id, period_key) DO NOTHING`,
          [
            userId,
            reward.investment_id,
            reward.amount,
            reward.calculation_start,
            reward.calculation_end,
            reward.id,
            reward.period_key
          ]
        );
        await client.query(
          "UPDATE wallet_balances SET amount = amount + $1, updated_at = NOW() WHERE wallet_id = $2 AND asset_id = $3",
          [reward.amount, gWallet.wallet_id, gWallet.asset_id]
        );
        await client.query(
          `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
           VALUES ($1, 'REWARD_GENERATED', 'G_REWARD', $2, $3::jsonb)`,
          [userId, reward.id, JSON.stringify({ investmentId: reward.investment_id, amount: reward.amount, periodKey: reward.period_key })]
        );
        accounted += 1;
      }

      if (investment.end_at) {
        const completed = await client.query(
          `UPDATE investments
           SET status = 'COMPLETED', completed_at = COALESCE(completed_at, NOW())
           WHERE id = $1 AND status = 'ACTIVE' AND end_at <= NOW()
           RETURNING id, principal, product_id`,
          [investment.id]
        );
        if (completed.rows[0]) {
          const product = await client.query("SELECT asset_id FROM investment_products WHERE id = $1", [investment.product_id]);
          await client.query(
            `UPDATE wallet_balances
             SET amount = amount + $1, invested_amount = GREATEST(invested_amount - $1, 0), updated_at = NOW()
             WHERE wallet_id = (SELECT id FROM wallets WHERE user_id = $2) AND asset_id = $3`,
            [completed.rows[0].principal, userId, product.rows[0].asset_id]
          );
          await client.query(
            `INSERT INTO transactions (user_id, asset_id, type, amount, reference_id, status, metadata)
             VALUES ($1, $2, 'INVESTMENT', $3, $4, 'COMPLETED', $5::jsonb)`,
            [userId, product.rows[0].asset_id, completed.rows[0].principal, completed.rows[0].id, JSON.stringify({ subtype: "PRINCIPAL_RETURN" })]
          );
          await client.query(
            `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
             VALUES ($1, 'INVESTMENT_COMPLETED', 'INVESTMENT', $2, $3::jsonb)`,
            [userId, completed.rows[0].id, JSON.stringify({ principalReturned: completed.rows[0].principal })]
          );
        }
      }
    }
    await client.query("COMMIT");
    return { accounted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function walletApi(req, res, user) {
  await accrueRewards(user.id);
  const result = await pool.query(
    `SELECT a.id, a.name, a.symbol, a.icon_url, a.decimals,
            COALESCE(wb.amount, 0) AS amount,
            COALESCE(wb.invested_amount, 0) AS invested_amount
     FROM assets a LEFT JOIN wallets w ON w.user_id = $1
     LEFT JOIN wallet_balances wb ON wb.wallet_id = w.id AND wb.asset_id = a.id
     WHERE a.enabled = TRUE
     ORDER BY CASE WHEN a.symbol = 'G' THEN 0 ELSE 1 END, a.name`,
    [user.id]
  );
  json(res, 200, { assets: result.rows });
}

async function investmentRows(userId, investmentId = null) {
  const values = [userId];
  let filter = "";
  if (investmentId) {
    values.push(investmentId);
    filter = "AND i.id = $2";
  }
  const result = await pool.query(
    `SELECT i.id, i.product_id, i.principal, i.status, i.started_at, i.end_at, i.completed_at,
            p.name, p.duration_terms, p.risk_terms, p.fee_rate, p.reward_rate,
            p.reward_frequency, p.rate_unit, a.id AS asset_id, a.name AS asset_name, a.symbol AS asset,
            COALESCE(SUM(r.amount), 0) AS g_generated,
            COALESCE(SUM(r.reward_value), 0) AS reward_value
     FROM investments i
     JOIN investment_products p ON p.id = i.product_id
     JOIN assets a ON a.id = p.asset_id
     LEFT JOIN g_rewards r ON r.investment_id = i.id AND r.status = 'ACCOUNTED'
     WHERE i.user_id = $1 ${filter}
     GROUP BY i.id, p.id, a.id
     ORDER BY i.created_at DESC`,
    values
  );
  return result.rows;
}

async function portfolioApi(req, res, user) {
  await accrueRewards(user.id);
  const [investments, rewards, wallet, genesis, generation] = await Promise.all([
    investmentRows(user.id),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_generated,
              COALESCE(SUM(amount) FILTER (WHERE accrued_at >= CURRENT_DATE), 0) AS today_generated,
              COALESCE(SUM(reward_value), 0) AS total_reward_value
       FROM g_rewards WHERE user_id = $1 AND status = 'ACCOUNTED'`,
      [user.id]
    ),
    pool.query(
      `SELECT COALESCE(wb.amount, 0) AS g_balance
       FROM wallets w JOIN wallet_balances wb ON wb.wallet_id = w.id
       JOIN assets a ON a.id = wb.asset_id
       WHERE w.user_id = $1 AND a.symbol = 'G'`,
      [user.id]
    ),
    setting("genesis_token"),
    pool.query(
      `SELECT r.id, r.investment_id, r.amount, r.reward_value, r.g_price_used,
              r.period_key, r.calculation_start, r.calculation_end, r.accrued_at,
              a.symbol AS asset
       FROM g_rewards r JOIN investments i ON i.id = r.investment_id
       JOIN investment_products p ON p.id = i.product_id
       JOIN assets a ON a.id = p.asset_id
       WHERE r.user_id = $1 AND r.status = 'ACCOUNTED'
       ORDER BY r.accrued_at DESC LIMIT 100`,
      [user.id]
    )
  ]);
  const gBalance = wallet.rows[0]?.g_balance || "0";
  const referencePrice = String(genesis?.referencePrice || "0");
  json(res, 200, {
    investments,
    rewards: rewards.rows[0] || { total_generated: "0", today_generated: "0", total_reward_value: "0" },
    generation: generation.rows,
    gBalance,
    gEstimatedValue: Number(referencePrice) > 0 ? (Number(gBalance) * Number(referencePrice)).toFixed(8) : "0",
    genesis
  });
}

async function investmentsApi(req, res, user) {
  const rows = await investmentRows(user.id);
  json(res, 200, { investments: rows });
}

async function investmentDetailApi(req, res, user, investmentId) {
  const rows = await investmentRows(user.id, investmentId);
  if (!rows[0]) throw new ApiError(404, "Investment not found.");
  const rewards = await pool.query(
    `SELECT id, amount, reward_value, g_price_used, period_key, calculation_start, calculation_end, accrued_at
     FROM g_rewards WHERE user_id = $1 AND investment_id = $2 ORDER BY accrued_at DESC`,
    [user.id, investmentId]
  );
  json(res, 200, { investment: rows[0], rewards: rewards.rows });
}

async function createInvestment(req, res, user) {
  const body = await readBody(req);
  const amount = decimalInput(body.amount);
  if (!body.productId) throw new ApiError(400, "Choose an investment product.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const productResult = await client.query(
      `SELECT p.*, a.symbol, a.enabled AS asset_enabled, a.investment_enabled, a.decimals
       FROM investment_products p JOIN assets a ON a.id = p.asset_id
       WHERE p.id = $1
       FOR UPDATE`,
      [body.productId]
    );
    const product = productResult.rows[0];
    if (!product || product.status !== "ACTIVE") throw new ApiError(409, "This investment product is not available.");
    if (!product.asset_enabled || !product.investment_enabled) throw new ApiError(409, "This asset is not enabled for investment.");
    if (product.available_from && new Date(product.available_from) > new Date()) throw new ApiError(409, "This investment product is not available yet.");
    if (product.available_until && new Date(product.available_until) <= new Date()) throw new ApiError(409, "This investment product has expired.");
    if (decimalPlaces(amount) > product.decimals) throw new ApiError(400, `Amount supports up to ${product.decimals} decimal places.`);

    const balanceResult = await client.query(
      `SELECT wb.id, wb.amount, w.id AS wallet_id
       FROM wallet_balances wb JOIN wallets w ON w.id = wb.wallet_id
       WHERE w.user_id = $1 AND wb.asset_id = $2
       FOR UPDATE`,
      [user.id, product.asset_id]
    );
    const balance = balanceResult.rows[0];
    if (!balance) throw new ApiError(409, "Your wallet is not configured for this asset.");
    const comparison = await client.query(
      `SELECT
        ($1::numeric < $2::numeric) AS below_minimum,
        ($3::numeric IS NOT NULL AND $1::numeric > $3::numeric) AS above_maximum,
        ($1::numeric > $4::numeric) AS above_balance`,
      [amount, product.minimum_amount, product.maximum_amount, balance.amount]
    );
    const checks = comparison.rows[0];
    if (checks.below_minimum) throw new ApiError(400, `Minimum investment is ${product.minimum_amount} ${product.symbol}.`);
    if (checks.above_maximum) throw new ApiError(400, `Maximum investment is ${product.maximum_amount} ${product.symbol}.`);
    if (checks.above_balance) throw new ApiError(400, `Insufficient available ${product.symbol} balance.`);

    const investment = await client.query(
      `INSERT INTO investments (user_id, product_id, principal, end_at)
       VALUES ($1, $2, $3, CASE WHEN $4::integer IS NULL THEN NULL ELSE NOW() + ($4::integer * INTERVAL '1 day') END)
       RETURNING id, product_id, principal, status, started_at, end_at`,
      [user.id, product.id, amount, product.duration_days]
    );
    await client.query(
      `UPDATE wallet_balances
       SET amount = amount - $1, invested_amount = invested_amount + $1, updated_at = NOW()
       WHERE id = $2`,
      [amount, balance.id]
    );
    const transaction = await client.query(
      `INSERT INTO transactions (user_id, asset_id, type, amount, reference_id, status, metadata)
       VALUES ($1, $2, 'INVESTMENT', $3, $4, 'COMPLETED', $5::jsonb)
       RETURNING id`,
      [
        user.id,
        product.asset_id,
        `-${amount}`,
        investment.rows[0].id,
        JSON.stringify({ productId: product.id, symbol: product.symbol, principal: amount })
      ]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, 'INVESTMENT_CREATED', 'INVESTMENT', $2, $3::jsonb)`,
      [user.id, investment.rows[0].id, JSON.stringify({ amount, asset: product.symbol, transactionId: transaction.rows[0].id })]
    );
    await client.query("COMMIT");
    json(res, 201, { investment: investment.rows[0], transactionId: transaction.rows[0].id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function rewardsApi(req, res, user) {
  await accrueRewards(user.id);
  const result = await pool.query(
    `SELECT id, investment_id, amount, reward_value, g_price_used, period_key,
            calculation_start, calculation_end, source, status, accrued_at
     FROM g_rewards WHERE user_id = $1 ORDER BY accrued_at DESC LIMIT 200`,
    [user.id]
  );
  json(res, 200, { rewards: result.rows });
}

async function generationApi(req, res, user) {
  await accrueRewards(user.id);
  const result = await pool.query(
    `SELECT e.id, e.investment_id, e.amount, e.calculation_start, e.calculation_end,
            e.period_key, e.created_at, a.symbol AS asset
     FROM g_generation_events e
     JOIN investments i ON i.id = e.investment_id
     JOIN investment_products p ON p.id = i.product_id
     JOIN assets a ON a.id = p.asset_id
     WHERE e.user_id = $1 ORDER BY e.created_at DESC LIMIT 200`,
    [user.id]
  );
  json(res, 200, { generation: result.rows });
}

async function assetsApi(res) {
  const result = await pool.query(
    `SELECT id, name, symbol, decimals, enabled, deposit_enabled, withdrawal_enabled,
            investment_enabled, conversion_enabled
     FROM assets WHERE enabled = TRUE ORDER BY name`
  );
  json(res, 200, { assets: result.rows });
}

async function demoSummary(userId = null, client = pool) {
  const userQuery = userId
    ? client.query(
      `SELECT id, full_name, username, email, account_type, role, status
       FROM users WHERE id = $1 AND account_type = 'DEMO'`,
      [userId]
    )
    : client.query(
      `SELECT id, full_name, username, email, account_type, role, status
       FROM users WHERE account_type = 'DEMO' ORDER BY created_at LIMIT 1`
    );
  const userResult = await userQuery;
  const demo = userResult.rows[0];
  if (!demo) return null;
  const [balances, investments, rewards] = await Promise.all([
    client.query(
      `SELECT a.symbol, wb.amount, wb.invested_amount
       FROM wallets w JOIN wallet_balances wb ON wb.wallet_id = w.id
       JOIN assets a ON a.id = wb.asset_id
       WHERE w.user_id = $1 ORDER BY CASE WHEN a.symbol = 'G' THEN 0 ELSE 1 END, a.symbol`,
      [demo.id]
    ),
    client.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(principal), 0) AS principal
       FROM investments WHERE user_id = $1 AND status = 'ACTIVE'`,
      [demo.id]
    ),
    client.query(
      `SELECT COUNT(*)::integer AS count, COALESCE(SUM(amount), 0) AS amount
       FROM g_rewards WHERE user_id = $1 AND status = 'ACCOUNTED'`,
      [demo.id]
    )
  ]);
  return {
    ...demo,
    balances: balances.rows,
    activeInvestments: investments.rows[0],
    rewards: rewards.rows[0]
  };
}

async function adminConfigApi(res, user) {
  requireAdmin(user);
  const [config, products, assets, genesis, pairs, rewardModel] = await Promise.all([
    enabledConfig(),
    pool.query(
      `SELECT p.*, a.symbol AS asset
       FROM investment_products p JOIN assets a ON a.id = p.asset_id
       ORDER BY p.created_at`
    ),
    pool.query(
      `SELECT id, name, symbol, decimals, enabled, deposit_enabled, withdrawal_enabled,
              investment_enabled, conversion_enabled
       FROM assets ORDER BY name`
    ),
    setting("genesis_token"),
    setting("conversion_pairs"),
    setting("reward_model")
  ]);
  json(res, 200, {
    ...config,
    products: products.rows,
    assets: assets.rows,
    genesis,
    conversions: pairs,
    rewardModel,
    development: {
      enabled: process.env.NODE_ENV !== "production" && process.env.REPLIT_DEPLOYMENT !== "1",
      demo: await demoSummary()
    }
  });
}

function productPayload(body) {
  const name = String(body.name || "").trim();
  const assetId = String(body.assetId || "").trim();
  const minimumAmount = decimalInput(body.minimumAmount, "Minimum amount");
  const maximumAmount = body.maximumAmount === "" || body.maximumAmount == null ? null : decimalInput(body.maximumAmount, "Maximum amount");
  const rewardRate = decimalInput(body.rewardRate, "Reward rate");
  const rewardFrequency = String(body.rewardFrequency || "DAILY").toUpperCase();
  const allowed = ["DAILY", "WEEKLY", "MONTHLY", "FIXED"];
  if (!name || !assetId) throw new ApiError(400, "Product name and supported asset are required.");
  if (!allowed.includes(rewardFrequency)) throw new ApiError(400, "Invalid reward frequency.");
  if (maximumAmount && Number(maximumAmount) < Number(minimumAmount)) throw new ApiError(400, "Maximum amount must be at least the minimum amount.");
  return {
    name,
    assetId,
    minimumAmount,
    maximumAmount,
    rewardRate,
    rewardFrequency,
    durationDays: body.durationDays === "" || body.durationDays == null ? null : Number(body.durationDays),
    feeRate: body.feeRate === "" || body.feeRate == null ? "0" : nonNegativeDecimalInput(body.feeRate, "Fee rate"),
    durationTerms: String(body.durationTerms || "").trim() || "Terms subject to platform availability.",
    riskTerms: String(body.riskTerms || "").trim() || "Review applicable platform terms and risks.",
    status: ["ACTIVE", "PAUSED", "CLOSED"].includes(String(body.status || "").toUpperCase()) ? String(body.status).toUpperCase() : "ACTIVE"
  };
}

async function saveProduct(req, res, user, productId = null) {
  requireAdmin(user);
  const body = await readBody(req);
  const product = productPayload(body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let result;
    if (productId) {
      result = await client.query(
        `UPDATE investment_products
         SET asset_id = $1, name = $2, minimum_amount = $3, maximum_amount = $4,
             reward_rate = $5, rate_unit = $6, reward_frequency = $6, duration_days = $7,
             duration_terms = $8, fee_rate = $9, status = $10, risk_terms = $11, updated_at = NOW()
         WHERE id = $12
         RETURNING *`,
        [product.assetId, product.name, product.minimumAmount, product.maximumAmount, product.rewardRate, product.rewardFrequency, product.durationDays, product.durationTerms, product.feeRate, product.status, product.riskTerms, productId]
      );
      if (!result.rows[0]) throw new ApiError(404, "Investment product not found.");
    } else {
      result = await client.query(
        `INSERT INTO investment_products
           (asset_id, name, minimum_amount, maximum_amount, reward_rate, rate_unit, reward_frequency,
            duration_days, duration_terms, fee_rate, status, risk_terms)
         VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [product.assetId, product.name, product.minimumAmount, product.maximumAmount, product.rewardRate, product.rewardFrequency, product.durationDays, product.durationTerms, product.feeRate, product.status, product.riskTerms]
      );
    }
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, $2, 'INVESTMENT_PRODUCT', $3, $4::jsonb)`,
      [user.id, productId ? "INVESTMENT_PRODUCT_UPDATED" : "INVESTMENT_PRODUCT_CREATED", result.rows[0].id, JSON.stringify(product)]
    );
    await client.query("COMMIT");
    json(res, productId ? 200 : 201, { product: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23503") throw new ApiError(400, "Choose an existing supported asset.");
    throw error;
  } finally {
    client.release();
  }
}

async function saveGenesisSettings(req, res, user) {
  requireAdmin(user);
  const body = await readBody(req);
  const existing = (await setting("genesis_token")) || {};
  const status = String(body.status || existing.status || "PRE-LAUNCH").toUpperCase();
  if (!["PRE-LAUNCH", "LIVE", "LISTED"].includes(status)) throw new ApiError(400, "Invalid Genesis token status.");
  const referencePrice = decimalInput(body.referencePrice ?? existing.referencePrice, "Reference price");
  const next = {
    ...existing,
    name: String(body.name || existing.name || "Genesis"),
    symbol: String(body.symbol || existing.symbol || "G"),
    status,
    referencePrice,
    description: String(body.description || existing.description || "Genesis G reference value.")
  };
  await pool.query(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES ('genesis_token', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(next)]
  );
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, after_data)
     VALUES ($1, 'GENESIS_SETTINGS_UPDATED', 'PLATFORM_SETTING', $2::jsonb)`,
    [user.id, JSON.stringify(next)]
  );
  json(res, 200, { genesis: next });
}

async function saveAsset(req, res, user, assetId) {
  requireAdmin(user);
  const body = await readBody(req);
  const fields = {
    enabled: Boolean(body.enabled),
    deposit_enabled: Boolean(body.depositEnabled),
    withdrawal_enabled: Boolean(body.withdrawalEnabled),
    investment_enabled: Boolean(body.investmentEnabled),
    conversion_enabled: Boolean(body.conversionEnabled)
  };
  const result = await pool.query(
    `UPDATE assets
     SET enabled = $1, deposit_enabled = $2, withdrawal_enabled = $3,
         investment_enabled = $4, conversion_enabled = $5
     WHERE id = $6
     RETURNING id, symbol, enabled, deposit_enabled, withdrawal_enabled, investment_enabled, conversion_enabled`,
    [fields.enabled, fields.deposit_enabled, fields.withdrawal_enabled, fields.investment_enabled, fields.conversion_enabled, assetId]
  );
  if (!result.rows[0]) throw new ApiError(404, "Asset not found.");
  await pool.query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
     VALUES ($1, 'ASSET_SETTINGS_UPDATED', 'ASSET', $2, $3::jsonb)`,
    [user.id, assetId, JSON.stringify(fields)]
  );
  json(res, 200, { asset: result.rows[0] });
}

async function transactionsApi(req, res, user) {
  const result = await pool.query(
    `SELECT t.id, t.type, t.amount, t.status, t.reference_id, t.metadata, t.created_at,
            a.symbol AS asset
     FROM transactions t LEFT JOIN assets a ON a.id = t.asset_id
     WHERE t.user_id = $1
     ORDER BY t.created_at DESC LIMIT 100`,
    [user.id]
  );
  json(res, 200, { transactions: result.rows });
}

function nonNegativeDecimalInput(value, label) {
  const normalized = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(normalized)) {
    throw new ApiError(400, `${label} must be a valid non-negative decimal.`);
  }
  return normalized;
}

async function createConversion(req, res, user) {
  await accrueRewards(user.id);
  const body = await readBody(req);
  const from = String(body.from || "").trim().toUpperCase();
  const to = String(body.to || "").trim().toUpperCase();
  const fromAmount = decimalInput(body.amount, "Conversion amount");
  if (!from || !to || from === to) throw new ApiError(400, "Choose a valid conversion pair.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const settings = await setting("conversion_pairs", client);
    const pair = (settings?.pairs || []).find(item => String(item.from).toUpperCase() === from && String(item.to).toUpperCase() === to);
    if (!pair) throw new ApiError(409, "This conversion pair is not enabled.");
    const rate = nonNegativeDecimalInput(pair.rate, "Conversion rate");
    const feeRate = nonNegativeDecimalInput(pair.fee ?? "0", "Conversion fee");
    if (Number(rate) <= 0) throw new ApiError(409, "This conversion pair has no usable rate.");

    const assetsResult = await client.query(
      `SELECT id, symbol, decimals, enabled, conversion_enabled
       FROM assets WHERE symbol = ANY($1::text[]) FOR UPDATE`,
      [[from, to]]
    );
    const fromAsset = assetsResult.rows.find(asset => asset.symbol === from);
    const toAsset = assetsResult.rows.find(asset => asset.symbol === to);
    if (!fromAsset || !toAsset || !fromAsset.enabled || !toAsset.enabled || !fromAsset.conversion_enabled || !toAsset.conversion_enabled) {
      throw new ApiError(409, "One of these assets is not enabled for conversion.");
    }
    if (decimalPlaces(fromAmount) > fromAsset.decimals) {
      throw new ApiError(400, `Amount supports up to ${fromAsset.decimals} decimal places.`);
    }

    const balancesResult = await client.query(
      `SELECT wb.id, wb.asset_id, wb.amount
       FROM wallet_balances wb JOIN wallets w ON w.id = wb.wallet_id
       WHERE w.user_id = $1 AND wb.asset_id = ANY($2::uuid[]) FOR UPDATE`,
      [user.id, [fromAsset.id, toAsset.id]]
    );
    const fromBalance = balancesResult.rows.find(balance => balance.asset_id === fromAsset.id);
    const toBalance = balancesResult.rows.find(balance => balance.asset_id === toAsset.id);
    if (!fromBalance || !toBalance) throw new ApiError(409, "Your wallet is not configured for this conversion.");
    const comparison = await client.query(
      "SELECT $1::numeric > $2::numeric AS insufficient",
      [fromAmount, fromBalance.amount]
    );
    if (comparison.rows[0].insufficient) throw new ApiError(400, `Insufficient available ${from} balance.`);

    const quote = await client.query(
      `SELECT $1::numeric * $2::numeric AS gross,
              ($1::numeric * $2::numeric) * $3::numeric / 100 AS fee`,
      [fromAmount, rate, feeRate]
    );
    const gross = quote.rows[0].gross;
    const fee = quote.rows[0].fee;
    const net = await client.query("SELECT $1::numeric - $2::numeric AS net", [gross, fee]);
    if (Number(net.rows[0].net) <= 0) throw new ApiError(400, "Conversion fee exceeds the conversion value.");

    const conversion = await client.query(
      `INSERT INTO conversions
         (user_id, from_asset_id, to_asset_id, from_amount, rate, fee, to_amount, status, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', NOW())
       RETURNING id, from_amount, rate, fee, to_amount, status, completed_at`,
      [user.id, fromAsset.id, toAsset.id, fromAmount, rate, fee, net.rows[0].net]
    );
    const conversionId = conversion.rows[0].id;
    await client.query("UPDATE wallet_balances SET amount = amount - $1, updated_at = NOW() WHERE id = $2", [fromAmount, fromBalance.id]);
    await client.query("UPDATE wallet_balances SET amount = amount + $1, updated_at = NOW() WHERE id = $2", [net.rows[0].net, toBalance.id]);
    await client.query(
      `INSERT INTO transactions (user_id, asset_id, type, amount, reference_id, status, metadata)
       VALUES
         ($1, $2, 'CONVERSION', $3, $4, 'COMPLETED', $5::jsonb),
         ($1, $6, 'CONVERSION', $7, $4, 'COMPLETED', $8::jsonb)`,
      [
        user.id,
        fromAsset.id,
        `-${fromAmount}`,
        conversionId,
        JSON.stringify({ conversionId, direction: "OUT", from, to, rate, fee, internalAccounting: true }),
        toAsset.id,
        net.rows[0].net,
        JSON.stringify({ conversionId, direction: "IN", from, to, rate, fee, internalAccounting: true })
      ]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, 'CONVERSION_COMPLETED', 'CONVERSION', $2, $3::jsonb)`,
      [user.id, conversionId, JSON.stringify({ from, to, fromAmount, toAmount: net.rows[0].net, rate, fee, internalAccounting: true })]
    );
    await client.query("COMMIT");
    json(res, 201, { conversion: conversion.rows[0], from, to, internalAccounting: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function developmentApi(res, user) {
  requireAdmin(user);
  requireDevelopmentEnvironment();
  json(res, 200, { enabled: true, demo: await demoSummary() });
}

async function simulateDemoTime(req, res, user) {
  requireAdmin(user);
  requireDevelopmentEnvironment();
  const body = await readBody(req);
  const hours = Number(body.hours);
  if (![1, 24, 168].includes(hours)) throw new ApiError(400, "Choose a supported simulation window.");
  const client = await pool.connect();
  let demoId;
  try {
    await client.query("BEGIN");
    const demoResult = await client.query("SELECT id FROM users WHERE account_type = 'DEMO' FOR UPDATE");
    if (!demoResult.rows[0]) throw new ApiError(404, "The development demo account does not exist.");
    demoId = demoResult.rows[0].id;
    await client.query(
      `UPDATE investments
       SET started_at = started_at - ($1::numeric * INTERVAL '1 hour')
       WHERE user_id = $2 AND status = 'ACTIVE'`,
      [hours, demoId]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, 'DEMO_TIME_SIMULATED', 'USER', $2, $3::jsonb)`,
      [user.id, demoId, JSON.stringify({ hours, developmentOnly: true })]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const accrual = await accrueRewards(demoId);
  json(res, 200, { hours, accountedPeriods: accrual.accounted, demo: await demoSummary(demoId) });
}

async function resetDemoAccount(req, res, user) {
  requireAdmin(user);
  requireDevelopmentEnvironment();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const demoResult = await client.query("SELECT id FROM users WHERE account_type = 'DEMO' FOR UPDATE");
    if (!demoResult.rows[0]) throw new ApiError(404, "The development demo account does not exist.");
    const demoId = demoResult.rows[0].id;
    await client.query("DELETE FROM g_generation_events WHERE user_id = $1", [demoId]);
    await client.query("DELETE FROM g_rewards WHERE user_id = $1", [demoId]);
    await client.query("DELETE FROM transactions WHERE user_id = $1", [demoId]);
    await client.query("DELETE FROM conversions WHERE user_id = $1", [demoId]);
    await client.query("DELETE FROM deposits WHERE user_id = $1", [demoId]);
    await client.query("DELETE FROM withdrawals WHERE user_id = $1", [demoId]);
    await client.query("DELETE FROM investments WHERE user_id = $1", [demoId]);
    await client.query("DELETE FROM audit_logs WHERE actor_user_id = $1", [demoId]);
    await client.query(
      `UPDATE wallet_balances wb
       SET amount = CASE a.symbol
         WHEN 'USDT' THEN 1000
         WHEN 'BNB' THEN 1
         WHEN 'BTC' THEN 0.05
         WHEN 'ETH' THEN 1
         WHEN 'SOL' THEN 10
         WHEN 'G' THEN 0
         ELSE 0
       END,
       invested_amount = 0,
       updated_at = NOW()
       FROM assets a
       WHERE wb.asset_id = a.id
         AND wb.wallet_id = (SELECT id FROM wallets WHERE user_id = $1)`,
      [demoId]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, after_data)
       VALUES ($1, 'DEMO_ACCOUNT_RESET', 'USER', $2, $3::jsonb)`,
      [user.id, demoId, JSON.stringify({ developmentOnly: true, balancesReset: true })]
    );
    await client.query("COMMIT");
    json(res, 200, { reset: true, demo: await demoSummary(demoId) });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function userApi(req, res, user) {
  json(res, 200, { user });
}

async function api(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/config") return configApi(res);
  if (req.method === "GET" && pathname === "/api/assets") return assetsApi(res);
  if (req.method === "GET" && pathname === "/api/session") return json(res, 200, { user: await currentUser(req) });
  if (req.method === "POST" && pathname === "/api/auth/signup") return authSignup(req, res);
  if (req.method === "POST" && pathname === "/api/auth/login") return authLogin(req, res);
  if (req.method === "POST" && pathname === "/api/auth/logout") { clearSession(res); return json(res, 200, { ok: true }); }

  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method === "GET" && pathname === "/api/me") return userApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/wallet") return walletApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/portfolio") return portfolioApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/transactions") return transactionsApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/investments") return investmentsApi(req, res, user);
  if (req.method === "POST" && pathname === "/api/investments") return createInvestment(req, res, user);
  if (req.method === "POST" && pathname === "/api/conversions") return createConversion(req, res, user);
  if (req.method === "GET" && pathname === "/api/g-rewards") return rewardsApi(req, res, user);
  if (req.method === "GET" && pathname === "/api/g-generation") return generationApi(req, res, user);

  const investmentMatch = pathname.match(/^\/api\/investments\/([0-9a-f-]+)$/i);
  if (req.method === "GET" && investmentMatch) return investmentDetailApi(req, res, user, investmentMatch[1]);

  if (pathname === "/api/admin") {
    requireAdmin(user);
    if (req.method === "GET") return adminConfigApi(res, user);
  }
  if (pathname === "/api/admin/development") {
    if (req.method === "GET") return developmentApi(res, user);
  }
  if (pathname === "/api/admin/development/simulate" && req.method === "POST") return simulateDemoTime(req, res, user);
  if (pathname === "/api/admin/development/reset" && req.method === "POST") return resetDemoAccount(req, res, user);
  if (pathname === "/api/admin/genesis" && req.method === "POST") return saveGenesisSettings(req, res, user);
  const productMatch = pathname.match(/^\/api\/admin\/investment-products(?:\/([0-9a-f-]+))?$/i);
  if (productMatch && req.method === "POST") return saveProduct(req, res, user, productMatch[1]);
  const assetMatch = pathname.match(/^\/api\/admin\/assets\/([0-9a-f-]+)$/i);
  if (assetMatch && req.method === "POST") return saveAsset(req, res, user, assetMatch[1]);
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
    if (!res.headersSent) json(res, error.status || (error.message === "Invalid JSON body." ? 400 : 500), { error: error.status ? error.message : "The server could not complete that request." });
  }
}

const server = http.createServer(requestHandler);
server.listen(port, "0.0.0.0", () => console.log(`Genesis preview running on port ${port}`));

module.exports = { server, accrueRewards, decimalInput };