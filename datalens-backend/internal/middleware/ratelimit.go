package middleware

import (
	"context"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

// RateLimiter returns a Redis-backed sliding-window rate limiter middleware.
// max = max requests allowed; window = time window in seconds.
func RateLimiter(rdb *redis.Client, max int, windowSec int) fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Use IP as the rate limit key; prefix by endpoint for granularity
		ip := c.IP()
		path := c.Path()
		key := fmt.Sprintf("ratelimit:%s:%s", ip, path)

		ctx := context.Background()
		now := time.Now().UnixNano()
		windowNs := int64(windowSec) * int64(time.Second)
		windowStart := now - windowNs

		pipe := rdb.Pipeline()
		// Remove expired entries from the sorted set
		pipe.ZRemRangeByScore(ctx, key, "0", fmt.Sprintf("%d", windowStart))
		// Count remaining entries
		countCmd := pipe.ZCard(ctx, key)
		// Add current request
		pipe.ZAdd(ctx, key, redis.Z{Score: float64(now), Member: fmt.Sprintf("%d", now)})
		// Set expiry on key
		pipe.Expire(ctx, key, time.Duration(windowSec)*time.Second)
		_, err := pipe.Exec(ctx)
		if err != nil {
			// On Redis failure, allow the request (fail open)
			return c.Next()
		}

		count := countCmd.Val()
		if count >= int64(max) {
			c.Set("Retry-After", fmt.Sprintf("%d", windowSec))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
				"error":      "Rate limit exceeded",
				"retryAfter": windowSec,
			})
		}

		return c.Next()
	}
}
