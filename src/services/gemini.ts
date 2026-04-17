import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

async function callGeminiWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    let isRateLimited = false;
    try {
      const errObj = JSON.parse(error.message);
      if (errObj.error && errObj.error.code === 429) {
        isRateLimited = true;
      }
    } catch (e) {
      // Not JSON
    }
    
    if (isRateLimited && retries > 0) {
      console.warn(`Rate limited. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return callGeminiWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

const AI_KEYWORDS = [
  "AI infrastructure", "Sovereign Cloud", "AI Datacentres"
];

export async function searchMarketInsights(query: string, domain?: string) {
  const keywords = AI_KEYWORDS.map(k => `"${k}"`).join(' OR ');
  const domainFilter = domain ? `site:${domain} OR ` : '';
  
  // Check if this is a global query to exclude Canada
  const isGlobal = query.toLowerCase().includes('global');
  const exclusion = isGlobal ? ' -Canada -"British Columbia" -"Ontario" -"Quebec" -"Alberta"' : '';

  const prompt = `Find the latest news and market insights for: "${query}" AND (${keywords})${exclusion}. 
Focus ONLY on news related to 'AI infrastructure', 'Sovereign Cloud', or 'AI Datacentres' within the last 7 days.
${isGlobal ? 'Focus on global developments EXCLUDING anything related to Canada.' : 
  (domainFilter ? `Focus on developments specific to their official domains (${domainFilter}).` : `Focus on developments within the geographic region or topic specified in the query: "${query}".`)}
Prioritize news from 2025 and 2026. 
Focus on recent developments, financial performance, and competitive moves.
CRITICAL: The "url" field MUST be the direct, specific URL to the news article or press release, NOT a generic homepage or landing page.`;

  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            url: { type: Type.STRING },
            summary: { type: Type.STRING, description: "A concise summary of the news" },
            published_date: { type: Type.STRING, description: "Estimated date of publication in YYYY-MM-DD format" },
            sentiment: { type: Type.STRING, enum: ["positive", "neutral", "negative"] }
          },
          required: ["title", "url", "summary", "published_date", "sentiment"]
        }
      }
    },
  }));

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export async function generateMarketSummary(competitorName: string, insights: any[]) {
  const context = insights.map(i => `- ${i.title}: ${i.summary}`).join("\n");
  const prompt = `Based on the following recent news and general knowledge for ${competitorName}, provide a comprehensive Executive Summary. 
Focus strictly on their AI Infrastructure and Cloud product offerings.

The report MUST be structured exactly as follows:

1. **Company Overview**: A high-level overview of the company with a specific focus on their AI Infrastructure product offering and value proposition.
2. **Technical Infrastructure**:
    - **Locations**: Key datacentre locations and regional footprint.
    - **Size and Scale**: Overall capacity, floor space, and expansion plans.
    - **GPU & Compute Infrastructure**: Specific hardware details (e.g., NVIDIA H100, B200 deployment), interconnects, and specialized AI compute clusters.
    - **Power & Cooling**: Total power capacity, PUE (Power Usage Effectiveness), and advanced cooling technologies used (e.g., liquid cooling).
3. **Business & Financials**: Detailed analysis of funding rounds, major investments, revenue performance, financial forecasts, and key strategic partnerships.
4. **Market Positioning**: How they compare to peers in the AI infrastructure space and their unique competitive advantages.
5. **Key Recent Activities**: A summary of the most significant announcements, product launches, or milestones from the last 6-12 months.
6. **SWOT Analysis**: A professional markdown table or bulleted list covering:
    - **Strengths**
    - **Weaknesses**
    - **Opportunities**
    - **Threats**

Context from recent news:
${context}

Format the output as a professional markdown report with clear headings and sub-headings. Use bold text for emphasis. Do NOT use <br> tags anywhere in your output.`;

  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
  }));

  return response.text;
}

export async function generateRegionInsights(region: string) {
  const keywords = AI_KEYWORDS.join('", "');
  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide a comprehensive executive summary of the latest news and developments in ${region}'s AI and Cloud sector.
Focus ONLY on news related to 'AI infrastructure', 'Sovereign Cloud', or 'AI Datacentres' within the last 7 days.
Keywords to focus on: "${region}", "${keywords}".
Include specific data points, statistics, government investments, and major corporate announcements.
Prioritize developments from 2025 and 2026.
Format the output as a professional markdown report with clear headings, bullet points, and bold text for emphasis. Do not use generic filler. Do NOT use <br> tags anywhere in your output.
IMPORTANT: Always provide a section "Sources" at the very bottom, with markdown hyperlinks to each of the specific articles you referenced. Ensure these are direct links to the articles, not just the parent website.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  }));

  return response.text;
}

export async function chatWithMarketIntel(message: string, context: { competitors: string[], currentInsights: any[] }) {
  const compList = context.competitors.join(", ");
  const insightsContext = context.currentInsights.map(i => `- ${i.title}: ${i.summary}`).join("\n");
  
  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are the TELUS AI Factory Market Intelligence Assistant. 
Your goal is to help users understand the competitive landscape of AI and Cloud globally, with a focus on sovereign infrastructure.

CONTEXT:
Tracked Competitors: ${compList}
Recent Market Insights:
${insightsContext}

USER QUESTION:
${message}

Provide a professional, concise, and data-driven response. Use Google Search if you need more recent information than what's provided in the context. Do NOT use <br> tags anywhere in your output.
CRITICAL: If you use Google Search to find information, you MUST cite your sources at the end of your response with direct, specific links to the articles you found.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  }));

  return response.text;
}

export async function generateGlobalSummary(competitors: string[], marketInsights: any[]) {
  const keywords = AI_KEYWORDS.join(' OR ');
  const marketContext = marketInsights.map(i => `- [${i.region}] ${i.title}: ${i.summary}`).join("\n");
  const compList = competitors.join(", ");
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  
  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `Provide a comprehensive "Weekly Market Overview" report for the last 7 days.
    
Focus ONLY on news related to 'AI infrastructure', 'Sovereign Cloud', or 'AI Datacentres' within the last 7 days.

CRITICAL FOCUS: 
1. This report should PREDOMINANTLY cover Canadian news updates. This includes general industry news, government policy, and infrastructure developments in Canada, NOT JUST updates related to the tracked competitors.
2. However, VERY PROMINENT news updates from the US and other global markets MUST be included as well to provide a complete picture of the landscape.

COMPITITORS TRACKED (Use as a reference, but do not limit scope to these): ${compList}

KEYWORDS TO FOCUS ON: ${keywords}

RELEVANT DEVELOPMENTS FROM THE LAST 7 DAYS:
${marketContext}

Your report MUST be structured EXACTLY as follows, using these exact headings and emojis:

# SAIF Weekly Market Overview: Executive Brief

**Date:** ${currentDate} | **Issue:** [Generate an issue number, e.g., Vol 1. Issue 4]
**Prepared by:** TELUS MarketIntel

---

## 🚀 Executive Summary
[Provide a 3-5 sentence high-level overview of the week. Focus on the single most important trend (e.g., a shift in power dynamics, a major architectural breakthrough, or a macro-economic move) and its immediate impact on the industry.]

---

## 🕵️ Competitor Intelligence
*   **[Competitor Name]**: [Summarize recent strategic moves, product pivots, or market share changes.]
*   **[Competitor Name]**: [Note any changes in their supply chain, pricing, or talent acquisition.]
*   **Market Positioning**: [Briefly contrast how the "Big Three" or "Challengers" are currently stacking up against one another.]

---

## 📰 Key News & Press Releases
*   **[Headline 1](URL)** [Date]: [Brief summary of the news and why it matters to infrastructure stakeholders.]
*   **[Headline 2](URL)** [Date]: [Brief summary of the news and why it matters to infrastructure stakeholders.]
*   **Regulatory/Macro News** [Date]: [Note any government interventions, export controls, or energy policy changes. Include direct links to sources.]

---

## 🤝 Partnership Announcements
*   **[Company A] & [Company B](URL)** [Date]: [Details of the collaboration. Focus on whether this is a "Go-to-Market" partnership or a technical integration.]
*   **Partnerships and Alliances** [Date]: [Note any new agreements between organizations, chipmakers, OEM/ODMs, and power providers. Include direct links to sources.]

---

## 👤 Customer Announcements
*   **[Customer Name/Sector](URL)** [Date]: [Who is buying? Mention significant new deployments, "AI Factory" wins, or high-profile migrations.]
*   **Adoption Trends** [Date]: [Are customers moving toward on-prem, sovereign clouds, or hybrid models? Include direct links to sources.]

---

## 🛠️ Technical Information
*   **Hardware Evolution**: [Updates on NVIDIA updates, GPU/TPU/NPU architectures, rack-level power density, or cooling innovations.]
*   **Software & Networking**: [Updates on interconnects (Infiniband vs. Ethernet), software stacks, or orchestration layers.]

---

## 🔮 Future-Looking Market Outlook
[Provide a forward-looking "Thesis of the Week." What should executives prepare for in the next 3–6 months? Identify an "under-the-radar" risk or opportunity that hasn't hit the mainstream news yet.]

Format the output as a professional markdown report. Do NOT use <br> tags anywhere in your output. Use Google Search to find specific details for the last 7 days and the specified keywords if the provided context is insufficient.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  }));

  return response.text;
}

export async function generateCompetitorProfile(name: string, domain?: string) {
  const prompt = `Generate a detailed profile for the company: "${name}"${domain ? ` (Domain: ${domain})` : ''}.
Focus on their AI infrastructure and cloud capabilities.
CRITICAL: Keep all data points extremely concise, punchy, and less wordy (e.g., "10,000+ Employees", "NVIDIA H100, A100", "500MW+"). Do not use full sentences for data points.
Include details about:
- Location (Headquarters and key datacentre locations. Keep it short, e.g., "San Francisco, CA")
- Size (Company size, employees, or datacentre footprint. Max 3-5 words.)
- GPU Type (Specific GPUs they use/offer. Max 3-5 words.)
- Power Capacity (Total power capacity. Max 3-5 words.)
- Customers (Key enterprise/government customers. Comma-separated list, max 5 items.)
- Partnerships (Major strategic partnerships. Comma-separated list, max 5 items.)
- A succinct, 1-2 sentence professional description.
- Their official website URL.
- Their official logo URL (Use https://img.logo.dev/companydomain.com?token=pk_YOUR_TOKEN if possible, replacing companydomain.com with their domain).

Return the data in the following JSON format:
{
  "location": "string",
  "size": "string",
  "gpu_type": "string",
  "power_capacity": "string",
  "customers": "string",
  "partnerships": "string",
  "description": "string",
  "head_office": "string",
  "website": "string",
  "logo_url": "string",
  "domain": "string"
}`;

  const response = await callGeminiWithRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          location: { type: Type.STRING },
          size: { type: Type.STRING },
          gpu_type: { type: Type.STRING },
          power_capacity: { type: Type.STRING },
          customers: { type: Type.STRING },
          partnerships: { type: Type.STRING },
          description: { type: Type.STRING },
          head_office: { type: Type.STRING },
          website: { type: Type.STRING },
          logo_url: { type: Type.STRING },
          domain: { type: Type.STRING }
        },
        required: ["location", "size", "gpu_type", "power_capacity", "customers", "partnerships", "description", "head_office", "website", "logo_url", "domain"]
      }
    }
  }));

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse competitor profile", e);
    return null;
  }
}
