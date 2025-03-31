# iCalendar Export Implementation

This document outlines the implementation of iCalendar (.ics) export functionality for OpenMeet events, allowing users to add events to their personal calendar applications.

## Requirements

1. Generate standards-compliant iCalendar (.ics) files for events
2. Support single events and recurring events with full recurrence rules
3. Include all relevant event details (title, description, location, etc.)
4. Provide email delivery for calendar invitations
5. Support "Add to Calendar" functionality on event pages

## iCalendar Format Implementation

### ICalendarService

Create a new service to handle iCalendar generation:

```typescript
@Injectable()
export class ICalendarService {
  constructor(
    private readonly configService: ConfigService,
    private readonly mailerService: MailerService,
    private readonly logger: Logger,
  ) {}

  /**
   * Generate iCalendar content for an event
   */
  async generateICalContent(event: EventEntity): Promise<string> {
    // Create iCalendar content using ical-generator library
    const cal = ical({ name: 'OpenMeet Events' });
    
    const calEvent = cal.createEvent({
      start: new Date(event.startDate),
      end: event.endDate ? new Date(event.endDate) : undefined,
      summary: event.name,
      description: event.description,
      location: event.location,
      url: this.getEventUrl(event),
      timezone: event.timeZone,
    });
    
    // Add organizer information
    if (event.user) {
      calEvent.organizer({
        name: event.user.name,
        email: event.user.email,
      });
    }
    
    // Add recurrence information if applicable
    if (event.isRecurring && event.recurrenceRule) {
      // Convert our recurrence rule format to iCalendar RRule format
      const rrule = this.convertToRRule(event.recurrenceRule);
      calEvent.repeating(rrule);
      
      // Add exceptions if any
      if (event.recurrenceExceptions?.length) {
        event.recurrenceExceptions.forEach(exdate => {
          calEvent.exdate(new Date(exdate));
        });
      }
    }
    
    return cal.toString();
  }
  
  /**
   * Email iCalendar to a user
   */
  async emailCalendarInvite(
    event: EventEntity,
    email: string,
    userName?: string,
  ): Promise<void> {
    const icalContent = await this.generateICalContent(event);
    const attachment = {
      filename: `${this.slugify(event.name)}.ics`,
      content: icalContent,
      contentType: 'text/calendar',
    };
    
    await this.mailerService.sendMail({
      to: email,
      subject: `Event Invitation: ${event.name}`,
      template: 'event-invitation',
      context: {
        eventName: event.name,
        userName: userName || 'there',
        eventDate: this.formatDate(event.startDate, event.timeZone),
        eventLocation: event.location || 'Online',
        eventUrl: this.getEventUrl(event),
        timeZone: event.timeZone,
      },
      attachments: [attachment],
    });
  }
  
  /**
   * Get the public URL for an event
   */
  private getEventUrl(event: EventEntity): string {
    const baseUrl = this.configService.get('APP_URL');
    return `${baseUrl}/events/${event.slug}`;
  }
  
  /**
   * Convert our recurrence rule format to iCalendar format
   */
  private convertToRRule(recurrenceRule: Record<string, any>): any {
    // Map our recurrence format to ical-generator's format
    const rrule: any = {};
    
    if (recurrenceRule.freq) {
      rrule.freq = recurrenceRule.freq;
    }
    
    if (recurrenceRule.interval) {
      rrule.interval = recurrenceRule.interval;
    }
    
    if (recurrenceRule.count) {
      rrule.count = recurrenceRule.count;
    }
    
    if (recurrenceRule.until) {
      rrule.until = new Date(recurrenceRule.until);
    }
    
    // Map other recurrence properties
    ['byday', 'bymonth', 'bymonthday', 'byhour', 'byminute', 'bysecond', 'bysetpos', 'wkst'].forEach(prop => {
      if (recurrenceRule[prop]) {
        rrule[prop] = recurrenceRule[prop];
      }
    });
    
    return rrule;
  }
  
  /**
   * Format date in a timezone-aware way
   */
  private formatDate(date: string, timeZone?: string): string {
    // Format date using timezone if available
    if (timeZone) {
      return format(zonedTimeToUtc(new Date(date), timeZone), 'PPpp');
    }
    return format(new Date(date), 'PPpp');
  }
  
  /**
   * Create a URL-friendly slug from a string
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');
  }
}
```

## API Endpoints

Add API endpoints for calendar export:

```typescript
@Controller('events')
export class EventCalendarController {
  constructor(
    private readonly iCalendarService: ICalendarService,
    private readonly eventQueryService: EventQueryService,
  ) {}
  
  /**
   * Generate and download iCalendar file
   */
  @Get(':slug/calendar')
  @Header('Content-Type', 'text/calendar')
  @Header('Content-Disposition', 'attachment; filename="event.ics"')
  async downloadCalendar(
    @Param('slug') slug: string,
    @Res() res: Response,
  ): Promise<void> {
    const event = await this.eventQueryService.getEventBySlug(slug);
    const icalContent = await this.iCalendarService.generateICalContent(event);
    
    res.setHeader('Content-Disposition', `attachment; filename="${this.slugify(event.name)}.ics"`);
    res.send(icalContent);
  }
  
  /**
   * Email iCalendar to user
   */
  @Post(':slug/email-calendar')
  async emailCalendar(
    @Param('slug') slug: string,
    @Body() body: { email: string; name?: string },
    @CurrentUser() user: UserEntity,
  ): Promise<{ success: boolean }> {
    const event = await this.eventQueryService.getEventBySlug(slug);
    
    await this.iCalendarService.emailCalendarInvite(
      event,
      body.email || user.email,
      body.name || user.name,
    );
    
    return { success: true };
  }
}
```

## UI Implementation

### Add to Calendar Button

Add a component to the EventPage.vue:

```html
<!-- Add to Calendar Button -->
<q-btn-dropdown
  color="primary"
  icon="sym_r_calendar_today"
  label="Add to Calendar"
>
  <q-list>
    <q-item clickable @click="downloadCalendar">
      <q-item-section avatar>
        <q-icon name="sym_r_download" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Download .ics File</q-item-label>
      </q-item-section>
    </q-item>
    
    <q-item clickable @click="showEmailCalendarDialog = true">
      <q-item-section avatar>
        <q-icon name="sym_r_email" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Email to Me</q-item-label>
      </q-item-section>
    </q-item>
    
    <q-separator />
    
    <q-item clickable @click="addToGoogleCalendar">
      <q-item-section avatar>
        <q-icon name="sym_r_event" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Google Calendar</q-item-label>
      </q-item-section>
    </q-item>
    
    <q-item clickable @click="addToOutlookCalendar">
      <q-item-section avatar>
        <q-icon name="sym_r_event" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Outlook Calendar</q-item-label>
      </q-item-section>
    </q-item>
  </q-list>
</q-btn-dropdown>

<!-- Email Calendar Dialog -->
<q-dialog v-model="showEmailCalendarDialog">
  <q-card>
    <q-card-section>
      <div class="text-h6">Email Calendar Invite</div>
    </q-card-section>
    
    <q-card-section>
      <q-input
        v-model="emailCalendarForm.email"
        label="Email Address"
        type="email"
        :rules="[val => !!val || 'Email is required']"
      />
    </q-card-section>
    
    <q-card-actions align="right">
      <q-btn flat label="Cancel" v-close-popup />
      <q-btn
        color="primary"
        label="Send"
        :loading="sendingEmail"
        @click="sendCalendarEmail"
      />
    </q-card-actions>
  </q-card>
</q-dialog>
```

### Component Script

Add the necessary methods:

```typescript
// Add calendar-related data
const showEmailCalendarDialog = ref(false);
const emailCalendarForm = ref({
  email: user?.email || '',
});
const sendingEmail = ref(false);

// Download calendar file
const downloadCalendar = () => {
  window.open(`/api/events/${event.value.slug}/calendar`, '_blank');
};

// Send calendar email
const sendCalendarEmail = async () => {
  try {
    sendingEmail.value = true;
    await eventsApi.emailCalendar(event.value.slug, emailCalendarForm.value);
    $q.notify({
      type: 'positive',
      message: 'Calendar invite sent to your email!',
    });
    showEmailCalendarDialog.value = false;
  } catch (error) {
    console.error('Failed to send calendar email:', error);
    $q.notify({
      type: 'negative',
      message: 'Failed to send calendar invite',
    });
  } finally {
    sendingEmail.value = false;
  }
};

// Add to third-party calendars
const addToGoogleCalendar = () => {
  const startTime = formatForGoogle(event.value.startDate);
  const endTime = event.value.endDate ? formatForGoogle(event.value.endDate) : '';
  
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.append('action', 'TEMPLATE');
  url.searchParams.append('text', event.value.name);
  url.searchParams.append('dates', `${startTime}/${endTime}`);
  url.searchParams.append('details', event.value.description || '');
  url.searchParams.append('location', event.value.location || '');
  
  window.open(url.toString(), '_blank');
};

const addToOutlookCalendar = () => {
  // Similar to Google Calendar implementation
};
```

## Email Template

Create an email template for calendar invitations:

```html
<!-- src/email/templates/event-invitation.hbs -->
<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Event Invitation: {{eventName}}</h2>
  
  <p>Hello {{userName}},</p>
  
  <p>You have been invited to the following event:</p>
  
  <div style="background-color: #f7f7f7; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <h3>{{eventName}}</h3>
    <p><strong>Date:</strong> {{eventDate}}</p>
    <p><strong>Location:</strong> {{eventLocation}}</p>
    <p><strong>Timezone:</strong> {{timeZone}}</p>
  </div>
  
  <p>
    <a href="{{eventUrl}}" style="background-color: #4A5568; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">
      View Event Details
    </a>
  </p>
  
  <p>We've attached an iCalendar file that you can import into your calendar application.</p>
  
  <p>See you there!</p>
  
  <hr style="border: 0; border-top: 1px solid #ddd; margin: 30px 0;" />
  
  <p style="color: #888; font-size: 12px;">
    This is an automated message from OpenMeet. Please do not reply to this email.
  </p>
</div>
```

## Dependencies

Add the necessary dependencies to the project:

```bash
npm install --save ical-generator date-fns-tz
```

## Implementation Phases

1. **Phase 1: Core iCalendar Generation** ✅
   - ✅ Implement the ICalendarService using ical-generator
   - ✅ Add API endpoint for downloading iCalendar files
   - ✅ Add tests for iCalendar generation
   - ✅ Test with various event types (single, recurring)

2. **Phase 2: Third-Party Calendar Integration** ✅
   - ✅ Implement Google Calendar link generation in frontend
   - ✅ Integrate with frontend components via RecurrenceDisplayComponent
   - ✅ Test with different event parameters

3. **Phase 3: Email Delivery** ⏳
   - ⏳ Create email template
   - ⏳ Implement email sending functionality
   - ⏳ Add email address input UI

## Implementation Status

### Completed
- ✅ `ICalendarService` implementation using ical-generator
- ✅ API endpoint `/api/events/:slug/calendar` for downloading .ics files
- ✅ Handling of recurring events with RRULE formatting based on RFC 5545
- ✅ Frontend "Download iCalendar file" button in RecurrenceDisplayComponent
- ✅ Google Calendar link generation

### Pending
- ⏳ Email delivery of calendar invitations
- ⏳ Outlook Calendar integration
- ⏳ Integration with email notification system

## Testing Considerations

- ✅ Test iCalendar generation with various recurrence patterns
- ✅ Verify timezone handling in generated files
- ⏳ Test compatibility with popular calendar applications
- ⏳ Test email delivery and attachment handling
- ⏳ Ensure correct timezone handling across different calendar systems

## Next Steps
1. Implement email delivery functionality for calendar invitations
2. Add Outlook Calendar integration
3. Expand test coverage for various calendar clients 
4. Add UI for "Email me this calendar invite" functionality