# Безопасность

* **Сессии**: случайный 256-битный токен только в HttpOnly-cookie (`SameSite=Lax`, `Secure` при https-`APP_BASE_URL`);
  в БД — SHA-256. Абсолютный срок (14 дней) и idle-таймаут (3 дня). Новый токен при каждом входе/привязке, старая сессия
  удаляется (нет session fixation). Токены в localStorage/JS не попадают.
* **CSRF**: synchronizer token в серверной сессии, SPA отправляет `X-CSRF-Token` на POST/PUT/DELETE; дополнительно проверяется
  `Origin`. `SameSite=Lax` нужен для возврата с OAuth/OpenID.
* **Steam OpenID 2.0**: проверка `op_endpoint`, точного `return_to`, формата `claimed_id`, подписи через
  `check_authentication`; наш `state` одноразовый и привязан к браузеру отдельной cookie (защита от login CSRF и replay).
* **FACEIT Connect**: authorization code + PKCE (S256), `client_secret_basic` только на сервере, одноразовый `state` с привязкой
  к браузеру. Access token используется один раз для userinfo и не хранится.
* **Привязка аккаунтов**: identity (provider, subject) принадлежит ровно одной учётной записи; уже привязанная к другой
  записи identity не переносится и не сливается (409). Привязка завершается только в той же сессии, где начата. Нельзя
  отвязать последний способ входа.
* **Прочее**: rate limiting на вход, загрузку демок и разведку; open redirect закрыт (`return_to` только относительный путь);
  CORS — только явные origin; заголовки `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Cache-Control:
  no-store` для API. Ключ FACEIT используется только сервером; в клиентской сборке нет секретов.
* **Тестовый вход** `/api/auth/dev-login` отвечает 404, если не включён `AUTH_DEV_LOGIN` *и* приложение не на localhost по http.

Что не проверено вживую: реальные Steam и FACEIT OAuth не были доступны из облачного окружения разработки; потоки покрыты
тестами с подменёнными ответами провайдеров (см. `tests/test_auth.py`). Проверьте вход вручную после настройки.
