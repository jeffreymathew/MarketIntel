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
    contents: `You are an expert market intelligence analyst for TELUS. Provide a comprehensive weekly market report strictly following the structure of the "SAIF MarketIntel" template provided below.

CRITICAL INSTRUCTIONS:
1. STRICT ADHERENCE: Stick strictly to the provided template structure.
2. FACT-BASED: Only report verifiable facts. Do NOT provide personal commentary, opinions, predictions (unless explicitly requested in a section), or editorialization.
3. NO REPETITION: Ensure each news item, partnership, or deployment is summarized ONLY once.
4. FOCUS: Only include news related to 'AI infrastructure', 'Sovereign Cloud', or 'AI Datacentres' from the last 7 days.
5. PREDOMINANTLY cover Canadian updates (policy, infra, competitors).
6. Include VERY PROMINENT US/global updates for landscape context.
7. Use the provided markdown structure exactly, including all emojis.

COMPITITORS TRACKED: ${compList}
RELEVANT DEVELOPMENTS FROM THE LAST 7 DAYS: ${marketContext}

Your report MUST be structured EXACTLY as follows:

# SAIF MarketIntel
## Weekly Market Overview: Executive Brief
**Date:** ${currentDate} | **Issue:** [Generate an issue number, e.g., Vol 1. Issue 4]
**Prepared by:** TELUS MarketIntel

---

## 🚀 1. Executive Summary | TLDR
[Provide a 3-5 sentence high-level overview of the week focusing on: sovereignty updates in Canada, compute and power capacity, customer acquisitions, sustainability moves, and government updates.]
* [Trend/Update 1]: [Brief description]
* [Trend/Update 2]: [Brief description]
* [Trend/Update n]: [Brief description]

---

## 📰 2. Key News & Press Releases (within the last week)
### 📰 Industry News Highlights
[This section highlights a brief summary of news/PRs that tie back to customers, competitors, and infrastructure.]
* **[Headline 1]**: [Brief summary of the announcement]
* **[Headline 2]**: [Brief summary of the announcement]
* **[Headline n]**: [Brief summary of the announcement]

---

## 🤝 Strategic Partnership Spotlight
[This section highlights new agreements between private/public organizations, chipmakers, financial, or infrastructure providers.]
* **[Partner A] & [Partner B]**: [Details of the collaboration. Focus on "Go-to-Market," Financial, Technical, or Infrastructure/Build partnerships.]
* **[Partner n] & [Partner n]**: [Details of the collaboration. Focus on "Go-to-Market," Financial, Technical, or Infrastructure/Build partnerships.]

---

## 🏛️ Government and Regulatory News
[This section highlights key government, federal or provincial updates.]
* **[Regulatory News]**: [Note any government interventions, export controls, energy policies, or data center sustainability changes.]
* **[Government News]**: [Note any Government updates, including investment funding, grants, policy shifts, or Indigenous participation requirements]
* **[Sovereignty Updates]**: [Updates on the Federal Sovereign AI Compute Strategy or provincial data residency mandates.]

---

## 👨‍💻 3. Weekly Competitor Landscape
[Pick the 3–5 key movers of the week. Bell remains a standing view in this table.]

| Competitor | Key Strategic Move |
| :--- | :--- |
| **Bell** | [Summary of recent strategic move/pivot]<br>_Note changes in supply chain, pricing, or talent_ |
| **Cohere** | [Summary of recent strategic move/pivot]<br>_Note changes in supply chain, pricing, or talent_ |
| **Hypertec** | [Summary of recent strategic move/pivot]<br>_Note changes in supply chain, pricing, or talent_ |
| **ThinkOn** | [Summary of recent strategic move/pivot]<br>_Note changes in supply chain, pricing, or talent_ |
| **QScale** | [Summary of recent strategic move/pivot]<br>_Note changes in supply chain, pricing, or talent_ |

---

## 👤 4. Customer & Market Landscape
[Monitoring target segments and E2E value chain uptake. Provide detail for each segment in the table, expanding on trends, specific deployments, customer pain points, win drivers, and key decision-making factors. YOU MUST USE THE GOOGLE SEARCH TOOL TO FIND RELEVANT RECENT DEVELOPMENTS FOR EACH CELL if the provided market context is insufficient. If after searching you still cannot find verified details for a cell, write 'No recent data detected' instead of leaving it blank or using 'Data pending evaluation'.]

| Market Segment | Adoption Trends | Significant New Deployments & Case Studies | E2E Value Chain Focus |
| :--- | :--- | :--- | :--- |
| **Wholesale** | [Research trends: On-prem, Sovereign, Hybrid; Growth/Decline; Competitive landscape] | [Research specific new cluster/site activations/moves] | AI Physical Infrastructure / Platforms / Apps |
| **Enterprise / Public** | [Research trends: Migration paths, Data residency, Security profiles] | [Research specific platform/vault migrations or major contract wins] | AI Physical Infrastructure / Platforms / Apps |
| **Research/Start-ups/SMBs** | [Research trends: SaaS-to-IaaS shifts, Open model usage] | [Research specific application layer/service/research wins] | AI Physical Infrastructure / Platforms / Apps |

---

## 🛠️ 5. Technical & Infrastructure Landscape
* **Hardware Evolution**: [Updates on NVIDIA/TPU/NPU architectures, rack-level power density, or cooling innovations (e.g., Liquid Immersion).]
* **Infrastructure and Platform**: [Updates on networking equipment, security measures and compliances, software stacks, or orchestration layers.]
* **Compute Capacity**: [State of the "Power Gap," shovel-ready site availability, and regional infrastructure expansion.]

---

## 🔮 6. Future-Looking Market Outlook
[Provide a forward-looking "Thesis of the Week." Identify an "under-the-radar" risk or opportunity.]
* **0-3 Months Opportunity/Risk**: [Near-term catalyst]
* **3-6 Months Opportunity/Risk**: [Medium-term trend]

---

## 📊 Data Points & Statistics
[Each data point below must correspond to a source link for fact-checking.]
1. Sovereign AI Adoption: [Percentage/Stat] ([Link])
2. Compute Investment: [Dollar Amount/Capacity] ([Link])
3. AI Financial Outlook: [ARR/Growth/Beat] ([Link])
4. Interconnection Growth: [Total Connections/Deal Type %] ([Link])
5. Compute Capacity & Expansion in Canada and Globally: [MW Scale/Financing] ([Link])
6. Power Capacity in Canada and Globally: [Power/Cooling] ([Link])

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
