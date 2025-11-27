# Sponsorship System Implementation Guide

This document provides technical details for implementing the sponsorship system described in `sponsorship-system-spec.md`. It focuses on Phase 0 and Phase 1, with architecture designed for future group fundraising reuse.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 0: Payment Link](#phase-0-payment-link)
3. [Phase 1: Architecture](#phase-1-architecture)
4. [Service Structure](#service-structure)
5. [Database Design](#database-design)
6. [API Design](#api-design)
7. [Stripe Integration](#stripe-integration)
8. [Frontend Implementation](#frontend-implementation)
9. [Badge Display (Phase 1)](#badge-display-phase-1)
10. [Security Considerations](#security-considerations)
11. [Testing Strategy](#testing-strategy)
12. [Deployment](#deployment)
13. [Phase 2+ Roadmap](#phase-2-roadmap)

---

## Architecture Overview

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| OSS Purity | Billing service is completely separate from openmeet-api |
| Validate First | Phase 0 validates demand before building infrastructure |
| Simple First | Phase 1 uses API calls for badges, no event sync |
| Reusable | Components designed for future group fundraising |

### Phase 1 Architecture

```
                         EXTERNAL
    ┌────────────────────────────────────────────────────────┐
    │                                                        │
    │   Users ─────────────────┐                             │
    │                          │                             │
    │   Stripe ────────────────┼── webhook ──┐               │
    │                          │             │               │
    └──────────────────────────┼─────────────┼───────────────┘
                               │             │
┌──────────────────────────────┼─────────────┼───────────────────────────┐
│                              │             │                           │
│   KUBERNETES CLUSTER         │             │                           │
│                              ▼             ▼                           │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │
│   │  Platform   │───▶│ openmeet-   │    │ openmeet-   │               │
│   │   (Vue)     │    │    api      │    │  billing    │◀── webhook   │
│   └──────┬──────┘    └─────────────┘    └──────┬──────┘               │
│          │                                     │                       │
│          │         direct API calls            │                       │
│          └─────────────────────────────────────┘                       │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                               │
                               │   DB connections
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│   AWS RDS (PostgreSQL)                                               │
│                                                                      │
│   ┌────────────────────┐         ┌────────────────────┐             │
│   │    Tenant DBs      │         │    Billing DB      │             │
│   │  (open source)     │         │    (private)       │             │
│   └────────────────────┘         └────────────────────┘             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### What's NOT in Phase 1

- No RabbitMQ event sync
- No `supporter_profiles` table in tenant DB
- No badge data in openmeet-api
- No recurring contributions

Frontend calls billing service directly for badge data. This is acceptable for Phase 1 volume.

---

## Phase 0: Payment Link

### Setup Steps

1. **Create Stripe Product** (Dashboard or API)
   - Name: "Support OpenMeet"
   - Description: "Help keep OpenMeet free for communities. Not tax-deductible."

2. **Create Payment Link** (Stripe Dashboard)
   - Product: Support OpenMeet
   - Pricing: Customer chooses amount
   - Minimum: $5.00
   - Suggested amounts: $10, $25, $50
   - Collect: Email (required)
   - After payment: Redirect to `https://openmeet.net/support/thank-you?session_id={CHECKOUT_SESSION_ID}`

3. **Add Link to Footer**
   - Text: "Support Us"
   - URL: `https://buy.stripe.com/your-link-id`

4. **Create Simple Thank You Page**
   - Static page at `/support/thank-you`
   - Message: "Thank you for supporting OpenMeet!"
   - No dynamic content needed

### Tracking

- View contributions in Stripe Dashboard
- Export to spreadsheet if needed for manual sponsor wall
- No code changes to platform

### Success Criteria

After 2-4 weeks, evaluate:
- Number of contributions
- Total amount
- Proceed to Phase 1 if 5+ contributions or $100+ received

---

## Phase 1: Architecture

### Service Boundaries

**openmeet-billing** (private, not open source):
- Stripe integration
- Contribution storage
- Badge calculation
- Supporter wall data
- Progress meter data

**openmeet-api** (open source):
- Zero sponsorship code
- No billing tables
- No Stripe references

**openmeet-platform** (open source):
- UI components (generic, reusable)
- Calls billing service directly for sponsorship features
- Calls openmeet-api for user data

### Data Flow

```
User Profile Page:
  Platform → openmeet-api (get user data)
           → openmeet-billing (get badge for user)  [Phase 1]
           → display combined data

Support Page:
  Platform → openmeet-billing (get progress, create checkout)

Supporters Wall:
  Platform → openmeet-billing (get supporter list)
```

---

## Service Structure

### New Service: openmeet-billing

```
openmeet-billing/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── configuration.ts
│   │   └── validation.ts
│   ├── health/
│   │   └── health.controller.ts
│   ├── contributions/
│   │   ├── contributions.module.ts
│   │   ├── contributions.controller.ts
│   │   ├── contributions.service.ts
│   │   ├── dto/
│   │   │   ├── create-checkout.dto.ts
│   │   │   ├── contribution-response.dto.ts
│   │   │   └── supporter-query.dto.ts
│   │   └── entities/
│   │       └── contribution.entity.ts
│   ├── supporters/
│   │   ├── supporters.module.ts
│   │   ├── supporters.controller.ts
│   │   └── supporters.service.ts
│   ├── stripe/
│   │   ├── stripe.module.ts
│   │   ├── stripe.service.ts
│   │   └── stripe-webhook.controller.ts
│   └── common/
│       ├── guards/
│       │   └── api-key.guard.ts
│       └── utils/
│           └── badge-calculator.ts
├── test/
├── Dockerfile
├── package.json
└── tsconfig.json
```

### Modifications to openmeet-platform

```
openmeet-platform/src/
├── pages/
│   ├── SupportPage.vue
│   ├── SupportThankYouPage.vue
│   └── SupportersPage.vue
├── components/
│   └── fundraising/           # Generic naming for reuse
│       ├── FundraiserForm.vue
│       ├── ProgressMeter.vue
│       ├── SupporterWall.vue
│       ├── BadgeDisplay.vue
│       └── BadgeIcon.vue
├── composables/
│   └── useBilling.ts          # Billing service API calls
└── types/
    └── billing.ts
```

### No Changes to openmeet-api

The core API remains completely clean. No sponsorship code, tables, or dependencies.

---

## Database Design

### Billing Database

Single database for the billing service. Same RDS instance as tenant DBs, different logical database.

**Table: contributions**

```sql
CREATE TABLE contributions (
  id SERIAL PRIMARY KEY,
  ulid VARCHAR(26) UNIQUE NOT NULL,

  -- Who contributed
  tenant_id VARCHAR(50) NOT NULL,
  user_id INTEGER NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,

  -- Contribution details
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 500),
  currency VARCHAR(3) NOT NULL DEFAULT 'usd',
  message TEXT,

  -- Privacy settings
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  public_display_consent BOOLEAN NOT NULL DEFAULT FALSE,
  consent_timestamp TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- pending, completed, refunded, failed

  -- Stripe references
  stripe_checkout_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  stripe_customer_id VARCHAR(255),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_consent CHECK (
    is_anonymous = TRUE OR public_display_consent = TRUE
  )
);

-- Indexes
CREATE INDEX idx_contributions_user ON contributions(tenant_id, user_id);
CREATE INDEX idx_contributions_status ON contributions(status);
CREATE INDEX idx_contributions_stripe_session ON contributions(stripe_checkout_session_id);
CREATE INDEX idx_contributions_completed_month ON contributions(completed_at)
  WHERE status = 'completed';
```

**Table: stripe_events** (for idempotency)

```sql
CREATE TABLE stripe_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) UNIQUE NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### No Tenant DB Changes

In Phase 1, there are no changes to tenant databases. Badge data lives only in the billing database and is fetched via API calls.

---

## API Design

### Billing Service Endpoints

Base URL: `https://billing.openmeet.net/api/v1`

#### Health Check

```
GET /health

Response: 200 OK
{
  "status": "ok",
  "timestamp": "2025-01-25T12:00:00Z"
}
```

#### Create Checkout Session

```
POST /contributions/checkout

Headers:
  Authorization: Bearer <user-jwt>
  X-Tenant-Id: <tenant-id>

Request:
{
  "amount_cents": 2500,
  "is_anonymous": false,
  "public_display_consent": true,
  "message": "Keep up the great work!"  // optional
}

Response: 200 OK
{
  "checkout_url": "https://checkout.stripe.com/...",
  "contribution_ulid": "01HQ..."
}

Errors:
  400 - Invalid amount or missing consent
  401 - Not authenticated
```

#### Get Contribution (for thank-you page)

```
GET /contributions/:ulid

Response: 200 OK
{
  "ulid": "01HQ...",
  "amount_cents": 2500,
  "status": "completed",
  "badge_earned": "bronze",
  "total_cents": 7500,
  "next_badge": "silver",
  "next_badge_amount_cents": 10000,
  "created_at": "2025-01-25T12:00:00Z"
}
```

#### Get User Badge

```
GET /supporters/:tenantId/:userId/badge

Response: 200 OK
{
  "badge_level": "bronze",  // or null if no badge
  "total_cents": 7500,
  "contribution_count": 3,
  "first_contribution_at": "2024-06-15T00:00:00Z"
}

Response: 200 OK (no contributions)
{
  "badge_level": null,
  "total_cents": 0,
  "contribution_count": 0,
  "first_contribution_at": null
}
```

#### Get User Contribution History

```
GET /contributions/me

Headers:
  Authorization: Bearer <user-jwt>
  X-Tenant-Id: <tenant-id>

Query:
  page: number (default 1)
  limit: number (default 20, max 100)

Response: 200 OK
{
  "data": [
    {
      "ulid": "01HQ...",
      "amount_cents": 2500,
      "status": "completed",
      "created_at": "2025-01-25T12:00:00Z"
    }
  ],
  "total": 3,
  "total_cents": 7500,
  "badge_level": "bronze"
}
```

#### Get Supporters Wall

```
GET /supporters

Query:
  period: "month" | "all" (default "all")

Response: 200 OK
{
  "supporters": {
    "platinum": [
      { "name": "Alice Johnson", "since": "2024-01-15" }
    ],
    "gold": [
      { "name": "Bob Smith", "since": "2024-03-20" }
    ],
    "silver": [...],
    "bronze": [...]
  },
  "total_count": 47
}
```

#### Get Monthly Progress

```
GET /progress

Response: 200 OK
{
  "goal_cents": 50000,
  "current_cents": 34700,
  "supporter_count": 23,
  "month": "2025-01",
  "percentage": 69
}
```

#### Stripe Webhook

```
POST /stripe/webhook

Headers:
  Stripe-Signature: <signature>

Body: Raw Stripe event

Response: 200 OK
```

---

## Stripe Integration

### Environment Variables

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=https://openmeet.net/support/thank-you?contribution={CHECKOUT_SESSION_ID}
STRIPE_CANCEL_URL=https://openmeet.net/support?cancelled=true
```

### Checkout Session Creation

```typescript
// stripe.service.ts

async createCheckoutSession(params: {
  tenantId: string;
  userId: number;
  userEmail: string;
  userName: string;
  amountCents: number;
  contributionUlid: string;
  isAnonymous: boolean;
}): Promise<string> {
  const session = await this.stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: params.userEmail,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: params.amountCents,
          product_data: {
            name: 'Support OpenMeet',
            description: 'Thank you for keeping OpenMeet free for everyone.',
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      contribution_ulid: params.contributionUlid,
      tenant_id: params.tenantId,
      user_id: params.userId.toString(),
      is_anonymous: params.isAnonymous.toString(),
    },
    success_url: `${this.config.successUrl}?contribution=${params.contributionUlid}`,
    cancel_url: this.config.cancelUrl,
  });

  return session.url;
}
```

### Webhook Handler

```typescript
// stripe-webhook.controller.ts

@Post('webhook')
async handleWebhook(
  @Headers('stripe-signature') signature: string,
  @Req() request: RawBodyRequest<Request>,
) {
  const event = this.stripe.webhooks.constructEvent(
    request.rawBody,
    signature,
    this.config.webhookSecret,
  );

  // Idempotency check
  const exists = await this.stripeEventsRepo.findOne({
    where: { eventId: event.id },
  });
  if (exists) {
    return { received: true, duplicate: true };
  }

  // Process based on event type
  switch (event.type) {
    case 'checkout.session.completed':
      await this.handleCheckoutCompleted(event.data.object);
      break;
    case 'checkout.session.expired':
      await this.handleCheckoutExpired(event.data.object);
      break;
    case 'charge.refunded':
      await this.handleRefund(event.data.object);
      break;
  }

  // Record event
  await this.stripeEventsRepo.save({ eventId: event.id, eventType: event.type });

  return { received: true };
}
```

### Webhook Events (Phase 1)

| Event | Action |
|-------|--------|
| checkout.session.completed | Mark contribution completed, update totals |
| checkout.session.expired | Mark contribution failed |
| charge.refunded | Subtract from total, recalculate badge |

---

## Frontend Implementation

### Component: FundraiserForm

Generic form component, reusable for future group fundraising.

```vue
<!-- components/fundraising/FundraiserForm.vue -->
<script setup lang="ts">
interface Props {
  recipientName: string;
  recipientType: 'platform' | 'group';
  presetAmounts?: number[];
  minAmount?: number;
  maxAmount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  presetAmounts: () => [10, 25, 50],
  minAmount: 5,
  maxAmount: 10000,
});

const emit = defineEmits<{
  submit: [data: ContributionFormData];
}>();

const selectedAmount = ref<number | null>(25);
const customAmount = ref<number | null>(null);
const isAnonymous = ref(false);
const publicConsent = ref(true);
const message = ref('');

const effectiveAmount = computed(() =>
  customAmount.value ?? selectedAmount.value
);

// ... form logic
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <!-- Amount selection -->
    <div class="amount-presets">
      <button
        v-for="amount in presetAmounts"
        :key="amount"
        type="button"
        :class="{ selected: selectedAmount === amount }"
        @click="selectPreset(amount)"
      >
        ${{ amount }}
      </button>
      <input
        v-model.number="customAmount"
        type="number"
        :min="minAmount"
        :max="maxAmount"
        placeholder="Other"
        @focus="selectedAmount = null"
      />
    </div>

    <!-- Privacy options -->
    <label>
      <input v-model="isAnonymous" type="checkbox" />
      Keep my contribution anonymous
    </label>

    <label v-if="!isAnonymous">
      <input v-model="publicConsent" type="checkbox" required />
      Display my name on the supporters page
    </label>

    <!-- Optional message -->
    <textarea
      v-model="message"
      placeholder="Optional: Why do you support {{ recipientName }}?"
      maxlength="500"
    />

    <!-- Submit -->
    <button type="submit" :disabled="!isValid">
      Continue to Payment
    </button>
  </form>
</template>
```

### Component: ProgressMeter

```vue
<!-- components/fundraising/ProgressMeter.vue -->
<script setup lang="ts">
interface Props {
  goalCents: number;
  currentCents: number;
  supporterCount: number;
  showDollarAmount?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showDollarAmount: true,
});

const percentage = computed(() =>
  Math.min(100, Math.round((props.currentCents / props.goalCents) * 100))
);

const formatCurrency = (cents: number) =>
  `$${(cents / 100).toLocaleString()}`;
</script>

<template>
  <div class="progress-meter">
    <div class="progress-bar">
      <div class="progress-fill" :style="{ width: `${percentage}%` }" />
    </div>
    <div class="progress-text">
      <template v-if="showDollarAmount">
        {{ formatCurrency(currentCents) }} of {{ formatCurrency(goalCents) }}
      </template>
      from {{ supporterCount }} supporters
    </div>
  </div>
</template>
```

### Component: BadgeDisplay

```vue
<!-- components/fundraising/BadgeDisplay.vue -->
<script setup lang="ts">
type BadgeLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | null;

interface Props {
  level: BadgeLevel;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  showLabel: false,
});

const badgeConfig = {
  bronze: { color: '#CD7F32', label: 'Bronze Supporter' },
  silver: { color: '#C0C0C0', label: 'Silver Supporter' },
  gold: { color: '#FFD700', label: 'Gold Supporter' },
  platinum: { color: '#E5E4E2', label: 'Platinum Supporter' },
};
</script>

<template>
  <div v-if="level" class="badge-display" :class="[level, size]">
    <BadgeIcon :level="level" :size="size" />
    <span v-if="showLabel" class="badge-label">
      {{ badgeConfig[level].label }}
    </span>
  </div>
</template>
```

### Composable: useBilling

```typescript
// composables/useBilling.ts

const BILLING_API = import.meta.env.VITE_BILLING_API_URL;

export function useBilling() {
  const authStore = useAuthStore();

  const createCheckout = async (data: {
    amountCents: number;
    isAnonymous: boolean;
    publicDisplayConsent: boolean;
    message?: string;
  }) => {
    const response = await fetch(`${BILLING_API}/contributions/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authStore.token}`,
        'X-Tenant-Id': authStore.tenantId,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) throw new Error('Failed to create checkout');
    return response.json();
  };

  const getContribution = async (ulid: string) => {
    const response = await fetch(`${BILLING_API}/contributions/${ulid}`);
    if (!response.ok) throw new Error('Contribution not found');
    return response.json();
  };

  const getUserBadge = async (tenantId: string, userId: number) => {
    const response = await fetch(
      `${BILLING_API}/supporters/${tenantId}/${userId}/badge`
    );
    if (!response.ok) return null;
    return response.json();
  };

  const getMyContributions = async (page = 1, limit = 20) => {
    const response = await fetch(
      `${BILLING_API}/contributions/me?page=${page}&limit=${limit}`,
      {
        headers: {
          'Authorization': `Bearer ${authStore.token}`,
          'X-Tenant-Id': authStore.tenantId,
        },
      }
    );
    if (!response.ok) throw new Error('Failed to fetch contributions');
    return response.json();
  };

  const getSupporters = async (period: 'month' | 'all' = 'all') => {
    const response = await fetch(`${BILLING_API}/supporters?period=${period}`);
    if (!response.ok) throw new Error('Failed to fetch supporters');
    return response.json();
  };

  const getProgress = async () => {
    const response = await fetch(`${BILLING_API}/progress`);
    if (!response.ok) throw new Error('Failed to fetch progress');
    return response.json();
  };

  return {
    createCheckout,
    getContribution,
    getUserBadge,
    getMyContributions,
    getSupporters,
    getProgress,
  };
}
```

---

## Badge Display (Phase 1)

### Profile Page Integration

In Phase 1, badges are fetched from the billing service when viewing a profile.

```vue
<!-- In user profile page -->
<script setup lang="ts">
const { getUserBadge } = useBilling();
const route = useRoute();

const badgeData = ref(null);

onMounted(async () => {
  // Only fetch if viewing profile, not in lists
  badgeData.value = await getUserBadge(
    route.params.tenantId,
    route.params.userId
  );
});
</script>

<template>
  <UserProfileHeader :user="user">
    <template #badge>
      <BadgeDisplay
        v-if="badgeData?.badge_level && user.showSupporterBadge"
        :level="badgeData.badge_level"
        size="md"
        show-label
      />
    </template>
  </UserProfileHeader>
</template>
```

### Badge Visibility Setting

Add to user settings in openmeet-api (this is user preference, not billing data):

```sql
-- In tenant DB, add to users table
ALTER TABLE users ADD COLUMN show_supporter_badge BOOLEAN NOT NULL DEFAULT FALSE;
```

This is acceptable in openmeet-api because it's a user preference, not billing logic.

---

## Security Considerations

### Authentication

**Billing service accepts:**
1. User JWTs (from openmeet-platform) - for user-specific operations
2. Requests with X-Tenant-Id header - validated against JWT claims

**Webhook endpoint:**
- No authentication required (public endpoint)
- Stripe signature verification required

### Stripe Webhook Verification

```typescript
// Always verify signature
const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  webhookSecret
);

// Reject if verification fails
if (!event) {
  throw new UnauthorizedException('Invalid signature');
}
```

### Input Validation

```typescript
// create-checkout.dto.ts
export class CreateCheckoutDto {
  @IsInt()
  @Min(500)        // $5 minimum
  @Max(1000000)    // $10,000 maximum
  amount_cents: number;

  @IsBoolean()
  is_anonymous: boolean;

  @IsBoolean()
  public_display_consent: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
```

### Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST /contributions/checkout | 5/minute per user |
| GET /supporters | 60/minute per IP |
| GET /progress | 60/minute per IP |
| POST /stripe/webhook | No limit (Stripe needs access) |

---

## Testing Strategy

### Unit Tests

```typescript
// badge-calculator.spec.ts
describe('BadgeCalculator', () => {
  it('returns null for under $25', () => {
    expect(calculateBadge(2400)).toBeNull();
  });

  it('returns bronze for $25-99', () => {
    expect(calculateBadge(2500)).toBe('bronze');
    expect(calculateBadge(9999)).toBe('bronze');
  });

  it('returns silver for $100-499', () => {
    expect(calculateBadge(10000)).toBe('silver');
    expect(calculateBadge(49999)).toBe('silver');
  });

  it('returns gold for $500-1999', () => {
    expect(calculateBadge(50000)).toBe('gold');
  });

  it('returns platinum for $2000+', () => {
    expect(calculateBadge(200000)).toBe('platinum');
  });
});
```

### Integration Tests

```typescript
// contributions.e2e-spec.ts
describe('Contributions', () => {
  it('creates checkout session for authenticated user', async () => {
    const response = await request(app.getHttpServer())
      .post('/contributions/checkout')
      .set('Authorization', `Bearer ${userToken}`)
      .set('X-Tenant-Id', 'test-tenant')
      .send({
        amount_cents: 2500,
        is_anonymous: false,
        public_display_consent: true,
      });

    expect(response.status).toBe(200);
    expect(response.body.checkout_url).toContain('checkout.stripe.com');
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app.getHttpServer())
      .post('/contributions/checkout')
      .send({ amount_cents: 2500 });

    expect(response.status).toBe(401);
  });
});
```

### Stripe Testing

Use Stripe test mode with test cards:
- `4242 4242 4242 4242` - Successful payment
- `4000 0000 0000 0002` - Card declined
- `4000 0000 0000 3220` - 3D Secure required

Use Stripe CLI to forward webhooks locally:
```bash
stripe listen --forward-to localhost:3001/api/v1/stripe/webhook
```

---

## Deployment

### Kubernetes Resources

```yaml
# k8s/environments/prod/billing/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openmeet-billing
  namespace: openmeet
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openmeet-billing
  template:
    metadata:
      labels:
        app: openmeet-billing
    spec:
      containers:
        - name: billing
          image: openmeet/billing:latest
          ports:
            - containerPort: 3001
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: billing-secrets
                  key: database-url
            - name: STRIPE_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: billing-secrets
                  key: stripe-secret-key
            - name: STRIPE_WEBHOOK_SECRET
              valueFrom:
                secretKeyRef:
                  name: billing-secrets
                  key: stripe-webhook-secret
          livenessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 3001
            initialDelaySeconds: 5
            periodSeconds: 5
```

### Ingress for Webhook

```yaml
# k8s/environments/prod/billing/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: billing-ingress
  namespace: openmeet
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
    - hosts:
        - billing.openmeet.net
      secretName: billing-tls
  rules:
    - host: billing.openmeet.net
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: openmeet-billing
                port:
                  number: 3001
```

### Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| DATABASE_URL | Secret | Billing database connection |
| STRIPE_SECRET_KEY | Secret | Stripe API key |
| STRIPE_WEBHOOK_SECRET | Secret | Webhook signing secret |
| STRIPE_SUCCESS_URL | ConfigMap | Redirect after payment |
| STRIPE_CANCEL_URL | ConfigMap | Redirect on cancel |
| NODE_ENV | ConfigMap | production |

### Stripe Webhook Configuration

Configure in Stripe Dashboard:
- URL: `https://billing.openmeet.net/api/v1/stripe/webhook`
- Events: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`

---

## Phase 2+ Roadmap

### Phase 2: Recurring Contributions

**New database columns:**
```sql
ALTER TABLE contributions ADD COLUMN is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE contributions ADD COLUMN stripe_subscription_id VARCHAR(255);
ALTER TABLE contributions ADD COLUMN recurring_status VARCHAR(20);
-- active, cancelled, past_due
```

**New webhook events:**
- `invoice.paid` - Record monthly payment
- `customer.subscription.deleted` - Mark cancelled
- `invoice.payment_failed` - Handle failed payment

**New API endpoints:**
- `GET /contributions/me/subscription` - Get active subscription
- `POST /contributions/subscription/cancel` - Cancel subscription
- `GET /stripe/portal` - Get Stripe Customer Portal URL

### Phase 3: Site-Wide Badge Display

**Requires tenant DB changes:**
```sql
-- In tenant DB
CREATE TABLE supporter_badges (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  badge_level VARCHAR(20),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Requires RabbitMQ integration:**
- Billing service publishes `badge.updated` events
- openmeet-api consumes and updates `supporter_badges` table
- Avatar components query local table (fast)

**Why deferred:** This adds significant complexity (RabbitMQ, event schema, error handling, reconciliation). Only worth it when badge visibility throughout the site is validated as valuable.

### Future: Group Fundraising

**Requires Stripe Connect:**
- Groups onboard as Connected Accounts
- Money flows: User → Group (minus platform fee)
- Different regulatory requirements

**Reusable from Phase 1:**
- FundraiserForm component
- ProgressMeter component
- SupporterWall component
- BadgeDisplay component

**New for group fundraising:**
- Group onboarding flow
- Payout management
- Platform fee configuration
- Per-group progress tracking

---

## Implementation Checklist

### Phase 0

- [ ] Create Stripe product "Support OpenMeet"
- [ ] Create Payment Link with preset amounts
- [ ] Add "Support Us" link to platform footer
- [ ] Create static thank-you page
- [ ] Monitor for 2-4 weeks

### Phase 1: Billing Service

- [ ] Scaffold openmeet-billing NestJS service
- [ ] Set up billing database and migrations
- [ ] Implement health check endpoint
- [ ] Implement Stripe service (checkout creation)
- [ ] Implement webhook controller with signature verification
- [ ] Implement contributions endpoints
- [ ] Implement supporters endpoints
- [ ] Implement progress endpoint
- [ ] Add input validation
- [ ] Add rate limiting
- [ ] Write tests
- [ ] Create Dockerfile
- [ ] Create Kubernetes manifests
- [ ] Configure Stripe webhook URL
- [ ] Deploy to production

### Phase 1: Frontend

- [ ] Create FundraiserForm component
- [ ] Create ProgressMeter component
- [ ] Create BadgeDisplay component
- [ ] Create SupporterWall component
- [ ] Create useBilling composable
- [ ] Create SupportPage
- [ ] Create SupportThankYouPage
- [ ] Create SupportersPage
- [ ] Add contribution history to user settings
- [ ] Add badge visibility toggle to user settings
- [ ] Add footer links
- [ ] Integrate badge display on profile pages

### Phase 1: Legal/Ops

- [ ] Update Terms of Service
- [ ] Update Privacy Policy
- [ ] Document refund policy
- [ ] Set up support process for billing questions

---

## Document History

| Date | Author | Changes |
|------|--------|---------|
| 2025-01-25 | | Initial implementation guide |
| 2025-01-25 | | Revised for phased rollout, simplified Phase 1 |
| 2025-01-25 | | Focused on Phase 0/1, deferred badge sync, added reusability |
