# 🚗 TeslaLocatorPG - Idées de Fonctionnalités & Feuille de Route (Roadmap)

Fichier généré pour centraliser les idées d'améliorations et de fonctionnalités utiles pour **TeslaLocatorPG**, basées sur les données publiées par **TeslaMate via MQTT**.

---

## 🎯 Contextualisation & Architecture Actuelle

TeslaLocatorPG s'appuie sur :
- **Backend Node.js/Express (`server.ts`)** : Connexion au courtier MQTT TeslaMate, diffusion SSE (`/api/stream`), sécurité par jetons (`ADMIN_ACCESS_TOKEN` / `USER_ACCESS_TOKEN`).
- **Frontend React 19 + Leaflet + Tailwind CSS v4** : Carte interactive, télémétrie en direct, cockpit dark mode glassmorphism.

---

## 💡 1. Supervision de la Recharge & Santé de la Batterie (Charging & Battery)

### 🔌 Dashboard de Recharge en Direct (Charging View)
* **Description** : Lorsque le véhicule est branché ou en charge (`state === "charging"`), la carte s'adapte ou laisse place à un panneau dédié aux statistiques de recharge.
* **Sujets MQTT TeslaMate à écouter** :
  - `teslamate/cars/1/charger_power` (kW)
  - `teslamate/cars/1/charger_voltage` (V)
  - `teslamate/cars/1/charger_actual_current` (A)
  - `teslamate/cars/1/charge_energy_added` (kWh)
  - `teslamate/cars/1/time_to_full_charge` (heures)
  - `teslamate/cars/1/charge_limit_soc` (%)
  - `teslamate/cars/1/charge_port_door_open` (true/false)
* **Intérêt Utilisateur** : Suivre en temps réel la vitesse de charge (kW), le coût estimé et le temps restant avant la fin de charge sans ouvrir l'application officielle Tesla.

### 🛞 Surveillance de la Pression des Pneus (TPMS)
* **Description** : Afficher un schéma 2D de la voiture avec la pression actuelle des 4 pneus et une alerte de couleur (vert = OK, orange/rouge = sous-gonflé).
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/tpms_pressure_fl` (Avant Gauche)
  - `teslamate/cars/1/tpms_pressure_fr` (Avant Droit)
  - `teslamate/cars/1/tpms_pressure_rl` (Arrière Gauche)
  - `teslamate/cars/1/tpms_pressure_rr` (Arrière Droit)
* **Intérêt Utilisateur** : Vérifier rapidement la sécurité et la pression des pneus en un coup d'œil.

### 🔋 Jauge de Puissance & Freinage Régénératif Instantané
* **Description** : Jauge dynamique de puissance en kW avec indication visuelle du freinage récupératif (valeur négative = régénération en vert, valeur positive = consommation en orange/rouge).
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/power` (kW)
  - `teslamate/cars/1/usable_battery_level` (%) vs `teslamate/cars/1/battery_level` (%)
* **Intérêt Utilisateur** : Visualiser l'effort du moteur ou la récupération d'énergie en conduite.

---

## 🗺️ 2. Cartographie & Navigation Avancée (Tracking & Maps)

### 📍 Fil d'Ariane & Historique du Trajet en Cours (Breadcrumb Trail)
* **Description** : Conserver un historique en mémoire locale des coordonnées GPS de la session de conduite courante et tracer une ligne `L.polyline` sur la carte Leaflet avec une couleur dégradée selon la vitesse.
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/latitude` & `teslamate/cars/1/longitude`
  - `teslamate/cars/1/speed`
* **Intérêt Utilisateur** : Voir le parcours exact effectué pendant le trajet sans attendre la fin du trajet dans TeslaMate.

### 🧭 Cap & Rotation Dynamique de la Voiture (Heading / Bearing)
* **Description** : Orienter l'icône de la Tesla sur la carte Leaflet selon l'angle réel de déplacement du véhicule (`heading` de 0 à 360°).
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/heading` (degrés)
* **Intérêt Utilisateur** : Permet une représentation réaliste de la direction de la voiture (utile en cas d'affichage orienté cap "Track-up").

### 🏘️ Support des Zones Geofence (Lieux Prédéfinis)
* **Description** : Afficher le nom de la zone où se trouve le véhicule au lieu de simples coordonnées GPS (ex: "🏠 Maison", "🏢 Bureau", "⚡ Superchargeur Chambéry").
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/geofence`
* **Intérêt Utilisateur** : Lecture immédiate de l'emplacement sans décoder la carte.

### 🧭 Overlay HUD d'Itinéraire & Estimation d'Arrivée (Active Route HUD)
* **Description** : Affichage enrichi des données d'itinéraire actif lorsque la navigation du véhicule est engagée.
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/active_route` (destination, miles_to_arrival, minutes_to_arrival, energy_at_arrival, traffic_minutes_delay)
* **Intérêt Utilisateur** : Suivre à distance un trajet en cours (ex: savoir dans combien de temps un proche arrive et avec quel pourcentage de batterie).

---

## 🛡️ 3. Sécurité, Climatisation & Alertes

### 🚪 Schéma Visuel des Ouvertures & Verrouillage (Doors & Trunk Status)
* **Description** : Widget interactif indiquant l'état de chaque porte, des coffres et du port de charge.
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/locked` (true/false)
  - `teslamate/cars/1/is_door_open` (true/false)
  - `teslamate/cars/1/is_front_trunk_open` (frunk)
  - `teslamate/cars/1/is_rear_trunk_open` (trunk)
  - `teslamate/cars/1/charge_port_door_open`
* **Intérêt Utilisateur** : Vérifier immédiatement si la voiture est bien fermée et si rien n'est resté ouvert.

### 👁️ Mode Sentinelle & État de Veille (Sentry Mode Status)
* **Description** : Badge animé lumineux (œil rouge pulsant) lorsque le Mode Sentinelle est activé.
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/sentry_mode` (true/false)
* **Intérêt Utilisateur** : Confirmation visuelle rapide de la protection du véhicule.

### 🌡️ Climatisation & Températures Intérieure / Extérieure
* **Description** : Affichage comparatif des températures avec indicateur d'activation du chauffage/climatisation et du pré-conditionnement de la batterie.
* **Sujets MQTT TeslaMate** :
  - `teslamate/cars/1/inside_temp` (°C)
  - `teslamate/cars/1/outside_temp` (°C)
  - `teslamate/cars/1/is_climate_on` (true/false)
  - `teslamate/cars/1/is_preconditioning` (true/false)
* **Intérêt Utilisateur** : Savoir si l'habitacle est à température optimale avant de prendre la route.

### 🔔 Notifications du Navigateur (Web Push / Audio Alerts)
* **Description** : Déclencher des notifications Web natifs ou des bips sonores en cas d'événements critiques (ex: fin de charge, Sentinelle déclenché, porte déverrouillée).
* **Intérêt Utilisateur** : Rester informé même si l'onglet TeslaLocatorPG est en arrière-plan.

---

## 📱 4. Expérience Utilisateur (UI/UX) & Widgets

### 📱 Support PWA (Progressive Web App)
* **Description** : Ajouter un fichier `manifest.json` et un Service Worker pour rendre l'application installable sur écran d'accueil iOS/Android et utilisable en plein écran sans barre d'adresse.
* **Intérêt Utilisateur** : Expérience type application native sur mobile et tablette.

### 🖥️ Mode Tablette / Dashboard Mural (Wall Mounted Mode)
* **Description** : Mode d'affichage plein écran haute lisibilité avec grands chiffres, idéal pour une tablette fixée au mur ou posée sur un dock dans le salon/garage.

### 🚘 Support Multi-Véhicules (Multi-Tesla Support)
* **Description** : Si le compte TeslaMate gère plusieurs Tesla (`teslamate/cars/1/...`, `teslamate/cars/2/...`), ajouter un sélecteur dans l'en-tête pour basculer d'une voiture à l'autre.
* **Intérêt Utilisateur** : Indispensable pour les foyers ou flottes possédant plusieurs véhicules Tesla.

---

## ⚙️ 5. Outils Développeurs & Fonctionnalités Avancées

### 📥 Export GPX / GeoJSON du Trajet
* **Description** : Bouton d'exportation du tracé GPS enregistré durant la session au format `.gpx` ou `.geojson` pour réutilisation dans d'autres outils (Google Maps, Strava, Relive).

### 🎮 Simulator Mode / Injecteur de Données MQTT (Mode Démo)
* **Description** : Option d'injection de trames de données fictives ou préenregistrées pour tester l'interface UI sans nécessiter que la voiture soit en déplacement.

---

## 📊 Matrice de Priorité des Fonctionnalités Suggérées

| Fonctionnalité | Difficulté | Valeur Utilisateur | Sujets MQTT Principaux |
| :--- | :---: | :---: | :--- |
| **Cap & Rotation de la Voiture (`heading`)** | 🟢 Facile | ⭐️⭐️⭐️⭐️ | `teslamate/cars/1/heading` |
| **Pression des Pneus (TPMS)** | 🟢 Facile | ⭐️⭐️⭐️⭐️⭐️ | `tpms_pressure_fl/fr/rl/rr` |
| **Zones Geofence (Nom du lieu)** | 🟢 Facile | ⭐️⭐️⭐️⭐️ | `teslamate/cars/1/geofence` |
| **État Ouvertures & Verrouillage** | 🟡 Moyenne | ⭐️⭐️⭐️⭐️⭐️ | `locked`, `is_door_open`, `is_trunk_open` |
| **Dashboard de Recharge Live** | 🟡 Moyenne | ⭐️⭐️⭐️⭐️⭐️ | `charger_power`, `time_to_full_charge`, ... |
| **Température Intérieure & Clim** | 🟢 Facile | ⭐️⭐️⭐️⭐️ | `inside_temp`, `is_climate_on` |
| **Historique Fil d'Ariane (Trace GPS)** | 🟡 Moyenne | ⭐️⭐️⭐️⭐️ | `latitude`, `longitude` |
| **Support Progressive Web App (PWA)** | 🟡 Moyenne | ⭐️⭐️⭐️⭐️ | Standard Web (`manifest.json`) |
| **Support Multi-Véhicules** | 🔴 Avancée | ⭐️⭐️⭐️ | `teslamate/cars/+/...` |

---

> [!NOTE]
> *Aucun commit n'a été effectué conformément aux consignes.* Le fichier est disponible localement dans [docs/feature_ideas.md](file:///c:/projects/TeslaLocatorPG/docs/feature_ideas.md).
