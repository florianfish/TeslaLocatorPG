# Tesla Tracker 🚗📍

Application moderne de suivi et de géolocalisation de véhicule (Tesla) en temps réel, s'interfaçant avec **TeslaMate** via **MQTT**, avec une carte interactive (Leaflet), télémétrie en direct (SSE) et accès sécurisé par jeton.

---

## 🛠️ Prérequis

- **Mode Développement** : [Node.js](https://nodejs.org/) (v20+) et `npm`
- **Mode Docker / Production** : [Docker](https://docs.docker.com/get-docker/) et [Docker Compose](https://docs.docker.com/compose/install/)

---

## 🚀 Démarrage

### 1. Configurer l'environnement

Copiez le fichier d'exemple et remplissez-le avec vos identifiants MQTT et votre jeton de sécurité :
```bash
cp .env.example .env
```

Variables principales dans `.env` :
- `SECURE_ACCESS_TOKEN` : Jeton d'accès requis pour la carte (ex: `mon_token_secret`).
- `MQTT_BROKER_URL` : Adresse de votre broker MQTT (ex: `mqtt://192.168.1.100:1883`).
- `MQTT_USERNAME` & `MQTT_PASSWORD` : Identifiants de connexion MQTT.
- `MQTT_TOPIC` : Topic du composant GPS (ex: `teslamate/cars/1/location`).

---

### 💻 Mode Développement (Hot Reload en direct)

Idéal pour apporter des modifications au code source (`src/` ou `server.ts`) avec rechargement instantané sans recontruire de conteneur.

1. Installez les dépendances :
   ```bash
   npm install
   ```
2. Lancez le serveur de développement :
   ```bash
   npm run dev
   ```
3. Accédez à l'application : `http://localhost:3000`

---

### 🐳 Mode Docker (Production / Déploiement)

#### A. Utilisation du code local (Build local)
Dans [docker-compose.yml](file:///c:/projects/TeslaLocatorPG/docker-compose.yml), utilisez la configuration `build: .` pour prendre en compte vos fichiers locaux :
```bash
docker compose up --build -d
```

#### B. Utilisation de l'image GHCR pré-construite
Si vous utilisez la version distante publiée :
```bash
docker compose up -d
```

---

## 🔐 Sécurité & Jeton d'Accès

L'accès à l'application est protégé par le jeton défini dans `SECURE_ACCESS_TOKEN`.

Vous pouvez vous authentifier de deux manières :
1. **Sur l'écran d'accueil** : Saisissez simplement votre jeton dans le formulaire de connexion.
2. **Via l'URL** : Ajoutez le paramètre `token` dans votre navigateur :
   `http://localhost:3000/?token=VOTRE_TOKEN_ICI`

---

## 🔄 Mise à jour et Maintenance

- **Appliquer un changement de code en Docker** : `docker compose up --build -d`
- **Changement dans le fichier `.env`** : `docker compose restart`
- **Nettoyage des images Docker obsolètes** : `docker image prune -f`

---

## 📁 Structure du projet

- `server.ts` : Serveur Express + Proxy MQTT + Serveur d'événements SSE + Middleware Vite en dev.
- `src/` : Application React 19, Leaflet, Tailwind CSS & composants UI.
  - `src/App.tsx` : Composant principal (gestion auth, Leaflet map, flux SSE).
  - `src/components/` : Composants UI (`SecureLogin`, `MapOverlay`, `DebugPanel`).
- `docker-compose.yml` : Configuration Docker Compose.
- `Dockerfile` : Multi-stage build Node.js ultra-léger (Alpine).
- `AGENTS.md` : Guide d'architecture et consignes pour les agents IA.
