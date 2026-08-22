import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Columns2,
  Cpu,
  Download,
  FileSearch,
  FileText,
  GraduationCap,
  Info,
  Languages,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Target,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  checkAdvancedEligibility,
  getCandidate,
  retrieveAdvancedCandidates,
  scoreAdvancedCandidates,
} from './api';
import type {
  AdvancedCriterion,
  AdvancedEligibility,
  AdvancedEligibilityResponse,
  AdvancedMatchedCandidate,
  AdvancedRetrieveResponse,
  AdvancedScoreResponse,
  CandidateProfile,
  CandidateSummary,
} from './types';

const ENGLISH_LEVELS = ['no_english', 'basic', 'pre', 'intermediate', 'upper', 'fluent'];
const PROFESSIONAL_DOMAINS = [
  'Administration & Office Support',
  'Business & Management',
  'Customer Service & Support',
  'Cybersecurity & Information Security',
  'Data, AI & Analytics',
  'Design, Creative & Media',
  'Education, Research & Languages',
  'Finance, Banking & Accounting',
  'Healthcare & Life Sciences',
  'Human Resources & Recruitment',
  'IT, ICT & Engineering',
  'Legal, Compliance & Regulatory',
  'Logistics, Supply Chain & Procurement',
  'Other / General',
  'Project, Product & Operations',
  'Sales, Marketing & Communications',
] as const;
const ADVANCED_SAVED_KEY = 'ariadne_advanced_saved_assessments_v1';
const ADVANCED_SESSION_KEY = 'ariadne-advanced-session-v2';
const AI_BATCH_SIZE = 5;

const CRITERION_COLORS = [
  { bg: '#fbe8f1', border: '#efc5d8', accent: '#b95d86', text: '#7f3e5d' },
  { bg: '#e9f1ff', border: '#c5d5ef', accent: '#5b78b2', text: '#40577f' },
  { bg: '#e8f5ed', border: '#c6dfd0', accent: '#56896a', text: '#3e684f' },
  { bg: '#fff2dc', border: '#ecd3a7', accent: '#ad7a35', text: '#795827' },
  { bg: '#efebff', border: '#d5cdf3', accent: '#7868af', text: '#574a83' },
  { bg: '#e4f6f4', border: '#bee0dc', accent: '#4b8a84', text: '#356965' },
  { bg: '#fceae1', border: '#edc9b8', accent: '#b66d4d', text: '#814d37' },
  { bg: '#eef1f5', border: '#d5dbe3', accent: '#6c7788', text: '#505a68' },
] as const;

const SUGGESTED_CRITERIA = [
  ['Role & Domain Fit', 'How closely the candidate’s professional profile and domain background match the target role.'],
  ['Skills & Expertise', 'The specific knowledge, technical or professional skills, tools and subject-matter expertise required.'],
  ['Professional Experience', 'The relevance, depth and nature of the candidate’s professional experience for the target role.'],
  ['Education & Qualifications', 'Relevant degrees, studies, professional qualifications or certifications.'],
  ['Languages', 'Required or desirable language knowledge and proficiency.'],
  ['Career Intent / Looking For', 'How closely the candidate’s stated career interests align with the target role.'],
  ['Nice-to-have Assets', 'Additional assets that strengthen the profile.'],
] as const;

type Step = 1 | 2 | 3;

type CriterionDraft = {
  id: string;
  name: string;
  description: string;
  weight: string;
  colorIndex: number;
};

type EvidenceMatch = {
  start: number;
  end: number;
  colorIndex: number;
  criterionName: string;
};

type AdvancedErrorInfo = {
  title: string;
  message: string;
  action: string;
};

type AdvancedMatchProps = {
  sharedShortlist: CandidateSummary[];
  sharedWorkspaceLoaded: boolean;
  saveToSharedShortlist: (candidate: AdvancedMatchedCandidate) => void;
  removeFromSharedShortlist: (candidateId: string) => void;
  notes: Record<string, string>;
  editNote: (candidate: AdvancedMatchedCandidate) => void;
};

const EMPTY_ELIGIBILITY: AdvancedEligibility = {
  professional_domains: [],
  professional_domain_match_mode: 'any',
  additional_languages: [],
  language_match_mode: 'all',
  education: '',
  required_experience: '',
  must_have_skills: '',
};

function criterionId() {
  return `criterion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clean(value?: string | null) {
  const v = (value ?? '').trim();
  return v && v.toLowerCase() !== 'nan' ? v : '';
}

function splitPipeValues(value?: string | null) {
  return clean(value).split('|').map((part) => part.trim()).filter(Boolean);
}

function clampThreshold(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function describeAdvancedError(stage: 'eligibility' | 'matching' | 'scoring' | 'profile', err: unknown): AdvancedErrorInfo {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown error');
  const message = raw === '[object Object]' ? 'The server returned an unreadable validation error.' : raw;
  const lower = message.toLowerCase();
  const stageName = stage === 'eligibility' ? 'Eligibility screening' : stage === 'matching' ? 'Candidate matching' : stage === 'scoring' ? 'AI assessment' : 'Candidate profile';

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network request') || lower.includes('port 8000')) {
    return { title: `${stageName} could not reach the ARIADNE backend`, message: 'The browser could not connect to the ARIADNE API.', action: 'Start START_BACKEND.bat (or python run_backend.py), wait until the API reports that it is running on port 8000, then retry this step.' };
  }
  if (lower.includes('could not reach ollama') || (lower.includes('connection refused') && lower.includes('11434'))) {
    return { title: 'AI assessment could not reach Ollama', message, action: 'Make sure the Ollama desktop app is running. Run `ollama list` and confirm that ministral-3:3b is installed, then retry the assessment.' };
  }
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('404'))) {
    return { title: 'The configured LLM is not available', message, action: 'Run `ollama list`. The supplied launcher expects ministral-3:3b. Install/select that model and retry Step 3.' };
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return { title: 'AI assessment timed out', message, action: 'Check `ollama ps` and `nvidia-smi`. Confirm the Q4 model is running, close other heavy GPU workloads if necessary, and retry. Your search settings and previous completed results are preserved.' };
  }
  if (lower.includes('out of memory') || lower.includes('not enough memory') || lower.includes('requires more system memory') || (lower.includes('cuda') && lower.includes('memory'))) {
    return { title: 'There is not enough memory for the AI assessment', message, action: 'Stop unused GPU workloads and unused Ollama models (`ollama ps`, then `ollama stop <model>`), keep the Q4 model/context settings, restart the backend if necessary, and retry.' };
  }
  if (lower.includes('invalid json') || lower.includes('empty assessment') || lower.includes('criteria list') || lower.includes('did not score every') || lower.includes('structured')) {
    return { title: 'The LLM returned an incomplete assessment', message, action: 'Retry Step 3. ARIADNE retries malformed structured output and automatically requests only any missing criteria before failing the assessment. If it happens repeatedly, restart Ollama and retry with the same saved settings.' };
  }
  if (lower.includes('weight') || lower.includes('100%')) {
    return { title: 'Criterion weights need attention', message, action: 'Return to Step 2 and make sure every active criterion has a numeric weight and that the total is exactly 100%.' };
  }
  if (lower.includes('threshold') || lower.includes('shortlist_threshold')) {
    return { title: 'The shortlist threshold is invalid', message, action: 'Return to Step 2 and enter a Minimum overall AI Match Score between 0 and 100.' };
  }
  if (lower.includes('min_experience') || lower.includes('max_experience') || lower.includes('minimum experience') || lower.includes('maximum experience')) {
    return { title: 'Experience settings need attention', message, action: 'Minimum and maximum experience are optional and work independently. If both are entered, make sure the minimum is not greater than the maximum.' };
  }
  if (lower.includes('english') || lower.includes('language_match_mode')) {
    return { title: 'Language settings need attention', message, action: 'Review the English level and additional-language settings in Step 1, then retry the pre-screening.' };
  }
  if (lower.includes('target_role') || lower.includes('target role') || lower.includes('criterion') || lower.includes('description')) {
    return { title: 'Matching criteria need attention', message, action: 'Review Step 2. Provide a target role plus a name, description and weight for every criterion, then retry candidate matching.' };
  }
  if (lower.includes('no retrieved candidates') || lower.includes('no candidates') || lower.includes('0 candidates')) {
    return { title: 'There are no candidates to assess', message, action: 'Return to Step 1 or Step 2 and broaden the requirements or matching criteria, then run candidate matching again.' };
  }
  if (lower.includes('at most') && lower.includes('candidates')) {
    return { title: 'Too many profiles were sent to AI assessment', message, action: 'Run Step 2 again so ARIADNE rebuilds the supported Matched Profiles pool, then retry Step 3.' };
  }
  if (stage === 'profile') {
    return { title: 'Candidate profile could not be loaded', message, action: 'Keep the current results, verify that the backend is running, and try opening the profile again.' };
  }
  return { title: `${stageName} could not complete this step`, message, action: 'Retry this step. If the same message returns, verify the backend and Ollama status. Your current Advanced Match settings and previous completed results are preserved.' };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function evidenceVariants(value: string) {
  const stripped = value.trim().replace(/^["“”']+|["“”']+$/g, '').trim();
  const variants = [stripped];
  if (stripped.includes('...') || stripped.includes('…')) {
    variants.push(...stripped.split(/\.\.\.|…/).map((part) => part.trim()).filter((part) => part.length >= 18));
  }
  return Array.from(new Set(variants.filter((part) => part.length >= 6)));
}

function findEvidenceMatches(
  text: string,
  candidate: AdvancedMatchedCandidate,
  colorIndexForId: (criterionId: string, fallbackIndex: number) => number,
): EvidenceMatch[] {
  const lower = text.toLocaleLowerCase();
  const rawMatches: EvidenceMatch[] = [];

  candidate.criterion_scores.forEach((criterion, criterionIndex) => {
    const colorIndex = colorIndexForId(criterion.criterion_id, criterionIndex);
    criterion.evidence.forEach((evidence) => {
      for (const variant of evidenceVariants(evidence)) {
        const needle = variant.toLocaleLowerCase();
        let from = 0;
        while (needle.length >= 6) {
          const index = lower.indexOf(needle, from);
          if (index < 0) break;
          rawMatches.push({
            start: index,
            end: index + variant.length,
            colorIndex,
            criterionName: criterion.name,
          });
          from = index + variant.length;
        }
      }
    });
  });

  rawMatches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const selected: EvidenceMatch[] = [];
  for (const match of rawMatches) {
    if (selected.some((existing) => match.start < existing.end && match.end > existing.start)) continue;
    selected.push(match);
  }
  return selected.sort((a, b) => a.start - b.start);
}

function HighlightedText({
  text,
  candidate,
  colorIndexForId,
}: {
  text: string;
  candidate: AdvancedMatchedCandidate;
  colorIndexForId: (criterionId: string, fallbackIndex: number) => number;
}) {
  const matches = useMemo(
    () => findEvidenceMatches(text, candidate, colorIndexForId),
    [text, candidate, colorIndexForId],
  );

  if (matches.length === 0) return <>{text}</>;
  const parts: Array<{ text: string; match?: EvidenceMatch }> = [];
  let cursor = 0;
  matches.forEach((match) => {
    if (match.start > cursor) parts.push({ text: text.slice(cursor, match.start) });
    parts.push({ text: text.slice(match.start, match.end), match });
    cursor = match.end;
  });
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });

  return (
    <>
      {parts.map((part, index) => {
        if (!part.match) return <span key={index}>{part.text}</span>;
        const color = CRITERION_COLORS[part.match.colorIndex % CRITERION_COLORS.length];
        return (
          <mark
            key={index}
            className="advanced-cv-highlight"
            style={{ backgroundColor: color.bg, borderColor: color.border }}
            title={part.match.criterionName}
          >
            {part.text}
          </mark>
        );
      })}
    </>
  );
}

function highlightedHtml(
  text: string,
  candidate: AdvancedMatchedCandidate,
  colorIndexForId: (criterionId: string, fallbackIndex: number) => number,
) {
  const matches = findEvidenceMatches(text, candidate, colorIndexForId);
  if (matches.length === 0) return escapeHtml(text);
  let html = '';
  let cursor = 0;
  for (const match of matches) {
    html += escapeHtml(text.slice(cursor, match.start));
    const color = CRITERION_COLORS[match.colorIndex % CRITERION_COLORS.length];
    html += `<mark style="background:${color.bg};border:1px solid ${color.border};border-radius:4px;padding:1px 2px">${escapeHtml(text.slice(match.start, match.end))}</mark>`;
    cursor = match.end;
  }
  html += escapeHtml(text.slice(cursor));
  return html;
}

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    ['1', 'Eligibility & pre-screening'],
    ['2', 'Criteria & weights'],
    ['3', 'AI assessment & ranking'],
  ];
  return (
    <div className="advanced-stepper" aria-label={`Advanced Match step ${step} of 3`}>
      {steps.map(([number, label], index) => {
        const numeric = index + 1;
        const complete = numeric < step;
        const active = numeric === step;
        return (
          <div className={`advanced-step ${active ? 'active' : ''} ${complete ? 'complete' : ''}`} key={number}>
            <div className="advanced-step-number">{complete ? <CheckCircle2 size={16}/> : number}</div>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Funnel({ eligibility, retrieval, scored }: {
  eligibility: AdvancedEligibilityResponse | null;
  retrieval: AdvancedRetrieveResponse | null;
  scored: AdvancedScoreResponse | null;
}) {
  const total = eligibility?.total_pool ?? retrieval?.total_pool ?? 20000;
  return (
    <div className="advanced-funnel">
      <div><strong>{total.toLocaleString()}</strong><span>Total profiles</span></div>
      <ArrowRight size={16}/>
      <div className={!eligibility ? 'muted' : ''}><strong>{eligibility ? eligibility.pre_screened_pool.toLocaleString() : '—'}</strong><span>Pre-screened</span></div>
      <ArrowRight size={16}/>
      <div className={!retrieval ? 'muted' : ''}>
        <strong>{retrieval ? retrieval.retrieved_pool.toLocaleString() : '—'}</strong>
        <span className="funnel-label-with-info">
          Matched profiles
          <span className="funnel-info" tabIndex={0} aria-label="How matched profiles are selected">
            <Info size={12}/>
            <span className="funnel-tooltip" role="tooltip">
              Candidate matching combines lexical/keyword relevance (BM25Plus) with semantic similarity (Jina-v5), then merges both rankings with Reciprocal Rank Fusion (RRF).
            </span>
          </span>
        </span>
      </div>
      <ArrowRight size={16}/>
      <div className={!scored ? 'muted' : ''}><strong>{scored ? scored.shortlisted_pool.toLocaleString() : '—'}</strong><span>AI shortlisted</span></div>
    </div>
  );
}

function CriterionLegend({
  candidate,
  colorIndexForId,
}: {
  candidate: AdvancedMatchedCandidate;
  colorIndexForId: (criterionId: string, fallbackIndex: number) => number;
}) {
  return (
    <div className="criterion-legend">
      {candidate.criterion_scores.map((criterion, index) => {
        const color = CRITERION_COLORS[colorIndexForId(criterion.criterion_id, index) % CRITERION_COLORS.length];
        return (
          <span key={criterion.criterion_id}>
            <i style={{ backgroundColor: color.accent }}/>{criterion.name}
          </span>
        );
      })}
    </div>
  );
}

function AdvancedProfilePanel({
  candidate,
  close,
  colorIndexForId,
  download,
  note,
  editNote,
}: {
  candidate: AdvancedMatchedCandidate;
  close: () => void;
  colorIndexForId: (criterionId: string, fallbackIndex: number) => number;
  download: (candidate: AdvancedMatchedCandidate, profile?: CandidateProfile) => Promise<void>;
  note: string;
  editNote: () => void;
}) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCandidate(candidate.candidate_id)
      .then((loaded) => { if (!cancelled) setProfile(loaded); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load candidate profile'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [candidate.candidate_id]);

  const displayText = profile ? (clean(profile.full_cv) || clean(profile.candidate_text)) : '';

  return (
    <div className="modal-backdrop" onClick={close}>
      <aside className="profile-panel advanced-profile-panel" onClick={(event) => event.stopPropagation()}>
        <div className="profile-header">
          <div>
            <div className="eyebrow"><Sparkles size={14}/> ARIADNE AI assessment</div>
            <h2>{profile ? clean(profile.position) || 'Candidate profile' : 'Candidate profile'}</h2>
            <span className="dataset-id-badge">Dataset ID {candidate.dataset_index}</span>
            <div className="advanced-profile-score">AI Match Score <strong>{candidate.final_match_score.toFixed(1)}/100</strong></div>
          </div>
          <div className="advanced-profile-header-actions">
            <button
              className="secondary-action"
              disabled={loading || downloading}
              onClick={async () => {
                setDownloading(true);
                try { await download(candidate, profile ?? undefined); } finally { setDownloading(false); }
              }}
            >
              <Download size={14}/>{downloading ? 'Preparing…' : 'Download CV + assessment'}
            </button>
            <button className="icon-button" onClick={close} aria-label="Close profile"><X size={20}/></button>
          </div>
        </div>
        {loading && <div className="profile-loading"><div className="spinner small"/> Loading full profile…</div>}
        {error && <div className="profile-error">{error}</div>}
        {profile && (
          <>
            <div className="profile-facts">
              <div><span>Professional domain</span><strong>{splitPipeValues(profile.professional_domains).join(' · ') || '—'}</strong></div>
              <div><span>Experience</span><strong>{clean(profile.experience_years) || '—'}</strong></div>
              <div><span>English</span><strong>{clean(profile.english_level) || '—'}</strong></div>
            </div>

            {clean(profile.esco_skills) && (
              <section className="profile-section taxonomy-profile-section">
                <div className="section-heading-row"><h3>ESCO skills</h3><span><BadgeCheck size={12}/> standardized profile metadata</span></div>
                <div className="taxonomy-chip-list esco-chip-list">{splitPipeValues(profile.esco_skills).map((item) => <em key={item}>{item}</em>)}</div>
              </section>
            )}

            <section className={`recruiter-note-card ${note ? 'has-note' : ''}`}>
              <div className="note-card-heading">
                <div><StickyNote size={15}/><strong>Recruiter note</strong></div>
                <button onClick={editNote}>{note ? 'Edit note' : 'Add note'}</button>
              </div>
              {note ? <p className="prewrap">{note}</p> : <span>No note added for this candidate.</span>}
            </section>

            <section className="profile-section advanced-assessment-overview">
              <div className="section-heading-row"><h3>Assessment criteria</h3><span><Sparkles size={12}/> Evidence colors</span></div>
              <CriterionLegend candidate={candidate} colorIndexForId={colorIndexForId}/>
              <div className="advanced-profile-criteria-grid">
                {candidate.criterion_scores.map((criterion, index) => {
                  const color = CRITERION_COLORS[colorIndexForId(criterion.criterion_id, index) % CRITERION_COLORS.length];
                  return (
                    <div className="advanced-profile-criterion" key={criterion.criterion_id} style={{ backgroundColor: color.bg, borderColor: color.border }}>
                      <div><strong style={{ color: color.text }}>{criterion.name}</strong><span>Weight {criterion.weight}%</span></div>
                      <b style={{ color: color.accent }}>{criterion.score}/100</b>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="profile-section">
              <div className="section-heading-row"><h3>CV with supporting evidence</h3><span><FileText size={12}/> Highlighted evidence</span></div>
              <div className="cv-body prewrap advanced-highlighted-cv">
                {displayText ? <HighlightedText text={displayText} candidate={candidate} colorIndexForId={colorIndexForId}/> : 'No full CV text available.'}
              </div>
            </section>

            <section className="profile-section">
              <div className="section-heading-row"><h3>Criterion assessment</h3><span>0–100 evidence-based scores</span></div>
              <div className="advanced-evidence-grid">
                {candidate.criterion_scores.map((criterion, index) => {
                  const color = CRITERION_COLORS[colorIndexForId(criterion.criterion_id, index) % CRITERION_COLORS.length];
                  return (
                    <section key={criterion.criterion_id} className="advanced-evidence-card" style={{ borderColor: color.border, backgroundColor: color.bg }}>
                      <div className="advanced-evidence-heading">
                        <div><strong style={{ color: color.text }}>{criterion.name}</strong><span>Weight {criterion.weight}% · contribution {criterion.weighted_contribution.toFixed(2)}</span></div>
                        <b style={{ color: color.accent }}>{criterion.score}/100</b>
                      </div>
                      <p>{criterion.justification || 'No justification returned.'}</p>
                      {criterion.evidence.length > 0 && <ul>{criterion.evidence.map((item, evidenceIndex) => <li key={`${criterion.criterion_id}-${evidenceIndex}`}>{item}</li>)}</ul>}
                    </section>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}

function AdvancedResultCard({
  candidate,
  onOpen,
  saved,
  comparing,
  note,
  toggleSave,
  toggleCompare,
  editNote,
  download,
  colorIndexForId,
}: {
  candidate: AdvancedMatchedCandidate;
  onOpen: () => void;
  saved: boolean;
  comparing: boolean;
  note: string;
  toggleSave: () => void;
  toggleCompare: () => void;
  editNote: () => void;
  download: () => void;
  colorIndexForId: (criterionId: string, fallbackIndex: number) => number;
}) {
  const [expanded, setExpanded] = useState(candidate.rank <= 3);
  return (
    <article className="advanced-result-card">
      <div className="advanced-result-head">
        <div className="advanced-rank">#{candidate.rank}</div>
        <div className="advanced-result-title">
          <h3>{clean(candidate.position) || 'Candidate profile'}</h3>
          <span className="dataset-id-badge">Dataset ID {candidate.dataset_index}</span>
          <div className="advanced-result-tags">
            {splitPipeValues(candidate.professional_domains).slice(0, 2).map((domain) => <span key={domain}><Target size={12}/>{domain}</span>)}
            {clean(candidate.experience_years) && <span><BriefcaseBusiness size={12}/>{candidate.experience_years} yrs</span>}
            {clean(candidate.english_level) && <span><Languages size={12}/>{candidate.english_level}</span>}
          </div>
        </div>
        <div className="advanced-final-score"><strong>{candidate.final_match_score.toFixed(1)}</strong><span>/100 AI match</span></div>
      </div>

      <div className="criterion-score-strip">
        {candidate.criterion_scores.map((criterion, index) => {
          const color = CRITERION_COLORS[colorIndexForId(criterion.criterion_id, index) % CRITERION_COLORS.length];
          return (
            <div key={criterion.criterion_id}>
              <div><span><i className="criterion-dot" style={{ backgroundColor: color.accent }}/>{criterion.name}</span><strong style={{ color: color.accent }}>{criterion.score}</strong></div>
              <div className="criterion-mini-track" style={{ backgroundColor: color.bg }}><i style={{ width: `${criterion.score}%`, backgroundColor: color.accent }}/></div>
            </div>
          );
        })}
      </div>

      {note && <div className="candidate-note-preview"><StickyNote size={13}/><span>{note}</span></div>}

      <div className="advanced-result-actions advanced-result-actions-wrap">
        <div className="advanced-primary-result-actions">
          <button className="profile-link" onClick={onOpen}>View profile & highlighted evidence <ArrowRight size={14}/></button>
          <button className="advanced-evidence-toggle" onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Hide assessment' : 'View criterion assessment'} <ChevronDown size={14} className={expanded ? 'rotated' : ''}/>
          </button>
        </div>
        <div className="advanced-secondary-result-actions">
          <button className={`secondary-action ${saved ? 'active' : ''}`} onClick={toggleSave}>{saved ? <BookmarkCheck size={14}/> : <Bookmark size={14}/>} {saved ? 'Saved' : 'Save'}</button>
          <button className={`secondary-action ${comparing ? 'active' : ''}`} onClick={toggleCompare}><Columns2 size={14}/> {comparing ? 'Selected' : 'Compare'}</button>
          <button className={`secondary-action ${note ? 'note-active' : ''}`} onClick={editNote}><StickyNote size={14}/> {note ? 'Note added' : 'Add note'}</button>
          <button className="secondary-action" onClick={download}><Download size={14}/> Download</button>
        </div>
      </div>

      {expanded && (
        <div className="advanced-evidence-grid">
          {candidate.criterion_scores.map((criterion, index) => {
            const color = CRITERION_COLORS[colorIndexForId(criterion.criterion_id, index) % CRITERION_COLORS.length];
            return (
              <section key={criterion.criterion_id} className="advanced-evidence-card" style={{ borderColor: color.border, backgroundColor: color.bg }}>
                <div className="advanced-evidence-heading">
                  <div><strong style={{ color: color.text }}>{criterion.name}</strong><span>Weight {criterion.weight}% · contribution {criterion.weighted_contribution.toFixed(2)}</span></div>
                  <b style={{ color: color.accent }}>{criterion.score}/100</b>
                </div>
                <p>{criterion.justification || 'No justification returned.'}</p>
                {criterion.evidence.length > 0 && <ul>{criterion.evidence.map((item, evidenceIndex) => <li key={`${criterion.criterion_id}-${evidenceIndex}`}>{item}</li>)}</ul>}
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}

function AdvancedCompareModal({
  candidates,
  close,
  remove,
  notes,
  editNote,
}: {
  candidates: AdvancedMatchedCandidate[];
  close: () => void;
  remove: (candidateId: string) => void;
  notes: Record<string, string>;
  editNote: (candidate: AdvancedMatchedCandidate) => void;
}) {
  const criterionNames = candidates[0]?.criterion_scores.map((criterion) => ({ id: criterion.criterion_id, name: criterion.name })) ?? [];
  const [profiles, setProfiles] = useState<Record<string, CandidateProfile>>({});
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProfileError('');
    Promise.allSettled(candidates.map(async (candidate) => [candidate.candidate_id, await getCandidate(candidate.candidate_id)] as const))
      .then((results) => {
        if (cancelled) return;
        const loaded: Record<string, CandidateProfile> = {};
        let failed = 0;
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [id, profile] = result.value;
            loaded[id] = profile;
          } else {
            failed += 1;
          }
        });
        setProfiles(loaded);
        if (failed > 0) setProfileError(`Could not load the full CV for ${failed} selected candidate${failed === 1 ? '' : 's'}. The available profiles are still shown.`);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [candidates]);

  return (
    <div className="modal-backdrop" onClick={close}>
      <section className="advanced-compare-modal compare-modal-expanded" onClick={(event) => event.stopPropagation()}>
        <div className="profile-header">
          <div><div className="eyebrow"><Columns2 size={14}/> Candidate comparison</div><h2>Compare shortlisted profiles side by side</h2><p>Review AI scores, profile fields, recruiter notes and the full CV for up to four candidates.</p></div>
          <button className="icon-button" onClick={close} aria-label="Close comparison"><X size={20}/></button>
        </div>
        {loading && <div className="profile-loading"><div className="spinner small"/> Loading full candidate profiles…</div>}
        {profileError && <div className="profile-error">{profileError}</div>}
        <div className="advanced-compare-scroll compare-scroll-expanded">
          <table className="advanced-compare-table compare-table-expanded">
            <thead>
              <tr>
                <th>Assessment</th>
                {candidates.map((candidate) => (
                  <th key={candidate.candidate_id}>
                    <strong>#{candidate.rank} {clean(candidate.position) || 'Candidate'}</strong>
                    <span>Dataset ID {candidate.dataset_index}</span>
                    <button onClick={() => remove(candidate.candidate_id)}><X size={12}/> Remove</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td>Final AI Match Score</td>{candidates.map((candidate) => <td key={candidate.candidate_id}><b className="advanced-compare-final">{candidate.final_match_score.toFixed(1)}/100</b></td>)}</tr>
              {criterionNames.map((criterion) => (
                <tr key={criterion.id}>
                  <td>{criterion.name}</td>
                  {candidates.map((candidate) => {
                    const score = candidate.criterion_scores.find((item) => item.criterion_id === criterion.id);
                    return <td key={candidate.candidate_id}>{score ? <><strong>{score.score}/100</strong><div className="compare-long-text">{score.justification || '—'}</div></> : '—'}</td>;
                  })}
                </tr>
              ))}
              <tr><td>Experience</td>{candidates.map((candidate) => <td key={candidate.candidate_id}>{clean(candidate.experience_years) ? `${candidate.experience_years} years` : '—'}</td>)}</tr>
              <tr><td>English</td>{candidates.map((candidate) => <td key={candidate.candidate_id}>{clean(candidate.english_level) || '—'}</td>)}</tr>
              <tr><td>Professional domains</td>{candidates.map((candidate) => <td key={candidate.candidate_id}>{splitPipeValues(candidate.professional_domains).join(' · ') || '—'}</td>)}</tr>
              <tr><td>ESCO skills</td>{candidates.map((candidate) => <td key={candidate.candidate_id} className="compare-long-text">{splitPipeValues(profiles[candidate.candidate_id]?.esco_skills).join(' · ') || '—'}</td>)}</tr>
              <tr><td>Looking for</td>{candidates.map((candidate) => <td key={candidate.candidate_id} className="compare-long-text">{clean(candidate.looking_for) || '—'}</td>)}</tr>
              <tr><td>Highlights</td>{candidates.map((candidate) => <td key={candidate.candidate_id} className="compare-long-text">{clean(candidate.highlights) || clean(candidate.cv_snippet) || '—'}</td>)}</tr>
              <tr>
                <td>Recruiter note</td>
                {candidates.map((candidate) => <td key={candidate.candidate_id}><div className="compare-note-cell"><span className={notes[candidate.candidate_id] ? '' : 'muted-copy'}>{notes[candidate.candidate_id] || 'No note added.'}</span><button onClick={() => editNote(candidate)}><StickyNote size={13}/> {notes[candidate.candidate_id] ? 'Edit' : 'Add note'}</button></div></td>)}
              </tr>
              <tr className="compare-cv-row">
                <td>Full CV profile</td>
                {candidates.map((candidate) => {
                  const profile = profiles[candidate.candidate_id];
                  const text = profile ? clean(profile.full_cv) || clean(profile.candidate_text) : '';
                  return <td key={candidate.candidate_id}><div className="compare-cv-box prewrap">{text || (loading ? 'Loading…' : 'Full CV unavailable.')}</div></td>;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SavedAssessmentsModal({
  candidates,
  close,
  remove,
  download,
  downloadAll,
  removeAll,
}: {
  candidates: AdvancedMatchedCandidate[];
  close: () => void;
  remove: (candidateId: string) => void;
  download: (candidate: AdvancedMatchedCandidate) => void;
  downloadAll: () => void;
  removeAll: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <aside className="advanced-saved-panel" onClick={(event) => event.stopPropagation()}>
        <div className="profile-header">
          <div><div className="eyebrow"><BookmarkCheck size={14}/> Saved assessments</div><h2>Saved candidates ({candidates.length})</h2></div>
          <button className="icon-button" onClick={close} aria-label="Close saved assessments"><X size={20}/></button>
        </div>
        {candidates.length === 0 ? <div className="shortlist-empty">Save shortlisted candidates to keep their AI assessment.</div> : (
          <>
            <div className="advanced-saved-toolbar">
              <button className="advanced-download-all" onClick={downloadAll}><Download size={15}/> Download saved CVs + assessments</button>
              <button className="clear-all-button danger-soft" onClick={removeAll}><Trash2 size={15}/> Unsave all Advanced</button>
            </div>
            <div className="advanced-saved-list">
              {candidates.map((candidate) => (
                <div key={candidate.candidate_id} className="advanced-saved-row">
                  <div><strong>{clean(candidate.position) || 'Candidate profile'}</strong><span>AI Match {candidate.final_match_score.toFixed(1)}/100 · Dataset ID {candidate.dataset_index}</span></div>
                  <button onClick={() => download(candidate)} title="Download"><Download size={14}/></button>
                  <button onClick={() => remove(candidate.candidate_id)} title="Remove"><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default function AdvancedMatch({
  sharedShortlist,
  sharedWorkspaceLoaded,
  saveToSharedShortlist,
  removeFromSharedShortlist,
  notes,
  editNote,
}: AdvancedMatchProps) {
  const [step, setStep] = useState<Step>(1);
  const [eligibility, setEligibility] = useState<AdvancedEligibility>(EMPTY_ELIGIBILITY);
  const [languageDraft, setLanguageDraft] = useState('');
  const [eligibilityResult, setEligibilityResult] = useState<AdvancedEligibilityResponse | null>(null);
  const [targetRole, setTargetRole] = useState('');
  const [criteria, setCriteria] = useState<CriterionDraft[]>([
    { id: criterionId(), name: 'Role & Domain Fit', description: '', weight: '', colorIndex: 0 },
    { id: criterionId(), name: 'Skills & Expertise', description: '', weight: '', colorIndex: 1 },
    { id: criterionId(), name: 'Professional Experience', description: '', weight: '', colorIndex: 2 },
  ]);
  const [shortlistThreshold, setShortlistThreshold] = useState('60');
  const [retrieval, setRetrieval] = useState<AdvancedRetrieveResponse | null>(null);
  const [scored, setScored] = useState<AdvancedScoreResponse | null>(null);
  const [assessmentStale, setAssessmentStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, shortlisted: 0 });
  const [error, setError] = useState<AdvancedErrorInfo | null>(null);
  const [profileCandidate, setProfileCandidate] = useState<AdvancedMatchedCandidate | null>(null);
  const [saved, setSaved] = useState<AdvancedMatchedCandidate[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [sessionLoaded, setSessionLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(ADVANCED_SAVED_KEY) ?? '[]');
      if (Array.isArray(stored)) setSaved(stored);

      const session = JSON.parse(localStorage.getItem(ADVANCED_SESSION_KEY) ?? 'null');
      if (session && typeof session === 'object') {
        if ([1, 2, 3].includes(Number(session.step))) setStep(Number(session.step) as Step);
        if (session.eligibility) setEligibility({ ...EMPTY_ELIGIBILITY, ...session.eligibility, professional_domain_match_mode: 'any' });
        if (session.eligibilityResult) setEligibilityResult(session.eligibilityResult);
        if (typeof session.targetRole === 'string') setTargetRole(session.targetRole);
        if (Array.isArray(session.criteria) && session.criteria.length > 0) setCriteria(session.criteria);
        if (typeof session.shortlistThreshold === 'string') setShortlistThreshold(session.shortlistThreshold);
        if (session.retrieval) setRetrieval(session.retrieval);
        if (session.scored) setScored(session.scored);
        if (typeof session.assessmentStale === 'boolean') setAssessmentStale(session.assessmentStale);
      }
    } catch {
      // Invalid local data should not block the demo.
    } finally {
      setSessionLoaded(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ADVANCED_SAVED_KEY, JSON.stringify(saved));
  }, [saved]);

  useEffect(() => {
    if (!sessionLoaded) return;
    localStorage.setItem(ADVANCED_SESSION_KEY, JSON.stringify({
      step, eligibility, eligibilityResult, targetRole, criteria, shortlistThreshold, retrieval, scored, assessmentStale,
    }));
  }, [sessionLoaded, step, eligibility, eligibilityResult, targetRole, criteria, shortlistThreshold, retrieval, scored, assessmentStale]);

  useEffect(() => {
    if (!sharedWorkspaceLoaded) return;
    const sharedIds = new Set(sharedShortlist.map((candidate) => candidate.candidate_id));
    setSaved((current) => current.filter((candidate) => sharedIds.has(candidate.candidate_id)));
  }, [sharedShortlist, sharedWorkspaceLoaded]);

  useEffect(() => {
    if (!scored) return;
    const sharedIds = new Set(sharedShortlist.map((candidate) => candidate.candidate_id));
    const assessments = scored.candidates
      .filter((candidate) => sharedIds.has(candidate.candidate_id))
      .map((candidate) => ({ ...candidate, saved_target_role: targetRole.trim(), saved_threshold: scored.shortlist_threshold }));
    if (assessments.length === 0) return;
    setSaved((current) => {
      const byId = new Map(current.map((candidate) => [candidate.candidate_id, candidate]));
      assessments.forEach((candidate) => byId.set(candidate.candidate_id, candidate));
      return Array.from(byId.values());
    });
  }, [scored, sharedShortlist, targetRole]);

  const weightTotal = useMemo(
    () => criteria.reduce((total, criterion) => total + (Number(criterion.weight) || 0), 0),
    [criteria],
  );

  const thresholdNumber = clampThreshold(shortlistThreshold);
  const criteriaReady = criteria.length > 0
    && criteria.every((criterion) => criterion.name.trim().length >= 2 && criterion.description.trim().length >= 3 && criterion.weight !== '')
    && Math.abs(weightTotal - 100) < 0.01
    && shortlistThreshold !== ''
    && Number(shortlistThreshold) >= 0
    && Number(shortlistThreshold) <= 100;

  const criteriaColorMap = useMemo(() => new Map(criteria.map((criterion) => [criterion.id, criterion.colorIndex])), [criteria]);
  const colorIndexForId = (criterionIdValue: string, fallbackIndex: number) => criteriaColorMap.get(criterionIdValue) ?? fallbackIndex % CRITERION_COLORS.length;

  const compareCandidates = useMemo(
    () => compareIds.map((id) => scored?.candidates.find((candidate) => candidate.candidate_id === id)).filter((candidate): candidate is AdvancedMatchedCandidate => Boolean(candidate)),
    [compareIds, scored],
  );

  function touchAssessment() {
    if (scored) setAssessmentStale(true);
  }

  function updateEligibility(patch: Partial<AdvancedEligibility>) {
    touchAssessment();
    setEligibility((current) => ({ ...current, ...patch }));
  }

  function addLanguage(raw = languageDraft) {
    const values = raw.split(',').map((value) => value.trim()).filter(Boolean);
    if (values.length === 0) return;
    touchAssessment();
    setEligibility((current) => ({
      ...current,
      additional_languages: Array.from(new Set([...current.additional_languages, ...values])).slice(0, 8),
    }));
    setLanguageDraft('');
  }

  function languageKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addLanguage();
    }
  }

  async function submitEligibility(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await checkAdvancedEligibility(eligibility);
      setEligibilityResult(result);
      setRetrieval(null);
      if (scored) setAssessmentStale(true);
      setStep(2);
    } catch (err) {
      setError(describeAdvancedError('eligibility', err));
    } finally {
      setBusy(false);
    }
  }

  function updateCriterion(id: string, key: 'name' | 'description' | 'weight', value: string) {
    touchAssessment();
    setCriteria((current) => current.map((criterion) => criterion.id === id ? { ...criterion, [key]: value } : criterion));
  }

  function removeCriterion(id: string) {
    touchAssessment();
    setCriteria((current) => current.filter((criterion) => criterion.id !== id));
  }

  function addCriterion(name = '', description = '') {
    if (criteria.length >= 8) return;
    touchAssessment();
    const used = new Set(criteria.map((criterion) => criterion.colorIndex));
    const available = CRITERION_COLORS.findIndex((_, index) => !used.has(index));
    const colorIndex = available >= 0 ? available : criteria.length % CRITERION_COLORS.length;
    setCriteria((current) => [...current, { id: criterionId(), name, description, weight: '', colorIndex }]);
  }

  function addSuggested(name: string, description: string) {
    if (criteria.some((criterion) => criterion.name.trim().toLowerCase() === name.toLowerCase())) return;
    addCriterion(name, description);
  }

  function normalizedCriteria(): AdvancedCriterion[] {
    return criteria.map((criterion) => ({
      id: criterion.id,
      name: criterion.name.trim(),
      description: criterion.description.trim(),
      weight: Number(criterion.weight),
    }));
  }

  async function submitCriteria(event: FormEvent) {
    event.preventDefault();
    if (!criteriaReady || targetRole.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const result = await retrieveAdvancedCandidates(eligibility, targetRole.trim(), normalizedCriteria());
      setRetrieval(result);
      if (scored) setAssessmentStale(true);
      setCompareIds([]);
      setStep(3);
    } catch (err) {
      setError(describeAdvancedError('matching', err));
    } finally {
      setBusy(false);
    }
  }

  async function runAiScoring() {
    if (!retrieval || retrieval.candidates.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: retrieval.candidates.length, shortlisted: 0 });

    try {
      const allShortlisted: AdvancedMatchedCandidate[] = [];
      let totalMs = 0;
      let llmTotalMs = 0;
      let promptTokens = 0;
      let outputTokens = 0;
      let modelName = '';
      let scoredPool = 0;

      for (let start = 0; start < retrieval.candidates.length; start += AI_BATCH_SIZE) {
        const batch = retrieval.candidates.slice(start, start + AI_BATCH_SIZE);
        const response = await scoreAdvancedCandidates(
          targetRole.trim(),
          normalizedCriteria(),
          batch.map((candidate) => ({ candidate_id: candidate.candidate_id, retrieval_rank: candidate.retrieval_rank })),
          thresholdNumber,
        );
        allShortlisted.push(...response.candidates);
        totalMs += response.total_ms;
        llmTotalMs += response.llm_total_ms;
        promptTokens += response.prompt_tokens;
        outputTokens += response.output_tokens;
        scoredPool += response.scored_pool;
        modelName = response.model_name;
        setProgress({
          done: Math.min(start + batch.length, retrieval.candidates.length),
          total: retrieval.candidates.length,
          shortlisted: allShortlisted.length,
        });
      }

      allShortlisted.sort((a, b) => b.final_match_score - a.final_match_score || a.retrieval_rank - b.retrieval_rank);
      const ranked = allShortlisted.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
      const finalResponse: AdvancedScoreResponse = {
        target_role: targetRole.trim(),
        model_name: modelName,
        shortlist_threshold: thresholdNumber,
        scored_pool: scoredPool,
        shortlisted_pool: ranked.length,
        excluded_pool: scoredPool - ranked.length,
        total_ms: totalMs,
        llm_total_ms: llmTotalMs,
        prompt_tokens: promptTokens,
        output_tokens: outputTokens,
        candidates: ranked,
      };
      setScored(finalResponse);
      setAssessmentStale(false);
      setCompareIds([]);
    } catch (err) {
      setError(describeAdvancedError('scoring', err));
    } finally {
      setBusy(false);
    }
  }

  function backFromResults() {
    if (scored) {
      const keep = window.confirm('Keep the current AI assessment while you review or edit the criteria?\n\nOK = keep it\nCancel = discard it');
      if (!keep) {
        setScored(null);
        setAssessmentStale(false);
        setCompareIds([]);
      }
    }
    setStep(2);
    setError(null);
  }

  function toggleSave(candidate: AdvancedMatchedCandidate) {
    const alreadySaved = sharedShortlist.some((item) => item.candidate_id === candidate.candidate_id);
    if (alreadySaved) {
      removeFromSharedShortlist(candidate.candidate_id);
      setSaved((current) => current.filter((item) => item.candidate_id !== candidate.candidate_id));
      return;
    }

    saveToSharedShortlist(candidate);
    const assessment = { ...candidate, saved_target_role: targetRole.trim(), saved_threshold: scored?.shortlist_threshold ?? thresholdNumber };
    setSaved((current) => [assessment, ...current.filter((item) => item.candidate_id !== candidate.candidate_id)]);
  }

  function unsaveAllAdvanced() {
    if (saved.length === 0) return;
    if (!window.confirm(`Remove all ${saved.length} Advanced Match saved candidates from the shared shortlist?`)) return;
    saved.forEach((candidate) => removeFromSharedShortlist(candidate.candidate_id));
    setSaved([]);
  }

  function resetAdvancedSession() {
    if (!window.confirm('Clear the current Advanced Match search, criteria and AI results? Saved candidates and recruiter notes will be kept.')) return;
    localStorage.removeItem(ADVANCED_SESSION_KEY);
    setStep(1);
    setEligibility({ ...EMPTY_ELIGIBILITY });
    setLanguageDraft('');
    setEligibilityResult(null);
    setTargetRole('');
    setCriteria([
      { id: criterionId(), name: 'Role & Domain Fit', description: '', weight: '', colorIndex: 0 },
      { id: criterionId(), name: 'Skills & Expertise', description: '', weight: '', colorIndex: 1 },
      { id: criterionId(), name: 'Professional Experience', description: '', weight: '', colorIndex: 2 },
    ]);
    setShortlistThreshold('60');
    setRetrieval(null);
    setScored(null);
    setAssessmentStale(false);
    setProgress({ done: 0, total: 0, shortlisted: 0 });
    setError(null);
    setProfileCandidate(null);
    setCompareIds([]);
    setCompareOpen(false);
  }

  function toggleCompare(candidateId: string) {
    setCompareIds((current) => {
      if (current.includes(candidateId)) return current.filter((id) => id !== candidateId);
      if (current.length >= 4) return current;
      return [...current, candidateId];
    });
  }

  function removeCompare(candidateId: string) {
    const next = compareIds.filter((id) => id !== candidateId);
    setCompareIds(next);
    if (next.length < 2) setCompareOpen(false);
  }

  async function buildAssessmentHtml(candidate: AdvancedMatchedCandidate, suppliedProfile?: CandidateProfile) {
    const profile = suppliedProfile ?? await getCandidate(candidate.candidate_id);
    const displayText = clean(profile.candidate_text) || clean(profile.full_cv) || 'No full CV text available.';
    const localColorIndex = (criterionIdValue: string, fallbackIndex: number) => {
      const current = criteriaColorMap.get(criterionIdValue);
      if (current !== undefined) return current;
      const scoreIndex = candidate.criterion_scores.findIndex((item) => item.criterion_id === criterionIdValue);
      return scoreIndex >= 0 ? scoreIndex % CRITERION_COLORS.length : fallbackIndex % CRITERION_COLORS.length;
    };
    const criteriaHtml = candidate.criterion_scores.map((criterion, index) => {
      const color = CRITERION_COLORS[localColorIndex(criterion.criterion_id, index) % CRITERION_COLORS.length];
      const evidence = criterion.evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      return `<section class="criterion" style="border-color:${color.border};background:${color.bg}"><div class="criterion-head"><h3 style="color:${color.text}">${escapeHtml(criterion.name)}</h3><strong style="color:${color.accent}">${criterion.score}/100</strong></div><p class="meta">Weight ${criterion.weight}% · weighted contribution ${criterion.weighted_contribution.toFixed(2)}</p><p>${escapeHtml(criterion.justification || 'No justification returned.')}</p>${evidence ? `<ul>${evidence}</ul>` : ''}</section>`;
    }).join('');
    const legend = candidate.criterion_scores.map((criterion, index) => {
      const color = CRITERION_COLORS[localColorIndex(criterion.criterion_id, index) % CRITERION_COLORS.length];
      return `<span><i style="background:${color.accent}"></i>${escapeHtml(criterion.name)}</span>`;
    }).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>ARIADNE Candidate ${escapeHtml(candidate.candidate_id)}</title><style>body{font-family:Arial,sans-serif;color:#243147;max-width:980px;margin:36px auto;padding:0 24px;line-height:1.5}h1{margin-bottom:4px}.sub{color:#6d7889}.score{font-size:28px;font-weight:800;color:#2f66c3}.legend{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.legend span{font-size:12px}.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.criterion{border:1px solid;border-radius:10px;padding:12px}.criterion-head{display:flex;justify-content:space-between;gap:12px}.criterion h3{margin:0;font-size:15px}.criterion p,.criterion li{font-size:12px}.meta{color:#738095}.cv{white-space:pre-wrap;border:1px solid #dde3eb;border-radius:12px;padding:18px;background:#fafbfd;font-size:12px}mark{box-decoration-break:clone;-webkit-box-decoration-break:clone}.notice{margin-top:20px;padding:12px;background:#f6f8fb;border:1px solid #dde4ed;border-radius:10px;font-size:11px;color:#627087}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><p class="sub">ARIADNE · Advanced Candidate Matching</p><h1>${escapeHtml(clean(profile.position) || 'Candidate profile')}</h1><p class="sub">Dataset ID ${candidate.dataset_index} · Target role: ${escapeHtml(candidate.saved_target_role || targetRole || '—')}</p><p class="score">${candidate.final_match_score.toFixed(1)}/100 AI Match Score</p><p>Shortlist threshold: ${candidate.saved_threshold ?? scored?.shortlist_threshold ?? thresholdNumber}/100</p><p><strong>Professional domains:</strong> ${escapeHtml(splitPipeValues(profile.professional_domains).join(' · ') || '—')}</p><p><strong>ESCO skills:</strong> ${escapeHtml(splitPipeValues(profile.esco_skills).join(' · ') || '—')}</p><div class="legend">${legend}</div><h2>Criterion assessment</h2><div class="grid">${criteriaHtml}</div>${notes[candidate.candidate_id] ? `<h2>Recruiter note</h2><div class="cv">${escapeHtml(notes[candidate.candidate_id])}</div>` : ''}<h2>CV / candidate profile with supporting evidence</h2><div class="cv">${highlightedHtml(displayText, candidate, localColorIndex)}</div><div class="notice"><strong>Decision-support notice.</strong> AI Match scores reflect the system’s assessment against the requirements, criteria and weights defined for the current search. They support candidate discovery and comparison and do not constitute hiring decisions or recommendations. Supporting evidence should be reviewed by the responsible recruiter, who remains responsible for all selection decisions.</div></body></html>`;
  }

  async function downloadCandidateAssessment(candidate: AdvancedMatchedCandidate, suppliedProfile?: CandidateProfile) {
    const html = await buildAssessmentHtml(candidate, suppliedProfile);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ARIADNE_candidate_${candidate.candidate_id}_assessment.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadSavedAssessments() {
    if (saved.length === 0) return;
    const reports = await Promise.all(saved.map((candidate) => buildAssessmentHtml(candidate)));
    const bodies = reports.map((report) => report.match(/<body>([\s\S]*)<\/body>/i)?.[1] ?? report);
    const combined = `<!doctype html><html><head><meta charset="utf-8"><title>ARIADNE Saved Assessments</title><style>body{font-family:Arial,sans-serif;color:#243147;max-width:1050px;margin:30px auto;padding:0 24px;line-height:1.5}h1{margin-bottom:16px}.candidate-report{page-break-after:always;border-bottom:2px solid #dce3ec;padding-bottom:35px;margin-bottom:35px}.candidate-report:last-child{page-break-after:auto;border-bottom:0}.sub{color:#6d7889}.score{font-size:28px;font-weight:800;color:#2f66c3}.legend{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.legend span{font-size:12px}.legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.criterion{border:1px solid;border-radius:10px;padding:12px}.criterion-head{display:flex;justify-content:space-between;gap:12px}.criterion h3{margin:0;font-size:15px}.criterion p,.criterion li{font-size:12px}.meta{color:#738095}.cv{white-space:pre-wrap;border:1px solid #dde3eb;border-radius:12px;padding:18px;background:#fafbfd;font-size:12px}mark{box-decoration-break:clone;-webkit-box-decoration-break:clone}.notice{margin-top:20px;padding:12px;background:#f6f8fb;border:1px solid #dde4ed;border-radius:10px;font-size:11px;color:#627087}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style></head><body><h1>ARIADNE · Saved Candidate Assessments</h1>${bodies.map((body) => `<section class="candidate-report">${body}</section>`).join('')}</body></html>`;
    const blob = new Blob([combined], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ARIADNE_saved_candidate_assessments.html';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="advanced-shell">
      <div className="advanced-inner">
        <div className="advanced-stepper-toolbar">
          <StepIndicator step={step}/>
          <button type="button" className="advanced-reset-session" onClick={resetAdvancedSession}><Trash2 size={14}/> Clear current Advanced Match</button>
        </div>
        <Funnel eligibility={eligibilityResult} retrieval={retrieval} scored={scored && !assessmentStale ? scored : null}/>

        {error && <div className="advanced-error"><ShieldCheck size={18}/><div><strong>{error.title}</strong><span>{error.message}</span><small><b>What to do:</b> {error.action}</small></div></div>}

        {step === 1 && (
          <form className="advanced-card" onSubmit={submitEligibility}>
            <div className="advanced-card-heading">
              <div className="advanced-card-icon"><FileSearch size={21}/></div>
              <div><span>Step 1 of 3</span><h2>Eligibility & pre-screening</h2><p>Define minimum requirements and must-have criteria to narrow the candidate pool.</p></div>
            </div>

            <div className="advanced-info-box"><Info size={16}/><span>Pre-screening combines structured filters with keyword and semantic matching to identify relevant candidates.</span></div>

            <div className="advanced-grid two">
              <div className="advanced-field advanced-domain-field">
                <span>Professional domain <small className="optional-label">optional</small></span>
                <select value="" onChange={(event) => {
                  const value = event.target.value;
                  if (!value || eligibility.professional_domains.includes(value)) return;
                  updateEligibility({ professional_domains: [...eligibility.professional_domains, value] });
                }}>
                  <option value="">Select a professional domain…</option>
                  {PROFESSIONAL_DOMAINS.filter((domain) => !eligibility.professional_domains.includes(domain)).map((domain) => <option key={domain} value={domain}>{domain}</option>)}
                </select>
                {eligibility.professional_domains.length > 0 && <div className="chip-row domain-chip-row">{eligibility.professional_domains.map((domain) => <button type="button" key={domain} onClick={() => updateEligibility({ professional_domains: eligibility.professional_domains.filter((item) => item !== domain) })}>{domain}<X size={12}/></button>)}</div>}
                <small>Selecting multiple domains includes candidates matching at least one selected domain.</small>
              </div>
            </div>

            <div className="advanced-grid two">
              <label className="advanced-field"><span>Minimum experience <small className="optional-label">optional</small></span><div className="input-with-suffix"><input type="number" min="0" placeholder="e.g. 10" value={eligibility.min_experience ?? ''} onChange={(event) => updateEligibility({ min_experience: event.target.value === '' ? undefined : Number(event.target.value) })}/><em>years</em></div></label>
              <label className="advanced-field"><span>Maximum experience <small className="optional-label">optional</small></span><div className="input-with-suffix"><input type="number" min="0" placeholder="No upper limit" value={eligibility.max_experience ?? ''} onChange={(event) => updateEligibility({ max_experience: event.target.value === '' ? undefined : Number(event.target.value) })}/><em>years</em></div></label>
              <div className="advanced-range-helper"><Info size={13}/> Use either field on its own or combine both to define a range. For example, Minimum 10 with Maximum left empty means 10+ years.</div>
            </div>

            <div className="advanced-grid two">
              <label className="advanced-field"><span>Minimum English level</span><select value={eligibility.min_english_level ?? ''} onChange={(event) => updateEligibility({ min_english_level: event.target.value || undefined })}><option value="">Any level</option>{ENGLISH_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select><small>Uses the ordered English levels already present in the dataset.</small></label>
              <div className="advanced-field"><span>Additional required languages</span><div className="chip-input"><div className="chip-row">{eligibility.additional_languages.map((language) => <button type="button" key={language} onClick={() => updateEligibility({ additional_languages: eligibility.additional_languages.filter((item) => item !== language) })}>{language}<X size={12}/></button>)}</div><input value={languageDraft} onChange={(event) => setLanguageDraft(event.target.value)} onKeyDown={languageKeyDown} onBlur={() => languageDraft.trim() && addLanguage()} placeholder="e.g. French C1, Spanish B2"/></div>{eligibility.additional_languages.length >= 2 && <div className="language-logic"><span>Candidates must match</span><button type="button" className={eligibility.language_match_mode === 'all' ? 'active' : ''} onClick={() => updateEligibility({ language_match_mode: 'all' })}>All languages</button><button type="button" className={eligibility.language_match_mode === 'any' ? 'active' : ''} onClick={() => updateEligibility({ language_match_mode: 'any' })}>Any language</button></div>}<small>These settings apply only to additional languages beyond English.</small></div>
            </div>

            <div className="advanced-divider"><span>Must-have profile requirements</span><small>Related wording can still be identified through keyword and semantic matching.</small></div>
            <div className="advanced-grid three">
              <label className="advanced-field"><span><GraduationCap size={14}/> Education / studies</span><textarea rows={4} placeholder="e.g. Computer Science, Engineering or related" value={eligibility.education} onChange={(event) => updateEligibility({ education: event.target.value })}/></label>
              <label className="advanced-field"><span><BriefcaseBusiness size={14}/> Required experience in</span><textarea rows={4} placeholder="e.g. cybersecurity, information security" value={eligibility.required_experience} onChange={(event) => updateEligibility({ required_experience: event.target.value })}/></label>
              <label className="advanced-field"><span><Wrench size={14}/> Must-have skills</span><textarea rows={4} placeholder="e.g. SIEM, Python, cloud security" value={eligibility.must_have_skills} onChange={(event) => updateEligibility({ must_have_skills: event.target.value })}/></label>
            </div>

            <div className="advanced-footer advanced-footer-end"><button className="advanced-next" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17}/> Screening…</> : <>Continue <ArrowRight size={18}/></>}</button></div>
          </form>
        )}

        {step === 2 && (
          <form className="advanced-card" onSubmit={submitCriteria}>
            <div className="advanced-card-heading">
              <div className="advanced-card-icon"><Target size={21}/></div>
              <div><span>Step 2 of 3</span><h2>Matching criteria & recruiter weights</h2><p>Define what matters for this search. You control the criteria, their weights and the minimum score required for the final shortlist.</p></div>
            </div>

            <label className="advanced-field target-role-field"><span>Target role</span><input value={targetRole} onChange={(event) => { touchAssessment(); setTargetRole(event.target.value); }} placeholder="e.g. Cybersecurity Policy Officer"/></label>

            <div className="criteria-toolbar"><div><strong>Recruiter-defined criteria</strong><span>Edit, remove or add criteria. Maximum 8.</span></div><button type="button" onClick={() => addCriterion()} disabled={criteria.length >= 8}><Plus size={15}/> Add criterion</button></div>

            <div className="criteria-list">
              {criteria.map((criterion, index) => {
                const color = CRITERION_COLORS[criterion.colorIndex % CRITERION_COLORS.length];
                return (
                  <article className="criterion-editor criterion-editor-colored" key={criterion.id} style={{ borderColor: color.border, backgroundColor: color.bg }}>
                    <div className="criterion-number" style={{ backgroundColor: color.accent }}>{index + 1}</div>
                    <div className="criterion-editor-body">
                      <div className="criterion-editor-top">
                        <label><span><i className="criterion-dot" style={{ backgroundColor: color.accent }}/> Criterion name</span><input value={criterion.name} onChange={(event) => updateCriterion(criterion.id, 'name', event.target.value)} placeholder="e.g. EU regulatory experience"/></label>
                        <label className="weight-field"><span>Weight</span><div><input type="number" min="0" max="100" step="1" value={criterion.weight} onChange={(event) => updateCriterion(criterion.id, 'weight', event.target.value)} placeholder="0"/><em>%</em></div></label>
                        <button type="button" className="criterion-delete" onClick={() => removeCriterion(criterion.id)} disabled={criteria.length <= 1} aria-label="Delete criterion"><Trash2 size={16}/></button>
                      </div>
                      <label><span>What should the system look for?</span><textarea rows={3} value={criterion.description} onChange={(event) => updateCriterion(criterion.id, 'description', event.target.value)} placeholder="Describe the evidence that should count for this criterion…"/></label>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="suggested-criteria"><span>Suggested criteria</span><div>{SUGGESTED_CRITERIA.map(([name, description]) => <button type="button" key={name} onClick={() => addSuggested(name, description)}>+ {name}</button>)}</div></div>

            <div className="advanced-step2-controls">
              <div className={`weight-total ${Math.abs(weightTotal - 100) < 0.01 ? 'valid' : ''}`}><span>Total weight</span><strong>{weightTotal.toFixed(weightTotal % 1 ? 1 : 0)}%</strong><small>{Math.abs(weightTotal - 100) < 0.01 ? 'Weights ready' : 'Recruiter-defined weights must add up to 100%.'}</small></div>
              <label className="shortlist-threshold-card">
                <div><span>Shortlist threshold</span><strong>Minimum overall AI Match Score</strong><small>Only profiles reaching this final weighted score will appear in the AI shortlist.</small></div>
                <div className="threshold-input"><input type="number" min="0" max="100" step="1" value={shortlistThreshold} onChange={(event) => { touchAssessment(); setShortlistThreshold(event.target.value); }}/><em>/ 100</em></div>
              </label>
            </div>

            <div className="advanced-footer">
              <button type="button" className="advanced-back" onClick={() => { setStep(1); setError(null); }}><ArrowLeft size={18}/> Back</button>
              <div className="advanced-footer-actions">
                {scored && !assessmentStale && retrieval && <button type="button" className="advanced-back" onClick={() => setStep(3)}>Return to current results</button>}
                <button className="advanced-next" disabled={busy || targetRole.trim().length < 2 || !criteriaReady}>{busy ? <><LoaderCircle className="spin" size={17}/> Matching…</> : <>Match candidates <ArrowRight size={18}/></>}</button>
              </div>
            </div>
          </form>
        )}

        {step === 3 && retrieval && (
          <div className="advanced-card advanced-results-stage">
            <div className="advanced-card-heading">
              <div className="advanced-card-icon"><Cpu size={21}/></div>
              <div><span>Step 3 of 3</span><h2>AI assessment & shortlist ranking</h2><p>Each candidate is assessed against your criteria using evidence from their profile. Criterion scores range from 0–100, and your selected weights determine how each criterion contributes to the final match.</p></div>
            </div>

            <div className="advanced-criterion-guide">
              {criteria.map((criterion) => {
                const color = CRITERION_COLORS[criterion.colorIndex % CRITERION_COLORS.length];
                return <span key={criterion.id} style={{ backgroundColor: color.bg, borderColor: color.border, color: color.text }}><i style={{ backgroundColor: color.accent }}/>{criterion.name || 'Criterion'} · {criterion.weight || 0}%</span>;
              })}
            </div>

            {assessmentStale && scored && (
              <div className="advanced-stale-notice"><Info size={16}/><div><strong>Previous assessment retained</strong><span>Your saved result is still visible below, but it was produced using the previous search settings. Run a new AI assessment to update the shortlist.</span></div></div>
            )}

            {(!scored || assessmentStale) && !busy && (
              <div className="ai-ready-panel">
                <div className="ai-ready-icon"><Sparkles size={28}/></div>
                <div><strong>{retrieval.retrieved_pool} matched profiles ready for AI assessment</strong><p>Each candidate is assessed against your criteria using profile evidence. ARIADNE calculates the weighted final score and keeps only profiles scoring at least <b>{thresholdNumber}/100</b>.</p><div className="ai-ready-meta"><span><Cpu size={14}/> Pointwise LLM assessment</span><span><Search size={14}/> {retrieval.retrieved_pool} matched profiles</span><span><BadgeCheck size={14}/> Threshold {thresholdNumber}/100</span></div></div>
                <button className="advanced-ai-button" onClick={runAiScoring}><Sparkles size={17}/> {assessmentStale ? 'Run updated assessment' : 'Run AI assessment'}</button>
              </div>
            )}

            {busy && (
              <div className="ai-processing advanced-ai-progress">
                <LoaderCircle className="spin" size={34}/>
                <h3>AI is assessing the matched profiles…</h3>
                <p>Each profile is evaluated pointwise against all recruiter-defined criteria with supporting evidence.</p>
                <div className="advanced-progress-track"><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}/></div>
                <strong>{progress.done} / {progress.total} assessed</strong>
                <span>{progress.shortlisted} currently meet the {thresholdNumber}/100 shortlist threshold</span>
              </div>
            )}

            {scored && (
              <>
                <div className="advanced-results-summary">
                  <div><strong>{scored.scored_pool}</strong><span>Profiles assessed</span></div>
                  <div><strong>{scored.shortlisted_pool}</strong><span>AI shortlisted</span></div>
                  <div><strong>{scored.shortlist_threshold}/100</strong><span>Shortlist threshold</span></div>
                  <div><strong>{criteria.length}</strong><span>Recruiter criteria</span></div>
                </div>

                <div className="advanced-results-toolbar">
                  <div><strong>Final AI shortlist</strong><span>Ranked by deterministic weighted AI Match Score.</span></div>
                  <div>
                    <button className="secondary-action" onClick={() => setSavedOpen(true)}><BookmarkCheck size={14}/> Saved assessments ({saved.length})</button>
                    {saved.length > 0 && <button className="secondary-action" onClick={downloadSavedAssessments}><Download size={14}/> Download saved</button>}
                    {saved.length > 0 && <button className="secondary-action danger-soft" onClick={unsaveAllAdvanced}><Trash2 size={14}/> Unsave all Advanced</button>}
                  </div>
                </div>

                <div className="advanced-disclaimer"><ShieldCheck size={16}/><span><strong>Decision-support only.</strong> AI Match scores reflect the system’s assessment against the requirements, criteria and weights defined for the current search. They support candidate discovery and comparison and do not constitute hiring decisions or recommendations. Supporting evidence should be reviewed by the responsible recruiter, who remains responsible for all selection decisions.</span></div>

                {scored.candidates.length === 0 ? (
                  <div className="advanced-no-shortlist"><Users size={26}/><h3>No profiles reached the shortlist threshold.</h3><p>No assessed candidate achieved a final AI Match Score of at least {scored.shortlist_threshold}/100. You can review the criteria, weights or threshold and run the assessment again.</p></div>
                ) : (
                  <div className="advanced-results-list">
                    {scored.candidates.map((candidate) => (
                      <AdvancedResultCard
                        key={candidate.candidate_id}
                        candidate={candidate}
                        onOpen={() => setProfileCandidate(candidate)}
                        saved={sharedShortlist.some((item) => item.candidate_id === candidate.candidate_id)}
                        comparing={compareIds.includes(candidate.candidate_id)}
                        note={notes[candidate.candidate_id] ?? ''}
                        toggleSave={() => toggleSave(candidate)}
                        toggleCompare={() => toggleCompare(candidate.candidate_id)}
                        editNote={() => editNote(candidate)}
                        download={() => { void downloadCandidateAssessment(candidate); }}
                        colorIndexForId={colorIndexForId}
                      />
                    ))}
                  </div>
                )}

                {compareIds.length > 0 && (
                  <div className="advanced-compare-bar">
                    <span>{compareIds.length} selected for comparison · maximum 4</span>
                    <button onClick={() => setCompareIds([])}>Clear</button>
                    <button className="compare-button" disabled={compareIds.length < 2} onClick={() => setCompareOpen(true)}><Columns2 size={15}/> Compare selected ({compareIds.length})</button>
                  </div>
                )}
              </>
            )}

            <div className="advanced-footer"><button type="button" className="advanced-back" onClick={backFromResults}><ArrowLeft size={18}/> Back to criteria</button>{scored && !assessmentStale && <button type="button" className="advanced-next" onClick={runAiScoring} disabled={busy}><Sparkles size={17}/> Re-run assessment</button>}</div>
          </div>
        )}
      </div>

      {profileCandidate && <AdvancedProfilePanel candidate={profileCandidate} close={() => setProfileCandidate(null)} colorIndexForId={colorIndexForId} download={downloadCandidateAssessment} note={notes[profileCandidate.candidate_id] ?? ''} editNote={() => editNote(profileCandidate)}/>} 
      {compareOpen && compareCandidates.length >= 2 && <AdvancedCompareModal candidates={compareCandidates} close={() => setCompareOpen(false)} remove={removeCompare} notes={notes} editNote={editNote}/>} 
      {savedOpen && <SavedAssessmentsModal candidates={saved} close={() => setSavedOpen(false)} remove={(candidateId) => { setSaved((current) => current.filter((item) => item.candidate_id !== candidateId)); removeFromSharedShortlist(candidateId); }} download={(candidate) => { void downloadCandidateAssessment(candidate); }} downloadAll={() => { void downloadSavedAssessments(); }} removeAll={unsaveAllAdvanced}/>} 
    </section>
  );
}
