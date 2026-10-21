export type Severity = 'correct' | 'error' | 'warning' | 'info';
export type AppealStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';

export interface Appeal {
  id: string;
  jobId: string;
  userId: string;
  username: string;
  message: string;
  contact?: string;
  status: AppealStatus;
  adminResponse?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  role: 'user' | 'admin';
  createdAt?: string | null;
}

export type ProblemCategory = 'auto' | 'algebra' | 'number-theory' | 'combinatorics' | 'geometry' | 'cmo' | 'first-exam' | 'other';
export type ScoreMode = 'standard' | 'all-or-nothing' | 'paper';

export interface Annotation {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  severity: Severity;
  title: string;
  comment: string;
  suggestion?: string;
  rubric?: string;
  question?: string;
  delta?: number;
}

export interface Dimension {
  name: string;
  score: number;
  max: number;
  comment?: string;
}

export interface Criterion {
  name: string;
  max: number;
  awarded: number;
  reason?: string;
  evidence?: string;
  status?: 'full' | 'partial' | 'miss';
}

export interface GradingQuestion {
  no: string;
  type: string;
  topic?: string;
  max: number;
  score: number;
  substantive?: boolean;
  unit?: number;
  comment?: string;
  status?: 'full' | 'partial' | 'miss';
}

export interface ScoreScheme {
  id: string;
  label: string;
  total: number;
  unit: number;
  mode: ScoreMode;
  levels: number[];
  category?: ProblemCategory;
}

export interface RubricAnchor {
  points: number;
  condition: string;
}

export interface RubricPartialRule {
  label: string;
  points: number;
  note: string;
  exclusive?: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface StepAuditEntry {
  page: number;
  step: number;
  claim: string;
  status: 'correct' | 'gap' | 'wrong' | 'unverified';
  check: string;
  criteria?: string[];
  note?: string;
}

export interface CitedResult {
  name: string;
  statement: string;
  known?: boolean;
  searchQuery?: string;
  searchResults?: SearchResult[];
  searchError?: string;
  status?: 'known' | 'verified' | 'derived' | 'unverified';
  evidence?: string;
  criteria?: string[];
  firstUse?: string;
  note?: string;
  blocksConclusion?: boolean;
}

export interface StudentRoute {
  status: 'valid' | 'partial' | 'invalid';
  summary: string;
  routeSolution?: string;
  acceptedSteps: string[];
  criterionMap?: Array<{
    criterion: string;
    studentEvidence: string;
    credit: 'full' | 'partial' | 'none';
    note: string;
  }>;
  maxScoreViaRoute?: number;
  scoringNote: string;
}


export interface GeneratedRubric {
  id: string;
  title: string;
  category: ProblemCategory;
  categoryLabel: string;
  total: number;
  unit: number;
  mode: ScoreMode;
  levels: number[];
  summary: string;
  criteria: RubricItem[];
  partialRules: RubricPartialRule[];
  triviality?: string;
  source?: string;
  zeroConditions?: string[];
  citedResults?: CitedResult[];
  studentRoute?: StudentRoute;
  pdfUrl: string;
}

export interface GradingResult {
  id: string;
  createdAt: string;
  provider: string;
  providerName: string;
  ownerName?: string;
  userId?: string;
  model: string;
  demo: boolean;
  elapsedMs?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  score: number;
  maxScore: number;
  category?: ProblemCategory;
  categoryLabel?: string;
  scoreUnit?: number;
  paperMode?: boolean;
  questions?: GradingQuestion[];
  generatedRubric?: GeneratedRubric;
  rubricPdfUrl?: string;
  warnings?: string[];
  gradeLabel: string;
  confidence: number;
  summary: string;
  overallComment: string;
  dimensions: Dimension[];
  criteria: Criterion[];
  substantiveGate?: { passed: boolean; reason: string };
  stepAudit?: StepAuditEntry[];
  verificationComplete?: boolean;
  verificationIncomplete?: boolean;
  citedResults?: CitedResult[];
  annotations: Annotation[];
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  problemText: string;
  problemImages: string[];
  solutionImages: string[];
  rubricImages: string[];
  rubricText: string;
  rubricName: string;
  sourceLabel?: string;
  studentName?: string;
}

export interface JobMeta {
  id: string;
  createdAt: string;
  score: number;
  maxScore: number;
  gradeLabel: string;
  providerName: string;
  ownerName?: string;
  userId?: string;
  model: string;
  demo: boolean;
  category?: ProblemCategory;
  categoryLabel?: string;
  paperMode?: boolean;
  problemExcerpt: string;
  solutionCount: number;
}

export type ProviderId = 'demo' | 'deepseek' | 'bigmodel' | 'opencode';

export interface ProviderModel {
  id: string;
  label: string;
  vision: boolean;
  note?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  short: string;
  baseUrl: string;
  protocol: string;
  envKey: string;
  serverKeyConfigured: boolean;
  models: ProviderModel[];
  docs: string;
  accent: string;
}

export interface AppConfig {
  providers: ProviderInfo[];
  pdfAvailable: boolean;
  texVersion?: string;
  demoAvailable: boolean;
  maxImages: number;
}

export interface StoredSettings {
  providerId: ProviderId;
  model: string;
  apiKeys: Partial<Record<ProviderId, string>>;
  baseUrls: Partial<Record<ProviderId, string>>;
  customModel: string;
  strictness: 'standard' | 'strict' | 'encouraging';
  studentName: string;
  graderName: string;
}

export interface RubricItem {
  name: string;
  max: number;
  description?: string;
  anchors?: RubricAnchor[];
}

export interface PaperQuestion {
  no: string;
  type: string;
  max: number;
  unit: number;
  mode: ScoreMode;
  topic?: string;
}

export interface RubricTemplate {
  id: string;
  name: string;
  scope: string;
  total: number;
  description: string;
  items: RubricItem[];
  builtin?: boolean;
  category?: ProblemCategory;
  unit?: number;
  mode?: ScoreMode;
  official?: boolean;
  source?: string;
  levels?: number[];
  partialRules?: RubricPartialRule[];
  questions?: PaperQuestion[];
}

export interface UploadImage {
  id: string;
  dataUrl: string;
  name: string;
  width?: number;
  height?: number;
}

export interface GradeInput {
  problemText: string;
  problemImages: UploadImage[];
  solutionImages: UploadImage[];
  rubricText: string;
  rubricImages: UploadImage[];
  rubricName: string;
  rubricItems: RubricItem[];
  rubricQuestions?: PaperQuestion[];
  rubricTemplate?: RubricTemplate;
  maxScore: number;
  category?: ProblemCategory;
  scoreUnit?: number;
  paperMode?: boolean;
  providerId: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  strictness: string;
  studentName?: string;
  sourceLabel?: string;
}
