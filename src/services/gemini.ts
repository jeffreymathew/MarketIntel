import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

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

  const response = await ai.models.generateContent({
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
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export async function generateMarketSummary(competitorName: string, insights: any[]) {
  const context = insights.map(i => `- ${i.title}: ${i.summary}`).join("\n");
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the following recent news for ${competitorName}, provide a high-level executive summary of their current market position and key risks/opportunities:\n\n${context}`,
  });

  return response.text;
}

export async function generateRegionInsights(region: string) {
  const keywords = AI_KEYWORDS.join('", "');
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide a comprehensive executive summary of the latest news and developments in ${region}'s AI and Cloud sector.
Focus ONLY on news related to 'AI infrastructure', 'Sovereign Cloud', or 'AI Datacentres' within the last 7 days.
Keywords to focus on: "${region}", "${keywords}".
Include specific data points, statistics, government investments, and major corporate announcements.
Prioritize developments from 2025 and 2026.
Format the output as a professional markdown report with clear headings, bullet points, and bold text for emphasis. Do not use generic filler.
IMPORTANT: Always provide a section "Sources" at the very bottom, with markdown hyperlinks to each of the specific articles you referenced. Ensure these are direct links to the articles, not just the parent website.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  return response.text;
}

export async function chatWithMarketIntel(message: string, context: { competitors: string[], currentInsights: any[] }) {
  const compList = context.competitors.join(", ");
  const insightsContext = context.currentInsights.map(i => `- ${i.title}: ${i.summary}`).join("\n");
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are the TELUS AI Factory Market Intelligence Assistant. 
Your goal is to help users understand the competitive landscape of AI and Cloud globally, with a focus on sovereign infrastructure.

CONTEXT:
Tracked Competitors: ${compList}
Recent Market Insights:
${insightsContext}

USER QUESTION:
${message}

Provide a professional, concise, and data-driven response. Use Google Search if you need more recent information than what's provided in the context.
CRITICAL: If you use Google Search to find information, you MUST cite your sources at the end of your response with direct, specific links to the articles you found.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  return response.text;
}

export async function generateGlobalSummary(competitors: string[], marketInsights: any[]) {
  const keywords = AI_KEYWORDS.join(' OR ');
  const marketContext = marketInsights.map(i => `- [${i.region}] ${i.title}: ${i.summary}`).join("\n");
  const compList = competitors.join(", ");
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide a comprehensive "Weekly Market Overview" report for the last 7 days.
    
Focus ONLY on news related to 'AI infrastructure', 'Sovereign Cloud', or 'AI Datacentres' within the last 7 days.

CRITICAL FOCUS: 
1. This report should PREDOMINANTLY cover Canadian news updates.
2. However, VERY PROMINENT news updates from the US and other global markets MUST be included as well to provide a complete picture of the landscape.

COMPITITORS TRACKED: ${compList}

KEYWORDS TO FOCUS ON: ${keywords}

RELEVANT DEVELOPMENTS FROM THE LAST 7 DAYS:
${marketContext}

Your report MUST include:
1. **Executive Summary**: A high-level synthesis of the AI and Cloud market landscape over the past 7 days, strictly focusing on AI infrastructure, Sovereign Cloud, and AI Datacentres.
2. **Key News & Press Releases**: Major announcements from the tracked competitors and the broader industry within the last week.
3. **Partnership Announcements (Tabular Format)**: A markdown table detailing significant strategic alliances announced this week, including Partner A, Partner B, and the Strategic Objective.
4. **Data Points & Statistics**: Specific metrics, investment figures, or performance data reported in the last 7 days.
5. **Comparison Tables**: Comprehensive markdown tables comparing competitor moves, product launches, or regional investments across the tracked entities based on this week's news.
6. **Market Outlook**: Forward-looking insights based on the week's developments.

Format the output as a professional markdown report with clear headings and bold text. **CRITICAL: All partnership announcements and competitive comparisons MUST be presented in well-structured markdown tables.** Use Google Search to find specific details for the last 7 days and the specified keywords if the provided context is insufficient.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  return response.text;
}
