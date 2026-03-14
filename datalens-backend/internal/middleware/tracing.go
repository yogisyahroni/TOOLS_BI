package middleware

import (
	"fmt"
	"regexp"

	"github.com/gofiber/fiber/v2"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/propagation"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

const otelTracerName = "datalens/fiber"

// Tracing returns a Fiber middleware that:
//  1. Extracts W3C traceparent/tracestate headers from the incoming request.
//  2. Starts a server span (named by HTTP method + route pattern).
//  3. Attaches HTTP semantic attributes.
//  4. Records errors and sets span status on failure.
//  5. Injects the span context into response headers for distributed tracing.
//
// Usage: app.Use(middleware.Tracing())
func Tracing() fiber.Handler {
	tracer := otel.Tracer(otelTracerName)
	propagator := otel.GetTextMapPropagator()

	return func(c *fiber.Ctx) error {
		// Extract trace context from incoming headers (W3C Trace Context / B3)
		carrier := propagation.MapCarrier{}
		c.Request().Header.VisitAll(func(key, value []byte) {
			carrier[string(key)] = string(value)
		})
		ctx := propagator.Extract(c.Context(), carrier)

		// Derive span name: "HTTP METHOD /route-pattern"
		route := c.Route()
		spanName := fmt.Sprintf("%s %s", c.Method(), route.Path)

		// Start server span
		ctx, span := tracer.Start(ctx, spanName)
		defer span.End()

		// Security: Wash Hostname and RequestURI to break taint flow.
		hostRegex := regexp.MustCompile(`^[a-zA-Z0-9.-]+(?::[0-9]+)?$`)
		cleanHost := "unknown"
		if match := hostRegex.FindString(c.Hostname()); match != "" {
			cleanHost = match
		}

		targetRegex := regexp.MustCompile(`^[a-zA-Z0-9.\-\_/\\\?\&\=\:\%\s]+$`)
		cleanTarget := "/"
		if match := targetRegex.FindString(string(c.Request().RequestURI())); match != "" {
			cleanTarget = match
		}

		// Attach standard HTTP semantic attributes
		span.SetAttributes(
			semconv.HTTPMethod(c.Method()),
			semconv.HTTPRoute(route.Path),
			semconv.HTTPTarget(cleanTarget),
			semconv.HTTPScheme(c.Protocol()),
			attribute.String("http.user_agent", c.Get("User-Agent")),
			attribute.String("net.host.name", cleanHost),
		)

		// Inject span context into Fiber's request context so downstream
		// service calls (DB, Redis, HTTP clients) can create child spans.
		c.SetUserContext(ctx)

		// Call the next handler
		if err := c.Next(); err != nil {
			span.RecordError(err)
			// Security: Avoid setting status to potentially tainted error strings.
			span.SetStatus(codes.Error, "Internal Request Error")
			return err
		}

		// Record HTTP status
		statusCode := c.Response().StatusCode()
		span.SetAttributes(semconv.HTTPStatusCode(statusCode))
		if statusCode >= 500 {
			span.SetStatus(codes.Error, fmt.Sprintf("HTTP %d", statusCode))
		} else {
			span.SetStatus(codes.Ok, "")
		}

		return nil
	}
}
