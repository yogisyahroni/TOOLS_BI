package handlers

import (
	"context"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"neuradash/internal/email"
	"neuradash/internal/middleware"
	"neuradash/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AuthHandler handles all authentication operations.
type AuthHandler struct {
	db         *gorm.DB
	redis      *redis.Client
	jwtSecret  string
	accessTTL  time.Duration
	refreshTTL time.Duration
	mailer     email.Mailer
	appURL     string
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(db *gorm.DB, rdb *redis.Client, secret string, access, refresh time.Duration, mailer email.Mailer, appURL string) *AuthHandler {
	return &AuthHandler{
		db:         db,
		redis:      rdb,
		jwtSecret:  secret,
		accessTTL:  access,
		refreshTTL: refresh,
		mailer:     mailer,
		appURL:     appURL,
	}
}

// RegisterRequest is the body for POST /auth/register.
type RegisterRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

// LoginRequest is the body for POST /auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Register creates a new user account.
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *fiber.Ctx) error {
	var req RegisterRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	// Validate
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if !isValidEmail(req.Email) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid email address"})
	}
	if len(req.Password) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password must be at least 8 characters"})
	}
	if strings.TrimSpace(req.DisplayName) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Display name is required"})
	}

	// Check duplicate email
	var existingUser models.User
	if err := h.db.Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": "Email already registered"})
	}

	// Hash password with bcrypt (cost=12)
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	userRecord := models.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		PasswordHash: string(hash),
		DisplayName:  strings.TrimSpace(req.DisplayName),
		Role:         "viewer",
	}

	if err := h.db.Create(&userRecord).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to create user"})
	}

	accessToken, refreshToken, err := h.generateTokenPair(userRecord.ID, userRecord.Role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate tokens"})
	}

	// Store refresh token hash in Redis
	if err := h.storeRefreshToken(userRecord.ID, refreshToken); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store session"})
	}

	// BUG-09: Send welcome email asynchronously (non-blocking)
	go func() {
		_ = h.mailer.Send(userRecord.Email, "Welcome to DataLens!", email.WelcomeEmail(userRecord.DisplayName))
	}()

	// BUG-07: Set refresh token in httpOnly cookie
	isSecure := strings.HasPrefix(h.appURL, "https") || c.Secure() || c.Protocol() == "https" || c.Get("X-Forwarded-Proto") == "https"
	sameSite := "Lax"
	if isSecure {
		sameSite = "None"
	}

	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		HTTPOnly: true,
		Secure:   isSecure,
		SameSite: sameSite,
		MaxAge:   int(h.refreshTTL.Seconds()),
		Path:     "/api/v1/auth",
	})

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"user":         userRecord,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
	})
}

// Login authenticates a user and issues JWT tokens.
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req LoginRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	var userRecord models.User
	if err := h.db.Where("email = ?", req.Email).First(&userRecord).Error; err != nil {
		// Return same error to prevent email enumeration
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(userRecord.PasswordHash), []byte(req.Password)); err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid credentials"})
	}

	accessToken, refreshToken, err := h.generateTokenPair(userRecord.ID, userRecord.Role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate tokens"})
	}

	if err := h.storeRefreshToken(userRecord.ID, refreshToken); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store session"})
	}

	// BUG-07: Set refresh token in httpOnly cookie to prevent XSS token theft
	isSecure := strings.HasPrefix(h.appURL, "https") || c.Secure() || c.Protocol() == "https" || c.Get("X-Forwarded-Proto") == "https"
	sameSite := "Lax"
	if isSecure {
		sameSite = "None"
	}

	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    refreshToken,
		HTTPOnly: true,
		Secure:   isSecure,
		SameSite: sameSite,
		MaxAge:   int(h.refreshTTL.Seconds()),
		Path:     "/api/v1/auth",
	})

	return c.JSON(fiber.Map{
		"user":         userRecord,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
	})
}

// Refresh issues a new access token using a valid refresh token.
// BUG-07 fix: reads refresh token from httpOnly cookie (fallback to body for backwards compat).
// POST /api/v1/auth/refresh
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	// BUG-07 fix: read from httpOnly cookie first, fallback to body for API clients
	rToken := c.Cookies("refresh_token")
	if rToken == "" {
		var body struct {
			RefreshToken string `json:"refreshToken"`
		}
		if err := c.BodyParser(&body); err == nil {
			rToken = body.RefreshToken
		}
	}
	if rToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "refresh_token required (cookie or body)"})
	}

	token, err := jwt.Parse(rToken, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid refresh token"})
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token claims"})
	}

	userID, _ := claims["sub"].(string)
	tokenType, _ := claims["type"].(string)
	if tokenType != "refresh" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Not a refresh token"})
	}

	// Verify refresh token is still valid in Redis (not logged out)
	ctx := context.Background()
	storedKey := fmt.Sprintf("refresh:%s:%s", userID, rToken[:min(32, len(rToken))])
	if exists, err := h.redis.Exists(ctx, storedKey).Result(); err != nil || exists == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Refresh token revoked"})
	}

	// Fetch user to get current role (may have changed)
	var userRecord models.User
	if err := h.db.First(&userRecord, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "User not found"})
	}

	accessToken, newRefreshToken, err := h.generateTokenPair(userRecord.ID, userRecord.Role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
	}

	// Rotate refresh token
	_ = h.redis.Del(ctx, storedKey)
	if err := h.storeRefreshToken(userRecord.ID, newRefreshToken); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to store session"})
	}

	isSecure := strings.HasPrefix(h.appURL, "https") || c.Secure() || c.Protocol() == "https" || c.Get("X-Forwarded-Proto") == "https"
	sameSite := "Lax"
	if isSecure {
		sameSite = "None"
	}

	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    newRefreshToken,
		HTTPOnly: true,
		Secure:   isSecure,
		SameSite: sameSite,
		MaxAge:   int(h.refreshTTL.Seconds()),
		Path:     "/api/v1/auth",
	})

	return c.JSON(fiber.Map{
		"accessToken":  accessToken,
		"refreshToken": newRefreshToken,
	})
}

// Logout invalidates the refresh token and clears the cookie.
// POST /api/v1/auth/logout
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// Read refresh token from cookie first, body as fallback
	rToken := c.Cookies("refresh_token")
	if rToken == "" {
		var body struct {
			RefreshToken string `json:"refreshToken"`
		}
		_ = c.BodyParser(&body)
		rToken = body.RefreshToken
	}

	if rToken != "" {
		userID := middleware.GetUserID(c)
		ctx := context.Background()
		storedKey := fmt.Sprintf("refresh:%s:%s", userID, rToken[:min(32, len(rToken))])
		h.redis.Del(ctx, storedKey)
	}

	// BUG-07: Clear the httpOnly cookie
	isSecure := strings.HasPrefix(h.appURL, "https") || c.Secure() || c.Protocol() == "https" || c.Get("X-Forwarded-Proto") == "https"
	sameSite := "Lax"
	if isSecure {
		sameSite = "None"
	}

	c.Cookie(&fiber.Cookie{
		Name:     "refresh_token",
		Value:    "",
		HTTPOnly: true,
		Secure:   isSecure,
		SameSite: sameSite,
		MaxAge:   -1,
		Path:     "/api/v1/auth",
	})

	return c.JSON(fiber.Map{"message": "Logged out successfully"})
}

// Me returns the current authenticated user's profile.
// GET /api/v1/auth/me
func (h *AuthHandler) Me(c *fiber.Ctx) error {
	userID := middleware.GetUserID(c)

	var userRecord models.User
	if err := h.db.First(&userRecord, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(userRecord)
}

// ForgotPassword generates a password reset token.
// POST /api/v1/auth/forgot-password
func (h *AuthHandler) ForgotPassword(c *fiber.Ctx) error {
	var body struct {
		Email string `json:"email"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	body.Email = strings.TrimSpace(strings.ToLower(body.Email))

	var userRecord models.User
	// Don't reveal if email exists
	_ = h.db.Where("email = ?", body.Email).First(&userRecord)

	if userRecord.ID != "" {
		// Generate reset token and store in Redis (1 hour TTL)
		resetToken := uuid.New().String()
		ctx := context.Background()
		key := fmt.Sprintf("reset:%s", resetToken)
		h.redis.Set(ctx, key, userRecord.ID, time.Hour)

		// BUG-09 fix: actually send the password reset email via SMTP
		resetURL := fmt.Sprintf("%s/reset-password?token=%s", h.appURL, resetToken)
		go func() {
			_ = h.mailer.Send(userRecord.Email, "Reset your DataLens password", email.ResetPasswordEmail(resetURL))
		}()
	}

	// Always return 200 to prevent email enumeration
	return c.JSON(fiber.Map{"message": "If that email is registered, a reset link has been sent"})
}

// ResetPassword sets a new password using a reset token.
// PUT /api/v1/auth/reset-password
func (h *AuthHandler) ResetPassword(c *fiber.Ctx) error {
	var body struct {
		Token       string `json:"token"`
		NewPassword string `json:"newPassword"`
	}
	if err := c.BodyParser(&body); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	if len(body.NewPassword) < 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Password must be at least 8 characters"})
	}

	ctx := context.Background()
	key := fmt.Sprintf("reset:%s", body.Token)
	userID, err := h.redis.Get(ctx, key).Result()
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid or expired reset token"})
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), 12)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to hash password"})
	}

	if err := h.db.Model(&models.User{}).Where("id = ?", userID).Update("password_hash", string(hash)).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update password"})
	}

	// Invalidate reset token
	h.redis.Del(ctx, key)

	return c.JSON(fiber.Map{"message": "Password updated successfully"})
}

// --- Helpers ---

func (h *AuthHandler) generateTokenPair(userID, role string) (accessToken, refreshToken string, err error) {
	now := time.Now()

	// Access token (short-lived)
	accessClaims := jwt.MapClaims{
		"sub":  userID,
		"role": role,
		"type": "access",
		"iat":  now.Unix(),
		"exp":  now.Add(h.accessTTL).Unix(),
	}
	access := jwt.NewWithClaims(jwt.SigningMethodHS256, accessClaims)
	accessToken, err = access.SignedString([]byte(h.jwtSecret))
	if err != nil {
		return
	}

	// Refresh token (long-lived)
	refreshClaims := jwt.MapClaims{
		"sub":  userID,
		"type": "refresh",
		"iat":  now.Unix(),
		"exp":  now.Add(h.refreshTTL).Unix(),
	}
	refresh := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err = refresh.SignedString([]byte(h.jwtSecret))
	return
}

func (h *AuthHandler) storeRefreshToken(userID, refreshToken string) error {
	ctx := context.Background()
	prefix := refreshToken[:min(32, len(refreshToken))]
	key := fmt.Sprintf("refresh:%s:%s", userID, prefix)
	return h.redis.Set(ctx, key, "1", h.refreshTTL).Err()
}

// isValidEmail validates email format using net/mail.ParseAddress (RFC 5322).
// BUG-06 fix: replaces weak contains('@') + contains('.') check that accepted
// malformed addresses like 'a@b.' or '@.com' as valid.
func isValidEmail(email string) bool {
	if email == "" {
		return false
	}
	_, err := mail.ParseAddress(email)
	return err == nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
