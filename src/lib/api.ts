/**
 * Single backend origin for all API modules (auth, portfolio, goals, chat, …).
 * - Empty base → same-origin `/api/v1` (Vite dev proxy or nginx on production).
 * - If `.env` mistakenly includes `/api` or `/api/v1`, strip it so we do not double-prefix.
 * - If the page is HTTPS but `VITE_API_BASE_URL` is `http://…`, the browser blocks mixed
 *   content — fall back to same-origin so nginx can proxy to the app server (fixes Goal
 *   Planner showing "Backend unreachable" while cached portfolio calls appear fine).
 */
function resolveApiBaseUrl(): string {
  let base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  base = base.replace(/\/api\/v1\/?$/i, "").replace(/\/api\/?$/i, "").replace(/\/+$/, "");
  if (typeof window !== "undefined" && import.meta.env.PROD) {
    if (window.location.protocol === "https:" && base.startsWith("http:")) {
      return "";
    }
  }
  return base;
}

const API_BASE = resolveApiBaseUrl();
const API = `${API_BASE}/api/v1`;
const TOKEN_KEY = "askProzpr_token";
const FAMILY_MEMBER_KEY = "askProzpr_family_member_id";
const USER_CONTEXT_CACHE_KEY = "askProzpr.user_context_cache.v1";

type UserContextCache = {
  me?: UserInfo;
  profile?: FullProfileResponse | null;
  portfolio?: PortfolioDetail | null;
  linkedAccounts?: LinkAccountInfo[];
};

let userContextCacheMemory: UserContextCache | null = null;

function loadUserContextCache(): UserContextCache {
  if (userContextCacheMemory) return userContextCacheMemory;
  try {
    const raw = sessionStorage.getItem(USER_CONTEXT_CACHE_KEY);
    if (!raw) {
      userContextCacheMemory = {};
      return userContextCacheMemory;
    }
    const parsed = JSON.parse(raw) as UserContextCache;
    userContextCacheMemory = parsed && typeof parsed === "object" ? parsed : {};
    return userContextCacheMemory;
  } catch {
    userContextCacheMemory = {};
    return userContextCacheMemory;
  }
}

function saveUserContextCache(next: UserContextCache) {
  userContextCacheMemory = next;
  try {
    sessionStorage.setItem(USER_CONTEXT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota / privacy mode failures.
  }
}

function getCachedUserContextValue<K extends keyof UserContextCache>(key: K): UserContextCache[K] | undefined {
  return loadUserContextCache()[key];
}

function setCachedUserContextValue<K extends keyof UserContextCache>(key: K, value: UserContextCache[K]) {
  const current = loadUserContextCache();
  saveUserContextCache({ ...current, [key]: value });
}

export function invalidateUserContextCache() {
  userContextCacheMemory = {};
  try {
    sessionStorage.removeItem(USER_CONTEXT_CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  invalidateUserContextCache();
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  invalidateUserContextCache();
}

export function getActiveFamilyMemberId(): string | null {
  return localStorage.getItem(FAMILY_MEMBER_KEY);
}

export function setActiveFamilyMemberId(id: string | null) {
  if (id) {
    localStorage.setItem(FAMILY_MEMBER_KEY, id);
  } else {
    localStorage.removeItem(FAMILY_MEMBER_KEY);
  }
  invalidateUserContextCache();
}

//need to remove
export class BackendOfflineError extends Error {
  constructor(message = "Backend is not active") {
    super(message);
    this.name = "BackendOfflineError";
  }
}

let backendOfflineUntil = 0;
const OFFLINE_RETRY_MS = 15_000;
/** Default for most API calls */
const REQUEST_TIMEOUT_MS = 45_000;
/** Chat can run intent classification + optional market commentary + LLM — allow longer */
const CHAT_REQUEST_TIMEOUT_MS = 120_000;
/** Issue reporting blocks a user-facing submit button — keep it snappy and bounded. */
const ISSUE_REQUEST_TIMEOUT_MS = 20_000;
// till this

async function request<T>(
  path: string,
  init?: RequestInit,
  auth = true,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  if (auth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const familyMemberId = getActiveFamilyMemberId();
    if (familyMemberId) headers["X-Family-Member-Id"] = familyMemberId;
  }

  if (Date.now() < backendOfflineUntil) {
    throw new BackendOfflineError();
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers, signal: controller.signal });
  } catch (err) {
    // Abort usually means request timeout for long-running AI endpoints, not true offline mode.
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    backendOfflineUntil = Date.now() + OFFLINE_RETRY_MS;
    throw new BackendOfflineError("Backend is unreachable");
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!res.ok) {
    // Read body once: `res.json()` consumes the stream; calling `res.text()` in a catch
    // after a failed JSON parse hits "body stream already read".
    const text = await res.text();
    let msg: string;
    try {
      const body = JSON.parse(text) as unknown;
      let detail: unknown = undefined;
      if (body && typeof body === "object" && "detail" in body) {
        detail = (body as { detail?: unknown }).detail;
      }
      if (typeof detail === "string") {
        msg = detail;
      } else if (detail != null) {
        // FastAPI sometimes returns structured objects inside `detail`.
        msg = JSON.stringify(detail);
      } else {
        msg = JSON.stringify(body);
      }
    } catch {
      msg = text.trim() || `Request failed (${res.status})`;
    }
    // Treat common gateway/unavailable statuses as "offline" to avoid noisy errors.
    if ([502, 503, 504].includes(res.status)) {
      backendOfflineUntil = Date.now() + OFFLINE_RETRY_MS;
      throw new BackendOfflineError(msg || "Backend unavailable");
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  if (res.status === 204 || res.status === 205) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (auth && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      invalidateUserContextCache();
    }
    return undefined as T;
  }
  // Same as error path: read body once (never mix `.json()` then `.text()` on the same Response).
  const okBody = await res.text();
  if (!okBody.trim()) {
    const method = (init?.method ?? "GET").toUpperCase();
    if (auth && !["GET", "HEAD", "OPTIONS"].includes(method)) {
      invalidateUserContextCache();
    }
    return undefined as T;
  }
  const parsed = JSON.parse(okBody) as T;
  const method = (init?.method ?? "GET").toUpperCase();
  if (auth && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    invalidateUserContextCache();
  }
  return parsed;
}

// ── Auth types ──────────────────────────────────────────
export interface SignUpPayload {
  country_code: string;
  mobile: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}

export interface LoginPayload {
  country_code: string;
  mobile: string;
  password?: string;
}

export interface UserInfo {
  id: string;
  country_code: string;
  mobile: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_onboarding_complete: boolean;
}

export interface UserUpdatePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
}

// ── Auth API ────────────────────────────────────────────
export async function signup(p: SignUpPayload): Promise<{ user_id: string; access_token: string }> {
  const data = await request<{ user_id: string; access_token: string }>(
    "/auth/signup",
    { method: "POST", body: JSON.stringify(p) },
    false,
  );
  setToken(data.access_token);
  return data;
}

export async function login(p: LoginPayload): Promise<{ user_id: string; access_token: string }> {
  const data = await request<{ user_id: string; access_token: string }>(
    "/auth/login",
    { method: "POST", body: JSON.stringify(p) },
    false,
  );
  setToken(data.access_token);
  return data;
}

export interface MobileStatus {
  exists: boolean;
  is_onboarding_complete: boolean;
}

export async function checkMobileStatus(p: {
  country_code: string;
  mobile: string;
}): Promise<MobileStatus> {
  return request<MobileStatus>("/auth/check-mobile", {
    method: "POST",
    body: JSON.stringify(p),
  }, false);
}

export async function getMe(): Promise<UserInfo> {
  const cached = getCachedUserContextValue("me");
  if (cached) return cached;
  const me = await request<UserInfo>("/auth/me");
  setCachedUserContextValue("me", me);
  return me;
}

export async function updateMe(p: UserUpdatePayload): Promise<UserInfo> {
  return request<UserInfo>("/auth/me", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

// ── Onboarding API ──────────────────────────────────────
export interface OnboardingProfilePayload {
  date_of_birth?: string;
  occupation?: string;
  selected_goals?: string[];
  custom_goals?: string[];
  investment_horizon?: string;
  annual_income_min?: number;
  annual_income_max?: number;
  annual_expense_min?: number;
  annual_expense_max?: number;
  // Canonical household-finance scalars (personal_finance_profiles).
  annual_income?: number;
  monthly_household_expense?: number;
  financial_assets?: number;
  equity_shares?: number;
  financial_liabilities_excl_mortgage?: number;
  starting_monthly_investment?: number;
}

export async function saveOnboardingProfile(p: OnboardingProfilePayload) {
  return request("/onboarding/profile", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

/** Read-back of the onboarding profile — used where we need the user's DOB/age. */
export interface OnboardingProfileResponse {
  user_id: string;
  date_of_birth: string | null;
  assumed_lifespan_years: number | null;
  occupation: string | null;
  family_status?: string | null;
  wealth_sources?: string[] | null;
  personal_values?: string[] | null;
  selected_goals?: string[];
  custom_goals?: string[];
  investment_horizon?: string | null;
  annual_income?: number | null;
  effective_tax_rate?: number | null;
  monthly_household_expense?: number | null;
  financial_assets?: number | null;
  equity_shares?: number | null;
  financial_liabilities_excl_mortgage?: number | null;
  starting_monthly_investment?: number | null;
  updated_at: string | null;
}

export async function getOnboardingProfile(): Promise<OnboardingProfileResponse> {
  return request<OnboardingProfileResponse>("/onboarding/profile");
}

/** Non-financial-asset holdings (gold, unlisted shares, etc.) — other_investments. */
export interface OtherAssetPayload {
  asset_name: string;
  asset_type?: string | null;
  current_value?: number | null;
}

export interface OtherAssetResponse {
  id: string;
  asset_name: string;
  asset_type: string | null;
  current_value: number | null;
}

/** Read back the user's saved "other assets" so the form can prefill on return. */
export async function getOtherAssets(): Promise<OtherAssetResponse[]> {
  return request<OtherAssetResponse[]>("/onboarding/other-assets");
}

/** Full-replace write of the user's "other assets" list. */
export async function saveOtherAssets(
  assets: OtherAssetPayload[],
): Promise<OtherAssetResponse[]> {
  return request<OtherAssetResponse[]>("/onboarding/other-assets", {
    method: "POST",
    body: JSON.stringify({ assets }),
  });
}

export async function completeOnboarding() {
  return request("/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({ is_complete: true }),
  });
}

/** Maps About You investment-preference letters (A–E) to backend risk_level 0–4. */
export const ONBOARDING_RISK_LETTER_TO_LEVEL: Record<string, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
};

export interface PersistOnboardingInput extends OnboardingProfilePayload {
  occupation?: string;
  /** A–E from the investment preference questionnaire */
  risk_choice_letter?: string;
  /** Direct 0–4 mapping when UI uses labels instead of letters */
  risk_level?: number;
}

const _midpoint = (lo?: number, hi?: number): number | undefined => {
  const vals = [lo, hi].filter((v): v is number => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
};

/** Save onboarding answers across users + personal_finance_profiles + risk_profiles. */
export async function persistOnboardingProfile(input: PersistOnboardingInput): Promise<void> {
  const {
    occupation,
    risk_choice_letter,
    risk_level: riskLevelInput,
    annual_income_min,
    annual_income_max,
    annual_expense_min,
    annual_expense_max,
    ...profileFields
  } = input;

  // The backend stores canonical scalars (annual_income + monthly_household_expense),
  // not the min/max ranges the onboarding UI collects — collapse them here so the
  // answers actually persist and can be pre-filled later.
  const annualIncome = input.annual_income ?? _midpoint(annual_income_min, annual_income_max);
  const annualExpense = _midpoint(annual_expense_min, annual_expense_max);
  const monthlyExpense =
    input.monthly_household_expense ?? (annualExpense != null ? annualExpense / 12 : undefined);

  await saveOnboardingProfile({
    ...profileFields,
    ...(annualIncome != null ? { annual_income: annualIncome } : {}),
    ...(monthlyExpense != null ? { monthly_household_expense: monthlyExpense } : {}),
  });
  const occupationValue = occupation?.trim();
  if (occupationValue) {
    await updatePersonalInfo({ occupation: occupationValue });
  }
  const riskLevel =
    riskLevelInput ??
    (risk_choice_letter && risk_choice_letter in ONBOARDING_RISK_LETTER_TO_LEVEL
      ? ONBOARDING_RISK_LETTER_TO_LEVEL[risk_choice_letter]
      : undefined);
  if (riskLevel !== undefined) {
    await updateRiskProfile({
      risk_level: riskLevel,
      investment_horizon: profileFields.investment_horizon ?? undefined,
    });
  }
}

/** Flip `users.is_onboarding_complete` and mirror into session for route guards. */
export async function markOnboardingComplete(): Promise<void> {
  await completeOnboarding();
  try {
    sessionStorage.setItem("onboardingComplete", "true");
    sessionStorage.setItem("completedTellUs", "true");
  } catch {
    // Ignore private browsing / quota errors.
  }
}

// ── SimBanks (account aggregator simulator) ─────────────────────────
export interface SimBankDiscoveredAccount {
  account_ref_no: string;
  provider_name: string;
  fi_type: string;
  account_type: string;
  kind: "deposit" | "mutual_fund" | "equity";
  masked_identifier: string | null;
  currency: string | null;
  current_value: number;
  cost_value: number | null;
  holdings_count: number | null;
}

export interface DiscoverSimBankAccountsResponse {
  accounts: SimBankDiscoveredAccount[];
}

export async function discoverSimBankAccounts(): Promise<DiscoverSimBankAccountsResponse> {
  return request<DiscoverSimBankAccountsResponse>("/simbanks/discover");
}

export interface SyncSimBankAccountsResponse {
  portfolio_total_value: number;
  portfolio_total_invested: number;
  portfolio_total_gain_percentage: number | null;
  linked_account_ids: string[];
}

export async function syncSimBankAccounts(acceptedAccountRefNos: string[]): Promise<SyncSimBankAccountsResponse> {
  return request<SyncSimBankAccountsResponse>("/simbanks/sync", {
    method: "POST",
    body: JSON.stringify({ accepted_account_ref_nos: acceptedAccountRefNos }),
  });
}

// ── Linked accounts (persisted after SimBanks / manual link) ─────────
export interface LinkAccountInfo {
  id: string;
  account_type: string;
  provider_name: string | null;
  status: string;
  linked_at: string | null;
  created_at: string;
}

export async function listLinkedAccounts(): Promise<{ accounts: LinkAccountInfo[] }> {
  const cached = getCachedUserContextValue("linkedAccounts");
  if (cached) return { accounts: cached };
  const res = await request<{ accounts: LinkAccountInfo[] }>("/linked-accounts/");
  setCachedUserContextValue("linkedAccounts", res.accounts ?? []);
  return res;
}

// ── CAMS / KFintech Consolidated Account Statement (CAS) PDF upload ──
// Replaces the Finvu account-aggregator "fetch by linked mobile" flow (paused for licensing).
export interface CamsPdfImportResponse {
  import_id: string;
  status: string; // "NORMALIZED" | "FAILED" | "RECEIVED"
  cas_file_type: string | null;
  cas_type: string | null;
  statement_period_from: string | null;
  statement_period_to: string | null;
  folios: number;
  schemes: number;
  aa_transactions_parsed: number;
  mf_transactions_inserted: number;
  mf_transactions_skipped_duplicate: number;
  portfolio_allocation_rows: number;
  total_value_inr: number;
  normalize_error: string | null;
  message: string;
}

/**
 * Upload a CAMS / KFintech Consolidated Account Statement PDF (password set when the
 * statement was generated — usually the investor's PAN in capitals). The backend parses
 * it, stores the holdings/transactions, and refreshes the primary portfolio.
 */
export async function uploadCamsStatement(
  file: File,
  password: string,
  replaceExisting = false,
): Promise<CamsPdfImportResponse> {
  if (Date.now() < backendOfflineUntil) {
    throw new BackendOfflineError();
  }
  const form = new FormData();
  form.append("file", file);
  form.append("password", password);
  // When true the backend wipes all prior CAMS-derived data (transactions, holdings,
  // allocations, net-worth history) and recomputes from this statement alone.
  form.append("replace_existing", replaceExisting ? "true" : "false");

  // NB: do not set Content-Type — the browser must add the multipart boundary itself.
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const familyMemberId = getActiveFamilyMemberId();
  if (familyMemberId) headers["X-Family-Member-Id"] = familyMemberId;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 90_000);
  let res: Response;
  try {
    res = await fetch(`${API}/mf-ingest/cams-pdf`, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Upload timed out. Please try again.");
    }
    backendOfflineUntil = Date.now() + OFFLINE_RETRY_MS;
    throw new BackendOfflineError("Backend is unreachable");
  } finally {
    window.clearTimeout(timeoutId);
  }

  const text = await res.text();
  if (!res.ok) {
    let msg: string;
    try {
      const body = JSON.parse(text) as { detail?: unknown };
      msg = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      msg = text.trim() || `Upload failed (${res.status})`;
    }
    if ([502, 503, 504].includes(res.status)) {
      backendOfflineUntil = Date.now() + OFFLINE_RETRY_MS;
      throw new BackendOfflineError(msg || "Backend unavailable");
    }
    throw new Error(msg || `Upload failed (${res.status})`);
  }
  // A successful ingest changes portfolio + linked accounts — drop the cached user context.
  invalidateUserContextCache();
  return JSON.parse(text) as CamsPdfImportResponse;
}

// ── Finvu / AA bucket snapshot — DEPRECATED (account-aggregator flow paused for licensing).
// Use uploadCamsStatement() instead. Kept only for backwards compatibility.
export type FinvuBucketName = "Cash" | "Debt" | "Equity" | "Other";

export interface FinvuBucketInput {
  bucket: FinvuBucketName;
  value_inr: number;
}

export interface FinvuPortfolioSyncRequest {
  buckets: FinvuBucketInput[];
  as_of?: string | null;
  consent_transaction_id?: string | null;
  source?: string;
}

export interface FinvuPortfolioSyncResponse {
  portfolio_id: string;
  total_value_inr: number;
  allocation_rows_written: number;
  message: string;
}

/** @deprecated Finvu account-aggregator integration is paused. Use {@link uploadCamsStatement}. */
export async function syncFinvuPortfolio(payload: FinvuPortfolioSyncRequest): Promise<FinvuPortfolioSyncResponse> {
  return request<FinvuPortfolioSyncResponse>("/portfolio/finvu/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  clearToken();
  invalidateUserContextCache();
}

// ── Chat API ────────────────────────────────────────────
export interface ChatSessionInfo {
  id: string;
  title: string | null;
  status: string;
  /** User's 1–5 rating of Pi for this session; null until rated. */
  rating: number | null;
  created_at: string;
  updated_at: string;
}

export interface CashflowAnnualBarPayload {
  type: "cashflow_annual_bar";
  title: string;
  data: {
    fy_label: string;
    income: number;
    household_expense: number;
    savings_post_emi: number;
    corpus_closing: number;
    monthly_investment: number;
    goal_payout: number;
  }[];
  annual_cashflow: AnnualCashflowRow[];
  monthly_cashflow: MonthlyCashflowRow[];
}

export type ChatChartPayload = CashflowAnnualBarPayload | Record<string, unknown>;

export interface ChatMessageInfo {
  id: string;
  role: string;
  content: string;
  intent: string | null;
  intent_confidence: number | null;
  intent_reasoning: string | null;
  chart_payloads: ChatChartPayload[] | null;
  created_at: string;
}

export interface ChatSendResponse {
  user_message: ChatMessageInfo;
  assistant_message: ChatMessageInfo;
  /** Present when chat persisted an ideal allocation — use for CTA to `/execute`. */
  ideal_allocation_rebalancing_id?: string | null;
  ideal_allocation_snapshot_id?: string | null;
}

export interface ChatSessionDetail extends ChatSessionInfo {
  messages: ChatMessageInfo[];
}

export async function getOrCreateActiveSession(): Promise<ChatSessionDetail> {
  return request<ChatSessionDetail>("/chat/sessions/active");
}

export async function createChatSession(title?: string): Promise<ChatSessionInfo> {
  return request<ChatSessionInfo>("/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ title: title ?? null }),
  });
}

export async function sendChatMessage(
  sessionId: string,
  content: string,
  clientContext?: Record<string, unknown>
): Promise<ChatSendResponse> {
  return request<ChatSendResponse>(
    `/chat/sessions/${sessionId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content, client_context: clientContext ?? null }),
    },
    true,
    CHAT_REQUEST_TIMEOUT_MS
  );
}

export async function listChatSessions(): Promise<ChatSessionInfo[]> {
  return request<ChatSessionInfo[]>("/chat/sessions");
}

export async function getChatSession(sessionId: string): Promise<ChatSessionDetail> {
  return request<ChatSessionDetail>(`/chat/sessions/${sessionId}`);
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await request<void>(`/chat/sessions/${sessionId}`, { method: "DELETE" });
}

export async function renameChatSession(
  sessionId: string,
  title: string,
): Promise<ChatSessionInfo> {
  return request<ChatSessionInfo>(`/chat/sessions/${sessionId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

/** Persist the user's 1–5 rating of Pi for a session (one per session). */
export async function rateChatSession(
  sessionId: string,
  rating: number,
  comment?: string,
): Promise<ChatSessionInfo> {
  // `comment` is optional free-text feedback. The backend currently persists
  // only `rating` and ignores unknown body fields, so sending it is harmless and
  // forward-compatible — add a column server-side to start storing it.
  const body: { rating: number; comment?: string } = { rating };
  const trimmed = comment?.trim();
  if (trimmed) body.comment = trimmed;
  return request<ChatSessionInfo>(`/chat/sessions/${sessionId}/rating`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ── Shared constants ────────────────────────────────────

export const RISK_CATEGORIES = [
  "Conservative",
  "Moderately Conservative",
  "Moderate",
  "Moderately Aggressive",
  "Aggressive",
] as const;

export type RiskCategory = (typeof RISK_CATEGORIES)[number];

// ── Profile types ───────────────────────────────────────

export interface PersonalInfoPayload {
  occupation?: string | null;
  family_status?: string | null;
  wealth_sources?: string[] | null;
  personal_values?: string[] | null;
  address?: string | null;
  currency?: string | null;
  /** Stored on `users`; required by the cashflow / goal-planning engine. */
  date_of_birth?: string | null;
  assumed_lifespan_years?: number | null;
}

export interface PersonalInfoResponse {
  occupation: string | null;
  family_status: string | null;
  wealth_sources: string[] | null;
  personal_values: string[] | null;
  address: string | null;
  currency: string;
  date_of_birth?: string | null;
  assumed_lifespan_years?: number | null;
}

/** Canonical household-finance scalars stored on `personal_finance_profiles`. */
export interface PersonalFinancePayload {
  annual_income?: number | null;
  /** Blended post-deduction rate as a fraction (e.g. 0.22), NOT a percentage. */
  effective_tax_rate?: number | null;
  financial_assets?: number | null;
  equity_shares?: number | null;
  financial_liabilities_excl_mortgage?: number | null;
  monthly_household_expense?: number | null;
  starting_monthly_investment?: number | null;
  current_portfolio_corpus?: number | null;
  selected_goals?: string[] | null;
  custom_goals?: string[] | null;
  investment_horizon?: string | null;
  wealth_sources?: string[] | null;
  personal_values?: string[] | null;
}

export interface PersonalFinanceResponse extends PersonalFinancePayload {
  user_id: string;
  selected_goals: string[];
  custom_goals: string[];
  investment_horizon: string | null;
  wealth_sources: string[];
  personal_values: string[];
  updated_at: string | null;
}

export interface InvestmentProfilePayload {
  objectives?: string[] | null;
  detailed_goals?: Record<string, unknown>[] | null;
  portfolio_value?: number | null;
  monthly_savings?: number | null;
  target_corpus?: number | null;
  target_timeline?: string | null;
  annual_income?: number | null;
  retirement_age?: number | null;
  investable_assets?: number | null;
  total_liabilities?: number | null;
  property_value?: number | null;
  mortgage_amount?: number | null;
  expected_inflows?: number | null;
  regular_outgoings?: number | null;
  planned_major_expenses?: number | null;
  emergency_fund?: number | null;
  emergency_fund_months?: string | null;
  liquidity_needs?: string | null;
  income_needs?: number | null;
  is_multi_phase_horizon?: boolean | null;
  phase_description?: string | null;
  total_horizon?: string | null;
}

export interface InvestmentProfileResponse extends InvestmentProfilePayload {
  id: string;
  updated_at: string | null;
}

export interface RiskProfilePayload {
  risk_level?: number | null;
  risk_capacity?: string | null;
  investment_experience?: string | null;
  /** Behavioural "investment focus" answer (capital-preservation … maximise-growth). */
  investment_focus?: string | null;
  investment_horizon?: string | null;
  drop_reaction?: string | null;
  max_drawdown?: number | null;
  comfort_assets?: string[] | null;
}

export interface RiskProfileResponse extends RiskProfilePayload {
  id: string;
  risk_category: string | null;
  updated_at: string | null;
}

export interface AllocationConstraintItem {
  asset_class: string;
  min_allocation?: number | null;
  max_allocation?: number | null;
}

export interface InvestmentConstraintPayload {
  permitted_assets?: string[] | null;
  prohibited_instruments?: string[] | null;
  is_leverage_allowed?: boolean | null;
  is_derivatives_allowed?: boolean | null;
  diversification_notes?: string | null;
  allocation_constraints?: AllocationConstraintItem[] | null;
}

export interface InvestmentConstraintResponse extends InvestmentConstraintPayload {
  id: string;
  updated_at: string | null;
}

export interface TaxProfilePayload {
  income_tax_rate?: number | null;
  capital_gains_tax_rate?: number | null;
  /** "old" | "new" — the user's income-tax regime. */
  tax_regime?: string | null;
  notes?: string | null;
}

export interface TaxProfileResponse extends TaxProfilePayload {
  id: string;
  updated_at: string | null;
}

export interface ReviewPreferencePayload {
  frequency?: string | null;
  triggers?: string[] | null;
  update_process?: string | null;
}

export interface ReviewPreferenceResponse extends ReviewPreferencePayload {
  id: string;
  updated_at: string | null;
}

export interface FullProfileResponse {
  personal_info: PersonalInfoResponse | null;
  investment_profile: InvestmentProfileResponse | null;
  risk_profile: RiskProfileResponse | null;
  investment_constraint: InvestmentConstraintResponse | null;
  tax_profile: TaxProfileResponse | null;
  review_preference: ReviewPreferenceResponse | null;
}

// ── Profile API ─────────────────────────────────────────

export async function getFullProfile(): Promise<FullProfileResponse> {
  const cached = getCachedUserContextValue("profile");
  if (cached) return cached;
  const profile = await request<FullProfileResponse>("/profile/");
  setCachedUserContextValue("profile", profile);
  return profile;
}

export async function getPersonalInfo(): Promise<PersonalInfoResponse> {
  return request<PersonalInfoResponse>("/profile/personal-info");
}

export async function updatePersonalInfo(p: PersonalInfoPayload): Promise<PersonalInfoResponse> {
  return request<PersonalInfoResponse>("/profile/personal-info", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

export async function getPersonalFinance(): Promise<PersonalFinanceResponse> {
  return request<PersonalFinanceResponse>("/profile/personal-finance");
}

export async function updatePersonalFinance(p: PersonalFinancePayload): Promise<PersonalFinanceResponse> {
  return request<PersonalFinanceResponse>("/profile/personal-finance", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

export async function getInvestmentProfile(): Promise<InvestmentProfileResponse> {
  return request<InvestmentProfileResponse>("/profile/investment");
}

export async function updateInvestmentProfile(p: InvestmentProfilePayload): Promise<InvestmentProfileResponse> {
  return request<InvestmentProfileResponse>("/profile/investment", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

// ── Owned properties (user_current_properties) ─────────────────────────────
export interface CurrentPropertyPayload {
  name: string;
  property_value?: number | null;
  has_mortgage: boolean;
  mortgage_emi?: number | null;
  mortgage_end_date?: string | null; // ISO yyyy-mm-dd
  /** Outstanding loan balance (informational; preserves equity across edits). */
  mortgage_balance?: number | null;
}

export interface CurrentPropertyResponse extends CurrentPropertyPayload {
  id: number;
}

export async function getCurrentProperties(): Promise<CurrentPropertyResponse[]> {
  return request<CurrentPropertyResponse[]>("/profile/current-properties");
}

export async function updateCurrentProperties(
  properties: CurrentPropertyPayload[],
): Promise<CurrentPropertyResponse[]> {
  return request<CurrentPropertyResponse[]>("/profile/current-properties", {
    method: "PUT",
    body: JSON.stringify({ properties }),
  });
}

export async function getRiskProfile(): Promise<RiskProfileResponse> {
  return request<RiskProfileResponse>("/profile/risk");
}

export async function updateRiskProfile(p: RiskProfilePayload): Promise<RiskProfileResponse> {
  return request<RiskProfileResponse>("/profile/risk", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

export async function getConstraints(): Promise<InvestmentConstraintResponse> {
  return request<InvestmentConstraintResponse>("/profile/constraints");
}

export async function updateConstraints(p: InvestmentConstraintPayload): Promise<InvestmentConstraintResponse> {
  return request<InvestmentConstraintResponse>("/profile/constraints", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

export async function getTaxProfile(): Promise<TaxProfileResponse> {
  return request<TaxProfileResponse>("/profile/tax");
}

export async function updateTaxProfile(p: TaxProfilePayload): Promise<TaxProfileResponse> {
  return request<TaxProfileResponse>("/profile/tax", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

export async function getReviewPreference(): Promise<ReviewPreferenceResponse> {
  return request<ReviewPreferenceResponse>("/profile/review");
}

export async function updateReviewPreference(p: ReviewPreferencePayload): Promise<ReviewPreferenceResponse> {
  return request<ReviewPreferenceResponse>("/profile/review", {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

// ── Family types ────────────────────────────────────────

export interface FamilyMember {
  id: string;
  owner_id: string;
  member_user_id: string | null;
  nickname: string;
  email: string | null;
  phone: string | null;
  relationship_type: string;
  status: string;
  member_first_name: string | null;
  member_last_name: string | null;
  member_initials: string | null;
  created_at: string;
  updated_at: string;
}

export interface FamilyMemberListResponse {
  members: FamilyMember[];
  count: number;
}

export interface AddFamilyMemberPayload {
  nickname: string;
  phone: string;
  /** Default +91 — must match signup format so backend can resolve User.phone */
  country_code?: string;
  email?: string;
  relationship_type?: string;
}

export interface UpdateFamilyMemberPayload {
  nickname?: string;
  relationship_type?: string;
}

export interface OnboardFamilyMemberPayload {
  nickname: string;
  phone: string;
  country_code?: string;
  first_name: string;
  last_name?: string;
  email?: string;
  password: string;
  relationship_type?: string;
}

export interface FamilyMemberPortfolioSummary {
  member_id: string;
  nickname: string;
  relationship_type: string;
  portfolio_value: number;
  total_invested: number;
  gain_percentage: number | null;
}

export interface CumulativeAllocationItem {
  asset_class: string;
  total_amount: number;
  allocation_percentage: number;
}

export interface CumulativePortfolioResponse {
  total_value: number;
  total_invested: number;
  total_gain_percentage: number | null;
  member_count: number;
  members: FamilyMemberPortfolioSummary[];
  combined_allocations: CumulativeAllocationItem[];
}

export interface PortfolioDetail {
  id: string;
  name: string;
  total_value: number;
  total_invested: number;
  total_gain_percentage: number | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  allocations: { id: string; asset_class: string; allocation_percentage: number; amount: number; performance_percentage: number | null }[];
  holdings: { id: string; instrument_name: string; instrument_type: string; ticker_symbol: string | null; quantity: number | null; average_cost: number | null; current_price: number | null; current_value: number; allocation_percentage: number | null; asset_class: string | null; sub_category: string | null }[];
}

export interface TwrPoint {
  date: string;
  portfolio_index: number;
  nifty_index: number | null;
}

export interface TwrSeriesResponse {
  has_data: boolean;
  points: TwrPoint[];
  /** Since-inception money-weighted return (decimal, 0.11 == 11%); null if undefined. */
  portfolio_xirr: number | null;
  /** ISO date the current value is priced at (latest NAV used for XIRR); null if none. */
  as_of_date: string | null;
}

/** Real TWR series (portfolio vs Nifty 50, MF-only). Frontend rebases per range. */
export async function getPortfolioTwr(): Promise<TwrSeriesResponse> {
  return request<TwrSeriesResponse>("/portfolio/twr");
}

// ── Benchmarks (market index EOD data, e.g. Nifty 50) ───────────────────────

/** One benchmark index in the catalogue + its latest EOD value. */
export interface BenchmarkSummary {
  id: string;
  code: string;
  display_name: string;
  short_name: string;
  provider: string;
  asset_class: string;
  description: string | null;
  earliest_available: string | null;
  is_active: boolean;
  latest_value: number | null;
  latest_value_date: string | null;
  created_at: string;
}

/** One daily EOD value point for a benchmark index. */
export interface BenchmarkHistoryPoint {
  value_date: string;
  tri_value: number;
  ntr_value: number | null;
  pr_value: number | null;
}

export interface BenchmarkHistoryResponse {
  code: string;
  display_name: string;
  points: BenchmarkHistoryPoint[];
}

/** List benchmark indices in the catalogue (each with its latest EOD value). */
export async function listBenchmarks(activeOnly = false): Promise<BenchmarkSummary[]> {
  const q = activeOnly ? "?active_only=true" : "";
  return request<BenchmarkSummary[]>(`/benchmarks${q}`);
}

/** EOD value history for one benchmark index, optionally clipped to [from, to]. */
export async function getBenchmarkHistory(
  code: string,
  opts?: { from?: string; to?: string }
): Promise<BenchmarkHistoryResponse> {
  const params = new URLSearchParams();
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  const qs = params.toString();
  return request<BenchmarkHistoryResponse>(
    `/benchmarks/${encodeURIComponent(code)}/history${qs ? `?${qs}` : ""}`
  );
}

/** Primary portfolio for the logged-in user (from DB). */
export async function getMyPortfolio(): Promise<PortfolioDetail> {
  const cached = getCachedUserContextValue("portfolio");
  if (cached) return cached;
  const portfolio = await request<PortfolioDetail>("/portfolio/");
  setCachedUserContextValue("portfolio", portfolio);
  return portfolio;
}

/** NAV point for MF holding-detail chart (`mf_nav_history`). */
export interface MfHoldingNavPoint {
  nav_date: string;
  nav: number;
}

/** User ledger row for one scheme (from `mf_transactions`; CAMS ingest feeds here). */
export interface MfHoldingTransactionItem {
  id: string;
  transaction_date: string;
  transaction_type: string;
  folio_number: string;
  units: number;
  nav: number;
  amount: number;
  stamp_duty: number | null;
  source_system: string;
  is_inflow: boolean;
  signed_amount: number;
}

/** Aggregated position from `portfolio_holdings` for this scheme. */
export interface MfHoldingPosition {
  units: number | null;
  average_cost: number | null;
  current_price: number | null;
  current_value: number | null;
  allocation_percentage: number | null;
  invested_amount: number | null;
  unrealised_gain: number | null;
  unrealised_gain_pct: number | null;
  folios: number;
}

/** Fund facts + NAV series + position + CAMS-backed transactions — see backend `MfHoldingDetailResponse`. */
export interface MfHoldingDetailResponse {
  scheme_code: string;
  scheme_name: string | null;
  amc_name: string | null;
  category: string | null;
  sub_category: string | null;
  asset_class: string | null;
  asset_subgroup: string | null;
  isin: string | null;
  plan_type: string | null;
  option_type: string | null;
  metadata_id: string | null;
  latest_nav: number | null;
  latest_nav_date: string | null;
  nav_history: MfHoldingNavPoint[];
  nav_history_from: string | null;
  nav_history_to: string | null;
  nav_history_truncated: boolean;
  /** Latest NAV date used as end point for return metrics (from `mf_nav_history`). */
  nav_returns_as_of: string | null;
  nav_return_ytd_pct: number | null;
  nav_return_6m_pct: number | null;
  nav_return_1y_pct: number | null;
  nav_return_3y_pct: number | null;
  nav_return_5y_pct: number | null;
  position: MfHoldingPosition | null;
  transactions: MfHoldingTransactionItem[];
  notes: string[];
}

/**
 * Fund detail screen payload: scheme profile, NAV history for charting, your units/value,
 * and transaction ledger (includes rows imported from CAMS CAS PDF).
 */
export async function getMfHoldingDetail(schemeCode: string): Promise<MfHoldingDetailResponse> {
  const encoded = encodeURIComponent(schemeCode.trim());
  return request<MfHoldingDetailResponse>(`/mf/funds/${encoded}/holding-detail`);
}

/**
 * Heuristic: profile rows in DB look filled even if `is_onboarding_complete` was never flipped.
 * Used to skip redundant onboarding / account-link nudges in the chat shell.
 */
export function inferProfileSectionsComplete(profile: FullProfileResponse | null): boolean {
  if (!profile) return false;
  const pi = profile.personal_info;
  const inv = profile.investment_profile;
  const risk = profile.risk_profile;
  const hasPersonal = !!(
    pi
    && ((pi.occupation && String(pi.occupation).trim()) || (pi.family_status && String(pi.family_status).trim()))
  );
  const hasInv = !!(
    inv
    && ((inv.annual_income != null && inv.annual_income > 0)
      || (inv.investable_assets != null && inv.investable_assets > 0))
  );
  const hasRisk = !!(risk && risk.risk_category && String(risk.risk_category).trim());
  return hasPersonal && hasInv && hasRisk;
}

export function inferOnboardingComplete(me: UserInfo, profile: FullProfileResponse | null): boolean {
  if (me.is_onboarding_complete) return true;
  return inferProfileSectionsComplete(profile);
}

/** Confirmation state of the four "Tell Us More About You" sections. */
export interface AboutYouStatus {
  /** Number of confirmed sections, 0–4. */
  confirmedCount: number;
  /** True only when all four sections are confirmed. */
  allConfirmed: boolean;
}

/**
 * Confirmation state of the four "Tell Us More About You" sections, using the
 * same rules as the section-card derivation in `pages/CompleteProfile.tsx` so
 * the Profile-page nudge dot and that page never disagree. Keep the two in sync.
 *
 * Sections: 0 financial picture · 1 goals · 2 risk · 3 tax. Each source is
 * best-effort — a missing/erroring one just leaves its section unconfirmed.
 */
export async function getAboutYouStatus(): Promise<AboutYouStatus> {
  const [profile, onboarding, goals] = await Promise.all([
    getFullProfile().catch(() => null),
    getOnboardingProfile().catch(() => null),
    listGoals().catch(() => []),
  ]);

  const confirmed = [false, false, false, false];

  // 0) Financial picture — all required finance answers: income, expense, cash & debt.
  if (
    onboarding &&
    onboarding.annual_income != null &&
    onboarding.monthly_household_expense != null &&
    onboarding.financial_assets != null
  ) {
    confirmed[0] = true;
  }

  // 1) Goals — saved objectives, or at least one goal in the goal planner.
  const inv = profile?.investment_profile;
  if (inv?.objectives?.length) confirmed[1] = true;
  if (goals.length > 0) confirmed[1] = true;

  // 2) Risk — investment horizon plus all three behavioural answers.
  const risk = profile?.risk_profile;
  if (
    risk &&
    risk.investment_horizon &&
    risk.investment_experience &&
    risk.investment_focus &&
    risk.drop_reaction
  ) {
    confirmed[2] = true;
  }

  // 3) Tax — a marginal income-tax rate and a chosen regime.
  const tax = profile?.tax_profile;
  if (tax?.income_tax_rate != null && (tax.tax_regime === "old" || tax.tax_regime === "new")) {
    confirmed[3] = true;
  }

  const confirmedCount = confirmed.filter(Boolean).length;
  return { confirmedCount, allConfirmed: confirmedCount === 4 };
}

/** User has linked an institution or already has portfolio value / holdings in DB. */
export function inferAccountLinkingComplete(
  portfolio: PortfolioDetail | null | undefined,
  linkedAccounts: LinkAccountInfo[] | null | undefined,
): boolean {
  if (linkedAccounts && linkedAccounts.length > 0) return true;
  if (!portfolio) return false;
  if (portfolio.total_value > 0) return true;
  if (portfolio.holdings?.length) return true;
  return false;
}

/** Skip post-setup completion toasts when both profile onboarding and account data exist. */
export function shouldSkipPostSetupChatPrompts(
  me: UserInfo,
  profile: FullProfileResponse | null,
  portfolio: PortfolioDetail | null,
  linkedAccounts: LinkAccountInfo[],
): boolean {
  return inferOnboardingComplete(me, profile) && inferAccountLinkingComplete(portfolio, linkedAccounts);
}

/** Goal-based allocation output (mirrors ``goal_based_allocation_pydantic.models.GoalAllocationOutput``). */
export interface GoalAllocationGoal {
  goal_name: string;
  time_to_goal_months: number;
  amount_needed: number;
  goal_priority: string;
  investment_goal: string;
}

export interface GoalAllocationFutureInvestment {
  bucket?: string | null;
  future_investment_amount: number;
  message?: string | null;
}

export interface GoalAllocationSubgroupFundMapping {
  asset_class: "equity" | "debt" | "others";
  asset_subgroup: string;
  sub_category: string;
  recommended_fund: string;
  isin: string;
  amount: number;
}

export interface AggregatedSubgroupRow {
  subgroup: string;
  sub_category?: string | null;
  emergency: number;
  short_term: number;
  medium_term: number;
  long_term: number;
  total: number;
  fund_mapping?: GoalAllocationSubgroupFundMapping | null;
}

export interface GoalAllocationBucket {
  bucket: "emergency" | "short_term" | "medium_term" | "long_term";
  goals: GoalAllocationGoal[];
  total_goal_amount: number;
  allocated_amount: number;
  future_investment?: GoalAllocationFutureInvestment | null;
  subgroup_amounts: Record<string, number>;
  rationale?: string | null;
  goal_rationales: Record<string, string>;
}

export interface GoalAllocationAssetClassSplit {
  bucket: "emergency" | "short_term" | "medium_term" | "long_term";
  equity: number;
  debt: number;
  others: number;
  equity_pct: number;
  debt_pct: number;
  others_pct: number;
}

export interface GoalAllocationAssetClassBlock {
  per_bucket: GoalAllocationAssetClassSplit[];
  equity_total: number;
  debt_total: number;
  others_total: number;
  equity_total_pct: number;
  debt_total_pct: number;
  others_total_pct: number;
}

export interface GoalAllocationAssetClassBreakdown {
  planned: GoalAllocationAssetClassBlock;
  actual: GoalAllocationAssetClassBlock;
  actual_sum_matches_grand_total: boolean;
}

export interface GoalAllocationOutput {
  client_summary: {
    age: number;
    occupation?: string | null;
    effective_risk_score: number;
    total_corpus: number;
    goals: GoalAllocationGoal[];
  };
  bucket_allocations: GoalAllocationBucket[];
  aggregated_subgroups: AggregatedSubgroupRow[];
  future_investments_summary: GoalAllocationFutureInvestment[];
  grand_total: number;
  all_amounts_in_multiples_of_100: boolean;
  asset_class_breakdown?: GoalAllocationAssetClassBreakdown | null;
}

export interface RecommendedPlanSnapshot {
  id: string;
  snapshot_kind: string;
  allocation: {
    rows?: Array<{ asset_class: string; weight_pct: number }>;
    equity_pct?: number;
    debt_pct?: number;
    others_pct?: number;
    goal_allocation_output?: GoalAllocationOutput;
  };
  effective_at: string;
  source?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface RecommendedPlanResponse {
  snapshot: RecommendedPlanSnapshot | null;
  latest_rebalancing_id: string | null;
}

/** Latest persisted ideal allocation from chat or asset-allocation module (requires auth). */
export async function getRecommendedPlan(): Promise<RecommendedPlanResponse> {
  return request<RecommendedPlanResponse>("/portfolio/recommended-plan");
}

export interface PortfolioAllocationInput {
  asset_class: string;
  allocation_percentage: number;
  amount: number;
}

export interface PortfolioAllocationUpdatePayload {
  total_investment?: number;
  allocations: PortfolioAllocationInput[];
}

export async function getPortfolioAllocations(): Promise<PortfolioDetail["allocations"]> {
  return request<PortfolioDetail["allocations"]>("/portfolio/allocations");
}

export async function updatePortfolioAllocations(
  payload: PortfolioAllocationUpdatePayload
): Promise<PortfolioDetail["allocations"]> {
  return request<PortfolioDetail["allocations"]>("/portfolio/allocations", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export interface PortfolioHoldingInput {
  instrument_name: string;
  instrument_type: string;
  ticker_symbol?: string | null;
  quantity?: number | null;
  average_cost?: number | null;
  current_price?: number | null;
  current_value: number;
  allocation_percentage?: number | null;
  exchange?: string | null;
  expense_ratio?: number | null;
  return_1y?: number | null;
  return_3y?: number | null;
  return_5y?: number | null;
}

export interface PortfolioHoldingBulkPayload {
  holdings: PortfolioHoldingInput[];
}

export async function getPortfolioHoldings(): Promise<PortfolioDetail["holdings"]> {
  return request<PortfolioDetail["holdings"]>("/portfolio/holdings");
}

export async function updatePortfolioHoldings(
  payload: PortfolioHoldingBulkPayload
): Promise<PortfolioDetail["holdings"]> {
  return request<PortfolioDetail["holdings"]>("/portfolio/holdings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export interface PortfolioHistoryPoint {
  id: string;
  recorded_date: string;
  total_value: number;
}

export async function getPortfolioHistory(limit = 90): Promise<PortfolioHistoryPoint[]> {
  return request<PortfolioHistoryPoint[]>(`/portfolio/history?limit=${limit}`);
}

export interface PortfolioHistoryInput {
  recorded_date: string;
  total_value: number;
}

export interface PortfolioHistoryBulkPayload {
  history: PortfolioHistoryInput[];
}

export async function updatePortfolioHistory(
  payload: PortfolioHistoryBulkPayload
): Promise<PortfolioHistoryPoint[]> {
  return request<PortfolioHistoryPoint[]>("/portfolio/history", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type PortfolioNavHorizon = "1M" | "3M" | "1Y" | "3Y" | "MAX";

export interface PortfolioNavHistoryPoint {
  recorded_date: string;
  total_value: number;
  total_invested: number;
  gain_percentage: number;
}

export interface PortfolioNavHistoryResponse {
  horizon: PortfolioNavHorizon;
  points: PortfolioNavHistoryPoint[];
  total_invested: number;
  current_value: number;
  gain_percentage: number;
}

export async function getPortfolioNavHistory(
  horizon: PortfolioNavHorizon = "1Y"
): Promise<PortfolioNavHistoryResponse> {
  return request<PortfolioNavHistoryResponse>(
    `/portfolio/nav-history?horizon=${horizon}`
  );
}

export async function refreshPortfolioNavHistory(): Promise<PortfolioNavHistoryResponse> {
  return request<PortfolioNavHistoryResponse>("/portfolio/nav-history/refresh", {
    method: "POST",
  });
}

export type NetworthJobState =
  | "none"
  | "pending"
  | "running"
  | "success"
  | "failed";

export interface NetworthJobStatus {
  status: NetworthJobState;
  phase: string | null;
  progress_pct: number;
  message: string | null;
  history_from: string | null;
  days_total: number | null;
  /** True once a real net-worth series exists (skip the CTA). */
  has_history: boolean;
  started_at: string | null;
  finished_at: string | null;
}

/** Poll the one-time net-worth-history backfill job (status + % completion). */
export async function getNetworthHistoryStatus(): Promise<NetworthJobStatus> {
  return request<NetworthJobStatus>("/portfolio/networth-history/status");
}

/** Kick off the one-time net-worth-history backfill (NAV fetch + compute). */
export async function buildNetworthHistory(): Promise<NetworthJobStatus> {
  return request<NetworthJobStatus>("/portfolio/networth-history/build", {
    method: "POST",
  });
}

// ── Goals API ───────────────────────────────────────────

export interface GoalResponse {
  id: string;
  name: string;
  slug: string | null;
  icon: string | null;
  description: string | null;
  target_amount: number | null;
  target_date: string | null;
  invested_amount: number;
  current_value: number;
  monthly_contribution: number | null;
  suggested_contribution: number | null;
  priority: string;
  status: string;
  inflation_rate?: number | null;
  created_at: string;
  updated_at: string;
}

export async function listGoals(): Promise<GoalResponse[]> {
  return request<GoalResponse[]>("/goals/");
}

export interface GoalCreatePayload {
  name: string;
  goal_type?: string;
  target_amount: number;
  target_date?: string;
  priority?: string;
  inflation_rate?: number;
  notes?: string;
  monthly_contribution?: number;
}

export async function createGoal(payload: GoalCreatePayload): Promise<GoalResponse> {
  return request<GoalResponse>("/goals/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface GoalUpdatePayload {
  name?: string;
  target_amount?: number;
  target_date?: string;
  priority?: string;
  inflation_rate?: number;
  notes?: string;
  monthly_contribution?: number;
}

export async function updateGoal(goalId: string, payload: GoalUpdatePayload): Promise<GoalResponse> {
  return request<GoalResponse>(`/goals/${goalId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function removeGoal(goalId: string): Promise<void> {
  await request<void>(`/goals/${goalId}`, { method: "DELETE" });
}

export interface GoalContributionCreatePayload {
  amount: number;
  note?: string;
}

export async function addGoalContribution(
  goalId: string,
  payload: GoalContributionCreatePayload,
): Promise<{ id: string; amount: number; contributed_at: string; note?: string | null }> {
  return request(`/goals/${goalId}/contributions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Cashflow API ─────────────────────────────────────

export interface AnnualCashflowRow {
  fy_end_date: string;
  fy_label: string;
  income: number;
  income_tax: number;
  household_expense: number;
  savings_pre_emi: number;
  existing_mortgage_emi: number;
  goal_mortgage_emi: number;
  savings_post_emi: number;
  one_off_inflow: number;
  one_off_outflow: number;
  corpus_opening: number;
  monthly_investment: number;
  investment_returns: number;
  goal_payout: number;
  corpus_closing: number;
  is_funded: boolean;
}

export interface MonthlyCashflowRow {
  month_end_date: string;
  fy_label: string;
  income: number;
  income_tax: number;
  household_expense: number;
  savings_pre_emi: number;
  existing_mortgage_emi: number;
  goal_mortgage_emi: number;
  savings_post_emi: number;
  one_off_inflow: number;
  one_off_outflow: number;
  corpus_opening: number;
  monthly_investment: number;
  investment_source?: string;
  investment_returns: number;
  goal_payout: number;
  corpus_closing: number;
  is_funded: boolean;
}

export interface HeadlineStatus {
  years_to_last_goal: number;
  last_goal_date: string;
  last_fy_end_date: string;
  number_of_goals: number;
  corpus_today: number;
  total_corpus_required_today: number;
  surplus_or_shortfall_today: number;
  corpus_closing: number;
  total_shortfall_fv: number;
  total_funded_amount: number;
}

export interface FundFlowSummary {
  corpus_opening: number;
  total_investments: number;
  total_roi: number;
  total_one_off_in: number;
  total_one_off_out: number;
  total_goals_paid: number;
  corpus_closing: number;
  corpus_today: number;
  total_corpus_required_today: number;
  surplus_or_shortfall_today: number;
}

export interface PlanSummary {
  top_line: string;
  retirement_note: string;
  cashflow_note: string;
  goals: { name: string; verdict: string; headline_amount: string; note: string }[];
  risks: string[];
  next_steps: string[];
  summary_error?: string | null;
}

export interface CashflowPlanRunDetail {
  id: string;
  user_id: string | null;
  chat_session_id: string | null;
  engine_version: string;
  cause: string;
  assumption_id: string;
  warnings: string[];
  computed_at: string;
  created_at: string;
  updated_at: string;
  headline: HeadlineStatus | null;
  fund_flow_summary: FundFlowSummary | null;
  plan_summary: PlanSummary | null;
  annual_cashflow: AnnualCashflowRow[];
  monthly_cashflow: MonthlyCashflowRow[] | null;
}

/**
 * True when the error is the engine refusing to run because the user hasn't
 * supplied the required cashflow inputs yet. The backend returns a 422 whose
 * `detail` is `{message, missing[]}`, which `request()` stringifies into the
 * Error message — so we parse it back. Callers treat this as "no plan yet"
 * (the CashflowGate handles asking the user), never as a hard error.
 */
export function isCashflowInputsMissingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  try {
    const d = JSON.parse(err.message) as { missing?: unknown };
    return d != null && typeof d === "object" && Array.isArray(d.missing);
  } catch {
    return false;
  }
}

export async function getCashflowLatest(): Promise<CashflowPlanRunDetail | null> {
  try {
    return await request<CashflowPlanRunDetail>(
      "/cashflow/latest",
      undefined,
      true,
      CHAT_REQUEST_TIMEOUT_MS,
    );
  } catch (err) {
    if (isCashflowInputsMissingError(err)) return null;
    throw err;
  }
}

export async function computeCashflow(): Promise<CashflowPlanRunDetail | null> {
  try {
    return await request<CashflowPlanRunDetail>(
      "/cashflow/compute",
      { method: "POST" },
      true,
      CHAT_REQUEST_TIMEOUT_MS,
    );
  } catch (err) {
    if (isCashflowInputsMissingError(err)) return null;
    throw err;
  }
}

// ── Cashflow readiness (goal-planning gate) ───────────────
/** One required/optional input the cashflow engine needs from the user. */
export interface CashflowReadinessField {
  key: string;
  label: string;
  group: string;
  kind: "money" | "int" | "percent" | "date";
  unit: string | null;
  help: string | null;
  optional: boolean;
  present: boolean;
  /** Current stored value. `percent` is already scaled (e.g. 22 for 0.22). */
  value: number | string | null;
}

export interface CashflowReadiness {
  ready: boolean;
  missing: string[];
  fields: CashflowReadinessField[];
}

/** Which inputs the goal-planning / cashflow engine still needs from the user. */
export async function getCashflowReadiness(): Promise<CashflowReadiness> {
  return request<CashflowReadiness>("/cashflow/readiness");
}

/** Values the cashflow unlock form collects, keyed by readiness field key. */
export interface CashflowInputValues {
  date_of_birth?: string;
  assumed_lifespan_years?: number;
  retirement_age?: number;
  annual_income?: number;
  monthly_household_expense?: number;
  /** Fraction (0-1). The form collects a percentage and divides before calling. */
  effective_tax_rate?: number;
  starting_monthly_investment?: number;
  current_portfolio_corpus?: number;
  financial_assets?: number;
  equity_shares?: number;
  financial_liabilities_excl_mortgage?: number;
  /** Desired retirement corpus, stored as a present-value figure (₹ today). */
  target_corpus?: number;
}

/**
 * Persist the cashflow inputs to their canonical homes, using the dedicated
 * (exclude_unset) profile endpoints so we never wipe untouched fields:
 *  - PFP scalars + tax → PUT /profile/personal-finance
 *  - date_of_birth + assumed_lifespan_years (on `users`) → PUT /profile/personal-info
 *  - retirement_age → PUT /profile/investment
 */
export async function saveCashflowInputs(v: CashflowInputValues): Promise<void> {
  const finance: PersonalFinancePayload = {};
  if (v.annual_income != null) finance.annual_income = v.annual_income;
  if (v.monthly_household_expense != null) finance.monthly_household_expense = v.monthly_household_expense;
  if (v.effective_tax_rate != null) finance.effective_tax_rate = v.effective_tax_rate;
  if (v.starting_monthly_investment != null) finance.starting_monthly_investment = v.starting_monthly_investment;
  if (v.current_portfolio_corpus != null) finance.current_portfolio_corpus = v.current_portfolio_corpus;
  if (v.financial_assets != null) finance.financial_assets = v.financial_assets;
  if (v.equity_shares != null) finance.equity_shares = v.equity_shares;
  if (v.financial_liabilities_excl_mortgage != null)
    finance.financial_liabilities_excl_mortgage = v.financial_liabilities_excl_mortgage;
  if (Object.keys(finance).length > 0) await updatePersonalFinance(finance);

  const personal: PersonalInfoPayload = {};
  if (v.date_of_birth != null) personal.date_of_birth = v.date_of_birth;
  if (v.assumed_lifespan_years != null) personal.assumed_lifespan_years = v.assumed_lifespan_years;
  if (Object.keys(personal).length > 0) await updatePersonalInfo(personal);

  const investment: InvestmentProfilePayload = {};
  if (v.retirement_age != null) investment.retirement_age = v.retirement_age;
  if (v.target_corpus != null) investment.target_corpus = v.target_corpus;
  if (Object.keys(investment).length > 0) await updateInvestmentProfile(investment);

  invalidateUserContextCache();
}

// ── Discovery API ─────────────────────────────────────

export interface DiscoveryFund {
  id: string;
  name: string;
  short_name: string | null;
  ticker_symbol: string | null;
  category: string | null;
  sector: string | null;
  description: string | null;
  exchange: string | null;
  expense_ratio: number | null;
  exit_load: string | null;
  min_investment: number | null;
  return_1y: number | null;
  return_3y: number | null;
  return_5y: number | null;
  risk_level: string | null;
  is_trending: boolean;
  is_house_view: boolean;
}

export interface DiscoveryFundListResponse {
  funds: DiscoveryFund[];
  total: number;
}

export async function listDiscoveryFunds(params?: {
  search?: string;
  category?: string;
  sector?: string;
  limit?: number;
  offset?: number;
}): Promise<DiscoveryFundListResponse> {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.category) q.set("category", params.category);
  if (params?.sector) q.set("sector", params.sector);
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.offset != null) q.set("offset", String(params.offset));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return request<DiscoveryFundListResponse>(`/discovery/funds${suffix}`);
}

export async function listDiscoveryTrending(): Promise<DiscoveryFund[]> {
  return request<DiscoveryFund[]>("/discovery/trending");
}

// ── MF Fund Metadata search (Discover) ──────────────────
export interface MfFundMetadataListItem {
  id: string;
  scheme_code: string;
  isin: string | null;
  scheme_name: string;
  amc_name: string;
  category: string;
  sub_category: string | null;
  asset_class: string | null;
  asset_subgroup: string | null;
  risk_rating_sebi: string | null;
  returns_1y_pct: number | null;
  returns_3y_pct: number | null;
  returns_5y_pct: number | null;
}

export interface MfFundMetadataSearchResponse {
  items: MfFundMetadataListItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface MfFundMetadataSearchParams {
  q?: string;
  category?: string;
  sub_category?: string;
  asset_class?: string;
  amc_name?: string;
  active_only?: boolean;
  limit?: number;
  offset?: number;
}

export async function searchMfFunds(
  params: MfFundMetadataSearchParams = {}
): Promise<MfFundMetadataSearchResponse> {
  const q = new URLSearchParams();
  if (params.q && params.q.trim()) q.set("q", params.q.trim());
  if (params.category) q.set("category", params.category);
  if (params.sub_category) q.set("sub_category", params.sub_category);
  if (params.asset_class) q.set("asset_class", params.asset_class);
  if (params.amc_name) q.set("amc_name", params.amc_name);
  if (params.active_only != null) q.set("active_only", String(params.active_only));
  q.set("limit", String(params.limit ?? 20));
  q.set("offset", String(params.offset ?? 0));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return request<MfFundMetadataSearchResponse>(
    `/mf/fund-metadata/search${suffix}`,
    undefined,
    false,
  );
}

/** NAV sample for chart + investor detail (public). */
export interface MfNavChartPoint {
  nav_date: string;
  nav: number;
}

export interface MfNavDerivedReturns {
  return_1y_abs_pct: number | null;
  return_3y_cagr_pct: number | null;
  return_5y_cagr_pct: number | null;
  return_10y_cagr_pct: number | null;
  return_inception_abs_pct: number | null;
  return_inception_cagr_pct: number | null;
  first_nav_date: string | null;
  latest_nav: number | null;
  latest_nav_date: string | null;
  nav_row_count: number;
}

export interface MfMetadataReturnsSnapshot {
  returns_1y_pct: number | null;
  returns_3y_pct: number | null;
  returns_5y_pct: number | null;
  returns_10y_pct: number | null;
}

export interface MfFundInvestorDetailResponse {
  metadata_id: string;
  scheme_code: string;
  scheme_name: string;
  amc_name: string;
  category: string;
  sub_category: string | null;
  isin: string | null;
  isin_div_reinvest: string | null;
  plan_type: string;
  option_type: string;
  is_active: boolean;
  risk_rating_sebi: string | null;
  asset_class: string | null;
  asset_subgroup: string | null;
  direct_plan_fees: number | null;
  regular_plan_fees: number | null;
  exit_load_percent: number | null;
  exit_load_months: number | null;
  large_cap_equity_pct: number | null;
  mid_cap_equity_pct: number | null;
  small_cap_equity_pct: number | null;
  debt_pct: number | null;
  others_pct: number | null;
  returns_from_nav: MfNavDerivedReturns;
  returns_from_metadata: MfMetadataReturnsSnapshot;
  nav_chart: MfNavChartPoint[];
  disclaimers: string[];
}

/** Fund scheme page: facts + NAV-derived returns (Groww-style detail). */
export async function getMfFundInvestorDetail(fundId: string): Promise<MfFundInvestorDetailResponse> {
  return request<MfFundInvestorDetailResponse>(
    `/mf/fund-metadata/${encodeURIComponent(fundId)}/investor-detail`,
    undefined,
    false,
  );
}

export async function listDiscoveryHouseView(): Promise<DiscoveryFund[]> {
  return request<DiscoveryFund[]>("/discovery/house-view");
}

export interface DiscoverySector {
  sector: string;
  fund_count: number;
}

export async function listDiscoverySectors(): Promise<DiscoverySector[]> {
  return request<DiscoverySector[]>("/discovery/sectors");
}

// ── Family API ──────────────────────────────────────────

export async function listFamilyMembers(): Promise<FamilyMemberListResponse> {
  return request<FamilyMemberListResponse>("/family/members");
}

export async function addFamilyMember(p: AddFamilyMemberPayload): Promise<FamilyMember> {
  return request<FamilyMember>("/family/members", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export async function updateFamilyMember(memberId: string, p: UpdateFamilyMemberPayload): Promise<FamilyMember> {
  return request<FamilyMember>(`/family/members/${memberId}`, {
    method: "PUT",
    body: JSON.stringify(p),
  });
}

export async function removeFamilyMember(memberId: string): Promise<void> {
  await request<void>(`/family/members/${memberId}`, { method: "DELETE" });
}

export async function getFamilyMemberPortfolio(memberId: string): Promise<PortfolioDetail> {
  return request<PortfolioDetail>(`/family/members/${memberId}/portfolio`);
}

export async function getCumulativePortfolio(): Promise<CumulativePortfolioResponse> {
  return request<CumulativePortfolioResponse>("/family/portfolio/cumulative");
}

export async function verifyFamilyOtp(memberId: string, otp: string): Promise<FamilyMember> {
  return request<FamilyMember>(`/family/members/${memberId}/verify-otp`, {
    method: "POST",
    body: JSON.stringify({ otp }),
  });
}

export async function resendFamilyOtp(memberId: string, retryType = "text"): Promise<{ message: string }> {
  return request<{ message: string }>(`/family/members/${memberId}/resend-otp`, {
    method: "POST",
    body: JSON.stringify({ retry_type: retryType }),
  });
}

export async function onboardFamilyMember(p: OnboardFamilyMemberPayload): Promise<FamilyMember> {
  return request<FamilyMember>("/family/members/onboard", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

// ── Notifications API ───────────────────────────────────
export interface NotificationInfo {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}

export async function listNotifications(): Promise<NotificationInfo[]> {
  return request<NotificationInfo[]>("/notifications/");
}

export async function markNotificationAsRead(notificationId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/notifications/${notificationId}/read`, {
    method: "PUT",
  });
}

export async function markAllNotificationsAsRead(): Promise<{ message: string }> {
  return request<{ message: string }>("/notifications/read-all", {
    method: "PUT",
  });
}

// ── Meeting Notes API ───────────────────────────────────
export interface MeetingNoteInfo {
  id: string;
  title: string;
  meeting_date: string | null;
  is_mandate_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface MeetingNoteItemInfo {
  id: string;
  item_type: "transcript" | "summary";
  role: string | null;
  content: string;
  sort_order: number;
  created_at: string;
}

export interface MeetingNoteDetailInfo extends MeetingNoteInfo {
  items: MeetingNoteItemInfo[];
}

export async function listMeetingNotes(): Promise<MeetingNoteInfo[]> {
  return request<MeetingNoteInfo[]>("/meeting-notes/");
}

export async function getMeetingNote(noteId: string): Promise<MeetingNoteDetailInfo> {
  return request<MeetingNoteDetailInfo>(`/meeting-notes/${noteId}`);
}

export async function approveMeetingMandate(noteId: string): Promise<{ message: string; meeting_note_id: string }> {
  return request<{ message: string; meeting_note_id: string }>(`/meeting-notes/${noteId}/approve-mandate`, {
    method: "POST",
  });
}

// ── Rebalancing API ─────────────────────────────────────
export type RebalancingStatus = "pending" | "approved" | "executed" | "rejected";

export interface RebalancingRecommendationInfo {
  id: string;
  portfolio_id: string;
  status: RebalancingStatus;
  recommendation_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function listRebalancingRecommendations(): Promise<RebalancingRecommendationInfo[]> {
  return request<RebalancingRecommendationInfo[]>("/rebalancing/");
}

export async function getRebalancingRecommendation(recommendationId: string): Promise<RebalancingRecommendationInfo> {
  return request<RebalancingRecommendationInfo>(`/rebalancing/${recommendationId}`);
}

export async function updateRebalancingStatus(
  recommendationId: string,
  status: RebalancingStatus,
): Promise<RebalancingRecommendationInfo> {
  return request<RebalancingRecommendationInfo>(`/rebalancing/${recommendationId}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

// ── Rebalancing run detail (normalized) ─────────────────
// The /rebalancing endpoints return the normalized rebalancing_* family — a run
// with totals + subgroup roll-ups + the BUY/SELL/EXIT trades. These typed
// helpers back the /invest page; the legacy `recommendation_data` shape above is
// kept only for the old orphaned page.

export interface RebalancingTrade {
  id: string;
  isin: string;
  recommended_fund: string;
  asset_subgroup: string;
  asset_class: string; // backend-derived "Equity" | "Debt" | "Others"
  sub_category: string;
  action: string; // "BUY" | "SELL" | "EXIT"
  amount_inr: number;
  reason_code: string;
  reason_title: string;
  reason_text: string;
  execution_status: string;
}

export interface RebalancingTotals {
  total_buy_inr: number;
  total_sell_inr: number;
  net_cash_flow_inr: number;
  total_tax_estimate_inr: number;
  total_stcg_realised: number;
  total_ltcg_realised: number;
  funds_to_buy_count: number;
  funds_to_sell_count: number;
  funds_to_exit_count: number;
  funds_held_count: number;
}

export interface RebalancingSubgroupSummary {
  asset_subgroup: string;
  asset_class: string; // backend-derived "Equity" | "Debt" | "Others"
  goal_target_inr: number;
  current_holding_inr: number;
  suggested_final_holding_inr: number;
  rebalance_inr: number;
  total_buy_inr: number;
  total_sell_inr: number;
}

export interface RebalancingRunListItem {
  id: string;
  portfolio_id: string;
  source_allocation_run_id: string;
  status: RebalancingStatus;
  engine_version: string;
  created_at: string;
  updated_at: string;
}

/** One Equity/Debt/Others row of the backend-computed Current-vs-Target bars. */
export interface AssetClassBreakdownRow {
  asset_class: string; // "Equity" | "Debt" | "Others"
  current_inr: number;
  target_inr: number;
}

/** Multi-asset-aware asset-class split for the Invest "Current vs Target" view.
 *  Blended funds are split per-category on the backend, so the frontend renders
 *  these numbers directly without any client-side classification. */
export interface RebalancingAssetClassBreakdown {
  rows: AssetClassBreakdownRow[];
  current_total_inr: number;
  target_total_inr: number;
}

export interface RebalancingRunDetail extends RebalancingRunListItem {
  totals: RebalancingTotals | null;
  subgroup_summaries: RebalancingSubgroupSummary[];
  trades: RebalancingTrade[];
  warnings: { code: string; message: string; affected_isins: string[] }[];
  /** Plan-aware headline computed by the backend; absent on older runs. */
  summary?: { title: string; subtitle: string; reason?: string | null } | null;
  /** Backend-computed asset-class split (multi-asset look-through) for the
   *  Current-vs-Target bars; absent on older runs (fall back to local rollup). */
  asset_class_breakdown?: RebalancingAssetClassBreakdown | null;
}

/** Latest-first list of the user's rebalancing runs. */
export async function listRebalancingRuns(): Promise<RebalancingRunListItem[]> {
  return request<RebalancingRunListItem[]>("/rebalancing/");
}

/** Full run detail — totals + trades + subgroup roll-ups + warnings. */
export async function getRebalancingRunDetail(runId: string): Promise<RebalancingRunDetail> {
  return request<RebalancingRunDetail>(`/rebalancing/${runId}`);
}

// ── Rebalancing readiness / unlock gate ─────────────────
// Mirrors the cashflow readiness gate (see saveCashflowInputs). The field list
// is driven entirely by the backend so the unlock form stays in sync with what
// the engine actually requires.

export interface RebalancingReadinessField {
  key: string;
  label: string;
  group: string;
  kind: string; // "date" | "money" | "int" | "percent"
  unit?: string | null;
  help?: string | null;
  optional?: boolean;
  present: boolean;
  value?: number | string | null;
}

export interface RebalancingReadiness {
  ready: boolean;
  missing: string[];
  fields: RebalancingReadinessField[];
  /** False → user has no MF holdings; the gate shows a "connect portfolio" CTA. */
  has_holdings: boolean;
}

export async function getRebalancingReadiness(): Promise<RebalancingReadiness> {
  return request<RebalancingReadiness>("/rebalancing/readiness");
}

export interface RebalancingInputValues {
  date_of_birth?: string;
}

/**
 * Persist the rebalancing inputs to their canonical homes (same pattern as
 * saveCashflowInputs): date_of_birth lives on `users` → PUT /profile/personal-info.
 * Holdings aren't a form field — the gate links to the connect-portfolio flow.
 */
export async function saveRebalancingInputs(v: RebalancingInputValues): Promise<void> {
  const personal: PersonalInfoPayload = {};
  if (v.date_of_birth != null) personal.date_of_birth = v.date_of_birth;
  if (Object.keys(personal).length > 0) await updatePersonalInfo(personal);
  invalidateUserContextCache();
}

export interface RebalancingComputeResponse {
  answer_markdown: string;
  recommendation_id: string | null;
  blocking_message: string | null;
}

/** Run the rebalancing engine directly (no chat). Persists a rebalancing run. */
export async function runRebalancing(
  question = "Rebalance my portfolio",
): Promise<RebalancingComputeResponse> {
  return request<RebalancingComputeResponse>(
    "/ai-modules/rebalancing/compute",
    { method: "POST", body: JSON.stringify({ question }) },
    true,
    CHAT_REQUEST_TIMEOUT_MS,
  );
}

// ── Support: report an issue ────────────────────────────
export const ISSUE_SOURCES = [
  "Chat Response",
  "Portfolio NAV",
  "Rebalancing",
  "Goal Planning",
  "Onboarding",
  "Other",
] as const;

export type IssueSource = (typeof ISSUE_SOURCES)[number];

export interface IssueReportResponse {
  id: string;
  source: string;
  source_detail: string | null;
  description: string;
  has_screenshot: boolean;
  created_at: string;
  message: string;
}

/** Multipart (optional screenshot) — same shape as uploadCamsStatement. */
export async function reportIssue(
  source: IssueSource,
  description: string,
  screenshot?: File | null,
  sourceDetail?: string,
): Promise<IssueReportResponse> {
  if (Date.now() < backendOfflineUntil) {
    throw new BackendOfflineError();
  }
  const form = new FormData();
  form.append("source", source);
  if (sourceDetail) form.append("source_detail", sourceDetail);
  form.append("description", description);
  if (screenshot) form.append("screenshot", screenshot);

  // NB: do not set Content-Type — the browser must add the multipart boundary itself.
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const familyMemberId = getActiveFamilyMemberId();
  if (familyMemberId) headers["X-Family-Member-Id"] = familyMemberId;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ISSUE_REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API}/support/report-issue`, {
      method: "POST",
      headers,
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    backendOfflineUntil = Date.now() + OFFLINE_RETRY_MS;
    throw new BackendOfflineError("Backend is unreachable");
  } finally {
    window.clearTimeout(timeoutId);
  }

  const text = await res.text();
  if (!res.ok) {
    let msg: string;
    try {
      const body = JSON.parse(text) as { detail?: unknown };
      msg = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      msg = text.trim() || `Request failed (${res.status})`;
    }
    if ([502, 503, 504].includes(res.status)) {
      backendOfflineUntil = Date.now() + OFFLINE_RETRY_MS;
      throw new BackendOfflineError(msg || "Backend unavailable");
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  return JSON.parse(text) as IssueReportResponse;
}
