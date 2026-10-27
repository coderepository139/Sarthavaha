import React, { useRef, useState } from 'react';
import { BarChart3, BrainCircuit, Check, Database, FileText, Mail, Mic, Rocket, Search, Sparkles, Target, Terminal } from 'lucide-react';
import { motion } from 'motion/react';

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

/**
 * The workspace is the AdPilot console at /console: Google sign-in, then the dashboard where the
 * agent creates, launches and monitors campaigns on the user's connected ad accounts.
 * `section` is a console page (dashboard, agent, campaigns, billing, ...); `prompt` pre-fills the agent.
 */
function openConsole(section = 'dashboard', prompt?: string) {
  const query = prompt ? `?prompt=${encodeURIComponent(prompt)}` : '';
  window.location.href = `/console/${query}#${section}`;
}

export default function App() {
  const [landingPrompt, setPrompt] = useState('');
  // The example buttons set the prompt and open the console in the same click, before React
  // re-renders, so the latest prompt is also kept in a ref.
  const latestPrompt = useRef('');
  const setLandingPrompt = (value: string) => {
    latestPrompt.current = value;
    setPrompt(value);
  };
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterSubscribed, setNewsletterSubscribed] = useState(false);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(0);

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newsletterEmail.trim()) setNewsletterSubscribed(true);
  };

  // "Plan my campaign" / "Review this plan": take the idea straight to the agent.
  const handleConsultClick = () => openConsole('agent', latestPrompt.current.trim());

  const handlePricingCTA = (_planName: string) => openConsole('billing');

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
              onClick={() => openConsole()}
              className="hidden sm:block px-3.5 py-2 text-[13px] font-semibold text-slate-300 hover:text-white rounded-lg hover:bg-slate-900 transition cursor-pointer"
            >
              Sign in
            </button>
            <button
              onClick={() => openConsole('agent')}
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
                <li><button onClick={() => openConsole('agent')} className="hover:text-cyan-400 transition">Strategy chat</button></li>
                <li><button onClick={() => openConsole('dashboard')} className="hover:text-cyan-400 transition">Dashboard</button></li>
                <li><button onClick={() => openConsole('agent')} className="hover:text-cyan-400 transition">Market research</button></li>
                <li><button onClick={() => openConsole('campaigns')} className="hover:text-cyan-400 transition">Ad library</button></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-3 text-[10px]">Company</h4>
              <ul className="space-y-2 text-[11px]">
                <li><a href="#about" onClick={(e) => { e.preventDefault(); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-cyan-400 transition">Ethereal Horizon</a></li>
                <li><a href="mailto:support@sarthavaha.com" className="hover:text-cyan-400 transition">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-white mb-3 text-[10px]">Legal</h4>
              <ul className="space-y-2 text-[11px]">
                <li><a href="/terms" className="hover:text-cyan-400 transition">Terms of service</a></li>
                <li><a href="/privacy" className="hover:text-cyan-400 transition">Privacy policy</a></li>
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
