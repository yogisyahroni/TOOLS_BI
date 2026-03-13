//go:build ignore

package main

import (
	"fmt"
	"os"

	"github.com/99designs/gqlgen/api"
	"github.com/99designs/gqlgen/config"
)

func main() {
	cfg, err := config.LoadConfigFromDefaultLocations()
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to load config:", err)
		os.Exit(2)
	}
	err = api.Generate(cfg)
	if err != nil {
		fmt.Fprintln(os.Stderr, "code generation failed:", err)
		os.Exit(3)
	}
}
