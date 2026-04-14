package services_test

import (
	"testing"

	"neuradash/internal/models"
	"neuradash/internal/services"
)

type mockMailer struct {
	sentCount int
}

func (m *mockMailer) Send(to, subject, body string) error {
	m.sentCount++
	return nil
}

func TestNotificationService_SendToTargets(t *testing.T) {
	mailer := &mockMailer{}
	svc := services.NewNotificationService(mailer)

	targets := []models.NotificationTarget{
		{Name: "Email Target", Type: "email", Target: "test@example.com", Enabled: true},
		{Name: "Disabled Target", Type: "email", Target: "test2@example.com", Enabled: false},
	}

	errs := svc.SendToTargets(targets, "Test", "Msg")
	
	if len(errs) != 0 {
		t.Fatalf("Expected 0 errors, got %d", len(errs))
	}

	if mailer.sentCount != 1 {
		t.Errorf("Expected 1 mail to be sent (1 enabled, 1 disabled), got %d", mailer.sentCount)
	}
}
