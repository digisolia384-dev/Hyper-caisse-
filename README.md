# 🌐 Digitale Solution POS

Point de vente PWA pour commerçants africains — ventes, clients, stock, tickets thermiques, hors ligne.

## 🚀 Déploiement Vercel (via GitHub)

### 1. Créer le repo GitHub
```bash
git init
git add .
git commit -m "feat: initial deploy Digitale Solution POS"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/digitale-solution.git
git push -u origin main
```

### 2. Connecter à Vercel
1. Aller sur [vercel.com](https://vercel.com) → **New Project**
2. Importer votre repo GitHub
3. Framework Preset : **Other**
4. Build Command : *(laisser vide)*
5. Output Directory : *(laisser vide — `.` par défaut)*
6. Cliquer **Deploy**

### 3. Domaine personnalisé (optionnel)
- Dans Vercel → votre projet → **Settings → Domains**
- Ajouter votre domaine et configurer les DNS

---

## 📁 Structure des fichiers

```
/
├── index.html        ← Application complète (SPA)
├── sw.js             ← Service Worker (offline + cache)
├── manifest.json     ← PWA manifest
├── icon-192.png      ← Icône PWA 192×192
├── icon-512.png      ← Icône PWA 512×512
├── vercel.json       ← Config Vercel (routing SPA + headers)
└── .gitignore
```

## 📱 Fonctionnalités PWA

- ✅ Installable sur Android / iOS / PC
- ✅ Fonctionne hors ligne (Service Worker cache-first)
- ✅ Synchronisation automatique au retour de connexion
- ✅ Notifications push (prêt)
- ✅ Background sync

## 🔧 Configuration Firebase

Depuis l'application → Admin Développeur → Configuration Firebase :
renseigner les clés `apiKey`, `projectId`, `authDomain`, etc.

---

*Digitale Solution © 2025 — Powered by Vercel + Firebase*
