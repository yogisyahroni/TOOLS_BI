package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"datalens/internal/models"

	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

type WebhookWorker struct {
	db  *gorm.DB
	rdb *redis.Client
}

func NewWebhookWorker(db *gorm.DB, rdb *redis.Client) *WebhookWorker {
	return &WebhookWorker{db: db, rdb: rdb}
}

func (w *WebhookWorker) Start(ctx context.Context) {
	log.Info().Msg("Webhook Worker started")
	queueKey := "webhook:queue"

	for {
		select {
		case <-ctx.Done():
			log.Info().Msg("Webhook Worker stopping")
			return
		default:
			// BRPop blocks for 5 seconds waiting for an item
			result, err := w.rdb.BRPop(ctx, 5*time.Second, queueKey).Result()
			if err != nil {
				if err == redis.Nil {
					continue // timeout, continue listening
				}
				// If context is canceled during BRPop, it returns an error
				select {
				case <-ctx.Done():
					return
				default:
				}
				log.Error().Err(err).Msg("Failed to BRPop from redis")
				time.Sleep(1 * time.Second)
				continue
			}

			// result[0] is key, result[1] is the value
			payloadStr := result[1]
			w.processPayload(payloadStr)
		}
	}
}

func (w *WebhookWorker) processPayload(payloadStr string) {
	var msg struct {
		ConnID  string                   `json:"conn_id"`
		Payload []map[string]interface{} `json:"payload"`
	}

	if err := json.Unmarshal([]byte(payloadStr), &msg); err != nil {
		log.Error().Err(err).Msg("Webhook worker: invalid payload format")
		return
	}

	storageKey := fmt.Sprintf("WEBHOOK::%s", msg.ConnID)
	var ds models.Dataset
	if err := w.db.Where("storage_key = ?", storageKey).First(&ds).Error; err != nil {
		log.Error().Err(err).Str("conn_id", msg.ConnID).Msg("Webhook worker: dataset not found")
		return
	}

	var colDefs []models.ColumnDef
	if err := json.Unmarshal(ds.Columns, &colDefs); err != nil {
		log.Error().Err(err).Msg("Webhook worker: failed to parse columns")
		return
	}

	headers := make([]string, len(colDefs))
	for i, c := range colDefs {
		headers[i] = c.Name
	}

	strRows := make([][]string, 0, len(msg.Payload))
	for _, row := range msg.Payload {
		strRow := make([]string, len(headers))
		for i, h := range headers {
			if val, ok := row[h]; ok {
				strRow[i] = fmt.Sprintf("%v", val)
			} else {
				strRow[i] = ""
			}
		}
		strRows = append(strRows, strRow)
	}

	// Bulk insert
	if err := bulkInsertRows(w.db, ds.DataTableName, headers, strRows); err != nil {
		log.Error().Err(err).Msg("Webhook worker: failed to bulk insert")
		// To avoid infinite logging loop, we drop it. A robust system would put it in a DLQ.
		// w.rdb.LPush(context.Background(), "webhook:dlq", payloadStr)
		return
	}

	// Update dataset row count efficiently
	w.db.Model(&ds).Update("row_count", gorm.Expr("row_count + ?", len(msg.Payload)))
}
