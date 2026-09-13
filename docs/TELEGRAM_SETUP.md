# Telegram – zprovoznění soukromého kanálu

1. V `@BotFather` spusťte `/newbot` a bezpečně uložte token.
2. Založte soukromý kanál, přidejte bota jako administrátora s právem publikovat zprávy.
3. Získejte číselné ID kanálu (typicky začíná `-100`) a své číselné user ID.
4. Ve Vercelu nastavte pouze pro Production:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHANNEL_ID`
   - `TELEGRAM_WEBHOOK_SECRET` (náhodný dlouhý řetězec bez mezer)
   - `TELEGRAM_ALLOWED_USER_IDS` (čárkou oddělená ID)
   - nejprve `TELEGRAM_ENABLED=false`
5. Po nasazení migrace zaregistrujte webhook voláním Telegram API `setWebhook` na
   `https://<produkční-host>/api/telegram/webhook` a předejte stejnou hodnotu jako
   `secret_token`. Token nikdy nevkládejte do repozitáře nebo logu.
6. V GitHub Actions spusťte ručně `telegram-digest`. S vypnutým odesíláním vrátí dry-run.
   Pro explicitní kontrolu lze chráněný endpoint zavolat s `?dryRun=1&force=1`.
7. Ověřte soukromý příkaz `/help`, poté nastavte `TELEGRAM_ENABLED=true` a proveďte redeploy.

Automatický job běží v 07:00 i 08:00 UTC. Endpoint odešle zprávy pouze tehdy, když je
v Praze 09:00; unikátní databázový klíč brání duplicitám.
