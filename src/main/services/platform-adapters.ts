// Platform adapters — versioned, per-platform selector recipes so the agent
// doesn't reinvent DOM logic for FB/TikTok/Amazon/Shopee on every run (the
// scenario eval's P2 "platform adapter / skill pack"). Each adapter declares
// the domains it covers, a selector version (bump when the platform's DOM
// changes), and browser_evaluate expressions for login-check / metric collect.
// Adapters are data — the agent executes the expressions via browser_evaluate.
export interface PlatformAdapterRecipe {
  name: string;
  goal: string;
  steps: string[];
}

export interface PlatformAdapter {
  id: string;
  name: string;
  /** Host substrings this adapter handles (lowercase). Empty = generic fallback. */
  domains: string[];
  /** Bump when the platform's DOM changes so stale recipes are detectable. */
  selectorVersion: number;
  /** Broad platform capabilities advertised to the agent. */
  capabilities: string[];
  /** URL hints for account/login health checks. */
  loginUrlHints: string[];
  /** Stable selectors grouped by purpose. */
  selectors: Record<string, string[]>;
  /** Reusable operational recipes; selectors are advisory and must be verified at runtime. */
  recipes: PlatformAdapterRecipe[];
  /** ISO date of last manual recipe/selector verification. */
  lastVerifiedAt: string;
  /** Operator-facing caveats for the agent prompt. */
  notes: string;
  /** A browser_evaluate expression returning { loggedIn: boolean, hint: string }. */
  loginCheck: string;
  /** Optional metric-collection expression returning a JSON object. */
  collectMetrics?: string;
}

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  {
    id: "generic-web",
    name: "通用网站",
    domains: [],
    selectorVersion: 1,
    capabilities: ["login-check", "snapshot", "generic-metrics"],
    loginUrlHints: [],
    selectors: {
      loginForm: ["input[type=password]", "form[action*=login i]"],
      logout: ["[href*=logout i]", "[href*=signout i]", "button[aria-label*=logout i]"],
    },
    recipes: [
      { name: "generic-login-check", goal: "判断页面是否可能已登录", steps: ["检测 password input", "检测 logout/signout 控件", "返回 loggedIn + hint,未知时保守标注 unknown"] },
    ],
    lastVerifiedAt: "2026-06-24",
    notes: "通用启发式只能做低置信度判断;对高风险操作必须让用户确认目标页面和字段。",
    loginCheck: "(function(){ var hasLogin = !!document.querySelector('input[type=password]'); var hasLogout = !!document.querySelector('[href*=logout i],[href*=signout i],button[aria-label*=logout i]'); return JSON.stringify({ loggedIn: hasLogout || !hasLogin, hint: hasLogout?'logout control seen':(hasLogin?'login form seen':'unknown') }); })()",
  },
  {
    id: "amazon-seller",
    name: "Amazon Seller Central",
    domains: ["sellercentral.amazon", "sellercentral-europe.amazon"],
    selectorVersion: 2,
    capabilities: ["login-check", "account-health", "price-review", "order-summary"],
    loginUrlHints: ["https://sellercentral.amazon.com/home", "https://sellercentral-europe.amazon.com/home"],
    selectors: {
      loggedIn: ["#sc-masthead", "#ap-name a", "[data-testid=user-name]"],
      challenge: ["#auth-mfa-form", "#captchacharacters", "[id*=challenge]"],
      orders: ["[data-test-id*=order]", "#orders-dashboard"],
    },
    recipes: [
      { name: "seller-login-health", goal: "检查账号是否在线或遇到风控", steps: ["打开 Seller Central home", "运行 loginCheck", "若出现 challenge selector,记录 challenge", "写入 account_health"] },
      { name: "price-review", goal: "采集商品/报价摘要", steps: ["导航到指定商品或库存页面", "等待主要表格/卡片", "提取 SKU/price/currency", "参数化写入 prices"] },
    ],
    lastVerifiedAt: "2026-06-24",
    notes: "Amazon 页面地区差异明显;执行前优先使用 profile 的代理国家和店铺站点匹配。",
    loginCheck: "(function(){ var challenge = !!document.querySelector('#auth-mfa-form,#captchacharacters,[id*=challenge]'); var loggedIn = !!document.querySelector('#sc-masthead, #ap-name a, [data-testid=user-name]'); return JSON.stringify({ loggedIn: loggedIn && !challenge, hint: challenge?'challenge seen':(loggedIn?'seller header seen':'login likely required') }); })()",
  },
  {
    id: "shopee-seller",
    name: "Shopee Seller",
    domains: ["seller.shopee", "seller.th.shopee", "seller.ph.shopee"],
    selectorVersion: 2,
    capabilities: ["login-check", "account-health", "order-summary", "chat-presence"],
    loginUrlHints: ["https://seller.shopee.com/", "https://seller.shopee.ph/"],
    selectors: {
      loggedIn: [".shopee-minipage-header", "[class*=seller-account]", "[class*=navbar-user]"],
      challenge: ["[class*=captcha]", "[class*=verify]"],
      orders: ["[class*=order]", "[data-testid*=order]"],
    },
    recipes: [
      { name: "seller-login-health", goal: "判断 Shopee Seller 登录态", steps: ["打开 seller home", "运行 loginCheck", "记录 online/challenge/blocked/unknown"] },
      { name: "order-summary", goal: "提取订单状态数量", steps: ["导航到订单页", "等待订单状态元素", "提取状态/count", "写入 order_summary"] },
    ],
    lastVerifiedAt: "2026-06-24",
    notes: "Shopee 多地区域名和 UI 差异较大;selectors 只能作为候选,运行时需从 snapshot 验证。",
    loginCheck: "(function(){ var challenge = !!document.querySelector('[class*=captcha],[class*=verify]'); var loggedIn = !!document.querySelector('.shopee-minipage-header, [class*=seller-account], [class*=navbar-user]'); return JSON.stringify({ loggedIn: loggedIn && !challenge, hint: challenge?'verification seen':(loggedIn?'seller header seen':'login likely required') }); })()",
  },
  {
    id: "tiktok-shop",
    name: "TikTok Shop (Seller)",
    domains: ["seller.tiktokglobalshop", "seller-us.tiktok", "seller.tiktok"],
    selectorVersion: 2,
    capabilities: ["login-check", "account-health", "shop-metrics", "order-summary"],
    loginUrlHints: ["https://seller.tiktokglobalshop.com/", "https://seller-us.tiktok.com/"],
    selectors: {
      loggedIn: ["[data-e2e=avatar]", ".avatar-wrapper", "[class*=user-avatar]"],
      challenge: ["[class*=captcha]", "[id*=captcha]"],
      metrics: ["[data-e2e*=metric]", "[class*=dashboard]"],
    },
    recipes: [
      { name: "shop-health", goal: "检查 TikTok Shop 登录和基础指标", steps: ["打开 seller dashboard", "运行 loginCheck", "若在线再提取 dashboard metric 文本", "写入 account_health 或 shop_metrics"] },
    ],
    lastVerifiedAt: "2026-06-24",
    notes: "TikTok 防自动化较敏感;只读采集优先,不要自动提交设置变更。",
    loginCheck: "(function(){ var challenge = !!document.querySelector('[class*=captcha],[id*=captcha]'); var loggedIn = !!document.querySelector('[data-e2e=avatar], .avatar-wrapper, [class*=user-avatar]'); return JSON.stringify({ loggedIn: loggedIn && !challenge, hint: challenge?'captcha seen':(loggedIn?'avatar seen':'login likely required') }); })()",
  },
  {
    id: "facebook",
    name: "Facebook",
    domains: ["facebook.com"],
    selectorVersion: 2,
    capabilities: ["login-check", "account-health", "page-insights-read"],
    loginUrlHints: ["https://www.facebook.com/", "https://business.facebook.com/"],
    selectors: {
      loggedIn: ["[role=navigation] [aria-label*=account i]", "[data-click=profile_photo]", '[aria-label*="Your profile" i]'],
      loginForm: ["input[name=email]", "input[name=pass]"],
      challenge: ["[id*=checkpoint]", "[action*=checkpoint]"],
    },
    recipes: [
      { name: "facebook-login-health", goal: "判断 Facebook 账号是否在线/检查点", steps: ["打开 facebook.com", "运行 loginCheck", "checkpoint 出现则标记 challenge", "写入 account_health"] },
    ],
    lastVerifiedAt: "2026-06-24",
    notes: "Facebook 选择器受语言和实验分组影响;登录态判断需结合 URL 和可见文本。",
    loginCheck: `(function(){ var challenge = !!document.querySelector('[id*=checkpoint],[action*=checkpoint]'); var loggedIn = !!document.querySelector('[role=navigation] [aria-label*=account i], [data-click=profile_photo], [aria-label*="Your profile" i]'); return JSON.stringify({ loggedIn: loggedIn && !challenge, hint: challenge?'checkpoint seen':(loggedIn?'account nav seen':'login likely required') }); })()`,
  },
];

/** Match an adapter for a URL; falls back to the generic adapter. */
export function detectAdapter(url: string): PlatformAdapter {
  const u = String(url || "").toLowerCase();
  for (const a of PLATFORM_ADAPTERS) {
    if (a.id === "generic-web") continue;
    if (a.domains.some((d) => u.includes(d))) return a;
  }
  return PLATFORM_ADAPTERS.find((a) => a.id === "generic-web")!;
}

export function getAdapter(id: string): PlatformAdapter | undefined {
  return PLATFORM_ADAPTERS.find((a) => a.id === id);
}

/** Render the adapter catalog for the agent system prompt. */
export function renderAdapterCatalog(): string {
  const lines = PLATFORM_ADAPTERS.filter((a) => a.id !== "generic-web").map((a) => {
    const selectorSummary = Object.entries(a.selectors)
      .map(([key, values]) => `${key}=${values.slice(0, 3).join(" | ")}`)
      .join("; ");
    const recipeSummary = a.recipes
      .map((recipe) => `${recipe.name}:${recipe.steps.join(" -> ")}`)
      .join("; ");
    return `- 【${a.id}】${a.name} (domains:${a.domains.join(", ")}; selectorVersion:v${a.selectorVersion}; capabilities:${a.capabilities.join("/")}; verified:${a.lastVerifiedAt}) loginUrlHints:${a.loginUrlHints.join(", ") || "n/a"} selectors:${selectorSummary} loginCheck:${a.loginCheck} recipes:${recipeSummary} notes:${a.notes}`;
  });
  return [
    "## 平台适配器(versioned selector recipes)",
    "检查登录态/采集数据时,先从当前 URL 在下方 catalog 中匹配 domains,再复制对应 loginCheck/selectors/recipes 到 browser_evaluate/browser_* 调用中,并在运行时验证 selector 是否仍存在。selectorVersion 变化说明平台改版,需更新。",
    "",
    ...lines,
    "",
    "调用方式: 根据当前 URL 命中 domains 后,用 browser_evaluate(port, <该行 loginCheck>) → JSON.parse 结果判断 {loggedIn, hint}; selectors/recipes 给出只读采集步骤。未知平台用 generic-web 启发式。",
  ].join("\n");
}
