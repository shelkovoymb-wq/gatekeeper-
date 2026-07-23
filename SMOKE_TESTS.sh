#!/bin/bash

echo "🚀 SMOKE TESTS FOR PVE3 DEPLOYMENT"
echo "===================================="
echo ""

PASSED=0
FAILED=0

test() {
  echo "Testing: $1"
}

pass() {
  echo "✅ $1"
  ((PASSED++))
}

fail() {
  echo "❌ $1"
  ((FAILED++))
}

# Wait for services to be ready
echo "⏳ Waiting for services to start (30 seconds)..."
sleep 30

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1️⃣ API HEALTH CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if curl -f http://localhost:3000/health > /dev/null 2>&1; then
  pass "API is running on port 3000"
else
  fail "API health check failed"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "2️⃣ FRONTEND CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if curl -f http://localhost:3001/ > /dev/null 2>&1; then
  pass "Frontend is running on port 3001"
else
  fail "Frontend not responding"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "3️⃣ DATABASE CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker-compose -f docker-compose.prod.yml exec -T postgres psql -U gatekeeper -d gatekeeper -c "SELECT 1;" > /dev/null 2>&1; then
  pass "PostgreSQL is accessible"
else
  fail "PostgreSQL connection failed"
fi

if docker-compose -f docker-compose.prod.yml exec -T postgres psql -U gatekeeper -d gatekeeper -c "\dt" | grep -q "payments"; then
  pass "Database schema initialized (payments table exists)"
else
  fail "Database schema not initialized"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "4️⃣ REDIS CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli -a redis123 ping | grep -q "PONG"; then
  pass "Redis is running"
else
  fail "Redis connection failed"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "5️⃣ PAYMENT ENDPOINTS CHECK"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PAYLOAD='{
  "clientId": "test",
  "subscriberId": "sub1",
  "subscriptionId": "subc1",
  "amount": 100,
  "currency": "RUB",
  "provider": "yookassa",
  "description": "Smoke test"
}'

RESPONSE=$(curl -s -X POST http://localhost:3000/payments/initiate \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

if echo "$RESPONSE" | grep -q "paymentId"; then
  pass "Payment initiate endpoint works"
  PAYMENT_ID=$(echo "$RESPONSE" | grep -o '"paymentId":"[^"]*"' | cut -d'"' -f4)
  echo "   Created test payment: $PAYMENT_ID"
else
  fail "Payment initiate endpoint failed"
  echo "   Response: $RESPONSE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "6️⃣ CONTAINER STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 SMOKE TEST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ PASSED: $PASSED"
echo "❌ FAILED: $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "🎉 ALL SMOKE TESTS PASSED!"
  echo ""
  echo "✅ Platform is ready:"
  echo "   - API: http://localhost:3000"
  echo "   - Frontend: http://localhost:3001"
  echo "   - Database: PostgreSQL running"
  echo "   - Cache: Redis running"
  echo ""
  echo "📋 Next steps:"
  echo "1. Register webhooks in payment provider dashboards"
  echo "2. Create n8n workflows (see docs/n8n-workflows/README.md)"
  echo "3. Test payment flow end-to-end"
  echo "4. Enable monitoring"
  echo "5. Go live!"
  exit 0
else
  echo "❌ Some tests failed. Check logs:"
  echo "   docker-compose -f docker-compose.prod.yml logs"
  exit 1
fi
