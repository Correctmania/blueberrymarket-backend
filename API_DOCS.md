# BlueberryMarket API Documentation

**Base URL:** `http://localhost:3001/api`  
**WebSocket:** `ws://localhost:3001/ws`  
**Version:** 1.0.0

---

## Authentication

All protected routes require a Bearer token in the `Authorization` header:
```
Authorization: Bearer <accessToken>
```

Tokens expire in 7 days. Use `/api/auth/refresh` with your refresh token to get a new one.

---

## 🔐 AUTH  `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | No | Create account |
| POST | `/login` | No | Sign in |
| POST | `/refresh` | No | Refresh access token |
| POST | `/logout` | Yes | Invalidate session |
| GET | `/me` | Yes | Get current user |
| PUT | `/profile` | Yes | Update username |
| POST | `/change-password` | Yes | Change password |
| POST | `/forgot-password` | No | Request reset code |
| POST | `/reset-password` | No | Reset with code |

### POST /register
```json
{
  "username": "satoshi",
  "email": "satoshi@example.com",
  "password": "SecurePass123",
  "referralCode": "BB123456"   // optional
}
```
**Response 201:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "username": "satoshi", "referralCode": "BBXYZ123", ... }
}
```

### POST /login
```json
{ "email": "satoshi@example.com", "password": "SecurePass123" }
```

### POST /refresh
```json
{ "refreshToken": "eyJ..." }
```

### POST /forgot-password
```json
{ "email": "satoshi@example.com" }
```

### POST /reset-password
```json
{ "email": "satoshi@example.com", "code": "123456", "newPassword": "NewPass123" }
```

### POST /change-password *(auth)*
```json
{ "currentPassword": "OldPass", "newPassword": "NewPass123" }
```

---

## 📈 MARKET  `/api/market`  (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/prices` | All coin prices |
| GET | `/prices/:symbol` | Single coin + history |
| GET | `/search?q=bit` | Search coins |
| GET | `/gainers` | Top gainers & losers |
| GET | `/orderbook/:symbol` | Live order book |
| GET | `/trades/:symbol` | Recent trades |
| GET | `/chart/:symbol` | OHLC candle data |

### GET /prices
```json
{
  "prices": [
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "price": 67432.50,
      "change24h": 2.34,
      "high24h": 68100.00,
      "low24h": 66800.00,
      "volume24h": 28400000000,
      "marketCap": 1328021500000,
      "marketCapFormatted": "$1.33T",
      "volumeFormatted": "$28.40B"
    }, ...
  ]
}
```

### GET /orderbook/BTC?levels=10
```json
{
  "symbol": "BTC",
  "midPrice": 67432.50,
  "spread": 107.88,
  "asks": [{ "price": 67486.42, "amount": 0.231456, "total": 0.231456 }, ...],
  "bids": [{ "price": 67378.54, "amount": 0.412300, "total": 0.412300 }, ...]
}
```

### GET /chart/ETH?days=30&interval=daily
- `interval`: `daily` | `hourly`
```json
{
  "symbol": "ETH",
  "candles": [{ "date": "2025-04-15", "open": 3450.00, "high": 3521.80, "low": 3380.10, "close": 3510.20, "volume": 14200000000 }, ...]
}
```

---

## 💰 WALLET  `/api/wallet`  *(Auth required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/balance` | Portfolio with USD values |
| GET | `/address?currency=BTC` | Deposit address |
| POST | `/deposit` | Simulate deposit |
| POST | `/withdraw` | Request withdrawal |
| GET | `/transactions` | Transaction history |
| GET | `/transactions/:id` | Single transaction |

### GET /balance
```json
{
  "assets": [
    { "symbol": "USD",  "amount": 1450.50, "priceUSD": 1,       "valueUSD": 1450.50 },
    { "symbol": "BTC",  "amount": 0.05,    "priceUSD": 67432.50,"valueUSD": 3371.63 },
    { "symbol": "ETH",  "amount": 1.2,     "priceUSD": 3521.80, "valueUSD": 4226.16 }
  ],
  "totalUSD": 9048.29
}
```

### POST /deposit
```json
{
  "currency": "USD",
  "amount": 500,
  "method": "bank_transfer",   // "bank_transfer" | "crypto" | "card"
  "txHash": "0xabc123..."      // optional, for crypto deposits
}
```

### POST /withdraw
```json
{
  "currency": "BTC",
  "amount": 0.01,
  "address": "bc1qxyz...",
  "network": "Bitcoin",       // optional
  "memo": "123456"            // optional, for XRP/XLM
}
```

### GET /transactions?type=deposit&currency=USD&status=completed&page=1&limit=20
- `type`: `deposit` | `withdrawal` | `admin_credit`
- `status`: `pending` | `completed` | `rejected`

---

## ⚡ TRADE  `/api/trade`  *(Auth required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/buy` | Buy crypto with USD |
| POST | `/sell` | Sell crypto for USD |
| GET | `/history` | Trade history |
| GET | `/stats` | Trading statistics |
| GET | `/:id` | Single trade detail |

### POST /buy
```json
{
  "symbol": "BTC",
  "amountUSD": 200.00    // OR "amountCrypto": 0.003
}
```
**Response 201:**
```json
{
  "trade": {
    "id": "uuid",
    "type": "buy",
    "symbol": "BTC",
    "amountCrypto": 0.00296704,
    "amountUSD": 200.00,
    "fee": 0.20,
    "totalCost": 200.20,
    "price": 67432.50,
    "status": "completed",
    "createdAt": "2025-05-15T12:00:00Z"
  },
  "message": "Successfully bought 0.00296704 BTC"
}
```

### POST /sell
```json
{
  "symbol": "ETH",
  "amountCrypto": 0.5    // OR "amountUSD": 1700
}
```

### GET /history?symbol=BTC&type=buy&page=1&limit=20

### GET /stats
```json
{
  "totalTrades": 42,
  "buys": 28,
  "sells": 14,
  "totalVolume": 15230.50,
  "totalFees": 15.23,
  "bySymbol": {
    "BTC": { "buys": 10, "sells": 5, "volume": 8000.00 }
  }
}
```

---

## 🤝 REFERRAL  `/api/referral`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/info` | Yes | Your referral info |
| POST | `/validate` | No | Validate a code |
| GET | `/leaderboard` | No | Top referrers |

### GET /info
```json
{
  "referralCode": "BBXYZ123",
  "referralLink": "https://blueberrymarket.com/register?ref=BBXYZ123",
  "totalReferrals": 5,
  "totalEarned": 50.00,
  "referrals": [{ "username": "alice", "joinedAt": "...", "bonus": 10 }]
}
```

### POST /validate
```json
{ "code": "BBXYZ123" }
```

---

## 🪪 KYC  `/api/kyc`  *(Auth required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/submit` | Submit KYC documents |
| GET | `/status` | Check KYC status |

### POST /submit
```json
{
  "firstName": "Satoshi",
  "lastName": "Nakamoto",
  "dateOfBirth": "1990-01-01",
  "country": "JP",
  "documentType": "passport",       // "passport" | "national_id" | "drivers_license"
  "documentNumber": "AB1234567",
  "addressLine1": "123 Crypto St",
  "city": "Tokyo",
  "postalCode": "100-0001"
}
```

### GET /status
```json
{ "kycStatus": "verified", "kycVerified": true, "submittedAt": "...", "reviewedAt": "..." }
```

---

## 🔔 NOTIFICATIONS  `/api/notifications`  *(Auth required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/?unreadOnly=true&limit=20` | List notifications |
| PUT | `/:id/read` | Mark as read (use `all` for all) |

---

## 🎫 SUPPORT  `/api/support`  *(Auth required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ticket` | Create ticket |
| GET | `/tickets` | List my tickets |
| GET | `/tickets/:id` | Get ticket |
| POST | `/tickets/:id/reply` | Reply to ticket |

### POST /ticket
```json
{
  "subject": "Withdrawal not received",
  "message": "My withdrawal from 3 days ago hasn't arrived...",
  "category": "billing"   // "general" | "billing" | "trading" | "kyc" | "technical"
}
```

---

## 🛡️ ADMIN  `/api/admin`  *(Admin auth required)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Platform stats |
| GET | `/users?q=alice&page=1` | List users |
| GET | `/users/:id` | User detail |
| POST | `/users/:id/ban` | Ban user |
| POST | `/users/:id/unban` | Unban user |
| POST | `/users/:id/credit` | Add funds |
| POST | `/users/:id/deduct` | Remove funds |
| GET | `/kyc/pending` | Pending KYC list |
| POST | `/kyc/:id/approve` | Approve KYC |
| POST | `/kyc/:id/reject` | Reject KYC |
| GET | `/transactions?status=pending` | All transactions |
| POST | `/transactions/:id/approve` | Approve transaction |
| POST | `/transactions/:id/reject` | Reject transaction |
| GET | `/support?status=open` | Support tickets |
| POST | `/support/:id/reply` | Reply + set status |
| GET | `/audit-log` | Admin action log |

### POST /admin/users/:id/credit
```json
{ "currency": "USD", "amount": 500, "note": "Promotion bonus" }
```

### POST /admin/kyc/:id/reject
```json
{ "reason": "Document images were blurry. Please resubmit." }
```

### POST /admin/support/:id/reply
```json
{ "message": "We have resolved your issue.", "status": "resolved" }
```

---

## 🔌 WebSocket  `ws://localhost:3001/ws`

### Connect and receive live prices
```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'prices') {
    console.log('Live prices:', msg.data);
  }
};

// Subscribe to specific symbols (optional)
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'subscribe', symbols: ['BTC', 'ETH'] }));
};
```

### Message types received
| Type | Description |
|------|-------------|
| `prices` | Full price array every 3 seconds |
| `pong` | Response to client ping |

---

## Error Responses

All errors follow this format:
```json
{ "error": "Human-readable error message" }
```

Validation errors:
```json
{
  "error": "Validation failed",
  "fields": [{ "field": "email", "message": "Valid email required" }]
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / insufficient balance |
| 401 | Unauthenticated |
| 403 | Forbidden (banned / not admin) |
| 404 | Not found |
| 409 | Conflict (email/username taken) |
| 422 | Validation failed |
| 429 | Rate limit exceeded |
| 500 | Server error |

---

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env   # edit as needed

# 3. Seed database (creates admin + demo accounts)
npm run seed

# 4. Start
npm start              # production
npm run dev            # development (auto-restart)
```

**Default accounts after seed:**
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@blueberrymarket.com | Admin@12345 |
| Demo | demo@blueberrymarket.com | Demo@12345 |
