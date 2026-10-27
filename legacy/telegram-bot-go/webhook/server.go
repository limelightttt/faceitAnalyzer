package webhook

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Структура события Faceit webhook DEMO_READY
type DemoReadyEvent struct {
	Event   string `json:"event"`
	Payload struct {
		DemoID  string `json:"demo_id"`
		MatchID string `json:"match_id"`
	} `json:"payload"`
}

// OAuth токен
type OAuthToken struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token,omitempty"`
	ExpiresIn    int    `json:"expires_in,omitempty"`
	TokenType    string `json:"token_type,omitempty"`
}

// Сохранение токена в data/tokens/{userID}.json
func SaveToken(userID int64, token OAuthToken) error {
	dir := "data/tokens"
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	path := filepath.Join(dir, fmt.Sprintf("%d.json", userID))
	return os.WriteFile(path, mustJSON(token), 0644)
}

// Загрузка токена
func LoadToken(userID int64) (*OAuthToken, error) {
	path := filepath.Join("data/tokens", fmt.Sprintf("%d.json", userID))
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var t OAuthToken
	if err := json.Unmarshal(b, &t); err != nil {
		return nil, err
	}
	return &t, nil
}

// Запуск Webhook + OAuth Callback сервера
func StartWebhookServer(addr string, demoHandler func(demoID string)) {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "✅ Faceit Analyzer is running on Render.")
	})

	http.HandleFunc("/webhook", func(w http.ResponseWriter, r *http.Request) {
		var evt DemoReadyEvent
		if err := json.NewDecoder(r.Body).Decode(&evt); err != nil {
			http.Error(w, "bad request", 400)
			return
		}
		log.Println("📩 Получено событие:", evt.Event, "для демки", evt.Payload.DemoID)
		if evt.Event == "DEMO_READY" {
			go demoHandler(evt.Payload.DemoID)
		}
		w.WriteHeader(200)
	})

	http.HandleFunc("/oauth/callback", func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")
		if code == "" || state == "" {
			http.Error(w, "missing code or state", 400)
			return
		}

		var chatID int64
		fmt.Sscanf(state, "%d", &chatID)

		log.Printf("➡️ Callback вызван: code=%s | state=%s", code, state)

		token, err := exchangeCodeForToken(code)
		if err != nil {
			body, _ := io.ReadAll(r.Body)
			log.Printf("❌ Ошибка обмена токена: %v | code=%s | body=%s", err, code, string(body))
			http.Error(w, "failed token exchange: "+err.Error(), 500)
			return
		}

		if err := SaveToken(chatID, *token); err != nil {
			http.Error(w, "failed save token: "+err.Error(), 500)
			return
		}

		fmt.Fprintf(w, "✅ Авторизация через FACEIT успешна! Можешь возвращаться в Telegram.")
		log.Printf("🎟️ FACEIT токен сохранён для чата %d", chatID)
	})

	// ✅ Автоматическое определение порта (Render задаёт $PORT)
	port := os.Getenv("PORT")
	if port == "" {
		port = strings.TrimPrefix(addr, ":")
		if port == "" {
			port = "8080"
		}
	}
	fullAddr := ":" + port

	log.Println("🌍 Webhook+OAuth сервер запущен на", fullAddr)
	go func() {
		if err := http.ListenAndServe(fullAddr, nil); err != nil {
			log.Fatalf("webhook server failed: %v", err)
		}
	}()
}

// Обмен кода на токен
func exchangeCodeForToken(code string) (*OAuthToken, error) {
	clientID := os.Getenv("FACEIT_CLIENT_ID")
	clientSecret := os.Getenv("FACEIT_CLIENT_SECRET")
	redirectURI := os.Getenv("FACEIT_REDIRECT_URI")

	form := fmt.Sprintf(
		"grant_type=authorization_code&code=%s&client_id=%s&client_secret=%s&redirect_uri=%s",
		code, clientID, clientSecret, redirectURI,
	)

	req, _ := http.NewRequest("POST", "https://api.faceit.com/auth/v1/oauth/token", strings.NewReader(form))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http error: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("token exchange failed (%d): %s", resp.StatusCode, string(body))
	}

	var token OAuthToken
	if err := json.Unmarshal(body, &token); err != nil {
		return nil, fmt.Errorf("unmarshal error: %v - body: %s", err, string(body))
	}
	return &token, nil
}

func mustJSON(v interface{}) []byte {
	b, _ := json.MarshalIndent(v, "", "  ")
	return b
}
