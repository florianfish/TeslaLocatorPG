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

## Accès

- **Barre latérale Home Assistant (Ingress)** : aucun jeton demandé, l'authentification est assurée par Home Assistant et l'accès est administrateur. Le panneau est réservé aux administrateurs HA.
- **Accès direct** (`http://<ip-home-assistant>:<port>/?token=…`) : désactivé par défaut. Renseigner un port dans l'onglet **Réseau**, et définir au moins un jeton. Ne l'exposez pas sur Internet sans HTTPS.

## Liens de partage temporaires

Un lien de partage donne un accès en **lecture seule** pendant une durée limitée (5 min à 30 jours), sans communiquer le jeton utilisateur permanent. À l'expiration ou à la révocation, la page du destinataire est déconnectée.

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
