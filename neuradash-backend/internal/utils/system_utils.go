package utils

import (
	"bufio"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

// MemoryStatusEx structure for Windows memory status.
type memoryStatusEx struct {
	dwLength                uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

// GetSystemAvailableMemory returns the total AVAILABLE physical memory in MB.
// It supports Windows (via kernel32/GlobalMemoryStatusEx) and Linux (via /proc/meminfo).
func GetSystemAvailableMemory() uint64 {
	if runtime.GOOS == "windows" {
		kernel32 := syscall.NewLazyDLL("kernel32.dll")
		globalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")
		var ms memoryStatusEx
		ms.dwLength = uint32(unsafe.Sizeof(ms))
		r, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms)))
		if r != 0 {
			// USES Available Physical RAM instead of Total
			return ms.ullAvailPhys / 1024 / 1024
		}
	} else if runtime.GOOS == "linux" {
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
				
				// Fallback for older Linux kernels without MemAvailable
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
	}

	// Default fallback if detection fails
	return 256
}
