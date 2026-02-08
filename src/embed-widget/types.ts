export interface WidgetConfig {
  group: string;
  tenant: string;
  theme: 'light' | 'dark';
  limit: number;
  layout: 'list' | 'cards';
  api: string;
}

export interface EmbedEvent {
  slug: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string | null;
  timeZone: string;
  location: string | null;
  type: string;
  imageUrl: string | null;
  url: string;
  attendeesCount: number;
}

export interface EmbedGroup {
  name: string;
  slug: string;
  url: string;
}

export interface EmbedResponse {
  group: EmbedGroup;
  events: EmbedEvent[];
  meta: {
    total: number;
    limit: number;
    platformUrl: string;
  };
}
