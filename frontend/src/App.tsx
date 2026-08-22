import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Search,
  Clock3,
  ShieldCheck,
  X,
  ChevronRight,
  BriefcaseBusiness,
  Languages,
  Sparkles,
  Cpu,
  Database,
  FileText,
  Bookmark,
  BookmarkCheck,
  Columns2,
  Download,
  RotateCcw,
  History,
  SlidersHorizontal,
  Trash2,
  StickyNote,
  Eye,
  Eraser,
  Save,
  Building2,
  Mail,
  LockKeyhole,
  UserRound,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  BadgeCheck,
  Globe2,
  Phone,
  MapPin,
  Users,
  EyeOff,
} from 'lucide-react';
import { getCandidate, searchCandidates } from './api';
import type { AdvancedMatchedCandidate, CandidateProfile, CandidateSummary, SearchResponse } from './types';
import AdvancedMatch from './AdvancedMatch';

const EXAMPLES = [
  'Cybersecurity analyst with SIEM, incident response and 3+ years of experience',
  'HR recruiter with talent acquisition, stakeholder management and fluent English',
  'Machine learning engineer with Python, NLP and deep learning experience',
];

const SHORTLIST_KEY = 'ariadne-shortlist-v1';
const HISTORY_KEY = 'ariadne-search-history-v1';
const RECENTLY_VIEWED_KEY = 'ariadne-recently-viewed-v1';
const NOTES_KEY = 'ariadne-candidate-notes-v1';

const AUTH_SESSION_KEY = 'ariadne-employer-session-v1';
const EMPLOYER_ACCOUNT_KEY = 'ariadne-employer-account-v1';

type AuthMode = 'login' | 'signup';
type SignupStep = 1 | 2 | 3;

type EmployerSignupForm = {
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  country: string;
  registrationNumber: string;
  website: string;
  industry: string;
  companySize: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  phone: string;
  companyAddress: string;
  authorised: boolean;
  acceptedTerms: boolean;
};

type StoredEmployerAccount = Omit<EmployerSignupForm, 'password' | 'confirmPassword' | 'authorised' | 'acceptedTerms'> & {
  passwordHash: string;
  createdAt: string;
};

const EMPTY_EMPLOYER_FORM: EmployerSignupForm = {
  email: '',
  password: '',
  confirmPassword: '',
  companyName: '',
  country: '',
  registrationNumber: '',
  website: '',
  industry: '',
  companySize: '',
  firstName: '',
  lastName: '',
  jobTitle: '',
  phone: '',
  companyAddress: '',
  authorised: false,
  acceptedTerms: false,
};

const EMPLOYER_COUNTRIES = [
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Estonia',
  'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy',
  'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Norway',
  'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'Other',
];

const EMPLOYER_INDUSTRIES = [
  'Technology & IT', 'Professional services', 'Finance & insurance', 'Healthcare', 'Education & research',
  'Manufacturing & engineering', 'Retail & e-commerce', 'Transport & logistics', 'Public / non-profit', 'Other',
];

const COMPANY_SIZES = ['1–9 employees', '10–49 employees', '50–249 employees', '250–999 employees', '1,000+ employees'];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function passwordRequirements(value: string) {
  return {
    length: value.length >= 8,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    number: /\d/.test(value),
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function AuthFeature({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <div className="auth-feature">
      <div className="auth-feature-icon">{icon}</div>
      <div><strong>{title}</strong><span>{copy}</span></div>
    </div>
  );
}

function EmployerAuthPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [form, setForm] = useState<EmployerSignupForm>(EMPTY_EMPLOYER_FORM);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [busy, setBusy] = useState(false);

  const passwordRules = passwordRequirements(form.password);
  const passwordReady = Object.values(passwordRules).every(Boolean);

  function switchMode(next: AuthMode) {
    setMode(next);
    setAuthError('');
    if (next === 'signup') setSignupStep(1);
  }

  function updateForm<K extends keyof EmployerSignupForm>(key: K, value: EmployerSignupForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setAuthError('');
  }

  async function submitLogin(event: FormEvent) {
    event.preventDefault();
    setAuthError('');
    if (!isValidEmail(loginEmail)) {
      setAuthError('Enter a valid company email address.');
      return;
    }
    if (!loginPassword) {
      setAuthError('Enter your password.');
      return;
    }

    let account: StoredEmployerAccount | null = null;
    try {
      account = JSON.parse(localStorage.getItem(EMPLOYER_ACCOUNT_KEY) ?? 'null');
    } catch {
      account = null;
    }

    if (!account) {
      setAuthError('No employer account is registered on this browser yet. Create an employer account first.');
      return;
    }

    setBusy(true);
    try {
      const loginHash = await sha256(`${loginEmail.trim().toLowerCase()}::${loginPassword}`);
      if (account.email.toLowerCase() !== loginEmail.trim().toLowerCase() || account.passwordHash !== loginHash) {
        setAuthError('The email or password is incorrect.');
        return;
      }
      sessionStorage.setItem(AUTH_SESSION_KEY, 'active');
      onAuthenticated();
    } finally {
      setBusy(false);
    }
  }

  function continueSignup() {
    setAuthError('');
    if (signupStep === 1) {
      if (!isValidEmail(form.email)) {
        setAuthError('Enter a valid company email address.');
        return;
      }
      if (!passwordReady) {
        setAuthError('Your password does not yet meet all requirements.');
        return;
      }
      if (form.password !== form.confirmPassword) {
        setAuthError('The passwords do not match.');
        return;
      }
      setSignupStep(2);
      return;
    }

    if (signupStep === 2) {
      if (!form.companyName.trim() || !form.country || !form.registrationNumber.trim()) {
        setAuthError('Company name, country of establishment and VAT / registration number are required.');
        return;
      }
      setSignupStep(3);
    }
  }

  async function submitSignup(event: FormEvent) {
    event.preventDefault();
    setAuthError('');
    if (!form.firstName.trim() || !form.lastName.trim() || !form.jobTitle.trim() || !form.companyAddress.trim()) {
      setAuthError('Complete the employer representative and registered business address fields.');
      return;
    }
    if (!form.authorised) {
      setAuthError('Confirm that you are authorised to act on behalf of the organisation.');
      return;
    }
    if (!form.acceptedTerms) {
      setAuthError('Accept the Terms of Use and Privacy Notice to continue.');
      return;
    }

    setBusy(true);
    try {
      const passwordHash = await sha256(`${form.email.trim().toLowerCase()}::${form.password}`);
      const account: StoredEmployerAccount = {
        email: form.email.trim(),
        companyName: form.companyName.trim(),
        country: form.country,
        registrationNumber: form.registrationNumber.trim(),
        website: form.website.trim(),
        industry: form.industry,
        companySize: form.companySize,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        jobTitle: form.jobTitle.trim(),
        phone: form.phone.trim(),
        companyAddress: form.companyAddress.trim(),
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(EMPLOYER_ACCOUNT_KEY, JSON.stringify(account));
      sessionStorage.setItem(AUTH_SESSION_KEY, 'active');
      onAuthenticated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <div className="auth-orbit auth-orbit-one" />
        <div className="auth-orbit auth-orbit-two" />
        <div className="auth-brand-top">
          <div className="auth-brand-lockup">
            <div className="auth-brand-mark">A</div>
            <div><strong>ARIADNE</strong><span>Employer workspace</span></div>
          </div>
          <div className="auth-employer-pill"><BadgeCheck size={15}/> Employer access only</div>
        </div>

        <div className="auth-brand-copy">
          <div className="auth-kicker">AI-assisted candidate retrieval</div>
          <h1>Turn a hiring need into a focused shortlist.</h1>
          <p>Search candidate profiles, refine results, compare relevant people and keep recruiter notes in one focused workspace.</p>

          <div className="auth-feature-list">
            <AuthFeature icon={<Search size={18}/>} title="Focused candidate search" copy="Natural-language matching with structured result refinement." />
            <AuthFeature icon={<Columns2 size={18}/>} title="Shortlist and compare" copy="Keep promising profiles together and review them side by side." />
            <AuthFeature icon={<StickyNote size={18}/>} title="Recruiter workspace" copy="Add notes, revisit profiles and export your shortlist when ready." />
            <AuthFeature icon={<ShieldCheck size={18}/>} title="Local-first processing" copy="The current prototype runs candidate matching in your local environment." />
          </div>
        </div>

        <div className="auth-brand-footer">
          <ShieldCheck size={16}/>
          <span>Candidate profiles stay behind the employer access screen.</span>
        </div>
      </section>

      <section className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <div className="auth-brand-mark small">A</div>
            <div><strong>ARIADNE</strong><span>Employer workspace</span></div>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="Employer account access">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')} type="button">Sign in</button>
            <button className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')} type="button">Create employer account</button>
          </div>

          {mode === 'login' ? (
            <form className="auth-form" onSubmit={submitLogin}>
              <div className="auth-card-heading">
                <div className="auth-card-icon"><LockKeyhole size={19}/></div>
                <div><h2>Welcome back</h2><p>Sign in to access candidate search and your recruiter workspace.</p></div>
              </div>

              <label className="auth-field">
                <span>Company email</span>
                <div className="auth-input-wrap"><Mail size={17}/><input type="email" value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); setAuthError(''); }} placeholder="name@company.eu" autoComplete="email" /></div>
              </label>

              <label className="auth-field">
                <span>Password</span>
                <div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showLoginPassword ? 'text' : 'password'} value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setAuthError(''); }} placeholder="Enter your password" autoComplete="current-password" /><button type="button" className="password-toggle" onClick={() => setShowLoginPassword((value) => !value)} aria-label={showLoginPassword ? 'Hide password' : 'Show password'}>{showLoginPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
              </label>

              {authError && <div className="auth-error">{authError}</div>}

              <button className="auth-primary-button" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in to ARIADNE'} <ArrowRight size={17}/></button>

              <div className="auth-first-time">First time using ARIADNE? <button type="button" onClick={() => switchMode('signup')}>Create an employer account</button></div>
            </form>
          ) : (
            <form className="auth-form signup-form" onSubmit={submitSignup}>
              <div className="auth-card-heading signup-heading">
                <div className="auth-card-icon"><Building2 size={19}/></div>
                <div><h2>Create an employer account</h2><p>Set up the organisation and representative who will access candidate profiles.</p></div>
              </div>

              <div className="signup-progress" aria-label="Employer registration progress">
                {[
                  [1, 'Account'], [2, 'Organisation'], [3, 'Representative'],
                ].map(([step, label]) => (
                  <div key={String(step)} className={`signup-step ${signupStep === step ? 'active' : ''} ${signupStep > Number(step) ? 'done' : ''}`}>
                    <span>{signupStep > Number(step) ? <CheckCircle2 size={15}/> : step}</span><small>{label}</small>
                  </div>
                ))}
              </div>

              {signupStep === 1 && (
                <div className="signup-step-body">
                  <div className="signup-section-intro"><strong>Work account</strong><span>Use the email address you use at your organisation.</span></div>
                  <label className="auth-field">
                    <span>Company email <em>Required</em></span>
                    <div className="auth-input-wrap"><Mail size={17}/><input type="email" value={form.email} onChange={(e) => updateForm('email', e.target.value)} placeholder="name@company.eu" autoComplete="email" /></div>
                  </label>
                  <div className="auth-two-column">
                    <label className="auth-field">
                      <span>Password <em>Required</em></span>
                      <div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showSignupPassword ? 'text' : 'password'} value={form.password} onChange={(e) => updateForm('password', e.target.value)} placeholder="Create password" autoComplete="new-password" /><button type="button" className="password-toggle" onClick={() => setShowSignupPassword((value) => !value)}>{showSignupPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
                    </label>
                    <label className="auth-field">
                      <span>Confirm password <em>Required</em></span>
                      <div className="auth-input-wrap"><LockKeyhole size={17}/><input type={showSignupPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => updateForm('confirmPassword', e.target.value)} placeholder="Repeat password" autoComplete="new-password" /></div>
                    </label>
                  </div>
                  <div className="password-rules">
                    <span className={passwordRules.length ? 'ok' : ''}><CheckCircle2 size={13}/> 8+ characters</span>
                    <span className={passwordRules.upper ? 'ok' : ''}><CheckCircle2 size={13}/> uppercase letter</span>
                    <span className={passwordRules.lower ? 'ok' : ''}><CheckCircle2 size={13}/> lowercase letter</span>
                    <span className={passwordRules.number ? 'ok' : ''}><CheckCircle2 size={13}/> number</span>
                  </div>
                </div>
              )}

              {signupStep === 2 && (
                <div className="signup-step-body">
                  <div className="signup-section-intro"><strong>Organisation details</strong><span>Information used to identify the employer behind the account.</span></div>
                  <label className="auth-field">
                    <span>Company / organisation name <em>Required</em></span>
                    <div className="auth-input-wrap"><Building2 size={17}/><input value={form.companyName} onChange={(e) => updateForm('companyName', e.target.value)} placeholder="Organisation name" autoComplete="organization" /></div>
                  </label>
                  <div className="auth-two-column">
                    <label className="auth-field">
                      <span>Country of establishment <em>Required</em></span>
                      <div className="auth-input-wrap select-wrap"><Globe2 size={17}/><select value={form.country} onChange={(e) => updateForm('country', e.target.value)}><option value="">Select country</option>{EMPLOYER_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}</select></div>
                    </label>
                    <label className="auth-field">
                      <span>VAT / registration number <em>Required</em></span>
                      <div className="auth-input-wrap"><BadgeCheck size={17}/><input value={form.registrationNumber} onChange={(e) => updateForm('registrationNumber', e.target.value)} placeholder="VAT or national registration no." /></div>
                    </label>
                  </div>
                  <div className="auth-two-column">
                    <label className="auth-field">
                      <span>Industry <small>Optional</small></span>
                      <div className="auth-input-wrap select-wrap"><BriefcaseBusiness size={17}/><select value={form.industry} onChange={(e) => updateForm('industry', e.target.value)}><option value="">Select industry</option>{EMPLOYER_INDUSTRIES.map((industry) => <option key={industry}>{industry}</option>)}</select></div>
                    </label>
                    <label className="auth-field">
                      <span>Organisation size <small>Optional</small></span>
                      <div className="auth-input-wrap select-wrap"><Users size={17}/><select value={form.companySize} onChange={(e) => updateForm('companySize', e.target.value)}><option value="">Select size</option>{COMPANY_SIZES.map((size) => <option key={size}>{size}</option>)}</select></div>
                    </label>
                  </div>
                  <label className="auth-field">
                    <span>Company website <small>Optional</small></span>
                    <div className="auth-input-wrap"><Globe2 size={17}/><input value={form.website} onChange={(e) => updateForm('website', e.target.value)} placeholder="https://company.eu" inputMode="url" /></div>
                  </label>
                </div>
              )}

              {signupStep === 3 && (
                <div className="signup-step-body">
                  <div className="signup-section-intro"><strong>Employer representative</strong><span>Tell us who will use the account on behalf of the organisation.</span></div>
                  <div className="auth-two-column">
                    <label className="auth-field"><span>First name <em>Required</em></span><div className="auth-input-wrap"><UserRound size={17}/><input value={form.firstName} onChange={(e) => updateForm('firstName', e.target.value)} placeholder="First name" autoComplete="given-name" /></div></label>
                    <label className="auth-field"><span>Last name <em>Required</em></span><div className="auth-input-wrap"><UserRound size={17}/><input value={form.lastName} onChange={(e) => updateForm('lastName', e.target.value)} placeholder="Last name" autoComplete="family-name" /></div></label>
                  </div>
                  <div className="auth-two-column">
                    <label className="auth-field"><span>Role / job title <em>Required</em></span><div className="auth-input-wrap"><BriefcaseBusiness size={17}/><input value={form.jobTitle} onChange={(e) => updateForm('jobTitle', e.target.value)} placeholder="e.g. Talent Acquisition Manager" autoComplete="organization-title" /></div></label>
                    <label className="auth-field"><span>Telephone <small>Optional</small></span><div className="auth-input-wrap"><Phone size={17}/><input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} placeholder="+30 …" autoComplete="tel" /></div></label>
                  </div>
                  <label className="auth-field"><span>Registered business address <em>Required</em></span><div className="auth-input-wrap"><MapPin size={17}/><input value={form.companyAddress} onChange={(e) => updateForm('companyAddress', e.target.value)} placeholder="Street, city, postal code" autoComplete="street-address" /></div></label>

                  <div className="auth-consents">
                    <label><input type="checkbox" checked={form.authorised} onChange={(e) => updateForm('authorised', e.target.checked)} /><span>I confirm that I am authorised to recruit and access candidate profiles on behalf of this organisation.</span></label>
                    <label><input type="checkbox" checked={form.acceptedTerms} onChange={(e) => updateForm('acceptedTerms', e.target.checked)} /><span>I agree to the <strong>Terms of Use</strong> and acknowledge the <strong>Privacy Notice</strong>.</span></label>
                  </div>
                </div>
              )}

              {authError && <div className="auth-error">{authError}</div>}

              <div className="signup-actions">
                {signupStep > 1 && <button type="button" className="auth-back-button" onClick={() => { setSignupStep((signupStep - 1) as SignupStep); setAuthError(''); }}><ArrowLeft size={16}/> Back</button>}
                {signupStep < 3 ? (
                  <button type="button" className="auth-primary-button signup-next" onClick={continueSignup}>Continue <ArrowRight size={17}/></button>
                ) : (
                  <button type="submit" className="auth-primary-button signup-next" disabled={busy}>{busy ? 'Creating account…' : 'Create account & enter ARIADNE'} <ArrowRight size={17}/></button>
                )}
              </div>
            </form>
          )}

          <div className="auth-card-footer"><ShieldCheck size={14}/> Employer access · candidate discovery · human review</div>
        </div>
      </section>
    </main>
  );
}


type ResultFilters = {
  minExperience: string;
  maxExperience: string;
  englishLevel: string;
  professionalDomain: string;
  profileKeywords: string;
  skills: string[];
};

const EMPTY_FILTERS: ResultFilters = {
  minExperience: '',
  maxExperience: '',
  englishLevel: '',
  professionalDomain: '',
  profileKeywords: '',
  skills: [],
};

type SkillDefinition = {
  label: string;
  category: 'Programming & development' | 'AI & data' | 'Cybersecurity' | 'Cloud & infrastructure' | 'Business & HR' | 'Legal & compliance' | 'Soft skills';
  aliases: string[];
};

const SKILL_LIBRARY: SkillDefinition[] = [
  { label: 'Python', category: 'Programming & development', aliases: ['python'] },
  { label: 'Java', category: 'Programming & development', aliases: ['java'] },
  { label: 'JavaScript', category: 'Programming & development', aliases: ['javascript'] },
  { label: 'TypeScript', category: 'Programming & development', aliases: ['typescript'] },
  { label: 'C++', category: 'Programming & development', aliases: ['c++'] },
  { label: 'C#', category: 'Programming & development', aliases: ['c#'] },
  { label: 'SQL', category: 'Programming & development', aliases: ['sql'] },
  { label: 'R', category: 'Programming & development', aliases: ['r programming', ' r '] },
  { label: 'Git', category: 'Programming & development', aliases: ['git', 'github', 'gitlab'] },
  { label: 'REST APIs', category: 'Programming & development', aliases: ['rest api', 'restful api', 'restful services'] },

  { label: 'Machine learning', category: 'AI & data', aliases: ['machine learning', 'ml engineer', 'ml models'] },
  { label: 'Deep learning', category: 'AI & data', aliases: ['deep learning'] },
  { label: 'Natural language processing', category: 'AI & data', aliases: ['natural language processing', 'nlp'] },
  { label: 'Data analysis', category: 'AI & data', aliases: ['data analysis', 'data analytics', 'data analyst'] },
  { label: 'Data science', category: 'AI & data', aliases: ['data science', 'data scientist'] },
  { label: 'PyTorch', category: 'AI & data', aliases: ['pytorch'] },
  { label: 'TensorFlow', category: 'AI & data', aliases: ['tensorflow'] },
  { label: 'Pandas', category: 'AI & data', aliases: ['pandas'] },
  { label: 'NumPy', category: 'AI & data', aliases: ['numpy'] },
  { label: 'Spark', category: 'AI & data', aliases: ['apache spark', 'pyspark'] },

  { label: 'Cybersecurity', category: 'Cybersecurity', aliases: ['cybersecurity', 'cyber security', 'information security'] },
  { label: 'SIEM', category: 'Cybersecurity', aliases: ['siem'] },
  { label: 'Incident response', category: 'Cybersecurity', aliases: ['incident response', 'incident handling'] },
  { label: 'Penetration testing', category: 'Cybersecurity', aliases: ['penetration testing', 'pentest', 'pen testing'] },
  { label: 'Vulnerability management', category: 'Cybersecurity', aliases: ['vulnerability management', 'vulnerability assessment'] },
  { label: 'Network security', category: 'Cybersecurity', aliases: ['network security'] },
  { label: 'Risk management', category: 'Cybersecurity', aliases: ['risk management', 'risk assessment'] },
  { label: 'ISO 27001', category: 'Cybersecurity', aliases: ['iso 27001', 'iso27001'] },

  { label: 'AWS', category: 'Cloud & infrastructure', aliases: ['aws', 'amazon web services'] },
  { label: 'Azure', category: 'Cloud & infrastructure', aliases: ['azure', 'microsoft azure'] },
  { label: 'Google Cloud', category: 'Cloud & infrastructure', aliases: ['google cloud', 'gcp'] },
  { label: 'Docker', category: 'Cloud & infrastructure', aliases: ['docker'] },
  { label: 'Kubernetes', category: 'Cloud & infrastructure', aliases: ['kubernetes', 'k8s'] },
  { label: 'Linux', category: 'Cloud & infrastructure', aliases: ['linux'] },
  { label: 'CI/CD', category: 'Cloud & infrastructure', aliases: ['ci/cd', 'continuous integration', 'continuous deployment'] },

  { label: 'Recruitment', category: 'Business & HR', aliases: ['recruitment', 'recruiting'] },
  { label: 'Talent acquisition', category: 'Business & HR', aliases: ['talent acquisition'] },
  { label: 'Project management', category: 'Business & HR', aliases: ['project management', 'project manager'] },
  { label: 'Stakeholder management', category: 'Business & HR', aliases: ['stakeholder management', 'stakeholder engagement'] },
  { label: 'Sales', category: 'Business & HR', aliases: ['sales', 'business development'] },
  { label: 'Marketing', category: 'Business & HR', aliases: ['marketing', 'digital marketing'] },

  { label: 'GDPR', category: 'Legal & compliance', aliases: ['gdpr', 'general data protection regulation'] },
  { label: 'Data protection', category: 'Legal & compliance', aliases: ['data protection', 'privacy law', 'data privacy'] },
  { label: 'Compliance', category: 'Legal & compliance', aliases: ['compliance', 'regulatory compliance'] },
  { label: 'Legal research', category: 'Legal & compliance', aliases: ['legal research'] },

  { label: 'Communication', category: 'Soft skills', aliases: ['communication skills', 'communication', 'communicative'] },
  { label: 'Teamwork', category: 'Soft skills', aliases: ['teamwork', 'team player', 'team work'] },
  { label: 'Leadership', category: 'Soft skills', aliases: ['leadership', 'team leadership'] },
  { label: 'Problem solving', category: 'Soft skills', aliases: ['problem solving', 'problem-solving'] },
  { label: 'Analytical thinking', category: 'Soft skills', aliases: ['analytical thinking', 'analytical skills', 'analytical mindset'] },
  { label: 'Adaptability', category: 'Soft skills', aliases: ['adaptability', 'adaptable'] },
  { label: 'Time management', category: 'Soft skills', aliases: ['time management'] },
  { label: 'Collaboration', category: 'Soft skills', aliases: ['collaboration', 'collaborative'] },
];
type CandidateNotes = Record<string, string>;

type ProfileCache = Record<string, CandidateProfile>;

function clean(value?: string | null) {
  const v = (value ?? '').trim();
  return v && v.toLowerCase() !== 'nan' ? v : '';
}

function rel(candidate: CandidateSummary) {
  return Math.round(Math.max(0, Math.min(100, candidate.display_relevance)));
}

function datasetProfileLabel(datasetIndex: number) {
  return `Dataset ID ${datasetIndex}`;
}

function advancedToCandidateSummary(candidate: AdvancedMatchedCandidate): CandidateSummary {
  return {
    rank: candidate.rank,
    candidate_id: candidate.candidate_id,
    dataset_index: candidate.dataset_index,
    position: candidate.position,
    primary_keyword: candidate.primary_keyword,
    professional_domains: candidate.professional_domains,
    experience_years: candidate.experience_years,
    english_level: candidate.english_level,
    looking_for: candidate.looking_for,
    highlights: candidate.highlights,
    cv_snippet: candidate.cv_snippet,
    reranker_score: 0,
    display_relevance: candidate.final_match_score,
    original_hybrid_rank: candidate.retrieval_rank,
    hybrid_rrf_score: 0,
    bm25_rank: null,
    jina_rank: null,
    source_mode: 'advanced',
    advanced_match_score: candidate.final_match_score,
  };
}

function parseExperience(value?: string | null) {
  const match = clean(value).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function uniqueClean(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(clean).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function splitPipeValues(value?: string | null) {
  return clean(value).split('|').map((part) => part.trim()).filter(Boolean);
}

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

const STOP_WORDS = new Set([
  'with', 'and', 'the', 'for', 'from', 'that', 'this', 'have', 'has', 'years', 'year',
  'experience', 'candidate', 'profile', 'looking', 'role', 'roles', 'plus', 'into', 'their',
  'your', 'you', 'are', 'who', 'using', 'knowledge', 'skills', 'skill', 'work', 'working',
]);

function queryTerms(query: string) {
  const tokens = query.toLowerCase().match(/[a-z0-9+#.]+/g) ?? [];
  return Array.from(new Set(tokens.filter((token) => token.length >= 3 && !STOP_WORDS.has(token))))
    .sort((a, b) => b.length - a.length);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function profileSearchText(candidate: CandidateSummary, profile?: CandidateProfile) {
  return [
    candidate.position,
    candidate.primary_keyword,
    candidate.looking_for,
    candidate.highlights,
    candidate.cv_snippet,
    profile?.full_cv,
    profile?.candidate_text,
  ]
    .map((value) => clean(value))
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasSkillAlias(text: string, alias: string) {
  const normalizedAlias = alias.trim().toLowerCase();
  if (!normalizedAlias) return false;
  const escaped = escapeRegex(normalizedAlias);
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}

function candidateHasSkill(candidate: CandidateSummary, profile: CandidateProfile | undefined, skillLabel: string) {
  const definition = SKILL_LIBRARY.find((skill) => skill.label === skillLabel);
  if (!definition) return false;
  const text = profileSearchText(candidate, profile);
  return definition.aliases.some((alias) => hasSkillAlias(text, alias));
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = queryTerms(query);
  if (!text || terms.length === 0) return <>{text}</>;

  const regex = new RegExp(`(${terms.map(escapeRegex).join('|')})`, 'gi');
  const pieces = text.split(regex);
  const termSet = new Set(terms);

  return (
    <>
      {pieces.map((piece, index) =>
        termSet.has(piece.toLowerCase())
          ? <mark key={`${piece}-${index}`} className="query-highlight">{piece}</mark>
          : <span key={`${piece}-${index}`}>{piece}</span>,
      )}
    </>
  );
}

function NoteModal({
  candidate,
  initialNote,
  close,
  saveNote,
  deleteNote,
}: {
  candidate: CandidateSummary;
  initialNote: string;
  close: () => void;
  saveNote: (value: string) => void;
  deleteNote: () => void;
}) {
  const [draft, setDraft] = useState(initialNote);

  function saveAndClose() {
    saveNote(draft.trim());
    close();
  }

  function removeAndClose() {
    deleteNote();
    close();
  }

  return (
    <div className="modal-backdrop centered note-backdrop" onClick={close}>
      <section className="note-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div>
            <div className="eyebrow"><StickyNote size={14}/> Recruiter note</div>
            <h2>{clean(candidate.position) || 'Candidate profile'}</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close note"><X size={20}/></button>
        </div>

        <p className="note-helper">Keep a private working note for this candidate. It is stored locally in this browser.</p>
        <textarea
          className="note-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Strong NLP background. Consider for technical interview."
          rows={7}
          autoFocus
        />

        <div className="note-modal-actions">
          {initialNote && (
            <button className="danger-text-button" onClick={removeAndClose}><Trash2 size={15}/> Delete note</button>
          )}
          <div className="note-modal-actions-right">
            <button className="neutral-button" onClick={close}>Cancel</button>
            <button className="primary-small-button" onClick={saveAndClose}><Save size={15}/> Save note</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ProfilePanel({
  summary,
  profile,
  loading,
  error,
  query,
  note,
  editNote,
  close,
}: {
  summary: CandidateSummary;
  profile: CandidateProfile | null;
  loading: boolean;
  error: string;
  query: string;
  note: string;
  editNote: () => void;
  close: () => void;
}) {
  const relevance = rel(summary);
  const isAdvancedSaved = summary.source_mode === 'advanced';
  const cvText = profile ? clean(profile.full_cv) || clean(profile.candidate_text) : '';

  return (
    <div className="modal-backdrop" onClick={close}>
      <aside className="profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <div>
            <div className="eyebrow">Candidate profile</div>
            <h2>{clean(summary.position) || 'Candidate profile'}</h2>
            <span className="dataset-id-badge">{datasetProfileLabel(summary.dataset_index)}</span>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close profile"><X size={20} /></button>
        </div>

        <div className="profile-score-row">
          <div className="score-ring"><strong>{isAdvancedSaved ? (summary.advanced_match_score ?? summary.display_relevance).toFixed(1) : relevance}{isAdvancedSaved ? '' : '%'}</strong><span>{isAdvancedSaved ? 'AI match' : 'relevance'}</span></div>
          <div className="score-explainer">
            <strong>{isAdvancedSaved ? 'Saved Advanced Match score' : 'Query relevance'}</strong>
            <span>{isAdvancedSaved ? 'This saved score comes from the Advanced Match assessment that added the candidate to the shared shortlist.' : 'Reflects alignment with the current search and is not a probability of job suitability.'}</span>
          </div>
        </div>

        <div className="profile-facts">
          {clean(summary.experience_years) && <div><span>Experience</span><strong>{summary.experience_years} years</strong></div>}
          {clean(summary.english_level) && <div><span>English</span><strong>{summary.english_level}</strong></div>}
          {clean(summary.professional_domains) && <div><span>Professional domain</span><strong>{splitPipeValues(summary.professional_domains).join(' · ')}</strong></div>}
        </div>

        {profile && clean(profile.esco_skills) && (
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

        {clean(summary.looking_for) && <section className="profile-section"><h3>Looking for</h3><p>{summary.looking_for}</p></section>}
        {clean(summary.highlights) && (
          <section className="profile-section">
            <h3>Highlights</h3>
            <p className="prewrap"><HighlightedText text={summary.highlights} query={query} /></p>
          </section>
        )}

        <section className="profile-section full-cv-section">
          <div className="section-heading-row"><h3>Full CV profile</h3><span><Database size={13}/> local dataset</span></div>
          {loading && <div className="profile-loading"><div className="spinner small" />Loading full profile locally…</div>}
          {error && <div className="profile-error">{error}</div>}
          {!loading && !error && profile && (
            <div className="cv-body prewrap">
              {cvText ? <HighlightedText text={cvText} query={query} /> : 'No CV text available.'}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

function CandidateCard({
  candidate,
  open,
  saved,
  comparing,
  note,
  toggleSave,
  toggleCompare,
  editNote,
}: {
  candidate: CandidateSummary;
  open: () => void;
  saved: boolean;
  comparing: boolean;
  note: string;
  toggleSave: () => void;
  toggleCompare: () => void;
  editNote: () => void;
}) {
  const relevance = rel(candidate);
  const summary = clean(candidate.highlights) || clean(candidate.cv_snippet) || 'No preview available.';

  return (
    <article className="candidate-card" onClick={open} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open()}>
      <div className="candidate-rank">#{candidate.rank}</div>
      <div className="candidate-content">
        <div className="candidate-title-row">
          <div>
            <h3>{clean(candidate.position) || 'Candidate profile'}</h3>
            <span className="dataset-id-badge">{datasetProfileLabel(candidate.dataset_index)}</span>
            <div className="candidate-tags">
              {clean(candidate.experience_years) && <span><BriefcaseBusiness size={13}/>{candidate.experience_years} yrs</span>}
              {clean(candidate.english_level) && <span><Languages size={13}/>English {candidate.english_level}</span>}
              {splitPipeValues(candidate.professional_domains).slice(0, 2).map((domain) => <span key={domain}>{domain}</span>)}
            </div>
          </div>
          <div className="relevance-block">
            <div className="relevance-label"><span>Query relevance</span><strong>{relevance}%</strong></div>
            <div className="relevance-track"><div style={{ width: `${relevance}%` }} /></div>
          </div>
        </div>

        {clean(candidate.looking_for) && <div className="looking-for"><span>Looking for</span>{candidate.looking_for}</div>}
        <p className="candidate-summary">{summary}</p>

        {note && <div className="candidate-note-preview"><StickyNote size={13}/><span>{note}</span></div>}

        <div className="candidate-actions">
          <button className="profile-link" onClick={(e) => { e.stopPropagation(); open(); }}>
            <FileText size={15}/> View full CV profile <ChevronRight size={16}/>
          </button>
          <button
            className={`secondary-action ${saved ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleSave(); }}
          >
            {saved ? <BookmarkCheck size={15}/> : <Bookmark size={15}/>} {saved ? 'Saved' : 'Save'}
          </button>
          <button
            className={`secondary-action ${comparing ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); toggleCompare(); }}
          >
            <Columns2 size={15}/> {comparing ? 'In comparison' : 'Compare'}
          </button>
          <button
            className={`secondary-action ${note ? 'note-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); editNote(); }}
          >
            <StickyNote size={15}/> {note ? 'Note added' : 'Add note'}
          </button>
        </div>
      </div>
    </article>
  );
}

function CompareModal({
  candidates,
  profiles,
  loading,
  error,
  notes,
  close,
  remove,
  clearAll,
  editNote,
}: {
  candidates: CandidateSummary[];
  profiles: ProfileCache;
  loading: boolean;
  error: string;
  notes: CandidateNotes;
  close: () => void;
  remove: (candidateId: string) => void;
  clearAll: () => void;
  editNote: (candidate: CandidateSummary) => void;
}) {
  return (
    <div className="modal-backdrop centered" onClick={close}>
      <section className="compare-modal compare-modal-expanded" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row compare-title-row">
          <div>
            <div className="eyebrow">Candidate comparison</div>
            <h2>Compare selected profiles</h2>
            <p className="compare-subtitle">Review the same profile fields side by side, including each full CV.</p>
          </div>
          <div className="compare-header-actions">
            <button className="clear-all-button" onClick={clearAll}><Eraser size={15}/> Clear comparison</button>
            <button className="icon-button" onClick={close} aria-label="Close comparison"><X size={20}/></button>
          </div>
        </div>

        {loading && <div className="comparison-loading"><div className="spinner small"/>Loading full candidate profiles…</div>}
        {error && <div className="profile-error comparison-error">{error}</div>}

        <div className="compare-scroll compare-scroll-expanded">
          <table className="compare-table compare-table-expanded">
            <thead>
              <tr>
                <th>Field</th>
                {candidates.map((candidate) => (
                  <th key={candidate.candidate_id}>
                    <div className="compare-candidate-heading">
                      <strong>{clean(candidate.position) || `Candidate ${candidate.rank}`}</strong>
                      <button onClick={() => remove(candidate.candidate_id)}><X size={13}/> Remove</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td>Dataset ID</td>{candidates.map((c) => <td key={c.candidate_id}>{c.dataset_index}</td>)}</tr>
              <tr><td>Query relevance</td>{candidates.map((c) => <td key={c.candidate_id}><strong className="compare-relevance">{rel(c)}%</strong></td>)}</tr>
              <tr><td>Experience</td>{candidates.map((c) => <td key={c.candidate_id}>{clean(c.experience_years) ? `${c.experience_years} years` : '—'}</td>)}</tr>
              <tr><td>English</td>{candidates.map((c) => <td key={c.candidate_id}>{clean(c.english_level) || '—'}</td>)}</tr>
              <tr><td>Professional domains</td>{candidates.map((c) => <td key={c.candidate_id}>{splitPipeValues(c.professional_domains).join(' · ') || '—'}</td>)}</tr>
              <tr><td>ESCO skills</td>{candidates.map((c) => <td key={c.candidate_id} className="compare-long-text">{splitPipeValues(profiles[c.candidate_id]?.esco_skills).join(' · ') || '—'}</td>)}</tr>
              <tr><td>Looking for</td>{candidates.map((c) => <td key={c.candidate_id}>{clean(c.looking_for) || '—'}</td>)}</tr>
              <tr><td>Highlights</td>{candidates.map((c) => <td key={c.candidate_id} className="compare-long-text">{clean(c.highlights) || clean(c.cv_snippet) || '—'}</td>)}</tr>
              <tr>
                <td>Recruiter note</td>
                {candidates.map((c) => (
                  <td key={c.candidate_id}>
                    <div className="compare-note-cell">
                      <span className={notes[c.candidate_id] ? '' : 'muted-copy'}>{notes[c.candidate_id] || 'No note added.'}</span>
                      <button onClick={() => editNote(c)}><StickyNote size={13}/> {notes[c.candidate_id] ? 'Edit' : 'Add note'}</button>
                    </div>
                  </td>
                ))}
              </tr>
              <tr className="full-profile-row">
                <td>Full CV profile</td>
                {candidates.map((c) => {
                  const profile = profiles[c.candidate_id];
                  const fullText = profile ? clean(profile.full_cv) || clean(profile.candidate_text) : '';
                  return (
                    <td key={c.candidate_id}>
                      <div className="compare-cv-box prewrap">
                        {fullText || (loading ? 'Loading full profile…' : 'Full profile unavailable.')}
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ShortlistPanel({
  shortlist,
  notes,
  close,
  remove,
  clearAll,
  openCandidate,
  editNote,
  exportCsv,
  exporting,
}: {
  shortlist: CandidateSummary[];
  notes: CandidateNotes;
  close: () => void;
  remove: (candidateId: string) => void;
  clearAll: () => void;
  openCandidate: (candidate: CandidateSummary) => void;
  editNote: (candidate: CandidateSummary) => void;
  exportCsv: () => void;
  exporting: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <aside className="shortlist-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <div><div className="eyebrow">Saved candidates</div><h2>Shortlist ({shortlist.length})</h2></div>
          <button className="icon-button" onClick={close} aria-label="Close shortlist"><X size={20}/></button>
        </div>

        {shortlist.length > 0 && (
          <div className="shortlist-toolbar">
            <button className="export-button" onClick={exportCsv} disabled={exporting}>
              <Download size={15}/> {exporting ? 'Preparing CSV…' : 'Export full shortlist CSV'}
            </button>
            <button className="clear-all-button danger-soft" onClick={clearAll}><Trash2 size={15}/> Clear shortlist</button>
          </div>
        )}

        {shortlist.length === 0 ? (
          <div className="shortlist-empty">Save candidate profiles to build your shortlist.</div>
        ) : (
          <div className="shortlist-list">
            {shortlist.map((candidate) => (
              <div className="shortlist-item shortlist-item-expanded" key={candidate.candidate_id}>
                <button className="shortlist-main" onClick={() => openCandidate(candidate)}>
                  <strong>{clean(candidate.position) || 'Candidate profile'}</strong>
                  <span>{datasetProfileLabel(candidate.dataset_index)} · {clean(candidate.experience_years) ? `${candidate.experience_years} yrs` : 'Experience —'} · {clean(candidate.english_level) || 'English —'} · {candidate.source_mode === 'advanced' ? `AI Match ${(candidate.advanced_match_score ?? candidate.display_relevance).toFixed(1)}/100` : `${rel(candidate)}% relevance`}</span>
                  {notes[candidate.candidate_id] && <em>{notes[candidate.candidate_id]}</em>}
                </button>
                <div className="shortlist-item-actions">
                  <button className={`icon-button ${notes[candidate.candidate_id] ? 'note-icon-active' : ''}`} onClick={() => editNote(candidate)} aria-label="Edit candidate note"><StickyNote size={16}/></button>
                  <button className="icon-button danger" onClick={() => remove(candidate.candidate_id)} aria-label="Remove from shortlist"><Trash2 size={16}/></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function RecruiterWorkspace() {
  const [searchMode, setSearchMode] = useState<'quick' | 'advanced'>('quick');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CandidateSummary | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileCache, setProfileCache] = useState<ProfileCache>({});
  const [filters, setFilters] = useState<ResultFilters>(EMPTY_FILTERS);
  const [shortlist, setShortlist] = useState<CandidateSummary[]>([]);
  const [shortlistOpen, setShortlistOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<CandidateSummary[]>([]);
  const [notes, setNotes] = useState<CandidateNotes>({});
  const [noteTarget, setNoteTarget] = useState<CandidateSummary | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);

  const debugMode = useMemo(() => new URLSearchParams(window.location.search).get('debug') === 'true', []);

  useEffect(() => {
    try {
      const storedShortlist = JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? '[]');
      if (Array.isArray(storedShortlist)) setShortlist(storedShortlist);

      const storedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      if (Array.isArray(storedHistory)) setSearchHistory(storedHistory);

      const storedRecentlyViewed = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? '[]');
      if (Array.isArray(storedRecentlyViewed)) setRecentlyViewed(storedRecentlyViewed);

      const storedNotes = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}');
      if (storedNotes && typeof storedNotes === 'object' && !Array.isArray(storedNotes)) setNotes(storedNotes);
    } catch {
      // Ignore invalid localStorage values and start clean.
    } finally {
      setWorkspaceLoaded(true);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist));
  }, [shortlist]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory));
  }, [searchHistory]);

  useEffect(() => {
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(recentlyViewed));
  }, [recentlyViewed]);

  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    const candidates = data?.candidates ?? [];
    if (candidates.length === 0) return;

    let cancelled = false;
    const missing = candidates.filter((candidate) => !profileCache[candidate.candidate_id]);
    if (missing.length === 0) return;

    Promise.allSettled(
      missing.map(async (candidate) => [candidate.candidate_id, await getCandidate(candidate.candidate_id)] as const),
    ).then((results) => {
      if (cancelled) return;
      const fetched: ProfileCache = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [candidateId, candidateProfile] = result.value;
          fetched[candidateId] = candidateProfile;
        }
      }
      if (Object.keys(fetched).length > 0) {
        setProfileCache((current) => ({ ...current, ...fetched }));
      }
    });

    return () => {
      cancelled = true;
    };
    // Prefetch only when a new result set arrives. Filtering itself remains fully local and instant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Filter choices are derived only from the candidates returned by the current query.
  // This keeps the sidebar relevant to the current result set instead of showing values from the full dataset.
  const englishOptions = useMemo(
    () => uniqueClean(data?.candidates.map((candidate) => candidate.english_level) ?? []),
    [data],
  );
  const domainOptions = useMemo(
    () => Array.from(new Set((data?.candidates ?? []).flatMap((candidate) => splitPipeValues(candidate.professional_domains)))).sort((a, b) => a.localeCompare(b)),
    [data],
  );

  const skillGroups = useMemo(() => {
    const candidates = data?.candidates ?? [];
    const detected = SKILL_LIBRARY.map((skill) => {
      const count = candidates.reduce((total, candidate) => (
        candidateHasSkill(candidate, profileCache[candidate.candidate_id], skill.label) ? total + 1 : total
      ), 0);
      return { ...skill, count };
    }).filter((skill) => skill.count > 0 || filters.skills.includes(skill.label));

    const categoryOrder: SkillDefinition['category'][] = [
      'Programming & development',
      'AI & data',
      'Cybersecurity',
      'Cloud & infrastructure',
      'Business & HR',
      'Legal & compliance',
      'Soft skills',
    ];

    return categoryOrder
      .map((category) => ({
        category,
        skills: detected
          .filter((skill) => skill.category === category)
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
      }))
      .filter((group) => group.skills.length > 0);
  }, [data, profileCache, filters.skills]);

  const filteredCandidates = useMemo(() => {
    if (!data) return [];

    const minExperience = filters.minExperience === '' ? null : Number(filters.minExperience);
    const maxExperience = filters.maxExperience === '' ? null : Number(filters.maxExperience);
    const profileKeywords = filters.profileKeywords
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    return data.candidates.filter((candidate) => {
      const experience = parseExperience(candidate.experience_years);

      if (minExperience !== null && (experience === null || experience < minExperience)) return false;
      if (maxExperience !== null && (experience === null || experience > maxExperience)) return false;

      if (filters.englishLevel && clean(candidate.english_level).toLowerCase() !== filters.englishLevel.toLowerCase()) {
        return false;
      }

      if (filters.professionalDomain) {
        const domains = splitPipeValues(candidate.professional_domains).map((value) => value.toLowerCase());
        if (!domains.includes(filters.professionalDomain.toLowerCase())) return false;
      }

      if (filters.skills.length > 0) {
        const cachedProfile = profileCache[candidate.candidate_id];
        if (!filters.skills.every((skill) => candidateHasSkill(candidate, cachedProfile, skill))) return false;
      }

      if (profileKeywords.length > 0) {
        const cachedProfile = profileCache[candidate.candidate_id];
        const searchableProfile = profileSearchText(candidate, cachedProfile);
        if (!profileKeywords.every((keyword) => searchableProfile.includes(keyword))) return false;
      }

      return true;
    });
  }, [data, filters, profileCache]);

  const candidateCatalog = useMemo(() => {
    const map = new Map<string, CandidateSummary>();
    for (const candidate of data?.candidates ?? []) map.set(candidate.candidate_id, candidate);
    for (const candidate of shortlist) if (!map.has(candidate.candidate_id)) map.set(candidate.candidate_id, candidate);
    for (const candidate of recentlyViewed) if (!map.has(candidate.candidate_id)) map.set(candidate.candidate_id, candidate);
    return map;
  }, [data, shortlist, recentlyViewed]);

  const compareCandidates = useMemo(
    () => compareIds.map((id) => candidateCatalog.get(id)).filter((candidate): candidate is CandidateSummary => Boolean(candidate)),
    [compareIds, candidateCatalog],
  );

  async function ensureProfiles(candidates: CandidateSummary[]) {
    const fetched: ProfileCache = {};
    const missing = candidates.filter((candidate) => !profileCache[candidate.candidate_id]);

    if (missing.length > 0) {
      const results = await Promise.allSettled(
        missing.map(async (candidate) => [candidate.candidate_id, await getCandidate(candidate.candidate_id)] as const),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const [candidateId, candidateProfile] = result.value;
          fetched[candidateId] = candidateProfile;
        }
      }

      if (Object.keys(fetched).length > 0) {
        setProfileCache((current) => ({ ...current, ...fetched }));
      }
    }

    return { ...profileCache, ...fetched };
  }

  async function runSearch(searchQuery: string, resetUiFilters = true) {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3 || loading) return;
    setQuery(trimmed);
    setLoading(true);
    setError('');
    setData(null);
    if (resetUiFilters) setFilters(EMPTY_FILTERS);
    setCompareIds([]);
    setCompareOpen(false);

    try {
      const result = await searchCandidates(trimmed);
      setData(result);
      setSearchHistory((current) => [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 6));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
  }

  function toggleSkillFilter(skill: string) {
    setFilters((current) => ({
      ...current,
      skills: current.skills.includes(skill)
        ? current.skills.filter((item) => item !== skill)
        : [...current.skills, skill],
    }));
  }

  async function openCandidate(candidate: CandidateSummary) {
    setRecentlyViewed((current) => [
      candidate,
      ...current.filter((item) => item.candidate_id !== candidate.candidate_id),
    ].slice(0, 8));

    setSelected(candidate);
    setProfile(null);
    setProfileError('');

    const cached = profileCache[candidate.candidate_id];
    if (cached) {
      setProfile(cached);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    try {
      const loadedProfile = await getCandidate(candidate.candidate_id);
      setProfile(loadedProfile);
      setProfileCache((current) => ({ ...current, [candidate.candidate_id]: loadedProfile }));
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not load profile');
    } finally {
      setProfileLoading(false);
    }
  }

  function toggleShortlist(candidate: CandidateSummary) {
    setShortlist((current) =>
      current.some((item) => item.candidate_id === candidate.candidate_id)
        ? current.filter((item) => item.candidate_id !== candidate.candidate_id)
        : [...current, { ...candidate, source_mode: candidate.source_mode ?? 'quick' }],
    );
  }

  function saveAdvancedCandidate(candidate: AdvancedMatchedCandidate) {
    const mapped = advancedToCandidateSummary(candidate);
    setShortlist((current) => {
      const existing = current.find((item) => item.candidate_id === mapped.candidate_id);
      if (!existing) return [...current, mapped];
      return current.map((item) => item.candidate_id === mapped.candidate_id ? { ...item, ...mapped } : item);
    });
  }

  function removeFromShortlist(candidateId: string) {
    setShortlist((current) => current.filter((item) => item.candidate_id !== candidateId));
  }

  function toggleCompare(candidateId: string) {
    setCompareIds((current) => {
      if (current.includes(candidateId)) return current.filter((id) => id !== candidateId);
      if (current.length >= 3) return current;
      return [...current, candidateId];
    });
  }

  function removeFromComparison(candidateId: string) {
    const next = compareIds.filter((id) => id !== candidateId);
    setCompareIds(next);
    if (next.length < 2) setCompareOpen(false);
  }

  function clearComparison() {
    setCompareIds([]);
    setCompareOpen(false);
    setCompareError('');
  }

  function clearShortlist() {
    if (shortlist.length === 0) return;
    if (!window.confirm('Clear all saved candidates from the shortlist?')) return;
    setShortlist([]);
  }

  function saveCandidateNote(candidateId: string, value: string) {
    setNotes((current) => {
      const next = { ...current };
      if (value) next[candidateId] = value;
      else delete next[candidateId];
      return next;
    });
  }

  function deleteCandidateNote(candidateId: string) {
    setNotes((current) => {
      const next = { ...current };
      delete next[candidateId];
      return next;
    });
  }

  async function openComparison() {
    if (compareCandidates.length < 2) return;
    setCompareOpen(true);
    setCompareLoading(true);
    setCompareError('');
    try {
      const available = await ensureProfiles(compareCandidates);
      const unavailable = compareCandidates.filter((candidate) => !available[candidate.candidate_id]);
      if (unavailable.length > 0) {
        setCompareError(`Could not load the full profile for ${unavailable.length} selected candidate${unavailable.length === 1 ? '' : 's'}.`);
      }
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Could not load comparison profiles');
    } finally {
      setCompareLoading(false);
    }
  }

  async function exportShortlistCsv() {
    if (shortlist.length === 0 || exportingCsv) return;
    setExportingCsv(true);

    try {
      const profiles = await ensureProfiles(shortlist);
      const header = [
        'candidate_id',
        'dataset_index',
        'saved_from',
        'position',
        'experience_years',
        'english_level',
        'professional_domains',
        'esco_skills',
        'looking_for',
        'highlights',
        'full_cv',
        'candidate_text',
        'query_relevance',
        'advanced_ai_match_score',
        'recruiter_note',
      ];

      const rows = shortlist.map((candidate) => {
        const candidateProfile = profiles[candidate.candidate_id];
        const sourceMode = candidate.source_mode ?? 'quick';
        return [
          candidate.candidate_id,
          candidate.dataset_index,
          sourceMode,
          candidate.position,
          candidate.experience_years,
          candidate.english_level,
          candidateProfile?.professional_domains ?? candidate.professional_domains,
          candidateProfile?.esco_skills ?? '',
          candidate.looking_for,
          candidate.highlights,
          candidateProfile?.full_cv ?? '',
          candidateProfile?.candidate_text ?? '',
          sourceMode === 'quick' ? `${rel(candidate)}%` : '',
          sourceMode === 'advanced' ? (candidate.advanced_match_score ?? candidate.display_relevance).toFixed(1) : '',
          notes[candidate.candidate_id] ?? '',
        ];
      });

      const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ariadne_shortlist_full_profiles.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExportingCsv(false);
    }
  }

  function clearSearch() {
    setQuery('');
    setData(null);
    setError('');
    setFilters(EMPTY_FILTERS);
    setCompareIds([]);
    setCompareOpen(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    await runSearch(query);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">A</div><div><strong>ARIADNE</strong><span>Local candidate matching</span></div></div>
        <div className="topbar-actions">
          <div className="mode-switch" aria-label="Candidate matching mode">
            <button className={searchMode === 'quick' ? 'active' : ''} onClick={() => setSearchMode('quick')}><Search size={14}/> Quick Search</button>
            <button className={searchMode === 'advanced' ? 'active' : ''} onClick={() => setSearchMode('advanced')}><SlidersHorizontal size={14}/> Advanced Match</button>
          </div>
          <button className="shortlist-top-button" onClick={() => setShortlistOpen(true)}>
            <Bookmark size={15}/> Shortlist ({shortlist.length})
          </button>
          <div className="local-badge"><ShieldCheck size={15}/> Local processing</div>
        </div>
      </header>

      {searchMode === 'quick' ? (
        <>
      <section className="search-hero">
        <div className="hero-content">
          <div className="eyebrow"><Sparkles size={14}/> AI-Assisted Candidate Retrieval & CV Matching Engine</div>
          <h1>Describe the profile you need and find the most relevant candidates</h1>
          <p>ARIADNE searches the candidate database and helps identify the profiles most relevant to your query.</p>

          <form className="search-box" onSubmit={submit}>
            <Search size={21}/>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void runSearch(query);
                }
              }}
              placeholder="e.g. Cybersecurity analyst with SIEM, incident response and 3+ years of experience..."
              rows={2}
            />
            {query && <button type="button" className="clear-query-button" onClick={clearSearch} aria-label="Clear search"><X size={17}/></button>}
            <button className="search-submit" disabled={loading}>{loading ? 'Matching…' : 'Find candidates'}</button>
          </form>

          <div className="example-row"><span>Try:</span>{EXAMPLES.map((example, i) => <button key={example} onClick={() => runSearch(example)} disabled={loading}>Example {i + 1}</button>)}</div>
        </div>
      </section>

      <section className="results-shell">
        {loading && <div className="state-card"><div className="spinner"/><h2>Matching candidates…</h2></div>}
        {error && <div className="state-card error"><h2>Search could not complete</h2><p>{error}</p></div>}

        {data && (
          <div className="results-layout">
            <aside className="filter-sidebar">
              <div className="sidebar-heading"><SlidersHorizontal size={16}/><strong>Refine results</strong></div>
              <p className="sidebar-note">Use optional filters to narrow the current results instantly.</p>

              <div className="filter-group">
                <label>Years of experience</label>
                <div className="range-inputs">
                  <input type="number" min="0" placeholder="Min" value={filters.minExperience} onChange={(e) => setFilters({ ...filters, minExperience: e.target.value })}/>
                  <span>to</span>
                  <input type="number" min="0" placeholder="Max" value={filters.maxExperience} onChange={(e) => setFilters({ ...filters, maxExperience: e.target.value })}/>
                </div>
              </div>

              <div className="filter-group">
                <label>English level</label>
                <select value={filters.englishLevel} onChange={(e) => setFilters({ ...filters, englishLevel: e.target.value })}>
                  <option value="">Any level</option>
                  {englishOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <label>Professional domain</label>
                <select value={filters.professionalDomain} onChange={(e) => setFilters({ ...filters, professionalDomain: e.target.value })}>
                  <option value="">Any domain</option>
                  {domainOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <label>Skills</label>
                {skillGroups.length > 0 ? (
                  <details className="skills-picker">
                    <summary>
                      <span>{filters.skills.length === 0 ? 'Any detected skill' : `${filters.skills.length} skill${filters.skills.length === 1 ? '' : 's'} selected`}</span>
                      <span className="skills-picker-count">{skillGroups.reduce((total, group) => total + group.skills.length, 0)}</span>
                    </summary>
                    <div className="skills-picker-menu">
                      {skillGroups.map((group) => (
                        <div className="skill-category" key={group.category}>
                          <div className="skill-category-title">{group.category}</div>
                          {group.skills.map((skill) => (
                            <label className="skill-option" key={skill.label}>
                              <input
                                type="checkbox"
                                checked={filters.skills.includes(skill.label)}
                                onChange={() => toggleSkillFilter(skill.label)}
                              />
                              <span>{skill.label}</span>
                              <small>{skill.count}</small>
                            </label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : (
                  <div className="skills-empty">Detecting skills from the current results…</div>
                )}

                {filters.skills.length > 0 && (
                  <div className="selected-skill-chips">
                    {filters.skills.map((skill) => (
                      <button key={skill} type="button" onClick={() => toggleSkillFilter(skill)}>
                        {skill}<X size={11}/>
                      </button>
                    ))}
                  </div>
                )}
                <p className="filter-helper">Only skills detected in the current query results are shown. Selecting multiple skills requires all of them to appear in the profile.</p>
              </div>

              <div className="filter-group">
                <label>Profile keywords</label>
                <input
                  placeholder="e.g. Python, NLP, PyTorch"
                  value={filters.profileKeywords}
                  onChange={(e) => setFilters({ ...filters, profileKeywords: e.target.value })}
                />
                <p className="filter-helper">Separate multiple keywords with commas. All keywords must appear in the candidate profile. Results update instantly.</p>
              </div>

              <button className="reset-button" onClick={resetFilters}><RotateCcw size={14}/> Reset filters</button>

              {searchHistory.length > 0 && (
                <div className="history-section">
                  <div className="sidebar-heading"><History size={15}/><strong>Recent searches</strong></div>
                  <div className="history-list">
                    {searchHistory.map((item) => <button key={item} onClick={() => runSearch(item)} title={item}>{item}</button>)}
                  </div>
                </div>
              )}

              {recentlyViewed.length > 0 && (
                <div className="history-section recently-viewed-section">
                  <div className="sidebar-heading sidebar-heading-between">
                    <div><Eye size={15}/><strong>Recently viewed</strong></div>
                    <button className="mini-clear-button" onClick={() => setRecentlyViewed([])}>Clear</button>
                  </div>
                  <div className="recently-viewed-list">
                    {recentlyViewed.slice(0, 6).map((candidate) => (
                      <button key={candidate.candidate_id} onClick={() => openCandidate(candidate)} title={candidate.position}>
                        <strong>{clean(candidate.position) || 'Candidate profile'}</strong>
                        <span>{clean(candidate.experience_years) ? `${candidate.experience_years} yrs` : 'Experience —'} · {clean(candidate.english_level) || 'English —'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            <div className="results-main">
              <div className="results-header simple">
                <div>
                  <div className="eyebrow">Relevant candidates</div>
                  <h2>{filteredCandidates.length} relevant candidate{filteredCandidates.length === 1 ? '' : 's'}</h2>
                  <p className="query-caption">for “{data.query}”</p>
                </div>
                {compareIds.length > 0 && (
                  <div className="results-compare-actions">
                    <button className="clear-selection-button" onClick={clearComparison}><Eraser size={15}/> Clear selection ({compareIds.length})</button>
                    {compareIds.length >= 2 && (
                      <button className="compare-button" onClick={openComparison}><Columns2 size={16}/> Compare selected ({compareIds.length})</button>
                    )}
                  </div>
                )}
              </div>

              <div className="relevance-note">
                <strong>Disclaimer:</strong> Relevance percentages reflect the system’s assessment for the current search. They support candidate discovery only and do not represent job suitability, hiring recommendations, or automated recruitment decisions. Final decisions remain subject to human review by the responsible employer or recruiter.
              </div>

              {filteredCandidates.length > 0 ? (
                <div className="candidate-list">
                  {filteredCandidates.map((candidate) => (
                    <CandidateCard
                      key={candidate.candidate_id}
                      candidate={candidate}
                      open={() => openCandidate(candidate)}
                      saved={shortlist.some((item) => item.candidate_id === candidate.candidate_id)}
                      comparing={compareIds.includes(candidate.candidate_id)}
                      note={notes[candidate.candidate_id] ?? ''}
                      toggleSave={() => toggleShortlist(candidate)}
                      toggleCompare={() => toggleCompare(candidate.candidate_id)}
                      editNote={() => setNoteTarget(candidate)}
                    />
                  ))}
                </div>
              ) : (
                <div className="no-filter-results"><h3>No candidates match these filters.</h3><p>Reset or relax the filters to see more of the retrieved candidates.</p></div>
              )}

              {debugMode && (
                <details className="system-details">
                  <summary><Clock3 size={16}/> Research / debug diagnostics</summary>
                  <div className="timing-grid">
                    <div><span>BM25Plus</span><strong>{data.timings.bm25_ms.toFixed(0)} ms</strong></div>
                    <div><span>Jina-v5</span><strong>{data.timings.jina_ms.toFixed(0)} ms</strong></div>
                    <div><span>RRF</span><strong>{data.timings.rrf_ms.toFixed(0)} ms</strong></div>
                    <div><span>Jina Tiny</span><strong>{(data.timings.reranker_ms / 1000).toFixed(2)} s</strong></div>
                    <div><span>Adaptive-k</span><strong>{data.timings.adaptive_ms.toFixed(2)} ms</strong></div>
                  </div>
                  <p className="diagnostic-copy"><Cpu size={13}/> Pool {data.reranked_pool}; largest score gap after rank {data.adaptive_k}; +{data.buffer} safety buffer.</p>
                </details>
              )}
            </div>
          </div>
        )}

        {!loading && !data && !error && (
          <div className="empty-state">
            <Search size={30}/><h2>Start with a recruitment query</h2><p>Candidate profiles matching your search will appear here.</p>
            {searchHistory.length > 0 && (
              <div className="empty-history">
                <span>Recent searches</span>
                {searchHistory.slice(0, 3).map((item) => <button key={item} onClick={() => runSearch(item)}>{item}</button>)}
              </div>
            )}
            {recentlyViewed.length > 0 && (
              <div className="empty-recently-viewed">
                <div className="empty-recently-title"><Eye size={15}/><span>Recently viewed profiles</span></div>
                <div className="empty-recently-grid">
                  {recentlyViewed.slice(0, 4).map((candidate) => (
                    <button key={candidate.candidate_id} onClick={() => openCandidate(candidate)}>
                      <strong>{clean(candidate.position) || 'Candidate profile'}</strong>
                      <span>{clean(candidate.experience_years) ? `${candidate.experience_years} yrs` : 'Experience —'} · {clean(candidate.english_level) || 'English —'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
        </>
      ) : (
        <>
          <section className="search-hero advanced-hero">
            <div className="hero-content">
              <div className="eyebrow"><Sparkles size={14}/> Recruiter-controlled multi-stage matching</div>
              <h1>Advanced candidate matching with criteria, weights and AI scoring</h1>
              <p>Refine the candidate pool through eligibility screening, define your own weighted criteria, and use an LLM to assess and rank the strongest matching profiles with supporting evidence.</p>
              <div className="advanced-hero-note"><ShieldCheck size={15}/> Eligibility screening • Recruiter-defined criteria & weights • Evidence-based AI scoring & ranking</div>
            </div>
          </section>
          <AdvancedMatch
            sharedShortlist={shortlist}
            sharedWorkspaceLoaded={workspaceLoaded}
            saveToSharedShortlist={saveAdvancedCandidate}
            removeFromSharedShortlist={removeFromShortlist}
            notes={notes}
            editNote={(candidate) => setNoteTarget(advancedToCandidateSummary(candidate))}
          />
        </>
      )}

      {selected && (
        <ProfilePanel
          summary={selected}
          profile={profile}
          loading={profileLoading}
          error={profileError}
          query={data?.query ?? query}
          note={notes[selected.candidate_id] ?? ''}
          editNote={() => setNoteTarget(selected)}
          close={() => { setSelected(null); setProfile(null); }}
        />
      )}

      {shortlistOpen && (
        <ShortlistPanel
          shortlist={shortlist}
          notes={notes}
          close={() => setShortlistOpen(false)}
          remove={(candidateId) => setShortlist((current) => current.filter((item) => item.candidate_id !== candidateId))}
          clearAll={clearShortlist}
          openCandidate={(candidate) => { setShortlistOpen(false); openCandidate(candidate); }}
          editNote={(candidate) => setNoteTarget(candidate)}
          exportCsv={exportShortlistCsv}
          exporting={exportingCsv}
        />
      )}

      {compareOpen && compareCandidates.length >= 2 && (
        <CompareModal
          candidates={compareCandidates}
          profiles={profileCache}
          loading={compareLoading}
          error={compareError}
          notes={notes}
          close={() => setCompareOpen(false)}
          remove={removeFromComparison}
          clearAll={clearComparison}
          editNote={(candidate) => setNoteTarget(candidate)}
        />
      )}

      {noteTarget && (
        <NoteModal
          candidate={noteTarget}
          initialNote={notes[noteTarget.candidate_id] ?? ''}
          close={() => setNoteTarget(null)}
          saveNote={(value) => saveCandidateNote(noteTarget.candidate_id, value)}
          deleteNote={() => deleteCandidateNote(noteTarget.candidate_id)}
        />
      )}
    </main>
  );
}


export default function App() {
  const [authenticated, setAuthenticated] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'reset') {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      params.delete('auth');
      const query = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
      return false;
    }
    return sessionStorage.getItem(AUTH_SESSION_KEY) === 'active';
  });

  return authenticated
    ? <RecruiterWorkspace />
    : <EmployerAuthPage onAuthenticated={() => setAuthenticated(true)} />;
}
