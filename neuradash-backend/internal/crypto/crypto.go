// Package crypto provides AES-256-GCM encryption/decryption utilities.
// Used to encrypt sensitive per-user credentials (e.g., AI API keys) before
// storing them in the database. The raw key never leaves the server.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

// ErrInvalidKey is returned when the provided key cannot be used as AES-256.
var ErrInvalidKey = errors.New("crypto: encryption key must not be empty")

// ErrInvalidCiphertext is returned when decryption fails due to tampered/malformed data.
var ErrInvalidCiphertext = errors.New("crypto: invalid or corrupted ciphertext")

// deriveKey converts any string into a 32-byte AES-256 key using SHA-256.
// This allows keys of any length to be used safely.
func deriveKey(secret string) []byte {
	hash := sha256.Sum256([]byte(secret))
	return hash[:]
}

// Encrypt encrypts plaintext using AES-256-GCM with a random 12-byte nonce.
// Returns base64url-encoded ciphertext: nonce(12) || ciphertext || tag(16).
// The nonce is prepended so Decrypt can extract it without a separate field.
func Encrypt(plaintext, secret string) (string, error) {
	if secret == "" {
		return "", ErrInvalidKey
	}

	key := deriveKey(secret)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	// Generate cryptographically random nonce (12 bytes for GCM standard)
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	// Seal appends ciphertext + 16-byte GCM auth tag to nonce
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

	// Encode as base64url for safe storage in text columns
	return base64.URLEncoding.EncodeToString(ciphertext), nil
}

// Decrypt decrypts a base64url-encoded AES-256-GCM ciphertext produced by Encrypt.
// Returns the original plaintext string.
func Decrypt(encoded, secret string) (string, error) {
	if secret == "" {
		return "", ErrInvalidKey
	}

	ciphertext, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		return "", ErrInvalidCiphertext
	}

	key := deriveKey(secret)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", ErrInvalidCiphertext
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		// GCM Open fails if data is tampered — return generic error
		return "", ErrInvalidCiphertext
	}

	return string(plaintext), nil
}
