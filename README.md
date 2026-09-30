# Sketch2Map Studio (V7)

PWA 100 % locale : une photo de schéma manuscrit devient une carte éditable, sans API IA et sans serveur métier.

Cette version garde le moteur de détection de la V6 et le place dans une coquille produit : projets IndexedDB, exports métier, palette de commandes, thème, autosave.

La détection automatique reconnaît aussi les cartes composées de bulles à contour, de cercles pleins et de traits. Elle identifie d'abord ces objets, puis vérifie les traits entre eux. Le mode « Réseau / plan / carte » reste disponible pour les véritables schémas à intersections.

Depuis la V7.5, l'import d'une nouvelle image remet le type de dessin sur « Automatique ». Les bulles sont analysées à partir des couleurs d'origine, même si l'option de contraste est activée pour l'affichage. Le chargement en ligne récupère les fichiers les plus récents, tandis que le cache reste disponible hors ligne.

## Démarrage

```bash
python -m http.server 8080
```

Ouvrir `http://localhost:8080`, puis installer comme application si le navigateur le propose.

## Installation depuis GitHub

Le dépôt est prêt pour GitHub Pages. Placez **le contenu de ce dossier à la racine** d'un dépôt GitHub, avec le dossier caché `.github`. Dans **Settings → Pages**, choisissez **GitHub Actions** comme source. Le workflow `.github/workflows/pages.yml` publie l'application à chaque mise à jour de `main`.

Ouvrez ensuite l'adresse GitHub Pages du dépôt dans Chrome ou Edge et utilisez le bouton **Installer**. Sur iPhone ou iPad, ouvrez la page dans Safari, puis choisissez **Partager → Sur l’écran d’accueil**. Après un premier chargement en ligne, l'application et son exemple intégré sont accessibles hors ligne. Les projets et photos restent stockés dans le navigateur de l'appareil qui les a créés.

## Parcours recommandé

1. Importer ou photographier le schéma (ou glisser-déposer).
2. Choisir le type de dessin, lancer **Détecter**.
3. Corriger sur la photo : Suivre, Relier, Couper, Ajouter.
4. Marquer **Correct** sur une relation juste : l’app mémorise la couleur du trait.
5. Éditer les libellés, notes et types sur la carte.
6. Enregistrer le projet, exporter JSON / Markdown / Mermaid / OPML / SVG / PNG / FreeMind.

## Lecture de la carte

Dans la vue 2D, le bouton **Lecture** ouvre un parcours des éléments. La liste suit les relations quand elles existent, affiche les éléments isolés et permet de filtrer par libellé. Cliquer sur un élément le sélectionne et centre la carte dessus. Les boutons **+**, **−** et **Ajuster** contrôlent la vue sans changer les positions ni les données du graphe. Le panneau se ferme sans affecter la carte ou les exports.

## Raccourcis

| Action | Raccourci |
| --- | --- |
| Commandes | Ctrl/Cmd + K |
| Sauver | Ctrl/Cmd + S |
| Détecter | Ctrl/Cmd + Enter |
| Outils | 1–5 |
| Aide | ? |

## Limite volontaire

Sans OCR, les textes manuscrits restent à saisir. C’est un choix de conception : le logiciel reconstruit la structure, l’humain nomme le sens.
