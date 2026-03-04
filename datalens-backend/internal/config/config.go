package config

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration.
type Config struct {
	Server     ServerConfig
	DB         DatabaseConfig
	Redis      RedisConfig
	JWT        JWTConfig
	S3         S3Config
	AI         AIConfig
	Cron       CronConfig
	CORS       CORSConfig
	RateLimit  RateLimitConfig
	Encryption EncryptionConfig
}

type ServerConfig struct {
	Port string
	Env  string
}

type DatabaseConfig struct {
	URL            string
	MaxConnections int
	MaxIdle        int
}

type RedisConfig struct {
	URL string
}

type JWTConfig struct {
	Secret        string
	Expiry        time.Duration
	RefreshExpiry time.Duration
}

type S3Config struct {
	Endpoint  string
	AccessKey string
	SecretKey string
	Bucket    string
	UseSSL    bool
	Region    string
}

type AIConfig struct {
	Provider  string // openai, anthropic, openrouter, groq, deepseek
	APIKey    string
	Model     string
	MaxTokens int
	BaseURL   string
}

type CronConfig struct {
	Enabled  bool
	Timezone string
}

type CORSConfig struct {
	Origins []string
}

type RateLimitConfig struct {
	Max    int
	Window int // seconds
}

type EncryptionConfig struct {
	DBConnKey string // 32-byte AES-256 key for encrypting external DB passwords
}

// Load reads configuration from environment variables and .env file.
func Load() (*Config, error) {
	v := viper.New()

	// Defaults
	v.SetDefault("PORT", "8080")
	v.SetDefault("ENV", "development")
	v.SetDefault("DB_MAX_CONNECTIONS", 50)
	v.SetDefault("DB_MAX_IDLE", 10)
	v.SetDefault("JWT_EXPIRY", "15m")
	v.SetDefault("JWT_REFRESH_EXPIRY", "168h")
	v.SetDefault("S3_USE_SSL", false)
	v.SetDefault("S3_REGION", "us-east-1")
	v.SetDefault("AI_PROVIDER", "openai")
	v.SetDefault("AI_MODEL", "gpt-4o-mini")
	v.SetDefault("AI_MAX_TOKENS", 4096)
	v.SetDefault("CRON_ENABLED", true)
	v.SetDefault("CRON_TIMEZONE", "Asia/Jakarta")
	v.SetDefault("RATE_LIMIT_MAX", 100)
	v.SetDefault("RATE_LIMIT_WINDOW", 60)
	v.SetDefault("PIPELINE_MAX_CONCURRENT", 5)
	v.SetDefault("PIPELINE_NODE_TIMEOUT", 60)
	v.SetDefault("PIPELINE_MAX_ROWS", 1000000)

	// Read from .env file if present
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	_ = v.ReadInConfig() // not fatal if missing

	// Override with actual environment variables
	v.AutomaticEnv()

	// Parse durations
	accessExpiry, err := parseDuration(v.GetString("JWT_EXPIRY"), 15*time.Minute)
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_EXPIRY: %w", err)
	}

	refreshExpiry, err := parseDuration(v.GetString("JWT_REFRESH_EXPIRY"), 7*24*time.Hour)
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRY: %w", err)
	}

	// Parse CORS origins
	corsRaw := v.GetString("CORS_ORIGINS")
	var corsOrigins []string
	if corsRaw != "" {
		for _, o := range strings.Split(corsRaw, ",") {
			o = strings.TrimSpace(o)
			if o != "" {
				corsOrigins = append(corsOrigins, o)
			}
		}
	}
	if len(corsOrigins) == 0 {
		corsOrigins = []string{"http://localhost:5173", "http://localhost:3000"}
	}

	cfg := &Config{
		Server: ServerConfig{
			Port: v.GetString("PORT"),
			Env:  v.GetString("ENV"),
		},
		DB: DatabaseConfig{
			URL:            v.GetString("DATABASE_URL"),
			MaxConnections: v.GetInt("DB_MAX_CONNECTIONS"),
			MaxIdle:        v.GetInt("DB_MAX_IDLE"),
		},
		Redis: RedisConfig{
			URL: v.GetString("REDIS_URL"),
		},
		JWT: JWTConfig{
			Secret:        v.GetString("JWT_SECRET"),
			Expiry:        accessExpiry,
			RefreshExpiry: refreshExpiry,
		},
		S3: S3Config{
			Endpoint:  v.GetString("S3_ENDPOINT"),
			AccessKey: v.GetString("S3_ACCESS_KEY"),
			SecretKey: v.GetString("S3_SECRET_KEY"),
			Bucket:    v.GetString("S3_BUCKET"),
			UseSSL:    v.GetBool("S3_USE_SSL"),
			Region:    v.GetString("S3_REGION"),
		},
		AI: AIConfig{
			Provider:  v.GetString("AI_PROVIDER"),
			APIKey:    v.GetString("AI_API_KEY"),
			Model:     v.GetString("AI_MODEL"),
			MaxTokens: v.GetInt("AI_MAX_TOKENS"),
			BaseURL:   v.GetString("AI_BASE_URL"),
		},
		Cron: CronConfig{
			Enabled:  v.GetBool("CRON_ENABLED"),
			Timezone: v.GetString("CRON_TIMEZONE"),
		},
		CORS: CORSConfig{
			Origins: corsOrigins,
		},
		RateLimit: RateLimitConfig{
			Max:    v.GetInt("RATE_LIMIT_MAX"),
			Window: v.GetInt("RATE_LIMIT_WINDOW"),
		},
		Encryption: EncryptionConfig{
			DBConnKey: v.GetString("DB_CONN_ENCRYPTION_KEY"),
		},
	}

	return cfg, nil
}

func parseDuration(s string, def time.Duration) (time.Duration, error) {
	if s == "" {
		return def, nil
	}
	d, err := time.ParseDuration(s)
	if err != nil {
		return 0, err
	}
	return d, nil
}
