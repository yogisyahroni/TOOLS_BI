package services

import (
	"fmt"
	"os"
	"time"
)

type Workspace struct {
	WorkspaceId string `json:"workspaceId"`
	Name        string `json:"name"`
}

type SourceDefinition struct {
	SourceDefinitionId string `json:"sourceDefinitionId"`
	Name               string `json:"name"`
	DockerRepository   string `json:"dockerRepository"`
	DockerImageTag     string `json:"dockerImageTag"`
	DocumentationUrl   string `json:"documentationUrl"`
	Icon               string `json:"icon"` // For UI
}

type ConnectionStatus struct {
	Status  string `json:"status"` // succeeded, failed, pending
	Message string `json:"message"`
}

type ActiveConnection struct {
	ConnectionId string    `json:"connectionId"`
	SourceId     string    `json:"sourceId"`
	SourceName   string    `json:"sourceName"`
	Status       string    `json:"status"` // active, inactive
	SyncStatus   string    `json:"syncStatus"`
	CreatedAt    time.Time `json:"createdAt"`
}

type AirbyteService struct {
	ApiUrl      string
	WorkspaceId string
	MockMode    bool
}

func NewAirbyteService() *AirbyteService {
	url := os.Getenv("AIRBYTE_API_URL") // Example: http://localhost:8000/api/v1

	return &AirbyteService{
		ApiUrl:   url,
		MockMode: url == "",
	}
}

// Generate Mock Data for Demos
func (s *AirbyteService) getMockSources() []SourceDefinition {
	return []SourceDefinition{
		{SourceDefinitionId: "postgres", Name: "PostgreSQL", DockerRepository: "airbyte/source-postgres", Icon: "Database"},
		{SourceDefinitionId: "mysql", Name: "MySQL", DockerRepository: "airbyte/source-mysql", Icon: "Database"},
		{SourceDefinitionId: "stripe", Name: "Stripe", DockerRepository: "airbyte/source-stripe", Icon: "CreditCard"},
		{SourceDefinitionId: "shopify", Name: "Shopify", DockerRepository: "airbyte/source-shopify", Icon: "ShoppingCart"},
		{SourceDefinitionId: "google-ads", Name: "Google Ads", DockerRepository: "airbyte/source-google-ads", Icon: "BarChart"},
		{SourceDefinitionId: "salesforce", Name: "Salesforce", DockerRepository: "airbyte/source-salesforce", Icon: "Cloud"},
		{SourceDefinitionId: "github", Name: "GitHub", DockerRepository: "airbyte/source-github", Icon: "Github"},
		{SourceDefinitionId: "hubspot", Name: "HubSpot", DockerRepository: "airbyte/source-hubspot", Icon: "Hexagon"},
	}
}

var mockActiveConnections = []ActiveConnection{}

func (s *AirbyteService) GetSourceDefinitions() ([]SourceDefinition, error) {
	if s.MockMode {
		return s.getMockSources(), nil
	}
	// TODO: HTTP Call to real Airbyte API
	return s.getMockSources(), nil
}

func (s *AirbyteService) GetActiveConnections() ([]ActiveConnection, error) {
	if s.MockMode {
		return mockActiveConnections, nil
	}
	return mockActiveConnections, nil
}

func (s *AirbyteService) SetupConnection(sourceId string, credentials map[string]interface{}) (*ActiveConnection, error) {
	if s.MockMode {
		// Mock setup delay
		time.Sleep(1 * time.Second)

		sources := s.getMockSources()
		var sourceName string
		for _, src := range sources {
			if src.SourceDefinitionId == sourceId {
				sourceName = src.Name
				break
			}
		}

		if sourceName == "" {
			return nil, fmt.Errorf("source definition not found")
		}

		conn := ActiveConnection{
			ConnectionId: fmt.Sprintf("conn-%d", time.Now().Unix()),
			SourceId:     sourceId,
			SourceName:   sourceName,
			Status:       "active",
			SyncStatus:   "succeeded",
			CreatedAt:    time.Now(),
		}

		mockActiveConnections = append(mockActiveConnections, conn)
		return &conn, nil
	}

	return nil, fmt.Errorf("not implemented for real api yet")
}

func (s *AirbyteService) TriggerSync(connectionId string) (*ConnectionStatus, error) {
	if s.MockMode {
		for i, conn := range mockActiveConnections {
			if conn.ConnectionId == connectionId {
				mockActiveConnections[i].SyncStatus = "syncing"

				// Simulate sync finishing after 5 seconds in a goroutine
				go func(idx int) {
					time.Sleep(5 * time.Second)
					if idx < len(mockActiveConnections) {
						mockActiveConnections[idx].SyncStatus = "succeeded"
					}
				}(i)

				return &ConnectionStatus{Status: "pending", Message: "Sync triggered"}, nil
			}
		}
		return nil, fmt.Errorf("connection not found")
	}
	return nil, fmt.Errorf("not implemented for real api yet")
}
