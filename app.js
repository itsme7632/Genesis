const ASSET_ICON = "https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@master/128/color/";
const icons = { BTC: "btc.png", ETH: "eth.png", BNB: "bnb.png", USDT: "usdt.png", SOL: "sol.png" };

const state = {
  page: "home",
  profileOpen: false,
  modal: null,
  adminTab: "Genesis G",
  authMode: "login",
  user: null,
  config: null,
  adminConfig: null,
  walletAssets: [],
  portfolio: { investments: [], generation: [], rewards: { total_generated: "0", today_generated: "0" }, gBalance: "0", gEstimatedValue: "0" },
  selectedProduct: null,
  selectedInvestment: null,
  investAmount: "",
  adminNewProduct: false
};

const navItems = [
  ["home", "Home", "⌂"], ["invest", "Invest", "↗"], ["wallet", "Wallet", "◈"],
  ["portfolio", "Portfolio", "◒"], ["markets", "Markets", "⌁"]
];

function GMark() {
  return `<svg class="g-mark" viewBox="0 0 40 40" aria-label="Genesis G mark"><rect width="40" height="40" rx="13" fill="#101c24"/><path d="M28.5 11.5c-2.2-2-5.1-3.1-8.6-3.1-7.4 0-12.5 5.2-12.5 12.7S12.5 33.8 20 33.8c3.5 0 6.4-1.1 8.6-3.1V20.3H20" fill="none" stroke="#d4a83f" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function amount(value, digits = 8) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString(undefined, { maximumFractionDigits: digits });
}
function productById(id) {
  return (state.config?.products || []).find(product => product.id === id);
}
function walletAsset(symbol) {
  return state.walletAssets.find(asset => asset.symbol === symbol) || { amount: "0", invested_amount: "0" };
}
function productRate(product) {
  return `${product.reward_rate}% ${String(product.reward_frequency || product.rate_unit || "").toLowerCase()}`;
}
function icon(symbol, label = symbol) {
  if (symbol === "G") return `<div class="asset-icon g-token" title="${label}">G</div>`;
  return `<div class="asset-icon" title="${label}"><img src="${ASSET_ICON}${icons[symbol] || "usdt.png"}" alt="${label}" onerror="this.style.display='none'; this.parentElement.textContent='${symbol}'"></div>`;
}
function nav() {
  return navItems.map(([key, label, glyph]) => `<button class="nav-item ${state.page === key ? "active" : ""}" data-page="${key}"><span class="nav-icon">${glyph}</span><span>${label}</span></button>`).join("");
}
function authPage() {
  const signup = state.authMode === "signup";
  return `<div class="auth-shell"><div class="auth-brand">${GMark()}<span>genesis</span></div><div class="auth-layout"><div class="auth-story"><p class="eyebrow">The Genesis platform</p><h1>Put your assets to work.<br/><em>Generate Genesis G.</em></h1><p>Manage your digital assets, invest with clear terms, and follow your Genesis G generation in one place.</p><div class="auth-points"><span>◈ Wallet-first asset management</span><span>↗ Configurable investment products</span><span>G Pre-launch token ecosystem</span></div></div><div class="card auth-card"><div class="auth-tabs"><button class="${!signup ? "active" : ""}" data-auth-mode="login">Log in</button><button class="${signup ? "active" : ""}" data-auth-mode="signup">Create account</button></div><h2>${signup ? "Create your Genesis account." : "Welcome back."}</h2><p class="auth-sub">${signup ? "Start with a secure account. You can connect wallet infrastructure later." : "Log in with your email or username to continue."}</p><form id="auth-form" class="form-stack">${signup ? `<div class="form-field"><label>Full name</label><input name="fullName" autocomplete="name" required /></div><div class="form-field"><label>Username</label><input name="username" autocomplete="username" pattern="[A-Za-z0-9_]{3,24}" required /></div><div class="form-field"><label>Email</label><input name="email" type="email" autocomplete="email" required /></div>` : `<div class="form-field"><label>Email or username</label><input name="identifier" type="text" autocomplete="username" required /></div>`}<div class="form-field"><label>Password</label><input name="password" type="password" minlength="10" autocomplete="${signup ? "new-password" : "current-password"}" required /></div>${signup ? `<div class="form-field"><label>Confirm password</label><input name="confirmPassword" type="password" minlength="10" autocomplete="new-password" required /></div>` : ""}<p class="auth-error" id="auth-error"></p><button class="btn btn-primary" type="submit">${signup ? "Create account" : "Log in"}</button></form><p class="auth-legal">By continuing, you agree to Genesis platform terms. No external login or OTP is required.</p></div></div><div class="auth-footer">Genesis G is pre-launch. Reference values are informational, not live market prices.</div></div>`;
}
function layout(content, title) {
  return `<div class="app-shell">
    <aside class="sidebar">
      <div class="brand">${GMark()}<span>genesis</span></div>
      <div class="sidebar-label">Workspace</div>
      <nav class="nav-list">${nav()}</nav>
      <div class="sidebar-note">${state.user?.role === "ADMIN" ? `<button class="profile-link" data-page="admin" style="color:#d9e2df;padding:10px 6px;margin:0 0 14px">⚙&nbsp; Admin console</button>` : ""}<strong>G is pre-launch</strong>The reference value shown is configured for information only, not a live market price.</div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div><p class="eyebrow">Genesis platform</p><h2 class="top-title">${title}</h2></div>
        <div class="top-actions"><span class="demo-badge">Connected account</span><button class="avatar" id="profile-toggle" aria-label="Open profile menu">${(state.user?.full_name || "G").charAt(0).toUpperCase()}</button></div>
        <div class="profile-menu ${state.profileOpen ? "open" : ""}" id="profile-menu">
          <div class="profile-head"><strong>${state.user?.full_name || "Genesis user"}</strong><span>@${state.user?.username || "user"} · Member since ${state.user?.created_at ? new Date(state.user.created_at).toLocaleDateString() : "today"}</span></div>
          ${["Account", "Security", "Notifications", "Settings", "Transactions", "Help & Support"].map(item => `<button class="profile-link" data-profile="${item}">${item}</button>`).join("")}
          <button class="profile-link signout" data-profile="Sign out">Sign out</button>
        </div>
      </header>
      <section class="content">${content}</section>
    </main>
    <nav class="mobile-nav">${nav()}</nav>
  </div>
  <div class="modal-backdrop ${state.modal ? "open" : ""}" id="modal-backdrop">${state.modal ? modalContent() : ""}</div>`;
}

function stat(label, value, meta, extra = "") {
  return `<div class="card stat-card ${extra}"><div class="stat-label"><span>${label}</span>${extra === "g-highlight" ? `<span class="g-dot">●</span>` : ""}</div><div class="stat-value">${value}</div><div class="stat-meta">${meta}</div></div>`;
}
function chart() {
  return `<div class="chart-wrap"><svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Demo balance trend"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#187c68" stop-opacity=".19"/><stop offset="1" stop-color="#187c68" stop-opacity="0"/></linearGradient></defs><path d="M0 135 C45 133, 54 121, 92 126 S152 83, 183 102 S241 70, 278 94 S328 55, 365 76 S410 61, 445 68 S499 34, 536 48 S570 35, 600 13 V160 H0Z" fill="url(#fill)"/><path d="M0 135 C45 133, 54 121, 92 126 S152 83, 183 102 S241 70, 278 94 S328 55, 365 76 S410 61, 445 68 S499 34, 536 48 S570 35, 600 13" fill="none" stroke="#187c68" stroke-width="3" stroke-linecap="round"/></svg></div>`;
}
function assetRow(symbol, name, amount, usd, action = "") {
  return `<div class="asset-row ${action ? "clickable" : ""}" ${action ? `data-asset="${esc(symbol)}"` : ""}>${icon(symbol, name)}<div class="asset-info"><strong>${esc(name)}</strong><span>${esc(symbol)}${symbol === "G" ? " · Pre-launch" : ""}</span></div><div class="asset-amount"><strong>${amount} ${esc(symbol)}</strong><span>${esc(usd)}</span></div></div>`;
}
function homePage() {
  const firstName = state.user?.full_name?.split(" ")[0] || "there";
  const gBalance = state.walletAssets.find(item => item.symbol === "G")?.amount || "0";
  const totalGenerated = state.portfolio.rewards?.total_generated || "0";
  const invested = state.walletAssets.reduce((total, item) => total + Number(item.invested_amount || 0), 0);
  return `<div class="page-intro"><div><p class="eyebrow">Genesis wallet</p><h1>Good morning, ${firstName}.</h1><p>Your assets are ready to work for you.</p></div><div class="page-actions"><button class="btn btn-primary" data-modal="deposit">Deposit funds</button></div></div>
  <div class="grid grid-4 home-stats">${stat("Total wallet value", "Not priced", "Market source not connected")}${stat("Invested amount", `${amount(invested)} units`, `${state.portfolio.investments.length} active investments`)}${stat("Today's G earnings", `+${amount(state.portfolio.rewards?.today_generated)} G`, "Backend-accounted reward generation", "g-highlight")}${stat("G balance", `${amount(gBalance)} G`, "Pre-launch reference value")}</div>
  <div class="section"><div class="quick-actions">
    <button class="quick-action" data-modal="deposit"><span class="quick-icon">↓</span><span><strong>Deposit</strong><span>Add supported assets</span></span></button>
    <button class="quick-action" data-modal="withdraw"><span class="quick-icon">↑</span><span><strong>Withdraw</strong><span>Send assets out</span></span></button>
    <button class="quick-action" data-page="invest"><span class="quick-icon">↗</span><span><strong>Invest</strong><span>Generate G</span></span></button>
    <button class="quick-action" data-modal="convert"><span class="quick-icon">⇄</span><span><strong>Convert</strong><span>G into assets</span></span></button>
  </div></div>
  <div class="grid grid-2 section"><div class="card"><div class="split-card"><div class="section-head"><h2>Your assets</h2><button class="btn-quiet" data-page="wallet">View wallet →</button></div>${state.walletAssets.slice(0, 3).map(item => assetRow(item.symbol, item.name, item.amount, "Not priced", "detail")).join("") || `<div class="empty-state">Your wallet is ready. Deposit infrastructure is not connected yet.</div>`}</div></div>
    <div class="card chart-card"><div class="section-head"><div><h2>Portfolio overview</h2><p>Live chart appears when market data is connected</p></div><span class="pill gray">Awaiting data</span></div><div class="empty-state chart-empty">No market history available yet.</div></div></div>
  <div class="grid grid-2 section"><div class="card split-card"><div class="section-head"><h2>Recent activity</h2><button class="btn-quiet" data-profile="Transactions">See all →</button></div><div class="empty-state">No transactions yet. Confirmed deposits, withdrawals, investments and rewards will appear here.</div></div>
    <div class="notice"><span class="notice-icon">G</span><div><strong>Genesis G is preparing for launch</strong><p>The $0.10 reference value is configured by Genesis and is not a live market price. Actual market pricing will depend on the official launch and available markets.</p><button class="btn-quiet" data-page="markets" style="margin-top:10px">Learn about G →</button></div></div></div>`;
}
function activity(glyph, title, date, amount, cls) {
  return `<div class="activity-row"><span class="activity-bullet">${glyph}</span><div class="activity-copy"><strong>${title}</strong><span>${date}</span></div><div class="activity-value ${cls}">${amount}</div></div>`;
}
function investPage() {
  const products = state.config?.products || [];
  return `<div class="page-intro"><div><p class="eyebrow">Put your assets to work</p><h1>Invest & generate G.</h1><p>Select a supported asset and see how it can generate Genesis G.</p></div></div>
    <div class="notice"><span class="notice-icon">i</span><div><strong>Reward terms are controlled by Genesis</strong><p>Rates below are read from the backend investment configuration, not hardcoded in the browser. They are not guaranteed returns; review applicable terms and risks.</p></div></div>
    <div class="grid grid-2 section">${products.length ? products.map(investmentCard).join("") : `<div class="card empty-state">No investment products are available right now.</div>`}</div>
    <div class="section disclosure">Investment rewards are subject to platform availability, terms and risks. Genesis does not represent these configured rates as guaranteed or risk-free returns.</div>`;
}
function investmentCard(product) {
  const asset = walletAsset(product.asset);
  const duration = product.duration_days ? `${product.duration_days} days` : "Flexible";
  return `<div class="card investment-card"><div class="investment-top"><div class="investment-asset">${icon(product.asset, product.asset)}<div><h3>${esc(product.name.replace(" → Genesis G", ""))}</h3><div class="sub">${esc(product.asset)} · Available ${amount(asset.amount)} ${esc(product.asset)}</div></div></div><span class="pill">Enabled</span></div><div class="metric-row"><div class="metric"><span>Minimum investment</span><strong>${esc(product.minimum_amount)} ${esc(product.asset)}</strong></div><div class="metric"><span>Current reward rate</span><strong>${esc(productRate(product))}</strong></div><div class="metric"><span>Currently invested</span><strong>${amount(asset.invested_amount)} ${esc(product.asset)}</strong></div><div class="metric"><span>Duration</span><strong>${duration}</strong></div></div><button class="btn btn-primary" style="width:100%" data-invest="${esc(product.id)}">Start investing</button></div>`;
}
function portfolioPage() {
  const rewards = state.portfolio.rewards || { total_generated: "0", today_generated: "0" };
  const generation = state.portfolio.generation || [];
  return `<div class="page-intro"><div><p class="eyebrow">My investment / Genesis generation</p><h1>Your Genesis portfolio.</h1><p>A clear view of the assets generating G for you.</p></div><button class="btn btn-primary" data-page="invest">Add investment</button></div>
    <div class="grid grid-2"><div class="generator-card"><span class="generator-label">Genesis generator · backend view</span><h2>${state.portfolio.investments.length ? "Generating G" : "Ready to generate G"}</h2><p>Your invested assets generate rewards according to configured terms.</p><div class="generator-number">${amount(rewards.total_generated)} G</div><div class="flow"><span class="flow-node">Assets</span><span class="flow-arrow">→</span><span class="flow-node">G generation</span><span class="flow-arrow">→</span><span class="flow-node">G</span></div></div><div class="grid grid-2">${stat("Total invested",`${amount(state.portfolio.investments.filter(item => item.status === "ACTIVE").reduce((total, item) => total + Number(item.principal || 0), 0))} units`,`${state.portfolio.investments.length} investments`)}${stat("Today's generation",`+${amount(rewards.today_generated)} G`,"Backend-accounted reward","g-highlight")}${stat("Total generated",`${amount(rewards.total_generated)} G`,"Auditable reward records")}${stat("Estimated G value",`$${amount(state.portfolio.gEstimatedValue, 8)}`,`${state.config?.genesis?.status || "PRE-LAUNCH"} reference price`)}</div></div>
    <div class="section"><div class="section-head"><div><h2>Active investments</h2><p>Reward generation visualization, not physical mining.</p></div><span class="pill ${state.portfolio.investments.length ? "" : "gray"}">${state.portfolio.investments.filter(item => item.status === "ACTIVE").length} active</span></div><div class="grid grid-2">${state.portfolio.investments.length ? state.portfolio.investments.map(item => `<div class="card investment-card clickable" data-investment-detail="${esc(item.id)}"><div class="investment-top"><div class="investment-asset">${icon(item.asset,item.asset)}<div><h3>${esc(item.asset)} → G</h3><div class="sub">${esc(item.status)} investment · ${esc(item.reward_rate)}% ${String(item.reward_frequency || item.rate_unit).toLowerCase()}</div></div></div><span class="pill ${item.status === "ACTIVE" ? "" : "gray"}">${esc(item.status === "ACTIVE" ? "Generating" : item.status)}</span></div><div class="metric-row"><div class="metric"><span>Invested</span><strong>${amount(item.principal)} ${esc(item.asset)}</strong></div><div class="metric"><span>Started</span><strong>${new Date(item.started_at).toLocaleDateString()}</strong></div><div class="metric"><span>G generated</span><strong>${amount(item.g_generated)} G</strong></div><div class="metric"><span>Status</span><strong>${esc(item.status)}</strong></div></div></div>`).join("") : `<div class="card empty-state">No active investments yet. Choose an enabled product to start generating G.</div>`}</div></div>
    <div class="card split-card section"><div class="section-head"><h2>G generation history</h2><span class="pill gray">${generation.length ? "Backend records" : "No records"}</span></div>${generation.length ? `<div class="history-list">${generation.map(item => activity("↗", `${item.asset} investment`, new Date(item.created_at).toLocaleString(), `+${amount(item.amount)} G`, "up")).join("")}</div>` : `<div class="empty-state">Confirmed G generation events will appear here after an investment is created and rewards are accounted for.</div>`}</div>`;
}
function walletPage() {
  return `<div class="page-intro"><div><p class="eyebrow">Asset management</p><h1>Your wallet.</h1><p>Hold, deposit, withdraw and convert supported digital assets.</p></div><div class="page-actions"><button class="btn btn-secondary" data-modal="withdraw">Withdraw</button><button class="btn btn-primary" data-modal="deposit">Deposit</button></div></div>
    <div class="card stat-card" style="margin-bottom:18px"><div class="stat-label">Total wallet balance <span class="pill">Backend wallet</span></div><div class="stat-value" style="font-size:34px">Not priced</div><div class="stat-meta">A live total appears when a market price source is connected.</div></div>
    <div class="card asset-list">${state.walletAssets.map(item => `${assetRow(item.symbol, item.name, amount(item.amount), item.symbol === "G" ? `$${amount(state.portfolio.gEstimatedValue)}` : "No price source", "detail")}${Number(item.invested_amount || 0) > 0 ? `<div class="asset-invested-note">Invested: ${amount(item.invested_amount)} ${esc(item.symbol)}</div>` : ""}`).join("") || `<div class="empty-state">Your wallet has no configured assets yet.</div>`}</div>
    <div class="grid grid-2 section"><div class="notice"><span class="notice-icon">i</span><div><strong>Blockchain wallet infrastructure is not enabled</strong><p>Deposit and withdrawal screens are ready for a real provider integration. No addresses or transaction hashes are fabricated.</p></div></div><div class="card split-card"><div class="section-head"><h2>Wallet activity</h2><button class="btn-quiet" data-profile="Transactions">View all →</button></div><div class="empty-state">No confirmed wallet activity yet.</div></div></div>`;
}
function marketsPage() {
  const genesis = state.config?.genesis;
  const rows = (state.config?.assets || []).map(asset => asset.symbol === "G"
    ? ["G", asset.name, `$${genesis?.referencePrice || "—"}`, "PRE-LAUNCH", "gold"]
    : [asset.symbol, asset.name, "Unavailable", "NOT CONNECTED", "gray"]);
  return `<div class="page-intro"><div><p class="eyebrow">Supported assets</p><h1>Markets.</h1><p>Reference market information for supported assets.</p></div></div>
    <div class="notice"><span class="notice-icon">i</span><div><strong>Market data connection status</strong><p>G displays a configured pre-launch reference price. Other asset pricing remains unavailable until a market data provider is connected.</p></div></div>
    <div class="card market-list section"><div class="market-row header"><span>Asset</span><span>Reference price</span><span style="text-align:right">24h change</span><span></span></div>${rows.map(([symbol,name,price,change,cls]) => `<div class="market-row">${icon(symbol,name)}<div class="asset-info"><strong>${name}</strong><span>${symbol}${symbol==="G" ? " · reference only" : ""}</span></div><div class="market-price"><strong>${price}</strong></div><div class="market-change"><span class="pill ${cls === "gold" ? "gold" : cls === "gray" ? "gray" : ""}">${change}</span></div><div class="mini-chart"><svg viewBox="0 0 70 26"><path d="M1 20 C12 18 12 12 24 15 S35 6 45 12 S57 8 69 3" fill="none" stroke="${cls==="down" ? "#ad6257" : cls==="gold" ? "#d4a83f" : "#187c68"}" stroke-width="2" stroke-linecap="round"/></svg></div></div>`).join("")}</div>
    <div class="card split-card section"><h3>About the Genesis G reference price</h3><p>Genesis G has not launched yet. The displayed $0.10 value is a pre-launch reference configured by Genesis, not a live market price. Actual market pricing will depend on the official token launch and available markets.</p></div>`;
}
function adminProductForm(product, assets) {
  const id = product?.id || "";
  const assetOptions = assets.map(asset => {
    const selected = asset.id === product?.asset_id ? " selected" : "";
    return `<option value="${esc(asset.id)}"${selected}>${esc(asset.symbol)}</option>`;
  }).join("");
  const frequencyOptions = ["DAILY", "WEEKLY", "MONTHLY", "FIXED"].map(value => {
    const selected = value === (product?.reward_frequency || product?.rate_unit) ? " selected" : "";
    return `<option${selected}>${value}</option>`;
  }).join("");
  const status = product?.status || "ACTIVE";
  return `<form class="admin-product-form" data-product-form="${esc(id)}">
    <div class="grid grid-2">
      <div class="form-field"><label>Name</label><input name="name" value="${esc(product?.name || "")}" required /></div>
      <div class="form-field"><label>Supported asset</label><select name="assetId">${assetOptions}</select></div>
      <div class="form-field"><label>Minimum amount</label><input name="minimumAmount" type="number" min="0" step="any" value="${esc(product?.minimum_amount || "")}" required /></div>
      <div class="form-field"><label>Maximum amount</label><input name="maximumAmount" type="number" min="0" step="any" value="${esc(product?.maximum_amount || "")}" placeholder="No maximum" /></div>
      <div class="form-field"><label>Reward rate (%)</label><input name="rewardRate" type="number" min="0" step="any" value="${esc(product?.reward_rate || "")}" required /></div>
      <div class="form-field"><label>Frequency</label><select name="rewardFrequency">${frequencyOptions}</select></div>
      <div class="form-field"><label>Duration in days</label><input name="durationDays" type="number" min="1" step="1" value="${esc(product?.duration_days || "")}" placeholder="Flexible" /></div>
      <div class="form-field"><label>Fee rate (%)</label><input name="feeRate" type="number" min="0" step="any" value="${esc(product?.fee_rate || "0")}" /></div>
    </div>
    <div class="form-field"><label>Terms</label><textarea name="durationTerms" rows="2">${esc(product?.duration_terms || "")}</textarea></div>
    <div class="form-field"><label>Risk disclosure</label><textarea name="riskTerms" rows="2">${esc(product?.risk_terms || "")}</textarea></div>
    <div class="setting-line"><div><strong>${esc(status)}</strong><span>Only ACTIVE products appear on Invest.</span></div><select name="status"><option${status === "ACTIVE" ? " selected" : ""}>ACTIVE</option><option${status === "PAUSED" ? " selected" : ""}>PAUSED</option><option${status === "CLOSED" ? " selected" : ""}>CLOSED</option></select></div>
    <button class="btn btn-primary" type="submit">${product ? "Save product" : "Create product"}</button>
  </form>`;
}
function adminPage() {
  if (state.user?.role !== "ADMIN") return `<div class="page-intro"><div><p class="eyebrow">Protected workspace</p><h1>Admin access required.</h1><p>Your account is not authorized to manage platform configuration.</p></div></div><div class="notice"><span class="notice-icon">!</span><div><strong>This area is protected server-side</strong><p>Admin authorization is enforced by the backend. Ask an authorized Genesis administrator to grant access.</p></div></div>`;
  const admin = state.adminConfig || {};
  const genesis = admin.genesis || state.config?.genesis || {};
  const products = admin.products || state.config?.products || [];
  const assets = admin.assets || state.config?.assets || [];
  let panel = "";
  if (state.adminTab === "Genesis G") {
    const statusOptions = ["PRE-LAUNCH", "LIVE", "LISTED"].map(value => `<option${value === (genesis.status || "PRE-LAUNCH") ? " selected" : ""}>${value}</option>`).join("");
    panel = `<form id="genesis-settings-form" class="form-stack"><div class="grid grid-2"><div class="form-field"><label>Token name</label><input name="name" value="${esc(genesis.name || "Genesis")}" required /></div><div class="form-field"><label>Symbol</label><input name="symbol" value="${esc(genesis.symbol || "G")}" required /></div><div class="form-field"><label>Status</label><select name="status">${statusOptions}</select></div><div class="form-field"><label>Reference price</label><input name="referencePrice" type="number" min="0" step="any" value="${esc(genesis.referencePrice || "0.10")}" required /></div></div><div class="form-field"><label>Description</label><textarea name="description" rows="3">${esc(genesis.description || "")}</textarea></div><button class="btn btn-primary" type="submit">Save Genesis settings</button></form>`;
  } else if (state.adminTab === "Investments") {
    panel = `<div class="section-head"><div><h3>Investment products</h3><p>Rates, limits, durations and disclosures are read by the user-facing Invest page.</p></div><button class="btn btn-secondary" data-new-product>New product</button></div>${state.adminNewProduct ? adminProductForm(null, assets) : ""}<div class="admin-products">${products.length ? products.map(product => adminProductForm(product, assets)).join("") : `<div class="empty-state">No products configured.</div>`}</div>`;
  } else if (state.adminTab === "Assets") {
    panel = `<div class="admin-assets">${assets.map(asset => `<div class="setting-line"><div><strong>${esc(asset.symbol)} · ${esc(asset.name)}</strong><span>Wallet display, investing and custody flags</span></div><div class="asset-switches"><label><input type="checkbox" data-asset-flag="${esc(asset.id)}" data-flag="enabled" ${asset.enabled ? "checked" : ""} /> Display</label><label><input type="checkbox" data-asset-flag="${esc(asset.id)}" data-flag="investmentEnabled" ${asset.investment_enabled ? "checked" : ""} /> Invest</label><label><input type="checkbox" data-asset-flag="${esc(asset.id)}" data-flag="conversionEnabled" ${asset.conversion_enabled ? "checked" : ""} /> Convert</label><button class="btn btn-secondary" data-save-asset="${esc(asset.id)}">Save</button></div></div>`).join("")}</div>`;
  } else {
    panel = `<div class="empty-state">${esc(state.adminTab)} is protected and ready for a connected service. Investment and Genesis configuration are available above.</div>`;
  }
  const tabs = ["Genesis G", "Investments", "Assets", "Conversions", "Fees", "Users", "Transactions", "Platform settings", "Audit logs"];
  const tabButtons = tabs.map(tab => `<button class="admin-tab ${state.adminTab === tab ? "active" : ""}" data-admin-tab="${esc(tab)}">${esc(tab)}</button>`).join("");
  return `<div class="page-intro"><div><p class="eyebrow">Protected workspace</p><h1>Admin console.</h1><p>Manage persisted Genesis configuration. Changes are audit logged and reflected in the user application.</p></div><span class="pill">Admin · ${esc(state.user?.username || "authorized")}</span></div><div class="admin-shell"><div class="admin-tabs">${tabButtons}</div><div class="card admin-panel"><div class="section-head"><div><h2>${esc(state.adminTab)}</h2><p>Server-side authorization is required for every save.</p></div></div>${panel}<div class="disclosure" style="margin-top:18px">Reference prices are informational until a live market provider is connected. Never describe configured rates as guaranteed returns.</div></div></div>`;
}
function modalContent() {
  if (state.modal === "deposit") return `<div class="modal"><div class="modal-head"><div><h2>Deposit assets</h2><p>Select an asset and network to prepare a deposit.</p></div><button class="close" data-close>×</button></div><div class="form-stack"><div class="form-field"><label>Asset</label><select><option>USDT · Tether</option><option>BNB</option><option>BTC</option><option>ETH</option></select></div><div class="form-field"><label>Network</label><select><option>Select a network</option><option>ERC20 · Not enabled</option><option>TRC20 · Not enabled</option></select></div><div class="unavailable"><strong>Wallet infrastructure not enabled</strong><br/>A real deposit address and QR code will appear here when a supported custody or blockchain wallet integration is connected. Never send funds to an address that has not been provided by Genesis.</div></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" data-pending>Check availability</button></div></div>`;
  if (state.modal === "withdraw") return `<div class="modal"><div class="modal-head"><div><h2>Withdraw assets</h2><p>Send a supported asset to an external destination.</p></div><button class="close" data-close>×</button></div><div class="form-stack"><div class="form-field"><label>Asset</label><select><option>USDT · Available 1,250.00</option><option>BNB · Available 0.85</option><option>BTC · Available 0.012</option><option>ETH · Available 0.42</option></select></div><div class="form-field"><label>Network</label><select><option>Select a network</option><option>ERC20 · Not enabled</option><option>TRC20 · Not enabled</option></select></div><div class="form-field"><label>Destination address</label><input placeholder="Enter a wallet address" /></div><div class="form-field"><label>Amount</label><input type="number" min="0" placeholder="0.00" /><div class="input-note"><span>Network fee: pending configuration</span><span>Available: 1,250 USDT</span></div></div><div class="unavailable">Withdrawals are unavailable until blockchain wallet infrastructure and server-side confirmation are connected.</div></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" data-pending>Review withdrawal</button></div></div>`;
  if (state.modal === "convert") {
    const pairs = (state.config?.conversions?.pairs || []).filter(pair => pair.from === "G");
    const options = pairs.map(pair => `<option value="${esc(pair.to)}" data-rate="${esc(pair.rate)}">${esc(pair.to)}</option>`).join("");
    const body = pairs.length ? `<div class="form-stack"><div class="form-field"><label>From</label><select disabled><option>Genesis G · Available ${amount(state.portfolio.gBalance)} G</option></select></div><div class="form-field"><label>Amount</label><input id="convert-amount" type="number" min="0" max="${esc(state.portfolio.gBalance)}" value="0" /></div><div class="form-field"><label>To</label><select id="convert-to">${options}</select></div><div class="convert-summary"><div><span>Estimated receive</span><strong id="convert-estimate">0</strong></div><span id="convert-rate-note">Configured rate</span></div><div class="unavailable">Conversion preparation is connected to backend configuration. No conversion transaction will be submitted until the execution provider is enabled.</div></div>` : `<div class="unavailable">Conversion is currently unavailable.</div>`;
    const confirm = pairs.length ? `<button class="btn btn-primary" data-pending>Confirm conversion</button>` : "";
    return `<div class="modal"><div class="modal-head"><div><h2>Convert Genesis G</h2><p>Conversion stays inside Wallet and only uses enabled backend pairs.</p></div><button class="close" data-close>×</button></div>${body}<div class="modal-footer"><button class="btn btn-secondary" data-close>Close</button>${confirm}</div></div>`;
  }
  if (state.modal === "asset") {
    const generation = state.portfolio.generation || [];
    const label = generation.length ? "Backend records" : "No records";
    return `<div class="modal"><div class="modal-head"><div><h2>Genesis G</h2><p>Upcoming asset · Genesis ecosystem</p></div><button class="close" data-close>×</button></div><div class="section"><span class="pill gold">${esc(state.config?.genesis?.status || "PRE-LAUNCH")}</span><p>Genesis G has not launched yet. The configured value is a reference price, not a live market price.</p><div class="page-actions"><button class="btn btn-primary" data-modal="convert">Convert</button><button class="btn btn-secondary" data-pending>Send</button><button class="btn btn-secondary" data-pending>Receive</button></div></div><div class="section"><div class="section-head"><h2>G activity</h2><span class="pill gray">${label}</span></div></div></div>`;
  }
  if (state.modal === "invest") {
    const product = state.selectedProduct;
    if (!product) return `<div class="modal"><div class="modal-head"><h2>Investment unavailable</h2><button class="close" data-close>×</button></div><div class="unavailable">Choose an enabled investment product from the Invest page.</div></div>`;
    const asset = walletAsset(product.asset);
    return `<div class="modal"><div class="modal-head"><div><h2>Invest ${esc(product.asset)}</h2><p>Review the configured terms before continuing.</p></div><button class="close" data-close>×</button></div><form id="investment-form" class="form-stack"><div class="setting-line"><div><strong>Available balance</strong><span>Backend wallet balance</span></div><strong>${amount(asset.amount)} ${esc(product.asset)}</strong></div><div class="form-field"><label>Amount</label><input name="amount" type="number" min="${esc(product.minimum_amount)}" max="${esc(product.maximum_amount || "")}" step="any" value="${esc(state.investAmount)}" required /><div class="input-note"><span>Minimum: ${esc(product.minimum_amount)} ${esc(product.asset)}</span><span>${product.maximum_amount ? `Maximum: ${esc(product.maximum_amount)}` : "No maximum configured"}</span></div></div><div class="setting-line"><div><strong>Current reward rate</strong><span>Configured G generation rate</span></div><strong>${esc(productRate(product))}</strong></div><div class="notice"><span class="notice-icon">i</span><div><strong>${esc(product.duration_terms || "Configured investment terms")}</strong><p>${esc(product.risk_terms || "Review applicable terms and risks.")}</p></div></div><p class="auth-error" id="investment-error"></p><button class="btn btn-primary" type="submit">Review investment</button></form></div>`;
  }
  if (state.modal === "invest-review") {
    const product = state.selectedProduct;
    return `<div class="modal"><div class="modal-head"><div><h2>Confirm investment</h2><p>This will move funds into an active backend investment.</p></div><button class="close" data-close>×</button></div><div class="form-stack"><div class="setting-line"><div><strong>Asset</strong><span>${esc(product.asset)}</span></div><strong>${esc(state.investAmount)} ${esc(product.asset)}</strong></div><div class="setting-line"><div><strong>Reward rate</strong><span>Configured G generation rate</span></div><strong>${esc(productRate(product))}</strong></div><div class="setting-line"><div><strong>Terms</strong><span>${esc(product.duration_terms || "Configured terms")}</span></div></div><div class="unavailable">The server will validate balance, limits, precision and product availability before committing the investment atomically.</div></div><div class="modal-footer"><button class="btn btn-secondary" data-back-invest>Back</button><button class="btn btn-primary" data-confirm-investment>Confirm investment</button></div></div>`;
  }
  if (state.modal === "investment-detail") {
    const investment = state.selectedInvestment;
    const detail = investment ? [
      `<div class="grid grid-2">`,
      stat("Invested", `${amount(investment.principal)} ${esc(investment.asset)}`, "Principal"),
      stat("G generated", `${amount(investment.g_generated)} G`, "Accounted rewards", "g-highlight"),
      stat("Reward rate", `${esc(investment.reward_rate)}%`, String(investment.reward_frequency || investment.rate_unit).toLowerCase()),
      stat("Status", esc(investment.status), "Backend status"),
      `</div><div class="section"><p class="disclosure">${esc(investment.duration_terms || "Configured terms")} ${esc(investment.risk_terms || "")}</p><div class="empty-state">Reward history is available from the Portfolio generation history after each accounted period.</div></div>`
    ].join("") : `<div class="empty-state">Investment detail is unavailable.</div>`;
    return `<div class="modal"><div class="modal-head"><div><h2>${esc(investment?.asset || "Investment")} investment</h2><p>Investment detail and persisted G generation records.</p></div><button class="close" data-close>×</button></div>${detail}</div>`;
  }
  return `<div class="modal"><div class="modal-head"><div><h2>Start investing</h2><p>Choose an enabled product from the Invest page.</p></div><button class="close" data-close>×</button></div><div class="unavailable">No investment product is selected.</div></div>`;
}
function render() {
  if (!state.user) {
    document.getElementById("app").innerHTML = authPage();
    bind();
    return;
  }
  const page = state.page;
  const pages = { home: [homePage, "Home"], invest: [investPage, "Invest & Generate G"], wallet: [walletPage, "Wallet"], portfolio: [portfolioPage, "Portfolio"], markets: [marketsPage, "Markets"], admin: [adminPage, "Admin"] };
  const [view, title] = pages[page] || pages.home;
  document.getElementById("app").innerHTML = layout(view(), title);
  bind();
}
function toast(message, type = "") {
  const el = document.createElement("div"); el.className = `toast ${type}`; el.textContent = message;
  document.getElementById("toast-region").appendChild(el); setTimeout(() => el.remove(), 3200);
}
function bind() {
  document.querySelectorAll("[data-auth-mode]").forEach(el => el.addEventListener("click", () => { state.authMode = el.dataset.authMode; render(); }));
  document.querySelector("#auth-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const error = document.querySelector("#auth-error");
    error.textContent = "";
    const endpoint = state.authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    if (state.authMode === "login") payload.identifier = payload.identifier.trim().toLowerCase();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to authenticate.");
      state.user = result.user;
      await loadBackendData();
      render();
    } catch (requestError) {
      error.textContent = requestError.message;
    }
  });
  document.querySelectorAll("[data-page]").forEach(el => el.addEventListener("click", () => { state.page = el.dataset.page; state.profileOpen = false; state.modal = null; render(); window.scrollTo(0,0); }));
  document.querySelector("#profile-toggle")?.addEventListener("click", () => { state.profileOpen = !state.profileOpen; render(); });
  document.querySelectorAll("[data-profile]").forEach(el => el.addEventListener("click", async () => {
    state.profileOpen = false;
    if (el.dataset.profile === "Sign out") {
      await fetch("/api/auth/logout", { method: "POST" });
      state.user = null; state.walletAssets = []; state.portfolio = { investments: [], rewards: { total_generated: "0", today_generated: "0" } }; render();
    } else { toast(`${el.dataset.profile} is ready for the connected account service.`, "success"); render(); }
  }));
  document.querySelectorAll("[data-modal]").forEach(el => el.addEventListener("click", () => { state.modal = el.dataset.modal; render(); }));
  document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => { state.modal = null; render(); }));
  document.querySelector("#modal-backdrop")?.addEventListener("click", e => { if (e.target.id === "modal-backdrop") { state.modal = null; render(); } });
  document.querySelectorAll("[data-pending]").forEach(el => el.addEventListener("click", () => toast("This action is pending a real backend or wallet integration.", "success")));
  document.querySelectorAll("[data-asset]").forEach(el => el.addEventListener("click", () => { if (el.dataset.asset === "G") { state.modal = "asset"; render(); } else toast(`${el.dataset.asset} details are ready for the connected asset service.`, "success"); }));
  document.querySelectorAll("[data-invest]").forEach(el => el.addEventListener("click", () => { state.selectedProduct = productById(el.dataset.invest); state.investAmount = ""; state.modal = "invest"; render(); }));
  document.querySelectorAll("[data-investment-detail]").forEach(el => el.addEventListener("click", async () => {
    try {
      const response = await fetch(`/api/investments/${encodeURIComponent(el.dataset.investmentDetail)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load investment.");
      state.selectedInvestment = result.investment;
      state.modal = "investment-detail";
      render();
    } catch (error) { toast(error.message); }
  }));
  document.querySelector("#investment-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = String(form.get("amount") || "").trim();
    const product = state.selectedProduct;
    const error = document.querySelector("#investment-error");
    if (!value || Number(value) <= 0 || !Number.isFinite(Number(value))) {
      error.textContent = "Enter an amount greater than zero.";
      return;
    }
    if (Number(value) < Number(product.minimum_amount)) {
      error.textContent = `Minimum investment is ${product.minimum_amount} ${product.asset}.`;
      return;
    }
    if (product.maximum_amount && Number(value) > Number(product.maximum_amount)) {
      error.textContent = `Maximum investment is ${product.maximum_amount} ${product.asset}.`;
      return;
    }
    state.investAmount = value;
    state.modal = "invest-review";
    render();
  });
  document.querySelector("[data-back-invest]")?.addEventListener("click", () => { state.modal = "invest"; render(); });
  document.querySelector("[data-confirm-investment]")?.addEventListener("click", async () => {
    const button = document.querySelector("[data-confirm-investment]");
    button.disabled = true;
    try {
      const response = await fetch("/api/investments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: state.selectedProduct.id, amount: state.investAmount }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create investment.");
      state.modal = null;
      await loadBackendData();
      render();
      toast("Investment created. G generation will be accounted from backend elapsed periods.", "success");
    } catch (error) {
      button.disabled = false;
      toast(error.message);
    }
  });
  document.querySelectorAll("[data-admin-tab]").forEach(el => el.addEventListener("click", () => { state.adminTab = el.dataset.adminTab; state.adminNewProduct = false; render(); }));
  document.querySelector("[data-new-product]")?.addEventListener("click", () => { state.adminNewProduct = true; render(); });
  document.querySelectorAll("[data-product-form]").forEach(form => form.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.assetId = payload.assetId;
    try {
      const endpoint = form.dataset.productForm ? `/api/admin/investment-products/${form.dataset.productForm}` : "/api/admin/investment-products";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save product.");
      state.adminNewProduct = false;
      await loadBackendData();
      state.adminConfig = (await (await fetch("/api/admin")).json());
      render();
      toast("Investment product saved.", "success");
    } catch (error) { toast(error.message); }
  }));
  document.querySelector("#genesis-settings-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/admin/genesis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save Genesis settings.");
      await loadBackendData();
      state.adminConfig = (await (await fetch("/api/admin")).json());
      render();
      toast("Genesis settings saved.", "success");
    } catch (error) { toast(error.message); }
  });
  document.querySelectorAll("[data-save-asset]").forEach(button => button.addEventListener("click", async () => {
    const id = button.dataset.saveAsset;
    const flags = [...document.querySelectorAll(`[data-asset-flag="${id}"]`)];
    const payload = Object.fromEntries(flags.map(flag => [flag.dataset.flag, flag.checked]));
    try {
      const response = await fetch(`/api/admin/assets/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save asset.");
      state.adminConfig = await (await fetch("/api/admin")).json();
      render();
      toast("Asset settings saved.", "success");
    } catch (error) { toast(error.message); }
  }));
  const amount = document.querySelector("#convert-amount"), to = document.querySelector("#convert-to"), estimate = document.querySelector("#convert-estimate");
  const rateNote = document.querySelector("#convert-rate-note");
  const update = () => {
    if (!amount || !to || !estimate) return;
    const rate = Number(to.options[to.selectedIndex]?.dataset.rate || 0);
    estimate.textContent = `${(Number(amount.value || 0) * rate).toFixed(8)} ${to.value}`;
    if (rateNote) rateNote.textContent = `Configured rate: ${rate} ${to.value} per G`;
  };
  amount?.addEventListener("input", update); to?.addEventListener("change", update);
  update();
}
async function loadBackendData() {
  const configResponse = await fetch("/api/config");
  if (configResponse.ok) state.config = await configResponse.json();
  const [walletResponse, portfolioResponse] = await Promise.all([fetch("/api/wallet"), fetch("/api/portfolio")]);
  if (walletResponse.ok) state.walletAssets = (await walletResponse.json()).assets;
  if (portfolioResponse.ok) state.portfolio = await portfolioResponse.json();
  if (state.user?.role === "ADMIN") {
    const adminResponse = await fetch("/api/admin");
    if (adminResponse.ok) state.adminConfig = await adminResponse.json();
  }
}
async function boot() {
  try {
    const response = await fetch("/api/session");
    if (response.ok) {
      const session = await response.json();
      if (session.user) {
        state.user = session.user;
        await loadBackendData();
      }
    }
  } catch {
    // The auth screen still renders and explains the issue through form errors.
  }
  render();
}
boot();