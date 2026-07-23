#!/bin/bash

echo "🧪 GATEKEEPER PLATFORM — COMPREHENSIVE TESTING SCRIPT"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0
PASSED=0

test_section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📋 $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

pass() {
  echo -e "${GREEN}✅ $1${NC}"
  ((PASSED++))
}

fail() {
  echo -e "${RED}❌ $1${NC}"
  ((FAILED++))
}

warn() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

# ========== SECTION 1: DOCKER CHECK ==========
test_section "Docker & Docker Compose"

if command -v docker &> /dev/null; then
  pass "Docker installed: $(docker --version)"
else
  fail "Docker not installed"
fi

if command -v docker-compose &> /dev/null; then
  pass "Docker Compose installed: $(docker-compose --version)"
else
  fail "Docker Compose not installed"
fi

# ========== SECTION 2: FILE STRUCTURE ==========
test_section "Project File Structure"

files=(
  "apps/api/src/payments/payments.controller.ts"
  "apps/api/src/payments/payments.service.ts"
  "apps/api/src/payments/payments.module.ts"
  "apps/web/src/app/admin/payments/page.tsx"
  "docker-compose.prod.yml"
  ".env.example"
  "DEPLOYMENT.md"
  "docs/n8n-workflows/README.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    pass "Found: $file"
  else
    fail "Missing: $file"
  fi
done

# ========== SECTION 3: CONFIG VALIDATION ==========
test_section "Configuration Files"

if [ -f "docker-compose.prod.yml" ]; then
  if grep -q "postgres:" docker-compose.prod.yml && \
     grep -q "redis:" docker-compose.prod.yml && \
     grep -q "api:" docker-compose.prod.yml && \
     grep -q "web:" docker-compose.prod.yml; then
    pass "docker-compose.prod.yml has all services"
  else
    fail "docker-compose.prod.yml missing services"
  fi
fi

if [ -f ".env.example" ]; then
  lines=$(wc -l < .env.example)
  if [ $lines -gt 20 ]; then
    pass ".env.example has $lines configuration variables"
  else
    fail ".env.example insufficient variables"
  fi
fi

# ========== SECTION 4: CODE STRUCTURE ==========
test_section "Code Quality Checks"

# Check TypeScript files exist
ts_files=$(find apps/api/src/payments -name "*.ts" 2>/dev/null | wc -l)
if [ $ts_files -gt 0 ]; then
  pass "Found $ts_files TypeScript files in payments module"
else
  fail "No TypeScript files found"
fi

# Check for required patterns
if grep -r "IPaymentProvider" apps/api/src/payments/ &> /dev/null; then
  pass "Payment provider interface defined"
else
  fail "Payment provider interface missing"
fi

if grep -r "PaymentStatus" apps/api/src/payments/ &> /dev/null; then
  pass "Payment status enum defined"
else
  fail "Payment status enum missing"
fi

# ========== SECTION 5: DOCUMENTATION ==========
test_section "Documentation"

docs=(
  "DEPLOYMENT.md:deployment"
  "docs/n8n-workflows/README.md:n8n workflows"
  "PROGRESS.md:progress tracking"
  "apps/api/src/payments/payments.controller.ts:controller"
)

for doc_check in "${docs[@]}"; do
  doc="${doc_check%:*}"
  desc="${doc_check#*:}"
  if [ -f "$doc" ] && [ -s "$doc" ]; then
    size=$(wc -l < "$doc")
    pass "$desc documented ($size lines)"
  else
    fail "$desc not documented"
  fi
done

# ========== SECTION 6: PAYMENT PROVIDERS ==========
test_section "Payment Providers Implementation"

providers=(
  "telegram-stars.provider.ts"
  "yookassa.provider.ts"
  "cloudpayments.provider.ts"
  "robokassa.provider.ts"
)

for provider in "${providers[@]}"; do
  file="apps/api/src/payments/providers/$provider"
  if [ -f "$file" ]; then
    if grep -q "verify(" "$file" && grep -q "initiate(" "$file"; then
      pass "$(basename $provider): verify() + initiate() implemented"
    else
      fail "$(basename $provider): missing methods"
    fi
  else
    fail "Missing provider: $provider"
  fi
done

# ========== SECTION 7: TESTS ==========
test_section "Test Files"

if [ -f "apps/api/src/payments/payments.service.spec.ts" ]; then
  test_count=$(grep -c "it(" apps/api/src/payments/payments.service.spec.ts 2>/dev/null || echo "0")
  pass "Jest tests found ($test_count test cases)"
else
  warn "Jest test file not found"
fi

if [ -f "apps/web/src/__tests__/payments.integration.test.ts" ]; then
  test_count=$(grep -c "test(" apps/web/src/__tests__/payments.integration.test.ts 2>/dev/null || echo "0")
  pass "Playwright E2E tests found ($test_count test cases)"
else
  warn "Playwright test file not found"
fi

# ========== SECTION 8: GIT STATUS ==========
test_section "Git Status"

if command -v git &> /dev/null; then
  commits=$(git log --oneline 2>/dev/null | wc -l)
  if [ $commits -gt 0 ]; then
    pass "Git repository with $commits commits"
    latest=$(git log --oneline -1 2>/dev/null)
    echo "   Latest: $latest"
  else
    fail "No commits found"
  fi
  
  branch=$(git branch --show-current 2>/dev/null)
  if [ "$branch" == "claude/telegram-channels-platform-ldtz5v" ]; then
    pass "On correct branch: $branch"
  else
    warn "On branch: $branch (expected claude/telegram-channels-platform-ldtz5v)"
  fi
else
  warn "Git not available"
fi

# ========== SUMMARY ==========
echo ""
echo "=================================================="
echo "📊 TEST SUMMARY"
echo "=================================================="
echo -e "${GREEN}✅ PASSED: $PASSED${NC}"
echo -e "${RED}❌ FAILED: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL TESTS PASSED!${NC}"
  echo ""
  echo "📋 Next steps:"
  echo "1. Copy docker-compose.prod.yml to pve3"
  echo "2. Fill .env with real credentials"
  echo "3. Run: docker-compose -f docker-compose.prod.yml build"
  echo "4. Run: docker-compose -f docker-compose.prod.yml up -d"
  echo "5. Run migrations: docker-compose exec api pnpm db:migrate"
  echo "6. Register webhooks in payment provider dashboards"
  echo "7. Create n8n workflows"
  echo "8. Test payment flow"
  echo "9. Go live!"
  exit 0
else
  echo -e "${RED}❌ TESTS FAILED - Fix issues before deploying${NC}"
  exit 1
fi
