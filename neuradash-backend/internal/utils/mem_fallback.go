//go:build !windows && !linux

package utils

// GetSystemAvailableMemory returns a safe default for unknown operating systems.
func GetSystemAvailableMemory() uint64 {
	return 256
}
