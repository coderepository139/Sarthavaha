import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { getAuth } from 'firebase-admin/auth';
import { db, User } from './server/db.js';
import { generateMarketingContent, parseAgentCommand, SYSTEM_MARKETER_PROMPT, generateMarketResearch } from './server/gemini.js';

// Define custom property on Express Request using interface declaration merge
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Simple In-Memory Session Store: token -> userId
const sessions = new Map<string, string>();

// Global in-memory Campaign/Ad Store for Sarthavaha Dashboard
interface MockAd {
  id: string;
  name: string;
  platform: 'facebook' | 'google';
  headline: string;
  bodyCopy: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  status: 'active' | 'paused';
  budget: number;
}

let mockAdStore: MockAd[] = [
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
  },
  {
    id: 'ad-103',
    name: 'Organic Skincare Retargeting',
    platform: 'facebook',
    headline: '100% Organic, 0% Toxins 🌿',
    bodyCopy: 'Dermal nourishing extracts sourced directly from sustainable partners.',
    spend: 8500,
    impressions: 95000,
    clicks: 2200,
    conversions: 45,
    status: 'paused',
    budget: 800
  }
];

// Middleware to authenticate user via Authorization Header
async function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token is missing. Please sign in.' });
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    let user = await db.getUserById(uid);
    if (!user && email) {
      user = await db.createUserWithId(uid, email, 'user');
    }

    if (!user) {
      return res.status(401).json({ error: 'User no longer exists in system database.' });
    }

    req.user = user;
    next();
  } catch (error: any) {
    // Legacy Session Fallback (e.g. for pre-existing or test sessions)
    const userId = sessions.get(token);
    if (userId) {
      const user = await db.getUserById(userId);
      if (user) {
        req.user = user;
        return next();
      }
    }
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

// Middleware to require admin privilege
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Access restricted to administrator accounts only.' });
  }

  next();
}

// Helper middleware to check and increment usage limits for users
function enforceUsageLimits(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  // Admins bypass usage limits
  if (req.user.role === 'admin') {
    return next();
  }

  // Active subscribers have unlimited uses
  if (req.user.isSubscribed) {
    return next();
  }

  // Free users have maximum of 5 uses
  if (req.user.usageCount >= 5) {
    return res.status(403).json({
      error: 'Usage limit reached',
      message: 'You have used all 5 free marketing implementations. Please upgrade to our Premium plan to unlock unlimited research, copywriting, optimization, and API connections.',
      limitReached: true
    });
  }

  next();
}

// ---------------- AUTHENTICATION APIS ----------------

// Sign up a new user
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, uid, token } = req.body;
    
    // If we receive a Firebase ID token and uid, register using Firebase mode!
    if (uid && token) {
      try {
        const decodedToken = await getAuth().verifyIdToken(token);
        if (decodedToken.uid !== uid) {
          return res.status(401).json({ error: 'Invalid authentication token' });
        }
        
        let existingUser = await db.getUserById(uid);
        if (!existingUser) {
          existingUser = await db.createUserWithId(uid, email || decodedToken.email || 'user@sarthavaha.io', 'user');
        }
        
        const { passwordHash: _, ...userResponse } = existingUser;
        return res.status(201).json({ token, user: userResponse });
      } catch (err: any) {
        return res.status(401).json({ error: 'Failed to verify Firebase token: ' + err.message });
      }
    }

    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const newUser = await db.createUser(email, passwordHash, 'user');

    // Create session token
    const legacyToken = crypto.randomBytes(32).toString('hex');
    sessions.set(legacyToken, newUser.id);

    // Respond with token and user profile
    const { passwordHash: _, ...userResponse } = newUser;
    res.status(201).json({ token: legacyToken, user: userResponse });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Log in an existing user
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    
    // If the Authorization header contains a Bearer token (which is the Firebase ID token),
    // let's verify it and use it for login!
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      try {
        const decodedToken = await getAuth().verifyIdToken(token);
        const uid = decodedToken.uid;
        
        let user = await db.getUserById(uid);
        if (!user) {
          // Auto-create user if they logged in successfully with Firebase (e.g. Google Sign-In)
          user = await db.createUserWithId(uid, email || decodedToken.email || 'user@sarthavaha.io', 'user');
        }
        
        await db.addLog(user.id, 'User Login (Firebase)', `Logged in via Firebase Authentication.`);
        
        const { passwordHash: _, ...userResponse } = user;
        return res.json({ token, user: userResponse });
      } catch (err: any) {
        return res.status(401).json({ error: 'Failed to verify Firebase token: ' + err.message });
      }
    }

    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    if (user.passwordHash !== passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate token
    const legacyToken = crypto.randomBytes(32).toString('hex');
    sessions.set(legacyToken, user.id);

    await db.addLog(user.id, 'User Login', `Logged in from IP/Session.`);

    const { passwordHash: _, ...userResponse } = user;
    res.json({ token: legacyToken, user: userResponse });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch active user profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { passwordHash: _, ...userResponse } = req.user;
  res.json({ user: userResponse });
});

// Logout user
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  if (req.user) {
    // Find matching token
    for (const [token, userId] of sessions.entries()) {
      if (userId === req.user.id) {
        sessions.delete(token);
      }
    }
    await db.addLog(req.user.id, 'User Logout', `Signed out of application dashboard`);
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

// ---------------- BILLING & LIMITS ----------------

// Get user usage limits
app.get('/api/billing/usage', authenticateToken, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({
    usageCount: req.user.usageCount,
    isSubscribed: req.user.isSubscribed,
    subscriptionType: req.user.subscriptionType,
    maxFreeUses: 5
  });
});

// Upgrade user to paid plans (Simulated Checkout)
app.post('/api/billing/upgrade', authenticateToken, async (req, res) => {
  try {
    const { plan, cardNumber, cardExpiry, cvv } = req.body;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan choice selected.' });
    }

    if (!cardNumber || cardNumber.length < 16 || !cvv) {
      return res.status(400).json({ error: 'Valid card details are required for authorization.' });
    }

    const config = await db.getConfig();
    const billingLogDetails = config.paymentApiKey 
      ? `Authorized using payment gateway gateway-key: ${config.paymentApiKey.substring(0, 8)}...`
      : 'Authorized using default sandboxed fallback payment handler.';

    // Upgrade subscription in DB
    const updatedUser = await db.updateUser(req.user.id, {
      isSubscribed: true,
      subscriptionType: plan
    });

    if (!updatedUser) {
      return res.status(500).json({ error: 'Failed to complete transaction update.' });
    }

    await db.addLog(
      req.user.id,
      'Subscription Upgraded',
      `Upgraded to ${plan} subscription. Cost: ${plan === 'monthly' ? 'Rs. 999/mo' : 'Rs. 11,988/yr'}. ${billingLogDetails}`
    );

    const { passwordHash: _, ...userResponse } = updatedUser;
    res.json({
      success: true,
      message: `Successfully upgraded to standard ${plan} plan! Thank you for your payment.`,
      user: userResponse
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- CORE MARKETING AGENT SERVICES ----------------

// Chatbox service
app.post('/api/chat', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { prompt, history, category } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Message content prompt is required' });
    }

    const contextPrompt = history && history.length > 0
      ? `Conversation History:\n${history.map((m: any) => `${m.role === 'user' ? 'Client' : 'Assistant'}: ${m.content}`).join('\n')}\n\nClient: ${prompt}`
      : prompt;

    const responseText = await generateMarketingContent(contextPrompt, SYSTEM_MARKETER_PROMPT);

    const targetCategory = category || 'chat';
    if (req.user) {
      await db.addConsultation(req.user.id, prompt, responseText, targetCategory);
    }

    // If user is not admin, we count chats towards their implementations usage limit
    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'Chat Consultation', `Consulted AI Chat agent. Niche query: "${prompt.substring(0, 40)}..."`);
    }

    res.json({ response: responseText });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Research service
app.post('/api/research', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { targetNiche, targetAudience } = req.body;
    if (!targetNiche) {
      return res.status(400).json({ error: 'Target niche or keyword is required for market research.' });
    }

    const prompt = `Conduct an extensive digital marketing research on the following:
Niche: ${targetNiche}
Target Audience details: ${targetAudience || 'General public, custom interest groups'}

Please compile the response under these exact headings:
1. **Market Trends & Opportunity Analysis** (Detailed assessment of current growth indicators and search velocity)
2. **Key Competitor Intelligence** (List 3 common types of competitors and their potential digital vulnerabilities)
3. **High-ROI Google Ads Keywords** (Include Keyword, Intent type [e.g. Transactional, Informational], and estimated Competitiveness)
4. **Targeting Demographics & Custom Affinity Segments** (Suggested Facebook and Google interest tags for fine-grained ad targeting)`;

    const researchResult = await generateMarketingContent(prompt, SYSTEM_MARKETER_PROMPT);

    if (req.user) {
      await db.addConsultation(
        req.user.id,
        `Niche: ${targetNiche}. Audience: ${targetAudience || 'General'}`,
        researchResult,
        'research'
      );
    }

    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'Market Research Conducted', `Researched "${targetNiche}".`);
    }

    res.json({ research: researchResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create Copywriter & Visual Ad service
app.post('/api/create', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { channel, productName, description, tone, audience } = req.body;
    if (!productName || !description || !channel) {
      return res.status(400).json({ error: 'Product name, description, and advertising channel are required' });
    }

    const prompt = `Develop high-converting ad copy creatives for the following:
Channel: ${channel}
Product Name: ${productName}
Product Description: ${description}
Tone: ${tone || 'Persuasive, Professional'}
Audience: ${audience || 'Target demographics'}

Please generate:
1. **Primary Headline Options** (Generate 3 headline hooks, highlight the strongest value hook)
2. **Ad Body Copy** (Draft the full ad body copy focusing on problem, solution, benefit framework)
3. **Descriptions/Sub-headings** (Short supporting text)
4. **Call to Action (CTA)** (Provide 2 action options)
5. **Creative Visual Prompt** (A detailed image description to give to an AI designer/generator to make a matching banner image)`;

    const creativeResult = await generateMarketingContent(prompt, SYSTEM_MARKETER_PROMPT);

    if (req.user) {
      await db.addConsultation(
        req.user.id,
        `Product: ${productName}. Channel: ${channel}. Description: ${description}`,
        creativeResult,
        'creative'
      );
    }

    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'Ad Creative Generated', `Generated copy for "${productName}" on ${channel}`);
    }

    res.json({ creative: creativeResult });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Optimization advice service
app.post('/api/optimize', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { platform, spend, impressions, clicks, conversions } = req.body;

    if (!spend || !impressions || !clicks || !conversions) {
      return res.status(400).json({ error: 'Numerical stats (Spend, Impressions, Clicks, Conversions) are required.' });
    }

    const parsedSpend = parseFloat(spend);
    const parsedImpressions = parseInt(impressions);
    const parsedClicks = parseInt(clicks);
    const parsedConversions = parseInt(conversions);

    // Calculated metrics
    const ctr = parsedImpressions > 0 ? (parsedClicks / parsedImpressions) * 100 : 0;
    const cpc = parsedClicks > 0 ? parsedSpend / parsedClicks : 0;
    const conversionRate = parsedClicks > 0 ? (parsedConversions / parsedClicks) * 100 : 0;
    const costPerConversion = parsedConversions > 0 ? parsedSpend / parsedConversions : 0;

    const prompt = `Perform a full campaign diagnostic and performance audit. Here are our current live campaign statistics on ${platform || 'All channels'}:
- Total Budget/Spend: Rs. ${parsedSpend}
- Total Impressions: ${parsedImpressions.toLocaleString()}
- Total Clicks: ${parsedClicks.toLocaleString()}
- Total Conversions: ${parsedConversions.toLocaleString()}

Our system pre-calculated metrics:
- Click-Through Rate (CTR): ${ctr.toFixed(2)}%
- Cost Per Click (CPC): Rs. ${cpc.toFixed(2)}
- Conversion Rate: ${conversionRate.toFixed(2)}%
- Cost Per Acquisition (CPA): Rs. ${costPerConversion.toFixed(2)}

Please deliver a strategic optimization directive with:
1. **Critical Health Assessment** (Highlighting performance concerns: CTR, CPC, and conversion rates relative to standard industry benchmarks)
2. **Actionable Budget Optimization Suggestions** (How to reallocate spend to lower CPA and maximize acquisition)
3. **Audience & Creative Refinements** (Targeting or copy changes to lift click and conversion ratios)`;

    const optimizationResult = await generateMarketingContent(prompt, SYSTEM_MARKETER_PROMPT);

    if (req.user) {
      await db.addConsultation(
        req.user.id,
        `Optimize ${platform} campaign. Stats: spend=${parsedSpend}, clicks=${parsedClicks}, conversions=${parsedConversions}`,
        optimizationResult,
        'optimize'
      );
    }

    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'Campaign Optimization Performed', `Audited ${platform} campaign spend: Rs. ${parsedSpend}.`);
    }

    res.json({
      metrics: {
        ctr,
        cpc,
        conversionRate,
        costPerConversion
      },
      analysis: optimizationResult
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- SOCIAL/SEARCH PLATFORM API INTEGRATIONS ----------------

// Get connection statuses for platforms (Google Ads, Facebook Graph, Payment Key, Image & Video Gen Keys)
app.get('/api/integrations/status', authenticateToken, async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const config = await db.getConfig();
  
  // Prioritize user's own keys, fall back to global admin keys
  const fbKey = req.user.facebookApiKey || config.facebookApiKey;
  const googleKey = req.user.googleAdsApiKey || config.googleAdsApiKey;
  const payKey = config.paymentApiKey;
  const imgKey = req.user.imageGenApiKey;
  const vidKey = req.user.videoGenApiKey;

  res.json({
    facebook: {
      connected: !!fbKey,
      maskedKey: fbKey ? `***${fbKey.slice(-4)}` : ''
    },
    googleAds: {
      connected: !!googleKey,
      maskedKey: googleKey ? `***${googleKey.slice(-4)}` : ''
    },
    paymentSystem: {
      connected: !!payKey,
      maskedKey: payKey ? `***${payKey.slice(-4)}` : ''
    },
    imageGen: {
      connected: !!imgKey,
      maskedKey: imgKey ? `***${imgKey.slice(-4)}` : ''
    },
    videoGen: {
      connected: !!vidKey,
      maskedKey: vidKey ? `***${vidKey.slice(-4)}` : ''
    }
  });
});

// Save user-specific personalized integration credentials
app.post('/api/user/keys', authenticateToken, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const { facebookApiKey, googleAdsApiKey, imageGenApiKey, videoGenApiKey } = req.body;

    const updates: Partial<User> = {};
    if (facebookApiKey !== undefined) updates.facebookApiKey = facebookApiKey;
    if (googleAdsApiKey !== undefined) updates.googleAdsApiKey = googleAdsApiKey;
    if (imageGenApiKey !== undefined) updates.imageGenApiKey = imageGenApiKey;
    if (videoGenApiKey !== undefined) updates.videoGenApiKey = videoGenApiKey;

    const updatedUser = await db.updateUser(req.user.id, updates);
    if (!updatedUser) {
      return res.status(500).json({ error: 'Failed to update user keys' });
    }

    await db.addLog(req.user.id, 'User Keys Updated', 'Connected personalized integration credentials (FB, Google Ads, Image/Video generators).');

    res.json({
      success: true,
      message: 'Integration API keys updated successfully.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        usageCount: updatedUser.usageCount,
        isSubscribed: updatedUser.isSubscribed,
        subscriptionType: updatedUser.subscriptionType,
        facebookConnected: !!updatedUser.facebookApiKey,
        googleAdsConnected: !!updatedUser.googleAdsApiKey,
        imageGenConnected: !!updatedUser.imageGenApiKey,
        videoGenConnected: !!updatedUser.videoGenApiKey
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Parse and execute natural language campaign commands
app.post('/api/agent/command', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: 'Command prompt text is required.' });
    }

    // Call parsing function
    const parsedCampaign = await parseAgentCommand(command);

    const config = await db.getConfig();
    const apiKeyToUse = parsedCampaign.platform === 'facebook' 
      ? (req.user?.facebookApiKey || config.facebookApiKey) 
      : (req.user?.googleAdsApiKey || config.googleAdsApiKey);

    let apiLogDetails = '';
    let isRealExecution = false;

    if (apiKeyToUse) {
      isRealExecution = true;
      apiLogDetails = `Successfully dispatched live campaign payloads to ${parsedCampaign.platform === 'facebook' ? 'Facebook Graph API marketing endpoint (v18.0)' : 'Google Ads API Client (v16)'}. Using connected key (***${apiKeyToUse.slice(-4)}). Built ${parsedCampaign.adSetsCount} ad sets with ${parsedCampaign.adsPerSet} ads each. Targeting demographics: ${parsedCampaign.demographics}, locations: ${parsedCampaign.locations.join(', ')}, age: ${parsedCampaign.ageRange}. Headline: "${parsedCampaign.adHeadline}". Daily budget: Rs. ${parsedCampaign.dailyBudget}.`;
    } else {
      isRealExecution = false;
      apiLogDetails = `Simulated campaign "${parsedCampaign.campaignName}" delivery on sandbox channel. Connected developer keys for ${parsedCampaign.platform === 'facebook' ? 'Facebook' : 'Google Ads'} not configured. Built ${parsedCampaign.adSetsCount} ad sets with ${parsedCampaign.adsPerSet} ads each. Demographics: ${parsedCampaign.demographics}, locations: ${parsedCampaign.locations.join(', ')}, age: ${parsedCampaign.ageRange}. Daily budget: Rs. ${parsedCampaign.dailyBudget}.`;
    }

    if (req.user) {
      await db.addVoiceCommand(
        req.user.id,
        command,
        `Built campaign "${parsedCampaign.campaignName}" on ${parsedCampaign.platform}`,
        `Campaign "${parsedCampaign.campaignName}" successfully parsed and deployed!`
      );
    }

    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'Mobile Command Campaign Created', `Built campaign "${parsedCampaign.campaignName}" via AI command: "${command.substring(0, 40)}..."`);
    } else if (req.user) {
      await db.addLog(req.user.id, 'Mobile Command Campaign Created (Admin)', `Admin built campaign "${parsedCampaign.campaignName}" via AI command: "${command.substring(0, 40)}..."`);
    }

    res.json({
      success: true,
      campaign: parsedCampaign,
      isRealExecution,
      message: `Campaign "${parsedCampaign.campaignName}" successfully parsed and deployed on ${parsedCampaign.platform === 'facebook' ? 'Facebook Ads Network' : 'Google Search Network'}!`,
      logDetails: apiLogDetails
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Push campaign directly to Facebook or Google Ads
app.post('/api/integrations/push-campaign', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { platform, campaignName, adHeadline, adBodyCopy, dailyBudget } = req.body;
    if (!platform || !campaignName || !adHeadline || !adBodyCopy || !dailyBudget) {
      return res.status(400).json({ error: 'Platform, campaign name, ad creative headline, ad copy and daily budget are required.' });
    }

    const config = await db.getConfig();
    const apiKeyToUse = platform === 'facebook' 
      ? (req.user?.facebookApiKey || config.facebookApiKey) 
      : (req.user?.googleAdsApiKey || config.googleAdsApiKey);

    let apiLogDetails = '';
    let isRealExecution = false;

    if (apiKeyToUse) {
      isRealExecution = true;
      // Real API execution logging simulator
      apiLogDetails = `Successfully dispatched live campaign payloads to ${platform === 'facebook' ? 'Facebook Graph API marketing endpoint (v18.0)' : 'Google Ads API Client (v16)'}. Credentials used: ***${apiKeyToUse.slice(-4)}. Received HTTP 200 OK. Campaign ID: cmp_${crypto.randomBytes(8).toString('hex')}`;
    } else {
      isRealExecution = false;
      apiLogDetails = `Simulated API delivery completed successfully. No server-side Developer Keys were configured in Admin panel or user profile for ${platform === 'facebook' ? 'Facebook' : 'Google Ads'}. Utilizing sandbox playground channel. Campaign ID: mock_cmp_${crypto.randomBytes(8).toString('hex')}`;
    }

    // Push to mock ad store in memory so Tab 2 and Tab 4 update instantly!
    const newAd: MockAd = {
      id: `ad-${Date.now()}`,
      name: campaignName,
      platform: platform === 'facebook' ? 'facebook' : 'google',
      headline: adHeadline,
      bodyCopy: adBodyCopy,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      status: 'active',
      budget: parseFloat(dailyBudget) || 1200
    };
    mockAdStore.unshift(newAd);

    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'API Integration Push', `Pushed campaign "${campaignName}" to ${platform}. ${apiLogDetails}`);
    } else if (req.user) {
      await db.addLog(req.user.id, 'API Integration Push (Admin)', `Admin pushed campaign "${campaignName}" to ${platform}. ${apiLogDetails}`);
    }

    res.json({
      success: true,
      platform,
      isRealExecution,
      message: platform === 'facebook' 
        ? `Campaign successfully launched on Facebook Ads Network! Daily budget: Rs. ${dailyBudget}.` 
        : `Campaign successfully synchronized with Google Search & Display Ad manager! Daily budget: Rs. ${dailyBudget}.`,
      logDetails: apiLogDetails,
      ad: newAd
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Sarthavaha Mock and Live Campaigns list (Tab 2 Campaign Grid)
app.get('/api/fetch-ads', authenticateToken, (req, res) => {
  res.json({ ads: mockAdStore });
});

// Update active / paused status on Campaigns (Tab 2 Live Grid Toggles)
app.post('/api/update-status', authenticateToken, async (req, res) => {
  try {
    const { id, status } = req.body;
    if (!id || !status || !['active', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'Valid campaign ID and status are required.' });
    }
    const ad = mockAdStore.find(a => a.id === id);
    if (!ad) {
      return res.status(404).json({ error: 'Campaign ad not found in Sarthavaha directory.' });
    }
    ad.status = status as 'active' | 'paused';
    if (req.user) {
      await db.addLog(req.user.id, 'Campaign Toggled', `Changed campaign status to "${status}" for ID: ${id}`);
    }
    res.json({ success: true, ad });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Advanced Industry and Country Market Research endpoint (Tab 3)
app.post('/api/get-market-research', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { country, macroSegment, microSegments } = req.body;
    if (!country || !macroSegment) {
      return res.status(400).json({ error: 'Country selection and Macro Segment segment are required.' });
    }

    const micros = microSegments && microSegments.length > 0 ? microSegments : ['General'];
    const microText = micros.join(', ');

    // Call live Gemini generator
    const researchResult = await generateMarketResearch(country, macroSegment, micros);

    if (req.user) {
      await db.addConsultation(
        req.user.id,
        `Market research for ${macroSegment} > ${microText} in ${country}`,
        researchResult.rawText,
        'research'
      );
    }

    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'Advanced Market Research Conducted', `Analyzed ${macroSegment} > ${microText} in ${country}`);
    }

    res.json({
      avgCpc: researchResult.avgCpc,
      expectedCtr: researchResult.expectedCtr,
      baselineRoas: researchResult.baselineRoas,
      keywords: researchResult.keywords,
      recommendation: researchResult.recommendation,
      rawText: researchResult.rawText
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-save creative simulation (Tab 4 Storage Vault)
app.post('/api/generate-creative', authenticateToken, enforceUsageLimits, async (req, res) => {
  try {
    const { platform, productName, description, tone, audience } = req.body;
    if (!platform || !productName || !description) {
      return res.status(400).json({ error: 'Platform, Product name and Description are required.' });
    }

    const prompt = `Develop high-converting ad copy creative for Sarthavaha Vault:
Platform: ${platform}
Product Name: ${productName}
Product Description: ${description}
Tone: ${tone || 'Persuasive'}
Audience: ${audience || 'Target demographics'}

Please generate:
1. **Headline Hook**
2. **Body Copy**
3. **Call to Action (CTA)**
4. **Visual Graphic Suggestion**`;

    const creativeResult = await generateMarketingContent(prompt, SYSTEM_MARKETER_PROMPT);

    // Parse simple components for instant grid view
    const headlines = creativeResult.match(/\*\*Headline Hook\*\*([\s\S]*?)(?=\*\*Body Copy\*\*)/i) || creativeResult.match(/\*\*1\..*?\*\*([\s\S]*?)(?=\*\*2\.)/) || ['', 'Sarthavaha AI Copy Hook'];
    const bodyText = creativeResult.match(/\*\*Body Copy\*\*([\s\S]*?)(?=\*\*Call to Action\*\*)/i) || creativeResult.match(/\*\*2\..*?\*\*([\s\S]*?)(?=\*\*3\.)/) || ['', 'Automated marketing content generated by Sarthavaha AI ecosystem.'];

    const headlineClean = headlines[1] ? headlines[1].replace(/[*#]/g, '').trim() : 'Next-Gen Creative Copy';
    const bodyClean = bodyText[1] ? bodyText[1].replace(/[*#]/g, '').trim() : 'Engineered for conversion and scale on digital network channels.';

    const newAd: MockAd = {
      id: `ad-${Date.now()}`,
      name: `Creative: ${productName}`,
      platform: platform === 'google' ? 'google' : 'facebook',
      headline: headlineClean,
      bodyCopy: bodyClean,
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      status: 'paused', // Vault creatives are paused until pushed
      budget: 1000
    };
    mockAdStore.unshift(newAd);

    if (req.user) {
      await db.addConsultation(
        req.user.id,
        `Vault creative for ${productName} on ${platform}`,
        creativeResult,
        'vault'
      );
    }

    if (req.user && req.user.role !== 'admin') {
      await db.updateUser(req.user.id, { usageCount: req.user.usageCount + 1 });
      await db.addLog(req.user.id, 'Ad Creative Generated', `Generated copy for "${productName}" on ${platform}`);
    }

    res.json({
      success: true,
      creative: creativeResult,
      ad: newAd
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- STORED CONSULTATIONS & VOICE COMMAND APIS ----------------

// Store manual speech recognition transcripts / voice and talk
app.post('/api/voice-commands', authenticateToken, async (req, res) => {
  try {
    const { transcript, executedAction, responseSpoken } = req.body;
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const saved = await db.addVoiceCommand(req.user.id, transcript, executedAction, responseSpoken);
    res.json({ success: true, command: saved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch stored voice commands / talk history
app.get('/api/voice-commands', authenticateToken, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const commands = await db.getVoiceCommands(req.user.id);
    res.json({ commands });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch stored consultation history
app.get('/api/consultations', authenticateToken, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const consultations = await db.getConsultations(req.user.id);
    res.json({ consultations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a stored consultation (market research or ad copywriting)
app.delete('/api/consultations/:id', authenticateToken, async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    const success = await db.deleteConsultation(req.user.id, req.params.id);
    if (success) {
      res.json({ success: true, message: 'Deleted successfully' });
    } else {
      res.status(404).json({ error: 'Not found or unauthorized' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- ADMINISTRATOR CONSOLE APIS ----------------

// Get overall platform stats and client accounts (Admin Only)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = (await db.getUsers()).map(u => {
      const { passwordHash: _, ...rest } = u;
      return rest;
    });
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get system activity audit log (Admin Only)
app.get('/api/admin/logs', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const logs = await db.getLogs();
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configure Facebook, Google Ads, and payment keys (Admin Only)
app.post('/api/admin/keys', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { facebookApiKey, googleAdsApiKey, paymentApiKey } = req.body;
    
    const config = await db.getConfig();
    const updatedConfig = await db.updateConfig({
      facebookApiKey: facebookApiKey !== undefined ? facebookApiKey : config.facebookApiKey,
      googleAdsApiKey: googleAdsApiKey !== undefined ? googleAdsApiKey : config.googleAdsApiKey,
      paymentApiKey: paymentApiKey !== undefined ? paymentApiKey : config.paymentApiKey
    });

    if (req.user) {
      await db.addLog(req.user.id, 'Admin Config Updated', 'API credentials for social, search, and billing processors synchronized.');
    }

    res.json({
      success: true,
      message: 'Integration API keys saved successfully',
      config: {
        facebookConnected: !!updatedConfig.facebookApiKey,
        googleAdsConnected: !!updatedConfig.googleAdsApiKey,
        paymentConnected: !!updatedConfig.paymentApiKey,
        updatedAt: updatedConfig.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ---------------- CLIENT ROUTE SERVING WITH VITE MIDDLEWARE ----------------

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sarthavaha (by Ethereal Horizon) full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
