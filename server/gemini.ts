import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY environment variable is not configured. Please add it to your secrets.');
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

export async function generateMarketingContent(prompt: string, systemInstruction?: string): Promise<string> {
  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: systemInstruction ? {
        systemInstruction: systemInstruction
      } : undefined
    });
    return response.text || 'No response generated.';
  } catch (error: any) {
    console.error('Error generating marketing content from Gemini:', error);
    // Throw instead of returning the error as text: the route then answers with an
    // error and does not use up one of the person's free generations.
    const status = error?.status || error?.code;
    if (status === 429 || /quota|rate|exhausted|spend/i.test(error?.message || '')) {
      throw new Error('Sarthavaha is very busy right now. Please try again in a minute. This didn’t use up a free generation.');
    }
    throw new Error('The AI service didn’t respond. Please try again. This didn’t use up a free generation.');
  }
}

export async function parseAgentCommand(command: string): Promise<any> {
  const systemInstruction = `You are an elite AI Command Parser for the Sarthavaha marketing command center (by Ethereal Horizon Corporation).
Analyze the user's natural language campaign setup request (optimized for mobile voice/text).
Parse the target channel, budget, ad copy options, demographics, and campaign structure.
Intelligently fill in high-converting default copywriting variables and configurations if some details are unspecified.

You MUST respond with a single, valid JSON object matching this exact structure:
{
  "platform": "facebook" | "google",
  "campaignName": string,
  "adSetsCount": number,
  "adsPerSet": number,
  "adHeadline": string,
  "adBodyCopy": string,
  "dailyBudget": number,
  "demographics": string,
  "locations": string[],
  "ageRange": string,
  "cta": string,
  "creativeVisualPrompt": string
}`;

  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Parse and expand this mobile campaign query: "${command}"`,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '{}';
    return JSON.parse(text);
  } catch (error: any) {
    console.error('Error in parseAgentCommand:', error);
    return {
      platform: 'facebook',
      campaignName: 'Telescope Campaign',
      adSetsCount: 6,
      adsPerSet: 4,
      adHeadline: 'Best Telescope at best price',
      adBodyCopy: 'Unveil the cosmos. Discover premium high-grade telescopes configured for star gazers and scientific minds alike at unmatched pricing. Shop the special collection now.',
      dailyBudget: 1000,
      demographics: 'science and technology',
      locations: ['Mumbai', 'Chennai', 'Hyderabad'],
      ageRange: '18 to 34',
      cta: 'Shop Now',
      creativeVisualPrompt: 'A futuristic telescope looking out at a vibrant purple starry galaxy, metallic silver finishes, crisp high-definition, glowing nebulae'
    };
  }
}

export const SYSTEM_MARKETER_PROMPT = `You are an elite Digital Marketing Agent, Campaign Strategist, and Ad Optimization Specialist.
Your goals are to provide actionable, high-ROI marketing suggestions, write conversion-focused copy, design comprehensive competitor analysis, and perform visual/data campaign optimizations.
Always respond with professional, structured, data-driven answers. Use markdown formatting beautifully to represent tables, lists, and bold callouts.`;

export async function generateMarketResearch(country: string, macroSegment: string, microSegments: string[]): Promise<any> {
  const systemInstruction = `You are an elite Digital Marketing Agent by Ethereal Horizon Corporation.
Conduct an extensive, realistic, and highly professional digital marketing research analysis for the given parameters.
You MUST respond with a single, valid JSON object matching this exact structure:
{
  "avgCpc": number,
  "expectedCtr": number,
  "baselineRoas": string,
  "keywords": string[],
  "recommendation": string,
  "rawText": string
}

Keep avgCpc as a realistic click cost in USD (e.g. between 0.20 and 5.00). Keep expectedCtr as a reasonable click-through percentage (e.g. between 1.0 and 4.5). Keep baselineRoas as a multiple (e.g. "2.8x", "3.4x"). Keep keywords as a string array of 4-6 specific search terms. 
Make sure rawText is a beautiful, deeply professional, and complete markdown report detailing:
1. Market Trends & Opportunity Analysis in ${country}
2. Key Competitor Intelligence for ${macroSegment} (specifically ${microSegments.join(', ')})
3. High-ROI Search Keywords
4. Targeting Demographics & Custom Affinity Segments

Do not add any markup or introductory text outside the JSON. Return only the raw JSON.`;

  const prompt = `Perform advanced digital market research for:
Country/Territory: ${country}
Macro Industry Sector: ${macroSegment}
Micro Verticals/Niche focus: ${microSegments.join(', ')}`;

  try {
    const ai = getAi();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const text = response.text || '{}';
    return JSON.parse(text);
  } catch (error: any) {
    console.error('Error in generateMarketResearch:', error);
    const avgCpc = country === 'United States' ? 2.45 : country === 'India' ? 0.65 : 1.50;
    const expectedCtr = macroSegment === 'E-commerce' ? 2.15 : 1.65;
    const baselineRoas = macroSegment === 'E-commerce' ? '3.2x' : '2.5x';
    const keywords = ['best online deals', 'affordable organic products', 'high quality solutions'];
    const recommendation = `For ${microSegments.join(', ')} in ${country}, we recommend combining organic SEO optimization with highly targeted Meta custom affinity audiences.`;
    const rawText = `--- ADVANCED MARKET INTELLIGENCE REPORT ---
Target Territory: ${country}
Macro Industry: ${macroSegment}
Micro Verticals: ${microSegments.join(', ')}

PERFORMANCE BENCHMARKS:
- Average CPC: $${avgCpc.toFixed(2)}
- Expected CTR: ${expectedCtr.toFixed(2)}%
- Baseline Industry ROAS: ${baselineRoas}

An error occurred during live generation, using cached benchmark models.`;
    return {
      avgCpc,
      expectedCtr,
      baselineRoas,
      keywords,
      recommendation,
      rawText
    };
  }
}
