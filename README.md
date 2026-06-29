# Tesla Tracker 🚗📍

Application moderne de suivi et de géolocalisation de véhicule (Tesla) en temps réel, s'interfaçant avec **TeslaMate** via **MQTT**, avec une interface web interactive et un accès sécurisé par jeton d'accès.

---

## 🛠️ Prérequis

- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

---

## 🚀 Lancement rapide

1. **Configurer l'environnement** :
   Copiez le fichier d'exemple et remplissez-le avec vos identifiants MQTT, l'URL de votre application, et votre clé API Gemini si nécessaire.
   ```bash
   cp .env.example .env
   ```
   Renseignez les variables suivantes dans le fichier `.env` :
   - `MQTT_BROKER_URL` : L'adresse de votre broker MQTT (ex: `mqtt://192.168.1.100:1883`).
   - `MQTT_USERNAME` & `MQTT_PASSWORD` : Identifiants MQTT si requis.
   - `SECURE_ACCESS_TOKEN` : Un jeton de sécurité de votre choix (ex: `mon_super_token_secret`).

2. **Démarrer l'application** :
   Lancez le conteneur en arrière-plan :
   ```bash
   docker compose up -d
   ```

3. **Accéder à l'application** :
   L'application est accessible à l'adresse `http://localhost:3000`.
   
   ⚠️ **Sécurité** : Pour accéder à la carte de suivi, vous devez passer le jeton sécurisé configuré dans votre `.env` en paramètre GET :
   `http://localhost:3000/?token=votre_secure_access_token_here`

---

## 🔄 Comment appliquer les changements ?

### 1. Modification du code source (ex: titre, fichiers React, serveur backend)
Puisque le code est compilé et packagé dans l'image Docker, toute modification du code nécessite de **reconstruire l'image**.

Pour reconstruire l'image et redémarrer le service avec le nouveau code, exécutez :
```bash
docker compose up --build -d
```

### 2. Modification des variables d'environnement (`.env`)
Si vous modifiez uniquement le fichier `.env` (comme changer le mot de passe MQTT, l'URL de l'application ou le token d'accès), vous n'avez **pas besoin de reconstruire l'image**.

Il vous suffit de recréer le conteneur pour qu'il lise les nouvelles variables :
```bash
docker compose down && docker compose up -d
```
*Alternative rapide* :
```bash
docker compose restart
```

### 3. Nettoyer les anciennes images inutilisées (optionnel)
Après plusieurs reconstructions, des images obsolètes peuvent s'accumuler. Vous pouvez les nettoyer avec :
```bash
docker image prune -f
```

---

## 📁 Structure du projet

- `Dockerfile` : Configuration du build multi-étape pour une image Node.js ultra-légère et optimisée pour la production.
- `docker-compose.yml` : Fichier d'orchestration pour lancer l'application avec redémarrage automatique et injection sécurisée de l'environnement.
- `server.ts` : Serveur d'API Express faisant office de proxy MQTT sécurisé.
- `src/` : Application frontend développée en React, Vite, Tailwind CSS et Leaflet.
