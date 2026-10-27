package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Cloudflare DNS-over-HTTPS endpoint
const dohURL = "https://cloudflare-dns.com/dns-query"

// resolveViaDoH делает DNS-запрос через HTTPS (Cloudflare)
func resolveViaDoH(host string) (string, error) {
	req, _ := http.NewRequestWithContext(context.Background(), "GET", dohURL, nil)
	q := req.URL.Query()
	q.Add("name", host)
	q.Add("type", "A")
	req.URL.RawQuery = q.Encode()
	req.Header.Set("Accept", "application/dns-json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("ошибка запроса DoH: %v", err)
	}
	defer resp.Body.Close()

	var data struct {
		Answer []struct {
			Data string `json:"data"`
		} `json:"Answer"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", fmt.Errorf("ошибка декодирования DoH: %v", err)
	}

	if len(data.Answer) == 0 {
		return "", fmt.Errorf("нет DNS ответа для %s", host)
	}
	return data.Answer[0].Data, nil
}

// StartProxyServer запускает локальный HTTP-прокси для скачивания демок Faceit.
func StartProxyServer() {
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/", handleProxy)

		server := &http.Server{
			Addr:              ":8081",
			Handler:           mux,
			ReadHeaderTimeout: 5 * time.Second,
		}

		log.Println("🛰️ Прокси-сервер (с Cloudflare DoH) запущен на :8081")

		if err := server.ListenAndServe(); err != nil {
			log.Println("❌ Ошибка запуска прокси:", err)
		}
	}()
}

// handleProxy — обработчик запросов. Проксирует файлы CDN Faceit.
func handleProxy(w http.ResponseWriter, r *http.Request) {
	targetURL := r.URL.Query().Get("url")
	if targetURL == "" {
		http.Error(w, "❌ Не указан параметр ?url", http.StatusBadRequest)
		return
	}

	if !strings.HasPrefix(targetURL, "http") {
		http.Error(w, "❌ Неверный URL", http.StatusBadRequest)
		return
	}

	log.Println("🚀 Прокси-запрос →", targetURL)

	parsedURL, err := url.Parse(targetURL)
	if err != nil {
		http.Error(w, fmt.Sprintf("❌ Ошибка URL: %s", err.Error()), http.StatusBadRequest)
		return
	}

	// 🌐 Принудительно резолвим через Cloudflare DoH
	hostIP, err := resolveViaDoH(parsedURL.Hostname())
	if err != nil {
		http.Error(w, "❌ Ошибка DNS (DoH): "+err.Error(), http.StatusBadGateway)
		return
	}
	log.Printf("✅ Резолв через DoH: %s → %s", parsedURL.Hostname(), hostIP)

	// Собираем запрос к IP напрямую
	req, err := http.NewRequest("GET", parsedURL.String(), nil)
	if err != nil {
		http.Error(w, "❌ Ошибка создания запроса: "+err.Error(), http.StatusInternalServerError)
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")
	req.Header.Set("Referer", "https://www.faceit.com/")
	req.Header.Set("Accept", "*/*")

	// Принудительно используем IP (а не домен)
	req.URL.Host = net.JoinHostPort(hostIP, "443")
	req.Host = parsedURL.Host

	client := &http.Client{
		Timeout: 60 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:     nil,
			DisableCompression:  false,
			MaxIdleConns:        10,
			MaxConnsPerHost:     10,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     30 * time.Second,
			// Принудительно указываем IP-адрес как endpoint
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, "tcp", net.JoinHostPort(hostIP, "443"))
			},
		},
	}

	resp, err := client.Do(req)
	if err != nil {
		log.Printf("❌ Ошибка при скачивании через прокси: %v", err)
		http.Error(w, "Ошибка при обращении к CDN через DoH", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for key, values := range resp.Header {
		for _, v := range values {
			w.Header().Add(key, v)
		}
	}

	w.WriteHeader(resp.StatusCode)
	if _, err := io.Copy(w, resp.Body); err != nil {
		log.Printf("⚠️ Ошибка при копировании тела: %v", err)
	}
}
