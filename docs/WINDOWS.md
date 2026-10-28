# Запуск на Windows 11

Приложение работает **только на вашем компьютере** (`127.0.0.1`): из локальной сети и интернета оно недоступно.
Лаунчер не добавляет автозапуск, не трогает брандмауэр и сетевые настройки, не открывает приложение наружу.

> Статус: скрипты написаны для Windows PowerShell 5.1 (встроен в Windows 11), но в облачном окружении разработки
> Windows не было — **NOT LIVE VERIFIED**. Если что-то не сработает, пришлите вывод окна и `logs\server.log`.

## Один раз: установка

1. Установите [Git](https://git-scm.com/download/win) и [Node.js 20 LTS+](https://nodejs.org) (или `winget install OpenJS.NodeJS.LTS`).
   Откройте **новый** терминал после установки.
2. Склонируйте репозиторий и запустите установку:
   ```powershell
   git clone https://github.com/limelightttt/faceitAnalyzer.git
   cd faceitAnalyzer
   .\setup.cmd
   ```
   `setup.cmd`:
   * при отсутствии [uv](https://docs.astral.sh/uv/) спросит разрешение и поставит его официальным установщиком (без прав администратора;
     uv сам скачает подходящий Python);
   * установит зависимости backend (`uv sync --frozen`) и frontend (`npm ci`), соберёт интерфейс;
   * создаст `backend\.env` из `.env.example` (существующий файл не трогает);
   * создаст папку данных `%LOCALAPPDATA%\FaceitIntelligence\data`. Если у вас уже были данные в `backend\data`, они будут
     **скопированы** туда один раз (оригинал остаётся).
3. Откройте `backend\.env` в блокноте и впишите `FACEIT_API_KEY=...` (server-side ключ из developers.faceit.com).
   Файл `.env` не попадает в git.

## Каждый день

| Команда | Что делает |
|---|---|
| `start.cmd` | запускает приложение в фоне, ждёт готовности и открывает `http://localhost:8000`. Если интерфейс менялся (после `git pull`) — сначала пересобирает его |
| `stop.cmd` | останавливает приложение (и процессы разбора демок) |
| `status.cmd` | запущено ли, состояние ключа FACEIT, лимит запросов, пути к данным и логам |
| `share.cmd` / `unshare.cmd` | открыть доступ друзьям через Tailscale / закрыть (см. ниже) |
| `start.cmd -Port 8001` | другой порт, если 8000 занят (тогда и `APP_BASE_URL=http://localhost:8001` в `.env`) |

Открывайте приложение именно по `http://localhost:8000` (как в `APP_BASE_URL`): с адреса `127.0.0.1` защита от CSRF
отклонит изменяющие запросы.

Окно терминала можно закрыть — приложение продолжит работать до `stop.cmd` или перезагрузки компьютера. После перезагрузки
оно **не** стартует само: запустите `start.cmd`.

## Обновление

```powershell
.\stop.cmd
git pull
.\setup.cmd      # зависимости могли измениться
.\start.cmd
```
Данные (`%LOCALAPPDATA%\FaceitIntelligence\data`: база, кэш FACEIT, загруженные демки) лежат вне папки репозитория и
переживают `git pull`, пересборку и даже повторный `git clone`. Схема базы обновляется автоматически при старте
(миграции по `PRAGMA user_version`, без потери данных). Резервная копия — просто скопируйте эту папку при остановленном
приложении. Логи: `%LOCALAPPDATA%\FaceitIntelligence\logs` (предыдущий запуск — `*.prev`).

## Вход
* **Steam** работает без настроек.
* **FACEIT**: в FACEIT Developers укажите redirect URI `http://localhost:8000/api/auth/faceit/callback` и впишите
  `FACEIT_CLIENT_ID` / `FACEIT_CLIENT_SECRET` в `.env`.
* Закрытая бета: `BETA_ALLOWLIST=` — через запятую SteamID64 / FACEIT player id / ник FACEIT; пусто — войти может любой,
  кто может открыть страницу (а без Tailscale это только вы).

## Поделиться с друзьями через Tailscale (HTTPS, только приглашённые)

[Tailscale Serve](https://tailscale.com/kb/1312/serve) открывает приложение по HTTPS только внутри вашей сети tailnet.
В интернет оно **не** публикуется: Funnel скрипт никогда не включает. Роутер и брандмауэр не трогаются.

1. Tailscale установлен на этом ПК, вы в него вошли. В [админке](https://login.tailscale.com/admin/dns) включены
   MagicDNS и HTTPS Certificates. Если HTTPS не включён, при первом запуске Tailscale покажет ссылку — откройте её
   один раз.
2. Узнайте SteamID64 (17 цифр, `7656119…`): свой и друзей. Его видно в адресе профиля Steam или на steamid.io.
   Вместо SteamID можно указать ник FACEIT.
3. Одна команда в папке проекта:
   ```powershell
   .\share.cmd -Allow 7656119xxxxxxxxx1,7656119xxxxxxxxx2
   ```
   Скрипт:
   * включает `tailscale serve`;
   * прописывает в `backend\.env` адрес `APP_BASE_URL=https://ваш-пк.tailXXXX.ts.net` и `BETA_ALLOWLIST`;
   * перезапускает приложение и открывает адрес.
4. Войдите по этому адресу через Steam сами.
5. В открывшейся админке: Machines → этот ПК → **Share…** → отправьте приглашение другу. Он ставит Tailscale,
   принимает приглашение и открывает тот же адрес.
6. Для входа через FACEIT добавьте в FACEIT Developers redirect URI `https://ваш-пк.tailXXXX.ts.net/api/auth/faceit/callback`.

После этого `start.cmd` открывает общий адрес. Остановить доступ: `.\unshare.cmd` — Serve выключается, приложение
снова только на `localhost`, список доступа сохраняется.

## Частые проблемы
* **`running scripts is disabled`** — запускайте `.cmd`-файлы: они вызывают PowerShell с `-ExecutionPolicy Bypass` только для
  этого скрипта, системная политика не меняется.
* **Порт занят** — `start.cmd -Port 8001`.
* **«FACEIT_API_KEY is not set»** — впишите ключ в `backend\.env`, `stop.cmd`, `start.cmd`.
* **429 / лимит FACEIT** — приложение само делает паузу, отдаёт сохранённые данные и показывает время, когда можно повторить.
