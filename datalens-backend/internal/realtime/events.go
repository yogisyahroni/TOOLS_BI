package realtime

// Event type constants for WebSocket messages.
const (
	EventDataRefresh       = "data_refresh"
	EventAlertTriggered    = "alert_triggered"
	EventETLComplete       = "etl_complete"
	EventReportReady       = "report_ready"
	EventKPIUpdate         = "kpi_update"
	EventPipelineStarted   = "pipeline_started"
	EventPipelineProgress  = "pipeline_progress"
	EventPipelineCompleted = "pipeline_completed"
	EventPipelineError     = "pipeline_error"
)

// DataRefreshPayload is pushed when a dataset is refreshed.
type DataRefreshPayload struct {
	DatasetID string `json:"datasetId"`
	Status    string `json:"status"` // completed, error
	RowCount  int    `json:"rowCount,omitempty"`
}

// AlertTriggeredPayload is pushed when an alert fires.
type AlertTriggeredPayload struct {
	AlertID   string  `json:"alertId"`
	AlertName string  `json:"alertName"`
	Message   string  `json:"message"`
	Value     float64 `json:"value"`
	Threshold float64 `json:"threshold"`
}

// PipelineProgressPayload tracks visual ETL node execution.
type PipelineProgressPayload struct {
	PipelineID string `json:"pipelineId"`
	NodeID     string `json:"nodeId"`
	Status     string `json:"status"` // done, error
	Rows       int    `json:"rows,omitempty"`
	Error      string `json:"error,omitempty"`
}
