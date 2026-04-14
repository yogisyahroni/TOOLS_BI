package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"neuradash/internal/email"
	"neuradash/internal/models"
)

// NotificationService handles multi-channel communication (WA, Telegram, Email).
type NotificationService struct {
	mailer email.Mailer
	client *http.Client
}

func NewNotificationService(mailer email.Mailer) *NotificationService {
	return &NotificationService{
		mailer: mailer,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

// SendToTargets sends a notification message to multiple dynamic targets using provided credentials.
func (s *NotificationService) SendToTargets(targets []models.NotificationTarget, tgToken, waInstance, waToken, subject, message string) []error {
	var errs []error

	for _, t := range targets {
		if !t.Enabled {
			continue
		}

		var err error
		switch t.Type {
		case "email":
			err = s.SendEmail(context.Background(), t.Target, subject, message)
		case "telegram":
			err = s.SendTelegram(context.Background(), tgToken, t.Target, message)
		case "whatsapp":
			err = s.SendWhatsApp(context.Background(), waInstance, waToken, t.Target, message)
		default:
			err = fmt.Errorf("unknown notification type: %s", t.Type)
		}

		if err != nil {
			errs = append(errs, fmt.Errorf("failed to send to %s (%s): %w", t.Name, t.Type, err))
		}
	}

	return errs
}

// SendTelegram sends a message via Telegram Bot API using a dynamic or system token.
func (s *NotificationService) SendTelegram(ctx context.Context, token, chatID, message string) error {
	if chatID == "" {
		chatID = os.Getenv("TELEGRAM_SYSTEM_CHAT_ID")
	}
	if chatID == "" {
		return fmt.Errorf("missing telegram chat id")
	}

	// Use provided token, fallback to env
	if token == "" {
		token = os.Getenv("TELEGRAM_BOT_TOKEN")
	}
	if token == "" {
		token = "YOUR_TELEGRAM_BOT_TOKEN" // Default placeholder
	}

	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token)
	payload := map[string]string{
		"chat_id": chatID,
		"text":    message,
	}

	body, _ := json.Marshal(payload)
	resp, err := s.client.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("telegram api error: status %d", resp.StatusCode)
	}

	return nil
}

// SendWhatsApp sends a message via dynamic credentials for Green-API or similar.
func (s *NotificationService) SendWhatsApp(ctx context.Context, instanceID, token, phone, message string) error {
	if phone == "" {
		phone = os.Getenv("WHATSAPP_SYSTEM_PHONE")
	}
	if phone == "" {
		return fmt.Errorf("missing whatsapp phone number")
	}

	if instanceID == "" || token == "" {
		// Simulation fallback if not configured
		fmt.Printf("[WA SIMULATION] To: %s | Message: %s\n", phone, message)
		return nil
	}
	
	// Example implementation for Green-API
	url := fmt.Sprintf("https://api.green-api.com/waInstance%s/sendMessage/%s", instanceID, token)
	payload := map[string]interface{}{
		"chatId":  fmt.Sprintf("%s@c.us", phone),
		"message": message,
	}
	
	body, _ := json.Marshal(payload)
	resp, err := s.client.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("whatsapp api error: status %d", resp.StatusCode)
	}
	
	return nil
}

func (s *NotificationService) SendEmail(ctx context.Context, to, subject, body string) error {
	return s.mailer.Send(to, subject, body)
}

func (s *NotificationService) GenerateCausalReportEmail(analysis, dashboardURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:40px 20px;">
  <div style="max-width:600px;margin:0 auto;background:#1e293b;border-radius:12px;padding:40px;border:1px solid #334155;">
    <h1 style="color:#6366f1;margin:0 0 8px 0;font-size:24px;">NeuraDash AI</h1>
    <h2 style="margin:0 0 24px 0;font-size:18px;font-weight:600;color:#10b981;">⚠️ Autonomous Causal Analysis Result</h2>
    <div style="background:#0f172a;border-radius:8px;padding:20px;margin-bottom:24px;border-left:4px solid #6366f1;">
      <p style="margin:0;line-height:1.6;white-space:pre-wrap;">%s</p>
    </div>
    <a href="%s"
       style="display:inline-block;background:#6366f1;color:#fff;font-weight:600;padding:12px 28px;
              border-radius:8px;text-decoration:none;font-size:15px;">
      View Full Insights
    </a>
    <hr style="border:none;border-top:1px solid #334155;margin:32px 0 16px 0;">
    <p style="margin:0;color:#64748b;font-size:12px;">
      Generated automatically by NeuraDash Sentinel. 
    </p>
  </div>
</body>
</html>`, analysis, dashboardURL)
}
