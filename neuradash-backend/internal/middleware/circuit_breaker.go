// Package middleware provides Fiber middleware for the DataLens backend.
// This file implements a production-grade Circuit Breaker using the
// three-state model: Closed → Open → Half-Open.
//
// States:
//   Closed    – normal operation; failures are counted
//   Open      – requests are short-circuited (fast-fail) for `cooldown`
//   Half-Open – one probe request is let through; success resets to Closed,
//               failure returns to Open
//
// Thread-safety is guaranteed via atomic operations (no mutexes on hot path).

package middleware

import (
	"sync/atomic"
	"time"

	"github.com/gofiber/fiber/v2"
)

// cbState holds the circuit breaker state as an int32 for atomic ops.
const (
	cbStateClosed   int32 = 0
	cbStateOpen     int32 = 1
	cbStateHalfOpen int32 = 2
)

// CircuitBreaker holds per-instance state.
type CircuitBreaker struct {
	state          atomic.Int32
	failures       atomic.Int32
	successCount   atomic.Int32
	openedAt       atomic.Int64 // Unix nano timestamp when state switched to Open
	maxFailures    int32
	cooldown       time.Duration
	successNeeded  int32
	serviceName    string
}

// NewCircuitBreaker creates a CircuitBreaker.
//   serviceName    – label returned in error JSON
//   maxFailures    – consecutive failures before opening the circuit
//   cooldown       – how long the circuit stays Open before switching Half-Open
//   successNeeded  – probes needed in Half-Open before returning to Closed
func NewCircuitBreaker(serviceName string, maxFailures int32, cooldown time.Duration, successNeeded int32) *CircuitBreaker {
	return &CircuitBreaker{
		maxFailures:   maxFailures,
		cooldown:      cooldown,
		successNeeded: successNeeded,
		serviceName:   serviceName,
	}
}

// Middleware returns a fiber.Handler that enforces circuit-breaker logic.
// Wrap expensive or failure-prone downstream calls (e.g., external DB, 3rd-party API).
func (cb *CircuitBreaker) Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		switch cb.state.Load() {

		case cbStateOpen:
			// Check if cooldown has elapsed → transition to Half-Open
			openedAt := cb.openedAt.Load()
			elapsed := time.Since(time.Unix(0, openedAt))
			if elapsed >= cb.cooldown {
				cb.state.CompareAndSwap(cbStateOpen, cbStateHalfOpen)
				cb.successCount.Store(0)
				// Fall through to allow the probe request
			} else {
				// Still open — fast-fail
				return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
					"error":   "Service temporarily unavailable",
					"service": cb.serviceName,
					"retryIn": cb.cooldown.String(),
				})
			}
			fallthrough

		case cbStateHalfOpen:
			// Allow one probe; record result below
			err := c.Next()
			if err != nil || c.Response().StatusCode() >= 500 {
				cb.recordFailure()
			} else {
				n := cb.successCount.Add(1)
				if n >= cb.successNeeded {
					cb.reset()
				}
			}
			return err

		default: // cbStateClosed
			err := c.Next()
			if err != nil || c.Response().StatusCode() >= 500 {
				cb.recordFailure()
			} else {
				cb.failures.Store(0) // reset on success
			}
			return err
		}
	}
}

// RecordExternalFailure allows code outside the middleware to increment the
// failure counter (e.g., when a DB query inside a handler returns an error).
func (cb *CircuitBreaker) RecordExternalFailure() {
	cb.recordFailure()
}

func (cb *CircuitBreaker) recordFailure() {
	n := cb.failures.Add(1)
	if n >= cb.maxFailures {
		if cb.state.CompareAndSwap(cbStateClosed, cbStateOpen) ||
			cb.state.CompareAndSwap(cbStateHalfOpen, cbStateOpen) {
			cb.openedAt.Store(time.Now().UnixNano())
			cb.successCount.Store(0)
		}
	}
}

func (cb *CircuitBreaker) reset() {
	cb.state.Store(cbStateClosed)
	cb.failures.Store(0)
	cb.successCount.Store(0)
}

// IsOpen returns true if the circuit is currently open (service degraded).
func (cb *CircuitBreaker) IsOpen() bool {
	return cb.state.Load() == cbStateOpen
}

// State returns a human-readable state string (useful for /health endpoints).
func (cb *CircuitBreaker) State() string {
	switch cb.state.Load() {
	case cbStateOpen:
		return "open"
	case cbStateHalfOpen:
		return "half-open"
	default:
		return "closed"
	}
}
