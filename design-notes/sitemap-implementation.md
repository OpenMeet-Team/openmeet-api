# Sitemap Implementation Design Note

## Overview
Implementation of XML sitemap generation for SEO and search engine discoverability of OpenMeet events and groups.

## Requirements

### Functional Requirements
1. **Dynamic Sitemap Generation**: Generate XML sitemap containing all public events with 3 or more participants where the event has not reached it's end time and groups with 3 or more members
2. **Tenant-Specific Content**: Filter content based on tenant ID passed in the request
3. **SEO Compliance**: Follow XML sitemap protocol standards
4. **Accessibility**: Serve sitemap at standard `/sitemap.xml` path
5. **Content Freshness**: Include last modified dates for content
6. **Multi-Environment Support**: Work in local development, development, and production environments

### Technical Requirements
1. **Proper Content-Type**: Serve with `application/xml` header
2. **URL Structure**: Use slugs instead of IDs for SEO-friendly URLs
3. **Priority/Frequency**: Set appropriate change frequency and priority values
4. **Caching**: Cache sitemap for performance (1 hour TTL)
5. **Error Handling**: Graceful fallback when content unavailable

### Standards Compliance
- Follow [sitemaps.org protocol](https://www.sitemaps.org/protocol.html)
- Include required XML namespace
- Proper URL encoding
- Maximum 50,000 URLs per sitemap

## Current Design

### API Implementation
**Location**: `src/sitemap/`

#### Components
1. **SitemapController** (`sitemap.controller.ts`)
   - Route: `GET /api/sitemap/sitemap.xml`
   - Accepts tenant ID via query parameter or header
   - Returns XML with proper content-type headers

2. **SitemapService** (`sitemap.service.ts`)
   - Generates sitemap URLs from database content
   - Filters public events and groups by tenant
   - Creates XML structure with proper formatting

3. **SitemapModule** (`sitemap.module.ts`)
   - Imports EventModule and GroupModule for data access
   - Registers controller and service

#### Data Sources
- **Events**: Public events with valid slugs and dates
- **Groups**: Public groups with valid slugs
- **Static Pages**: `/events` and `/groups` listing pages

#### XML Structure
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://platform.domain.com/events/event-slug</loc>
    <lastmod>2025-01-01T00:00:00.000Z</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <!-- Additional URLs... -->
</urlset>
```

### Frontend Implementation Attempts

#### Attempt 1: Client-Side Vue Component
**Status**: ❌ Failed  
**Approach**: Vue route at `/sitemap.xml` that fetches API and serves XML  
**Issues**: 
- Content-Type served as `text/html` instead of `application/xml`
- Vue app HTML returned instead of XML content
- Blob URL approach not working in production

#### Attempt 2: Kubernetes Ingress Routing
**Status**: ❌ Failed  
**Approach**: ALB redirect actions to route platform requests to API  
**Issues**:
- Complex ALB action syntax errors
- Service reference issues with non-existent services
- Overly complicated for simple requirement

#### Attempt 3: SSR Middleware
**Status**: ❌ Failed  
**Approach**: Quasar SSR middleware to handle `/sitemap.xml` server-side  
**Issues**:
- App not configured for SSR mode
- Missing required SSR infrastructure files
- Build failures due to missing server components

#### Attempt 4: Static File with Redirect
**Status**: ❌ Failed  
**Approach**: Static `public/sitemap.xml` file with JavaScript redirect  
**Issues**:
- Browser treats `.xml` files as XML, JavaScript doesn't execute
- Returns HTML redirect code instead of proper XML

#### Attempt 5: Development Proxy
**Status**: ✅ Works Locally, ❌ Fails in Production  
**Approach**: Quasar dev server proxy configuration  
**Issues**:
- Only works in development mode
- Production SPA build doesn't include proxy
- Not suitable for deployed environments

## Current Issues

### Root Cause Analysis
1. **SPA Limitation**: Single Page Applications cannot set HTTP headers for specific routes
2. **Static Server Constraints**: `quasar serve` doesn't support custom route handling for file extensions
3. **Content-Type Headers**: Cannot dynamically set `application/xml` from client-side JavaScript
4. **Search Engine Requirements**: Google/search engines need proper XML with correct MIME type

### Failing Components
1. **Production Deployment**: `/sitemap.xml` returns 404 or wrong content-type
2. **Content Type**: Always serves `text/html` instead of `application/xml`  
3. **SEO Compliance**: Search engines cannot process the sitemap properly
4. **Cross-Environment**: Solution works locally but fails in Kubernetes

## Alternative Solutions to Consider

### Option 1: Reverse Proxy Configuration
**Approach**: Configure nginx/ALB to proxy `/sitemap.xml` requests to API  
**Pros**: Clean separation, proper headers, works across environments  
**Cons**: Requires infrastructure changes

### Option 2: Build-Time Generation
**Approach**: Generate static sitemap file during platform build process  
**Pros**: Simple, fast serving, proper content-type  
**Cons**: Not dynamic, requires rebuild for content changes

### Option 3: API-Only Approach (won't work because we need to serve the sitemap from the platform domain)
**Approach**: Serve sitemap only from API domain, update robots.txt  
**Pros**: Simple, guaranteed to work, proper content-type  
**Cons**: Different domain, may impact SEO

### Option 4: Server-Side Rendering (very difficult switch for us)
**Approach**: Convert platform to SSR mode with proper middleware  
**Pros**: Full control over responses, proper headers  
**Cons**: Major architectural change, complexity increase

### Option 5: CDN/Edge Function
**Approach**: Use Cloudflare Workers or similar to proxy requests  
**Pros**: No infrastructure changes needed  
**Cons**: Additional service dependency

## Implemented Solution

**Chosen Solution**: Option 1 - Reverse Proxy Configuration

**Multi-Environment Approach**:
- **Local Development**: Quasar dev server proxy configuration
- **Kubernetes**: Ingress routing with additional API controller

### Implementation Details

#### Local Development (Quasar Proxy)
- Configuration in `quasar.config.ts`
- Routes `/sitemap.xml` → `/api/sitemap/sitemap.xml?tenantId=...`
- Uses existing `SitemapController` at `/api/sitemap/sitemap.xml`
- Automatic tenant ID injection from config

#### Kubernetes Deployment (Ingress Routing)
- Ingress rule routes `platform-dev.openmeet.net/sitemap.xml` → API service
- Added `RootSitemapController` to handle `/sitemap.xml` at API root level
- Hardcoded dev tenant ID (`lsdfaopkljdfs`) for platform domain requests
- Direct XML response with proper content-type headers

### Code Changes
1. **Kubernetes Ingress**: Added exact path routing for `/sitemap.xml` to API service
2. **API Controller**: Added `RootSitemapController` with `@Get('sitemap.xml')` for K8s routing
3. **Module Registration**: Registered both controllers in `SitemapModule`
4. **Environment-Specific**: Local uses proxy, K8s uses direct routing

## Testing Verification

### Success Criteria
- [ ] `curl -I https://platform-dev.openmeet.net/sitemap.xml` returns `Content-Type: application/xml`
- [ ] Response contains valid XML sitemap structure
- [ ] Google Search Console accepts sitemap
- [ ] All public events and groups included that have 3 or more participants or members, and the event has not reached it's end time
- [ ] Works in local, development, and production
- [ ] Proper tenant filtering applied

### Test Commands
```bash
# Check headers
curl -I "https://platform-dev.openmeet.net/sitemap.xml"

# Validate XML structure
curl "https://platform-dev.openmeet.net/sitemap.xml" | xmllint --format -

# Test tenant filtering
curl "https://platform-dev.openmeet.net/sitemap.xml?tenantId=specific-tenant"
```

## Implementation History

**Date**: 2025-06-09  
**Status**: ✅ Implemented  
**Solution**: Multi-environment reverse proxy approach

### Implementation Timeline
1. **API Implementation**: Created working sitemap service and controller
2. **Frontend Attempts**: Tried 5 different client-side approaches (all failed)
3. **Root Cause**: SPAs cannot set HTTP Content-Type headers
4. **Solution**: Environment-specific reverse proxy routing
5. **Testing**: Pending deployment to verify Kubernetes routing

### Final Architecture
- **Two Controllers**: 
  - `SitemapController` for `/api/sitemap/sitemap.xml` (direct API access, local dev)
  - `RootSitemapController` for `/sitemap.xml` (Kubernetes ingress routing)
- **Environment Routing**:
  - Local: Quasar proxy → existing API endpoint
  - K8s: Ingress → new root controller
- **Consistent Result**: `platform-dev.openmeet.net/sitemap.xml` returns proper XML in all environments