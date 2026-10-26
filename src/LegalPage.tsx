import React, { useEffect, useState } from 'react';
import { isAnalyticsOptedOut, setAnalyticsOptOut } from './lib/analytics';

/**
 * Privacy policy and terms of service.
 *
 * DRAFT: written to follow India's Digital Personal Data Protection Act, 2023 and
 * DPDP Rules, 2025. Fill in the bracketed company details below and have a lawyer
 * review both documents before relying on them.
 */
const LEGAL = {
  company: 'Ethereal Horizon',
  legalName: '[Registered company name]',
  address: '[Registered office address, City, State, PIN]',
  grievanceOfficer: '[Grievance Officer name]',
  privacyEmail: 'privacy@sarthavaha.com',
  supportEmail: 'support@sarthavaha.com',
  jurisdiction: '[City]',
  effective: '26 October 2026',
};

type Doc = 'privacy' | 'terms';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-white tracking-[-0.01em]">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-[1.7] text-slate-300 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-white [&_a]:text-amber-300 [&_a]:underline [&_a]:underline-offset-2">
        {children}
      </div>
    </section>
  );
}

function AnalyticsToggle() {
  const [optedOut, setOptedOut] = useState(() => isAnalyticsOptedOut());
  return (
    <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-sm text-slate-300">
        {optedOut ? 'Analytics is off in this browser.' : 'Analytics is on in this browser.'}
      </p>
      <button
        type="button"
        onClick={() => { setAnalyticsOptOut(!optedOut); setOptedOut(!optedOut); }}
        className="px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-500 text-sm font-semibold text-white cursor-pointer"
      >
        {optedOut ? 'Turn analytics on' : 'Turn analytics off'}
      </button>
    </div>
  );
}

function Privacy() {
  return (
    <>
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-[-0.03em] text-white">Privacy policy</h1>
      <p className="mt-3 text-slate-400">Effective {LEGAL.effective}</p>
      <p className="mt-6 text-[17px] leading-relaxed text-slate-300">
        This policy explains what personal data Sarthavaha collects, why, who we share it with, and how you can
        see, correct or delete it. It is written for the Digital Personal Data Protection Act, 2023 and the DPDP Rules, 2025.
      </p>

      <Section title="Who we are">
        <p>
          Sarthavaha (sarthavaha.com) is run by {LEGAL.company} ({LEGAL.legalName}), {LEGAL.address}. For the purposes of the
          DPDP Act we are the <strong>Data Fiduciary</strong> for the personal data described here.
        </p>
      </Section>

      <Section title="What we collect">
        <ul>
          <li><strong>Account details:</strong> your email address and name if you sign in with Google, your mobile number if you sign in with a one-time code, or your email address if you use a password.</li>
          <li><strong>What you ask the agent:</strong> your prompts, business and product details, target audiences, budgets, and the research, ad copy and images generated for you.</li>
          <li><strong>Connection keys you add:</strong> API keys or tokens for Facebook, Google Ads or image and video tools, used only to act on your behalf.</li>
          <li><strong>Usage and device data:</strong> how many generations you have used, actions in your account, time stamps, IP address, browser and device type.</li>
          <li><strong>How you found us:</strong> the website or campaign link that brought you here (for example an Instagram post), stored with your account when you sign up.</li>
          <li><strong>Payments:</strong> when you upgrade, payment is handled by our payment provider. We do not store your full card number.</li>
        </ul>
      </Section>

      <Section title="Why we use it">
        <ul>
          <li>To create and secure your account and sign you in.</li>
          <li>To generate research, ad copy, targeting and campaigns you ask for.</li>
          <li>To push campaigns to ad platforms when you tell us to.</li>
          <li>To apply plan limits, prevent abuse, and keep the service running.</li>
          <li>To understand which channels bring people to Sarthavaha and improve the product (analytics).</li>
          <li>To contact you about your account, and with product news only if you opt in.</li>
          <li>To meet legal obligations.</li>
        </ul>
        <p>
          We process your data on the basis of the consent you give when you sign in, which you can withdraw at any time,
          and for legitimate uses permitted under the DPDP Act, such as complying with the law.
        </p>
      </Section>

      <Section title="Who we share it with">
        <p>We do not sell your personal data. We share it only with service providers that process it for us:</p>
        <ul>
          <li><strong>Google Firebase and Google Cloud:</strong> sign-in, SMS codes, database and hosting.</li>
          <li><strong>Google Gemini API:</strong> your prompts and business details are sent to generate results.</li>
          <li><strong>Google Analytics:</strong> usage and visit-source data, without advertising features.</li>
          <li><strong>Meta and Google Ads:</strong> only campaign content you choose to publish through your connected account.</li>
          <li><strong>Our payment provider:</strong> to process upgrades.</li>
        </ul>
        <p>
          These providers may store data on servers outside India. Any transfer follows the restrictions the Government of India
          sets under the DPDP Act.
        </p>
      </Section>

      <Section title="How long we keep it">
        <ul>
          <li>Account data and saved work: while your account is open. When you delete your account we erase it within 30 days, unless the law requires us to keep something longer.</li>
          <li>Activity logs used for security and abuse prevention: up to 180 days.</li>
          <li>Analytics data: up to 14 months.</li>
          <li>If an account is inactive for 3 years, we may delete it after giving you notice.</li>
        </ul>
      </Section>

      <Section title="Your rights">
        <p>You can ask us to:</p>
        <ul>
          <li>Give you a summary of the personal data we hold about you and how we use it.</li>
          <li>Correct, complete or update it.</li>
          <li>Erase it and close your account.</li>
          <li>Stop processing that relies on your consent, by withdrawing consent.</li>
          <li>Nominate someone to exercise these rights if you die or become unable to.</li>
        </ul>
        <p>
          Email <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a> from the address or number on your account.
          We reply within 30 days and always within the time limits set by the DPDP Rules. Withdrawing consent is as easy as giving it,
          but it may mean we can no longer provide the service.
        </p>
      </Section>

      <Section title="Analytics">
        <p>
          We use Google Analytics to count visits, sign-ups and first uses by source. Advertising features are off.
          You can turn analytics off for this browser here:
        </p>
        <AnalyticsToggle />
      </Section>

      <Section title="Children">
        <p>
          Sarthavaha is for businesses and people aged 18 and over. We do not knowingly collect data from anyone under 18.
          If you believe a child has signed up, contact us and we will delete the account.
        </p>
      </Section>

      <Section title="Security and breaches">
        <p>
          Data is encrypted in transit, access is limited to people who need it, and API keys are masked in the interface.
          If a personal data breach affects you, we will tell you and the Data Protection Board of India as the law requires,
          including what happened and what you can do.
        </p>
      </Section>

      <Section title="Grievance Officer">
        <p>
          {LEGAL.grievanceOfficer}<br />
          {LEGAL.company}, {LEGAL.address}<br />
          <a href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>
        </p>
        <p>
          If you are not satisfied with our response, you can complain to the Data Protection Board of India.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we make significant changes we will tell you by email or in the app before they take effect. The date at the top
          shows when this policy last changed.
        </p>
      </Section>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1 className="text-4xl md:text-5xl font-extrabold tracking-[-0.03em] text-white">Terms of service</h1>
      <p className="mt-3 text-slate-400">Effective {LEGAL.effective}</p>
      <p className="mt-6 text-[17px] leading-relaxed text-slate-300">
        These terms are an agreement between you and {LEGAL.company} ({LEGAL.legalName}) for using Sarthavaha at sarthavaha.com.
        By creating an account you accept them.
      </p>

      <Section title="The service">
        <p>
          Sarthavaha is an AI marketing assistant. It researches markets, writes ad copy, suggests targeting and budgets, and can
          send campaigns to ad platforms you connect. Features may change as we improve the product.
        </p>
      </Section>

      <Section title="Your account">
        <ul>
          <li>You must be 18 or older and able to enter a contract, or use Sarthavaha on behalf of a business that authorises you.</li>
          <li>Keep your sign-in secure. You are responsible for activity on your account.</li>
          <li>One free account per person. Creating extra accounts to get more free generations is not allowed.</li>
        </ul>
      </Section>

      <Section title="Free plan and paid plans">
        <ul>
          <li>The free plan includes 5 generations. We may change free limits with notice.</li>
          <li>Paid plans renew automatically at the price shown when you subscribe until you cancel. Cancelling stops the next renewal.</li>
          <li>Prices are in Indian rupees and include or exclude GST as shown at checkout.</li>
          <li>To protect the service, we apply fair-use and rate limits on all plans and may pause generation briefly during heavy load.</li>
        </ul>
      </Section>

      <Section title="AI-generated content">
        <ul>
          <li>Results are produced by AI and can be wrong, incomplete or similar to content made for others. Review everything before you publish or spend money on it.</li>
          <li>We do not guarantee any level of reach, clicks, sales or return on ad spend.</li>
          <li>You are responsible for making sure your ads follow the law and the advertising policies of Meta, Google and any other platform you use.</li>
        </ul>
      </Section>

      <Section title="Your content">
        <p>
          You own what you put into Sarthavaha and, to the extent the law allows, the results generated for you. You give us
          permission to process your content only to provide and secure the service. We do not use your business data to
          advertise to others.
        </p>
      </Section>

      <Section title="Connected ad accounts">
        <p>
          When you add API keys for Facebook, Google Ads or other tools, you authorise us to act on those accounts as you
          instruct. Ad spend is billed by those platforms directly to you. You can remove keys at any time.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>Do not use Sarthavaha to:</p>
        <ul>
          <li>Create ads that are misleading, unlawful, discriminatory, or that infringe someone else’s rights.</li>
          <li>Promote prohibited products or services under Indian law or platform policies.</li>
          <li>Attack, overload, scrape or reverse-engineer the service, or get around usage limits.</li>
        </ul>
        <p>We may suspend accounts that break these rules.</p>
      </Section>

      <Section title="Liability">
        <p>
          Sarthavaha is provided as is. To the extent the law allows, our total liability for any claim is limited to the
          amount you paid us in the 3 months before the claim, and we are not liable for indirect losses such as lost profits
          or ad spend.
        </p>
      </Section>

      <Section title="Ending the agreement">
        <p>
          You can close your account at any time by emailing <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>.
          We may end or suspend access for serious or repeated breaches of these terms, and will tell you why.
        </p>
      </Section>

      <Section title="Law and disputes">
        <p>These terms are governed by the laws of India. Courts in {LEGAL.jurisdiction} have jurisdiction.</p>
      </Section>

      <Section title="Contact">
        <p>
          {LEGAL.company}, {LEGAL.address}<br />
          <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
        </p>
      </Section>
    </>
  );
}

export default function LegalPage({ doc }: { doc: Doc }) {
  useEffect(() => {
    document.title = doc === 'privacy'
      ? 'Privacy policy | Sarthavaha'
      : 'Terms of service | Sarthavaha';
    window.scrollTo(0, 0);
  }, [doc]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans">
      <header className="border-b border-slate-800/70">
        <div className="max-w-3xl mx-auto px-5 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 font-extrabold text-white tracking-[-0.02em] text-[15px]">
            <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <rect width="32" height="32" rx="9" fill="#1e1c3a" />
              <path d="M6 23c4-1 5-8 10-8s6 6 10-7" stroke="#f2ac36" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.1 4" opacity="0.55" />
              <circle cx="6.5" cy="23" r="2.2" fill="#f2ac36" opacity="0.6" />
              <circle cx="16" cy="15" r="2.2" fill="#f2ac36" opacity="0.8" />
              <circle cx="25.5" cy="8.5" r="3" fill="#f2ac36" />
            </svg>
            Sarthavaha
          </a>
          <nav className="flex gap-1 text-sm">
            <a href="/privacy" aria-current={doc === 'privacy' ? 'page' : undefined} className={`px-3 py-1.5 rounded-lg ${doc === 'privacy' ? 'text-white bg-slate-900' : 'text-slate-400 hover:text-white'}`}>Privacy</a>
            <a href="/terms" aria-current={doc === 'terms' ? 'page' : undefined} className={`px-3 py-1.5 rounded-lg ${doc === 'terms' ? 'text-white bg-slate-900' : 'text-slate-400 hover:text-white'}`}>Terms</a>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-5 py-12 md:py-16">
        <article className="max-w-[68ch]">
          {doc === 'privacy' ? <Privacy /> : <Terms />}
        </article>
        <p className="mt-16 pt-6 border-t border-slate-800 text-sm text-slate-500">
          Questions? <a className="text-amber-300 underline underline-offset-2" href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
          {' '}· <a className="text-slate-400 hover:text-white" href="/">Back to Sarthavaha</a>
        </p>
      </main>
    </div>
  );
}
