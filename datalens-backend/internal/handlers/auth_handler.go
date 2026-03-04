package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"datalens/internal/middleware"
	"datalens/internal/models"

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
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(db *gorm.DB, rdb *redis.Client, secret string, access, refresh time.Duration) *AuthHandler {
	return &AuthHandler{
		db:         db,
		redis:      rdb,
		jwtSecret:  secret,
		accessTTL:  access,
		refreshTTL: refresh,
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

	return c.JSON(fiber.Map{
		"user":         userRecord,
		"accessToken":  accessToken,
		"refreshToken": refreshToken,
	})
}

// Refresh issues a new access token using a valid refresh token.
// POST /api/v1/auth/refresh
func (h *AuthHandler) Refresh(c *fiber.Ctx) error {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := c.BodyParser(&body); err != nil || body.RefreshToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "refresh_token required"})
	}

	token, err := jwt.Parse(body.RefreshToken, func(t *jwt.Token) (interface{}, error) {
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
	storedKey := fmt.Sprintf("refresh:%s:%s", userID, body.RefreshToken[:min(32, len(body.RefreshToken))])
	if exists, err := h.redis.Exists(ctx, storedKey).Result(); err != nil || exists == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Refresh token revoked"})
	}

	// Fetch user to get current role (may have changed)
	var userRecord models.User
	if err := h.db.First(&userRecord, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "User not found"})
	}

	accessToken, _, err := h.generateTokenPair(userRecord.ID, userRecord.Role)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate token"})
	}

	return c.JSON(fiber.Map{
		"accessToken": accessToken,
	})
}

// Logout invalidates the refresh token.
// POST /api/v1/auth/logout
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	_ = c.BodyParser(&body)

	if body.RefreshToken != "" {
		userID := middleware.GetUserID(c)
		ctx := context.Background()
		storedKey := fmt.Sprintf("refresh:%s:%s", userID, body.RefreshToken[:min(32, len(body.RefreshToken))])
		h.redis.Del(ctx, storedKey)
	}

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
		// Generate reset token
		resetToken := uuid.New().String()
		ctx := context.Background()
		key := fmt.Sprintf("reset:%s", resetToken)
		h.redis.Set(ctx, key, userRecord.ID, time.Hour)

		// In production, send email here. For now log the token.
		// TODO: integrate SMTP sender
		_ = resetToken
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

func isValidEmail(email string) bool {
	return strings.Contains(email, "@") && strings.Contains(email, ".")
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
