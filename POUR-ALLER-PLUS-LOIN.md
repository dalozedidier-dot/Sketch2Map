# Comment pousser Sketch2Map beaucoup plus loin — et vraiment “pro”

La V6 est déjà un prototype intelligent : détection organique / boîtes, correction sur la photo, loupe, apprentissage colorimétrique local, exports. Ce n’est plus un jouet. Ce qui la sépare d’un produit professionnel n’est pas “ajouter de l’IA”, c’est **tenir une promesse de bout en bout** : photo imparfaite → graphe fiable → document réutilisable, sans friction, sans perte de données, avec une qualité perçue d’outil de studio.

## 1. Recadrer le produit

Ne pas se vendre comme “IA qui lit les mind maps”. Se vendre comme **studio de reconstruction structurelle**.

Promesse claire :

> Vous photographiez un schéma. Sketch2Map en extrait la géométrie. Vous corrigez en 2 minutes. Vous repartez avec un graphe propre dans l’outil de votre choix.

Personas utiles :

- Facilitateur / coach qui photographie un paperboard.
- Chercheur ou doctorant qui archive des cartes manuscrites.
- Équipe produit qui transforme un atelier en livrable.
- Enseignant qui numérise des cartes d’élèves.

Le critère de succès n’est pas “100 % de détection automatique”. C’est **temps jusqu’à un graphe exportable et juste**.

## 2. Ce qui cloche encore dans une V6 “prototype”

- Un seul fichier HTML de 57 ko : impossible à faire évoluer à plusieurs.
- Sauvegarde `localStorage` : casse dès que la photo est lourde.
- Pas de bibliothèque de projets, pas d’autosave robuste.
- UI dense, peu hiérarchisée, look “outil interne”.
- Analyse bloquante sur le thread UI.
- Pas d’OCR, pas de deskew, pas de pipeline de qualité d’image.
- Graphe pauvre : pas de notes, tags, sources, pièces jointes, versions.
- Exports limités au moment où l’utilisateur veut coller dans Notion, Obsidian, Miro, XMind.
- Aucune mesure : on ne sait pas si la détection aide vraiment.
- PWA minimale (pas d’icônes soignées, pas de file handler sérieux).

## 3. Architecture cible (le vrai saut technique)

Découper en couches, même sans framework lourd :

```
ui/          coquille, inspecteur, palette, projets
graph/       modèle, historique, sélection, layout
vision/      prétraitement, ink, régions, branches (Web Worker)
io/          IndexedDB, import/export, schéma versionné
telemetry/   compteurs locaux anonymes (optionnels)
```

Règles non négociables :

- Le worker ne touche jamais au DOM.
- Le graphe a un schéma versionné (`version: 7`) avec migrations.
- L’image originale reste la source de vérité ; les canvases d’analyse sont dérivés.
- Toute mutation passe par des commandes (undo/redo réel, pas un clone global seulement).

Persistance : **IndexedDB + miniatures + blobs**. Jamais la photo brute dans `localStorage`.

## 4. Pipeline vision “studio”

Ordre professionnel, avant même de parler d’IA :

1. **Qualité d’entrée** : EXIF orientation, downscale intelligent, suppression des reflets, balance des blancs simple, deskew par Hough / projection, crop du papier.
2. **Calque encre** : séparation papier / trait multi-canal, pas seulement un seuil.
3. **Calque texte** : zones denses candidates OCR (même si l’OCR arrive plus tard).
4. **Calque structure** : deux experts déjà là (organique vs boîtes) + un arbitre de confiance.
5. **Graphe** : nœuds, polylignes, parent probable, cycles détectés.
6. **Revue** : chaque objet a un score et un motif d’échec (“branche coupée”, “boîte trop ouverte”).

L’apprentissage couleur de la V6 est une bonne idée produit. Le rendre pro :

- plusieurs profils de crayon (noir, bleu, rouge, fluo) ;
- échantillons par branche, pas un seul vecteur global ;
- oubli / reset visible ;
- visualisation du masque “encre retenue”.

OCR local ensuite seulement (Tesseract.wasm, puis modèle handwriting plus tard). Toujours optionnel, toujours on-device.

## 5. UX d’un outil qu’on oserait facturer

- Écran d’accueil : Nouveau / Exemple / Derniers projets, pas une sidebar déjà pleine.
- Mode **Revue** : un élément après l’autre, A/Z = correct/mauvais, comme un outil de labeling.
- Mode **Focus photo** plein écran sur tablette, pouce pour les outils.
- Carte : pan/zoom fluide, multi-sélection, alignement, groupes, couleurs sémantiques.
- Inspecteur : libellé, notes, type, source, confiance, extrait photo, historique de l’élément.
- Palette ⌘K, raccourcis, thème, statut toujours visible.
- Temps d’analyse affiché. Jamais d’écran mort.

La V7 livrée ici pose cette coquille : projets, ⌘K, thème, notes, recherche, drag-and-drop, exports Markdown/Mermaid/OPML, barre de statut, overlay d’analyse.

## 6. Graphe et interop — c’est ça, “pro”

Un facilitateur ne veut pas “un SVG joli”. Il veut **reprendre le travail demain matin**.

Minimum sérieux :

- JSON versionné Sketch2Map
- Markdown hiérarchique (Obsidian / Notion)
- Mermaid (docs, GitHub)
- OPML (outliners)
- FreeMind / XMind / Coggle si le marché l’exige
- PNG/SVG pour slides
- Copier vers presse-papiers (Mermaid, outline)

Plus tard : API d’export vers Miro / FigJam via fichier, pas forcément via OAuth dès le jour 1.

Ajouter au modèle : `notes`, `tags`, `author`, `sessionId`, `confidence`, `sourcePath`, `crop`, `verifiedAt`.

## 7. Qualité logicielle

- Tests de non-régression vision : 30 photos gold (organique, paperboard, whiteboard, mauvaises lumières) + graphe attendu à une tolérance près.
- Mesurer : précision nœuds, rappel branches, temps médian de correction humaine.
- Découper le HTML monolithe.
- Accessibilité : focus visible, labels, contrastes, taille des cibles 44 px.
- Performance : worker, OffscreenCanvas, budgets (analyse < 3 s sur 12 MP en mode équilibré).

## 8. Ce qu’il ne faut pas faire trop tôt

- Brancher GPT pour “lire le schéma” : coût, confidentialité, latence, et ça casse la promesse locale.
- Devenir un clone de Miro.
- Ajouter 40 réglages. Quatre sliders, c’est déjà trop pour un non-expert : les cacher derrière “Avancé”.
- Promettre l’OCR manuscrit parfait.

L’IA a un rôle plus tard, **local et borné** : proposer un libellé à partir du crop, classer le type de nœud, suggérer le parent manquant. Jamais comme condition de fonctionnement.

## 9. Trajectoire de versions

- **V7 (cette livraison)** : coquille studio, projets, exports, UX de base professionnelle.
- **V8** : worker + deskew + masque encre visualisable + mode revue clavier.
- **V9** : OCR de zones + suggestions de libellés on-device.
- **V10** : sessions multi-photos, fusion de cartes, partage par fichier chiffré.

## 10. Positionnement business

Produit de niche, fort consentement à payer s’il sauve 20 minutes après chaque atelier.

Offre simple :

- App locale gratuite pour 1 projet à la fois.
- Studio payant : projets illimités, exports avancés, mode revue, lots de photos.
- Licence équipe : dossier de sessions, charte de types de nœuds, export pack atelier.

La confidentialité (tout reste sur l’appareil) est l’argument enterprise, pas un détail.

---

En résumé : pousser “beaucoup plus loin” ce n’est pas empiler des boutons. C’est traiter Sketch2Map comme un **pipeline de document** — capture, reconstruction, revue, mémoire, interop — avec la détection comme moteur, pas comme produit.
