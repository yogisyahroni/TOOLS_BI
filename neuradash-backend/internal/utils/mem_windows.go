//go:build windows

package utils

import (
	"syscall"
	"unsafe"
)

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

// GetSystemAvailableMemory returns the available physical memory in MB on Windows.
func GetSystemAvailableMemory() uint64 {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")
	var ms memoryStatusEx
	ms.dwLength = uint32(unsafe.Sizeof(ms))
	r, _, _ := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&ms)))
	if r != 0 {
		return ms.ullAvailPhys / 1024 / 1024
	}
	return 256
}
