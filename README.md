# 🎩 TapIn – Poker Menteur

Un jeu de bluff dans un bar enfumé : du **poker menteur** où chaque erreur se paie… au **revolver**.

Jouable directement dans le navigateur, sans installation ni dépendance.

## Jouer

Ouvre simplement `index.html` dans ton navigateur, ou lance un petit serveur :

```bash
python3 -m http.server 8000
```

puis va sur <http://localhost:8000>.

## Règles

1. Chaque joueur reçoit **3 cartes** cachées.
2. À tour de rôle, on annonce une combinaison de poker qui existerait parmi **toutes les cartes de la table réunies**. Chaque annonce doit être strictement plus forte que la précédente.
3. Au lieu d'enchérir, le joueur suivant peut crier **« Menteur ! »**. Toutes les cartes sont retournées :
   - si la combinaison existe, **l'accusateur** perd ;
   - sinon, c'est **l'annonceur** qui perd.
4. Le perdant tire avec son revolver : 6 chambres, 1 balle. Chaque coup à vide rapproche de la balle…
5. Le dernier survivant gagne.

**Ordre des annonces :** Carte haute < Paire < Double paire < Brelan < Suite < Couleur < Full < Carré < Quinte flush.
À type égal, la hauteur départage (pour les couleurs : ♣ < ♦ < ♥ < ♠).

## Les adversaires

| | Nom | Style |
|---|---|---|
| 🦊 | Renarde | Bluffeuse agressive, accuse volontiers |
| 🐗 | Gaston | Têtu, monte souvent, accuse rarement |
| 🦉 | Mme Chouette | Prudente, joue les probabilités |

L'IA estime par simulation Monte-Carlo la probabilité que chaque annonce existe, à partir de ses propres cartes, puis décide selon sa personnalité (seuil de doute, prise de risque, fréquence de bluff).

## Structure

- `index.html` – structure de la page
- `style.css` – ambiance du bar et table
- `game.js` – règles, IA et déroulement de la partie

## Idées pour la suite

- Mode multijoueur en ligne
- Sons (clic du barillet, détonation, brouhaha du bar)
- Tenir compte des annonces adverses dans l'IA
- Variante « une carte de plus à chaque défaite »
