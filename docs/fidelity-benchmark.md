# Benchmark de fidélité

Le benchmark appelle le moteur partagé et conserve ses résultats dans
`benchmark-results/` (ignoré par Git). Il n'enregistre que le corpus lancé
explicitement, jamais les messages saisis dans le produit.

## Messages du quotidien

Le sous-ensemble `conversation` contient le fragment « ema conv : » remonté en
usage réel et six cas synthétiques : message informel, négation, anglais,
identifiants techniques, abréviation inconnue et question à corriger sans y
répondre. Les trois niveaux sont représentés.

```sh
# Sans réseau : vérifier seulement que le protocole fonctionne
pnpm benchmark:fidelity mock --suite conversation --profile-mode both --repeat 2

# Un seul cas, pour borner une vérification réelle
pnpm benchmark:fidelity openai gpt-5.1 --case clean-ambiguous-conversation-fragment --profile-mode both --repeat 2
```

Comme les autres runners, la commande lit les credentials du provider dans
l'environnement. Chaque essai réel effectue un appel au provider choisi ;
`--repeat` accepte 1 à 10 et vaut 1 par défaut. `both` double les appels pour
exercer les profils explicite et automatique. Le comportement sans option reste
le corpus complet avec les profils explicites.

## Lire et comparer

Le JSON conserve la sortie complète, le profil demandé et appliqué, le numéro
d'essai, les signaux de qualité, le score, les tokens et la latence. Le Markdown
ajoute les critères de relecture et les paires entrée/sortie intégrales.

Avant et après un changement de prompt, lancer la même commande et comparer les
cas individuellement, à profil demandé et niveau identiques. Vérifier que
`scoreVersion`, `corpusHash` et `plan` sont identiques. Le `requestHash` de chaque
essai identifie les prompts et paramètres effectivement passés au provider ;
il changera si leur construction change, même avec un arbre Git non commité.
Un modèle distant peut évoluer sans changer d'identifiant : les répétitions
mesurent quelques observations, elles ne rendent pas le service déterministe.

Le score v2 met à zéro les sorties vides, les consignes qui délèguent la correction
et les interprétations des fragments explicitement interdits par le corpus.
Il distingue les erreurs d'exécution (`failures`) des réponses qui échouent aux
critères (`regressions`). Un score de 1 ne garantit ni la grammaire ni la fidélité
sémantique : relire le sens, les négations, le ton et le périmètre. `mock` ne
mesure aucune qualité réelle.

Les anciens scores de fidélité sans version ne sont pas comparables à v2.
`pnpm benchmark:compare` reste réservé aux rapports du benchmark général : les
rapports de fidélité se comparent avec le protocole ci-dessus.
