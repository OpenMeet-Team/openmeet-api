# Link Preview Meta Tags System

**Status:** 📋 Design Phase
**Created:** 2025-11-06
**Priority:** High - Improves viral sharing & discoverability

---

## The Problem

When users share OpenMeet links on Slack, Discord, Twitter, or text messages, **no preview appears** because our Single Page Application (SPA) serves an empty HTML shell. Crawlers see:

```html
<div id="app"></div>  <!-- Empty! -->
```

Instead of:
```
┌─────────────────────────────────────┐
│ [Event Photo]                       │
│ Summer BBQ 2025                     │
│ Join us for grilling, games, and... │
│ platform.openmeet.net               │
└─────────────────────────────────────┘
```

**Impact:**
- ❌ Poor social sharing experience
- ❌ Reduced click-through rates
- ❌ Harder to grow user base virally
- ❌ SEO disadvantage

---

## Solution Overview: Smart Dual-Path Rendering

We'll detect if the visitor is a bot (Slack, Twitter, Discord, etc.) or a human, and serve appropriate content:

```
                    ┌─────────────────────────┐
                    │ Request: /events/foo    │
                    └───────────┬─────────────┘
                                │
                    ┌───────────▼─────────────┐
                    │    Nginx (User-Agent    │
                    │    Detection Layer)     │
                    └───────────┬─────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
           Is Bot?                         Is Human?
                │                               │
                ▼                               ▼
    ┌────────────────────────┐    ┌────────────────────────┐
    │   Proxy to API         │    │   Serve Static SPA     │
    │   api:3000/events/foo  │    │   /index.html          │
    └──────────┬─────────────┘    └────────────┬───────────┘
               │                               │
               ▼                               ▼
    API checks User-Agent        Browser loads SPA shell
    Returns HTML with            JS fetches data from
    Rich Meta Tags               /api/v1/events/foo
```

**Key Insights:**
- Bots don't run JavaScript → they get pre-rendered HTML with meta tags
- Humans get the full interactive SPA
- Same URL for both (`/events/foo`) → no confusion
- API handles the route for bots, static files for humans

---

## Architecture: Three Components

### 1. **Bot Detection** (Nginx)
- Inspect `User-Agent` header
- Route bots → proxy to API backend
- Route humans → serve SPA static files

### 2. **Meta Renderer** (API Backend)
- Unified routes: `/events/:slug` and `/groups/:slug`
- Detect User-Agent, return HTML for bots or redirect for humans
- Fetches data from database
- Generates HTML with Open Graph tags

### 3. **Platform Updates** (Frontend - Optional)
- Add `useMeta()` to event/group pages
- Ensures SPA and meta HTML stay consistent
- Helps with SEO

---

## Why Not SSR or SSG?

### Alternatives Considered

**SSR (Server-Side Rendering)**
- Renders every page on-demand using Node.js server
- ❌ **Rejected because:**
  - Requires extensive SSR guards for browser-only code (localStorage, BroadcastChannel, Matrix chat)
  - Adds Node.js server infrastructure complexity
  - Maintenance burden: every new feature needs SSR compatibility checks
  - Our app is highly interactive (chat, real-time updates) - doesn't benefit from SSR

**SSG (Static Site Generation)**
- Pre-renders all pages at build time as static HTML
- ❌ **Rejected because:**
  - New events/groups require full rebuild + redeploy (5-10 min delay)
  - User creates event → link shared immediately → **no preview until rebuild**
  - Not practical for user-generated content platforms
  - Build queue bottlenecks with frequent content creation

### Why Backend Meta Tags Wins

Our approach gives us:
- ✅ **Instant previews** - New content gets previews immediately
- ✅ **No rebuilds** - Unlimited events/groups without deployment
- ✅ **Uses existing infrastructure** - Just API + nginx, no new servers
- ✅ **Simple maintenance** - One API endpoint vs SSR guards everywhere
- ✅ **SPA stays SPA** - Keep all interactive features working as-is

**Trade-off:** We maintain two rendering paths (SPA + meta HTML) but this is far simpler than making the entire SPA SSR-compatible.

---

## URL Routing: How It Works

### User-Facing URLs (What Everyone Sees)
```
https://platform.openmeet.net/events/summer-bbq
https://platform.openmeet.net/groups/portland-hikers
```

**Important:** The URL never changes! Bots and humans see the same URL.

### Internal Routing (Behind the Scenes)
```
Request: GET /events/summer-bbq
   ↓
Nginx: Is this a bot or human?
   ↓
┌────────────────┴────────────────┐
│                                 │
Bot                           Human
│                                 │
Nginx proxies to:            Nginx serves:
api:3000/events/summer-bbq   index.html (SPA shell)
│                                 │
API checks User-Agent        Browser runs JS
Returns HTML with meta       Fetches /api/v1/events/summer-bbq
tags to bot                  for JSON data
```

### Why No URL Conflicts?

**The two types of paths serve different purposes:**
- `/events/:slug` - User-facing URL (nginx routes to API for bots, static files for humans)
- `/api/v1/events/:slug` - Regular JSON API endpoint (SPA uses this for data)

**Nginx proxies the request to the backend** while keeping the same URL path. The API then decides what to return based on the User-Agent. Think of it like a phone switchboard - you dial one number, but it routes to different destinations behind the scenes.

### Why Unified Routes?

We use the same path (`/events/:slug`) for both bots and humans because:

1. **Simpler nginx** - No URL rewriting needed, just proxy vs serve static
2. **Cleaner logs** - Same path in logs for bot and human requests
3. **Single source of truth** - API handles the route, detects user agent internally
4. **Production pattern** - What apps like Notion, Linear, and Figma do

---

## Implementation Phases

### 🟢 Phase 1: Basic Meta Tags (MVP)
**Goal:** Get link previews working on Slack/Discord
**Time:** 4-6 hours
**Deliverables:**
- [ ] API meta controller with event/group endpoints
- [ ] Basic Open Graph tags (title, description, image)
- [ ] **Security:** HTML escaping for user content (prevent XSS)
- [ ] Proper headers (`Vary: User-Agent`, cache control)
- [ ] JS-based redirect for humans (crawler-friendly)
- [ ] Nginx bot detection and routing
- [ ] Test with Slack link unfurler

**Success Criteria:**
- Event link shared in Slack shows preview with image
- Group link shared in Discord shows preview
- No HTML injection vulnerabilities

---

### ✅ Phase 2: Platform Coverage (Polish) - **COMPLETE**
**Goal:** Work across all major platforms
**Time:** 2-3 hours
**Status:** Completed 2025-11-08

**Deliverables:**
- [x] Add Twitter Card tags ✅ (Completed in Phase 1)
- [x] Test on Slack/Discord ✅ (Real-world testing complete 2025-11-07)
- [x] **Add Bluesky bot detection** ✅ (Added `bluesky` and `cardyb` patterns)
- [x] Expand bot detection regex (100+ bots) ✅ (Expanded from ~25 to 100+ patterns across 7 categories)
- [x] Fix group HTML description double-escaping (Issue #1) ✅ (Added `stripHtml()` method with tests)
- [x] Fix group image URL construction (Issue #2) ✅ (Fixed CloudFront URL construction + image relation loading)
- [x] Add LinkedIn-specific tags ✅ (`og:site_name`, `og:locale`, `article:author`, `article:published_time`)
- [x] Add comprehensive test suite ✅ (20 tests, all passing)
- [ ] Test on: Twitter, Facebook, WhatsApp, iMessage, Bluesky (awaiting production deployment)

**Success Criteria:**
- [x] Previews work on Slack/Discord ✅
- [x] Bluesky bot detection added ✅ (pending production testing)
- [x] Comprehensive bot coverage (100+ patterns) ✅
- [x] Images render correctly everywhere (including groups) ✅
- [x] Group descriptions show clean text (no HTML escape codes) ✅
- [x] LinkedIn tags present for better professional platform sharing ✅
- [x] Tests prevent regressions ✅
- [ ] Previews verified on 6+ platforms (awaiting production deployment and testing)

---

### 🟡 Phase 3: SEO & Schema (Search Visibility)
**Goal:** Improve Google search rankings
**Time:** 2-3 hours
**Deliverables:**
- [ ] Add Schema.org JSON-LD for events
- [ ] Add Schema.org for groups (Organization type)
- [ ] Implement proper cache headers
- [ ] Submit to Google Search Console

**Success Criteria:**
- Google shows rich event cards in search results
- No cloaking penalties

---

### 🟢 Phase 4: Quality & Consistency (Maintenance)
**Goal:** Keep bot HTML and SPA content in sync
**Time:** 3-4 hours
**Deliverables:**
- [ ] Shared `generateMetaData(event)` serializer for API + frontend
- [ ] Add `useMeta()` to EventPage.vue and GroupPage.vue
- [ ] Write tests comparing meta HTML vs SPA data
- [ ] Create debugging dashboard at `/admin/meta-debug`
- [ ] Document the two-path architecture

**Success Criteria:**
- Tests catch when bot HTML diverges from SPA
- Easy to debug meta tag issues
- Single source of truth for meta content

---

### 🔵 Phase 5: Advanced Features (Nice-to-Have)
**Goal:** Handle edge cases and special content types
**Time:** 4-6 hours
**Deliverables:**
- [ ] Generate default OG images for events without photos
- [ ] Add video player tags for virtual events
- [ ] Support member profile meta tags
- [ ] CDN cache invalidation webhooks (on event/group update)
- [ ] Optional: Prerender.io integration if coverage needs expand

**Success Criteria:**
- Every shareable URL has a preview (even without images)
- Video events show play button in previews
- Updated events reflect in previews quickly (via purge)

---

## Technical Details

### Reference Implementation

This section shows a complete, production-ready implementation with proper headers, caching, and security.

#### Nginx Configuration

```nginx
# --- Detect Bots --------------------------------------------------
map $http_user_agent $is_bot {
    default 0;
    ~*(bot|crawler|spider|slurp|facebook|twitter|slack|discord|whatsapp|telegram) 1;
}

# --- Event & Group Routes ----------------------------------------
location ~ ^/(events|groups)/[^/]+$ {
    # If a known bot: serve prerendered HTML
    if ($is_bot) {
        proxy_pass http://api:3000$request_uri;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Vary "User-Agent";
        break;
    }

    # Otherwise, serve the SPA
    try_files $uri /index.html;
}

# --- Cache Static Assets -----------------------------------------
location /assets/ {
    root /usr/share/nginx/html;
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# --- Default Fallback --------------------------------------------
location / {
    try_files $uri /index.html;
}
```

#### NestJS Backend (Adapted from Express)

```typescript
// src/controllers/meta.controller.ts
import { Controller, Get, Param, Res, Headers, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { EventsService } from '../services/events.service';
import { GroupsService } from '../services/groups.service';
import escapeHtml from 'escape-html';

@Controller()
export class MetaController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly groupsService: GroupsService,
  ) {}

  private readonly BOT_REGEX = /(bot|crawler|spider|slurp|facebook|twitter|discord|slack|whatsapp|telegram)/i;

  private isBot(userAgent: string = ''): boolean {
    return this.BOT_REGEX.test(userAgent);
  }

  private renderMetaHTML(type: 'event' | 'group', data: any): string {
    const title = escapeHtml(data.title || data.name);
    const description = escapeHtml((data.description || '').slice(0, 200));
    const image = data.imageUrl || 'https://cdn.openmeet.net/default-og.jpg';
    const url = `https://platform.openmeet.net/${type}s/${data.slug}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} - OpenMeet</title>

<!-- Open Graph -->
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:url" content="${url}" />
<meta property="og:type" content="website" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />

<link rel="canonical" href="${url}" />

<!-- Smart Redirect -->
<script>
if (!/bot|crawl|spider/i.test(navigator.userAgent)) {
  location.replace("${url}");
}
</script>
<noscript><meta http-equiv="refresh" content="0;url=${url}"></noscript>
</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <a href="${url}">View full ${type} →</a>
</body>
</html>`;
  }

  @Get('events/:slug')
  async getEventMeta(
    @Param('slug') slug: string,
    @Headers('user-agent') userAgent: string,
    @Res() res: Response,
  ) {
    const event = await this.eventsService.findBySlug(slug);

    if (!event) {
      return res.status(HttpStatus.NOT_FOUND).send('Event not found');
    }

    if (this.isBot(userAgent)) {
      const html = this.renderMetaHTML('event', event);

      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Vary': 'User-Agent',
        'X-Robots-Tag': 'index, follow',
      });

      return res.send(html);
    }

    // Humans: redirect to SPA (history mode, not hash)
    return res.redirect(`/events/${slug}`);
  }

  @Get('groups/:slug')
  async getGroupMeta(
    @Param('slug') slug: string,
    @Headers('user-agent') userAgent: string,
    @Res() res: Response,
  ) {
    const group = await this.groupsService.findBySlug(slug);

    if (!group) {
      return res.status(HttpStatus.NOT_FOUND).send('Group not found');
    }

    if (this.isBot(userAgent)) {
      const html = this.renderMetaHTML('group', group);

      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'Vary': 'User-Agent',
        'X-Robots-Tag': 'index, follow',
      });

      return res.send(html);
    }

    // Humans: redirect to SPA (history mode, not hash)
    return res.redirect(`/groups/${slug}`);
  }
}
```

**Key Implementation Details:**
- ✅ `escapeHtml()` prevents XSS injection
- ✅ `Vary: User-Agent` prevents cache mixups
- ✅ `s-maxage=3600, stale-while-revalidate=86400` balances freshness & performance
- ✅ JS redirect for humans, meta HTML for bots
- ✅ Unified routes (not separate `/api/v1/meta/*` paths)

**CDN Cache Invalidation:**
When events/groups update, purge the cache:
```typescript
// In EventsService.update()
await this.cdnService.purge(`/events/${event.slug}`);
```

---

### Bot Detection Strategy

**Nginx Configuration:**
```nginx
# Detect common bots
map $http_user_agent $is_bot {
    default 0;
    ~*(bot|crawler|spider|slurp|facebook|twitter|slack|discord|whatsapp|telegram) 1;
}

# Route accordingly
location ~ ^/(events|groups)/[^/]+$ {
    if ($is_bot) {
        proxy_pass http://api:3000/api/v1/meta$request_uri;
    }
    try_files $uri /index.html;
}
```

**Comprehensive Bot List:** See Appendix A for full regex pattern.

---

### Meta Tag Structure

**Required Tags (All Platforms):**
- `og:title` - Event/group name
- `og:description` - First 200 chars of description
- `og:image` - Feature image (1200x630px recommended)
- `og:url` - Canonical URL
- `og:type` - "website" or "article"

**Twitter-Specific:**
- `twitter:card` - "summary_large_image"
- `twitter:title` - Same as og:title
- `twitter:description` - Same as og:description
- `twitter:image` - Same as og:image

**SEO (Google):**
- Schema.org JSON-LD event markup
- Canonical link tag
- Standard meta description

---

### API Response Format

**Endpoint:** `GET /api/v1/meta/events/:slug`

**Response:** HTML document with:
1. Complete meta tags in `<head>`
2. Minimal body content (for accessibility)
3. Meta refresh redirect to SPA (for humans who land here)

**Response Headers:**
```
Content-Type: text/html
Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400
Vary: User-Agent
X-Robots-Tag: index, follow
```

**Note on `Vary: User-Agent`:** Critical for preventing CDN/proxy caches from serving bot HTML to humans.

---

### Image Requirements

**Platform Requirements:**
| Platform | Min Size | Recommended | Format | Max Size |
|----------|----------|-------------|--------|----------|
| Facebook | 200x200 | 1200x630 | jpg, png | 8MB |
| Twitter | 300x157 | 1200x628 | jpg, png, webp | 5MB |
| Slack | 400x300 | 1200x630 | jpg, png | 5MB |
| Discord | 400x400 | 1200x630 | jpg, png | 8MB |

**Our Strategy:**
- Require 1200x630px minimum on upload
- Store on CDN with public access
- Generate fallback images with event title overlay if no image uploaded

---

## Testing Strategy

### Manual Testing

**Phase 1 Checklist:**
```
□ Share event link in Slack workspace
□ Share event link in Discord server
□ Paste link into iMessage
□ Check preview renders correctly
```

**Platform Debug Tools:**
- Facebook: https://developers.facebook.com/tools/debug/
- Twitter: https://cards-dev.twitter.com/validator
- LinkedIn: https://www.linkedin.com/post-inspector/

### Automated Testing

**Unit Tests:**
```
✓ MetaController returns valid HTML
✓ All required OG tags present
✓ Images are absolute URLs
✓ Descriptions truncated to 200 chars
✓ HTML escaping works correctly
```

**Integration Tests:**
```
✓ Bot user agent → receives meta HTML
✓ Human user agent → receives SPA shell
✓ Unknown event slug → 404 with fallback meta
✓ Cache headers set correctly
```

### Monitoring

**Key Metrics:**
```
- /api/v1/meta/* request count
- Response time (should be <100ms)
- Cache hit rate (should be >80%)
- 404 rate on meta endpoints
```

**Alerts:**
```
- Meta endpoint 5xx errors
- Response time >500ms
- Cache hit rate <50%
```

---

## Rollout Plan

### Development Environment
1. Implement Phase 1 on dev API
2. Update dev nginx config
3. Test with personal Slack workspace

### Staging Environment
1. Deploy to staging
2. Full platform testing (all 6+ platforms)
3. Performance testing with load

### Production Rollout
1. Deploy API changes (backward compatible)
2. Update nginx config (low risk)
3. Monitor for 24 hours
4. Verify with production event links

**Rollback Plan:** Remove nginx routing, reverts to SPA-only (no meta tags but no breakage)

---

## Known Limitations & Tradeoffs

### ⚠️ Cache Invalidation
**Issue:** Platforms cache previews (Slack: 24hrs, Twitter: 7 days)
**Impact:** Updated event titles won't reflect in old shares
**Mitigation:** Set reasonable cache headers, document cache-busting tools

### ⚠️ Bot Detection Gaps
**Issue:** New bots or user-agent spoofing may bypass detection
**Impact:** Some platforms might not get previews
**Mitigation:**
- Quarterly updates from [UA Parser database](https://github.com/ua-parser/uap-core)
- Unit tests for known bots (Slack, Discord, Twitter, etc.)
- Monitor failed preview reports

### ⚠️ Maintenance Burden
**Issue:** Two rendering paths (SPA + meta HTML) to keep in sync
**Impact:** Changes to events require updating both paths
**Mitigation:**
- Shared serializer function (`generateMetaData(event)`)
- Tests comparing meta HTML vs SPA data
- Clear documentation

### ⚠️ SEO Cloaking Risk
**Issue:** Google might view different content for bots as cloaking
**Impact:** Potential SEO penalty (unlikely but possible)
**Mitigation:** Keep bot content identical to SPA content, monitor Search Console

---

## Success Metrics

**Short Term (1 week):**
- [ ] 90%+ of event shares show previews
- [ ] <100ms average response time for meta endpoints
- [ ] Zero 5xx errors

**Medium Term (1 month):**
- [ ] 20% increase in click-through from shared links
- [ ] 5+ platforms supported
- [ ] Positive SEO impact (no penalties)

**Long Term (3 months):**
- [ ] 30% increase in viral sharing
- [ ] Google showing rich event cards
- [ ] Zero reports of broken previews

---

## Future Considerations

### Dynamic OG Image Generation
Generate custom preview images with event details overlaid:
```
[Event Photo Background]
┌──────────────────────────────┐
│  Summer BBQ 2025             │
│  June 14 • Riverside Park    │
│  50 RSVPs                    │
└──────────────────────────────┘
```

**Tools:** Node canvas, Cloudinary, imgix

### Video Preview Support
For virtual/streaming events, add video player tags:
```html
<meta property="og:video" content="..." />
<meta name="twitter:player" content="..." />
```

### Member Profile Meta Tags
Extend to user profiles:
```
GET /api/v1/meta/members/:slug
→ Returns meta for user profiles
```

### Pre-rendering Popular Content
Hybrid approach: Pre-render top 50 events as static HTML (SSG) + meta tags for everything else

---

## Appendices

### Appendix A: Comprehensive Bot User-Agent Regex

```regex
(
  bot|crawler|spider|slurp|
  facebook|facebookexternalhit|
  twitter|twitterbot|
  slack|slackbot|
  discord|discordbot|
  whatsapp|whatsappbot|
  telegram|telegrambot|
  linkedin|linkedinbot|
  pinterest|pinterestbot|
  google|googlebot|
  bing|bingbot|
  yahoo|slurp|
  duckduck|duckduckbot|
  baidu|baiduspider|
  yandex|yandexbot|
  reddit|redditbot|
  tumblr|tumblrbot|
  skype|skypeuripreview|
  apple|applebot|
  vkshare|vkshare|
  archive|archiveorg
)
```

### Appendix B: Example Meta HTML Output

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Summer BBQ 2025 - OpenMeet</title>

  <!-- Open Graph -->
  <meta property="og:title" content="Summer BBQ 2025" />
  <meta property="og:description" content="Join us for an afternoon of grilling, lawn games, and community connection!" />
  <meta property="og:image" content="https://cdn.openmeet.net/events/summer-bbq-2025.jpg" />
  <meta property="og:url" content="https://platform.openmeet.net/events/summer-bbq-2025" />
  <meta property="og:type" content="website" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Summer BBQ 2025" />
  <meta name="twitter:description" content="Join us for an afternoon of grilling, lawn games, and community connection!" />
  <meta name="twitter:image" content="https://cdn.openmeet.net/events/summer-bbq-2025.jpg" />

  <!-- Canonical URL -->
  <link rel="canonical" href="https://platform.openmeet.net/events/summer-bbq-2025" />

  <!-- Redirect humans (JS-based to avoid crawler penalties) -->
  <script>
    if (!/bot|crawl|spider/i.test(navigator.userAgent)) {
      location.replace('https://platform.openmeet.net/events/summer-bbq-2025');
    }
  </script>
  <noscript>
    <meta http-equiv="refresh" content="0;url=https://platform.openmeet.net/events/summer-bbq-2025">
  </noscript>
</head>
<body>
  <h1>Summer BBQ 2025</h1>
  <p>📅 Saturday, June 14, 2025 at 2:00 PM</p>
  <p>📍 Riverside Park Pavilion</p>
  <p>Join us for an afternoon of grilling, lawn games, and community connection!</p>
  <a href="https://platform.openmeet.net/events/summer-bbq-2025">View Event & RSVP</a>
  <p><em>Redirecting to full event page...</em></p>
</body>
</html>
```

### Appendix C: Testing URLs

**Development:**
- Event: http://localhost:3000/api/v1/meta/events/test-event
- Group: http://localhost:3000/api/v1/meta/groups/test-group

**Staging:**
- Event: https://api-dev.openmeet.net/api/v1/meta/events/summer-bbq
- Group: https://api-dev.openmeet.net/api/v1/meta/groups/portland-hikers

**Production:**
- Event: https://api.openmeet.net/api/v1/meta/events/summer-bbq
- Group: https://api.openmeet.net/api/v1/meta/groups/portland-hikers

---

## Questions & Decisions

### Open Questions
- [ ] Should we support member profile meta tags in Phase 1?
- [ ] Do we need video preview support soon?
- [ ] What's our strategy for deleted/private events?

### Decisions Made
- ✅ Use backend meta tags (not SSR) for simplicity
- ✅ Start with events & groups only
- ✅ Use nginx for bot detection (not API middleware)
- ✅ Cache meta HTML for 1 hour

### Decisions Needed
- ⏳ Who owns monitoring/alerts for meta endpoints?
- ⏳ What's the process for updating bot detection regex?
- ⏳ Should we generate fallback images automatically?

---

## Implementation Status

**Current Phase:** Phase 2 (Platform Coverage & Polish) - 🚧 **IN PROGRESS**

**Phase 1 Status:** ✅ **COMPLETE & VERIFIED IN PRODUCTION**
**Deployed:** 2025-11-08
**Environments:** Dev (platform-dev.openmeet.net), Production (platform.openmeet.net)
**Real-World Testing:** 2025-11-07 (Slack/Discord ✅, Bluesky ❌)

### Completed
- ✅ **API Meta Controller** (`openmeet-api/src/meta/meta.controller.ts`)
  - Handles `/events/:slug` and `/groups/:slug` routes
  - Returns HTML with Open Graph tags for bots
  - Security: Only serves meta tags for PUBLIC events/groups
  - Visibility check: Returns 404 for Private/Authenticated content to prevent information leakage
  - HTML escaping implemented to prevent XSS attacks
  - Uses `FRONTEND_DOMAIN` environment variable (no hardcoded domains)
  - Cache headers: `s-maxage=3600, stale-while-revalidate=86400`
  - `Vary: User-Agent` header to prevent CDN cache mixups

- ✅ **API Meta Module** (`openmeet-api/src/meta/meta.module.ts`)
  - Registered in `app.module.ts`
  - Imports: ConfigModule, EventModule, GroupModule

- ✅ **Nginx Configuration** (`openmeet-platform/nginx.conf`)
  - Bot detection via User-Agent (40+ bot patterns)
  - Routes bots → `http://api` (Kubernetes service DNS)
  - Routes humans → static SPA files
  - Gzip compression enabled
  - Static asset caching (1 year for /assets/, /icons/, /fonts/)
  - Health check endpoint at `/health`

- ✅ **Platform Dockerfile Update** (`openmeet-platform/Dockerfile`)
  - Replaced quasar serve with nginx:1.25-alpine
  - Multi-stage build: build static files → nginx serves them
  - Exposes port 80 (nginx default)
  - Health check file created at /health

- ✅ **Kubernetes Configuration Updates**
  - **Service** (`k8s/components/platform/base/service.yaml`)
    - Updated targetPort: 9005 → 80
  - **Deployment** (`k8s/components/platform/base/deployment.yaml`)
    - Updated containerPort: 9005 → 80
    - Updated health check probes to use `/health` endpoint on port 80
    - Updated volumeMount path for config.json to nginx html directory
    - Resource limits unchanged (200m CPU, 400Mi memory)

- ✅ **CI/CD & Testing**
  - Added nginx to CI environment for full-stack testing
  - Comprehensive e2e tests comparing meta content vs actual API data
  - Tests verify bot routing through nginx to API meta endpoint
  - CI tests passing on all environments

- ✅ **Production Deployment & Testing**
  - Deployed to production (platform.openmeet.net)
  - Tested with Slackbot User-Agent (curl): ✅ Returns proper Open Graph tags
  - Tested with Discordbot User-Agent (curl): ✅ Returns proper meta tags
  - Tested with human browser User-Agent (curl): ✅ Returns SPA correctly
  - Event meta tags: ✅ Working perfectly
  - Group meta tags: ✅ Working (minor issues noted below)
  - Performance: Nginx routing working as designed

- ✅ **Real-World Production Testing** (2025-11-07)
  - ✅ **Slack/Discord:** Event links display rich previews with titles, descriptions, and branding
  - ✅ **Events tested in Slack/Discord:**
    - Eurosky Live: Berlin 2025
    - Windy Wednesday
    - Louisville Atheist / KY Secular Society Annual Picnic
  - ✅ All previews showing correct Open Graph content
  - ✅ Event titles rendering correctly
  - ✅ Descriptions displaying properly
  - ✅ "OpenMeet" branding appearing in previews

  - ❌ **Bluesky (bsky.app):** Link previews NOT working
  - ❌ **Event tested:** Ink and Switch London: Building New Tools for Science
  - ❌ **Problem:** Showing generic SPA meta tags instead of event-specific content
  - ❌ **Root Cause:** Bluesky's crawler not detected by nginx bot patterns
  - 📋 **Action Required:** Add Bluesky User-Agent patterns to nginx config (Phase 2)

### Phase 2 Completed Work (2025-11-08)

**✅ Issue 1 RESOLVED: Group HTML Description Double-Escaping**
- **Problem:** Group descriptions with HTML were being double-escaped
- **Example:** Showed `&lt;div&gt;&lt;b&gt;OpenMeet Guides&lt;/b&gt;` instead of clean text
- **Solution Implemented:**
  - Added `stripHtml()` private method to `meta.controller.ts`
  - Strips HTML tags and decodes HTML entities before escaping
  - Prevents double-escaping while maintaining XSS protection
- **Files Changed:**
  - `openmeet-api/src/meta/meta.controller.ts:58-71` - Added `stripHtml()` method
  - `openmeet-api/src/meta/meta.controller.ts:93-96` - Updated description processing
- **Tests Added:** 6 tests covering HTML stripping, entity decoding, and regression prevention

**✅ Issue 2 RESOLVED: Group Image URL Construction**
- **Problem:** Group image URLs were malformed (missing CDN domain)
- **Example:** `https://platform.openmeet.netlsdfaopkljdfs/90496952505b5348b2463.png`
- **Solution Implemented:**
  1. Fixed `findGroupBySlug()` to load image relation: `relations: ['image', 'createdBy', 'categories']`
  2. Updated image URL construction in `renderMetaHTML()` to properly handle CloudFront
  3. Added logic to detect file driver and construct URLs accordingly
- **Files Changed:**
  - `openmeet-api/src/group/group.service.ts:439` - Added image relation
  - `openmeet-api/src/meta/meta.controller.ts:101-123` - Fixed image URL construction
- **Tests Added:** 3 tests covering CloudFront URLs, local file URLs, and default images

**✅ Issue 3 RESOLVED: Bluesky Bot Detection**
- **Problem:** Bluesky's crawler not detected, showing generic SPA meta tags
- **Solution Implemented:**
  - Added `bluesky` and `cardyb` patterns to nginx bot detection
  - Expanded bot detection from ~25 to 100+ patterns
  - Organized into 7 categories for maintainability
- **Files Changed:**
  - `openmeet-platform/nginx.conf.template:6-213` - Massively expanded bot detection
- **Bot Categories Added:**
  1. Social Media Crawlers (20+ patterns including Bluesky, Mastodon, Instagram)
  2. Search Engine Bots (25+ patterns including Google variants, Bing, international engines)
  3. Link Preview & Embedding Services (7 patterns)
  4. Monitoring & Analytics Bots (6 patterns)
  5. AI Crawlers & Research Bots (11 patterns including GPT, Claude, Perplexity)
  6. SEO & Site Analysis Tools (10 patterns)
  7. Archive & Preservation Bots (6 patterns)
- **Awaiting:** Production deployment and testing on Bluesky platform

**✅ LinkedIn-Specific Tags Added**
- **Solution Implemented:**
  - Added `article:author` tag (uses event.user or group.createdBy)
  - Added `og:locale` tag (set to `en_US`)
  - Added `article:published_time` for events (uses startDate)
  - `og:site_name` was already present from Phase 1
- **Files Changed:**
  - `openmeet-api/src/meta/meta.controller.ts:131-145` - Author and published time metadata
  - `openmeet-api/src/meta/meta.controller.ts:189` - Locale tag
- **Tests Added:** 4 tests covering author tags, locale, site name, and published time

**✅ Comprehensive Test Suite Added**
- **File Created:** `openmeet-api/src/meta/meta.controller.spec.ts`
- **Test Coverage:** 20 tests, all passing ✅
  - HTML stripping (6 tests)
  - HTML escaping and XSS prevention (4 tests)
  - Image URL construction (3 tests)
  - Group description handling (2 tests)
  - LinkedIn tags (4 tests)
  - Security (1 test)
- **Behavior-Oriented:** Tests focus on preventing regressions and ensuring security

### Known Issues (None - All Phase 2 Issues Resolved)

### Architecture Decisions Made
1. **Routing Strategy:** Nginx sidecar in platform pod (Option 1)
   - Rationale: Best performance, lowest API load, same URL for bots/humans
   - Trade-off: More complex k8s config, but worth it for UX

2. **Security Model:** Public events only
   - Only `EventVisibility.Public` and `GroupVisibility.Public` get meta tags
   - Private/Authenticated events return 404 (prevent information leakage)

3. **Kubernetes DNS:** Use internal service name `api` (not env vars)
   - Simpler configuration
   - Works across all namespaces with `api.default.svc.cluster.local`

4. **No Default Domain:** Require `FRONTEND_DOMAIN` environment variable
   - Fail fast if not configured (better than wrong defaults)

---

## References

- [Open Graph Protocol](https://ogp.me/)
- [Twitter Cards Documentation](https://developer.twitter.com/en/docs/twitter-for-websites/cards/overview/abouts-cards)
- [Schema.org Event Type](https://schema.org/Event)
- [Google Search Central: Dynamic Rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)

---

**Last Updated:** 2025-11-06
**Next Review:** After Phase 1 completion
**Owner:** Engineering Team
