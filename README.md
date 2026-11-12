# 🎩 TapIn – Poker Menteur

Un jeu de bluff en **3D dans le navigateur** : des personnages entrent dans un bar enfumé, s'installent autour d'une table… et jouent au **poker menteur**, où chaque erreur se paie au **revolver**.

▶️ **Jouer :** https://malocaparros.github.io/TapIn/

Fait avec [Three.js](https://threejs.org/), sans étape de build ni dépendance à installer.

## Lancer en local

Les modules JavaScript ne se chargent pas en ouvrant directement `index.html` : il faut un petit serveur.

```bash
python3 -m http.server 8000
```

puis va sur <http://localhost:8000>.

## Se déplacer dans le bar

En entrant, tu contrôles ton personnage et tu peux te balader librement dans le bar pendant que les autres joueurs vont s'asseoir. Rejoins la **chaise libre** (cercle doré) autour de la table de poker pour lancer la partie.

| | Ordinateur | Mobile |
|---|---|---|
| Marcher | ZQSD (AZERTY) / WASD / flèches | Joystick en bas à gauche |
| Courir | Maj | Pousser le joystick à fond |
| Tourner la caméra | Glisser la souris (molette : zoom) | Glisser l'écran |
| S'asseoir | E près de la chaise | Bouton « S'asseoir » |

## Règles

1. Chaque joueur reçoit **3 cartes** cachées.
2. À tour de rôle, on annonce une combinaison de poker qui existerait parmi **toutes les cartes de la table réunies**. Chaque annonce doit être strictement plus forte que la précédente.
3. Au lieu d'enchérir, le joueur suivant peut crier **« Menteur ! »**. Toutes les cartes sont retournées :
   - si la combinaison existe, **l'accusateur** perd ;
   - sinon, c'est **l'annonceur** qui perd.
4. Le perdant pointe son revolver sur sa tempe : 6 chambres, 1 balle. Chaque coup à vide rapproche de la balle…
5. Le dernier survivant gagne.

**Ordre des annonces :** Carte haute < Paire < Double paire < Brelan < Suite < Couleur < Full < Carré < Quinte flush.
À type égal, la hauteur départage (pour les couleurs : ♣ < ♦ < ♥ < ♠).

## Les personnages

| Nom | Style de jeu |
|---|---|
| Toi | Cheveux en pics, manteau gris et écharpe |
| Renarde | Bluffeuse agressive, accuse volontiers |
| Gaston | Têtu, monte souvent, accuse rarement |
| Mme Chouette | Prudente, joue les probabilités |

L'IA estime par simulation Monte-Carlo la probabilité que chaque annonce existe à partir de ses propres cartes, puis décide selon sa personnalité.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page et interface (menu, annonces, journal) |
| `js/main.js` | Déroulement de la partie |
| `js/rules.js` | Cartes, annonces, vérification, IA |
| `js/world.js` | Scène 3D : bar, table, caméra, cartes, animations |
| `js/characters.js` | Personnages 3D (construits par code) et revolver |
| `js/audio.js` | Sons synthétisés (barillet, détonation, cartes) |
| `vendor/three.module.min.js` | Three.js r170 (licence MIT) |

Les personnages sont modélisés par code à partir de formes simples. Pour utiliser de vrais modèles 3D (fichiers `.glb`), il suffira de remplacer `buildCharacter` par un chargement via `GLTFLoader`.
