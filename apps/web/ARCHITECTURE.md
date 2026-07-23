# n8nHarness — Full Platform Architecture

**Platform Type:** SaaS for Telegram Paid Channel Management  
**Version:** 2.0 (Full Stack)  
**Last Updated:** 2026-07-23

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    n8nHarness Platform                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │   Web Frontend   │  │   Mobile App     │                │
│  │   (Next.js)      │  │   (React Native) │                │
│  └────────┬─────────┘  └────────┬─────────┘                │
│           │                    │                            │
│           └────────┬───────────┘                            │
│                    │                                        │
│           ┌────────▼────────┐                              │
│           │   API Gateway   │                              │
│           │   (Next.js API) │                              │
│           └────────┬────────┘                              │
│                    │                                        │
│    ┌───────────────┼───────────────┐                       │
│    │               │               │                       │
│┌───▼────┐   ┌─────▼──────┐  ┌────▼──────┐                │
││ Auth   │   │  Services  │  │ n8n       │                │
││Service │   │  Layer     │  │ Webhooks  │                │
│└────────┘   └────────────┘  └───────────┘                │
│                    │                                        │
│           ┌────────▼────────┐                              │
│           │  PostgreSQL DB  │                              │
│           └─────────────────┘                              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  External Integrations                               │  │
│  │  - Telegram Bot API                                  │  │
│  │  - Payment Systems (Stripe, ЮКасса)                 │  │
│  │  - n8n (AI Agents, Automation)                       │  │
│  │  - Analytics Services                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## User Roles & Permissions

### 1. Platform Admin (Service Owner)
**Access Level:** Full system access
- Manage all clients (businesses)
- View global analytics & revenue
- Manage payment systems & integrations
- Moderate content
- System configuration

### 2. Business Owner (Client)
**Access Level:** Own business + team members
- Manage own Telegram channels
- View subscriber lists
- Manage subscriptions
- View revenue & payouts
- Configure payment methods
- Invite team members
- Access AI bot features

### 3. Team Member (Client's Staff)
**Access Level:** Delegated permissions
- View channels (read-only or edit)
- Manage subscribers (if permitted)
- View analytics
- Send messages via bots

### 4. End User (Subscriber)
**Access Level:** Customer
- Browse available channels
- Subscribe/unsubscribe
- Manage subscription settings
- View subscription status

---

## Core Modules

### Module 1: Authentication & Authorization
```
┌─────────────────────────────────┐
│   Authentication Service         │
├─────────────────────────────────┤
│ • User Registration              │
│ • Email/Phone Verification       │
│ • JWT Token Management           │
│ • OAuth (Google, GitHub)         │
│ • Session Management             │
│ • Role-Based Access Control      │
└─────────────────────────────────┘
```

**Database Tables:**
- `users` (id, email, phone, password_hash, role, created_at)
- `sessions` (session_id, user_id, token, expires_at)
- `roles` (id, name, permissions)
- `user_roles` (user_id, role_id, business_id)

---

### Module 2: Business Management
```
┌─────────────────────────────────┐
│   Business Service               │
├─────────────────────────────────┤
│ • Create Business Profile        │
│ • Team Member Management         │
│ • Invite & Permissions           │
│ • Business Settings              │
│ • Billing Information            │
└─────────────────────────────────┘
```

**Database Tables:**
- `businesses` (id, name, owner_id, created_at)
- `team_members` (id, business_id, user_id, role, permissions)
- `invitations` (id, business_id, email, token, expires_at)

---

### Module 3: Telegram Channel Management
```
┌─────────────────────────────────┐
│   Channel Service                │
├─────────────────────────────────┤
│ • Connect Telegram Channel       │
│ • Channel Settings               │
│ • Channel Analytics              │
│ • Content Moderation             │
│ • Auto-Join Requests             │
└─────────────────────────────────┘
```

**Database Tables:**
- `channels` (id, business_id, telegram_id, name, description, member_count, is_active, settings)
- `channel_analytics` (channel_id, date, new_subscribers, churn, engagement_rate)
- `join_requests` (id, channel_id, user_id, telegram_user_id, status, created_at)

---

### Module 4: Subscription Management
```
┌─────────────────────────────────┐
│   Subscription Service           │
├─────────────────────────────────┤
│ • Subscription Plans             │
│ • User Subscriptions             │
│ • Subscription Tracking          │
│ • Auto-Renewal                   │
│ • Churn Management               │
└─────────────────────────────────┘
```

**Database Tables:**
- `subscription_plans` (id, business_id, name, price, billing_cycle, features)
- `user_subscriptions` (id, user_id, channel_id, plan_id, status, started_at, expires_at, auto_renew)
- `subscription_events` (id, subscription_id, event_type, timestamp)

---

### Module 5: Payment Processing
```
┌─────────────────────────────────┐
│   Payment Service                │
├─────────────────────────────────┤
│ • Payment Gateway Integration    │
│ • Invoice Generation             │
│ • Transaction Tracking           │
│ • Payout Management              │
│ • Refund Handling                │
│ • Tax Calculation                │
└─────────────────────────────────┘
```

**Database Tables:**
- `payment_methods` (id, business_id, provider, account_id, is_default)
- `transactions` (id, subscription_id, amount, currency, status, payment_method_id)
- `invoices` (id, business_id, amount, issued_date, due_date)
- `payouts` (id, business_id, amount, status, payout_date)

---

### Module 6: AI Bot Management (n8n Integration)
```
┌─────────────────────────────────┐
│   Bot Service                    │
├─────────────────────────────────┤
│ • Bot Configuration              │
│ • Workflow Management            │
│ • Message Templates              │
│ • Automation Rules               │
│ • Bot Analytics                  │
└─────────────────────────────────┘
```

**Database Tables:**
- `bots` (id, channel_id, telegram_token, name, is_active)
- `bot_workflows` (id, bot_id, n8n_workflow_id, trigger, config)
- `bot_messages` (id, bot_id, type, template, created_at)
- `automation_rules` (id, bot_id, trigger_type, action, condition)

---

### Module 7: Analytics & Reporting
```
┌─────────────────────────────────┐
│   Analytics Service              │
├─────────────────────────────────┤
│ • Real-time Dashboard            │
│ • Revenue Reports                │
│ • Subscriber Analytics           │
│ • Engagement Metrics             │
│ • Churn Analysis                 │
│ • Custom Reports                 │
└─────────────────────────────────┘
```

**Database Tables:**
- `analytics_events` (id, business_id, event_type, value, timestamp)
- `daily_metrics` (business_id, date, revenue, new_subs, churn_rate)
- `reports` (id, business_id, type, generated_at, data)

---

## Frontend Architecture

### Pages & Routes

```
/
├── /auth
│   ├── /login
│   ├── /register
│   ├── /forgot-password
│   └── /verify-email
│
├── /dashboard (authenticated)
│   ├── / (home/overview)
│   ├── /channels
│   │   ├── / (list)
│   │   ├── /[id]
│   │   ├── /[id]/settings
│   │   ├── /[id]/subscribers
│   │   └── /[id]/analytics
│   │
│   ├── /subscriptions
│   │   ├── / (manage plans)
│   │   ├── /[id] (edit plan)
│   │   └── /analytics
│   │
│   ├── /subscribers
│   │   ├── / (list)
│   │   ├── /[id] (profile)
│   │   └── /export
│   │
│   ├── /payments
│   │   ├── / (transaction history)
│   │   ├── /methods
│   │   ├── /payouts
│   │   └── /invoices
│   │
│   ├── /bots
│   │   ├── / (bot list)
│   │   ├── /[id] (bot settings)
│   │   ├── /[id]/workflows
│   │   └── /[id]/messages
│   │
│   ├── /team
│   │   ├── / (team members)
│   │   ├── /invite
│   │   └── /roles
│   │
│   ├── /analytics
│   │   ├── / (dashboard)
│   │   ├── /revenue
│   │   ├── /subscribers
│   │   └── /reports
│   │
│   ├── /settings
│   │   ├── /profile
│   │   ├── /business
│   │   ├── /integrations
│   │   └── /api-keys
│   │
│   └── /admin (admin only)
│       ├── / (admin dashboard)
│       ├── /businesses
│       ├── /users
│       ├── /payments
│       └── /system
```

---

## Backend API Structure

### Authentication Endpoints
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh-token
POST   /api/auth/verify-email
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

### Business Endpoints
```
POST   /api/businesses
GET    /api/businesses
GET    /api/businesses/:id
PATCH  /api/businesses/:id
DELETE /api/businesses/:id

POST   /api/businesses/:id/team
GET    /api/businesses/:id/team
DELETE /api/businesses/:id/team/:memberId
PATCH  /api/businesses/:id/team/:memberId
POST   /api/businesses/:id/invitations
```

### Channel Endpoints
```
POST   /api/channels
GET    /api/channels
GET    /api/channels/:id
PATCH  /api/channels/:id
DELETE /api/channels/:id

GET    /api/channels/:id/subscribers
POST   /api/channels/:id/subscribers/export
GET    /api/channels/:id/analytics
GET    /api/channels/:id/join-requests
```

### Subscription Endpoints
```
POST   /api/subscription-plans
GET    /api/subscription-plans
PATCH  /api/subscription-plans/:id
DELETE /api/subscription-plans/:id

POST   /api/subscriptions
GET    /api/subscriptions/:id
PATCH  /api/subscriptions/:id
DELETE /api/subscriptions/:id
POST   /api/subscriptions/:id/cancel
```

### Payment Endpoints
```
POST   /api/payments/methods
GET    /api/payments/methods
DELETE /api/payments/methods/:id

GET    /api/payments/transactions
GET    /api/payments/invoices
GET    /api/payments/payouts
POST   /api/payments/webhook (for payment provider callbacks)
```

### Bot Endpoints
```
POST   /api/bots
GET    /api/bots
GET    /api/bots/:id
PATCH  /api/bots/:id
DELETE /api/bots/:id

POST   /api/bots/:id/workflows
GET    /api/bots/:id/workflows
PATCH  /api/bots/:id/workflows/:workflowId
DELETE /api/bots/:id/workflows/:workflowId
```

### Analytics Endpoints
```
GET    /api/analytics/overview
GET    /api/analytics/revenue
GET    /api/analytics/subscribers
GET    /api/analytics/channels
GET    /api/analytics/reports/:type
```

---

## Database Schema (Core Tables)

```sql
-- Users & Auth
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  avatar_url TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  role VARCHAR(20), -- admin, client, team_member, subscriber
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  token TEXT UNIQUE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP
);

-- Businesses
CREATE TABLE businesses (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  logo_url TEXT,
  website VARCHAR(255),
  currency VARCHAR(3) DEFAULT 'RUB',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  user_id UUID REFERENCES users(id),
  role VARCHAR(50), -- editor, viewer, admin
  permissions JSONB,
  created_at TIMESTAMP
);

-- Channels
CREATE TABLE channels (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  telegram_id VARCHAR(50) UNIQUE,
  name VARCHAR(255),
  description TEXT,
  avatar_url TEXT,
  member_count INTEGER DEFAULT 0,
  is_private BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP
);

-- Subscriptions
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  channel_id UUID REFERENCES channels(id),
  name VARCHAR(255),
  description TEXT,
  price DECIMAL(10, 2),
  currency VARCHAR(3) DEFAULT 'RUB',
  billing_cycle VARCHAR(20), -- monthly, yearly, one-time
  features JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP
);

CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  plan_id UUID REFERENCES subscription_plans(id),
  status VARCHAR(20), -- active, cancelled, expired, suspended
  started_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  auto_renew BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMP
);

-- Payments
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  subscription_id UUID REFERENCES user_subscriptions(id),
  amount DECIMAL(10, 2),
  currency VARCHAR(3),
  status VARCHAR(20), -- pending, completed, failed, refunded
  payment_method VARCHAR(50), -- stripe, yookassa, etc
  provider_transaction_id VARCHAR(255),
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Bots (n8n integration)
CREATE TABLE bots (
  id UUID PRIMARY KEY,
  channel_id UUID REFERENCES channels(id),
  telegram_token VARCHAR(255),
  name VARCHAR(255),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  config JSONB,
  created_at TIMESTAMP
);

CREATE TABLE bot_workflows (
  id UUID PRIMARY KEY,
  bot_id UUID REFERENCES bots(id),
  n8n_workflow_id VARCHAR(255),
  name VARCHAR(255),
  trigger_type VARCHAR(50), -- message, join, subscription, etc
  config JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP
);

-- Analytics
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  channel_id UUID REFERENCES channels(id),
  event_type VARCHAR(50),
  value DECIMAL(10, 2),
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE daily_metrics (
  id UUID PRIMARY KEY,
  business_id UUID REFERENCES businesses(id),
  date DATE,
  revenue DECIMAL(10, 2),
  new_subscribers INTEGER,
  churn_rate DECIMAL(5, 2),
  engagement_rate DECIMAL(5, 2),
  created_at TIMESTAMP
);
```

---

## External Integrations

### 1. Telegram Bot API
- Receive messages via webhooks
- Send messages and media
- Manage channel members
- Handle join requests

### 2. Payment Providers
- **Stripe** — credit cards, international payments
- **ЮКасса** — Russian payments
- **Яндекс.Касса** (legacy support)
- Webhook handling for transaction updates

### 3. n8n Integration
- Connect channels to n8n workflows
- AI agent management (DeepSeek LLM)
- Automation rules
- Message templates
- Event routing

### 4. Analytics Services
- Event tracking (GA, Mixpanel)
- Revenue reporting
- Churn analysis
- Custom dashboards

---

## Security Architecture

### Authentication & Authorization
- JWT tokens with 15min expiry + refresh tokens (7 days)
- Email verification on signup
- Rate limiting on auth endpoints
- Password hashing (bcrypt)
- OAuth support for social login

### Data Protection
- HTTPS only
- Database encryption at rest (PostgreSQL encryption)
- Secrets management (environment variables)
- API key rotation
- Role-based access control (RBAC)

### Payment Security
- PCI DSS compliance
- Tokenized payment methods (no raw card storage)
- Payment provider webhooks validation
- Transaction audit logs

---

## Deployment Architecture

### Development
```
Local → Docker Compose
├── Next.js (frontend + API)
├── PostgreSQL
├── Redis (sessions, cache)
└── n8n (local instance)
```

### Production
```
Multi-region deployment
├── Frontend (Vercel / Cloudflare Pages)
├── API (Docker on Kubernetes / App Engine)
├── PostgreSQL (Managed DB)
├── Redis (Managed Cache)
├── n8n (Self-hosted / Managed)
└── CDN (media, assets)
```

---

## Development Phases

### Phase 1: MVP (Weeks 1-4)
- [x] Boilerplate & Setup
- [ ] Authentication & Authorization
- [ ] Business Management
- [ ] Channel Connection (Telegram)
- [ ] Basic Subscription System
- [ ] Simple Analytics Dashboard

### Phase 2: Payments (Weeks 5-8)
- [ ] Payment Gateway Integration
- [ ] Subscription Auto-Renewal
- [ ] Payout Management
- [ ] Invoice Generation
- [ ] Transaction History

### Phase 3: AI Bots (Weeks 9-12)
- [ ] n8n Integration
- [ ] Bot Configuration UI
- [ ] Workflow Management
- [ ] Message Templates
- [ ] Automation Rules

### Phase 4: Polish & Scale (Weeks 13-16)
- [ ] Team Collaboration Features
- [ ] Advanced Analytics
- [ ] Performance Optimization
- [ ] Security Hardening
- [ ] Documentation & Onboarding

---

## Technology Stack

### Frontend
- **Framework:** Next.js 15 (React 19)
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Forms:** React Hook Form + Zod
- **Charts:** Recharts (analytics)
- **UI Components:** Radix UI

### Backend
- **Runtime:** Node.js
- **Framework:** Next.js API Routes
- **Database:** PostgreSQL 16
- **Cache:** Redis
- **Auth:** JWT + OAuth
- **API:** REST (with GraphQL optional)

### DevOps
- **Containerization:** Docker
- **Orchestration:** Kubernetes / Docker Compose
- **CI/CD:** GitHub Actions
- **Monitoring:** Prometheus + Grafana
- **Logging:** ELK Stack / Datadog

### External Services
- **Payments:** Stripe + ЮКасса SDK
- **AI:** n8n + DeepSeek LLM
- **Messaging:** Telegram Bot API
- **Email:** SendGrid / Mailgun

---

## Success Metrics

- [ ] Time to create channel: < 5 min
- [ ] Payment processing success rate: > 99.5%
- [ ] API response time: < 200ms (p95)
- [ ] Bot latency: < 1s (message processing)
- [ ] Platform uptime: > 99.9%
- [ ] User retention (30-day): > 60%
- [ ] NPS score: > 50

---

**Next Steps:**
1. Start with Phase 1: Auth + Business Management
2. Build the subscriber management module
3. Integrate Telegram Bot API
4. Add subscription plans and basic payments
5. Connect to n8n for AI agent features

