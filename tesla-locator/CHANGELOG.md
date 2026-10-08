# Changelog

## 1.3.2

- Icône et logo de l'add-on dans la boutique Home Assistant.
- Favicon de l'interface web (onglet du navigateur, raccourci sur l'écran d'accueil iOS).

## 1.3.1

- Historique des versions : un clic sur le numéro de version dans l'en-tête affiche les nouveautés de chaque version.
- Image basée sur Node.js 24 (LTS) : Node.js 20 n'est plus maintenu.
- Mise à jour des dépendances, dont les correctifs de sécurité d'`express` (`qs`, `proxy-addr`) et de `mqtt` (`ip-address`).
- Montée de version majeure des dépendances : Express 5, Vite 8, TypeScript 7, lucide-react 1, dotenv 18 ; retrait de `motion`, inutilisé.
- Correction : pendant une navigation, la voiture n'est plus déplacée sur la destination de l'itinéraire (seul le topic de position met à jour sa position).
- Correction : icône de voiture de l'écran de chargement mal formée (erreur dans la console du navigateur).
- Correction : l'écran de recharge ne recouvre plus le panneau de télémétrie ; il se place dessous et passe en version compacte quand la télémétrie est dépliée.

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
