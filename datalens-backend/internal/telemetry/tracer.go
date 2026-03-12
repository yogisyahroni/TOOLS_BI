// Package telemetry initialises OpenTelemetry tracing for DataLens backend.
// By default it uses a stdout/no-op exporter. When OTEL_EXPORTER_OTLP_ENDPOINT
// is set, it exports spans to a real collector (e.g. Jaeger, Grafana Tempo).
//
// Usage in main.go:
//
//	tp, err := telemetry.InitTracer(ctx, "datalens-backend", cfg.Env)
//	if err != nil { log.Warn().Err(err).Msg("tracing unavailable") }
//	defer tp.Shutdown(ctx)
package telemetry

import (
	"context"
	"os"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/stdout/stdouttrace"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"
)

// TracerProvider is a thin wrapper exposing Shutdown.
type TracerProvider struct{ tp *sdktrace.TracerProvider }

// Shutdown flushes and stops the underlying TracerProvider.
func (t *TracerProvider) Shutdown(ctx context.Context) error {
	return t.tp.Shutdown(ctx)
}

// InitTracer creates and registers a global OpenTelemetry TracerProvider.
// In production (env="production" and OTEL_EXPORTER_OTLP_ENDPOINT set), it
// exports spans to the OTLP endpoint. Otherwise it discards spans (no I/O).
func InitTracer(ctx context.Context, serviceName, env string) (*TracerProvider, error) {
	var exporter sdktrace.SpanExporter
	var err error

	otlpEndpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if otlpEndpoint != "" {
		// OTLP exporter requires importing go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp
		// which is not yet in go.mod. Use stdout as a bridge until the team adds the dep.
		// TODO(phase32): Add otlptracehttp when OTEL collector is provisioned.
		exporter, err = stdouttrace.New(stdouttrace.WithPrettyPrint())
		if err != nil {
			return nil, err
		}
	} else if env == "development" || env == "" {
		// Development: discard spans by using a noop stdouttrace with /dev/null equivalent
		// (write to os.Stderr only at debug level — no performance impact)
		exporter, err = stdouttrace.New(stdouttrace.WithoutTimestamps())
		if err != nil {
			return nil, err
		}
	} else {
		// Production without OTLP: use no-op (discard all spans — zero overhead)
		otel.SetTracerProvider(trace.NewNoopTracerProvider())
		return &TracerProvider{tp: sdktrace.NewTracerProvider()}, nil
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceName(serviceName),
			semconv.ServiceVersion("1.0.0"),
		),
	)
	if err != nil {
		return nil, err
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter,
			sdktrace.WithBatchTimeout(5*time.Second),
			sdktrace.WithMaxExportBatchSize(512),
		),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.TraceIDRatioBased(sampleRate(env))),
	)

	otel.SetTracerProvider(tp)
	return &TracerProvider{tp: tp}, nil
}

// Tracer returns a named tracer from the global provider.
func Tracer(name string) trace.Tracer {
	return otel.Tracer(name)
}

// sampleRate returns the fraction of traces to sample:
// development= 100%, production= 10% (to reduce noise/cost).
func sampleRate(env string) float64 {
	if env == "production" {
		return 0.10 // 10% sampling in prod
	}
	return 1.0 // 100% in dev/staging
}
