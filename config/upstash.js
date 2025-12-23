import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import "dotenv/config";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  // specify the number of requests per 60 seconds
  limiter: Ratelimit.slidingWindow(100, "60 s"),
});

export default ratelimit;