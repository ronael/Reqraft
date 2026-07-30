# Capture texte du POC OpenTUI

```text
reqraft  POC OpenTUI                                      openai / gpt-4.1-mini / success / 100 cols

╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ › Prompt original                                           1 ligne · 17 mots                  ║
║                                                                                                  ║
║ Je veux créer une landing page premium pour Reqraft, claire, élégante et utilisable par une IA. ║
║                                                                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════╝

┌ profil auto ^P ┐  ┌ niveau standard ^L ┐  ┌ provider openai ^I ┐  ┌ modèle gpt-4.1-mini ^O ┐

╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ › Prompt amélioré                                      1.9 s · 32 entrée · 132 sortie          ║
║                                                                                                  ║
║ ! Qualité à vérifier : le POC simule une reformulation riche ; il ne garantit pas encore        ║
║   la fidélité métier.                                                                            ║
║                                                                                                  ║
║ Crée une landing page premium pour Reqraft.                                                      ║
║                                                                                                  ║
║ Objectif : présenter un CLI de reformulation de prompts pour agents IA.                          ║
║                                                                                                  ║
║ Structure attendue :                                                                             ║
║ - hero sobre avec le nom Reqraft visible dès le premier écran ;                                  ║
║ - bénéfices concrets : clarté, fidélité, vitesse ;                                               ║
║ - section montrant un prompt brut puis sa version améliorée ;                                    ║
║ - preuves de qualité : providers, profils, stats et garde-fous ;                                 ║
║ - appel à l'action pour installer et tester le CLI.                                              ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════╝

^G Générer  ^P Profil  ^L Niveau  ^I Provider  ^O Modèle  ^E Erreur  ^R Reset  ^Y Copier  ? Aide  Tab Focus  Esc Fermer
```

États vérifiés manuellement :

- vide ;
- loading ;
- streaming ;
- succès avec warning qualité ;
- erreur mock ;
- picker de profil ;
- resize terminal à 80 colonnes.
