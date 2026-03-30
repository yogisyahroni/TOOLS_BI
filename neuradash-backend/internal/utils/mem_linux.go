//go:build linux

package utils

import (
	"bufio"
	"os"
	"strconv"
	"strings"
)

// GetSystemAvailableMemory returns the available physical memory in MB on Linux.
func GetSystemAvailableMemory() uint64 {
	f, err := os.Open("/proc/meminfo")
	if err == nil {
		defer f.Close()
		scanner := bufio.NewScanner(f)
		var memFree, buffers, cached uint64
		var memAvailableFound bool
		
		for scanner.Scan() {
			line := scanner.Text()
			if strings.HasPrefix(line, "MemAvailable:") {
				parts := strings.Fields(line)
				if len(parts) >= 2 {
					kib, err := strconv.ParseUint(parts[1], 10, 64)
					if err == nil {
						return kib / 1024
					}
				}
				memAvailableFound = true
			}
			
			if !memAvailableFound {
				if strings.HasPrefix(line, "MemFree:") {
					parts := strings.Fields(line)
					if len(parts) >= 2 {
						memFree, _ = strconv.ParseUint(parts[1], 10, 64)
					}
				} else if strings.HasPrefix(line, "Buffers:") {
					parts := strings.Fields(line)
					if len(parts) >= 2 {
						buffers, _ = strconv.ParseUint(parts[1], 10, 64)
					}
				} else if strings.HasPrefix(line, "Cached:") {
					parts := strings.Fields(line)
					if len(parts) >= 2 {
						cached, _ = strconv.ParseUint(parts[1], 10, 64)
					}
				}
			}
		}
		
		if !memAvailableFound && memFree > 0 {
			return (memFree + buffers + cached) / 1024
		}
	}
	return 256
}
