package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"neuradash/internal/models"
)

// IntegrationService handles communication with dynamic third-party systems.
type IntegrationService struct {
	client *http.Client
}

// NewIntegrationService constructs a new IntegrationService.
func NewIntegrationService() *IntegrationService {
	return &IntegrationService{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// ExecuteConnector triggers a pre-configured integration.
// connector: The dynamic connector configuration from user settings.
// payload: Addition dynamic data to send to the system (e.g. from AI prescriptive logic).
func (s *IntegrationService) ExecuteConnector(ctx context.Context, connector models.IntegrationConnector, dynamicPayload map[string]interface{}) (interface{}, error) {
	if !connector.Enabled {
		return nil, fmt.Errorf("connector '%s' is disabled", connector.Name)
	}

	switch connector.Type {
	case "webhook":
		return s.executeWebhook(ctx, connector, dynamicPayload)
	case "sap", "odoo":
		// These would have specialized adapter logic in a full enterprise system.
		// For now, they follow a similar HTTP/JSON pattern.
		return s.executeWebhook(ctx, connector, dynamicPayload)
	default:
		return nil, fmt.Errorf("unsupported connector type: %s", connector.Type)
	}
}

func (s *IntegrationService) executeWebhook(ctx context.Context, connector models.IntegrationConnector, dynamicPayload map[string]interface{}) (interface{}, error) {
	url, ok := connector.Config["url"].(string)
	if !ok || url == "" {
		return nil, fmt.Errorf("invalid or missing URL in connector config")
	}

	method, _ := connector.Config["method"].(string)
	if method == "" {
		method = "POST"
	}

	// Merge static config body with dynamic AI payload
	finalBody := make(map[string]interface{})
	if staticBody, ok := connector.Config["body"].(map[string]interface{}); ok {
		for k, v := range staticBody {
			finalBody[k] = v
		}
	}
	for k, v := range dynamicPayload {
		finalBody[k] = v
	}

	jsonBody, _ := json.Marshal(finalBody)
	req, err := http.NewRequestWithContext(ctx, method, url, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if headers, ok := connector.Config["headers"].(map[string]interface{}); ok {
		for k, v := range headers {
			if val, ok := v.(string); ok {
				req.Header.Set(k, val)
			}
		}
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	
	var result interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return string(respBody), nil
	}

	if resp.StatusCode >= 400 {
		return result, fmt.Errorf("external system returned error status: %d", resp.StatusCode)
	}

	return result, nil
}
