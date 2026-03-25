export interface Competitor {
  id: number;
  name: string;
  industry: string;
  domain?: string;
  executive_summary?: string;
  logo_url?: string;
  head_office?: string;
  website?: string;
  description?: string;
  created_at: string;
}

export interface Market {
  id: number;
  name: string;
  region_code: string;
  created_at: string;
}

export interface Insight {
  id: number;
  competitor_id: number;
  title: string;
  summary: string;
  url: string;
  published_date: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  created_at: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}
