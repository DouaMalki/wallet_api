// middleware/rateLimit.js
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export function maybeRateLimit() {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
        console.warn("⚠️ Upstash env missing -> rate limit disabled");
        // middleware no-op
        return (_req, _res, next) => next();
    }

    const redis = new Redis({ url, token });

    const ratelimit = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(60, "1 m"),
        analytics: true,
    });

    return async (req, res, next) => {
        try {
            const ip =
                req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
                req.ip ||
                "unknown";

            const { success, reset } = await ratelimit.limit(ip);
            if (!success) {
                return res.status(429).json({
                    message: "Too many requests",
                    reset,
                });
            }
            return next();
        } catch (e) {
            console.error("RateLimit error (ignored):", e?.message);
            return next(); // مهم: لا تكسري الـ API
        }
    };
}
