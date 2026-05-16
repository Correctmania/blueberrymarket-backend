const db = require('./database');

const COINS = {
  BTC:  { symbol: 'BTC',  name: 'Bitcoin',     icon: '₿', basePrice: 67432.50,  circulatingSupply: 19_700_000,      decimals: 8 },
  ETH:  { symbol: 'ETH',  name: 'Ethereum',    icon: 'Ξ', basePrice: 3521.80,   circulatingSupply: 120_000_000,     decimals: 8 },
  BNB:  { symbol: 'BNB',  name: 'BNB',         icon: 'B', basePrice: 598.20,    circulatingSupply: 145_000_000,     decimals: 8 },
  SOL:  { symbol: 'SOL',  name: 'Solana',      icon: '◎', basePrice: 172.45,    circulatingSupply: 430_000_000,     decimals: 8 },
  ADA:  { symbol: 'ADA',  name: 'Cardano',     icon: 'A', basePrice: 0.4512,    circulatingSupply: 35_000_000_000,  decimals: 6 },
  XRP:  { symbol: 'XRP',  name: 'XRP',         icon: '✕', basePrice: 0.6234,    circulatingSupply: 50_000_000_000,  decimals: 6 },
  DOGE: { symbol: 'DOGE', name: 'Dogecoin',    icon: 'Ð', basePrice: 0.1423,    circulatingSupply: 140_000_000_000, decimals: 6 },
  AVAX: { symbol: 'AVAX', name: 'Avalanche',   icon: 'Δ', basePrice: 38.92,     circulatingSupply: 380_000_000,     decimals: 8 },
  MATIC:{ symbol: 'MATIC',name: 'Polygon',     icon: 'M', basePrice: 0.8834,    circulatingSupply: 9_300_000_000,   decimals: 6 },
  DOT:  { symbol: 'DOT',  name: 'Polkadot',    icon: '●', basePrice: 7.23,      circulatingSupply: 1_400_000_000,   decimals: 6 },
  LTC:  { symbol: 'LTC',  name: 'Litecoin',    icon: 'Ł', basePrice: 84.10,     circulatingSupply: 74_000_000,      decimals: 8 },
  LINK: { symbol: 'LINK', name: 'Chainlink',   icon: '⬡', basePrice: 14.52,     circulatingSupply: 600_000_000,     decimals: 8 },
  UNI:  { symbol: 'UNI',  name: 'Uniswap',     icon: '🦄',basePrice: 8.74,      circulatingSupply: 760_000_000,     decimals: 8 },
  ATOM: { symbol: 'ATOM', name: 'Cosmos',      icon: '⚛', basePrice: 9.18,      circulatingSupply: 390_000_000,     decimals: 6 },
  USDT: { symbol: 'USDT', name: 'Tether',      icon: '₮', basePrice: 1.0000,    circulatingSupply: 110_000_000_000, decimals: 6, stable: true },
  USDC: { symbol: 'USDC', name: 'USD Coin',    icon: '$', basePrice: 1.0000,    circulatingSupply: 43_000_000_000,  decimals: 6, stable: true },
};

// Live price state (in-memory, updated every few seconds)
const liveData = {};
for (const [sym, coin] of Object.entries(COINS)) {
  liveData[sym] = {
    ...coin,
    price:      coin.basePrice,
    change24h:  parseFloat((Math.random() * 10 - 5).toFixed(2)),
    high24h:    coin.basePrice * 1.03,
    low24h:     coin.basePrice * 0.97,
    volume24h:  Math.floor(coin.basePrice * coin.circulatingSupply * 0.005),
    lastUpdated: Date.now(),
  };
}

// Simulate price movement every 3 seconds
function startPriceEngine() {
  setInterval(() => {
    for (const [sym, coin] of Object.entries(liveData)) {
      if (coin.stable) continue;
      const drift = (Math.random() - 0.489) * 0.003;   // slight upward bias
      coin.price     = parseFloat((coin.price * (1 + drift)).toFixed(coin.price >= 1 ? 2 : 6));
      coin.change24h = parseFloat((coin.change24h + (Math.random() - 0.5) * 0.08).toFixed(2));
      coin.high24h   = Math.max(coin.high24h, coin.price);
      coin.low24h    = Math.min(coin.low24h, coin.price);
      coin.lastUpdated = Date.now();
    }
  }, 3000);

  // Reset 24h high/low daily
  setInterval(() => {
    for (const coin of Object.values(liveData)) {
      coin.high24h = coin.price * 1.002;
      coin.low24h  = coin.price * 0.998;
    }
  }, 86400000);
}

function getPrice(symbol) {
  return liveData[symbol.toUpperCase()]?.price || null;
}

function getAllPrices() {
  return Object.values(liveData);
}

module.exports = { COINS, liveData, startPriceEngine, getPrice, getAllPrices };
