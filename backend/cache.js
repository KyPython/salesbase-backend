const { createClient } = require('redis');
const dotenv = require('dotenv');
dotenv.config();

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

async function getOrSetCache(key, fetchFunc, ttl = 60) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const fresh = await fetchFunc();
  await redis.set(key, JSON.stringify(fresh), { EX: ttl });
  return fresh;
}

module.exports = { getOrSetCache };