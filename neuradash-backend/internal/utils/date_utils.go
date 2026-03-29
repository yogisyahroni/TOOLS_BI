package utils

import (
	"time"
)

// IsDateLike checks if a string matches common date/time formats.
func IsDateLike(s string) bool {
	formats := []string{
		"2006-01-02", "01/02/2006", "02-01-2006", "2006/01/02",
		"2006-01-02 15:04:05", "2006-01-02 15:04:05.999",
		"2006-01-02T15:04:05Z07:00", "2006-01-02T15:04:05",
		"01/02/2006 15:04:05", "02-01-2006 15:04:05",
		"2006/01/02 15:04:05",
	}
	for _, f := range formats {
		if _, err := time.Parse(f, s); err == nil {
			return true
		}
	}
	return false
}
