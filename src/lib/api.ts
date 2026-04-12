const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/$/, "");
const API = `${API_BASE}/api/v1`;
const TOKEN_KEY = "asktilly_token";
const FAMILY_MEMBER_KEY = "asktilly_family_member_id";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
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
    let msg: string;
    try {
      const body = (await res.json()) as unknown;
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
      msg = await res.text();
    }
    // Treat common gateway/unavailable statuses as "offline" to avoid noisy errors.
    if ([502, 503, 504].includes(res.status)) {
      backendOfflineUntil = Date.now() + OFFLINE_RETRY_MS;
      throw new BackendOfflineError(msg || "Backend unavailable");
    }
    throw new Error(msg || `Request failed (${res.status})`);
  }
  if (res.status === 204 || res.status === 205) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
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

export async function getMe(): Promise<UserInfo> {
  return request<UserInfo>("/auth/me");
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
  selected_goals?: string[];
  custom_goals?: string[];
  investment_horizon?: string;
  annual_income_min?: number;
  annual_income_max?: number;
  annual_expense_min?: number;
  annual_expense_max?: number;
}

export async function saveOnboardingProfile(p: OnboardingProfilePayload) {
  return request("/onboarding/profile", {
    method: "POST",
    body: JSON.stringify(p),
  });
}

export async function completeOnboarding() {
  return request("/onboarding/complete", {
    method: "POST",
    body: JSON.stringify({ is_complete: true }),
  });
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
  return request<{ accounts: LinkAccountInfo[] }>("/linked-accounts/");
}

// ── Finvu / AA bucket snapshot (post-consent totals from Finvu analytics API) ──
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

export async function syncFinvuPortfolio(payload: FinvuPortfolioSyncRequest): Promise<FinvuPortfolioSyncResponse> {
  return request<FinvuPortfolioSyncResponse>("/portfolio/finvu/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function logout() {
  clearToken();
}

// ── Chat API ────────────────────────────────────────────
export interface ChatSessionInfo {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageInfo {
  id: string;
  role: string;
  content: string;
  intent: string | null;
  intent_confidence: number | null;
  intent_reasoning: string | null;
  created_at: string;
}

export interface ChatSendResponse {
  user_message: ChatMessageInfo;
  assistant_message: ChatMessageInfo;
  /** Present when chat persisted an ideal allocation — use for CTA to `/execute`. */
  ideal_allocation_rebalancing_id?: string | null;
  ideal_allocation_snapshot_id?: string | null;
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
}

export interface PersonalInfoResponse {
  occupation: string | null;
  family_status: string | null;
  wealth_sources: string[] | null;
  personal_values: string[] | null;
  address: string | null;
  currency: string;
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
  return request<FullProfileResponse>("/profile/");
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

export async function getInvestmentProfile(): Promise<InvestmentProfileResponse> {
  return request<InvestmentProfileResponse>("/profile/investment");
}

export async function updateInvestmentProfile(p: InvestmentProfilePayload): Promise<InvestmentProfileResponse> {
  return request<InvestmentProfileResponse>("/profile/investment", {
    method: "PUT",
    body: JSON.stringify(p),
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
  holdings: { id: string; instrument_name: string; instrument_type: string; ticker_symbol: string | null; quantity: number | null; average_cost: number | null; current_price: number | null; current_value: number; allocation_percentage: number | null }[];
}

/** Primary portfolio for the logged-in user (from DB). */
export async function getMyPortfolio(): Promise<PortfolioDetail> {
  return request<PortfolioDetail>("/portfolio/");
}

/** Ideal allocation pipeline output (mirrors ``Ideal_asset_allocation.models.AllocationOutput``). */
export interface SubgroupItem {
  subgroup: string;
  asset_class: string;
  recommended_fund: string;
  asset_class_subcategory: string;
  isin: string;
  pct: number;
  amount: number;
}

export interface IdealAllocationOutput {
  client_summary?: {
    age: number;
    occupation?: string | null;
    investment_horizon: string;
    investment_goal: string;
    effective_risk_score: number;
    total_corpus: number;
  };
  asset_class_allocation?: {
    equities: { pct: number; amount: number };
    debt: { pct: number; amount: number };
    others: { pct: number; amount: number };
  };
  subgroup_allocation?: {
    equity: SubgroupItem[];
    debt: SubgroupItem[];
    others: SubgroupItem[];
  };
  grand_total?: number;
}

export interface RecommendedPlanSnapshot {
  id: string;
  snapshot_kind: string;
  allocation: {
    rows?: Array<{ asset_class: string; weight_pct: number }>;
    equity_pct?: number;
    debt_pct?: number;
    others_pct?: number;
    ideal_allocation_output?: IdealAllocationOutput;
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
  notes?: string;
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
  notes?: string;
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
