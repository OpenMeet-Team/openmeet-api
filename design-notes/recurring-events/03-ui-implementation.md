# Recurring Events: UI Implementation Plan

This document outlines the UI changes required to support recurring events in the OpenMeet platform, including handling recurrence modifications and date exclusions.

## Event Creation/Editing Form Updates

We'll update the existing `EventFormBasicComponent.vue` to add recurrence options:

### 1. Recurrence Section

Add a new card section after the Event Date section:

```html
<!-- Event Recurrence -->
<q-card class="q-mb-md">
  <q-card-section>
    <div class="text-h6 q-mb-md">
      <q-icon name="sym_r_repeat" class="q-mr-sm" />
      Recurrence
    </div>
    
    <!-- Recurrence Toggle -->
    <q-toggle
      data-cy="event-recurrence-toggle"
      v-model="isRecurring"
      label="Make this a recurring event"
    />
    
    <div v-if="isRecurring" class="q-gutter-md q-mt-md">
      <!-- Frequency Selection -->
      <q-select
        data-cy="event-recurrence-frequency"
        v-model="recurrenceData.freq"
        :options="frequencyOptions"
        label="Repeats"
        filled
        emit-value
        map-options
      />
      
      <!-- Interval Selection -->
      <div class="row items-center" v-if="recurrenceData.freq">
        <span class="q-mr-sm">Every</span>
        <q-input
          data-cy="event-recurrence-interval"
          v-model.number="recurrenceData.interval"
          type="number"
          filled
          style="width: 80px"
          min="1"
        />
        <span class="q-ml-sm">{{ intervalLabel }}</span>
      </div>
      
      <!-- Weekly Options -->
      <div v-if="recurrenceData.freq === 'WEEKLY'">
        <div class="text-subtitle2">Repeat on</div>
        <div class="row q-gutter-sm">
          <q-btn
            v-for="day in weekdays"
            :key="day.value"
            :label="day.label"
            :color="isSelectedDay(day.value) ? 'primary' : 'grey-4'"
            :text-color="isSelectedDay(day.value) ? 'white' : 'black'"
            @click="toggleDay(day.value)"
            size="sm"
            rounded
          />
        </div>
      </div>
      
      <!-- Monthly Options -->
      <div v-if="recurrenceData.freq === 'MONTHLY'">
        <q-radio v-model="monthlyRepeatType" val="dom" label="On day of month" />
        <q-radio v-model="monthlyRepeatType" val="dow" label="On day of week" />
      </div>
      
      <!-- End Recurrence Options -->
      <div class="q-mt-md">
        <div class="text-subtitle2">Ends</div>
        <q-radio v-model="endRecurrenceType" val="never" label="Never" />
        <q-radio v-model="endRecurrenceType" val="count" label="After" />
        <q-radio v-model="endRecurrenceType" val="until" label="On date" />
        
        <div class="row items-center q-mt-sm" v-if="endRecurrenceType === 'count'">
          <q-input
            data-cy="event-recurrence-count"
            v-model.number="recurrenceData.count"
            type="number"
            filled
            style="width: 80px"
            min="1"
          />
          <span class="q-ml-sm">occurrences</span>
        </div>
        
        <div v-if="endRecurrenceType === 'until'">
          <DatePickerComponent
            data-cy="event-recurrence-until"
            v-model="recurrenceData.until"
            label="End date"
          />
        </div>
      </div>
      
      <!-- Timezone Selection -->
      <div class="q-mt-md">
        <div class="text-subtitle2">Timezone</div>
        <q-select
          data-cy="event-timezone"
          v-model="eventData.timeZone"
          :options="timezoneOptions"
          label="Event timezone"
          filled
          use-input
          input-debounce="300"
          @filter="filterTimezones"
        />
        <div class="text-caption q-mt-xs">
          The timezone determines when the event occurs in different locations.
        </div>
      </div>
      
      <!-- Recurrence Preview -->
      <div class="q-mt-md">
        <div class="text-subtitle2">Preview</div>
        <div class="bg-grey-2 q-pa-md rounded-borders">
          <p>{{ recurrencePreview }}</p>
          <div v-if="nextOccurrences.length" class="q-mt-sm">
            <div class="text-weight-medium">Next occurrences:</div>
            <ul>
              <li v-for="(date, i) in nextOccurrences" :key="i">
                {{ formatDate(date) }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </q-card-section>
</q-card>
```

### 2. Component Script Updates

Add the necessary data and methods to handle recurrence:

```typescript
// New imports
import { RRule } from 'rrule';
import { formatInTimeZone } from 'date-fns-tz';
import timezones from '../../utils/timezones';
import DatePickerComponent from '../common/DatePickerComponent.vue';

// Add to component data
const isRecurring = ref(false);
const recurrenceData = ref({
  freq: 'WEEKLY',
  interval: 1,
  byday: [] as string[],
  count: 10,
  until: '',
});

const endRecurrenceType = ref('count');
const monthlyRepeatType = ref('dom');
const timezoneOptions = ref(timezones.map(tz => ({ label: tz, value: tz })));

// Add computed properties
const intervalLabel = computed(() => {
  const freq = recurrenceData.value.freq;
  if (freq === 'DAILY') return recurrenceData.value.interval > 1 ? 'days' : 'day';
  if (freq === 'WEEKLY') return recurrenceData.value.interval > 1 ? 'weeks' : 'week';
  if (freq === 'MONTHLY') return recurrenceData.value.interval > 1 ? 'months' : 'month';
  if (freq === 'YEARLY') return recurrenceData.value.interval > 1 ? 'years' : 'year';
  return '';
});

const frequencyOptions = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
  { label: 'Yearly', value: 'YEARLY' },
];

const weekdays = [
  { label: 'S', value: 'SU' },
  { label: 'M', value: 'MO' },
  { label: 'T', value: 'TU' },
  { label: 'W', value: 'WE' },
  { label: 'T', value: 'TH' },
  { label: 'F', value: 'FR' },
  { label: 'S', value: 'SA' },
];

// Setup recurrence rule calculation
const recurrenceRule = computed(() => {
  try {
    const options: any = {
      freq: RRule[recurrenceData.value.freq],
      interval: recurrenceData.value.interval,
      dtstart: new Date(eventData.value.startDate)
    };
    
    if (recurrenceData.value.byday?.length) {
      options.byweekday = recurrenceData.value.byday.map(day => RRule[day]);
    }
    
    if (endRecurrenceType.value === 'count') {
      options.count = recurrenceData.value.count;
    } else if (endRecurrenceType.value === 'until') {
      options.until = new Date(recurrenceData.value.until);
    }
    
    return new RRule(options);
  } catch (error) {
    console.error('Error creating recurrence rule:', error);
    return null;
  }
});

// Display a human-readable recurrence description
const recurrencePreview = computed(() => {
  const rule = recurrenceRule.value;
  return rule ? rule.toText() : 'No recurrence pattern set';
});

// Calculate the next few occurrences for preview
const nextOccurrences = computed(() => {
  const rule = recurrenceRule.value;
  return rule ? rule.all((date, i) => i < 5) : [];
});

// Helper methods
const isSelectedDay = (day: string) => {
  return recurrenceData.value.byday?.includes(day);
};

const toggleDay = (day: string) => {
  if (!recurrenceData.value.byday) {
    recurrenceData.value.byday = [];
  }
  
  if (isSelectedDay(day)) {
    recurrenceData.value.byday = recurrenceData.value.byday.filter(d => d !== day);
  } else {
    recurrenceData.value.byday.push(day);
  }
};

const formatDate = (date: Date) => {
  return formatInTimeZone(
    date,
    eventData.value.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    'EEE, MMM d, yyyy h:mm a'
  );
};

const filterTimezones = (val: string, update: Function) => {
  if (val === '') {
    update(() => {
      timezoneOptions.value = timezones.map(tz => ({ label: tz, value: tz }));
    });
    return;
  }
  
  update(() => {
    const needle = val.toLowerCase();
    timezoneOptions.value = timezones
      .filter(tz => tz.toLowerCase().indexOf(needle) > -1)
      .map(tz => ({ label: tz, value: tz }));
  });
};

// Update form submission to include recurrence data
const onSubmit = async () => {
  // Existing code...
  
  if (isRecurring.value) {
    const rrule: Record<string, any> = {
      freq: recurrenceData.value.freq,
      interval: recurrenceData.value.interval
    };
    
    if (recurrenceData.value.byday?.length) {
      rrule.byday = recurrenceData.value.byday;
    }
    
    if (endRecurrenceType.value === 'count') {
      rrule.count = recurrenceData.value.count;
    } else if (endRecurrenceType.value === 'until') {
      rrule.until = recurrenceData.value.until;
    }
    
    event.recurrenceRule = rrule;
    
    // Set timezone if not already set
    if (!event.timeZone) {
      event.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
  }
  
  // Continue with existing submission code...
};
```

## Event Display Updates

### 1. EventPage.vue Updates for Recurring Events

The event detail page should be enhanced with:

1. **Recurrence Information Display**
   - Human-readable recurrence rule description
   - Timezone indicator with formatted local times
   - Visual indicator for recurring events

2. **Occurrence Navigation**
   - Previous/next occurrence navigation
   - "View all occurrences" button to show series occurrences
   - Indicator for modified occurrences

3. **Series Modification Options**
   - Dialog for modifying occurrences with options:
     - "Edit just this occurrence"
     - "Edit all occurrences"
     - "Edit this and future occurrences"

4. **Date Exclusion Management**
   - List of excluded dates
   - Options to exclude/include specific dates
   - Visual indication of excluded dates in the occurrences list

### 2. Calendar View Updates

Calendar view enhancements should include:

1. **Recurring Event Visual Indicators**
   - Add recurrence icon to recurring events
   - Visually distinguish parent events from occurrences
   - Show excluded dates differently

2. **Expanded Date Information**
   - Display timezone-aware dates
   - Indicate modified occurrences
   - Show series information on hover

## Event Listing Updates

Event listings should include:

1. **Recurrence Indicators**
   - Add recurrence icons to recurring events
   - Display human-readable recurrence pattern
   - Show next occurrence date with timezone

2. **Exception Handling**
   - Indicate modified occurrences
   - Show cancellations/exclusions
   - Display parent event information when relevant

## Timezone Utilities

Create timezone utilities for:

1. **Timezone Selection**
   - List of IANA timezone identifiers
   - Auto-detection of user's local timezone
   - Timezone search and filtering

2. **Date Formatting**
   - Format dates in specific timezones
   - Convert dates between timezones
   - Generate human-readable timezone names

3. **UI Components**
   - Timezone-aware date picker
   - Timezone selector with search
   - Local vs. event timezone toggle

## Recurrence Modification UI

Add UI components to handle:

1. **Modification Options**
   - Dialog for selecting modification scope (this/all/future)
   - Warning about impact of changes
   - Preview of changes to series

2. **Exclusion Management**
   - UI for excluding specific dates
   - Restoring previously excluded dates
   - Visual calendar for selecting dates to exclude

## Next Steps

1. Install required dependencies:
   - `rrule` for recurrence calculations
   - `date-fns-tz` for timezone handling

2. Create the necessary components:
   - Update EventFormBasicComponent.vue with recurrence fields
   - Update EventPage.vue to display recurrence information
   - Create modification dialogs for recurrence pattern changes

3. Add timezone utilities and helper functions

4. Update the store to support recurring events and timezone handling