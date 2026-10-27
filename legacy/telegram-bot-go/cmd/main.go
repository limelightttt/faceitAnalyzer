package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"bot/faceit"
	"bot/webhook"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/joho/godotenv"
)

func main() {
	// Загружаем .env (локально)
	_ = godotenv.Load("../.env")

	// Telegram токен
	botToken := os.Getenv("TELEGRAM_BOT_TOKEN")
	if botToken == "" {
		log.Fatal("❌ TELEGRAM_BOT_TOKEN не найден")
	}

	// PORT для Render
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Запуск HTTP сервера (webhook + oauth)
	webhook.StartWebhookServer(":"+port, func(demoID string) {
		log.Printf("📩 Webhook DEMO_READY: %s (demo-downloads disabled)", demoID)
	})

	// Telegram Bot API
	bot, err := tgbotapi.NewBotAPI(botToken)
	if err != nil {
		log.Panicf("❌ Ошибка инициализации бота: %v", err)
	}
	log.Printf("🤖 Авторизован как %s", bot.Self.UserName)

	u := tgbotapi.NewUpdate(0)
	u.Timeout = 60
	updates := bot.GetUpdatesChan(u)

	fc := faceit.NewFaceitClient()

	for update := range updates {
		if update.Message == nil {
			continue
		}
		chatID := update.Message.Chat.ID
		text := strings.TrimSpace(update.Message.Text)

		switch {
		case strings.HasPrefix(text, "/start"):
			msg := "Привет!\nКоманды:\n" +
				"/auth — привязать FACEIT аккаунт (OAuth)\n" +
				"/collect <nick> [n] — собрать последние n матчей\n" +
				"/analyze <nick> [n] — проанализировать сохранённые n матчей"
			bot.Send(tgbotapi.NewMessage(chatID, msg))

		case strings.HasPrefix(text, "/auth"):
			clientID := os.Getenv("FACEIT_CLIENT_ID")
			redirect := os.Getenv("FACEIT_REDIRECT_URI")

			if clientID == "" || redirect == "" {
				bot.Send(tgbotapi.NewMessage(chatID, "❌ FACEIT_CLIENT_ID или FACEIT_REDIRECT_URI не заданы"))
				continue
			}

			authURL := fmt.Sprintf(
				"https://api.faceit.com/auth/v1/oauth/authorize?client_id=%s&response_type=code&redirect_uri=%s&state=%d",
				clientID, redirect, chatID,
			)

			bot.Send(tgbotapi.NewMessage(chatID, "🔗 Авторизация FACEIT:\n"+authURL))

		case strings.HasPrefix(text, "/collect"):
			parts := strings.Fields(text)
			if len(parts) < 2 {
				bot.Send(tgbotapi.NewMessage(chatID, "❌ Использование: /collect <ник> [кол-во]"))
				continue
			}

			nick := parts[1]
			count := 20
			if len(parts) >= 3 {
				if v, err := strconv.Atoi(parts[2]); err == nil && v > 0 {
					count = v
				}
			}

			bot.Send(tgbotapi.NewMessage(chatID, fmt.Sprintf("⏳ Собираю последние %d матчей для %s...", count, nick)))
			go func(chat int64, nickname string, cnt int) {
				tok, _ := webhook.LoadToken(chat)
				bearer := ""
				if tok != nil {
					bearer = tok.AccessToken
				}
				path, err := fc.FetchAndStoreMatches(nickname, cnt, bearer)
				if err != nil {
					bot.Send(tgbotapi.NewMessage(chat, "❌ Ошибка: "+err.Error()))
					return
				}
				bot.Send(tgbotapi.NewMessage(chat, "✅ Сохранено в "+path))
			}(chatID, nick, count)

		case strings.HasPrefix(text, "/analyze"):
			parts := strings.Fields(text)
			if len(parts) < 2 {
				bot.Send(tgbotapi.NewMessage(chatID, "❌ Использование: /analyze <ник> [кол-во]"))
				continue
			}

			nick := parts[1]
			count := 10
			if len(parts) >= 3 {
				if v, err := strconv.Atoi(parts[2]); err == nil && v > 0 {
					count = v
				}
			}

			bot.Send(tgbotapi.NewMessage(chatID, fmt.Sprintf("🔎 Анализирую %s...", nick)))
			go func(chat int64, nickname string, cnt int) {
				tok, _ := webhook.LoadToken(chat)
				bearer := ""
				if tok != nil {
					bearer = tok.AccessToken
				}
				agg, report, err := fc.AnalyzeStoredMatches(nickname, cnt, bearer)
				if err != nil {
					bot.Send(tgbotapi.NewMessage(chat, "❌ Ошибка анализа: "+err.Error()))
					return
				}
				sendLong(bot, chat, report)
				if bytes, err := json.MarshalIndent(agg, "", "  "); err == nil {
					file := tgbotapi.FileBytes{Name: fmt.Sprintf("%s_report.json", nickname), Bytes: bytes}
					msg := tgbotapi.NewDocument(chat, file)
					bot.Send(msg)
				}
			}(chatID, nick, count)
		}
	}
}

func sendLong(bot *tgbotapi.BotAPI, chat int64, text string) {
	for i := 0; i < len(text); i += 3500 {
		end := i + 3500
		if end > len(text) {
			end = len(text)
		}
		bot.Send(tgbotapi.NewMessage(chat, text[i:end]))
	}
}
