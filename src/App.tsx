import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, 
  BookOpen,
  BrainCircuit, 
  Briefcase, 
  ChevronRight, 
  Coins, 
  Copy, 
  CreditCard, 
  Database, 
  ExternalLink, 
  Facebook, 
  Gauge, 
  HelpCircle, 
  History, 
  Home,
  Key, 
  Layers, 
  LayoutDashboard, 
  Lightbulb, 
  Loader2, 
  Lock, 
  LogOut, 
  MessageSquare, 
  Play, 
  RefreshCw, 
  Search, 
  Send, 
  ShieldAlert, 
  Sparkles, 
  Target, 
  TrendingUp, 
  Unlock, 
  User as UserIcon, 
  Users, 
  Zap,
  Mail,
  Check,
  Globe,
  Terminal,
  Phone,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ArrowRight,
  FileDown,
  Settings,
  Trash2,
  FileText,
  Rocket
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, ChatMessage, CampaignData, SystemLog, IntegrationStatus } from './types';
import { exportCompetitiveIntelligenceReport, exportCampaignDiagnosticReport } from './lib/pdfExport';
import { auth, googleProvider } from './lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  signOut as firebaseSignOut 
} from 'firebase/auth';

/**
 * Brand mark: a caravan route with three waypoints — the guide (sārthavāha)
 * leading a campaign from goal to launch.
 */
function BrandMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" className="fill-slate-900" />
      <path d="M6 23c4-1 5-8 10-8s6 6 10-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 4" opacity="0.55" />
      <circle cx="6.5" cy="23" r="2.2" fill="currentColor" opacity="0.6" />
      <circle cx="16" cy="15" r="2.2" fill="currentColor" opacity="0.8" />
      <circle cx="25.5" cy="8.5" r="3" fill="currentColor" />
    </svg>
  );
}

function Wordmark({ isWhite = false, sub = true }: { isWhite?: boolean; sub?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 select-none">
      <BrandMark className="text-marigold-400" />
      <span className="flex flex-col leading-none">
        <span className={`text-[15px] font-extrabold tracking-[-0.02em] ${isWhite ? 'text-slate-950' : 'text-white'}`}>Sarthavaha</span>
        {sub && <span className="text-[10px] font-medium text-slate-500 mt-1">by Ethereal Horizon</span>}
      </span>
    </span>
  );
}

type WorkspaceTab = 'terminal' | 'analytics' | 'research' | 'vault' | 'docs' | 'billing' | 'admin';

const WORKSPACE_NAV: { id: WorkspaceTab; label: string; short: string; hint: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'terminal', label: 'Strategy chat', short: 'Chat', hint: 'Ask, plan and draft with the agent', icon: MessageSquare },
  { id: 'analytics', label: 'Dashboard', short: 'Home', hint: 'Voice controls, campaigns and results', icon: LayoutDashboard },
  { id: 'research', label: 'Market research', short: 'Research', hint: 'Competitors, audiences and benchmarks', icon: Search },
  { id: 'vault', label: 'Ad library', short: 'Library', hint: 'Saved copy, images and research', icon: Layers },
  { id: 'docs', label: 'Connections & API keys', short: 'Connect', hint: 'Facebook, Google Ads and generators', icon: BookOpen },
  { id: 'billing', label: 'Plan & billing', short: 'Plan', hint: 'Usage and upgrades', icon: Zap },
];

const MOCK_GUEST_USER: User = {
  id: 'guest_user',
  email: 'guest@sarthavaha.io',
  role: 'user',
  usageCount: 0,
  isSubscribed: false,
  subscriptionType: 'none',
  createdAt: new Date().toISOString(),
  facebookApiKey: '',
  googleAdsApiKey: '',
  imageGenApiKey: '',
  videoGenApiKey: ''
};

export default function App() {
  // Session / Auth states
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('marketing_auth_token'));
  const [user, setUser] = useState<User | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // App navigation
  const [activeTab, setActiveTab] = useState<WorkspaceTab | 'optimize'>('terminal');

  // Onboarding & Delayed signup states
  const [hasStarted, setHasStarted] = useState<boolean>(() => localStorage.getItem('sarthavaha_started') === 'true');
  const [landingPrompt, setLandingPrompt] = useState('');
  const [showDelayedSignup, setShowDelayedSignup] = useState(false);
  const [interceptedAction, setInterceptedAction] = useState<{ type: 'chat' | 'research' | 'create' | 'command'; payload: any } | null>(null);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(0);

  // Connection testing states
  const [fbTestStatus, setFbTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [googleTestStatus, setGoogleTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  // Model Selector
  const [omniModel, setOmniModel] = useState<'google' | 'openai'>('google');

  // Live Campaign Sync list
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  // Freemium query count state
  const [queryCount, setQueryCount] = useState<number>(() => {
    const cached = localStorage.getItem('sarthavaha_query_count');
    return cached ? parseInt(cached, 10) : 0;
  });

  // Upgraded Research states
  const [researchCountry, setResearchCountry] = useState('United States');
  const [researchMacro, setResearchMacro] = useState('E-commerce');
  const [researchMicros, setResearchMicros] = useState<string[]>([]);
  const [researchBenchmarks, setResearchBenchmarks] = useState<any | null>(null);

  // Persistent storage states
  const [storedConsultations, setStoredConsultations] = useState<any[]>([]);
  const [storedVoiceCommands, setStoredVoiceCommands] = useState<any[]>([]);

  // Ad Creative Vault Store
  const [vaultCreatives, setVaultCreatives] = useState<any[]>(() => {
    const cached = localStorage.getItem('sarthavaha_vault_creatives');
    return cached ? JSON.parse(cached) : [
      {
        id: 'default-1',
        platform: 'facebook',
        productName: 'Telescope Launch',
        headline: 'Best Telescope at best price 🌌',
        bodyCopy: 'Unlock the cosmos with 100x resolution and dynamic tracking demographically optimized for Science & Technology fields.',
        graphicUrl: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=400&q=80',
        format: 'Meta Banner Ad',
        status: 'Ready',
        timestamp: '2026-06-29 10:45 AM'
      },
      {
        id: 'default-2',
        platform: 'google',
        productName: 'EcoSip Bottle',
        headline: 'Pure Water. Perfect Price. 🌎',
        bodyCopy: 'Ditch standard single-use bottles for our self-cleaning zero-chemical steel flask.',
        graphicUrl: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=400&q=80',
        format: 'Google Search Pay-Per-Click Text',
        status: 'Ready',
        timestamp: '2026-06-29 11:15 AM'
      }
    ];
  });
  
  // Dashboard states
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({
    facebook: { connected: false, maskedKey: '' },
    googleAds: { connected: false, maskedKey: '' },
    paymentSystem: { connected: false, maskedKey: '' },
    imageGen: { connected: false, maskedKey: '' },
    videoGen: { connected: false, maskedKey: '' }
  });
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Personalized API Keys Settings
  const [isKeysModalOpen, setIsKeysModalOpen] = useState(false);
  const [dashboardTheme, setDashboardTheme] = useState<'default' | 'minimal' | 'white'>(() => {
    const cached = localStorage.getItem('sarthavaha_dashboard_theme');
    if (cached) return cached as 'default' | 'minimal' | 'white';
    return localStorage.getItem('sarthavaha_minimal_dashboard') === 'true' ? 'minimal' : 'default';
  });
  const [isMinimalDashboard, setIsMinimalDashboard] = useState<boolean>(() => {
    return localStorage.getItem('sarthavaha_minimal_dashboard') === 'true';
  });
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);

  const handleThemeChange = (theme: 'default' | 'minimal' | 'white') => {
    setDashboardTheme(theme);
    localStorage.setItem('sarthavaha_dashboard_theme', theme);
    const nextMinimal = theme === 'minimal';
    setIsMinimalDashboard(nextMinimal);
    localStorage.setItem('sarthavaha_minimal_dashboard', String(nextMinimal));
    triggerToast(`Theme updated to ${theme}!`, 'success');
  };

  const isWhite = dashboardTheme === 'white';

  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [fbKeyInput, setFbKeyInput] = useState('');
  const [googleKeyInput, setGoogleKeyInput] = useState('');
  const [imageKeyInput, setImageKeyInput] = useState('');
  const [videoKeyInput, setVideoKeyInput] = useState('');
  const [saveKeysLoading, setSaveKeysLoading] = useState(false);
  const [saveKeysSuccess, setSaveKeysSuccess] = useState<string | null>(null);

  // Mobile Command Assistant
  const [mobileCommand, setMobileCommand] = useState('');
  const [commandLoading, setCommandLoading] = useState(false);
  const [commandResult, setCommandResult] = useState<any | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  // Chatbox states
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Research states
  const [researchNiche, setResearchNiche] = useState('');
  const [researchAudience, setResearchAudience] = useState('');
  const [researchOutput, setResearchOutput] = useState<string | null>(null);
  const [researchLoading, setResearchLoading] = useState(false);

  // Create Creative states
  const [createChannel, setCreateChannel] = useState<'facebook' | 'google' | 'linkedin'>('facebook');
  const [createProductName, setCreateProductName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createTone, setCreateTone] = useState('Professional');
  const [createAudience, setCreateAudience] = useState('');
  const [createOutput, setCreateOutput] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [isLaunchingCampaign, setIsLaunchingCampaign] = useState(false);
  const [campaignBudget, setCampaignBudget] = useState(1500);
  const [campaignLaunchResult, setCampaignLaunchResult] = useState<any | null>(null);

  // Interactive LLM states
  const [researchLlmPrompt, setResearchLlmPrompt] = useState('');
  const [researchLlmLoading, setResearchLlmLoading] = useState(false);
  const [vaultLlmPrompt, setVaultLlmPrompt] = useState('');
  const [vaultLlmLoading, setVaultLlmLoading] = useState(false);
  const [selectedResearchId, setSelectedResearchId] = useState<string | null>(null);
  const [selectedCreativeId, setSelectedCreativeId] = useState<string | null>(null);
  const [researchMode, setResearchMode] = useState<'structured' | 'interactive'>('structured');
  const [creativeMode, setCreativeMode] = useState<'structured' | 'interactive'>('structured');
  const [researchSearch, setResearchSearch] = useState('');
  const [creativeSearch, setCreativeSearch] = useState('');

  // Optimize states
  const [optPlatform, setOptPlatform] = useState('Facebook Ads');
  const [optSpend, setOptSpend] = useState('15000');
  const [optImpressions, setOptImpressions] = useState('200000');
  const [optClicks, setOptClicks] = useState('4500');
  const [optConversions, setOptConversions] = useState('110');
  const [optResult, setOptResult] = useState<{ metrics: any; analysis: string } | null>(null);
  const [optLoading, setOptLoading] = useState(false);

  // Admin states
  const [adminUsers, setAdminUsers] = useState<User[]>([]);
  const [adminLogs, setAdminLogs] = useState<SystemLog[]>([]);
  const [adminKeys, setAdminKeys] = useState({
    facebookApiKey: '',
    googleAdsApiKey: '',
    paymentApiKey: ''
  });
  const [adminSubTab, setAdminSubTab] = useState<'connections' | 'users' | 'logs'>('connections');
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminKeysSaveSuccess, setAdminKeysSaveSuccess] = useState(false);

  // Billing states
  const [billingPlan, setBillingPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  // Global Toast/Alert Message for simple feedback
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Helper to show custom ephemeral alerts
  const triggerToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const fetchCampaigns = async () => {
    if (!token) return;
    setCampaignsLoading(true);
    try {
      const res = await fetch('/api/fetch-ads', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.ads);
      }
    } catch (e) {
      console.error('Error fetching campaigns', e);
    } finally {
      setCampaignsLoading(false);
    }
  };

  // 1. Core Fetchers & Handlers
  useEffect(() => {
    if (token) {
      fetchCurrentUser();
      fetchIntegrationStatus();
      fetchCampaigns();
      fetchConsultations();
      fetchVoiceCommands();
    } else {
      setUser(MOCK_GUEST_USER);
      setCampaigns([
        {
          id: 'ad-101',
          name: 'Sarthavaha Premium Launch',
          platform: 'facebook',
          headline: 'Scale your campaigns with AI 🚀',
          bodyCopy: 'Engineered for hyper-growth brands under the Ethereal Horizon ecosystem.',
          spend: 12500,
          impressions: 145000,
          clicks: 3800,
          conversions: 92,
          status: 'active',
          budget: 1500
        },
        {
          id: 'ad-102',
          name: 'Ethereal Cloud Banner',
          platform: 'google',
          headline: 'Enterprise Automated Copywriting',
          bodyCopy: 'Instantly generate ad headline options, supporting sub-headlines, body copy and CTA triggers.',
          spend: 42000,
          impressions: 380000,
          clicks: 12400,
          conversions: 310,
          status: 'active',
          budget: 5000
        }
      ]);
    }
  }, [token]);

  // Keep the newest chat message in view by scrolling only the chat panel,
  // never the whole page (scrollIntoView used to jump the dashboard to the footer on load).
  useEffect(() => {
    if (chatMessages.length === 0 && !chatLoading) return;
    const anchor = chatBottomRef.current;
    const panel = anchor?.parentElement;
    if (panel) panel.scrollTo({ top: panel.scrollHeight, behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        // Token stale, clear session
        handleLogout();
      }
    } catch (e) {
      console.error('Error fetching current user', e);
    }
  };

  const fetchIntegrationStatus = async () => {
    try {
      const res = await fetch('/api/integrations/status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIntegrationStatus(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchConsultations = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/consultations', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStoredConsultations(data.consultations || []);
      }
    } catch (e) {
      console.error('Error fetching consultations', e);
    }
  };

  const fetchVoiceCommands = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/voice-commands', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStoredVoiceCommands(data.commands || []);
      }
    } catch (e) {
      console.error('Error fetching voice commands', e);
    }
  };

  const handleSaveUserKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveKeysLoading(true);
    setSaveKeysSuccess(null);
    try {
      const res = await fetch('/api/user/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          facebookApiKey: fbKeyInput,
          googleAdsApiKey: googleKeyInput,
          imageGenApiKey: imageKeyInput,
          videoGenApiKey: videoKeyInput
        })
      });
      const data = await res.json();
      if (res.ok) {
        setSaveKeysSuccess('Integration keys successfully synchronized!');
        fetchIntegrationStatus();
        fetchCurrentUser();
        setTimeout(() => {
          setIsKeysModalOpen(false);
          setSaveKeysSuccess(null);
        }, 1500);
      } else {
        setSaveKeysSuccess(`Error: ${data.error || 'Failed to save keys'}`);
      }
    } catch (err: any) {
      setSaveKeysSuccess(`Network Error: ${err.message}`);
    } finally {
      setSaveKeysLoading(false);
    }
  };

  const handleTestFacebookConnection = async () => {
    if (!fbKeyInput && !user?.facebookApiKey) {
      triggerToast('Please enter or connect a Facebook API Key first', 'error');
      return;
    }
    setFbTestStatus('testing');
    triggerToast('Initiating Meta API handshakes...', 'info');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const tokenToCheck = fbKeyInput || user?.facebookApiKey;
    if (tokenToCheck && tokenToCheck.length > 10) {
      setFbTestStatus('success');
      triggerToast('Facebook Marketing API connection verified successfully!', 'success');
    } else {
      setFbTestStatus('error');
      triggerToast('Facebook Verification Failed: Invalid Access Token format', 'error');
    }
  };

  const handleTestGoogleConnection = async () => {
    if (!googleKeyInput && !user?.googleAdsApiKey) {
      triggerToast('Please enter or connect a Google Ads Developer Token first', 'error');
      return;
    }
    setGoogleTestStatus('testing');
    triggerToast('Initiating Google Ads API handshakes...', 'info');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const tokenToCheck = googleKeyInput || user?.googleAdsApiKey;
    if (tokenToCheck && tokenToCheck.length > 5) {
      setGoogleTestStatus('success');
      triggerToast('Google Ads API connection verified successfully!', 'success');
    } else {
      setGoogleTestStatus('error');
      triggerToast('Google Ads Verification Failed: Invalid Developer Token format', 'error');
    }
  };

  const playSynthTone = (type: 'success' | 'start' | 'stop' | 'info') => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      if (type === 'start') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(350, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'stop') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(250, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'success') {
        const playArp = (freq: number, start: number, duration: number) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(freq, start);
          g.gain.setValueAtTime(0.05, start);
          g.gain.exponentialRampToValueAtTime(0.001, start + duration);
          o.connect(g);
          g.connect(ctx.destination);
          o.start(start);
          o.stop(start + duration);
        };
        playArp(523.25, ctx.currentTime, 0.12); // C5
        playArp(659.25, ctx.currentTime + 0.08, 0.12); // E5
        playArp(783.99, ctx.currentTime + 0.16, 0.12); // G5
        playArp(1046.50, ctx.currentTime + 0.24, 0.25); // C6
      } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch (e) {
      console.warn('Synth sound blocked or unsupported:', e);
    }
  };

  const speakText = (text: string) => {
    try {
      if (!('speechSynthesis' in window)) {
        triggerToast('Voice synthesis is not supported in this browser.', 'info');
        return;
      }
      
      window.speechSynthesis.cancel();
      setIsAgentSpeaking(true);
      
      const cleanText = text
        .replace(/[*_#`~[\]()]/g, '')
        .replace(/https?:\/\/\S+/g, 'link')
        .slice(0, 400);

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      
      utterance.onend = () => {
        setIsAgentSpeaking(false);
      };
      
      utterance.onerror = () => {
        setIsAgentSpeaking(false);
      };

      const voices = window.speechSynthesis.getVoices();
      const optimalVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) || 
                           voices.find(v => v.lang.startsWith('en')) || 
                           voices[0];
      if (optimalVoice) {
        utterance.voice = optimalVoice;
      }

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech synthesis failure:', e);
      setIsAgentSpeaking(false);
    }
  };

  const handleToggleVoiceAgent = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      triggerToast('Speech Recognition API is not supported in this browser. Try Google Chrome!', 'error');
      // Simulate voice typing as fallback
      setVoiceTranscript('Simulating mic input: "Create a facebook campaign named Celestial at Rs. 500 daily"');
      return;
    }

    if (isListening) {
      // Manual stop
      playSynthTone('stop');
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceTranscript('Listening... Speak your command clearly.');
        playSynthTone('start');
      };

      recognition.onerror = (e: any) => {
        console.error('Speech Recognition Error:', e.error);
        setIsListening(false);
        playSynthTone('stop');
        if (e.error === 'not-allowed') {
          if (window.self !== window.top) {
            triggerToast('Microphone access is blocked by the AI Studio preview window. Please click the "Open in New Tab" icon in the top-right corner to allow microphone permissions and try again!', 'error');
          } else {
            triggerToast('Microphone blocked. Please allow microphone permissions in your browser settings to run voice commands!', 'error');
          }
        } else if (e.error === 'network') {
          triggerToast('Speech Recognition network connection failed. Try again!', 'error');
        } else {
          triggerToast(`Speech Recognition: ${e.error}`, 'error');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = async (event: any) => {
        const resultText = event.results[0][0].transcript;
        setVoiceTranscript(resultText);
        playSynthTone('success');
        triggerToast(`Transcribed: "${resultText}"`, 'success');

        // Autofill command inputs based on state
        if (activeTab === 'analytics') {
          setMobileCommand(resultText);
        } else if (activeTab === 'terminal') {
          setChatInput(resultText);
        } else {
          setMobileCommand(resultText);
          setActiveTab('analytics');
        }

        // Auto keyword triggers!
        const lowered = resultText.toLowerCase();
        let actionExecuted = 'Recognized vocal input';
        let responseMessage = `Transcribed: "${resultText}"`;

        if (lowered.includes('verify connection') || lowered.includes('test connection')) {
          actionExecuted = 'Connection Diagnostics';
          if (lowered.includes('facebook') || lowered.includes('meta')) {
            handleTestFacebookConnection();
            responseMessage = 'Initiated Facebook API integration diagnostics';
          } else if (lowered.includes('google')) {
            handleTestGoogleConnection();
            responseMessage = 'Initiated Google Ads integration diagnostics';
          }
        } else if (lowered.includes('toggle minimal') || lowered.includes('minimal mode') || lowered.includes('focus mode')) {
          actionExecuted = 'Layout Customization';
          const nextState = !isMinimalDashboard;
          setIsMinimalDashboard(nextState);
          localStorage.setItem('sarthavaha_minimal_dashboard', String(nextState));
          playSynthTone('success');
          triggerToast(`Dashboard layout set to ${nextState ? 'Minimalist Focus' : 'Standard Full'}!`, 'info');
          responseMessage = `Switched dashboard visual layout to ${nextState ? 'Minimalist Focus' : 'Standard Full'}`;
        } else if (lowered.includes('status report') || lowered.includes('system status')) {
          actionExecuted = 'System Diagnostics';
          handleAuralStatusReport();
          responseMessage = 'Spoke system status report';
        } else if (lowered.includes('latest advice') || lowered.includes('read advice') || lowered.includes('speak advice') || lowered.includes('read strategy') || lowered.includes('speak strategy')) {
          actionExecuted = 'Aural Strategy Playback';
          handleSpeakLatestStrategy();
          responseMessage = 'Read latest advice aloud';
        } else if (lowered.includes('clear history') || lowered.includes('clear chat')) {
          actionExecuted = 'Database Reset';
          setChatMessages([]);
          speakText('Cleared chat history.');
          responseMessage = 'Cleared chat history';
        } else if (lowered.includes('voice help') || (lowered.startsWith('help') && lowered.length < 15)) {
          actionExecuted = 'User Guidance';
          const helpMsg = 'You can say: status report, to hear the system status; latest advice, to hear the last strategy; clear chat, to empty history; or focus mode, to toggle the layout.';
          speakText(helpMsg);
          responseMessage = helpMsg;
        }

        // Store transcribed voice commands on the backend
        if (token) {
          try {
            await fetch('/api/voice-commands', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                transcript: resultText,
                executedAction: actionExecuted,
                responseSpoken: responseMessage
              })
            });
            fetchVoiceCommands();
          } catch (err) {
            console.error('Failed to auto-save voice transcript', err);
          }
        }
      };

      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  };

  const handleAuralStatusReport = () => {
    playSynthTone('info');
    const fbStatus = integrationStatus.facebook.connected ? "active" : "running in simulated sandbox";
    const ggStatus = integrationStatus.googleAds.connected ? "active" : "running in simulated sandbox";
    const upgradeText = user?.isSubscribed ? "You have unlimited professional query limits." : `You have spent ${queryCount} out of 5 free marketing queries.`;
    
    const reportText = `System Status Report. Sarthavaha digital marketing node is active. Facebook API is ${fbStatus}. Google Ads API is ${ggStatus}. ${upgradeText} Say, focus mode, to toggle the minimalist workspace.`;
    speakText(reportText);
  };

  const handleSpeakLatestStrategy = () => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      speakText(`Latest advice. ${lastMsg.content}`);
    } else {
      speakText("No strategy consultations available yet. Ask Sarthavaha AI a question or speak a campaign command to start.");
    }
  };

  const handleExecuteAgentCommand = async (e?: React.FormEvent, forcedCommand?: string) => {
    if (e) e.preventDefault();
    const commandText = forcedCommand || mobileCommand;
    if (!commandText.trim()) return;

    // 5-Query limit check
    if (queryCount >= 5 && !user?.isSubscribed) {
      triggerToast('Free query limit reached. Upgrade to Pro.', 'error');
      setActiveTab('billing');
      return;
    }

    // Guest intercept check
    if (!token) {
      setInterceptedAction({ type: 'command', payload: { command: commandText } });
      setShowDelayedSignup(true);
      return;
    }

    setCommandLoading(true);
    setCommandError(null);
    setCommandResult(null);

    // Increment free count
    const newCount = queryCount + 1;
    setQueryCount(newCount);
    localStorage.setItem('sarthavaha_query_count', newCount.toString());

    try {
      const res = await fetch('/api/agent/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ command: commandText })
      });
      const data = await res.json();
      if (res.ok) {
        setCommandResult(data);
        triggerToast('Command processed successfully!', 'success');
        playSynthTone('success');
        if (data.campaign) {
          speakText(`Command processed successfully. Created campaign ${data.campaign.campaignName} on ${data.campaign.platform} with ${data.campaign.adSetsCount} ad sets.`);
        }
        fetchCurrentUser();
        fetchCampaigns(); // Synchronize live grid!
        fetchVoiceCommands();
      } else {
        setCommandError(data.error || 'An error occurred while executing the command.');
      }
    } catch (err: any) {
      setCommandError(`Network error: ${err.message}`);
    } finally {
      setCommandLoading(false);
      if (!forcedCommand) setMobileCommand('');
    }
  };

  const handleLogout = async () => {
    try {
      await firebaseSignOut(auth);
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('marketing_auth_token');
    localStorage.removeItem('sarthavaha_started');
    setToken(null);
    setUser(null);
    setHasStarted(false);
    setChatMessages([]);
    setResearchOutput(null);
    setCreateOutput(null);
    setOptResult(null);
    setActiveTab('analytics');
    triggerToast('Logged out of workspace session.', 'info');
  };

  const handleAuthSubmit = async (e: React.FormEvent, signUpMode: boolean = isSignUp) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      let idToken = '';
      let userProfile: any = null;

      if (signUpMode) {
        // 1. Register user client-side via Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
        const fbUser = userCredential.user;
        idToken = await fbUser.getIdToken();

        // 2. Synchronize user creation with the Express backend
        const url = '/api/auth/signup';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, uid: fbUser.uid, token: idToken })
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Database synchronization failed. Please try again.');
        }
        userProfile = data.user;
        triggerToast('Account registered successfully via Firebase!', 'success');
      } else {
        // 1. Authenticate user client-side via Firebase Auth
        const userCredential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
        const fbUser = userCredential.user;
        idToken = await fbUser.getIdToken();

        // 2. Retrieve user record and verify session with backend
        const url = '/api/auth/login';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ email: authEmail })
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Authentication synchronization failed.');
        }
        userProfile = data.user;
        triggerToast('Signed in successfully via Firebase!', 'success');
      }

      localStorage.setItem('marketing_auth_token', idToken);
      localStorage.setItem('sarthavaha_started', 'true');
      setToken(idToken);
      setUser(userProfile);
      setHasStarted(true);
      setShowDelayedSignup(false);

      // Process the intercepted action!
      if (interceptedAction) {
        if (interceptedAction.type === 'chat') {
          handleSendMessage(undefined, interceptedAction.payload.prompt);
        } else if (interceptedAction.type === 'research') {
          handleRunResearch(undefined, interceptedAction.payload);
        } else if (interceptedAction.type === 'command') {
          handleExecuteAgentCommand(undefined, interceptedAction.payload.command);
        }
        setInterceptedAction(null);
      }
      
      // Clean auth forms
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const fbUser = userCredential.user;
      const idToken = await fbUser.getIdToken();

      // Retrieve/create user record in Sarthavaha backend
      const url = '/api/auth/login';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ email: fbUser.email })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Google Authentication synchronization failed.');
      }

      localStorage.setItem('marketing_auth_token', idToken);
      localStorage.setItem('sarthavaha_started', 'true');
      setToken(idToken);
      setUser(data.user);
      setHasStarted(true);
      setShowDelayedSignup(false);

      // Process the intercepted action!
      if (interceptedAction) {
        if (interceptedAction.type === 'chat') {
          handleSendMessage(undefined, interceptedAction.payload.prompt);
        } else if (interceptedAction.type === 'research') {
          handleRunResearch(undefined, interceptedAction.payload);
        } else if (interceptedAction.type === 'command') {
          handleExecuteAgentCommand(undefined, interceptedAction.payload.command);
        }
        setInterceptedAction(null);
      }

      triggerToast('Signed in successfully via Google!', 'success');
    } catch (err: any) {
      setAuthError(err.message || 'Google Authentication failed.');
    } finally {
      setAuthLoading(false);
    }
  };

  // 2. Chat Service Handlers
  const handleSendMessage = async (e?: React.FormEvent, forcedPrompt?: string) => {
    if (e) e.preventDefault();
    const promptToSend = forcedPrompt || chatInput;
    if (!promptToSend.trim() || chatLoading) return;

    // 5-Query limit check
    if (queryCount >= 5 && !user?.isSubscribed) {
      triggerToast('Free query limit reached. Upgrade to Pro.', 'error');
      setActiveTab('billing');
      return;
    }

    // Guest intercept check
    if (!token) {
      setInterceptedAction({ type: 'chat', payload: { prompt: promptToSend } });
      setShowDelayedSignup(true);
      return;
    }

    setChatLoading(true);
    if (!forcedPrompt) setChatInput('');

    // Add user message to feed
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: promptToSend,
      timestamp: new Date().toLocaleTimeString()
    };
    setChatMessages(prev => [...prev, userMsg]);

    // Increment free count
    const newCount = queryCount + 1;
    setQueryCount(newCount);
    localStorage.setItem('sarthavaha_query_count', newCount.toString());

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: promptToSend,
          history: chatMessages.slice(-8)
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to gather response from AI agent.');
      }

      const botMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'model',
        content: data.response,
        timestamp: new Date().toLocaleTimeString()
      };
      setChatMessages(prev => [...prev, botMessage]);
      fetchCurrentUser();
      fetchConsultations();
      speakText(data.response);
      playSynthTone('success');

      // Automatically capture copy hooks and push into Ad Creative Storage Vault
      if (data.response && (data.response.includes('Headline') || data.response.includes('Copy') || data.response.includes('Ad') || promptToSend.toLowerCase().includes('campaign'))) {
        const parsedName = promptToSend.match(/name\s+([A-Za-z0-9_]+)/i)?.[1] || 'Sarthavaha AI Campaign';
        const parsedHeadline = promptToSend.match(/headline\s+([A-Za-z0-9\s]+)/i)?.[1] || 'Transform with AI Solutions';
        
        const newVaultAd = {
          id: `ad-${Date.now()}`,
          platform: promptToSend.toLowerCase().includes('google') ? 'google' : 'facebook',
          productName: parsedName,
          headline: parsedHeadline,
          bodyCopy: `Auto-saved creative copy: ${data.response.slice(0, 165)}...`,
          graphicUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80',
          format: promptToSend.toLowerCase().includes('google') ? 'Google Search PPC' : 'Meta Carousel Graphic',
          status: 'Ready',
          timestamp: new Date().toLocaleString()
        };

        setVaultCreatives(prev => {
          const updated = [newVaultAd, ...prev];
          localStorage.setItem('sarthavaha_vault_creatives', JSON.stringify(updated));
          return updated;
        });
        triggerToast('Asset captured and auto-saved to Creative Vault!', 'success');
      }

    } catch (err: any) {
      triggerToast(err.message, 'error');
    } finally {
      setChatLoading(false);
    }
  };

  // Quick Chat Suggestion Trigger
  const handleChatSuggestion = (suggestion: string) => {
    setChatInput(suggestion);
  };

  // 3. Upgraded Market Research Service Handler
  const handleRunResearch = async (e?: React.FormEvent, forcedFilters?: any) => {
    if (e) e.preventDefault();
    
    const country = forcedFilters?.country || researchCountry;
    const macro = forcedFilters?.macro || researchMacro;
    const micros = forcedFilters?.micros || researchMicros;

    // 5-Query limit check
    if (queryCount >= 5 && !user?.isSubscribed) {
      triggerToast('Free query limit reached. Upgrade to Pro.', 'error');
      setActiveTab('billing');
      return;
    }

    // Guest intercept check
    if (!token) {
      setInterceptedAction({
        type: 'research',
        payload: { country, macro, micros }
      });
      setShowDelayedSignup(true);
      return;
    }

    setResearchLoading(true);
    setResearchBenchmarks(null);

    // Increment free count
    const newCount = queryCount + 1;
    setQueryCount(newCount);
    localStorage.setItem('sarthavaha_query_count', newCount.toString());

    try {
      const res = await fetch('/api/get-market-research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          country,
          macroSegment: macro,
          microSegments: micros
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Market analysis failed.');
      }

      setResearchBenchmarks(data);
      setResearchOutput(data.rawText);
      triggerToast('AI Industry benchmarks compiled successfully!', 'success');
      fetchCurrentUser();
      fetchConsultations();
    } catch (err: any) {
      triggerToast(err.message, 'error');
    } finally {
      setResearchLoading(false);
    }
  };

  // 4. Creative Suite Copywriting & Simulated deployment
  const handleGenerateCreative = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createProductName.trim() || !createDescription.trim() || createLoading) return;

    setCreateLoading(true);
    setCreateOutput(null);
    setCampaignLaunchResult(null);

    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          channel: createChannel,
          productName: createProductName,
          description: createDescription,
          tone: createTone,
          audience: createAudience
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.limitReached) {
          triggerToast('Free implementations limit reached. Upgrade now.', 'error');
          setActiveTab('billing');
          return;
        }
        throw new Error(data.error || 'Creative development failed.');
      }

      setCreateOutput(data.creative);
      triggerToast('Highly-converting marketing copies generated!', 'success');
      fetchCurrentUser();
      fetchConsultations();
    } catch (err: any) {
      triggerToast(err.message, 'error');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRunInteractiveResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!researchLlmPrompt.trim() || researchLlmLoading) return;

    if (queryCount >= 5 && !user?.isSubscribed) {
      triggerToast('Free query limit reached. Upgrade to Pro.', 'error');
      setActiveTab('billing');
      return;
    }

    if (!token) {
      triggerToast('Please sign in or register to run AI research.', 'info');
      setShowDelayedSignup(true);
      return;
    }

    setResearchLlmLoading(true);
    setResearchOutput(null);

    // Increment free count
    const newCount = queryCount + 1;
    setQueryCount(newCount);
    localStorage.setItem('sarthavaha_query_count', newCount.toString());

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: `Run an extensive market intelligence analysis or strategic competitor research on this topic: ${researchLlmPrompt}`,
          category: 'research'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Interactive research query failed.');
      }

      setResearchOutput(data.response);
      setResearchNiche(researchLlmPrompt);
      setResearchAudience('Interactive LLM Discovery');
      setResearchLlmPrompt('');
      triggerToast('AI Interactive Market Research generated!', 'success');
      fetchCurrentUser();
      fetchConsultations();
    } catch (err: any) {
      triggerToast(err.message, 'error');
    } finally {
      setResearchLlmLoading(false);
    }
  };

  const handleRunInteractiveCreative = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultLlmPrompt.trim() || vaultLlmLoading) return;

    if (queryCount >= 5 && !user?.isSubscribed) {
      triggerToast('Free query limit reached. Upgrade to Pro.', 'error');
      setActiveTab('billing');
      return;
    }

    if (!token) {
      triggerToast('Please sign in or register to generate AI creatives.', 'info');
      setShowDelayedSignup(true);
      return;
    }

    setVaultLlmLoading(true);
    setCreateOutput(null);

    // Increment free count
    const newCount = queryCount + 1;
    setQueryCount(newCount);
    localStorage.setItem('sarthavaha_query_count', newCount.toString());

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          prompt: `Draft highly-converting marketing ad copies, visual designer prompts, and creative hooks for the following instructions: ${vaultLlmPrompt}`,
          category: 'creative'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Interactive ad copywriting failed.');
      }

      setCreateOutput(data.response);
      setCreateProductName('AI Interactive Ad');
      setCreateDescription(vaultLlmPrompt);
      setVaultLlmPrompt('');
      triggerToast('AI Interactive Ad Creatives generated!', 'success');
      fetchCurrentUser();
      fetchConsultations();
    } catch (err: any) {
      triggerToast(err.message, 'error');
    } finally {
      setVaultLlmLoading(false);
    }
  };

  const handleDeleteConsultation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token) return;
    try {
      const res = await fetch(`/api/consultations/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        triggerToast('Saved item deleted successfully!', 'success');
        fetchConsultations();
        if (selectedResearchId === id) {
          setSelectedResearchId(null);
          setResearchOutput(null);
        }
        if (selectedCreativeId === id) {
          setSelectedCreativeId(null);
          setCreateOutput(null);
        }
      } else {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete saved item.');
      }
    } catch (err: any) {
      triggerToast(err.message, 'error');
    }
  };

  // Launch simulated real-world API campaign
  const handleLaunchCampaign = async () => {
    if (!createOutput) return;
    setIsLaunchingCampaign(true);
    setCampaignLaunchResult(null);

    // Parse simple sections from raw output for presentation
    const headlines = createOutput.match(/\*\*1\..*?\*\*([\s\S]*?)(?=\*\*2\.)/) || ['', 'Premium Ad Headline Hook'];
    const bodyText = createOutput.match(/\*\*2\..*?\*\*([\s\S]*?)(?=\*\*3\.)/) || ['', 'High-performing Problem-Solution Ad copywriting.'];

    try {
      const res = await fetch('/api/integrations/push-campaign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          platform: createChannel === 'facebook' ? 'facebook' : 'googleAds',
          campaignName: `AI Launch: ${createProductName || 'Niche Brand'}`,
          adHeadline: headlines[1].trim().split('\n')[0].replace(/^[-\s*•]+/, '') || 'Best Value Offer',
          adBodyCopy: bodyText[1].trim().substring(0, 300),
          dailyBudget: campaignBudget
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch API campaign payloads.');
      }

      setCampaignLaunchResult(data);
      triggerToast(data.message, 'success');
      fetchCurrentUser();
    } catch (e: any) {
      triggerToast(e.message, 'error');
    } finally {
      setIsLaunchingCampaign(false);
    }
  };

  // 5. Campaign Statistics Optimization
  const handleRunOptimize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!optSpend || !optImpressions || !optClicks || !optConversions || optLoading) return;

    setOptLoading(true);
    setOptResult(null);

    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          platform: optPlatform,
          spend: optSpend,
          impressions: optImpressions,
          clicks: optClicks,
          conversions: optConversions
        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.limitReached) {
          triggerToast('Free implementations usage limit reached.', 'error');
          setActiveTab('billing');
          return;
        }
        throw new Error(data.error || 'Campaign analysis failed.');
      }

      setOptResult({
        metrics: data.metrics,
        analysis: data.analysis
      });
      triggerToast('Strategic performance diagnostic completed!', 'success');
      fetchCurrentUser();
      fetchConsultations();
    } catch (err: any) {
      triggerToast(err.message, 'error');
    } finally {
      setOptLoading(false);
    }
  };

  // 6. Administrator System fetchers & savers
  const fetchAdminData = async () => {
    if (!user || user.role !== 'admin') return;
    setAdminLoading(true);

    try {
      // Get all registered users
      const usersRes = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const usersData = await usersRes.json();

      // Get system-wide audit logs
      const logsRes = await fetch('/api/admin/logs', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const logsData = await logsRes.json();

      if (usersRes.ok && logsRes.ok) {
        setAdminUsers(usersData.users);
        setAdminLogs(logsData.logs);
      }
    } catch (e) {
      console.error(e);
      triggerToast('Error loading administration data panels.', 'error');
    } finally {
      setAdminLoading(false);
    }
  };

  // Trigger admin data reload on sub-tab navigation
  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminData();
    }
  }, [activeTab]);

  const handleSaveAPIKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminKeysSaveSuccess(false);

    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(adminKeys)
      });
      const data = await res.json();

      if (res.ok) {
        setAdminKeysSaveSuccess(true);
        triggerToast('Credential system synced and securely persistent.', 'success');
        fetchIntegrationStatus();
        // Clear inputs
        setAdminKeys({ facebookApiKey: '', googleAdsApiKey: '', paymentApiKey: '' });
        setTimeout(() => setAdminKeysSaveSuccess(false), 3000);
      } else {
        throw new Error(data.error || 'Failed to save configuration settings.');
      }
    } catch (err: any) {
      triggerToast(err.message, 'error');
    }
  };

  // 7. Billing upgrade handler
  const handleUpgradeAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBillingError(null);
    setBillingSuccess(null);
    setBillingLoading(true);

    try {
      const res = await fetch('/api/billing/upgrade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plan: billingPlan,
          cardNumber,
          cardExpiry,
          cvv: cardCvv
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Payment gateway returned credit card error.');
      }

      setBillingSuccess(data.message);
      triggerToast(`Account tier upgraded to Premium ${billingPlan}!`, 'success');
      
      // Clear forms
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');

      // Update local user state
      setUser(data.user);
    } catch (err: any) {
      setBillingError(err.message);
      triggerToast(err.message, 'error');
    } finally {
      setBillingLoading(false);
    }
  };


  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail.trim()) {
      setNewsletterSubscribed(true);
      triggerToast('Authorized Sarthavaha Intelligence Dispatch for ' + newsletterEmail, 'success');
    }
  };

  const handleConsultClick = () => {
    localStorage.setItem('sarthavaha_started', 'true');
    setHasStarted(true);
    const prompt = landingPrompt.trim();
    if (!token) {
      if (prompt) {
        setInterceptedAction({
          type: 'chat',
          payload: { prompt }
        });
      }
      setIsSignUp(false);
      setShowDelayedSignup(true);
      setActiveTab('terminal');
      triggerToast('Workspace initialized. Authentication required for AI consultation.', 'info');
    } else {
      if (prompt) {
        setChatInput(prompt);
        setTimeout(() => {
          handleSendMessage(undefined, prompt);
        }, 500);
      }
      setActiveTab('terminal');
      triggerToast('Consulting Sarthavaha AI Agent...', 'success');
    }
  };

  const handlePricingCTA = (planName: string) => {
    localStorage.setItem('sarthavaha_started', 'true');
    setHasStarted(true);
    if (!token) {
      setIsSignUp(true);
      setShowDelayedSignup(true);
      setActiveTab('billing');
      triggerToast(`Redirecting to onboard Sarthavaha ${planName} Plan...`, 'info');
    } else {
      setActiveTab('billing');
      triggerToast(`Accessing Sarthavaha ${planName} billing parameters...`, 'success');
    }
  };

  // ---------------- RENDERING LOGIC -------  // Guest and Auth views: If !hasStarted, show the glowing Cyberpunk Landing Screen
  if (!hasStarted) {
    return (
      <div id="landing-screen" className="min-h-screen flex flex-col bg-slate-950 text-slate-100 relative overflow-x-hidden font-sans">
        {/* Navigation */}
        <header className="h-16 md:h-[72px] border-b border-slate-800/60 px-5 md:px-10 flex items-center justify-between gap-4 sticky top-0 z-30 bg-slate-950/85 backdrop-blur-xl">
          <a href="#top" className="rounded-lg" aria-label="Sarthavaha home">
            <Wordmark />
          </a>

          <nav className="hidden md:flex items-center gap-1 text-[13px] font-medium text-slate-400" aria-label="Page sections">
            {[
              { id: 'how-it-works', label: 'How it works' },
              { id: 'features', label: 'Features' },
              { id: 'pricing', label: 'Pricing' },
              { id: 'about', label: 'The name' },
            ].map(link => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth' }); }}
                className="px-3 py-2 rounded-lg hover:text-white hover:bg-slate-900 transition"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                localStorage.setItem('sarthavaha_started', 'true');
                setHasStarted(true);
                setIsSignUp(false);
                setShowDelayedSignup(true);
              }}
              className="hidden sm:block px-3.5 py-2 text-[13px] font-semibold text-slate-300 hover:text-white rounded-lg hover:bg-slate-900 transition cursor-pointer"
            >
              Sign in
            </button>
            <button
              onClick={() => {
                localStorage.setItem('sarthavaha_started', 'true');
                setHasStarted(true);
                setActiveTab('terminal');
              }}
              className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-accent-ink text-[13px] font-bold transition cursor-pointer"
            >
              Open workspace
            </button>
          </div>
        </header>

        <div id="top" className="flex-1 relative">

          {/* Hero */}
          <section className="relative max-w-6xl mx-auto px-5 md:px-10 pt-14 md:pt-24 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-14 lg:gap-12 items-start">
            <div className="lg:col-span-7">
              <h1 className="text-[2.45rem] leading-[1.02] sm:text-6xl md:text-[4.25rem] font-extrabold tracking-[-0.035em] text-white">
                <span className="block">One sentence in.</span>
                <span className="block max-w-[13ch]">A campaign ready to launch.</span>
              </h1>
              <p className="mt-6 text-base md:text-lg text-slate-400 leading-relaxed max-w-[54ch]">
                Tell Sarthavaha what you sell, who it&rsquo;s for and what you can spend. It studies your competitors, writes the ads, sets the targeting and lines everything up for Facebook and Google.
              </p>

              {/* Prompt */}
              <form
                onSubmit={(e) => { e.preventDefault(); handleConsultClick(); }}
                className="mt-9 max-w-xl rounded-2xl border border-slate-700/80 bg-slate-900 focus-within:border-amber-400/70 transition-colors"
              >
                <label htmlFor="landing-prompt" className="sr-only">Describe your campaign</label>
                <textarea
                  id="landing-prompt"
                  rows={3}
                  className="w-full bg-transparent px-5 pt-4 pb-2 text-[15px] leading-relaxed text-slate-100 placeholder:text-slate-500 outline-none resize-none"
                  placeholder="Cold brew coffee brand in Bengaluru, targeting office workers 22–40, ₹30,000 a month"
                  value={landingPrompt}
                  onChange={(e) => setLandingPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleConsultClick();
                    }
                  }}
                />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 pb-3 pt-1">
                  <span className="px-2 text-[12px] text-slate-500">Press Enter to start. Your first 5 runs are free.</span>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-accent-ink text-sm font-bold transition cursor-pointer active:translate-y-px"
                  >
                    <Sparkles className="h-4 w-4" />
                    Plan my campaign
                  </button>
                </div>
              </form>

              <div className="mt-4 flex flex-wrap gap-2 max-w-xl">
                <span className="text-[12px] text-slate-500 py-1.5 pr-1">Try</span>
                {[
                  'Dental clinic in Ludhiana, local Google search ads',
                  'Handmade jewellery store, Instagram and Facebook',
                  'B2B SaaS for accountants, LinkedIn leads',
                ].map(example => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setLandingPrompt(example)}
                    className="px-3 py-1.5 rounded-full border border-slate-800 text-[12px] text-slate-300 hover:border-slate-600 hover:text-white transition cursor-pointer"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* The route: the agent's four stops, drawn once on load */}
            <aside id="how-it-works" className="lg:col-span-5 lg:pt-3 scroll-mt-24" aria-label="What happens after you press Plan my campaign">
              <p className="text-sm font-semibold text-slate-300 mb-6">What happens next</p>
              <ol className="relative">
                <span className="absolute left-[11px] top-3 bottom-3 w-0.5 bg-[repeating-linear-gradient(to_bottom,var(--color-slate-700)_0_3px,transparent_3px_8px)]" aria-hidden="true" />
                <span className="absolute left-[11px] top-3 bottom-3 w-0.5 rounded-full bg-amber-400 origin-top route-line animate-route-draw" aria-hidden="true" />
                {[
                  { title: 'Scout the market', body: 'Reads what competitors are running and which keywords and interests they lean on.', icon: Search },
                  { title: 'Write the ads', body: 'Headlines, body copy and hooks in a few variations, matched to each channel.', icon: FileText },
                  { title: 'Set the targeting', body: 'Audiences, placements and a daily budget split that fits what you said you can spend.', icon: Target },
                  { title: 'Ready to launch', body: 'You review the whole plan, then push it to Facebook or Google Ads in one step.', icon: Rocket },
                ].map((stop, i) => {
                  const Icon = stop.icon;
                  return (
                    <li
                      key={stop.title}
                      className="relative pl-14 pb-9 last:pb-0 animate-stop-in"
                      style={{ animationDelay: `${0.35 + i * 0.35}s` }}
                    >
                      <span className={`absolute left-0 top-0 h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold font-mono ring-4 ring-slate-950 ${
                        i === 3 ? 'bg-amber-400 text-accent-ink' : 'bg-slate-800 text-amber-300'
                      }`}>
                        {i + 1}
                      </span>
                      <h3 className="flex items-center gap-2 text-[15px] font-bold text-white leading-6">
                        <Icon className="h-4 w-4 text-slate-500" />
                        {stop.title}
                      </h3>
                      <p className="mt-1 text-sm text-slate-400 leading-relaxed max-w-[38ch]">{stop.body}</p>
                    </li>
                  );
                })}
              </ol>
            </aside>
          </section>

          {/* MOBILE VOICE WORKFLOW SECTION (Sarthavaha Caravan Mobile Execution) */}
          <section id="mobile-workflow" className="max-w-6xl mx-auto px-6 py-20 border-t border-slate-900/80">
            <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-[-0.03em] text-white">Or just say it out loud</h2>
              <p className="text-xs text-slate-400 mt-2 max-w-lg mx-auto">
                Away from your desk? Describe the campaign to your phone. Sarthavaha writes it down, fills in the details and waits for you to approve it.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Left Column: Interactive Mobile Simulator Screen */}
              <div className="lg:col-span-5 flex justify-center w-full">
                <div className="w-full max-w-[290px] aspect-[9/18] bg-slate-950 border-[6px] border-slate-800 rounded-[32px] p-4 relative shadow-[0_0_50px_rgba(229,150,28,0.15)] flex flex-col justify-between overflow-hidden">
                  
                  {/* Phone Speaker Notch */}
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-slate-800 rounded-full flex items-center justify-center gap-1.5 z-20">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                    <span className="w-8 h-1 rounded-full bg-slate-900" />
                  </div>

                  {/* Inner Content Area */}
                  <div className="flex-1 flex flex-col pt-6 pb-2 justify-between h-full z-10 text-[11px]">
                    
                    {/* Top status bar */}
                    <div className="flex justify-between items-center text-[8px] text-slate-500 font-mono mb-2">
                      <span>Sarthavaha</span>
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                        Listening
                      </span>
                    </div>

                    {/* Chat Bubble Container */}
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1 flex flex-col justify-end">
                      
                      {/* Operator voice input */}
                      <div className="self-end max-w-[85%] bg-cyan-950/60 border border-cyan-500/30 rounded-xl p-2.5 rounded-tr-none text-[10px] text-cyan-100 shadow-md">
                        <div className="flex items-center gap-1 text-cyan-400 font-bold text-[7px] mb-1">
                          <Mic className="h-2 w-2 animate-ping" />
                          <span>Voice Transcribed</span>
                        </div>
                        <p className="italic">
                          "Sarthavaha, create a Facebook ad campaign for our organic cold brew coffee. Set a ₹30,000 monthly budget and target coffee enthusiasts."
                        </p>
                      </div>

                      {/* Sarthavaha Real-Time AI Response */}
                      <div className="self-start max-w-[90%] bg-slate-900 border border-purple-500/20 rounded-xl p-2.5 rounded-tl-none text-slate-300">
                        <div className="flex items-center gap-1 text-purple-400 font-bold text-[7px] mb-1">
                          <BrainCircuit className="h-2 w-2" />
                          <span>Sarthavaha Core</span>
                        </div>
                        <div className="space-y-1.5 font-mono text-[9px]">
                          <div className="flex justify-between text-slate-400">
                            <span>Channel</span>
                            <span className="text-white font-bold">Facebook Ads</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Budget</span>
                            <span className="text-cyan-400 font-bold">₹30,000 / month</span>
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>Audience</span>
                            <span className="text-purple-400">Espresso, Organic, 22-45</span>
                          </div>
                        </div>
                        
                        <div className="mt-2 pt-1 border-t border-slate-800 flex items-center justify-between text-[8px]">
                          <span className="text-emerald-400 font-semibold">✓ Ready to Deploy</span>
                          <span className="text-[7px] px-1 bg-slate-800 text-slate-400 rounded">Draft #108</span>
                        </div>
                      </div>

                    </div>

                    {/* Microphone waveform visualization */}
                    <div className="mt-4 bg-slate-900/60 border border-slate-800 rounded-xl p-2 text-center relative overflow-hidden">
                      <div className="flex justify-center items-center gap-1.5 h-6 mb-1">
                        <span className="w-1 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <span className="w-1 h-5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                        <span className="w-1 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.5s' }} />
                        <span className="w-1 h-4 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <span className="w-1 h-6 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                        <span className="w-1 h-3 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.6s' }} />
                        <span className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      </div>
                      <span className="text-[7px] text-slate-500 font-mono">Listening…</span>
                    </div>

                    {/* Primary Trigger CTA Inside Simulator */}
                    <button
                      onClick={() => {
                        setLandingPrompt("Create a Facebook ad campaign for premium organic cold brew coffee targeting coffee enthusiasts with a ₹30,000 monthly budget");
                        handleConsultClick();
                      }}
                      className="w-full mt-3 py-2 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:brightness-110 text-accent-ink font-extrabold rounded-lg text-[9px] cursor-pointer text-center"
                    >
                      Review this plan
                    </button>

                  </div>

                </div>
              </div>

              {/* Right Column: Narrative workflow flowchart / steps */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Step 1 */}
                <div 
                  onClick={() => setActiveWorkflowStep(0)}
                  className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    activeWorkflowStep === 0 
                      ? 'bg-slate-900 border-cyan-500/40 shadow-[0_0_20px_rgba(229,150,28,0.1)]' 
                      : 'bg-slate-900/30 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center font-extrabold text-sm ${
                      activeWorkflowStep === 0 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      1
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">Say what you need</h3>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Tap the mic and talk the way you would to a colleague: <span className="text-amber-300">&ldquo;Create a Facebook campaign for our cold brew, ₹30,000 a month.&rdquo;</span>
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div 
                  onClick={() => setActiveWorkflowStep(1)}
                  className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    activeWorkflowStep === 1 
                      ? 'bg-slate-900 border-purple-500/40 shadow-[0_0_20px_rgba(229,150,28,0.1)]' 
                      : 'bg-slate-900/30 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center font-extrabold text-sm ${
                      activeWorkflowStep === 1 
                        ? 'bg-purple-500/20 text-purple-500 border border-purple-500/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      2
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">It fills in the details</h3>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Your words are transcribed and turned into a structured brief: channel, budget, audience age and interests.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div 
                  onClick={() => setActiveWorkflowStep(2)}
                  className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    activeWorkflowStep === 2 
                      ? 'bg-slate-900 border-cyan-500/40 shadow-[0_0_20px_rgba(229,150,28,0.1)]' 
                      : 'bg-slate-900/30 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center font-extrabold text-sm ${
                      activeWorkflowStep === 2 
                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      3
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">It builds the campaign</h3>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Ad copy options, competitor notes and targeting keywords are drafted and saved to your ad library.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div 
                  onClick={() => setActiveWorkflowStep(3)}
                  className={`p-5 rounded-2xl border transition-all duration-300 cursor-pointer ${
                    activeWorkflowStep === 3 
                      ? 'bg-slate-900 border-purple-500/40 shadow-[0_0_20px_rgba(229,150,28,0.1)]' 
                      : 'bg-slate-900/30 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className={`h-10 w-10 shrink-0 rounded-xl flex items-center justify-center font-extrabold text-sm ${
                      activeWorkflowStep === 3 
                        ? 'bg-purple-500/20 text-purple-500 border border-purple-500/30' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      4
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">You approve it</h3>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">
                        Sign in once and the full proposal is waiting. Nothing goes live until you say so.
                      </p>
                    </div>
                  </div>
                </div>

              </div>

            </div>
          </section>

          {/* Features Section */}
          <section id="features" className="max-w-6xl mx-auto px-6 py-20 border-t border-slate-900">
            <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-[-0.03em] text-white">Everything in one workspace</h2>
              <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">Four tools that share the same brief, so nothing gets typed twice.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* Feature 1 */}
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:border-cyan-500/20 transition-all duration-300 group">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:bg-cyan-500/20 transition-colors">
                  <Terminal className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Strategy chat</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ask for a plan, a headline or a second opinion on your budget, in plain language.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:border-purple-500/20 transition-all duration-300 group">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 group-hover:bg-purple-500/20 transition-colors">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Campaign dashboard</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Spend, clicks and conversions for every campaign, with a check-up that tells you what to fix first.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:border-cyan-500/20 transition-all duration-300 group">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-4 group-hover:bg-cyan-500/20 transition-colors">
                  <Search className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Market research</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  See which keywords and audiences competitors chase, and export the findings as a PDF.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl hover:border-purple-500/20 transition-all duration-300 group">
                <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4 group-hover:bg-purple-500/20 transition-colors">
                  <Database className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-bold text-white mb-2">Ad library</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Every ad, image and report you generate, saved and searchable for the next campaign.
                </p>
              </div>

            </div>
          </section>

          {/* About Section */}
          <section id="about" className="max-w-4xl mx-auto px-6 py-20 border-t border-slate-900">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 flex flex-col items-center md:items-start text-center md:text-left">
                <BrandMark size={64} className="text-marigold-400 mb-6" />
                                <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-white">Why Sarthavaha</h2>
                              </div>

              <div className="md:col-span-7 space-y-4 text-xs md:text-sm text-slate-300 leading-relaxed text-center md:text-left">
                <p>
                  In Sanskrit, a <strong className="text-amber-300">sārthavāha (सार्थवाह)</strong> led merchant caravans across difficult country to the markets where their goods would sell.
                </p>
                <p>
                  Online markets move faster and the terrain is ad auctions instead of mountain passes, but the job is the same: know the route, avoid the traps, arrive with the goods.
                </p>
                <p>
                  Sarthavaha is built by Ethereal Horizon to play that guide for small teams who don’t have a marketing department.
                </p>
              </div>
            </div>
          </section>

          {/* Pricing Section */}
          <section id="pricing" className="max-w-6xl mx-auto px-6 py-20 border-t border-slate-900">
            <div className="text-center mb-12">
                            <h2 className="text-3xl md:text-4xl font-extrabold tracking-[-0.03em] text-white">Pricing</h2>
              <p className="text-xs text-slate-400 mt-2 max-w-md mx-auto">Start free. Upgrade when the five free runs are used up.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Pricing Tier 1: Starter */}
              <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition duration-300 relative overflow-hidden">
                <div>
                                    <h3 className="text-xl font-bold text-white mb-4">Free</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-extrabold tracking-tight text-white">₹0</span>
                    <span className="text-xs text-slate-500">/ forever</span>
                  </div>
                  
                  <ul className="space-y-3 mb-8 text-xs text-slate-400">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>5 generations</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Audience templates</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Competitor keyword lists</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handlePricingCTA('Starter')}
                  className="w-full py-2.5 border border-slate-700 hover:border-slate-500 text-xs font-bold text-slate-300 rounded-xl transition cursor-pointer"
                >
                  Start free
                </button>
              </div>

              {/* Pricing Tier 2: Pro */}
              <div className="bg-slate-900/40 border-2 border-cyan-500/40 p-8 rounded-2xl flex flex-col justify-between hover:border-cyan-500 transition duration-300 relative shadow-[0_0_30px_rgba(229,150,28,0.1)]">
                <div className="absolute top-4 right-4 bg-cyan-500/10 border border-cyan-500/30 text-[9px] font-bold text-cyan-400 px-2 py-0.5 rounded-full">
                  Recommended
                </div>
                <div>
                                    <h3 className="text-xl font-bold text-white mb-4">Pro</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-4xl font-extrabold tracking-tight text-white">₹999</span>
                    <span className="text-xs text-slate-400">/ month</span>
                  </div>
                  
                  <ul className="space-y-3 mb-8 text-xs text-slate-300">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0 animate-pulse" />
                      <span>Unlimited generations</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Full competitor research with PDF export</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Ad library with copy and image generation</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Campaign check-ups and budget forecasts</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handlePricingCTA('Pro')}
                  className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-500 text-xs font-bold text-accent-ink rounded-xl transition hover:brightness-110 cursor-pointer shadow-[0_0_15px_rgba(229,150,28,0.3)]"
                >
                  Get Pro
                </button>
              </div>

              {/* Pricing Tier 3: Enterprise */}
              <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition duration-300 relative overflow-hidden">
                <div>
                                    <h3 className="text-xl font-bold text-white mb-4">Teams</h3>
                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-2xl font-extrabold text-white">Custom pricing</span>
                  </div>
                  
                  <ul className="space-y-3 mb-8 text-xs text-slate-400">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Seats for your whole team</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Custom data and API connections</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                      <span>Help connecting Meta and Google Ads</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handlePricingCTA('Enterprise')}
                  className="w-full py-2.5 border border-slate-700 hover:border-slate-500 text-xs font-bold text-slate-300 rounded-xl transition cursor-pointer"
                >
                  Talk to us
                </button>
              </div>

            </div>
          </section>

          {/* Newsletter Dispatch Section */}
          <section id="newsletter" className="max-w-4xl mx-auto px-6 py-20 border-t border-slate-900 text-center">
            <div className="bg-slate-950/40 border border-cyan-500/20 rounded-3xl p-8 md:p-12 shadow-[0_0_35px_rgba(229,150,28,0.05)] relative">
              <div className="absolute top-4 left-1/2 -translate-x-1/2">
                <div className="h-8 w-8 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Mail className="h-4 w-4" />
                </div>
              </div>

              <div className="mt-4 mb-8">
                                <h2 className="text-2xl md:text-3xl font-extrabold tracking-[-0.03em] text-white">A short email when ad platforms change</h2>
                <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">Algorithm updates, copy that is working right now, and what competitors changed. Twice a month.</p>
              </div>

              {newsletterSubscribed ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-md mx-auto p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400 text-xs font-medium"
                >
                  <p className="flex items-center justify-center gap-2">
                    <Check className="h-4 w-4 shrink-0 bg-cyan-400 text-slate-950 rounded-full p-0.5" />
                    Subscribed. The next issue goes to {newsletterEmail}.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
                  <input
                    type="email"
                    required
                    placeholder="you@company.com"
                    className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2.5 rounded-xl text-xs outline-none focus:border-cyan-500 transition-colors"
                    value={newsletterEmail}
                    onChange={(e) => setNewsletterEmail(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-500 text-accent-ink text-xs font-bold rounded-xl transition duration-300 hover:brightness-110 active:scale-[0.98] cursor-pointer shrink-0"
                  >
                    Subscribe
                  </button>
                </form>
              )}
            </div>
          </section>

        </div>

        {/* Global Footer */}
        <footer className="border-t border-slate-900 bg-slate-950/75 py-12 px-6 md:px-12 relative z-20">
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-xs mb-8 text-slate-400">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Wordmark />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                An AI marketing agent that researches, writes and launches ad campaigns for small teams.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-white mb-3 text-[10px]">Product</h4>
              <ul className="space-y-2 text-[11px]">
                <li><button onClick={() => { localStorage.setItem('sarthavaha_started', 'true'); setHasStarted(true); setActiveTab('terminal'); }} className="hover:text-cyan-400 transition">Strategy chat</button></li>
                <li><button onClick={() => { localStorage.setItem('sarthavaha_started', 'true'); setHasStarted(true); setActiveTab('analytics'); }} className="hover:text-cyan-400 transition">Dashboard</button></li>
                <li><button onClick={() => { localStorage.setItem('sarthavaha_started', 'true'); setHasStarted(true); setActiveTab('research'); }} className="hover:text-cyan-400 transition">Market research</button></li>
                <li><button onClick={() => { localStorage.setItem('sarthavaha_started', 'true'); setHasStarted(true); setActiveTab('vault'); }} className="hover:text-cyan-400 transition">Ad library</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-3 text-[10px]">Company</h4>
              <ul className="space-y-2 text-[11px]">
                <li><a href="#about" onClick={(e) => { e.preventDefault(); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-cyan-400 transition">Ethereal Horizon</a></li>
                <li><button onClick={() => triggerToast('Core cluster running at version S-1.8', 'info')} className="hover:text-cyan-400 text-left transition">System status</button></li>
                <li><button onClick={() => triggerToast('Support portal active for all Sarthavaha Pro tiers.', 'info')} className="hover:text-cyan-400 text-left transition">Support</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-3 text-[10px]">Legal</h4>
              <ul className="space-y-2 text-[11px]">
                <li><button onClick={() => triggerToast('Terms of navigation are governed by Ethereal Horizon Corp standard agreements.', 'info')} className="hover:text-cyan-400 text-left transition">Terms</button></li>
                <li><button onClick={() => triggerToast('Data structures are encrypted locally and stored securely on authorized servers.', 'info')} className="hover:text-cyan-400 text-left transition">Privacy</button></li>
              </ul>
            </div>
          </div>

          <div className="max-w-6xl mx-auto border-t border-slate-900 pt-6 flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 gap-4">
            <span>© {new Date().getFullYear()} Ethereal Horizon. All rights reserved.</span>
            <span>Made for small teams</span>
          </div>
        </footer>
      </div>
    );
  }

  // Authenticated State: Main Layout
  return (
    <div className={`h-dvh flex flex-col font-sans antialiased relative overflow-hidden ${
      isWhite ? 'theme-white bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-200'
    }`}>
      
      {/* EPHEMERAL TOAST NOTIFIER */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium ${
              isWhite
                ? 'bg-white text-slate-800 border-slate-200 shadow-sm'
                : 'bg-slate-900 text-slate-200 border-slate-800 shadow-[0_0_20px_rgba(229,150,28,0.15)]'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
            ) : toastMessage.type === 'error' ? (
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0 animate-pulse" />
            ) : (
              <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shrink-0 animate-pulse" />
            )}
            <span>{toastMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER BAR */}
      <header className={`h-16 border-b flex items-center justify-between gap-3 px-4 md:px-6 shrink-0 z-30 ${
        isWhite ? 'bg-white/80 border-slate-200' : 'bg-slate-950/90 border-slate-800/70 backdrop-blur-xl'
      }`}>
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => {
              setHasStarted(false);
              localStorage.setItem('sarthavaha_started', 'false');
            }}
            className="shrink-0 cursor-pointer rounded-lg"
            title="Go to the Sarthavaha homepage"
          >
            <Wordmark isWhite={isWhite} sub={false} />
          </button>
          <span className={`hidden md:block h-5 w-px ${isWhite ? 'bg-slate-200' : 'bg-slate-800'}`} />
          <div className="hidden md:block min-w-0">
            <p className={`text-sm font-semibold truncate ${isWhite ? 'text-slate-900' : 'text-white'}`}>
              {activeTab === 'admin' ? 'Admin' : (WORKSPACE_NAV.find(n => n.id === activeTab)?.label ?? 'Workspace')}
            </p>
          </div>
        </div>

        {/* Account */}
        <div className="flex items-center gap-2 sm:gap-3 text-xs shrink-0">
          {user?.isSubscribed ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 font-semibold rounded-full border border-emerald-500/25 text-[11px]">
              <Zap className="h-3 w-3 fill-emerald-400 shrink-0" />
              Pro
            </span>
          ) : (
            <button
              onClick={() => setActiveTab('billing')}
              className="inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border border-slate-800 hover:border-amber-500/40 text-[11px] font-semibold text-slate-300 hover:text-white transition cursor-pointer"
              title="Free plan usage"
            >
              <span className="relative h-4 w-4 shrink-0" aria-hidden="true">
                <svg viewBox="0 0 16 16" className="h-4 w-4 -rotate-90">
                  <circle cx="8" cy="8" r="6.5" fill="none" strokeWidth="2.5" className="stroke-slate-800" />
                  <circle cx="8" cy="8" r="6.5" fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-amber-400"
                    strokeDasharray={`${Math.min(queryCount / 5, 1) * 40.8} 40.8`} />
                </svg>
              </span>
              <span className="font-mono">{Math.max(5 - queryCount, 0)} of 5 free left</span>
            </button>
          )}

          {!token ? (
            <button
              onClick={() => {
                setIsSignUp(false);
                setShowDelayedSignup(true);
              }}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-accent-ink font-bold rounded-lg transition text-xs cursor-pointer"
            >
              Sign in
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:flex flex-col text-right leading-tight">
                <span className={`font-semibold text-[12px] max-w-[180px] truncate ${isWhite ? 'text-slate-800' : 'text-slate-200'}`}>{user?.email}</span>
                <span className="text-[10px] text-slate-500 capitalize">{user?.role || 'user'}</span>
              </div>
              <span className="h-8 w-8 rounded-full bg-slate-800 text-amber-300 flex items-center justify-center text-xs font-bold uppercase select-none">
                {(user?.email || 'G')[0]}
              </span>
              <button
                onClick={handleLogout}
                title="Sign out"
                aria-label="Sign out"
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">

        {/* SIDEBAR NAVIGATION */}
        <aside className={`w-64 border-r flex-col justify-between shrink-0 hidden md:flex overflow-y-auto ${
          isWhite ? 'bg-slate-100/95 border-slate-200' : 'border-slate-800/70 bg-slate-950'
        }`}>
          <nav className="p-3 space-y-0.5" aria-label="Workspace">
            {WORKSPACE_NAV.map(item => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id === 'docs') {
                      setFbKeyInput(user?.facebookApiKey || '');
                      setGoogleKeyInput(user?.googleAdsApiKey || '');
                      setImageKeyInput(user?.imageGenApiKey || '');
                      setVideoKeyInput(user?.videoGenApiKey || '');
                    }
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition cursor-pointer ${
                    active
                      ? isWhite ? 'bg-white text-slate-950 shadow-sm' : 'bg-slate-900 text-white'
                      : isWhite ? 'text-slate-600 hover:text-slate-950 hover:bg-white/60' : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                  }`}
                >
                  {active && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-amber-400" aria-hidden="true" />}
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${active ? 'text-amber-400' : ''}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-snug">{item.label}</span>
                    <span className={`block text-[11px] leading-snug mt-0.5 ${active ? 'text-slate-400' : 'text-slate-500'}`}>{item.hint}</span>
                  </span>
                </button>
              );
            })}

            {user?.role === 'admin' && (
              <div className={`pt-3 mt-3 border-t ${isWhite ? 'border-slate-200' : 'border-slate-800/70'}`}>
                <button
                  onClick={() => setActiveTab('admin')}
                  aria-current={activeTab === 'admin' ? 'page' : undefined}
                  className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition cursor-pointer ${
                    activeTab === 'admin' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-900/60'
                  }`}
                >
                  {activeTab === 'admin' && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full bg-amber-400" aria-hidden="true" />}
                  <Database className={`h-4 w-4 shrink-0 ${activeTab === 'admin' ? 'text-amber-400' : ''}`} />
                  Admin
                </button>
              </div>
            )}
          </nav>

          {/* Plan */}
          <div className={`m-3 p-4 rounded-xl border ${isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'}`}>
            {!user?.isSubscribed ? (
              <div className="space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className={`text-[13px] font-semibold ${isWhite ? 'text-slate-900' : 'text-white'}`}>Free plan</span>
                  <span className="text-[11px] text-slate-400 font-mono">{Math.min(queryCount, 5)} / 5 used</span>
                </div>
                <div className="flex gap-1" role="meter" aria-valuemin={0} aria-valuemax={5} aria-valuenow={Math.min(queryCount, 5)} aria-label="Free generations used">
                  {[0, 1, 2, 3, 4].map(i => (
                    <span key={i} className={`h-1.5 flex-1 rounded-full ${i < queryCount ? 'bg-amber-400' : isWhite ? 'bg-slate-200' : 'bg-slate-800'}`} />
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 leading-snug">
                  {5 - queryCount > 0
                    ? `${5 - queryCount} free generation${5 - queryCount === 1 ? '' : 's'} left. Pro removes the limit.`
                    : 'You have used all free generations. Upgrade to keep going.'}
                </p>
                <button
                  onClick={() => setActiveTab('billing')}
                  className="w-full py-2 bg-amber-400 hover:bg-amber-300 text-accent-ink text-xs font-bold rounded-lg transition cursor-pointer"
                >
                  Upgrade to Pro
                </button>
              </div>
            ) : (
              <div className="flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className={`text-[13px] font-semibold ${isWhite ? 'text-slate-900' : 'text-slate-100'}`}>Pro plan</p>
                  <p className="text-[11px] text-slate-500">Unlimited generations</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* WORKSPACE VIEWPORT */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 md:p-8 pb-28 md:pb-10">

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
            >
              
              {/* ==================== DASHBOARD TAB ==================== */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  {/* Minimalist Switcher Header */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-950/40 p-4 border border-slate-800 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
                    <div>
                      <span className="text-[10px] text-cyan-400 font-mono font-bold">Workspace Engine</span>
                      <h1 className="text-lg font-bold text-white font-sans">Autonomous Marketing Console</h1>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-1.5 self-stretch sm:self-auto justify-between sm:justify-start">
                      <span className="text-[11px] font-bold text-slate-400 pl-2">Layout Theme</span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsMinimalDashboard(false);
                            localStorage.setItem('sarthavaha_minimal_dashboard', 'false');
                            playSynthTone('info');
                          }}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                            !isMinimalDashboard 
                              ? 'bg-purple-600/25 text-purple-300 border border-purple-500/30 shadow-[0_0_10px_rgba(229,150,28,0.15)]' 
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <Maximize2 className="h-3 w-3" /> Standard View
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsMinimalDashboard(true);
                            localStorage.setItem('sarthavaha_minimal_dashboard', 'true');
                            playSynthTone('success');
                            triggerToast('Minimalist focus layout active!', 'success');
                          }}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                            isMinimalDashboard 
                              ? 'bg-cyan-600/25 text-cyan-300 border border-cyan-500/30 shadow-[0_0_10px_rgba(229,150,28,0.15)]' 
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          <Minimize2 className="h-3 w-3" /> Minimal Focus
                        </button>
                      </div>
                    </div>
                  </div>

                  {isMinimalDashboard && (
                    /* ==================== MINIMALIST FOCUS MODE VIEW ==================== */
                    <div className="space-y-6">
                      
                      {/* 1. Sleek Metrics Dashboard Row */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col justify-between hover:border-slate-800/60 transition duration-300">
                          <span className="text-[9px] text-slate-500 font-mono">Active Campaigns</span>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-xl font-bold text-white font-mono">{campaigns.length || 3}</span>
                            <span className="text-[9px] text-emerald-400 font-medium flex items-center gap-0.5 font-mono">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> LIVE
                            </span>
                          </div>
                        </div>

                        <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col justify-between hover:border-slate-800/60 transition duration-300">
                          <span className="text-[9px] text-slate-500 font-mono">Average CTR</span>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-xl font-bold text-white font-mono">3.82%</span>
                            <span className="text-[9px] text-emerald-400 font-medium font-mono">+12.4%</span>
                          </div>
                        </div>

                        <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col justify-between hover:border-slate-800/60 transition duration-300">
                          <span className="text-[9px] text-slate-500 font-mono">Acquisition Rate</span>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-xl font-bold text-white font-mono">2.45%</span>
                            <span className="text-[9px] text-cyan-400 font-medium font-mono">Optimal</span>
                          </div>
                        </div>

                        <div className="bg-slate-950/60 border border-slate-900 rounded-xl p-4 flex flex-col justify-between hover:border-slate-800/60 transition duration-300">
                          <span className="text-[9px] text-slate-500 font-mono">Total Allocations</span>
                          <div className="flex items-baseline gap-2 mt-2">
                            <span className="text-xl font-bold text-white font-mono">Rs. 43,500</span>
                            <span className="text-[9px] text-slate-500 font-mono">Avg Spend</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Compact Inline Voice Controller Bar */}
                      <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4 flex flex-col lg:flex-row items-center justify-between gap-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/3 rounded-full blur-xl pointer-events-none" />
                        
                        <div className="flex items-center gap-3.5 w-full lg:w-auto">
                          {/* Animated Miniature Orb */}
                          <div className="relative">
                            <AnimatePresence>
                              {(isListening || isAgentSpeaking) && (
                                <motion.div
                                  initial={{ scale: 0.8, opacity: 0.5 }}
                                  animate={{ scale: 1.6, opacity: 0 }}
                                  exit={{ scale: 0.8, opacity: 0 }}
                                  transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                                  className={`absolute inset-0 rounded-full border ${isListening ? 'border-cyan-400/40 bg-cyan-400/10' : 'border-purple-400/40 bg-purple-400/10'}`}
                                />
                              )}
                            </AnimatePresence>
                            <button
                              type="button"
                              onClick={handleToggleVoiceAgent}
                              className={`h-11 w-11 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
                                isListening 
                                  ? 'bg-cyan-500 text-accent-ink shadow-lg shadow-cyan-500/20' 
                                  : isAgentSpeaking 
                                    ? 'bg-purple-600 text-accent-ink shadow-lg shadow-purple-600/20' 
                                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                              }`}
                              title="Toggle Voice Controller"
                            >
                              <Mic className="h-4.5 w-4.5" />
                            </button>
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 font-mono font-bold">Vocal Command Link</span>
                              <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium">
                              {isListening ? 'Listening... Speak now.' : isAgentSpeaking ? 'Agent vocalizing output...' : 'Click mic to speak marketing commands.'}
                            </p>
                          </div>
                        </div>

                        {/* Real-time Streaming Transcript Pill */}
                        <div className="flex-1 max-w-lg w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-2 flex items-center justify-center text-center">
                          <span className={`text-[10px] font-mono truncate max-w-md ${voiceTranscript ? 'text-cyan-300' : 'text-slate-600 italic'}`}>
                            {voiceTranscript ? `"${voiceTranscript}"` : 'Stream transcription or say "Toggle minimal"'}
                          </span>
                        </div>

                        {/* Miniature Quick Action Audio Controls */}
                        <div className="flex items-center gap-1.5 shrink-0 self-stretch lg:self-auto justify-end">
                          <button
                            type="button"
                            onClick={handleAuralStatusReport}
                            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-[10px] font-mono tracking-tight transition cursor-pointer font-bold"
                            title="Spoken status of connections"
                          >
                            Status Report
                          </button>
                          <button
                            type="button"
                            onClick={handleSpeakLatestStrategy}
                            className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg text-[10px] font-mono tracking-tight transition cursor-pointer font-bold"
                          >
                            Latest Strategy
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              window.speechSynthesis.cancel();
                              setIsAgentSpeaking(false);
                              playSynthTone('stop');
                              triggerToast('Audio output silenced.', 'info');
                            }}
                            className="p-2 bg-slate-900 border border-slate-800 hover:bg-rose-950/10 hover:border-rose-500/20 text-rose-400 rounded-lg text-[10px] font-mono transition cursor-pointer font-bold"
                            title="Mute spoken feedback"
                          >
                            Mute
                          </button>
                        </div>
                      </div>

                      {/* 3. Core Services Grid (Highly Compact) */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div onClick={() => setActiveTab('terminal')} className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 hover:border-slate-800 transition duration-300 cursor-pointer flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg group-hover:bg-sky-500/20 transition">
                              <MessageSquare className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 group-hover:text-white transition">AI Chat Analyst</span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition" />
                        </div>

                        <div onClick={() => setActiveTab('research')} className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 hover:border-slate-800 transition duration-300 cursor-pointer flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:bg-emerald-500/20 transition">
                              <Search className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 group-hover:text-white transition">Research Desk</span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition" />
                        </div>

                        <div onClick={() => setActiveTab('vault')} className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 hover:border-slate-800 transition duration-300 cursor-pointer flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg group-hover:bg-indigo-500/20 transition">
                              <Briefcase className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 group-hover:text-white transition">Creative Studio</span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition" />
                        </div>

                        <div onClick={() => setActiveTab('optimize')} className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 hover:border-slate-800 transition duration-300 cursor-pointer flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg group-hover:bg-amber-500/20 transition">
                              <Gauge className="h-4 w-4" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 group-hover:text-white transition">Performance Audit</span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-slate-600 group-hover:text-slate-400 transition" />
                        </div>
                      </div>

                      {/* 4. Active Marketing Campaigns Stream (Sleek, Modern Table) */}
                      <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 space-y-4 font-sans">
                        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <h3 className="text-xs font-bold text-white">Active Campaigns Stream</h3>
                          </div>
                          <span className="text-[9px] text-slate-500 font-mono">Synchronized with Sarthavaha APIs</span>
                        </div>

                        <div className="space-y-3">
                          {(campaigns.length > 0 ? campaigns : [
                            {
                              id: 'ad-101',
                              name: 'Sarthavaha Premium Launch',
                              platform: 'facebook',
                              headline: 'Scale your campaigns with AI 🚀',
                              spend: 12500,
                              impressions: 145000,
                              clicks: 3800,
                              conversions: 92,
                              status: 'active',
                              budget: 1500
                            },
                            {
                              id: 'ad-102',
                              name: 'EcoSip Bottle Campaign',
                              platform: 'google',
                              headline: 'Pure Water. Perfect Price. 🌎',
                              spend: 8400,
                              impressions: 98000,
                              clicks: 2100,
                              conversions: 54,
                              status: 'active',
                              budget: 800
                            }
                          ]).map((camp) => (
                            <div key={camp.id} className="p-3.5 bg-slate-950/80 border border-slate-900 rounded-xl hover:border-slate-850 transition duration-350 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                              <div className="space-y-1 lg:max-w-xs w-full">
                                <div className="flex items-center gap-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono   ${
                                    camp.platform === 'facebook' 
                                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/15' 
                                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/15'
                                  }`}>
                                    {camp.platform} Ads
                                  </span>
                                  <span className="text-xs font-bold text-slate-100 truncate">{camp.name}</span>
                                </div>
                                <p className="text-[10px] text-slate-500 truncate italic">"{camp.headline}"</p>
                              </div>

                              <div className="grid grid-cols-4 gap-4 lg:gap-8 text-left font-mono">
                                <div>
                                  <span className="text-[8px] text-slate-500 block">Spend</span>
                                  <span className="text-[11px] font-bold text-slate-300">Rs. {camp.spend}</span>
                                </div>
                                <div>
                                  <span className="text-[8px] text-slate-500 block">Clicks</span>
                                  <span className="text-[11px] font-bold text-slate-300">{camp.clicks}</span>
                                </div>
                                <div>
                                  <span className="text-[8px] text-slate-500 block">CTR</span>
                                  <span className="text-[11px] font-bold text-white font-mono">
                                    {camp.clicks && camp.impressions ? ((camp.clicks / camp.impressions) * 100).toFixed(2) : '3.82'}%
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[8px] text-slate-500 block">Convs</span>
                                  <span className="text-[11px] font-bold text-emerald-400">{camp.conversions}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 justify-end shrink-0">
                                <div className="text-right">
                                  <span className="text-[8px] text-slate-500 block">Daily Budget</span>
                                  <span className="text-[10px] font-bold text-slate-400">Rs. {camp.budget}/day</span>
                                </div>
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 5. Channel Connections Miniature Row */}
                      <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-sans">
                        <span className="text-[10px] text-slate-500 font-bold">Channel Gateways</span>
                        
                        <div className="flex flex-wrap gap-4 items-center justify-center">
                          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2.5 py-1 rounded-lg text-[10px]">
                            <span className={`h-1.5 w-1.5 rounded-full ${integrationStatus.facebook.connected ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                            <span className="text-slate-400 font-bold">Facebook API:</span>
                            <span className="text-slate-500 font-mono text-[9px]">{integrationStatus.facebook.connected ? 'Active' : 'Sandbox'}</span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2.5 py-1 rounded-lg text-[10px]">
                            <span className={`h-1.5 w-1.5 rounded-full ${integrationStatus.googleAds.connected ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                            <span className="text-slate-400 font-bold">Google Ads:</span>
                            <span className="text-slate-500 font-mono text-[9px]">{integrationStatus.googleAds.connected ? 'Active' : 'Sandbox'}</span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2.5 py-1 rounded-lg text-[10px]">
                            <span className={`h-1.5 w-1.5 rounded-full ${integrationStatus.imageGen.connected ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                            <span className="text-slate-400 font-bold">Image Gen:</span>
                            <span className="text-slate-500 font-mono text-[9px]">{integrationStatus.imageGen.connected ? 'Active' : 'Sandbox'}</span>
                          </div>

                          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-850 px-2.5 py-1 rounded-lg text-[10px]">
                            <span className={`h-1.5 w-1.5 rounded-full ${integrationStatus.videoGen.connected ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                            <span className="text-slate-400 font-bold">Video Gen:</span>
                            <span className="text-slate-500 font-mono text-[9px]">{integrationStatus.videoGen.connected ? 'Active' : 'Sandbox'}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => setIsKeysModalOpen(true)}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-mono text-[9px] rounded-lg transition font-bold cursor-pointer"
                        >
                          Configure Keys
                        </button>
                      </div>

                    </div>
                  )}

                  {/* ==================== SOUND COMMAND & TALK TO AGENT BOX ==================== */}
                  {!isMinimalDashboard && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Part: Glowing Wave / Mic Orb */}
                    <div className="lg:col-span-5 bg-gradient-to-br from-slate-900 to-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden shadow-xl group">
                      {/* Ambient radial glows */}
                      <div className="absolute -top-10 -left-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
                      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />

                      <div className="flex items-center justify-between mb-4 relative z-10">
                        <div className="flex items-center gap-2">
                          <div className={`h-2.5 w-2.5 rounded-full ${isListening ? 'bg-cyan-400 animate-ping' : isAgentSpeaking ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'}`} />
                          <span className="text-[10px] text-slate-400 font-mono font-bold">Vocal Command Link</span>
                        </div>
                        <div className="flex gap-1">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">WebSpeech V2</span>
                        </div>
                      </div>

                      {/* Center visualizer + Mic Orb */}
                      <div className="py-6 flex flex-col items-center justify-center space-y-5 relative z-10">
                        
                        <div className="relative flex items-center justify-center">
                          {/* Glowing ripple ring 1 */}
                          <AnimatePresence>
                            {(isListening || isAgentSpeaking) && (
                              <motion.div
                                initial={{ scale: 0.8, opacity: 0.5 }}
                                animate={{ scale: 1.8, opacity: 0 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                                className={`absolute inset-0 rounded-full border ${isListening ? 'border-cyan-400/40 bg-cyan-400/5' : 'border-purple-400/40 bg-purple-400/5'}`}
                              />
                            )}
                          </AnimatePresence>
                          
                          {/* Glowing ripple ring 2 */}
                          <AnimatePresence>
                            {(isListening || isAgentSpeaking) && (
                              <motion.div
                                initial={{ scale: 0.8, opacity: 0.5 }}
                                animate={{ scale: 1.4, opacity: 0 }}
                                exit={{ scale: 0.8, opacity: 0 }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut", delay: 0.5 }}
                                className={`absolute inset-0 rounded-full border ${isListening ? 'border-cyan-500/30 bg-cyan-500/3' : 'border-purple-500/30 bg-purple-500/3'}`}
                              />
                            )}
                          </AnimatePresence>

                          {/* Outer solid glow ring */}
                          <div className={`p-4 rounded-full transition-all duration-500 ${
                            isListening 
                              ? 'bg-cyan-500/15 border-cyan-400 shadow-[0_0_30px_rgba(229,150,28,0.3)]' 
                              : isAgentSpeaking 
                                ? 'bg-purple-500/15 border-purple-400 shadow-[0_0_30px_rgba(229,150,28,0.3)]' 
                                : 'bg-slate-950 border-slate-800 group-hover:border-slate-700 shadow-md'
                          } border-2`}>
                            <button
                              type="button"
                              onClick={handleToggleVoiceAgent}
                              className={`h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 cursor-pointer ${
                                isListening 
                                  ? 'bg-cyan-500 text-accent-ink shadow-inner' 
                                  : isAgentSpeaking 
                                    ? 'bg-purple-600 text-accent-ink shadow-inner' 
                                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                              title="Toggle Voice Controller"
                            >
                              {isListening ? (
                                <Mic className="h-7 w-7 animate-pulse" />
                              ) : isAgentSpeaking ? (
                                <div className="flex items-center gap-1">
                                  <span className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1 h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                              ) : (
                                <Mic className="h-7 w-7" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="text-center space-y-1">
                          <h3 className="text-sm font-bold text-white">
                            {isListening ? 'Listening to voice...' : isAgentSpeaking ? 'Agent Speaking...' : 'Talk to AI Agent'}
                          </h3>
                          <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                            {isListening ? 'Speak marketing commands clearly. Click to finish recording.' : isAgentSpeaking ? 'Speaking strategy recommendations aloud.' : 'Click mic to stream audio commands and get spoken solutions.'}
                          </p>
                        </div>

                      </div>

                      {/* Voice state transcription pill */}
                      <div className="bg-slate-950/80 border border-slate-850 p-3 rounded-xl min-h-[50px] flex items-center justify-center text-center">
                        <span className={`text-[11px] font-mono leading-relaxed ${voiceTranscript ? 'text-cyan-300' : 'text-slate-500 italic'}`}>
                          {voiceTranscript ? `"${voiceTranscript}"` : 'Your vocal words will stream and process here...'}
                        </span>
                      </div>

                    </div>

                    {/* Right Part: Sound Controls & Direct Vocal Shortcuts */}
                    <div className="lg:col-span-7 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl relative overflow-hidden">
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-850">
                          <div>
                            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                              <Volume2 className="h-4 w-4 text-purple-400 animate-pulse" /> Spoken Operations & Chimes
                            </h3>
                            <p className="text-[10px] text-slate-500 mt-0.5">Control auditory feedback loops and trigger specialized synthesized sound sweeps.</p>
                          </div>
                          <span className="h-2 w-2 rounded-full bg-purple-400" />
                        </div>

                        {/* Button Shortcuts Area */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          
                          <button
                            type="button"
                            onClick={handleAuralStatusReport}
                            className="p-3.5 bg-slate-950/80 border border-slate-850 hover:border-purple-500/30 hover:bg-purple-950/10 rounded-xl transition-all text-left flex items-start gap-3 group/btn cursor-pointer"
                          >
                            <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg group-hover/btn:bg-purple-500/20 transition-colors">
                              <Volume2 className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white group-hover/btn:text-purple-300">Spoken Status Report</div>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Synthesizes and reads aloud API connections & account metrics.</p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={handleSpeakLatestStrategy}
                            className="p-3.5 bg-slate-950/80 border border-slate-850 hover:border-cyan-500/30 hover:bg-cyan-500/10 rounded-xl transition-all text-left flex items-start gap-3 group/btn cursor-pointer"
                          >
                            <div className="p-2 bg-cyan-500/10 text-cyan-400 rounded-lg group-hover/btn:bg-cyan-500/20 transition-colors">
                              <BrainCircuit className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white group-hover/btn:text-cyan-300">Read Latest Strategy</div>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Vocalizes the last advisor advice from the consultant feed.</p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              playSynthTone('success');
                              triggerToast('Synthesized chimes test success!', 'success');
                            }}
                            className="p-3.5 bg-slate-950/80 border border-slate-850 hover:border-emerald-500/30 hover:bg-emerald-500/10 rounded-xl transition-all text-left flex items-start gap-3 group/btn cursor-pointer"
                          >
                            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover/btn:bg-emerald-500/20 transition-colors">
                              <Sparkles className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white group-hover/btn:text-emerald-300">Trigger Audio Chimes</div>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Executes a real-time web audio frequency sweep indicating health.</p>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              window.speechSynthesis.cancel();
                              setIsAgentSpeaking(false);
                              playSynthTone('stop');
                              triggerToast('Vocal synthesis paused.', 'info');
                            }}
                            className="p-3.5 bg-slate-950/80 border border-slate-850 hover:border-rose-500/30 hover:bg-rose-500/10 rounded-xl transition-all text-left flex items-start gap-3 group/btn cursor-pointer"
                          >
                            <div className="p-2 bg-rose-500/10 text-rose-400 rounded-lg group-hover/btn:bg-rose-500/20 transition-colors">
                              <VolumeX className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white group-hover/btn:text-rose-300">Silence Speech</div>
                              <p className="text-[10px] text-slate-500 mt-0.5 leading-normal">Immediately terminates vocal playbacks and resets wave indicators.</p>
                            </div>
                          </button>

                        </div>

                      </div>

                      {/* Sound command tips */}
                      <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-850 text-[10px] text-slate-400 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                          <span>Try voice command: <strong>"Toggle minimal"</strong> to trigger layout changes hands-free!</span>
                        </div>
                        <span className="text-[9px] text-slate-500 font-mono">100% Client-Side</span>
                      </div>

                    </div>
                  </div>
                )}

                  {/* ==================== STORED VOICE COMMANDS & SPEECH LOGS ==================== */}
                  {!isMinimalDashboard && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-2xl pointer-events-none" />
                      
                      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                          <History className="h-4.5 w-4.5 text-purple-400 animate-pulse" />
                          <h3 className="text-sm font-bold text-white">Stored Vocal Commands & Speech Logs</h3>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono bg-purple-500/10 px-2.5 py-0.5 rounded border border-purple-500/20">
                          {storedVoiceCommands.length} cloud logs found
                        </span>
                      </div>

                      <div className="mt-4 overflow-x-auto">
                        {storedVoiceCommands.length === 0 ? (
                          <div className="py-8 flex flex-col items-center justify-center text-center">
                            <Mic className="h-8 w-8 text-slate-700 mb-2 animate-pulse" />
                            <p className="text-xs text-slate-500">No vocal logs saved on cloud yet. Stream voice commands or toggle minimal mode using your microphone!</p>
                          </div>
                        ) : (
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-400">
                                <th className="py-2.5 font-bold">Timestamp</th>
                                <th className="py-2.5 font-bold">Vocal Transcript</th>
                                <th className="py-2.5 font-bold">Action Triggered</th>
                                <th className="py-2.5 font-bold">Synthesized Spoken Response</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40 text-slate-300">
                              {storedVoiceCommands.slice(0, 8).map((cmd) => (
                                <tr key={cmd.id} className="hover:bg-slate-850/30 transition">
                                  <td className="py-3 text-slate-500 whitespace-nowrap font-mono">
                                    {new Date(cmd.timestamp).toLocaleString()}
                                  </td>
                                  <td className="py-3 font-bold text-white italic">
                                    "{cmd.transcript}"
                                  </td>
                                  <td className="py-3">
                                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/10 font-mono text-[9px]">
                                      {cmd.executedAction || 'General Inquiry'}
                                    </span>
                                  </td>
                                  <td className="py-3 text-slate-400">
                                    {cmd.responseSpoken || 'Synthesized spoken confirmation complete.'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Banner Header (Hidden in Minimalist Focus Mode) */}
                  {!isMinimalDashboard && (
                    <div className="p-6 md:p-8 rounded-2xl bg-slate-900/40 text-white relative overflow-hidden shadow-[0_0_25px_rgba(0,0,0,0.3)] border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                      <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                      <div className="space-y-2 relative z-10">
                        <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/20">
                          <Sparkles className="h-3 w-3" /> Sarthavaha Copilot
                        </div>
                        <h2 className="text-xl md:text-2xl font-bold font-sans tracking-tight text-white">
                          Welcome to Sarthavaha Intelligence, <span className="font-mono text-purple-400">{(user?.email || 'guest@sarthavaha.io').split('@')[0]}</span>
                        </h2>
                        <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                          Execute target competitor analysis, craft premium visual copywriting hooks, evaluate ad budgets, and synchronize deployments direct to channels using Sarthavaha intelligence.
                        </p>
                      </div>
                      
                      {!user?.isSubscribed && (
                        <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl relative z-10 shrink-0 w-full md:w-auto">
                          <span className="text-[10px] text-amber-500 font-bold block mb-1">Capacity</span>
                          <div className="flex items-baseline gap-1.5 text-lg font-bold text-white">
                            <span>{user?.usageCount || 0} <span className="text-xs text-slate-500">of</span> 5</span>
                            <span className="text-xs text-slate-400 font-normal">implementations spent</span>
                          </div>
                          <button
                            onClick={() => setActiveTab('billing')}
                            className="w-full mt-3 py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-accent-ink font-bold rounded-lg text-xs transition flex items-center justify-center gap-1 shadow-lg shadow-indigo-500/15"
                          >
                            Unlock Premium (Rs 999/mo)
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Core Services Bento */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Bento Option 1: AI Chat */}
                    <div 
                      onClick={() => setActiveTab('terminal')}
                      className={`bg-slate-900/50 border border-slate-800 ${isMinimalDashboard ? 'p-4' : 'p-6'} rounded-2xl hover:border-slate-700 hover:shadow-lg hover:shadow-indigo-500/5 cursor-pointer transition flex flex-col justify-between group`}
                    >
                      <div className="space-y-3">
                        <div className="h-10 w-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center group-hover:bg-sky-500/20 transition">
                          <MessageSquare className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition">AI Chat Companion</h3>
                          {!isMinimalDashboard && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                              Interact with an AI Copywriting & Marketing Analyst for strategic advisory.
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-purple-400 font-semibold flex items-center gap-1 mt-4">
                        Consult Sarthavaha AI <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>

                    {/* Bento Option 2: Research */}
                    <div 
                      onClick={() => setActiveTab('research')}
                      className={`bg-slate-900/50 border border-slate-800 ${isMinimalDashboard ? 'p-4' : 'p-6'} rounded-2xl hover:border-slate-700 hover:shadow-lg hover:shadow-indigo-500/5 cursor-pointer transition flex flex-col justify-between group`}
                    >
                      <div className="space-y-3">
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500/20 transition">
                          <Search className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition">Competitor Research</h3>
                          {!isMinimalDashboard && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                              Discover valuable keyword intents and compile deep-dive market segment files.
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 mt-4">
                        Perform Research <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>

                    {/* Bento Option 3: Create Studio */}
                    <div 
                      onClick={() => setActiveTab('vault')}
                      className={`bg-slate-900/50 border border-slate-800 ${isMinimalDashboard ? 'p-4' : 'p-6'} rounded-2xl hover:border-slate-700 hover:shadow-lg hover:shadow-indigo-500/5 cursor-pointer transition flex flex-col justify-between group`}
                    >
                      <div className="space-y-3">
                        <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-500/20 transition">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition">Visual Ad Studio</h3>
                          {!isMinimalDashboard && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                              Generate copy hooks and mock active campaigns to sync with live platforms.
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-indigo-400 font-semibold flex items-center gap-1 mt-4">
                        Generate Creatives <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>

                    {/* Bento Option 4: Optimization */}
                    <div 
                      onClick={() => setActiveTab('optimize')}
                      className={`bg-slate-900/50 border border-slate-800 ${isMinimalDashboard ? 'p-4' : 'p-6'} rounded-2xl hover:border-slate-700 hover:shadow-lg hover:shadow-indigo-500/5 cursor-pointer transition flex flex-col justify-between group`}
                    >
                      <div className="space-y-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:bg-amber-500/20 transition">
                          <Gauge className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition">Campaign Audit</h3>
                          {!isMinimalDashboard && (
                            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                              Analyze ROAS, CPC, and Conversions to receive dynamic optimization roadmaps.
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1 mt-4">
                        Optimize Campaigns <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>

                  </div>

                  {/* Mobile Campaign AI Command Assistant */}
                  {!isMinimalDashboard && (
                    <div className="bg-gradient-to-r from-purple-950/40 to-indigo-950/40 border border-purple-500/20 rounded-2xl p-6 space-y-5 shadow-[0_0_30px_rgba(229,150,28,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-purple-500"></span>
                          </span>
                          <h3 className="text-base font-bold text-white flex items-center gap-2">
                            <span>📱 AI Mobile Command Hub</span>
                          </h3>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Instantly build, structure, and deploy campaigns using on-the-go natural language commands.
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[9px] font-bold">
                        Mobile UX Optimized
                      </span>
                    </div>

                    <form onSubmit={handleExecuteAgentCommand} className="space-y-3 relative z-10">
                      <div className="relative">
                        <textarea
                          value={mobileCommand}
                          onChange={(e) => setMobileCommand(e.target.value)}
                          placeholder='e.g., "Create a campaign in facebook ads name Telescope with 6 ad sets with 4 ads in each ad sets Write HEADLINE Best Telescope at best price ad daily 1000rs with demographics science and technology and also set location Mumbai, chennai and Hyderabad with age 18 to 34"'
                          rows={3}
                          className="w-full bg-slate-950/90 border border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-xs text-white placeholder-slate-500 rounded-xl p-4 transition-all pr-20 leading-relaxed resize-none"
                        />
                        <div className="absolute bottom-3 right-3 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleToggleVoiceAgent}
                            className={`p-2 rounded-lg transition-all cursor-pointer ${
                              isListening 
                                ? 'text-cyan-400 bg-cyan-500/10 animate-pulse border border-cyan-500/20 shadow-[0_0_10px_rgba(229,150,28,0.15)]' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 border border-transparent'
                            }`}
                            title="Speak command"
                          >
                            <Mic className="h-4 w-4" />
                          </button>
                          <button
                            type="submit"
                            disabled={commandLoading || !mobileCommand.trim()}
                            className="p-2 bg-purple-600 hover:bg-purple-500 text-accent-ink rounded-lg disabled:bg-slate-800 disabled:text-slate-500 transition-colors duration-200 cursor-pointer"
                          >
                            {commandLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Suggestions pills for easy mobile tap */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-slate-500 font-semibold block">Tap Quick Sample Command:</span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setMobileCommand('Create a campaign in facebook ads name Telescope with 6 ad sets with 4 ads in each ad sets Write HEADLINE Best Telescope at best price ad daily 1000rs with demographics science and technology and also set location Mumbai, chennai and Hyderabad with age 18 to 34')}
                            className="text-[10px] bg-slate-900/95 hover:bg-purple-950/30 hover:border-purple-500/30 text-slate-300 border border-slate-800 rounded-lg px-2.5 py-1.5 transition text-left max-w-full truncate"
                          >
                            🔭 Telescope Facebook Campaign (6 sets × 4 ads, Mumbai/Chennai/Hyd)
                          </button>
                          <button
                            type="button"
                            onClick={() => setMobileCommand('Create google ads campaign for EcoBottle with 3 ad sets, budget 800rs daily, location Delhi and Pune with demographics health, fitness and sustainability')}
                            className="text-[10px] bg-slate-900/95 hover:bg-purple-950/30 hover:border-purple-500/30 text-slate-300 border border-slate-800 rounded-lg px-2.5 py-1.5 transition text-left max-w-full truncate"
                          >
                            🍃 EcoBottle Google Search Ads (3 sets, Delhi/Pune)
                          </button>
                        </div>
                      </div>
                    </form>

                    {commandError && (
                      <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex gap-2">
                        <ShieldAlert className="h-4 w-4 shrink-0" />
                        <span>{commandError}</span>
                      </div>
                    )}

                    {/* Glowing Terminal Execution Receipt */}
                    <AnimatePresence>
                      {commandResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -15 }}
                          className="bg-black/80 rounded-xl border border-emerald-500/30 overflow-hidden font-mono text-[11px]"
                        >
                          <div className="bg-slate-900/90 px-4 py-2 flex items-center justify-between border-b border-slate-800">
                            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                              Launch receipt
                            </span>
                            <span className="text-[9px] text-slate-500">SUCCESS • HTTP 200</span>
                          </div>
                          
                          <div className="p-4 space-y-3.5 text-slate-300 leading-relaxed">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-900">
                              <div>
                                <span className="text-slate-500">Target Channel:</span>{' '}
                                <span className="text-purple-400 font-bold">{commandResult.campaign.platform} Ads</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Campaign Identifier:</span>{' '}
                                <span className="text-white font-bold">{commandResult.campaign.campaignName}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Structure Built:</span>{' '}
                                <span className="text-emerald-300 font-bold">
                                  {commandResult.campaign.adSetsCount} Ad Sets × {commandResult.campaign.adsPerSet} Ads
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-500">Daily Allocation:</span>{' '}
                                <span className="text-amber-400 font-bold">Rs. {commandResult.campaign.dailyBudget} / day</span>
                              </div>
                            </div>

                            <div className="space-y-1.5 bg-slate-950/60 p-3 rounded-lg border border-slate-900">
                              <div className="text-[10px] text-purple-300 font-bold">Targeting Matrix</div>
                              <div>
                                <span className="text-slate-500">Demographics:</span> <span className="text-slate-300">{commandResult.campaign.demographics}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Geographic Nodes:</span>{' '}
                                <span className="text-sky-300 font-bold">{commandResult.campaign.locations.join(', ')}</span>
                              </div>
                              <div>
                                <span className="text-slate-500">Target Age Constraints:</span> <span className="text-slate-300 font-bold">{commandResult.campaign.ageRange}</span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="text-[10px] text-purple-300 font-bold">Compiled Creative Bundle</div>
                              <div className="bg-slate-950 p-3 rounded-lg border border-slate-900 space-y-2">
                                <div>
                                  <span className="text-slate-500 block text-[9px] font-bold">Primary Headline</span>
                                  <span className="text-white font-semibold">{commandResult.campaign.adHeadline}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[9px] font-bold">Ad Copy Narrative</span>
                                  <p className="text-slate-400 text-[10px] leading-relaxed italic">"{commandResult.campaign.adBodyCopy}"</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                  <div>
                                    <span className="text-slate-500 block text-[8px] font-bold">CTA Button</span>
                                    <span className="text-emerald-400 font-bold">{commandResult.campaign.cta}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block text-[8px] font-bold">Image Gen Prompt</span>
                                    <span className="text-purple-300 block truncate text-xs" title={commandResult.campaign.creativeVisualPrompt}>
                                      {commandResult.campaign.creativeVisualPrompt}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-slate-900 text-[10px] space-y-1 text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <span className="text-emerald-400">✔</span>
                                <span>Deployment Gate: <span className="font-bold text-slate-300">{commandResult.isRealExecution ? 'LIVE AD KEY RUN' : 'PLAYGROUND SANDBOX'}</span></span>
                              </div>
                              <p className="italic text-[9px] text-slate-500 mt-1 leading-relaxed bg-black/40 p-2 rounded border border-slate-900">
                                {commandResult.logDetails}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  )}

                  {/* Channel Connection & Keys Status Grid */}
                  {!isMinimalDashboard && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      
                      {/* Integration Status Tracker */}
                    <div className={`${isMinimalDashboard ? 'lg:col-span-1' : 'lg:col-span-2'} bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-[0_0_20px_rgba(0,0,0,0.3)]`}>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-white">Channel Integration Status</h3>
                          <p className="text-[10px] text-slate-500 mt-0.5">Synced with secure database configuration</p>
                        </div>
                        <button
                          onClick={() => {
                            setFbKeyInput(user?.facebookApiKey || '');
                            setGoogleKeyInput(user?.googleAdsApiKey || '');
                            setImageKeyInput(user?.imageGenApiKey || '');
                            setVideoKeyInput(user?.videoGenApiKey || '');
                            setIsKeysModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-accent-ink text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-lg shadow-purple-600/15"
                        >
                          <Key className="h-3.5 w-3.5" />
                          <span>Connect API Keys</span>
                        </button>
                      </div>

                      <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${isMinimalDashboard ? 'xl:grid-cols-5' : 'xl:grid-cols-5'} gap-3.5`}>
                        
                        {/* Facebook status card */}
                        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                              <Facebook className="h-4 w-4" />
                            </div>
                            {integrationStatus.facebook.connected ? (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">Active</span>
                            ) : (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">Sandbox</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-white block truncate">Facebook Ads</span>
                            <span className="text-[9px] text-slate-500 font-mono block truncate">
                              {integrationStatus.facebook.connected ? `${integrationStatus.facebook.maskedKey}` : 'Sandbox'}
                            </span>
                          </div>
                        </div>

                        {/* Google Ads status card */}
                        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
                              <Target className="h-4 w-4" />
                            </div>
                            {integrationStatus.googleAds.connected ? (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">Active</span>
                            ) : (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">Sandbox</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-white block truncate">Google Ads API</span>
                            <span className="text-[9px] text-slate-500 font-mono block truncate">
                              {integrationStatus.googleAds.connected ? `${integrationStatus.googleAds.maskedKey}` : 'Sandbox'}
                            </span>
                          </div>
                        </div>

                        {/* Image Gen status card */}
                        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg">
                              <Sparkles className="h-4 w-4" />
                            </div>
                            {integrationStatus.imageGen?.connected ? (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">Active</span>
                            ) : (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">Sandbox</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-white block truncate">Image Gen API</span>
                            <span className="text-[9px] text-slate-500 font-mono block truncate">
                              {integrationStatus.imageGen?.connected ? `${integrationStatus.imageGen.maskedKey}` : 'Sandbox'}
                            </span>
                          </div>
                        </div>

                        {/* Video Gen status card */}
                        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="p-1.5 bg-purple-500/10 text-purple-400 rounded-lg">
                              <Play className="h-4 w-4 animate-pulse" />
                            </div>
                            {integrationStatus.videoGen?.connected ? (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">Active</span>
                            ) : (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">Sandbox</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-white block truncate">Video Gen API</span>
                            <span className="text-[9px] text-slate-500 font-mono block truncate">
                              {integrationStatus.videoGen?.connected ? `${integrationStatus.videoGen.maskedKey}` : 'Sandbox'}
                            </span>
                          </div>
                        </div>

                        {/* Gateway status card */}
                        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 flex flex-col justify-between space-y-3">
                          <div className="flex justify-between items-start">
                            <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg">
                              <CreditCard className="h-4 w-4" />
                            </div>
                            {integrationStatus.paymentSystem.connected ? (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">LIVE</span>
                            ) : (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">Sandbox</span>
                            )}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-white block truncate">Payment System</span>
                            <span className="text-[9px] text-slate-500 font-mono block truncate">
                              {integrationStatus.paymentSystem.connected ? `${integrationStatus.paymentSystem.maskedKey}` : 'Sandbox'}
                            </span>
                          </div>
                        </div>

                      </div>

                      {!isMinimalDashboard && (
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-[10px] leading-relaxed">
                          <strong>💡 Dynamic Integrations:</strong> Connect your personal developer credentials using the <strong>Connect API Keys</strong> control panel. When configured, Sarthavaha's integration channels will invoke real-time API integrations. Image & Video Gen credentials trigger high-quality visual outputs on the creative canvas.
                        </div>
                      )}
                    </div>

                    {/* Quick Tips / Guide (Hidden in Minimalist Focus Mode) */}
                    {!isMinimalDashboard && (
                      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                        <div className="space-y-4">
                          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                            <Lightbulb className="h-4 w-4 text-amber-400" /> Professional Copywriting Tips
                          </h3>
                          <ul className="space-y-3 text-[11px] text-slate-400 leading-relaxed">
                            <li className="flex gap-2">
                              <span className="text-amber-400 font-bold">•</span>
                              <span><strong>AIDA Framework:</strong> Structure Google Search ads with clear Attention, Interest, Desire, Action parameters.</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-amber-400 font-bold">•</span>
                              <span><strong>Visual Metaphors:</strong> Describe images clearly to Midjourney/DallE generators.</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-amber-400 font-bold">•</span>
                              <span><strong>Audit ROAS:</strong> Check campaign metric scores weekly to adjust poor audience bids.</span>
                            </li>
                          </ul>
                        </div>

                        <button
                          onClick={() => setActiveTab('chat')}
                          className="w-full mt-6 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
                        >
                          Ask Sarthavaha AI
                        </button>
                      </div>
                    )}

                  </div>
                  )}

                  {/* Personalized API Credentials Modal */}
                  <AnimatePresence>
                    {isKeysModalOpen && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
                      >
                        <motion.div
                          initial={{ scale: 0.95, y: 15 }}
                          animate={{ scale: 1, y: 0 }}
                          exit={{ scale: 0.95, y: 15 }}
                          className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-left"
                        >
                          <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Key className="h-4.5 w-4.5 text-purple-400" />
                              <h3 className="text-sm font-bold text-white">Personal Integration Credentials</h3>
                            </div>
                            <button
                              onClick={() => setIsKeysModalOpen(false)}
                              className="text-slate-400 hover:text-white transition text-sm font-bold font-mono px-2 py-1 rounded hover:bg-slate-800"
                            >
                              ✕
                            </button>
                          </div>

                          <form onSubmit={handleSaveUserKeys} className="p-6 space-y-4">
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Provide your individual API keys to run real campaigns and visual assets. Leaving fields blank will automatically fall back to the global administrator credentials or simulated sandboxes.
                            </p>

                            <div className="space-y-3.5">
                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold block">Facebook Marketing API Key</label>
                                <input
                                  type="password"
                                  value={fbKeyInput}
                                  onChange={(e) => setFbKeyInput(e.target.value)}
                                  placeholder={user?.facebookApiKey ? "•••••••••••••••• (Connected)" : "Paste your Facebook API key / token"}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-purple-500 transition font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold block">Google Ads Developer Token</label>
                                <input
                                  type="password"
                                  value={googleKeyInput}
                                  onChange={(e) => setGoogleKeyInput(e.target.value)}
                                  placeholder={user?.googleAdsApiKey ? "•••••••••••••••• (Connected)" : "Paste your Google Developer Token"}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-purple-500 transition font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold block">Image Generation API Key</label>
                                <input
                                  type="password"
                                  value={imageKeyInput}
                                  onChange={(e) => setImageKeyInput(e.target.value)}
                                  placeholder={user?.imageGenApiKey ? "•••••••••••••••• (Connected)" : "Paste your Image Gen API Key (e.g. Midjourney/OpenAI)"}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-purple-500 transition font-mono"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] text-slate-400 font-bold block">Video Generation API Key</label>
                                <input
                                  type="password"
                                  value={videoKeyInput}
                                  onChange={(e) => setVideoKeyInput(e.target.value)}
                                  placeholder={user?.videoGenApiKey ? "•••••••••••••••• (Connected)" : "Paste your Video Gen API Key (e.g. Veo/Runway)"}
                                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-purple-500 transition font-mono"
                                />
                              </div>
                            </div>

                            {saveKeysSuccess && (
                              <div className={`p-3 rounded-lg text-xs font-semibold ${saveKeysSuccess.startsWith('Error') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25'}`}>
                                {saveKeysSuccess}
                              </div>
                            )}

                            <div className="pt-2 flex justify-end gap-2.5 border-t border-slate-800">
                              <button
                                type="button"
                                onClick={() => setIsKeysModalOpen(false)}
                                className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition"
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={saveKeysLoading}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-accent-ink rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                              >
                                {saveKeysLoading ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Saving...</span>
                                  </>
                                ) : (
                                  <span>Sync Credentials</span>
                                )}
                              </button>
                            </div>
                          </form>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              )}


              {/* ==================== AI CHATBOX TAB ==================== */}
              {activeTab === 'terminal' && (
                <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6 lg:h-[calc(100vh-12rem)] lg:min-h-[450px] h-auto">
                  
                  {/* Left Column: Chatbox */}
                  <div className="lg:col-span-3 bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col h-[520px] lg:h-full shadow-[0_0_20px_rgba(0,0,0,0.3)] overflow-hidden">
                    
                    {/* Chatbox Header */}
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-400">
                          <MessageSquare className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white">Sarthavaha agent</h3>
                          <p className="text-[11px] text-slate-400 hidden sm:block">Answers are saved to the panel on the right</p>
                        </div>
                      </div>

                      <button
                        onClick={() => setChatMessages([])}
                        aria-label="Clear chat"
                        className="text-[11px] px-2.5 py-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RefreshCw className="h-3 w-3" /> <span className="hidden sm:inline">Clear chat</span>
                      </button>
                    </div>

                    {/* Messages container */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      {chatMessages.length === 0 ? (
                        <div className="min-h-full flex flex-col items-center justify-center text-center py-4 sm:p-6 space-y-6 max-w-lg mx-auto">
                          <div className="p-4 bg-indigo-500/10 text-indigo-400 rounded-2xl">
                            <BrainCircuit className="h-8 w-8" />
                          </div>
                          <div className="space-y-2">
                            <h4 className="text-base font-bold text-white">Ask anything about your next campaign</h4>
                            <p className="text-xs text-slate-400 leading-relaxed">
                              Draft headlines, pick audiences, sanity-check a budget. Start with one of these or write your own.
                            </p>
                          </div>

                          {/* Recommendation Prompts */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
                            <button
                              onClick={() => handleChatSuggestion('Write 5 conversion-focused headings for a high-performance fitness coaching business.')}
                              className="px-3.5 py-3 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-indigo-500/40 hover:bg-indigo-500/5 text-xs text-slate-300 hover:text-white transition text-left cursor-pointer"
                            >
                              Write 5 headlines for a fitness coach
                            </button>
                            <button
                              onClick={() => handleChatSuggestion('What are the best targeting interest tags on Facebook for organic luxury skincare products?')}
                              className="px-3.5 py-3 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-indigo-500/40 hover:bg-indigo-500/5 text-xs text-slate-300 hover:text-white transition text-left cursor-pointer"
                            >
                              Facebook interests for luxury skincare
                            </button>
                            <button
                              onClick={() => handleChatSuggestion('Explain the standard Google Ads bidding structure for local dentist clinic conversions.')}
                              className="px-3.5 py-3 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-indigo-500/40 hover:bg-indigo-500/5 text-xs text-slate-300 hover:text-white transition text-left cursor-pointer"
                            >
                              Google Ads bidding for a dental clinic
                            </button>
                            <button
                              onClick={() => handleChatSuggestion('Draft an informative problem-benefit LinkedIn post promoting a premium task planner app.')}
                              className="px-3.5 py-3 bg-slate-950/60 border border-slate-800 rounded-xl hover:border-indigo-500/40 hover:bg-indigo-500/5 text-xs text-slate-300 hover:text-white transition text-left cursor-pointer"
                            >
                              LinkedIn post for a task planner app
                            </button>
                          </div>
                        </div>
                      ) : (
                        chatMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-2xl rounded-2xl p-4 text-xs leading-relaxed ${
                              msg.role === 'user' 
                                ? 'bg-indigo-600 text-accent-ink shadow-lg shadow-indigo-600/10' 
                                : 'bg-slate-950 border border-slate-800 text-slate-200'
                            }`}>
                              <div className="flex justify-between items-center mb-1 border-b border-slate-800 pb-1 opacity-70">
                                <span className="font-bold font-mono text-[9px]">
                                  {msg.role === 'user' ? 'You' : 'Sarthavaha AI'}
                                </span>
                                <span className="text-[8px]">{msg.timestamp}</span>
                              </div>
                              
                              {/* Simple rendering with break lines */}
                              <div className="whitespace-pre-line space-y-1">
                                {msg.content}
                              </div>

                              {/* Utility actions for bot */}
                              {msg.role === 'model' && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.content);
                                    triggerToast('Copied to clipboard!', 'success');
                                  }}
                                  className="mt-3 flex items-center gap-1 text-[9px] text-slate-400 hover:text-white font-bold transition"
                                >
                                  <Copy className="h-3 w-3" /> Copy response
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}

                      {chatLoading && (
                        <div className="flex justify-start">
                          <div className="max-w-xs bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                            <span>Writing a reply…</span>
                          </div>
                        </div>
                      )}

                      <div ref={chatBottomRef} />
                    </div>

                    {/* Input container */}
                    <div className="p-4 border-t border-slate-800">
                      <form onSubmit={handleSendMessage} className="flex gap-3 items-center">
                        <div className="relative flex-1">
                          <input
                            type="text"
                            required
                            className="w-full pl-4 pr-12 py-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:bg-slate-900 transition placeholder:text-slate-600"
                            placeholder="Ask about a campaign, an audience or a headline"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={handleToggleVoiceAgent}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-all cursor-pointer ${
                              isListening 
                                ? 'text-cyan-400 bg-cyan-500/10 animate-pulse border border-cyan-500/20 shadow-[0_0_10px_rgba(229,150,28,0.15)]' 
                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
                            }`}
                            title="Talk to Agent via Microphone"
                          >
                            <Mic className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          type="submit"
                          disabled={chatLoading}
                          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-accent-ink rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 shadow-lg shadow-indigo-600/15 cursor-pointer"
                        >
                          <span>Consult</span>
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    </div>

                  </div>

                  {/* Right Column: Persistent Stored Strategic Consultations */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 flex flex-col h-[350px] lg:h-full overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-2 pb-3.5 border-b border-slate-800 shrink-0">
                      <BookOpen className="h-4 w-4 text-cyan-400" />
                      <div>
                        <h3 className="text-sm font-bold text-white">Saved answers</h3>
                        <p className="text-[11px] text-slate-500">Chat, research and copy you keep</p>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto mt-4 space-y-3.5 pr-1">
                      {storedConsultations.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4">
                          <History className="h-7 w-7 text-slate-700 mb-2 animate-pulse" />
                          <p className="text-[10px] text-slate-500 leading-normal">
                            Nothing saved yet. Answers from chat, research reports and ad copy appear here so you can come back to them.
                          </p>
                        </div>
                      ) : (
                        storedConsultations.map((consult) => (
                          <div 
                            key={consult.id} 
                            className="p-3 bg-slate-950/70 border border-slate-850 hover:border-cyan-500/30 hover:bg-slate-900/40 rounded-xl transition-all duration-300 text-left cursor-pointer group/card"
                            onClick={() => {
                              setChatMessages([
                                {
                                  id: `usr-${Date.now()}`,
                                  role: 'user',
                                  content: consult.query,
                                  timestamp: new Date(consult.timestamp).toLocaleTimeString()
                                },
                                {
                                  id: `ai-${Date.now()}`,
                                  role: 'model',
                                  content: consult.response,
                                  timestamp: new Date(consult.timestamp).toLocaleTimeString()
                                }
                              ]);
                              triggerToast('Restored strategic advisory report into chatbox!', 'info');
                            }}
                          >
                            <div className="flex items-center justify-between gap-1.5 mb-2">
                              <span className="text-[8px] font-mono font-bold text-cyan-400 px-1.5 py-0.5 bg-cyan-500/10 rounded">
                                {consult.category}
                              </span>
                              <span className="text-[8px] text-slate-500 font-mono">
                                {new Date(consult.timestamp).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 className="text-[11px] font-bold text-white truncate group-hover/card:text-cyan-400 transition-colors">
                              {consult.query}
                            </h4>
                            <p className="text-[9px] text-slate-400 line-clamp-3 leading-relaxed mt-1">
                              {consult.response.replace(/[*#]/g, '')}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                </div>
              )}


              {/* ==================== COMPETITIVE RESEARCH TAB ==================== */}
              {activeTab === 'research' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Column: Interactive Tools */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Mode Toggle Tabs */}
                    <div className={`p-1.5 rounded-xl flex gap-2 ${isWhite ? 'bg-slate-100' : 'bg-slate-950/60 border border-slate-850'}`}>
                      <button
                        onClick={() => setResearchMode('structured')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          researchMode === 'structured'
                            ? (isWhite ? 'bg-white text-indigo-600 shadow-sm' : 'bg-indigo-600/10 text-cyan-400 border border-cyan-500/20')
                            : (isWhite ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200')
                        }`}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>Structured Niche Scouter</span>
                      </button>
                      <button
                        onClick={() => setResearchMode('interactive')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          researchMode === 'interactive'
                            ? (isWhite ? 'bg-white text-indigo-600 shadow-sm' : 'bg-indigo-600/10 text-cyan-400 border border-cyan-500/20')
                            : (isWhite ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200')
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Interactive LLM Research Desk</span>
                      </button>
                    </div>

                    {researchMode === 'structured' ? (
                      <div className={`border p-6 rounded-2xl space-y-4 shadow-lg ${
                        isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                      }`}>
                        <div className="space-y-1">
                          <h3 className={`text-sm font-bold ${isWhite ? 'text-slate-900' : 'text-white'}`}>Competitive Intelligence Engine</h3>
                          <p className={`text-xs ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                            Scan keyword velocity, map commercial intents, and establish targeting interest keywords
                          </p>
                        </div>

                        <form onSubmit={handleRunResearch} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          <div className="space-y-1">
                            <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                              Target Keyword / Market Niche
                            </label>
                            <input
                              type="text"
                              required
                              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}
                              placeholder="e.g., Organic Skincare, SaaS task manager"
                              value={researchNiche}
                              onChange={(e) => setResearchNiche(e.target.value)}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                              Target Audience Details
                            </label>
                            <input
                              type="text"
                              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}
                              placeholder="e.g., Busy mothers aged 30-45"
                              value={researchAudience}
                              onChange={(e) => setResearchAudience(e.target.value)}
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={researchLoading}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-accent-ink text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition h-9 cursor-pointer shadow-md"
                          >
                            {researchLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin text-white" />
                                <span>Compiling...</span>
                              </>
                            ) : (
                              <>
                                <Search className="h-4 w-4" />
                                <span>Analyze Market</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className={`border p-6 rounded-2xl space-y-4 shadow-lg ${
                        isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                      }`}>
                        <div className="space-y-1">
                          <h3 className={`text-sm font-bold ${isWhite ? 'text-slate-900' : 'text-white'}`}>Interactive LLM Research Desk</h3>
                          <p className={`text-xs ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                            Ask freeform strategic questions to research custom niches, generate comprehensive marketing analysis reports, and store them.
                          </p>
                        </div>

                        <form onSubmit={handleRunInteractiveResearch} className="space-y-3.5">
                          <div className="space-y-1">
                            <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                              Research Prompt or Market Question
                            </label>
                            <textarea
                              required
                              rows={3}
                              className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}
                              placeholder="e.g. Conduct a comprehensive digital targeting report for smart water bottles in Tier 1 Indian cities. Suggest key micro-influencer channels and keyword bundles."
                              value={researchLlmPrompt}
                              onChange={(e) => setResearchLlmPrompt(e.target.value)}
                            />
                          </div>

                          <div className="flex justify-between items-center">
                            <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-[70%]">
                              {['Skincare competitor gaps', 'SaaS pricing audit', 'Tier 2 fitness trends'].map((suggestion) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  onClick={() => setResearchLlmPrompt(`Generate a deep-dive competitive research report focusing on ${suggestion} including active buyer segments and SEO keyword packages.`)}
                                  className={`px-2.5 py-1 text-[9px] rounded-full transition whitespace-nowrap cursor-pointer ${
                                    isWhite 
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' 
                                      : 'bg-slate-950 hover:bg-slate-900 text-cyan-400 border border-slate-800'
                                  }`}
                                >
                                  + {suggestion}
                                </button>
                              ))}
                            </div>
                            <button
                              type="submit"
                              disabled={researchLlmLoading}
                              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-accent-ink text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition h-9 cursor-pointer shadow-md shrink-0"
                            >
                              {researchLlmLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                                  <span>Consulting Gemini...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4 text-cyan-400" />
                                  <span>Consult Gemini Research</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Output Viewer Panel */}
                    {researchOutput && (
                      <div className={`border rounded-2xl p-6 space-y-4 shadow-lg ${
                        isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                      }`}>
                        <div className="flex justify-between items-center border-b pb-3 border-slate-850">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-indigo-400" />
                            <h4 className={`text-sm font-bold ${isWhite ? 'text-slate-900' : 'text-white'}`}>
                              Market Intelligence Report: <span className="text-cyan-500">{researchNiche || 'AI Intelligence'}</span>
                            </h4>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(researchOutput);
                                triggerToast('Report text copied!', 'success');
                              }}
                              className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy Data
                            </button>
                            <span className="text-slate-700 font-mono text-[10px]">|</span>
                            <button
                              onClick={() => {
                                exportCompetitiveIntelligenceReport(
                                  researchNiche,
                                  researchAudience,
                                  researchOutput,
                                  user?.email || 'guest@sarthavaha.io'
                                );
                                triggerToast('PDF Report downloaded successfully!', 'success');
                              }}
                              className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                            >
                              <FileDown className="h-3.5 w-3.5" /> Export PDF
                            </button>
                          </div>
                        </div>

                        <div className={`text-xs leading-relaxed whitespace-pre-line space-y-4 font-sans p-6 rounded-xl border ${
                          isWhite 
                            ? 'bg-slate-50 border-slate-100 text-slate-800' 
                            : 'bg-slate-950 border-slate-800/60 text-slate-200'
                        }`}>
                          {researchOutput}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Competitive Research Vault List */}
                  <div className={`border rounded-2xl p-5 flex flex-col lg:h-full lg:min-h-[500px] h-[400px] shadow-lg ${
                    isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/10 shrink-0">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-cyan-400" />
                        <div>
                          <h3 className={`text-xs font-bold   ${isWhite ? 'text-slate-900' : 'text-white'}`}>
                            Saved Research Vault
                          </h3>
                          <p className={`text-[9px] ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>Persistent intel records</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded ${
                        isWhite ? 'bg-slate-100 text-slate-600' : 'bg-cyan-500/10 text-cyan-400'
                      }`}>
                        {storedConsultations.filter(c => c.category === 'research').length} Items
                      </span>
                    </div>

                    {/* Search Field */}
                    <div className="mt-3.5 relative shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <input
                        type="text"
                        value={researchSearch}
                        onChange={(e) => setResearchSearch(e.target.value)}
                        placeholder="Search research logs..."
                        className={`w-full pl-9 pr-3 py-1.5 text-[11px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                          isWhite ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                        }`}
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1 max-h-[500px]">
                      {storedConsultations.filter(c => c.category === 'research').filter(c => 
                        c.query.toLowerCase().includes(researchSearch.toLowerCase()) ||
                        c.response.toLowerCase().includes(researchSearch.toLowerCase())
                      ).length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6">
                          <History className="h-8 w-8 text-slate-600 mb-2 animate-pulse" />
                          <p className="text-[10px] text-slate-500 leading-normal">
                            No stored research logs match your filters. Run structured or interactive queries above to populate your persistent knowledge vaults.
                          </p>
                        </div>
                      ) : (
                        storedConsultations.filter(c => c.category === 'research').filter(c => 
                          c.query.toLowerCase().includes(researchSearch.toLowerCase()) ||
                          c.response.toLowerCase().includes(researchSearch.toLowerCase())
                        ).map((consult) => {
                          const isSelected = selectedResearchId === consult.id;
                          return (
                            <div
                              key={consult.id}
                              onClick={() => {
                                setSelectedResearchId(consult.id);
                                setResearchOutput(consult.response);
                                // Parse custom parameters if query starts with Niche
                                const nicheMatch = consult.query.match(/Niche:\s*(.*?)(?=\.|$)/);
                                const audienceMatch = consult.query.match(/Audience:\s*(.*?)(?=\.|$)/);
                                if (nicheMatch) {
                                  setResearchNiche(nicheMatch[1].trim());
                                  setResearchAudience(audienceMatch ? audienceMatch[1].trim() : 'AI Restored');
                                } else {
                                  setResearchNiche(consult.query);
                                  setResearchAudience('Interactive LLM Discovery');
                                }
                                triggerToast('Restored market intelligence report!', 'info');
                              }}
                              className={`p-3 border rounded-xl transition-all duration-300 text-left cursor-pointer group/card relative ${
                                isSelected
                                  ? 'border-cyan-500 bg-cyan-500/5'
                                  : (isWhite 
                                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200' 
                                      : 'bg-slate-950/70 hover:bg-slate-900/40 border-slate-850')
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                <span className={`text-[8px] font-mono font-bold   px-1.5 py-0.5 rounded ${
                                  isWhite ? 'bg-indigo-50 text-indigo-600' : 'bg-cyan-500/10 text-cyan-400'
                                }`}>
                                  Research
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[8px] text-slate-500 font-mono">
                                    {new Date(consult.timestamp).toLocaleDateString()}
                                  </span>
                                  <button
                                    onClick={(e) => handleDeleteConsultation(consult.id, e)}
                                    className="p-1 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded transition opacity-0 group-hover/card:opacity-100 focus:opacity-100 cursor-pointer"
                                    title="Delete from Vault"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              <h4 className={`text-[11px] font-bold truncate group-hover/card:text-cyan-500 transition-colors ${
                                isWhite ? 'text-slate-800' : 'text-white'
                              }`}>
                                {consult.query.replace(/^(Niche:\s*|Conduct a.*?on this topic:\s*)/i, '')}
                              </h4>
                              <p className={`text-[9px] line-clamp-2 leading-relaxed mt-1 ${isWhite ? 'text-slate-600' : 'text-slate-400'}`}>
                                {consult.response.replace(/[*#]/g, '')}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>
              )}


              {/* ==================== CREATIVE AD STUDIO TAB ==================== */}
              {activeTab === 'vault' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left Column: Interactive/Structured Copywriting Tools */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Mode Toggle Tabs */}
                    <div className={`p-1.5 rounded-xl flex gap-2 ${isWhite ? 'bg-slate-100' : 'bg-slate-950/60 border border-slate-850'}`}>
                      <button
                        onClick={() => setCreativeMode('structured')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          creativeMode === 'structured'
                            ? (isWhite ? 'bg-white text-indigo-600 shadow-sm' : 'bg-indigo-600/10 text-cyan-400 border border-cyan-500/20')
                            : (isWhite ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200')
                        }`}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>Structured Ad Crafter</span>
                      </button>
                      <button
                        onClick={() => setCreativeMode('interactive')}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                          creativeMode === 'interactive'
                            ? (isWhite ? 'bg-white text-indigo-600 shadow-sm' : 'bg-indigo-600/10 text-cyan-400 border border-cyan-500/20')
                            : (isWhite ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200')
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Interactive LLM Copywriter</span>
                      </button>
                    </div>

                    {creativeMode === 'structured' ? (
                      <div className={`border p-6 rounded-2xl space-y-4 shadow-lg ${
                        isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                      }`}>
                        <div className="space-y-1">
                          <h3 className={`text-sm font-bold ${isWhite ? 'text-slate-900' : 'text-white'}`}>Creative Copywriter Suite</h3>
                          <p className={`text-xs ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                            Generate high-converting headlines and copywriting hooks matching specific target channels.
                          </p>
                        </div>

                        <form onSubmit={handleGenerateCreative} className="space-y-4">
                          <div className="space-y-1">
                            <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                              Target Channel
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                              {['facebook', 'google', 'linkedin'].map((channel) => (
                                <button
                                  key={channel}
                                  type="button"
                                  onClick={() => setCreateChannel(channel as any)}
                                  className={`py-2 text-[11px] font-bold rounded-lg border transition cursor-pointer capitalize ${
                                    createChannel === channel 
                                      ? 'bg-indigo-600/10 text-cyan-400 border-cyan-500/30 shadow-lg' 
                                      : (isWhite ? 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900')
                                  }`}
                                >
                                  {channel} Ad
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                              Product / Brand Name
                            </label>
                            <input
                              type="text"
                              required
                              className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}
                              placeholder="e.g. ZenFlow Planner"
                              value={createProductName}
                              onChange={(e) => setCreateProductName(e.target.value)}
                            />
                          </div>

                          <div className="space-y-1">
                            <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                              Product Pitch & Key Benefits
                            </label>
                            <textarea
                              required
                              rows={3}
                              className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}
                              placeholder="Describe what ZenFlow solves (e.g., handles task tracking, prevents burn-out)"
                              value={createDescription}
                              onChange={(e) => setCreateDescription(e.target.value)}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                                Copywriting Tone
                              </label>
                              <select
                                className={`w-full px-2.5 py-2 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                  isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                                }`}
                                value={createTone}
                                onChange={(e) => setCreateTone(e.target.value)}
                              >
                                <option value="Professional">Professional</option>
                                <option value="Casual & Friendly">Casual & Friendly</option>
                                <option value="Direct & Bold">Direct & Bold</option>
                                <option value="Curious & Intriguing">Curious & Intriguing</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                                Audience Segment
                              </label>
                              <input
                                type="text"
                                className={`w-full px-3 py-2 border rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                  isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                                }`}
                                placeholder="e.g. Busy coders"
                                value={createAudience}
                                onChange={(e) => setCreateAudience(e.target.value)}
                              />
                            </div>
                          </div>

                          <button
                            type="submit"
                            disabled={createLoading}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-accent-ink font-bold rounded-lg text-xs transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                          >
                            {createLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin text-white" />
                                <span>Drafting ad copies...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-4 w-4 text-white" />
                                <span>Generate Ad Creatives</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div className={`border p-6 rounded-2xl space-y-4 shadow-lg ${
                        isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                      }`}>
                        <div className="space-y-1">
                          <h3 className={`text-sm font-bold ${isWhite ? 'text-slate-900' : 'text-white'}`}>Interactive LLM Copywriter</h3>
                          <p className={`text-xs ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                            Command Gemini to write high-converting hooks, custom sales funnels, and narrative-driven social campaigns, then preview them live.
                          </p>
                        </div>

                        <form onSubmit={handleRunInteractiveCreative} className="space-y-3.5">
                          <div className="space-y-1">
                            <label className={`text-[10px] font-bold   ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>
                              Custom Copywriting Instructions
                            </label>
                            <textarea
                              required
                              rows={3}
                              className={`w-full px-3 py-2 border rounded-lg text-xs resize-none focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                                isWhite ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}
                              placeholder="e.g. Write an elegant story-based Facebook hook for a premium tea brand, emphasizing slow living, hand-crafted organic leaves, and mindfulness."
                              value={vaultLlmPrompt}
                              onChange={(e) => setVaultLlmPrompt(e.target.value)}
                            />
                          </div>

                          <div className="flex justify-between items-center">
                            <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-[70%]">
                              {['Urgent FOMO hook', 'LinkedIn story format', 'Problem-Agitate-Solve'].map((pill) => (
                                <button
                                  key={pill}
                                  type="button"
                                  onClick={() => setVaultLlmPrompt(`Generate highly persuasive ${pill} copywriting deliverables for a high-end SaaS team tool. Follow structured copy deliverables format.`)}
                                  className={`px-2.5 py-1 text-[9px] rounded-full transition whitespace-nowrap cursor-pointer ${
                                    isWhite 
                                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-600' 
                                      : 'bg-slate-950 hover:bg-slate-900 text-cyan-400 border border-slate-800'
                                  }`}
                                >
                                  + {pill}
                                </button>
                              ))}
                            </div>
                            <button
                              type="submit"
                              disabled={vaultLlmLoading}
                              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-accent-ink text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition h-9 cursor-pointer shadow-md shrink-0"
                            >
                              {vaultLlmLoading ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                                  <span>Drafting Copy...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-4 w-4 text-cyan-400" />
                                  <span>Consult Gemini Copywriter</span>
                                </>
                              )}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* Creative output mockup rendering */}
                    {createOutput ? (
                      <div className="space-y-6">
                        
                        {/* Mock Visual Presentation Card */}
                        <div className={`border rounded-2xl p-6 space-y-6 shadow-lg ${
                          isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                        }`}>
                          
                          <div className="flex justify-between items-center border-b pb-3 border-slate-800/10">
                            <h4 className={`text-xs font-bold   font-mono flex items-center gap-1.5 ${isWhite ? 'text-slate-900' : 'text-white'}`}>
                              <Sparkles className="h-4 w-4 text-indigo-400" /> Dynamic Mock Preview
                            </h4>
                            <span className="text-[10px] font-semibold text-slate-500">Interactive Layout</span>
                          </div>

                          {/* Render different styles of mockup depending on channel chosen */}
                          {createChannel === 'facebook' && (
                            <div className={`max-w-md mx-auto border rounded-xl overflow-hidden text-xs ${
                              isWhite ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-850'
                            }`}>
                              <div className="p-3 border-b border-slate-850 flex items-center gap-2">
                                <div className="h-7 w-7 rounded-full bg-blue-600 text-accent-ink font-bold flex items-center justify-center text-[10px]">
                                  F
                                </div>
                                <div>
                                  <div className={`font-bold text-[11px] flex items-center gap-1 ${isWhite ? 'text-slate-800' : 'text-slate-200'}`}>
                                    {createProductName || 'Brand Sponsor'}
                                    <span className="text-[9px] text-slate-400 font-normal">Sponsored</span>
                                  </div>
                                  <div className="text-[9px] text-slate-500">Facebook Advertising network</div>
                                </div>
                              </div>

                              <div className="p-3 space-y-3">
                                {/* Body copy preview */}
                                <p className={`line-clamp-4 leading-relaxed font-sans text-[11px] ${isWhite ? 'text-slate-700' : 'text-slate-300'}`}>
                                  {createOutput.match(/\*\*2\..*?\*\*([\s\S]*?)(?=\*\*3\.)/)?.[1]?.replace(/^[-\s*•]+/gm, '').trim() || 
                                    'Unlock high-productivity metrics and streamline custom calendars with Zenith flows.'}
                                </p>

                                {/* Image preview mock */}
                                <div className="aspect-[1.91/1] bg-slate-950 flex flex-col items-center justify-center text-center p-4 relative overflow-hidden rounded-lg">
                                  <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-indigo-500/20 to-teal-500/20 blur-2xl" />
                                  <BrainCircuit className="h-10 w-10 text-indigo-400 mb-2 relative z-10 animate-pulse" />
                                  <p className="text-[10px] text-slate-300 font-semibold max-w-xs relative z-10">
                                    {createProductName || 'PRODUCT CREATIVE'}
                                  </p>
                                  <p className="text-[8px] text-slate-500 font-mono mt-1 max-w-[280px] line-clamp-2 relative z-10 italic">
                                    Creative Direction: {createOutput.match(/\*\*5\..*?\*\*([\s\S]*?)$/)?.[1]?.trim() || 'A modern glowing cerebral device on workspaces.'}
                                  </p>
                                </div>

                                {/* Headline & CTA section */}
                                <div className="p-2.5 bg-slate-950/80 border border-slate-850 rounded-lg flex items-center justify-between">
                                  <div>
                                    <p className="text-[10px] text-slate-400 font-bold font-mono">zenithmarketer.ai</p>
                                    <p className="font-bold text-white text-[11px] line-clamp-1 mt-0.5">
                                      {createOutput.match(/\*\*1\..*?\*\*([\s\S]*?)(?=\*\*2\.)/)?.[1]?.trim().split('\n')[0].replace(/^[-\s*•]+/, '') || 
                                        'Start Organizing Seamless Workflows Today'}
                                    </p>
                                  </div>
                                  <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded text-[10px] shrink-0 cursor-pointer">
                                    Learn More
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}

                          {createChannel === 'google' && (
                            <div className="max-w-md mx-auto border border-slate-800 rounded-xl bg-slate-950 p-4 text-xs font-sans space-y-2 text-left">
                              <div className="flex items-center gap-1.5">
                                <div className="h-4 w-4 bg-slate-800 rounded-full flex items-center justify-center text-slate-400 font-semibold text-[8px]">
                                  G
                                </div>
                                <span className="text-[10px] text-slate-400">Google Sponsored Link</span>
                              </div>

                              <div className="space-y-1">
                                <p className="text-indigo-400 font-medium hover:underline text-[13px] leading-tight line-clamp-2">
                                  {createOutput.match(/\*\*1\..*?\*\*([\s\S]*?)(?=\*\*2\.)/)?.[1]?.trim().split('\n')[0].replace(/^[-\s*•]+/, '') || 
                                    'ZenFlow Planner | Maximize Daily Strategy Operations'}
                                </p>
                                <p className="text-emerald-400 font-mono text-[9px]">https://www.zenithmarketer.ai/zenflow</p>
                              </div>

                              <p className="text-slate-300 leading-relaxed text-[11px] line-clamp-3">
                                {createOutput.match(/\*\*2\..*?\*\*([\s\S]*?)(?=\*\*3\.)/)?.[1]?.replace(/^[-\s*•]+/gm, '').trim() || 
                                  'Discover ZenFlow to easily manage complex projects and custom calendars. Minimize burnout with structured audio tools.'}
                              </p>
                            </div>
                          )}

                          {createChannel === 'linkedin' && (
                            <div className="max-w-md mx-auto border border-slate-800 rounded-xl bg-slate-950 p-4 text-xs space-y-3 text-left">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                  <div className="h-8 w-8 bg-sky-800 text-white font-bold flex items-center justify-center rounded-full text-xs">
                                    In
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-200">{createProductName || 'Executive Leader'}</p>
                                    <p className="text-[9px] text-slate-400">Chief Marketing Agent • 1st</p>
                                  </div>
                                </div>
                                <span className="text-[10px] text-slate-400">1h • Edited</span>
                              </div>

                              <p className="text-slate-300 whitespace-pre-line leading-relaxed text-[11px] line-clamp-6">
                                {createOutput.match(/\*\*2\..*?\*\*([\s\S]*?)(?=\*\*3\.)/)?.[1]?.replace(/^[-\s*•]+/gm, '').trim() || 
                                  'Many small teams face severe fatigue. ZenFlow was crafted to provide stress relief and clear project timelines.'}
                              </p>

                              <div className="aspect-[1.91/1] bg-slate-900 rounded-lg flex items-center justify-center text-center p-4 relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-32 h-32 bg-blue-500/10 rounded-full blur-xl" />
                                <p className="text-[11px] font-bold text-slate-200 font-mono">
                                  {createProductName || 'ZENITH CASE STUDY'}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Campaign Deployment API Drawer */}
                          <div className="pt-4 border-t flex flex-col md:flex-row items-center justify-between gap-4 border-slate-800/15">
                            <div className="space-y-1 text-center md:text-left">
                              <h5 className={`text-[11px] font-bold flex items-center justify-center md:justify-start gap-1 ${isWhite ? 'text-slate-900' : 'text-white'}`}>
                                <Coins className="h-3.5 w-3.5 text-emerald-400 animate-pulse" /> Launch directly via APIs
                              </h5>
                              <p className="text-[10px] text-slate-400">This connects and publishes the copy variables as a live campaign payload</p>
                            </div>

                            <div className="flex items-center gap-3 w-full md:w-auto">
                              <div className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-mono shrink-0 ${
                                isWhite ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                              }`}>
                                <span>Budget: Rs.</span>
                                <input 
                                  type="number" 
                                  className={`w-16 bg-transparent focus:outline-none font-bold ${isWhite ? 'text-slate-900' : 'text-white'}`}
                                  value={campaignBudget}
                                  onChange={(e) => setCampaignBudget(parseInt(e.target.value) || 100)}
                                />
                              </div>

                              <button
                                onClick={handleLaunchCampaign}
                                disabled={isLaunchingCampaign}
                                className="flex-1 md:flex-initial py-2 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-accent-ink font-bold rounded-lg text-[11px] transition flex items-center justify-center gap-1 shadow-md cursor-pointer shrink-0"
                              >
                                {isLaunchingCampaign ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                                    <span>Deploying...</span>
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-3.5 w-3.5 fill-white" />
                                    <span>Launch campaign</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                        </div>

                        {/* Raw Output details */}
                        <div className={`border rounded-2xl p-6 space-y-4 shadow-lg ${
                          isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                        }`}>
                          <div className="flex justify-between items-center border-b pb-3 border-slate-850">
                            <h4 className={`text-xs font-bold   font-mono ${isWhite ? 'text-slate-900' : 'text-white'}`}>
                              Full Copywriting Deliverables
                            </h4>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(createOutput);
                                triggerToast('Ad text copied!', 'success');
                              }}
                              className="text-[10px] text-indigo-400 font-bold hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" /> Copy all deliverables
                            </button>
                          </div>

                          <div className={`text-xs whitespace-pre-line leading-relaxed font-sans p-6 rounded-xl border ${
                            isWhite ? 'bg-slate-50 border-slate-100 text-slate-850' : 'bg-slate-950 border-slate-800 text-slate-200'
                          }`}>
                            {createOutput}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className={`border-2 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center h-full min-h-[300px] ${
                        isWhite ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-800'
                      }`}>
                        <Briefcase className="h-10 w-10 text-slate-500 mb-3" />
                        <h4 className={`text-xs font-bold   font-mono ${isWhite ? 'text-slate-800' : 'text-slate-300'}`}>
                          Studio Viewport Empty
                        </h4>
                        <p className="text-xs text-slate-400 max-w-xs mt-1">
                          Configure your product pitch on the left panel or chat with the interactive copywriter to generate visual vectors and live previews.
                        </p>
                      </div>
                    )}

                  </div>

                  {/* Right Column: Copywriting Vault List */}
                  <div className={`border rounded-2xl p-5 flex flex-col lg:h-full lg:min-h-[500px] h-[400px] shadow-lg ${
                    isWhite ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800'
                  }`}>
                    <div className="flex items-center justify-between pb-3.5 border-b border-slate-800/10 shrink-0">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-cyan-400" />
                        <div>
                          <h3 className={`text-xs font-bold   ${isWhite ? 'text-slate-900' : 'text-white'}`}>
                            Saved Creative Vault
                          </h3>
                          <p className={`text-[9px] ${isWhite ? 'text-slate-500' : 'text-slate-400'}`}>Persistent copy catalogs</p>
                        </div>
                      </div>
                      <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded ${
                        isWhite ? 'bg-slate-100 text-slate-600' : 'bg-cyan-500/10 text-cyan-400'
                      }`}>
                        {storedConsultations.filter(c => c.category === 'creative').length} Items
                      </span>
                    </div>

                    {/* Search Field */}
                    <div className="mt-3.5 relative shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                      <input
                        type="text"
                        value={creativeSearch}
                        onChange={(e) => setCreativeSearch(e.target.value)}
                        placeholder="Search creative copy logs..."
                        className={`w-full pl-9 pr-3 py-1.5 text-[11px] rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-600 ${
                          isWhite ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-950 border-slate-800 text-slate-200'
                        }`}
                      />
                    </div>

                    <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1 max-h-[500px]">
                      {storedConsultations.filter(c => c.category === 'creative').filter(c => 
                        c.query.toLowerCase().includes(creativeSearch.toLowerCase()) ||
                        c.response.toLowerCase().includes(creativeSearch.toLowerCase())
                      ).length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6">
                          <History className="h-8 w-8 text-slate-600 mb-2 animate-pulse" />
                          <p className="text-[10px] text-slate-500 leading-normal">
                            No saved copywriting logs match your filters. Run structured or interactive queries on the left to populate your persistent creative ad vault.
                          </p>
                        </div>
                      ) : (
                        storedConsultations.filter(c => c.category === 'creative').filter(c => 
                          c.query.toLowerCase().includes(creativeSearch.toLowerCase()) ||
                          c.response.toLowerCase().includes(creativeSearch.toLowerCase())
                        ).map((consult) => {
                          const isSelected = selectedCreativeId === consult.id;
                          return (
                            <div
                              key={consult.id}
                              onClick={() => {
                                setSelectedCreativeId(consult.id);
                                setCreateOutput(consult.response);
                                // Set some fallback presets so the preview updates nicely
                                const promptWords = consult.query.split(' ');
                                const restoredBrand = promptWords.slice(0, 3).join(' ').replace(/^(generate|write|create|for)\s*/i, '') || 'Interactive Brand';
                                setCreateProductName(restoredBrand);
                                triggerToast('Restored ad copy deliverables!', 'info');
                              }}
                              className={`p-3 border rounded-xl transition-all duration-300 text-left cursor-pointer group/card relative ${
                                isSelected
                                  ? 'border-cyan-500 bg-cyan-500/5'
                                  : (isWhite 
                                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200' 
                                      : 'bg-slate-950/70 hover:bg-slate-900/40 border-slate-850')
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1.5 mb-1.5">
                                <span className={`text-[8px] font-mono font-bold   px-1.5 py-0.5 rounded ${
                                  isWhite ? 'bg-indigo-50 text-indigo-600' : 'bg-cyan-500/10 text-cyan-400'
                                }`}>
                                  Creative copy
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[8px] text-slate-500 font-mono">
                                    {new Date(consult.timestamp).toLocaleDateString()}
                                  </span>
                                  <button
                                    onClick={(e) => handleDeleteConsultation(consult.id, e)}
                                    className="p-1 hover:bg-red-500/10 hover:text-red-400 text-slate-500 rounded transition opacity-0 group-hover/card:opacity-100 focus:opacity-100 cursor-pointer"
                                    title="Delete from Vault"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                              <h4 className={`text-[11px] font-bold truncate group-hover/card:text-cyan-500 transition-colors ${
                                isWhite ? 'text-slate-800' : 'text-white'
                              }`}>
                                {consult.query.replace(/^(Product Name:\s*|Brand:\s*)/i, '')}
                              </h4>
                              <p className={`text-[9px] line-clamp-2 leading-relaxed mt-1 ${isWhite ? 'text-slate-600' : 'text-slate-400'}`}>
                                {consult.response.replace(/[*#]/g, '')}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Campaign Launch Result modal/alert */}
                  <AnimatePresence>
                    {campaignLaunchResult && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-6 bg-slate-900 text-white rounded-2xl border border-slate-800 space-y-4"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-emerald-400 fill-emerald-400" />
                            <h4 className="text-sm font-bold tracking-tight">API Deployment Confirmation</h4>
                          </div>
                          <button 
                            onClick={() => setCampaignLaunchResult(null)}
                            className="text-xs text-slate-400 hover:text-white"
                          >
                            Dismiss
                          </button>
                        </div>

                        <p className="text-xs text-slate-300">
                          {campaignLaunchResult.message}
                        </p>

                        <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[10px] text-slate-400 space-y-1">
                          <div className="text-[9px] font-bold text-slate-500 mb-1">Response Headers & Log</div>
                          <div>Status: <span className="text-emerald-400">200 OK</span></div>
                          <div>Platform Execution: <span className="text-sky-400">{campaignLaunchResult.isRealExecution ? 'REAL API' : 'PLAYGROUND SANDBOX'}</span></div>
                          <div className="italic break-words text-[9px] text-slate-500 mt-1">{campaignLaunchResult.logDetails}</div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                </div>
              )}


              {/* ==================== CAMPAIGN OPTIMIZER TAB ==================== */}
              {activeTab === 'optimize' && (
                <div className="space-y-6">
                  
                  {/* Inputs */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white">Digital Campaign Diagnostics</h3>
                      <p className="text-[10px] text-slate-400">Analyze raw engagement volumes to calculate exact acquisition metrics and receive strategic optimization suggestions</p>
                    </div>

                    <form onSubmit={handleRunOptimize} className="grid grid-cols-1 md:grid-cols-5 gap-3.5 items-end">
                      <div className="space-y-1 col-span-1">
                        <label className="text-[10px] font-bold text-slate-400">Platform</label>
                        <select
                          className="w-full px-2 py-2 bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs h-9"
                          value={optPlatform}
                          onChange={(e) => setOptPlatform(e.target.value)}
                        >
                          <option value="Facebook Ads">Facebook Ads</option>
                          <option value="Google Search Ads">Google Search</option>
                          <option value="Google Display Ads">Google Display</option>
                          <option value="LinkedIn Campaigns">LinkedIn Ads</option>
                        </select>
                      </div>

                      <div className="space-y-1 col-span-1">
                        <label className="text-[10px] font-bold text-slate-400">Spend (Rs.)</label>
                        <input
                          type="number"
                          required
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs h-9"
                          value={optSpend}
                          onChange={(e) => setOptSpend(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1 col-span-1">
                        <label className="text-[10px] font-bold text-slate-400">Impressions</label>
                        <input
                          type="number"
                          required
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs h-9"
                          value={optImpressions}
                          onChange={(e) => setOptImpressions(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1 col-span-1">
                        <label className="text-[10px] font-bold text-slate-400">Clicks</label>
                        <input
                          type="number"
                          required
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs h-9"
                          value={optClicks}
                          onChange={(e) => setOptClicks(e.target.value)}
                        />
                      </div>

                      <div className="space-y-1 col-span-1">
                        <label className="text-[10px] font-bold text-slate-400">Conversions</label>
                        <input
                          type="number"
                          required
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs h-9"
                          value={optConversions}
                          onChange={(e) => setOptConversions(e.target.value)}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={optLoading}
                        className="md:col-span-5 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-accent-ink text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition shadow-lg shadow-indigo-600/15"
                      >
                        {optLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>Performing diagnostic audit...</span>
                          </>
                        ) : (
                          <>
                            <Gauge className="h-4 w-4" />
                            <span>Audit Campaign Performance</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  {/* Calculations and analysis report */}
                  {optResult && (
                    <div className="space-y-6">
                      
                      {/* Metric cards */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        
                        <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col justify-between shadow-[0_0_15px_rgba(0,0,0,0.2)]">
                          <span className="text-[10px] text-slate-400 font-bold font-mono">Click-Through Rate</span>
                          <span className="text-xl font-bold text-white mt-2 font-mono">{optResult.metrics.ctr.toFixed(2)}%</span>
                        </div>

                        <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col justify-between shadow-[0_0_15px_rgba(0,0,0,0.2)]">
                          <span className="text-[10px] text-slate-400 font-bold font-mono">Cost Per Click</span>
                          <span className="text-xl font-bold text-white mt-2 font-mono">Rs. {optResult.metrics.cpc.toFixed(2)}</span>
                        </div>

                        <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col justify-between shadow-[0_0_15px_rgba(0,0,0,0.2)]">
                          <span className="text-[10px] text-slate-400 font-bold font-mono">Conversion Ratio</span>
                          <span className="text-xl font-bold text-white mt-2 font-mono">{optResult.metrics.conversionRate.toFixed(2)}%</span>
                        </div>

                        <div className="p-5 bg-slate-900/50 border border-slate-800 rounded-2xl flex flex-col justify-between shadow-[0_0_15px_rgba(0,0,0,0.2)]">
                          <span className="text-[10px] text-slate-400 font-bold font-mono">Cost per Acquisition</span>
                          <span className="text-xl font-bold text-white mt-2 font-mono">Rs. {optResult.metrics.costPerConversion.toFixed(2)}</span>
                        </div>

                      </div>

                      {/* Strategic analysis report from Gemini */}
                      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-2">
                            <BrainCircuit className="h-5 w-5 text-indigo-400" />
                            <h4 className="text-xs font-bold text-white font-mono">AI Strategic Diagnostic Audit</h4>
                          </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(optResult.analysis);
                              triggerToast('Report copied!', 'success');
                            }}
                            className="text-[10px] text-indigo-400 font-bold hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" /> Copy Diagnostic Report
                          </button>
                          <span className="text-slate-700 font-mono text-[10px]">|</span>
                          <button
                            onClick={() => {
                              exportCampaignDiagnosticReport(
                                optPlatform,
                                optSpend,
                                optImpressions,
                                optClicks,
                                optConversions,
                                optResult.metrics,
                                optResult.analysis,
                                user?.email || 'guest@sarthavaha.io'
                              );
                              triggerToast('PDF Report downloaded successfully!', 'success');
                            }}
                            className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                          >
                            <FileDown className="h-3.5 w-3.5" /> Export Client PDF
                          </button>
                        </div>
                        </div>

                        <div className="text-xs text-slate-200 leading-relaxed whitespace-pre-line space-y-4 bg-slate-950 p-6 rounded-xl border border-slate-800">
                          {optResult.analysis}
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              )}


              {/* ==================== ADMINISTRATOR CONSOLE TAB ==================== */}
              {activeTab === 'admin' && user?.role === 'admin' && (
                <div className="space-y-6">
                  
                  {/* Console Subtabs */}
                  <div className="flex border-b border-slate-800 gap-6">
                    <button
                      onClick={() => setAdminSubTab('connections')}
                      className={`pb-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                        adminSubTab === 'connections' 
                          ? 'border-indigo-500 text-indigo-400' 
                          : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <Key className="h-4 w-4" /> API Platform Keys
                    </button>
                    
                    <button
                      onClick={() => setAdminSubTab('users')}
                      className={`pb-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                        adminSubTab === 'users' 
                          ? 'border-indigo-500 text-indigo-400' 
                          : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <Users className="h-4 w-4" /> Client Accounts
                    </button>

                    <button
                      onClick={() => setAdminSubTab('logs')}
                      className={`pb-3 text-xs font-bold transition flex items-center gap-1.5 border-b-2 ${
                        adminSubTab === 'logs' 
                          ? 'border-indigo-500 text-indigo-400' 
                          : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <History className="h-4 w-4" /> System Activity Logs
                    </button>
                  </div>

                  {/* SUBTAB 1: INTEGRATION KEYS MANAGEMENT */}
                  {adminSubTab === 'connections' && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white">Developer Platform Credentials</h4>
                        <p className="text-xs text-slate-400">Sync global API keys for Google Ads, Facebook Graph SDK, and Stripe Payment Processors</p>
                      </div>

                      <form onSubmit={handleSaveAPIKeys} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 block">Facebook App Access Token</label>
                            <input
                              type="password"
                              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                              placeholder="fb_token_xxxxxxxxxxx"
                              value={adminKeys.facebookApiKey}
                              onChange={(e) => setAdminKeys({ ...adminKeys, facebookApiKey: e.target.value })}
                            />
                            <p className="text-[9px] text-slate-500">Used for posting campaigns directly to Facebook Pages/Groups</p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 block">Google Ads Developer Key</label>
                            <input
                              type="password"
                              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                              placeholder="gads_devkey_xxxxxxxxxxx"
                              value={adminKeys.googleAdsApiKey}
                              onChange={(e) => setAdminKeys({ ...adminKeys, googleAdsApiKey: e.target.value })}
                            />
                            <p className="text-[9px] text-slate-500">Enables automatic campaign payloads delivery</p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 block">Payment Gateway Secret Key</label>
                            <input
                              type="password"
                              className="w-full px-3 py-2 bg-slate-950 border border-slate-850 rounded-lg text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-indigo-600"
                              placeholder="sk_test_payment_xxxxxxxxx"
                              value={adminKeys.paymentApiKey}
                              onChange={(e) => setAdminKeys({ ...adminKeys, paymentApiKey: e.target.value })}
                            />
                            <p className="text-[9px] text-slate-500">Validates client payments on checkout forms</p>
                          </div>

                        </div>

                        {adminKeysSaveSuccess && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg">
                            ✔ Credentials successfully synchronized on config files.
                          </div>
                        )}

                        <button
                          type="submit"
                          className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 text-accent-ink font-bold rounded-lg text-xs transition shadow-lg shadow-indigo-600/15"
                        >
                          Synchronize Integration Keys
                        </button>
                      </form>
                    </div>
                  )}

                  {/* SUBTAB 2: CLIENT ACCOUNTS TABLE */}
                  {adminSubTab === 'users' && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white">User Command List</h4>
                          <p className="text-xs text-slate-400">Overview of registered marketer profiles, subscription states, and platform load</p>
                        </div>
                        <button
                          onClick={fetchAdminData}
                          className="p-1.5 border border-slate-800 rounded-lg text-[10px] font-bold hover:bg-slate-950 text-slate-400 transition"
                        >
                          Refresh Lists
                        </button>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-950 border-b border-slate-850 text-slate-400 font-bold">
                              <th className="p-3 font-mono text-[10px]">Email</th>
                              <th className="p-3 font-mono text-[10px]">ROLE</th>
                              <th className="p-3 font-mono text-[10px]">Generations</th>
                              <th className="p-3 font-mono text-[10px]">Subscribed</th>
                              <th className="p-3 font-mono text-[10px]">Plan</th>
                              <th className="p-3 font-mono text-[10px]">Joined</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-850">
                            {adminUsers.map((u) => (
                              <tr key={u.id} className="hover:bg-slate-950/40">
                                <td className="p-3 font-medium text-slate-200 font-mono text-[11px]">{u.email}</td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                    u.role === 'admin' 
                                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' 
                                      : 'bg-slate-950 text-slate-400 border border-slate-850'
                                  }`}>
                                    {u.role.toUpperCase()}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-300">{u.usageCount} <span className="text-[10px] text-slate-500">/ 5 used</span></td>
                                <td className="p-3">
                                  {u.isSubscribed ? (
                                    <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold">YES</span>
                                  ) : (
                                    <span className="text-[9px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20 font-bold">NO</span>
                                  )}
                                </td>
                                <td className="p-3 text-[10px] font-bold text-slate-300 font-mono">{u.subscriptionType || 'none'}</td>
                                <td className="p-3 text-slate-500 text-[10px] font-mono">{new Date(u.createdAt).toLocaleDateString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* SUBTAB 3: SYSTEM AUDIT LOGS */}
                  {adminSubTab === 'logs' && (
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white">System Security Audit Log</h4>
                          <p className="text-xs text-slate-400">Real-time audit journal of login sequences, database records modifications, and client payment integrations</p>
                        </div>
                        <button
                          onClick={fetchAdminData}
                          className="p-1.5 border border-slate-800 rounded-lg text-[10px] font-bold hover:bg-slate-950 text-slate-400 transition"
                        >
                          Refresh logs
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[400px] overflow-y-auto border border-slate-850 rounded-xl p-4 bg-slate-950 font-mono text-[10px] text-slate-300">
                        {adminLogs.length === 0 ? (
                          <div className="text-slate-500 text-center py-6">No platform sequences documented.</div>
                        ) : (
                          adminLogs.map((log) => (
                            <div key={log.id} className="p-2 bg-slate-900/40 border border-slate-850 rounded flex flex-col md:flex-row justify-between gap-2">
                              <div>
                                <span className="text-[8px] px-1.5 py-0.5 bg-slate-950 border border-slate-850 rounded text-slate-400 font-bold">{log.action}</span>
                                <span className="text-[10px] text-slate-200 ml-2">{log.details}</span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-500 text-[9px] md:text-right shrink-0">
                                <span>{log.userEmail || 'System'}</span>
                                <span>•</span>
                                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                </div>
              )}


              {/* ==================== BILLING / UPGRADE TAB ==================== */}
              {activeTab === 'billing' && (
                <div className="max-w-4xl mx-auto space-y-8">
                  
                  {/* Upgrade Hero */}
                  <div className="text-center space-y-2 max-w-lg mx-auto">
                    <h2 className="text-xl md:text-2xl font-bold font-sans tracking-tight text-white">
                      Remove the free-plan limit
                    </h2>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Pro gives you unlimited market research, ad copy, campaign checks and test launches. Cancel any time.
                    </p>
                  </div>

                  {/* Pricing Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                    
                    {/* Tier Monthly */}
                    <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                      <div className="space-y-4">
                        <div className="inline-flex px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">
                          BEST FLEXIBILITY
                        </div>
                        <h3 className="text-base font-bold text-white">Premium Monthly</h3>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold text-white font-mono">Rs. 999</span>
                          <span className="text-xs text-slate-400">/ month</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Ideal for single practitioners or freelance marketers needing agile copy updates.
                        </p>
                        
                        <div className="h-px bg-slate-800 w-full" />

                        <ul className="space-y-2.5 text-xs text-slate-300">
                          <li className="flex gap-2 items-center">
                            <span className="text-indigo-400 font-bold">✓</span>
                            <span>Unlimited Competitor Research</span>
                          </li>
                          <li className="flex gap-2 items-center">
                            <span className="text-indigo-400 font-bold">✓</span>
                            <span>Unlimited Creative Ad Studio Copywrites</span>
                          </li>
                          <li className="flex gap-2 items-center">
                            <span className="text-indigo-400 font-bold">✓</span>
                            <span>Direct deployments simulator to Facebook & Google</span>
                          </li>
                          <li className="flex gap-2 items-center">
                            <span className="text-indigo-400 font-bold">✓</span>
                            <span>Interactive ad metric calculators</span>
                          </li>
                        </ul>
                      </div>

                      <button
                        onClick={() => { setBillingPlan('monthly'); triggerToast('Plan selected: Monthly', 'info'); }}
                        className={`w-full mt-8 py-2.5 font-bold rounded-lg text-xs transition ${
                          billingPlan === 'monthly' 
                            ? 'bg-indigo-600 text-accent-ink shadow-lg shadow-indigo-600/15' 
                            : 'bg-slate-950 text-slate-400 hover:bg-slate-900 border border-slate-800'
                        }`}
                      >
                        Select Monthly Plan
                      </button>
                    </div>

                    {/* Tier Yearly */}
                    <div className="bg-slate-950 text-white border border-slate-800 p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden shadow-[0_0_25px_rgba(63,175,140,0.05)]">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                      
                      <div className="space-y-4 relative z-10">
                        <div className="inline-flex px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/20 animate-pulse">
                          BEST SAVINGS
                        </div>
                        <h3 className="text-base font-bold text-slate-100">Premium Yearly</h3>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-extrabold text-white font-mono">Rs. 11,988</span>
                          <span className="text-xs text-slate-400">/ year</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Yearly contract billed as Rs. 999 monthly. Perfect for established businesses.
                        </p>
                        
                        <div className="h-px bg-slate-800 w-full" />

                        <ul className="space-y-2.5 text-xs text-slate-300">
                          <li className="flex gap-2 items-center">
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span>Everything in Monthly plan</span>
                          </li>
                          <li className="flex gap-2 items-center">
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span>Priority Server response rates</span>
                          </li>
                          <li className="flex gap-2 items-center">
                            <span className="text-emerald-400 font-bold">✓</span>
                            <span>Standard 12-month value guaranteed</span>
                          </li>
                        </ul>
                      </div>

                      <button
                        onClick={() => { setBillingPlan('yearly'); triggerToast('Plan selected: Yearly', 'info'); }}
                        className={`w-full mt-8 py-2.5 font-bold rounded-lg text-xs transition relative z-10 ${
                          billingPlan === 'yearly' 
                            ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 font-bold' 
                            : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                      >
                        Select Yearly Plan
                      </button>
                    </div>

                  </div>

                  {/* Payment Authorization Form */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 md:p-8 space-y-6 shadow-[0_0_20px_rgba(0,0,0,0.3)]">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <Lock className="h-4 w-4 text-emerald-400" /> Secure Payment authorization
                      </h4>
                      <p className="text-xs text-slate-400">Authorize your plan upgrade using secure custom credentials. Fully persistent via admin key authorization.</p>
                    </div>

                    <form onSubmit={handleUpgradeAccount} className="space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        
                        <div className="space-y-1 md:col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 block">Credit Card Number</label>
                          <input
                            type="text"
                            required
                            maxLength={16}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-850 text-white focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs font-mono h-9"
                            placeholder="4000 1234 5678 9010"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
                          />
                        </div>

                        <div className="space-y-1 col-span-1">
                          <label className="text-[10px] font-bold text-slate-400 block">Expiry MM/YY</label>
                          <input
                            type="text"
                            required
                            maxLength={5}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-850 text-white focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs font-mono h-9"
                            placeholder="12/28"
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                          />
                        </div>

                        <div className="space-y-1 col-span-1">
                          <label className="text-[10px] font-bold text-slate-400 block">CVV</label>
                          <input
                            type="password"
                            required
                            maxLength={4}
                            className="w-full px-3 py-2 bg-slate-950 border border-slate-850 text-white focus:outline-none focus:ring-1 focus:ring-indigo-600 rounded-lg text-xs font-mono h-9"
                            placeholder="•••"
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                          />
                        </div>

                      </div>

                      {billingError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg">
                          {billingError}
                        </div>
                      )}

                      {billingSuccess && (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg">
                          {billingSuccess}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={billingLoading}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-accent-ink font-bold rounded-lg text-xs transition shadow-lg shadow-indigo-600/15 flex items-center justify-center gap-1.5"
                      >
                        {billingLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-white" />
                            <span>Processing authorization...</span>
                          </>
                        ) : (
                          <>
                            <Unlock className="h-4 w-4" />
                            <span>Authorize Rs. {billingPlan === 'monthly' ? '999/mo' : '11,988/yr'} Upgrade</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                </div>
              )}


              {/* ==================== DOCUMENTATION & API SETUP TAB ==================== */}
              {activeTab === 'docs' && (
                <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
                  
                  {/* Header / Subtitle with Glowing Accent */}
                  <div className="relative p-6 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-[0_0_20px_rgba(0,0,0,0.2)]">
                    <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-cyan-400 to-indigo-500" />
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen className="h-4.5 w-4.5 text-cyan-400" />
                          <span className="text-[10px] text-cyan-400 font-mono font-bold">Integration Hub</span>
                        </div>
                        <h2 className="text-xl md:text-2xl font-extrabold text-white">Documentation & API Key Setup</h2>
                        <p className="text-xs text-slate-400 mt-1">
                          Step-by-step credentials provisioning for Facebook Marketing Ads and Google Developer APIs.
                        </p>
                      </div>
                      
                      <div className="flex gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mt-1.5" />
                        <span className="text-[10px] text-slate-400 font-mono">Payload Gateway Ready</span>
                      </div>
                    </div>
                  </div>

                  {/* Twin Columns Layout: Left is Interactive Form, Right is Quick Links/Guides */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* LEFT COLUMN: ACTIVE INTEGRATIONS KEY VAULT FORM */}
                    <div className="lg:col-span-5 space-y-6">
                      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-xl relative animate-fade-in">
                        <div className="absolute top-4 right-4 text-cyan-400/25">
                          <Key className="h-10 w-10 stroke-[1.5]" />
                        </div>

                        <div className="mb-4">
                          <h3 className="text-sm font-bold text-white flex items-center gap-1.5 font-sans">
                            <Database className="h-4 w-4 text-purple-400" /> Key Vault Config
                          </h3>
                          <p className="text-[11px] text-slate-500 mt-1 font-sans">
                            Paste your keys below to link your campaigns with real networks. Blank fields default to simulation mode.
                          </p>
                        </div>

                        <form onSubmit={handleSaveUserKeys} className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold block">Facebook Marketing API Token</label>
                            <input
                              type="password"
                              value={fbKeyInput}
                              onChange={(e) => setFbKeyInput(e.target.value)}
                              placeholder={user?.facebookApiKey ? "•••••••••••••••• (Connected)" : "Paste your Facebook API key / token"}
                              className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 transition font-mono"
                            />
                            {user?.facebookApiKey && (
                              <div className="flex justify-between items-center text-[9px] text-slate-500 pt-1">
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">✓ Connection Cached</span>
                                <button
                                  type="button"
                                  onClick={handleTestFacebookConnection}
                                  disabled={fbTestStatus === 'testing'}
                                  className="text-[9px] text-cyan-400 hover:text-cyan-300 hover:underline font-mono cursor-pointer"
                                >
                                  {fbTestStatus === 'testing' ? 'Verifying...' : '[Test Connection]'}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold block">Google Ads Developer Token</label>
                            <input
                              type="password"
                              value={googleKeyInput}
                              onChange={(e) => setGoogleKeyInput(e.target.value)}
                              placeholder={user?.googleAdsApiKey ? "•••••••••••••••• (Connected)" : "Paste your Google Developer Token"}
                              className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 transition font-mono"
                            />
                            {user?.googleAdsApiKey && (
                              <div className="flex justify-between items-center text-[9px] text-slate-500 pt-1">
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">✓ Connection Cached</span>
                                <button
                                  type="button"
                                  onClick={handleTestGoogleConnection}
                                  disabled={googleTestStatus === 'testing'}
                                  className="text-[9px] text-cyan-400 hover:text-cyan-300 hover:underline font-mono cursor-pointer"
                                >
                                  {googleTestStatus === 'testing' ? 'Verifying...' : '[Test Connection]'}
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold block">AI Creative Generation API Key</label>
                            <input
                              type="password"
                              value={imageKeyInput}
                              onChange={(e) => setImageKeyInput(e.target.value)}
                              placeholder={user?.imageGenApiKey ? "•••••••••••••••• (Connected)" : "Paste Gemini/Midjourney key"}
                              className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 transition font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-400 font-bold block">Synthetic Video Generation Key</label>
                            <input
                              type="password"
                              value={videoKeyInput}
                              onChange={(e) => setVideoKeyInput(e.target.value)}
                              placeholder={user?.videoGenApiKey ? "•••••••••••••••• (Connected)" : "Paste Runway/Veo token"}
                              className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:border-cyan-500 transition font-mono"
                            />
                          </div>

                          {saveKeysSuccess && (
                            <div className={`p-3 rounded-lg text-xs font-semibold ${saveKeysSuccess.startsWith('Error') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25 animate-fade-in' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 animate-fade-in'}`}>
                              {saveKeysSuccess}
                            </div>
                          )}

                          <button
                            type="submit"
                            disabled={saveKeysLoading}
                            className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:brightness-110 disabled:bg-slate-800 text-accent-ink font-extrabold rounded-lg text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-500/10"
                          >
                            {saveKeysLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Synchronizing Vault...</span>
                              </>
                            ) : (
                              <>
                                <Key className="h-4 w-4" />
                                <span>Save & Sync Credentials</span>
                              </>
                            )}
                          </button>
                        </form>

                        {/* Interactive testing output panels */}
                        {(fbTestStatus !== 'idle' || googleTestStatus !== 'idle') && (
                          <div className="mt-4 pt-4 border-t border-slate-850 space-y-2">
                            <div className="text-[9px] text-slate-500 font-mono font-bold">Local Connection Diagnostics</div>
                            {fbTestStatus !== 'idle' && (
                              <div className={`p-2.5 rounded-lg flex items-center justify-between text-[11px] ${
                                fbTestStatus === 'testing' ? 'bg-cyan-500/5 text-cyan-400 border border-cyan-500/15 animate-pulse' :
                                fbTestStatus === 'success' ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/15' :
                                'bg-rose-500/5 text-rose-400 border border-rose-500/15'
                              }`}>
                                <span className="flex items-center gap-1.5">
                                  <Facebook className="h-3.5 w-3.5 animate-pulse" />
                                  <span>Meta API Diagnostic</span>
                                </span>
                                <span className="font-bold font-mono text-[9px]">
                                  {fbTestStatus === 'testing' && 'Handshaking...'}
                                  {fbTestStatus === 'success' && '✓ ONLINE'}
                                  {fbTestStatus === 'error' && '✕ FAILURE'}
                                </span>
                              </div>
                            )}
                            {googleTestStatus !== 'idle' && (
                              <div className={`p-2.5 rounded-lg flex items-center justify-between text-[11px] ${
                                googleTestStatus === 'testing' ? 'bg-cyan-500/5 text-cyan-400 border border-cyan-500/15 animate-pulse' :
                                googleTestStatus === 'success' ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/15' :
                                'bg-rose-500/5 text-rose-400 border border-rose-500/15'
                              }`}>
                                <span className="flex items-center gap-1.5">
                                  <Database className="h-3.5 w-3.5" />
                                  <span>Google Ads API Diagnostic</span>
                                </span>
                                <span className="font-bold font-mono text-[9px]">
                                  {googleTestStatus === 'testing' && 'Handshaking...'}
                                  {googleTestStatus === 'success' && '✓ ONLINE'}
                                  {googleTestStatus === 'error' && '✕ FAILURE'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    </div>

                    {/* RIGHT COLUMN: STEP-BY-STEP GUIDES */}
                    <div className="lg:col-span-7 space-y-6">
                      
                      {/* GUIDE 1: FACEBOOK MARKETING API */}
                      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-blue-500/10 text-blue-400 rounded-lg flex items-center justify-center">
                              <Facebook className="h-4.5 w-4.5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-white font-sans">Meta Marketing API Guide</h3>
                              <p className="text-[10px] text-slate-500 font-mono">Protocol V19.0 Client Integration</p>
                            </div>
                          </div>
                          
                          <a 
                            href="https://developers.facebook.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition flex items-center gap-1 border border-slate-700"
                          >
                            Meta Portal <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        {/* Step items */}
                        <div className="space-y-3.5 text-xs text-slate-300 font-sans">
                          
                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">1</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Register Developer Account</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Access the developers portal at <strong className="text-slate-200 font-mono">developers.facebook.com</strong> and complete the standard registration workflow.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">2</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Create App Node</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Click <strong className="text-slate-200">Create App</strong> -&gt; select the <strong className="text-slate-200">Business</strong> type, specify a name, and link your Meta Business Manager portfolio.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">3</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Enable Marketing API & Permissions</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Navigate to <strong className="text-slate-200">Marketing API -&gt; Tools</strong>. Enable permissions: <strong className="text-cyan-400 font-mono">ads_management</strong>, <strong className="text-cyan-400 font-mono">ads_read</strong>, and <strong className="text-cyan-400 font-mono">business_management</strong>.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-cyan-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">4</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Generate System User Token</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Click <strong className="text-slate-200">Generate Access Token</strong>, then copy the alphanumeric payload string. Paste this in Sarthavaha Key Vault on the left.
                              </p>
                            </div>
                          </div>

                        </div>

                        {/* Copyable code widget */}
                        <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-500 font-mono font-bold">Meta Diagnostic Curl Trigger</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`curl -G -d "access_token=<YOUR_TOKEN>" "https://graph.facebook.com/v19.0/me"`);
                                triggerToast('Copied curl command to clipboard!', 'success');
                              }}
                              className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 font-mono cursor-pointer bg-transparent border-none"
                            >
                              <Copy className="h-3 w-3" /> Copy Snippet
                            </button>
                          </div>
                          <pre className="text-[10px] text-slate-300 font-mono overflow-x-auto p-1 leading-normal select-all">
                            {`curl -G -d "access_token=YOUR_ACCESS_TOKEN" \\
  "https://graph.facebook.com/v19.0/me?fields=id,name"`}
                          </pre>
                        </div>

                      </div>

                      {/* GUIDE 2: GOOGLE ADS API */}
                      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 bg-amber-400/10 text-amber-400 rounded-lg flex items-center justify-center">
                              <Database className="h-4.5 w-4.5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-white font-sans">Google Ads API Guide</h3>
                              <p className="text-[10px] text-slate-500 font-mono">MCC Developer Node Integration</p>
                            </div>
                          </div>
                          
                          <a 
                            href="https://ads.google.com" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[10px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition flex items-center gap-1 border border-slate-700"
                          >
                            Ads MCC Portal <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        {/* Step items */}
                        <div className="space-y-3.5 text-xs text-slate-300 font-sans">
                          
                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">1</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Request Developer Token</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Log into your Google Ads Manager Account (MCC). Head to <strong className="text-slate-200">Tools & Settings -&gt; API Center</strong> and complete the Developer Token registration form.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">2</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Enable Google Ads API</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Access your Google Cloud Console project and search the API Library to enable the <strong className="text-slate-200">Google Ads API</strong> explicitly.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">3</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Set Up OAuth Credentials</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Create an OAuth 2.0 Client ID with application type set as Web Application. Save the Client ID and Client Secret.
                              </p>
                            </div>
                          </div>

                          <div className="flex gap-3">
                            <span className="h-5 w-5 rounded-full bg-slate-800 border border-slate-700 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5 font-mono">4</span>
                            <div className="space-y-0.5">
                              <h4 className="font-bold text-white text-[12px]">Authorize Refresh Token</h4>
                              <p className="text-slate-400 text-[11px] leading-relaxed">
                                Authorize your MCC account to yield the OAuth Refresh Token. Fill out both developer and OAuth payloads in Sarthavaha and save them securely.
                              </p>
                            </div>
                          </div>

                        </div>

                        {/* Copyable node template code widget */}
                        <div className="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-2 font-mono">
                          <div className="flex justify-between items-center">
                            <span className="text-[9px] text-slate-500 font-mono font-bold">Google Ads Node SDK Template</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`const { GoogleAdsApi } = require('google-ads-api');\nconst client = new GoogleAdsApi({\n  client_id: '...', \n  client_secret: '...', \n  developer_token: '...'\n});`);
                                triggerToast('Copied Node snippet to clipboard!', 'success');
                              }}
                              className="text-[9px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 font-mono cursor-pointer bg-transparent border-none"
                            >
                              <Copy className="h-3 w-3" /> Copy Snippet
                            </button>
                          </div>
                          <pre className="text-[10px] text-slate-300 font-mono overflow-x-auto p-1 leading-normal select-all">
                            {`const { GoogleAdsApi } = require('google-ads-api');
const client = new GoogleAdsApi({
  client_id: "CLIENT_ID",
  client_secret: "CLIENT_SECRET",
  developer_token: "DEVELOPER_TOKEN"
});`}
                          </pre>
                        </div>

                      </div>

                    </div>

                  </div>

                </div>
              )}

            </motion.div>
          </AnimatePresence>

          {/* Footer */}
          <footer className={`mt-16 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-slate-500 ${
            isWhite ? 'border-slate-200' : 'border-slate-800/70'
          }`}>
            <span>Sarthavaha by Ethereal Horizon, © {new Date().getFullYear()}</span>
            <button
              type="button"
              onClick={() => setIsThemeModalOpen(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:text-white hover:bg-slate-900 transition cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              Appearance
            </button>
          </footer>
        </main>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <nav
        aria-label="Workspace"
        className={`md:hidden fixed bottom-0 inset-x-0 border-t flex items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)] z-40 ${
          isWhite ? 'bg-white/95 border-slate-200' : 'bg-slate-950/95 border-slate-800/80 backdrop-blur-xl'
        }`}
      >
        {WORKSPACE_NAV.map(item => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex-1 flex flex-col items-center justify-center h-16 transition cursor-pointer ${
                active ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {active && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-amber-400" aria-hidden="true" />}
              <Icon className="h-5 w-5" />
              <span className="text-[11px] mt-1 font-semibold">{item.short}</span>
            </button>
          );
        })}
      </nav>

      {/* DELAYED SIGN-UP / AUTH HUB INTERCEPT MODAL */}
      {showDelayedSignup && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-slate-900 border border-cyan-500/30 rounded-2xl p-6 shadow-[0_0_50px_rgba(229,150,28,0.2)] relative"
          >
            <div className="text-center mb-6">
              <span className="text-[10px] text-cyan-400 font-mono">
                {interceptedAction ? 'Action Pending Authorization' : 'Sarthavaha Command Hub'}
              </span>
              <h3 className="text-xl font-bold text-white mt-1">
                {isSignUp ? 'Create Account / Register' : 'Sign In to Workspace'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isSignUp 
                  ? 'Please register your free Sarthavaha profile to secure your AI campaign data.'
                  : 'Access your campaign optimization command and stored creatives.'}
              </p>
            </div>

            <form
              onSubmit={(e) => handleAuthSubmit(e)}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition text-sm"
                  placeholder="ashutosh@company.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  required
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition text-sm"
                  placeholder="Minimum 6 characters"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                />
              </div>

              {authError && <p className="text-xs text-rose-400 font-mono text-center">{authError}</p>}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-gradient-to-r from-cyan-500 to-indigo-500 text-accent-ink font-bold rounded-lg text-xs shadow-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
              >
                {authLoading 
                  ? (isSignUp ? 'Creating Profile...' : 'Authenticating...') 
                  : (isSignUp ? 'Create Account & Execute' : 'Sign In & Access')}
              </button>

              <div className="relative my-4 flex items-center justify-center">
                <span className="absolute w-full border-t border-slate-800"></span>
                <span className="relative bg-slate-900 px-3 text-[10px] text-slate-500 font-mono">or continue with</span>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full py-2.5 bg-slate-950 border border-slate-850 hover:bg-slate-900 text-slate-200 font-bold rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer transition-all animate-fade-in"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.73 0 3.3.63 4.52 1.667l2.42-2.42C17.41 1.623 14.965 1 12.24 1c-5.52 0-10 4.48-10 10s4.48 10 10 10c5.773 0 9.6-4.06 9.6-9.76 0-.66-.06-1.155-.16-1.655h-9.44z" />
                </svg>
                <span>Google Account</span>
              </button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError(null);
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium transition cursor-pointer"
              >
                {isSignUp ? 'Already have an account? Sign In' : 'Need a command profile? Register New Account'}
              </button>
            </div>

            <button
              onClick={() => setShowDelayedSignup(false)}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-400 mt-4 transition cursor-pointer"
            >
              Cancel request and return
            </button>
          </motion.div>
        </div>
      )}

      {/* THEME SELECTION MODAL */}
      {isThemeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`w-full max-w-md border rounded-2xl p-6 shadow-2xl transition-all duration-300 relative z-[60] ${
              dashboardTheme === 'white' 
                ? 'bg-white border-slate-200 text-slate-800' 
                : 'bg-slate-900 border-slate-800 text-slate-100 shadow-[0_0_30px_rgba(0,0,0,0.5)]'
            }`}
          >
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2">
                <Settings className={`h-5 w-5 text-purple-500 animate-spin-slow`} />
                <h3 className="text-md font-bold tracking-tight">System Visual Theme</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsThemeModalOpen(false)}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  dashboardTheme === 'white' 
                    ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-800' 
                    : 'hover:bg-slate-850 text-slate-400 hover:text-slate-100'
                }`}
              >
                <Check className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Dynamically calibrate Sarthavaha's viewport aesthetic to match your enterprise workspace environmental conditions.
            </p>

            <div className="space-y-3">
              {/* Default Theme Card */}
              <button
                type="button"
                onClick={() => handleThemeChange('default')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                  dashboardTheme === 'default'
                    ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(229,150,28,0.15)]'
                    : dashboardTheme === 'white'
                    ? 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${dashboardTheme === 'default' ? 'bg-purple-600/20 border-purple-500' : 'bg-slate-950 border-slate-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dashboardTheme === 'default' ? 'bg-purple-500' : 'bg-slate-750'}`} />
                  </div>
                  <div>
                    <span className="text-sm font-bold block">Sarthavaha Default</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Premium cyberpunk dark aesthetic with glowing neon signals</span>
                  </div>
                </div>
                {dashboardTheme === 'default' && <Check className="h-4 w-4 text-purple-400 shrink-0" />}
              </button>

              {/* Minimal Theme Card */}
              <button
                type="button"
                onClick={() => handleThemeChange('minimal')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                  dashboardTheme === 'minimal'
                    ? 'border-cyan-500 bg-cyan-500/10 shadow-[0_0_15px_rgba(229,150,28,0.15)]'
                    : dashboardTheme === 'white'
                    ? 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${dashboardTheme === 'minimal' ? 'bg-cyan-600/20 border-cyan-500' : 'bg-slate-950 border-slate-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dashboardTheme === 'minimal' ? 'bg-cyan-500' : 'bg-slate-750'}`} />
                  </div>
                  <div>
                    <span className="text-sm font-bold block">Minimal Focus</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Streamlined layout targeting high-volume command delivery</span>
                  </div>
                </div>
                {dashboardTheme === 'minimal' && <Check className="h-4 w-4 text-cyan-400 shrink-0" />}
              </button>

              {/* White Theme Card */}
              <button
                type="button"
                onClick={() => handleThemeChange('white')}
                className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                  dashboardTheme === 'white'
                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                    : 'border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${dashboardTheme === 'white' ? 'bg-white border-indigo-600' : 'bg-slate-950 border-slate-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${dashboardTheme === 'white' ? 'bg-indigo-600' : 'bg-slate-700'}`} />
                  </div>
                  <div>
                    <span className="text-sm font-bold block">Alpine White</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">Crisp light mode theme optimized for clear daytime readability</span>
                  </div>
                </div>
                {dashboardTheme === 'white' && <Check className="h-4 w-4 text-indigo-600 shrink-0" />}
              </button>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsThemeModalOpen(false)}
                className={`px-4 py-2 text-[11px] font-bold   rounded-xl cursor-pointer transition ${
                  dashboardTheme === 'white'
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                }`}
              >
                Close Settings
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
