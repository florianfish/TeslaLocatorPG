# Changelog

## 1.3.0

- Écran de recharge en direct : puissance, temps restant et heure de fin, énergie ajoutée, limite de charge, autonomie et détails électriques, affiché pendant la recharge.
- Notifications Telegram configurables depuis l'onglet **Configuration** : début de charge (avec heure de fin prévue), fin ou interruption de charge, pression de pneu basse (seuil réglable).

## 1.2.1

- Retrait de la dépendance inutilisée `@google/genai` : image plus légère, plus d'avertissement `node-domexception` au build.

## 1.2.0

- Accès en lecture seule (jeton utilisateur et liens de partage) restreint côté serveur à la position, la vitesse, la batterie, l'état et l'itinéraire : plus de topics/journaux MQTT bruts, d'adresse du broker, de kilométrage, de pression des pneus ni d'état Sentinelle.

## 1.1.0

- Liens de partage temporaires en lecture seule : création, liste et révocation depuis le bouton **Partager**, coupure automatique à l'expiration.
- API `/api/share-links` (authentification `Authorization: Bearer <jeton admin>`) pour générer des liens depuis Home Assistant (`rest_command`).
- Nouvelle option `public_url` pour construire l'adresse des liens de partage.

## 1.0.2

- Écoute en IPv4 et IPv6 : le proxy Nginx de Home Assistant joint les add-ons en IPv6.

## 1.0.1

- Fond de carte Esri World Street Map : les tuiles CARTO exigent désormais une clé API hors `localhost`.

## 1.0.0

- Première version de l'add-on : interface intégrée via Ingress (sans jeton), configuration MQTT et jetons depuis l'onglet Configuration, port d'accès direct configurable.
