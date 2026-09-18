# EOCheck - API Service & Scanner Manager

**EOCheck** est le service d'API REST et de gestion des scans de confidentialité, de cookies et de traqueurs pour le site **[eocheck.eoxia.com](https://eocheck.eoxia.com)**.
Rapport pour les cookies et traqueurs
Rapport SEO
Rapport uptime des sites avec copie d'écran
Rapport de récupération de données affiché lors du scan

Il s'intègre directement avec le gestionnaire de cookies **[eo-tools](https://github.com/Eoxia/eo-tools)** et intègre le scanner Puppeteer via le module **[blacklight-query](https://github.com/Eoxia/blacklight-query)**.

---

## 📐 Architecture du Système

```
[ Clients : eo-tools / Sites Web ]
               │  (Requête HTTP API + Token `X-API-Token`)
               ▼
[ Nginx Reverse Proxy (1Panel) ] ── (SSL / HTTPS)
               │
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Conteneur / App : eocheck.eoxia.com (API Service Manager)  │
│  - API REST / Node.js Express (ESM)                         │
│  - Gestion des Clés API (tokens pour eo-tools)              │
│  - Migration & Versionnement BDD (schema_migrations)        │
└──────────────────────────┬──────────────────────────────────┘
               │ (Sous-processus / Worker)   │ (Enregistrement)
               ▼                              ▼
┌──────────────────────────────┐    ┌─────────────────────────┐
│ blacklight-query (Fork/Sub)  │    │ SQLite / PostgreSQL BDD │
│  - Exécute le scan Puppeteer │    │ - Table users & tokens  │
│  - Extraction des cookies    │    │ - Rapports JSON scans   │
└──────────────────────────────┘    └─────────────────────────┘
```

---

## 🚀 Installation & Démarrage Local

### 1. Prérequis
- Node.js >= 18.x
- npm ou yarn

### 2. Cloner le dépôt et initialiser les sous-modules
```bash
git clone --recursive https://github.com/lmag/eocheck.git
cd eocheck
```

### 3. Installation des dépendances
```bash
npm install
```

### 4. Configuration d'environnement (`.env`)
Copiez le fichier d'exemple et personnalisez vos clés :
```bash
cp .env.example .env
```

> ⚠️ **Sécurité** : Le fichier `.env.example` ne contient **aucune** donnée confidentielle ou URL de production réelles, uniquement des valeurs d'exemple/placeholders. Ne commitez jamais vos clés secrètes sur Git.

### 5. Exécuter les migrations de Base de Données
```bash
npm run migrate
```

### 6. Lancer le serveur d'API
```bash
# Mode production
npm start

# Mode développement avec auto-reload
npm run dev
```

L'API sera accessible sur `http://localhost:3000`.

---

## 🔐 Authentification & Clés d'API pour `eo-tools`

### 1. Inscription / Connexion Utilisateur
- `POST /api/v1/auth/register` (Créer un compte)
- `POST /api/v1/auth/login` (Obtenir un jeton JWT de session)

### 2. Création d'une clé API pour `eo-tools`
Pour permettre au plugin/outil **eo-tools** d'interroger l'API EOCheck :
- `POST /api/v1/tokens` (Authentifié par JWT)
  ```json
  {
    "name": "Clé API Site Client",
    "client_app": "eo-tools"
  }
  ```
L'API retournera un jeton statique `eoc_live_...`.

### 3. Authentification de l'API
Fournir le jeton via l'un des en-têtes HTTP suivants :
```http
X-API-Token: eoc_live_xxxxxxxxxxxxxxxxxxxxxxxx
```
ou
```http
Authorization: Bearer eoc_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## 🔍 Endpoints d'API (`/api/v1`)

| Méthode | Endpoint | Description | Authentification |
|---|---|---|---|
| `GET` | `/api/v1/health` | Vérification de l'état du service | Public |
| `POST` | `/api/v1/auth/register` | Inscription d'un utilisateur | Public |
| `POST` | `/api/v1/auth/login` | Connexion et obtention de token JWT | Public |
| `GET` | `/api/v1/auth/me` | Profil utilisateur connecté | JWT |
| `POST` | `/api/v1/tokens` | Générer un jeton API pour `eo-tools` | JWT |
| `GET` | `/api/v1/tokens` | Lister les jetons API actifs | JWT |
| `DELETE` | `/api/v1/tokens/:id` | Révoquer un jeton API | JWT |
| `POST` | `/api/v1/scans` | Lancer un scan de site (`blacklight-query`) | JWT / API Token |
| `GET` | `/api/v1/scans/:id` | Obtenir le résultat d'un scan | Public / Client |
| `GET` | `/api/v1/scans` | Historique des scans | JWT / API Token |

---

## 📦 Structure de la Base de Données & Versionnement

Le système de migration intégré (`src/db/migrator.js`) gère la montée en version automatique des schémas de BDD :
- `schema_migrations` : Suivi des versions appliquées (`001_initial_schema`, etc.).
- `users` : Comptes utilisateurs et rôles.
- `api_tokens` : Clés d'API attribuées aux intégrations (`eo-tools`).
- `scans` : Demandes de scans et rapports d'analyse JSON.

---

## 📜 Licence
Distribué sous la licence GPL-3.0-or-later. Voir `LICENSE` pour plus de détails.
