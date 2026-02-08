export class EmbedEventDto {
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

export class EmbedGroupDto {
  name: string;
  slug: string;
  url: string;
}

export class EmbedGroupEventsResponseDto {
  group: EmbedGroupDto;
  events: EmbedEventDto[];
  meta: {
    total: number;
    limit: number;
    platformUrl: string;
  };
}
