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
  walletAssets: [],
  portfolio: { investments: [], rewards: { total_generated: "0", today_generated: "0" } }
};

const navItems = [
  ["home", "Home", "⌂"], ["invest", "Invest", "↗"], ["wallet", "Wallet", "◈"],
  ["portfolio", "Portfolio", "◒"], ["markets", "Markets", "⌁"]
];

function GMark() {
  return `<svg class="g-mark" viewBox="0 0 40 40" aria-label="Genesis G mark"><rect width="40" height="40" rx="13" fill="#101c24"/><path d="M28.5 11.5c-2.2-2-5.1-3.1-8.6-3.1-7.4 0-12.5 5.2-12.5 12.7S12.5 33.8 20 33.8c3.5 0 6.4-1.1 8.6-3.1V20.3H20" fill="none" stroke="#d4a83f" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
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
  return `<div class="asset-row ${action ? "clickable" : ""}" ${action ? `data-asset="${symbol}"` : ""}>${icon(symbol, name)}<div class="asset-info"><strong>${name}</strong><span>${symbol}${symbol === "G" ? " · Pre-launch" : ""}</span></div><div class="asset-amount"><strong>${amount} ${symbol}</strong><span>${usd}</span></div></div>`;
}
function homePage() {
  const firstName = state.user?.full_name?.split(" ")[0] || "there";
  const gBalance = state.walletAssets.find(item => item.symbol === "G")?.amount || "0";
  const totalGenerated = state.portfolio.rewards?.total_generated || "0";
  return `<div class="page-intro"><div><p class="eyebrow">Genesis wallet</p><h1>Good morning, ${firstName}.</h1><p>Your assets are ready to work for you.</p></div><div class="page-actions"><button class="btn btn-primary" data-modal="deposit">Deposit funds</button></div></div>
  <div class="grid grid-4 home-stats">${stat("Total wallet value", "Not priced", "Market source not connected")}${stat("Invested amount", "$0.00", `${state.portfolio.investments.length} active investments`)}${stat("Today's G earnings", `+${state.portfolio.rewards?.today_generated || "0"} G`, "Backend-accounted reward generation", "g-highlight")}${stat("G balance", `${gBalance} G`, "Pre-launch reference value")}</div>
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
    <div class="grid grid-2 section">${products.length ? products.map(product => investmentCard(product.asset, product.name.replace(` → Genesis G`, ""), "Balance loaded from wallet", `${product.minimum_amount} ${product.asset}`, `${product.reward_rate}% ${String(product.rate_unit).toLowerCase()}`, "0")).join("") : `<div class="card empty-state">No investment products are available right now.</div>`}</div>
    <div class="section disclosure">Investment rewards are subject to platform availability, terms and risks. Genesis does not represent these configured rates as guaranteed or risk-free returns.</div>`;
}
function investmentCard(symbol, name, available, minimum, rate, amount) {
  return `<div class="card investment-card"><div class="investment-top"><div class="investment-asset">${icon(symbol,name)}<div><h3>${name}</h3><div class="sub">${symbol} · Available ${available}</div></div></div><span class="pill ${rate === "Configurable" ? "gray" : ""}">${rate === "Configurable" ? "Coming soon" : "Enabled"}</span></div><div class="metric-row"><div class="metric"><span>Minimum investment</span><strong>${minimum}</strong></div><div class="metric"><span>Reward terms</span><strong>${rate}</strong></div><div class="metric"><span>Currently invested</span><strong>${amount}</strong></div><div class="metric"><span>Duration</span><strong>Flexible</strong></div></div><button class="btn ${rate === "Configurable" ? "btn-secondary" : "btn-primary"}" style="width:100%" data-invest="${symbol}" ${rate === "Configurable" ? "disabled" : ""}>${rate === "Configurable" ? "Investment unavailable" : "Start investing"}</button></div>`;
}
function portfolioPage() {
  const rewards = state.portfolio.rewards || { total_generated: "0", today_generated: "0" };
  return `<div class="page-intro"><div><p class="eyebrow">My investment / Genesis generation</p><h1>Your Genesis portfolio.</h1><p>A clear view of the assets generating G for you.</p></div><button class="btn btn-primary" data-page="invest">Add investment</button></div>
    <div class="grid grid-2"><div class="generator-card"><span class="generator-label">Genesis generator · backend view</span><h2>${state.portfolio.investments.length ? "Generating G" : "Ready to generate G"}</h2><p>Your invested assets generate rewards according to configured terms.</p><div class="generator-number">${rewards.total_generated} G</div><div class="flow"><span class="flow-node">Assets</span><span class="flow-arrow">→</span><span class="flow-node">G generation</span><span class="flow-arrow">→</span><span class="flow-node">G</span></div></div><div class="grid grid-2">${stat("Total invested","Not priced",`${state.portfolio.investments.length} active investments`)}${stat("Today's generation",`+${rewards.today_generated} G`,"Backend-accounted reward","g-highlight")}${stat("Total generated",`${rewards.total_generated} G`,"Auditable reward records")}${stat("Reference value","Not priced","G pre-launch")}</div></div>
    <div class="section"><div class="section-head"><div><h2>Active investments</h2><p>Reward generation visualization, not physical mining.</p></div><span class="pill ${state.portfolio.investments.length ? "" : "gray"}">${state.portfolio.investments.length} active</span></div><div class="grid grid-2">${state.portfolio.investments.length ? state.portfolio.investments.map(item => `<div class="card investment-card"><div class="investment-top"><div class="investment-asset">${icon(item.asset,item.asset)}<div><h3>${item.asset} → G</h3><div class="sub">Active investment · ${item.reward_rate}% ${String(item.rate_unit).toLowerCase()}</div></div></div><span class="pill">Generating</span></div><div class="metric-row"><div class="metric"><span>Invested</span><strong>${item.principal} ${item.asset}</strong></div><div class="metric"><span>Started</span><strong>${new Date(item.started_at).toLocaleDateString()}</strong></div><div class="metric"><span>Reward terms</span><strong>Configured</strong></div><div class="metric"><span>Status</span><strong>${item.status}</strong></div></div></div>`).join("") : `<div class="card empty-state">No active investments yet. Choose an enabled product to start generating G.</div>`}</div></div>
    <div class="card split-card section"><div class="section-head"><h2>G generation history</h2><span class="pill gray">${state.portfolio.investments.length ? "Backend records" : "No records"}</span></div><div class="empty-state">Confirmed G generation events will appear here after an investment is created and rewards are accounted for.</div></div>`;
}
function walletPage() {
  return `<div class="page-intro"><div><p class="eyebrow">Asset management</p><h1>Your wallet.</h1><p>Hold, deposit, withdraw and convert supported digital assets.</p></div><div class="page-actions"><button class="btn btn-secondary" data-modal="withdraw">Withdraw</button><button class="btn btn-primary" data-modal="deposit">Deposit</button></div></div>
    <div class="card stat-card" style="margin-bottom:18px"><div class="stat-label">Total wallet balance <span class="pill">Backend wallet</span></div><div class="stat-value" style="font-size:34px">Not priced</div><div class="stat-meta">A live total appears when a market price source is connected.</div></div>
    <div class="card asset-list">${state.walletAssets.map(item => assetRow(item.symbol, item.name, item.amount, "No price source", "detail")).join("") || `<div class="empty-state">Your wallet has no configured assets yet.</div>`}</div>
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
function adminPage() {
  if (state.user?.role !== "ADMIN") return `<div class="page-intro"><div><p class="eyebrow">Protected workspace</p><h1>Admin access required.</h1><p>Your account is not authorized to manage platform configuration.</p></div></div><div class="notice"><span class="notice-icon">!</span><div><strong>This area is protected server-side</strong><p>Admin authorization is enforced by the backend. Ask an authorized Genesis administrator to grant access.</p></div></div>`;
  const panel = state.adminTab === "Genesis G" ? `<div class="setting-line"><div><strong>Token status</strong><span>Visible to users across the platform</span></div><span class="pill gold">PRE-LAUNCH</span></div><div class="setting-line"><div><strong>Pre-launch reference price</strong><span>Informational value, not a live market price</span></div><strong>$0.10</strong></div><div class="setting-line"><div><strong>Conversion availability</strong><span>Enable configured G conversion pairs</span></div><button class="switch on" data-switch><i></i></button></div><div class="setting-line"><div><strong>Supported conversion pairs</strong><span>G → USDT · G → BNB · G → BTC</span></div><button class="btn btn-secondary">Edit</button></div>` : state.adminTab === "Investments" ? `<div class="setting-line"><div><strong>USDT reward rate</strong><span>Terms displayed on Invest & Portfolio</span></div><strong>1.5% daily</strong></div><div class="setting-line"><div><strong>BNB reward rate</strong><span>Terms displayed on Invest & Portfolio</span></div><strong>1.2% daily</strong></div><div class="setting-line"><div><strong>Investment products</strong><span>USDT and BNB enabled · BTC and ETH coming soon</span></div><button class="btn btn-secondary">Manage</button></div>` : `<div class="setting-line"><div><strong>USDT</strong><span>Deposit · Withdraw · Invest</span></div><button class="switch on" data-switch><i></i></button></div><div class="setting-line"><div><strong>BNB</strong><span>Deposit · Withdraw · Invest</span></div><button class="switch on" data-switch><i></i></button></div><div class="setting-line"><div><strong>BTC / ETH / SOL</strong><span>Wallet display enabled · custody integration pending</span></div><button class="switch" data-switch><i></i></button></div>`;
  return `<div class="page-intro"><div><p class="eyebrow">Protected workspace</p><h1>Admin console.</h1><p>Configure what users see. All values below are local demo settings.</p></div><span class="pill">Admin · Khubab</span></div><div class="admin-shell"><div class="admin-tabs">${["Genesis G","Investments","Assets","Conversions","Fees","Users","Transactions","Platform settings","Audit logs"].map(tab => `<button class="admin-tab ${state.adminTab===tab?"active":""}" data-admin-tab="${tab}">${tab}</button>`).join("")}</div><div class="card admin-panel"><div class="section-head"><div><h2>${state.adminTab}</h2><p>Changes flow into the user application after save.</p></div><button class="btn btn-primary" data-save-settings>Save changes</button></div>${panel}<div class="disclosure" style="margin-top:18px">Admin authorization must be enforced server-side when this demo is connected to a backend. Hiding a navigation item is not security.</div></div></div>`;
}
function modalContent() {
  if (state.modal === "deposit") return `<div class="modal"><div class="modal-head"><div><h2>Deposit assets</h2><p>Select an asset and network to prepare a deposit.</p></div><button class="close" data-close>×</button></div><div class="form-stack"><div class="form-field"><label>Asset</label><select><option>USDT · Tether</option><option>BNB</option><option>BTC</option><option>ETH</option></select></div><div class="form-field"><label>Network</label><select><option>Select a network</option><option>ERC20 · Not enabled</option><option>TRC20 · Not enabled</option></select></div><div class="unavailable"><strong>Wallet infrastructure not enabled</strong><br/>A real deposit address and QR code will appear here when a supported custody or blockchain wallet integration is connected. Never send funds to an address that has not been provided by Genesis.</div></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" data-pending>Check availability</button></div></div>`;
  if (state.modal === "withdraw") return `<div class="modal"><div class="modal-head"><div><h2>Withdraw assets</h2><p>Send a supported asset to an external destination.</p></div><button class="close" data-close>×</button></div><div class="form-stack"><div class="form-field"><label>Asset</label><select><option>USDT · Available 1,250.00</option><option>BNB · Available 0.85</option><option>BTC · Available 0.012</option><option>ETH · Available 0.42</option></select></div><div class="form-field"><label>Network</label><select><option>Select a network</option><option>ERC20 · Not enabled</option><option>TRC20 · Not enabled</option></select></div><div class="form-field"><label>Destination address</label><input placeholder="Enter a wallet address" /></div><div class="form-field"><label>Amount</label><input type="number" min="0" placeholder="0.00" /><div class="input-note"><span>Network fee: pending configuration</span><span>Available: 1,250 USDT</span></div></div><div class="unavailable">Withdrawals are unavailable until blockchain wallet infrastructure and server-side confirmation are connected.</div></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" data-pending>Review withdrawal</button></div></div>`;
  if (state.modal === "convert") return `<div class="modal"><div class="modal-head"><div><h2>Convert Genesis G</h2><p>Convert G into a supported asset from inside your wallet.</p></div><button class="close" data-close>×</button></div><div class="form-stack"><div class="form-field"><label>From</label><select id="convert-from"><option>Genesis G · 2,458.72 G</option></select></div><div class="form-field"><label>Amount</label><input id="convert-amount" type="number" min="0" value="500" /></div><div class="form-field"><label>To</label><select id="convert-to"><option value="USDT">USDT</option><option value="BNB">BNB</option><option value="BTC">BTC</option></select></div><div class="convert-summary"><div><span>Estimated receive</span><strong id="convert-estimate">$50.00 USDT</strong></div><span>Rate: $0.10 / G</span></div><div class="unavailable">Conversion is not currently available in this demo workspace. No transaction will be submitted.</div></div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" data-pending>Confirm conversion</button></div></div>`;
  if (state.modal === "asset") return `<div class="modal"><div class="modal-head"><div><h2>Genesis G</h2><p>Upcoming asset · Genesis ecosystem</p></div><button class="close" data-close>×</button></div><div class="grid grid-2">${stat("Balance","2,458.72 G","Held in wallet","g-highlight")}${stat("Estimated value","$245.87","Reference price $0.10")}</div><div class="section"><span class="pill gold">PRE-LAUNCH</span><p style="color:var(--muted);font-size:12px;line-height:1.6;margin:13px 0">Genesis G has not launched yet. The displayed pre-launch price is a reference value configured by Genesis and is not a live market price.</p><div class="page-actions"><button class="btn btn-primary" data-modal="convert">Convert</button><button class="btn btn-secondary" data-pending>Send</button><button class="btn btn-secondary" data-pending>Receive</button></div></div><div class="section"><div class="section-head"><h2>G activity</h2><span class="pill gray">Demo data</span></div>${activity("↗","G generation","Today, 09:42","+12.42 G","up")}${activity("◒","G held","Sep 01, 10:04","2,446.30 G","")}</div></div>`;
  return `<div class="modal"><div class="modal-head"><div><h2>Start investing</h2><p>Review your investment before continuing.</p></div><button class="close" data-close>×</button></div><div class="unavailable">Investment creation is ready for backend integration. This demo does not submit or fabricate financial activity.</div><div class="modal-footer"><button class="btn btn-secondary" data-close>Cancel</button><button class="btn btn-primary" data-pending>Continue to confirmation</button></div></div>`;
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
  document.querySelectorAll("[data-invest]").forEach(el => el.addEventListener("click", () => { state.modal = "invest"; render(); }));
  document.querySelectorAll("[data-admin-tab]").forEach(el => el.addEventListener("click", () => { state.adminTab = el.dataset.adminTab; render(); }));
  document.querySelectorAll("[data-switch]").forEach(el => el.addEventListener("click", () => el.classList.toggle("on")));
  document.querySelector("[data-save-settings]")?.addEventListener("click", () => toast("Configuration saved to the demo workspace.", "success"));
  const amount = document.querySelector("#convert-amount"), to = document.querySelector("#convert-to"), estimate = document.querySelector("#convert-estimate");
  const gRate = Number(state.config?.genesis?.referencePrice || 0);
  const update = () => { if (amount && to && estimate) estimate.textContent = `${(Number(amount.value || 0) * gRate).toFixed(2)} ${to.value}`; };
  amount?.addEventListener("input", update); to?.addEventListener("change", update);
}
async function loadBackendData() {
  const configResponse = await fetch("/api/config");
  if (configResponse.ok) state.config = await configResponse.json();
  const [walletResponse, portfolioResponse] = await Promise.all([fetch("/api/wallet"), fetch("/api/portfolio")]);
  if (walletResponse.ok) state.walletAssets = (await walletResponse.json()).assets;
  if (portfolioResponse.ok) state.portfolio = await portfolioResponse.json();
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