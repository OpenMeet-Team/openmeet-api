import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { TenantConnectionService } from '../tenant/tenant.service';
import axios from 'axios';

interface EventData {
  name: string;
  description: string;
  startDate: string;
  endDate?: string;
  location: string;
  categoryId: number;
  maxAttendees?: number;
  type: string;
  locationOnline?: string;
  sourceUrl?: string;
  image?: string | { id: number };
  lat?: string;
  lon?: string;
}

interface GeocodingResult {
  lat?: string;
  lon?: string;
  error?: string;
}

@Injectable()
export class EventIngestionService {
  private readonly logger = new Logger(EventIngestionService.name);
  private openai: OpenAI;

  constructor(
    private readonly tenantConnectionService: TenantConnectionService,
  ) {
    this.logger.log('Initializing EventIngestionService');
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.logger.log('EventIngestionService initialized');
  }

  private async geocodeAddress(address: string): Promise<GeocodingResult> {
    try {
      const encodedAddress = encodeURIComponent(address);
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
        {
          headers: {
            'User-Agent': 'OpenMeet Event Ingestion Service',
          },
        },
      );

      // Respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (response.data && response.data.length > 0) {
        return {
          lat: response.data[0].lat,
          lon: response.data[0].lon,
        };
      }
      return { error: 'Location not found' };
    } catch (error) {
      this.logger.error('Geocoding failed:', error);
      return { error: error.message };
    }
  }

  async processTextForEvents(text: string): Promise<EventData[]> {
    try {
      this.logger.log(
        `Processing text for events: ${text.substring(0, 100)}...`,
      );

      const prompt = `
        Extract ONLY real events that exist in the provided text content. 
        DO NOT generate or invent events.
        DO NOT hallucinate details that aren't present.
        Only select unique events, NO duplicates. 

        For each event found in the text, provide:
        - name: The exact event name as it appears
        - description: The actual description, include any contact info
        - startDate: The exact start date/time (in ISO format)
        - endDate: The exact end date/time (in ISO format)
        - location: The exact location (standardized address format)
        - categoryId: Based on the actual event content:
          1: TECHNOLOGY (tech events, coding, software)
          2: BUSINESS (business, entrepreneur, finance)
          3: SOCIAL (community events, networking)
          4: EDUCATION (workshops, training, courses)
          5: ENTERTAINMENT (music, art, shows)
        - type: Based on the actual venue - "in-person", "online", or "hybrid"
        - locationOnline: URL if it's an online event
        - maxAttendees: Number if specified, otherwise null
        
        Return a JSON array containing ONLY events that are explicitly described in the text.
        If no valid events are found, return an empty array.
        Do not infer or generate any information not present in the text.
        Standardize addresses to include city, state, and zip code where possible.`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You are a precise text parser that extracts ONLY real events that exist in the provided content. Never generate or invent events or details.',
          },
          {
            role: 'user',
            content: prompt + '\n\nContent to parse:\n' + text,
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      });

      if (!completion?.choices?.[0]?.message?.content) {
        this.logger.warn('No valid response from OpenAI');
        return [];
      }

      const parsedEvents: EventData[] = JSON.parse(
        completion.choices[0]?.message?.content || '{"events":[]}',
      ).events;

      // Process each event
      const processedEvents = await Promise.all(
        parsedEvents.map(async (event) => {
          // Geocode location if it's not an online event
          if (event.type !== 'online' && event.location) {
            try {
              const geocoded = await this.geocodeAddress(event.location);
              if (geocoded.lat && geocoded.lon) {
                event.lat = geocoded.lat;
                event.lon = geocoded.lon;
              }
            } catch (geocodeError) {
              this.logger.warn(
                `Failed to geocode location for event "${event.name}": ${geocodeError}`,
              );
            }
          }

          return event;
        }),
      );

      this.logger.log(
        `Successfully extracted ${processedEvents.length} events`,
      );
      return processedEvents;
    } catch (error) {
      this.logger.error('Error processing text for events:', error);
      throw error;
    }
  }

  async validateAndEnrichEvent(event: EventData): Promise<EventData> {
    try {
      // Validate required fields
      if (!event.name || !event.startDate) {
        throw new Error('Event must have at least a name and start date');
      }

      // Ensure dates are in ISO format
      try {
        const startDate = await Promise.resolve(new Date(event.startDate).toISOString());
        event.startDate = startDate;
        
        if (event.endDate) {
          const endDate = await Promise.resolve(new Date(event.endDate).toISOString());
          event.endDate = endDate;
        }
      } catch (error) {
        throw new Error('Invalid date format');
      }

      // Set default values
      event.maxAttendees = event.maxAttendees || 100;
      event.type = event.type || 'in-person';

      // Validate category
      if (event.categoryId && ![1, 2, 3, 4, 5].includes(event.categoryId)) {
        throw new Error('Invalid category ID');
      }

      return Promise.resolve(event);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
