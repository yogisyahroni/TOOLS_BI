package graphql

// handler.go — Fiber-compatible GraphQL HTTP handler.
//
// Security measures:
//   - Introspection disabled in production (APP_ENV=production).
//   - GraphiQL playground disabled in production.
//   - JWT-authenticated userId forwarded from Fiber locals → context.Context.
//   - Per-request DataLoader attached to prevent N+1 queries.

import (
	"context"
	"net/http"
	"os"

	"datalens/internal/repository"

	"github.com/99designs/gqlgen/graphql"
	gqlhandler "github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/gofiber/adaptor/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/vektah/gqlparser/v2/ast"
	"gorm.io/gorm"
)

// NewGraphQLHandler returns a Fiber handler that serves the GraphQL endpoint.
func NewGraphQLHandler(
	db *gorm.DB,
	dashRepo repository.DashboardRepository,
	datasetRepo repository.DatasetRepository,
	chartRepo repository.ChartRepository,
	alertRepo repository.DataAlertRepository,
) fiber.Handler {
	root := &Resolver{
		DB:            db,
		DashboardRepo: dashRepo,
		DatasetRepo:   datasetRepo,
		ChartRepo:     chartRepo,
		AlertRepo:     alertRepo,
	}

	srv := gqlhandler.New(NewExecutableSchema(Config{Resolvers: root}))

	// ── Transports ───────────────────────────────────────────────────────────
	srv.AddTransport(transport.Options{})
	srv.AddTransport(transport.GET{})
	srv.AddTransport(transport.POST{})

	// ── Query cache (keyed by document AST) ──────────────────────────────────
	srv.SetQueryCache(lru.New[*ast.QueryDocument](1000))

	// ── Extensions ───────────────────────────────────────────────────────────
	// Introspection{} enables introspection schema queries (dev/staging).
	srv.Use(extension.Introspection{})

	// Disable introspection in production via AroundOperations middleware.
	// graphql.GetOperationContext retrieves the per-request OperationContext.
	if os.Getenv("APP_ENV") == "production" {
		srv.AroundOperations(func(ctx context.Context, next graphql.OperationHandler) graphql.ResponseHandler {
			graphql.GetOperationContext(ctx).DisableIntrospection = true
			return next(ctx)
		})
	}

	// ── Fiber handler ────────────────────────────────────────────────────────
	return func(c *fiber.Ctx) error {
		userID, _ := c.Locals("userId").(string)

		// Bridge: wrap net/http handler to inject userId + DataLoader into ctx.
		wrapped := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := r.Context()
			ctx = context.WithValue(ctx, contextUserID, userID)
			ctx = AttachDataLoader(ctx, db)
			srv.ServeHTTP(w, r.WithContext(ctx))
		})

		return adaptor.HTTPHandler(wrapped)(c)
	}
}

// NewPlaygroundHandler returns a GraphiQL playground Fiber handler.
// Only register this route in non-production environments.
func NewPlaygroundHandler(endpoint string) fiber.Handler {
	pg := playground.Handler("DataLens GraphQL Playground", endpoint)
	return adaptor.HTTPHandler(pg)
}
