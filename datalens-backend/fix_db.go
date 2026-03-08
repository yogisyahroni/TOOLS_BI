package main

import (
	"fmt"
	"log"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	dsn := "postgresql://postgres:Namakamu766!!@db.brxldmujfsnoygcufkmp.supabase.co:5432/postgres" // from .env
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to db: %v", err)
	}

	result := db.Exec("UPDATE dashboards SET embed_token = NULL WHERE embed_token = '';")
	if result.Error != nil {
		log.Fatalf("Failed to update: %v", result.Error)
	}

	fmt.Printf("Updated %d dashboard rows from empty string to NULL\n", result.RowsAffected)
	os.Exit(0)
}
