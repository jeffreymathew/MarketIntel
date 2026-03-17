import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

const AI_KEYWORDS = [
  "Sovereign AI", "AI factory", "AI infrastructure", "AI Compute", 
  "Sovereign", "AI", "High-performance compute", "AI Cloud", "GPU Cloud Compute"
];

export async function searchMarketInsights(query: string, domain?: string) {
  const keywords = AI_KEYWORDS.join(' OR ');
  const domainFilter = domain ? `site:${domain} OR ` : '';
  const prompt = `Find the latest news and market insights for: "${query}" AND (${keywords}). 
Focus on developments in Canada or specific to their official domains (${domainFilter}location:canada). 
Prioritize news from 2025 and 2026. 
Focus on recent developments, financial performance, and competitive moves.`;

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
Keywords to focus on: "${region}", "${keywords}".
Include specific data points, statistics, government investments, and major corporate announcements.
Prioritize developments from 2025 and 2026.
Format the output as a professional markdown report with clear headings, bullet points, and bold text for emphasis. Do not use generic filler.
IMPORTANT: Always provide a section "Sources" at the very bottom, with markdown hyperlinks to each of the articles you referenced.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  return response.text;
}

export async function generateGlobalSummary(competitors: string[], marketInsights: any[]) {
  const keywords = AI_KEYWORDS.join(' OR ');
  const marketContext = marketInsights.map(i => `- ${i.title}: ${i.summary}`).join("\n");
  const compList = competitors.join(", ");
  const currentDate = new Date();
  const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const monthName = lastMonth.toLocaleString('default', { month: 'long' });
  const year = lastMonth.getFullYear();
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide a comprehensive "Market Overview" report for the month of ${monthName} ${year}.
    
COMPETITORS TRACKED: ${compList}

KEYWORDS TO FOCUS ON: ${keywords}

RELEVANT DEVELOPMENTS:
${marketContext}

Your report MUST include:
1. **Executive Summary**: A high-level synthesis of the AI and Cloud market landscape in ${monthName} ${year}.
2. **Key News & Press Releases**: Major announcements from the tracked competitors and the broader industry.
3. **Partnership Announcements (Tabular Format)**: A markdown table detailing significant strategic alliances, including Partner A, Partner B, and the Strategic Objective.
4. **Data Points & Statistics**: Specific metrics, investment figures, or performance data.
5. **Comparison Tables**: Comprehensive markdown tables comparing competitor moves, product launches, or regional investments across the tracked entities.
6. **Market Outlook**: Forward-looking insights based on the month's developments.

Format the output as a professional markdown report with clear headings and bold text. **CRITICAL: All partnership announcements and competitive comparisons MUST be presented in well-structured markdown tables.** Use Google Search to find specific details for ${monthName} ${year} and the specified keywords if the provided context is insufficient.`,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  return response.text;
}
