package email

import (
	"fmt"
	"net/smtp"
	"strings"
)

// Mailer is a simple interface for sending emails.
// Swap the concrete implementation for testing without hitting a real SMTP server.
type Mailer interface {
	Send(to, subject, body string) error
}

// SMTPMailer sends email via a standard SMTP server.
// BUG-09 fix: replaces the TODO placeholder in ForgotPassword with a real SMTP sender.
type SMTPMailer struct {
	host     string
	port     string
	username string
	password string
	from     string
}

// NewSMTPMailer creates a new SMTPMailer.
// If host is empty, returns a NoOpMailer that logs to stdout (safe for development).
func NewSMTPMailer(host, port, username, password, from string) Mailer {
	if host == "" {
		return &NoOpMailer{}
	}
	return &SMTPMailer{
		host:     host,
		port:     port,
		username: username,
		password: password,
		from:     from,
	}
}

// Send sends an email via SMTP with AUTH PLAIN.
func (m *SMTPMailer) Send(to, subject, body string) error {
	auth := smtp.PlainAuth("", m.username, m.password, m.host)

	msg := strings.Join([]string{
		"MIME-Version: 1.0",
		"Content-Type: text/html; charset=\"UTF-8\"",
		fmt.Sprintf("From: DataLens <%s>", m.from),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"",
		body,
	}, "\r\n")

	addr := fmt.Sprintf("%s:%s", m.host, m.port)
	return smtp.SendMail(addr, auth, m.from, []string{to}, []byte(msg))
}

// ResetPasswordEmail returns the HTML body for the password reset email.
func ResetPasswordEmail(resetURL string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:12px;padding:40px;border:1px solid #334155;">
    <h1 style="color:#6366f1;margin:0 0 8px 0;font-size:24px;">DataLens</h1>
    <h2 style="margin:0 0 24px 0;font-size:18px;font-weight:600;">Reset your password</h2>
    <p style="margin:0 0 24px 0;color:#94a3b8;line-height:1.6;">
      You requested a password reset. Click the button below to create a new password.
      This link expires in 1 hour.
    </p>
    <a href="%s"
       style="display:inline-block;background:#6366f1;color:#fff;font-weight:600;padding:12px 28px;
              border-radius:8px;text-decoration:none;font-size:15px;">
      Reset Password
    </a>
    <p style="margin:24px 0 0 0;color:#64748b;font-size:13px;">
      If you did not request this, you can safely ignore this email.<br>
      The link will expire in 1 hour.
    </p>
    <hr style="border:none;border-top:1px solid #334155;margin:24px 0 0 0;">
    <p style="margin:16px 0 0 0;color:#475569;font-size:12px;">
      &copy; 2025 DataLens. All rights reserved.
    </p>
  </div>
</body>
</html>`, resetURL)
}

// WelcomeEmail returns a simple welcome email body.
func WelcomeEmail(displayName string) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<body style="font-family:Inter,Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:12px;padding:40px;border:1px solid #334155;">
    <h1 style="color:#6366f1;margin:0 0 8px 0;font-size:24px;">DataLens</h1>
    <h2 style="margin:0 0 24px 0;font-size:18px;font-weight:600;">Welcome, %s! 🎉</h2>
    <p style="color:#94a3b8;line-height:1.6;">
      Your DataLens account is ready. Upload your first dataset and start building
      beautiful dashboards in minutes.
    </p>
    <a href="https://app.datalens.io/dashboard"
       style="display:inline-block;background:#6366f1;color:#fff;font-weight:600;padding:12px 28px;
              border-radius:8px;text-decoration:none;font-size:15px;margin-top:24px;">
      Go to Dashboard
    </a>
  </div>
</body>
</html>`, displayName)
}

// NoOpMailer is a no-op mailer for development environments.
// It prints emails to stdout instead of sending them.
type NoOpMailer struct{}

func (n *NoOpMailer) Send(to, subject, body string) error {
	fmt.Printf("[DEV MAIL] To: %s | Subject: %s\n", to, subject)
	return nil
}
