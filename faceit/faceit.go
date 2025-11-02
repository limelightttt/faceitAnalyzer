package faceit

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ---------------- Types ----------------

type FaceitClient struct {
	APIKey     string
	httpClient *http.Client
}

type StoredMatch struct {
	MatchID string                 `json:"match_id"`
	Map     string                 `json:"map,omitempty"`
	Result  string                 `json:"result,omitempty"`
	Raw     map[string]interface{} `json:"raw,omitempty"`
	When    time.Time              `json:"when,omitempty"`
}

type AggregateReport struct {
	Player          string   `json:"player"`
	MatchesAnalyzed int      `json:"matches_analyzed"`
	TotalKills      float64  `json:"total_kills"`
	TotalDeaths     float64  `json:"total_deaths"`
	AvgKD           float64  `json:"avg_kd"`
	AvgHS           float64  `json:"avg_hs"`
	EntryKills      float64  `json:"entry_kills"`
	EntryDeaths     float64  `json:"entry_deaths"`
	WinRate         float64  `json:"win_rate"`
	Notes           []string `json:"notes"`
}

// ---------------- Constructor & util ----------------

func NewFaceitClient() *FaceitClient {
	apiKey := os.Getenv("FACEIT_API_KEY") // optional developer key
	return &FaceitClient{
		APIKey: apiKey,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

// doGetWithToken: если bearer != "" — используется он, иначе используется fc.APIKey (если есть)
func (fc *FaceitClient) doGetWithToken(bearer string, url string, target interface{}) error {
	req, _ := http.NewRequest("GET", url, nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	} else if fc.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+fc.APIKey)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := fc.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("HTTP request error: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("api error (%d): %s", resp.StatusCode, string(body))
	}
	if target != nil {
		if err := json.Unmarshal(body, target); err != nil {
			return fmt.Errorf("json unmarshal error: %v - body: %s", err, string(body))
		}
	}
	return nil
}

// ---------------- Basic API wrappers (player, history, stats) ----------------

func (fc *FaceitClient) GetPlayerIDByNickname(nickname string, bearer string) (string, error) {
	url := fmt.Sprintf("https://open.faceit.com/data/v4/players?nickname=%s", nickname)
	var out struct {
		PlayerID string `json:"player_id"`
	}
	if err := fc.doGetWithToken(bearer, url, &out); err != nil {
		return "", fmt.Errorf("GetPlayerID error: %v", err)
	}
	if out.PlayerID == "" {
		return "", fmt.Errorf("player %s not found", nickname)
	}
	return out.PlayerID, nil
}

func (fc *FaceitClient) GetLastMatches(playerID string, limit int, bearer string) ([]string, error) {
	url := fmt.Sprintf("https://open.faceit.com/data/v4/players/%s/history?game=cs2&limit=%d", playerID, limit)
	var out struct {
		Items []struct {
			MatchID string `json:"match_id"`
		} `json:"items"`
	}
	if err := fc.doGetWithToken(bearer, url, &out); err != nil {
		return nil, fmt.Errorf("GetLastMatches error: %v", err)
	}
	if len(out.Items) == 0 {
		return nil, fmt.Errorf("no matches found for player %s", playerID)
	}
	res := make([]string, 0, len(out.Items))
	for _, it := range out.Items {
		if it.MatchID != "" {
			res = append(res, it.MatchID)
		}
	}
	return res, nil
}

func (fc *FaceitClient) GetMatchStats(matchID string, bearer string) (map[string]interface{}, error) {
	url := fmt.Sprintf("https://open.faceit.com/data/v4/matches/%s/stats", matchID)
	var out map[string]interface{}
	if err := fc.doGetWithToken(bearer, url, &out); err != nil {
		return nil, fmt.Errorf("GetMatchStats error: %v", err)
	}
	return out, nil
}

// ---------------- Storage: fetch matches and save JSON ----------------

// FetchAndStoreMatches: получает последние `limit` матчей игрока и сохраняет в data/<nickname>.json
// bearer — опциональный токен пользователя; если пустой — используется developer key (если он есть)
func (fc *FaceitClient) FetchAndStoreMatches(nickname string, limit int, bearer string) (string, error) {
	if limit <= 0 {
		limit = 20
	}
	playerID, err := fc.GetPlayerIDByNickname(nickname, bearer)
	if err != nil {
		return "", err
	}
	matchIDs, err := fc.GetLastMatches(playerID, limit, bearer)
	if err != nil {
		return "", err
	}

	dataDir := "data"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return "", fmt.Errorf("cannot create data dir: %v", err)
	}

	stored := []StoredMatch{}
	for _, mid := range matchIDs {
		stats, err := fc.GetMatchStats(mid, bearer)
		if err != nil {
			log.Printf("⚠️ Warning: can't fetch stats for %s: %v", mid, err)
			stored = append(stored, StoredMatch{
				MatchID: mid,
				When:    time.Now(),
				Raw:     nil,
			})
			continue
		}

		mapName := ""
		result := ""
		if rounds, ok := stats["rounds"].([]interface{}); ok && len(rounds) > 0 {
			if r0, ok := rounds[0].(map[string]interface{}); ok {
				if rs, ok := r0["round_stats"].(map[string]interface{}); ok {
					if m, ok := rs["Map"]; ok {
						mapName = fmt.Sprintf("%v", m)
					}
				}
			}
		}
		stored = append(stored, StoredMatch{
			MatchID: mid,
			Map:     mapName,
			Result:  result,
			Raw:     stats,
			When:    time.Now(),
		})
		time.Sleep(300 * time.Millisecond)
	}

	outPath := filepath.Join(dataDir, fmt.Sprintf("%s.json", strings.ToLower(nickname)))
	f, err := os.Create(outPath)
	if err != nil {
		return "", fmt.Errorf("cannot write file: %v", err)
	}
	defer f.Close()

	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	if err := enc.Encode(stored); err != nil {
		return "", fmt.Errorf("cannot encode json: %v", err)
	}

	return outPath, nil
}

// ---------------- Analysis over stored matches ----------------

// AnalyzeStoredMatches читает data/<nickname>.json и строит агрегатный отчёт по последним `limit` матчам.
// bearer — опциональный токен, использовался при сборе — если совпадает, данные точнее.
func (fc *FaceitClient) AnalyzeStoredMatches(nickname string, limit int, bearer string) (AggregateReport, string, error) {
	var report AggregateReport
	path := filepath.Join("data", fmt.Sprintf("%s.json", strings.ToLower(nickname)))

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return report, "", fmt.Errorf("no data for %s, run /collect first", nickname)
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return report, "", fmt.Errorf("cannot read file: %v", err)
	}
	var stored []StoredMatch
	if err := json.Unmarshal(b, &stored); err != nil {
		return report, "", fmt.Errorf("cannot unmarshal stored file: %v", err)
	}
	if limit <= 0 || limit > len(stored) {
		limit = len(stored)
	}
	start := 0
	if len(stored) > limit {
		start = len(stored) - limit
	}
	sub := stored[start:]

	var totalKills, totalDeaths, totalHS, totalEntryKills, totalEntryDeaths float64
	var wins int
	var matchesCount float64
	notes := []string{}

	for _, m := range sub {
		if m.Raw == nil {
			notes = append(notes, fmt.Sprintf("Матч %s: нет top-level players", m.MatchID))
			continue
		}
		matchesCount++

		if playersObj, ok := m.Raw["players"].(map[string]interface{}); ok {
			foundThisMatch := false
			for _, v := range playersObj {
				if pm, ok := v.(map[string]interface{}); ok {
					nickVal := fmt.Sprintf("%v", pm["nickname"])
					// compare ignoring case
					// NOTE: we rely on the stored file being collected for the requested player
					// If nick not equal, we still try to match by nickname
					// For stored matches from other collectors, this may differ.
					// We compare to the requested nickname later by passing it; here we assume stored match corresponds.
					// To be safe, we'll accumulate only when nickname matches the requested one.
					// We don't have requested nickname inside StoredMatch, so assume caller saved for this nickname.
					k := toFloat(pm["kills"])
					d := toFloat(pm["deaths"])
					hs := toFloat(pm["headshots_percentage"])
					entryK := toFloat(pm["entry_kills"])
					entryD := toFloat(pm["entry_deaths"])
					if ps, ok := pm["player_stats"].(map[string]interface{}); ok {
						if k == 0 {
							k = toFloat(ps["Kills"])
						}
						if d == 0 {
							d = toFloat(ps["Deaths"])
						}
						if hs == 0 {
							hs = toFloat(ps["Headshots %"])
						}
						if entryK == 0 {
							entryK = toFloat(ps["Entry Kills"])
						}
						if entryD == 0 {
							entryD = toFloat(ps["Entry Deaths"])
						}
					}
					// sum
					totalKills += k
					totalDeaths += d
					totalHS += hs
					totalEntryKills += entryK
					totalEntryDeaths += entryD
					foundThisMatch = true
					if res, ok := pm["result"].(string); ok {
						if strings.EqualFold(res, "win") {
							wins++
						}
					}
					_ = nickVal
					break
				}
			}
			if !foundThisMatch {
				notes = append(notes, fmt.Sprintf("Не найдена статистика игрока в матче %s (формат ответа отличается)", m.MatchID))
			}
		} else {
			notes = append(notes, fmt.Sprintf("Матч %s: нет top-level players", m.MatchID))
		}
	}

	report.Player = nickname
	report.MatchesAnalyzed = int(matchesCount)
	report.TotalKills = totalKills
	report.TotalDeaths = totalDeaths
	if totalDeaths > 0 {
		report.AvgKD = safeDiv(totalKills, totalDeaths)
	}
	if matchesCount > 0 {
		report.AvgHS = safeDiv(totalHS, matchesCount)
		report.EntryKills = totalEntryKills
		report.EntryDeaths = totalEntryDeaths
		report.WinRate = safeDiv(float64(wins), matchesCount) * 100.0
	}
	report.Notes = notes

	msgLines := []string{}
	msgLines = append(msgLines, fmt.Sprintf("Анализ игрока %s — последние %d матчей", nickname, report.MatchesAnalyzed))
	msgLines = append(msgLines, fmt.Sprintf("K: %.0f  D: %.0f  K/D: %.2f  HS: %.1f%%  Entry K: %.0f  Entry D: %.0f  WinRate: %.1f%%",
		report.TotalKills, report.TotalDeaths, report.AvgKD, report.AvgHS, report.EntryKills, report.EntryDeaths, report.WinRate))

	if report.AvgKD < 0.9 {
		msgLines = append(msgLines, "Рекомендация: слабый K/D — работай над aim, таймингом и позициями.")
	} else if report.AvgKD < 1.2 {
		msgLines = append(msgLines, "Рекомендация: средний K/D — улучшай consistency и карты, где теряешь раунды.")
	} else {
		msgLines = append(msgLines, "Рекомендация: K/D хороший — поработай над командной игрой и трейдами.")
	}

	if report.EntryDeaths > report.EntryKills {
		msgLines = append(msgLines, "Проблема: слишком много entry-deaths — замедли первые 10 секунд раунда и ищи трейды.")
	} else if report.EntryKills > 0 {
		msgLines = append(msgLines, fmt.Sprintf("Entry: %.0f kills vs %.0f deaths — неплохо.", report.EntryKills, report.EntryDeaths))
	}

	if report.WinRate < 40 {
		msgLines = append(msgLines, "WinRate низкий — возможно, проблема с выбором позиций/карта или пулом тимов.")
	}

	if len(report.Notes) > 0 {
		msgLines = append(msgLines, "")
		msgLines = append(msgLines, "Замечания по данным:")
		for _, n := range report.Notes {
			msgLines = append(msgLines, "- "+n)
		}
	}

	return report, strings.Join(msgLines, "\n"), nil
}

// ---------------- helpers ----------------

func toFloat(v interface{}) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case float32:
		return float64(t)
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case string:
		var f float64
		fmt.Sscanf(t, "%f", &f)
		return f
	default:
		return 0
	}
}

func safeDiv(a, b float64) float64 {
	if b == 0 {
		if a == 0 {
			return 0
		}
		return a
	}
	return a / b
}
