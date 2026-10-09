# Tesla Tracker

Carte en temps réel de la position d'une Tesla et de sa télémétrie (vitesse, batterie, pneus, mode Sentinelle…), alimentée par les messages MQTT de TeslaMate.

## Installation

1. **Paramètres → Modules complémentaires → Boutique → ⋮ → Dépôts**, ajouter `https://github.com/florianfish/TeslaLocatorPG`.
2. Installer **Tesla Tracker**.
3. Renseigner l'onglet **Configuration** (voir ci-dessous), puis démarrer l'add-on.
4. Cocher **Afficher dans la barre latérale**.

## Configuration

Ces options remplacent le fichier `.env` de l'installation Docker. Après modification, redémarrer l'add-on.

| Option | Variable `.env` | Description |
| --- | --- | --- |
| URL du broker MQTT | `MQTT_BROKER_URL` | `mqtt://core-mosquitto:1883` si TeslaMate publie sur l'add-on Mosquitto, sinon l'adresse de votre broker (`mqtts://` pour TLS) |
| Utilisateur / mot de passe MQTT | `MQTT_USERNAME` / `MQTT_PASSWORD` | Identifiants du broker, vides si non requis |
| Topic de position | `MQTT_TOPIC` | Par défaut `teslamate/cars/1/location` |
| Jeton administrateur | `ADMIN_ACCESS_TOKEN` | Accès complet en accès direct |
| Jeton utilisateur | `USER_ACCESS_TOKEN` | Accès en lecture seule en accès direct (position, vitesse, batterie, état, itinéraire ; sans données MQTT brutes, kilométrage, pneus ni Sentinelle) |
| URL publique | `PUBLIC_URL` | Adresse d'accès direct utilisée dans les liens de partage (ex : `https://tesla.mondomaine.fr`) |
| Jeton du bot / Chat ID Telegram | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Active les notifications Telegram (voir ci-dessous) |
| Notifier début / fin / fin imminente de charge | `NOTIFY_CHARGE_STARTED` / `NOTIFY_CHARGE_COMPLETE` / `NOTIFY_CHARGE_ENDING_SOON` | Toutes activées par défaut |
| Notifier pneus, batterie basse, voiture ouverte | `NOTIFY_TPMS` / `NOTIFY_BATTERY_LOW` / `NOTIFY_LEFT_OPEN` | Toutes activées par défaut |
| Seuils et délais | `TPMS_ALERT_THRESHOLD` / `BATTERY_LOW_THRESHOLD` / `CHARGE_ENDING_SOON_MINUTES` / `LEFT_OPEN_DELAY_MINUTES` | `2.3` bar, `20` %, `15` min, `10` min par défaut |
| Commandes du bot Telegram | `TELEGRAM_COMMANDS` | `/position`, `/etat`, `/charge`, `/partage` (activées par défaut) |

## Accès

- **Barre latérale Home Assistant (Ingress)** : aucun jeton demandé, l'authentification est assurée par Home Assistant et l'accès est administrateur. Le panneau est réservé aux administrateurs HA.
- **Accès direct** (`http://<ip-home-assistant>:<port>/?token=…`) : désactivé par défaut. Renseigner un port dans l'onglet **Réseau**, et définir au moins un jeton. Ne l'exposez pas sur Internet sans HTTPS.

## Notifications Telegram

1. Dans Telegram, écrire à **@BotFather**, envoyer `/newbot` et copier le jeton fourni.
2. Renseigner **Jeton du bot Telegram** et redémarrer l'add-on.
3. Envoyer un message quelconque à votre bot, puis ouvrir le **Journal** de l'add-on : la ligne `Telegram: ignored message from chat 123456789…` donne votre chat ID. Pour un groupe, ajouter le bot au groupe et y écrire ; l'identifiant commence alors par `-`.
4. Renseigner **Chat ID Telegram** (plusieurs séparés par des virgules), choisir les notifications, puis redémarrer l'add-on.
5. Vérifier avec **Console & MQTT → Alertes → Envoyer une notification de test** : le résultat s'affiche pour chaque chat (ex : chat introuvable, bot bloqué).

| Notification | Déclenchement |
| --- | --- |
| Début de charge | Une minute après le passage à l'état `charging` : niveau, limite, puissance et heure de fin prévue |
| Fin de charge imminente | Quand le temps de charge restant passe sous le délai réglé (15 min par défaut), une fois par recharge |
| Fin de charge | À la sortie de l'état `charging` : « terminée » si la limite est atteinte, « interrompue » sinon, avec l'énergie ajoutée |
| Pneus | Un pneu sous le seuil ou une alerte TPMS de la voiture. Une seule notification par pneu, réarmée quand la pression remonte au-dessus du seuil + 0,1 bar |
| Batterie basse | Batterie sous le seuil hors recharge. Réarmée à la recharge ou au-dessus du seuil + 5 % |
| Voiture laissée ouverte | Voiture garée (rapport P) sans personne à bord, déverrouillée ou avec une porte, le coffre, le frunk ou une fenêtre ouverts pendant le délai réglé (10 min par défaut). Réarmée au verrouillage ou au retour d'un occupant |

Les heures affichées suivent le fuseau horaire de Home Assistant. Après un redémarrage de l'add-on, une alerte toujours en cours (pneu, batterie, ouverture) est signalée à nouveau. TeslaMate ne publie pas les déclenchements de la Sentinelle : seule son activation est connue, ce qui ne permet pas d'alerter sur une intrusion.

### Commandes du bot

Le bot ne répond qu'aux chats configurés ; les autres messages sont ignorés (et leur chat ID noté dans le journal).

| Commande | Réponse |
| --- | --- |
| `/position` | Position sur une carte, état, batterie et destination en cours de navigation |
| `/etat` | Batterie et autonomie, verrouillage et ouvertures, Sentinelle, température, pression des pneus |
| `/charge` | Recharge en cours (puissance, énergie ajoutée, heure de fin) ou niveau et limite de charge |
| `/partage [durée] [libellé]` | Crée un lien de partage temporaire (ex : `/partage 30m`, `/partage 2h Famille`, 2 h par défaut). Exige l'option **URL publique** |
| `/aide` | Liste des commandes |

Une seule instance peut utiliser un bot à la fois : ne pas réutiliser le même jeton dans une autre installation de Tesla Tracker ou un autre programme qui lit les messages du bot.

## Liens de partage temporaires

Un lien de partage donne un accès en **lecture seule** pendant une durée limitée (5 min à 30 jours), sans communiquer le jeton utilisateur permanent. À l'expiration ou à la révocation, la page du destinataire est déconnectée.

Le destinataire voit la position, la vitesse, la batterie, la recharge en cours et, pendant une navigation, la destination avec l'heure d'arrivée prévue et la batterie à l'arrivée. Le kilométrage, la pression des pneus, le mode Sentinelle et le verrouillage restent réservés aux administrateurs.

Prérequis : l'accès direct doit être activé (onglet **Réseau**) et joignable par les destinataires, idéalement en HTTPS derrière un reverse proxy. Renseigner **URL publique** avec cette adresse : sans elle, seul le jeton est fourni.

### Depuis l'interface

Bouton **Partager** (administrateurs) : choisir un libellé et une durée, puis copier ou envoyer le lien. Le lien n'est affiché qu'une fois ; la liste des liens actifs permet de les révoquer.

Les liens sont conservés dans `/data/share-links.json` (seule une empreinte des jetons y est stockée) et survivent aux redémarrages.

### Depuis Home Assistant

L'API exige le **jeton administrateur** (option à renseigner) dans l'en-tête `Authorization: Bearer …`. Home Assistant joint l'add-on sur le réseau interne via son nom d'hôte `<préfixe>-tesla-locator`, où `<préfixe>` est la partie avant `_tesla_locator` dans l'URL de la page de l'add-on (ex : `/hassio/addon/a1b2c3d4_tesla_locator` → `a1b2c3d4-tesla-locator`). Le port 3000 interne est utilisé, même si l'accès direct est sur un autre port.

`secrets.yaml` :

```yaml
tesla_tracker_auth: "Bearer VOTRE_JETON_ADMIN"
```

`configuration.yaml` :

```yaml
rest_command:
  tesla_tracker_share:
    url: "http://a1b2c3d4-tesla-locator:3000/api/share-links"
    method: POST
    headers:
      Authorization: !secret tesla_tracker_auth
    content_type: "application/json"
    payload: '{"label": "{{ label | default(''Home Assistant'') }}", "duration": "{{ duration | default(''2h'') }}"}'
```

Script qui crée un lien et l'envoie par notification :

```yaml
script:
  partager_position_tesla:
    alias: Partager la position de la Tesla
    fields:
      duration:
        description: "Durée de validité (ex : 30m, 2h, 1d)"
        example: 2h
    sequence:
      - action: rest_command.tesla_tracker_share
        data:
          label: Suivi depuis Home Assistant
          duration: "{{ duration | default('2h') }}"
        response_variable: share
      - if: "{{ share.status == 201 }}"
        then:
          - action: notify.mobile_app_mon_telephone
            data:
              message: "Suivez la voiture : {{ share.content.url }} (jusqu'à {{ (share.content.expiresAt / 1000) | timestamp_custom('%H:%M') }})"
```

### API

| Méthode | Route | Description |
| --- | --- | --- |
| `POST` | `/api/share-links` | Corps `{"label": "…", "duration": "2h"}` (minutes, ou suffixe `m`/`h`/`d`). Répond `201` avec `id`, `label`, `expiresAt` (ms), `token` et `url` |
| `GET` | `/api/share-links` | Liens actifs (sans les jetons) |
| `DELETE` | `/api/share-links/<id>` | Révoque un lien |
