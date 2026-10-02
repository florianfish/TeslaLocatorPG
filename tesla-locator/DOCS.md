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
| Jeton utilisateur | `USER_ACCESS_TOKEN` | Accès en lecture seule en accès direct |

## Accès

- **Barre latérale Home Assistant (Ingress)** : aucun jeton demandé, l'authentification est assurée par Home Assistant et l'accès est administrateur. Le panneau est réservé aux administrateurs HA.
- **Accès direct** (`http://<ip-home-assistant>:<port>/?token=…`) : désactivé par défaut. Renseigner un port dans l'onglet **Réseau**, et définir au moins un jeton. Ne l'exposez pas sur Internet sans HTTPS.
