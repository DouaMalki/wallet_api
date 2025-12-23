import ratelimit from "../config/upstash.js";

const rateLimiter = async (req, res, next) => {
  try {
    // here I will put the user id instead of the "my-rate-limit" 
    const { success } = await ratelimit.limit("my-rate-limit");

    if (!success) {
      return res.status(429).json({
        message: "Too many requests, please try again later",
      });
    }
    next();
  } catch (error) {
    console.log("Rate limit error", error);
    next(error);
  }
};

export default rateLimiter;