export interface BenchmarkCase {
  id: string;
  input: string;
  profile: string;
  requiredTerms: string[];
  forbiddenAdditions?: string[];
  expectedIntent: string;
}

export const BENCHMARK_DATASET: BenchmarkCase[] = [
  // Code mal formulé
  { id: "code-1", input: "ajoute un bouton dans le dashboard pour exporter en pdf", profile: "frontend", requiredTerms: ["dashboard", "PDF"], expectedIntent: "Ajouter un bouton d'export PDF dans le dashboard." },
  { id: "code-2", input: "corrige le formulaire sur mobile il est cassé", profile: "frontend", requiredTerms: ["formulaire", "mobile"], expectedIntent: "Corriger le formulaire sur mobile." },
  { id: "code-3", input: "refactorise ce bout de code en ts propre stp", profile: "code", requiredTerms: ["refactoriser", "TypeScript"], expectedIntent: "Refactoriser le code en TypeScript propre." },
  { id: "code-4", input: "fait en sorte que le bouton soit disabled quand le form est invalide", profile: "frontend", requiredTerms: ["bouton", "disabled", "formulaire"], expectedIntent: "Désactiver le bouton quand le formulaire est invalide." },
  { id: "code-5", input: "ajoute une validation email cote client", profile: "frontend", requiredTerms: ["validation", "email", "client"], expectedIntent: "Ajouter une validation email côté client." },

  // Frontend
  { id: "frontend-1", input: "améliore la card et fait qu'elle marche mobile", profile: "frontend", requiredTerms: ["card", "mobile", "responsive"], expectedIntent: "Améliorer la carte et la rendre responsive mobile." },
  { id: "frontend-2", input: "crée une modale de confirmation pour la suppression", profile: "frontend", requiredTerms: ["modale", "confirmation", "suppression"], expectedIntent: "Créer une modale de confirmation pour la suppression." },
  { id: "frontend-3", input: "ajoute un loader quand les données chargent", profile: "frontend", requiredTerms: ["loader", "chargement"], expectedIntent: "Ajouter un état de chargement." },
  { id: "frontend-4", input: "gère l'état vide de la liste d'utilisateurs", profile: "frontend", requiredTerms: ["état vide", "utilisateurs"], expectedIntent: "Gérer l'état vide de la liste d'utilisateurs." },
  { id: "frontend-5", input: "rends le header sticky et responsive", profile: "frontend", requiredTerms: ["header", "sticky", "responsive"], expectedIntent: "Rendre le header sticky et responsive." },

  // Web design
  { id: "design-1", input: "design une landing page pour une app de fitness", profile: "web-design", requiredTerms: ["landing page", "fitness"], expectedIntent: "Concevoir une landing page pour une app fitness." },
  { id: "design-2", input: "modernise la page d'accueil sans changer le logo", profile: "web-design", requiredTerms: ["page d'accueil", "logo"], forbiddenAdditions: ["changer le logo"], expectedIntent: "Moderniser la page d'accueil en conservant le logo." },
  { id: "design-3", input: "crée une palette de couleurs accessible pour le dashboard", profile: "web-design", requiredTerms: ["palette", "accessible", "dashboard"], expectedIntent: "Créer une palette accessible pour le dashboard." },
  { id: "design-4", input: "améliore le contraste des textes sur fond sombre", profile: "web-design", requiredTerms: ["contraste", "fond sombre"], expectedIntent: "Améliorer le contraste des textes sur fond sombre." },
  { id: "design-5", input: "fais une maquette de la page pricing avec 3 plans", profile: "web-design", requiredTerms: ["maquette", "pricing", "3 plans"], expectedIntent: "Concevoir la page pricing avec trois plans." },

  // Bugs
  { id: "debug-1", input: "j'ai une erreur 500 quand je clique sur sauvegarder", profile: "debug", requiredTerms: ["erreur 500", "sauvegarder"], expectedIntent: "Diagnostiquer l'erreur 500 au clic sur sauvegarder." },
  { id: "debug-2", input: "l'appli crash au lancement sur iOS", profile: "debug", requiredTerms: ["crash", "iOS", "lancement"], expectedIntent: "Diagnostiquer le crash au lancement sur iOS." },
  { id: "debug-3", input: "les données ne s'affichent pas dans le tableau apres le fetch", profile: "debug", requiredTerms: ["données", "tableau", "fetch"], expectedIntent: "Diagnostiquer l'absence d'affichage des données après le fetch." },
  { id: "debug-4", input: "timeout sur l'api users quand il y a trop de resultats", profile: "debug", requiredTerms: ["timeout", "API users"], expectedIntent: "Diagnostiquer le timeout sur l'API users." },
  { id: "debug-5", input: "le bouton submit reste grisé apres avoir corrigé les champs", profile: "debug", requiredTerms: ["bouton submit", "grisé"], expectedIntent: "Diagnostiquer le bouton submit qui reste grisé." },

  // Audits
  { id: "review-1", input: "fais une revue de sécurité de l'authentification", profile: "review", requiredTerms: ["revue", "sécurité", "authentification"], expectedIntent: "Faire une revue de sécurité de l'authentification." },
  { id: "review-2", input: "audit les perfs du chargement initial", profile: "review", requiredTerms: ["audit", "performances", "chargement initial"], expectedIntent: "Auditer les performances du chargement initial." },
  { id: "review-3", input: "vérifie la qualité du code de la branche feature/paiement", profile: "review", requiredTerms: ["qualité", "feature/paiement"], expectedIntent: "Vérifier la qualité du code de la branche feature/paiement." },
  { id: "review-4", input: "analyse les risques du nouveau système de permissions", profile: "review", requiredTerms: ["risques", "permissions"], expectedIntent: "Analyser les risques du système de permissions." },
  { id: "review-5", input: "revoir le refactor de la page produit", profile: "review", requiredTerms: ["revue", "refactor", "page produit"], expectedIntent: "Revoir le refactor de la page produit." },

  // Rédaction générale
  { id: "writing-1", input: "rédige un email de relance pour le client", profile: "writing", requiredTerms: ["email", "relance", "client"], expectedIntent: "Rédiger un email de relance client." },
  { id: "writing-2", input: "formule une description de poste pour un dev frontend", profile: "writing", requiredTerms: ["description", "poste", "frontend"], expectedIntent: "Formuler une description de poste frontend." },
  { id: "writing-3", input: "corrige ce message slack pour qu'il soit plus clair", profile: "writing", requiredTerms: ["message", "Slack", "clair"], expectedIntent: "Corriger un message Slack pour plus de clarté." },
  { id: "writing-4", input: "écris un post de blog sur les bonnes pratiques React", profile: "writing", requiredTerms: ["post", "blog", "React"], expectedIntent: "Écrire un article de blog sur les bonnes pratiques React." },
  { id: "writing-5", input: "résume ce texte en 3 phrases", profile: "writing", requiredTerms: ["résumer", "3 phrases"], expectedIntent: "Résumer un texte en trois phrases." },

  // Prompts très courts
  { id: "short-1", input: "fix bug", profile: "debug", requiredTerms: ["corriger", "bug"], expectedIntent: "Corriger un bug." },
  { id: "short-2", input: "refactor login", profile: "code", requiredTerms: ["refactoriser", "login"], expectedIntent: "Refactoriser le login." },
  { id: "short-3", input: "redige email", profile: "writing", requiredTerms: ["rédiger", "email"], expectedIntent: "Rédiger un email." },
  { id: "short-4", input: "design hero", profile: "web-design", requiredTerms: ["concevoir", "hero"], expectedIntent: "Concevoir un hero." },

  // Prompts longs
  { id: "long-1", input: "je veux que tu ajoutes une page settings avec toutes les options utilisateur, qu'on puisse changer le nom, l'email, le mot de passe, la langue, les notifications, et qu'on puisse supprimer son compte, mais ne touche pas à l'auth existante", profile: "frontend", requiredTerms: ["page settings", "nom", "email", "mot de passe", "langue", "notifications", "supprimer compte"], forbiddenAdditions: ["auth"], expectedIntent: "Ajouter une page settings complète sans toucher à l'auth." },
  { id: "long-2", input: "crée un dashboard admin avec une sidebar, un header, des widgets pour les stats utilisateurs, les revenus, les erreurs, et un tableau des derniers signalements, tout en respectant le design system actuel basé sur tailwind et shadcn", profile: "frontend", requiredTerms: ["dashboard admin", "sidebar", "header", "widgets", "Tailwind", "shadcn"], expectedIntent: "Créer un dashboard admin complet en respectant le design system." },

  // Fautes importantes
  { id: "typos-1", input: "ajoute un bouteon dan sle dashbord", profile: "frontend", requiredTerms: ["bouton", "dashboard"], expectedIntent: "Ajouter un bouton dans le dashboard." },
  { id: "typos-2", input: "le formualire marche pa sur moblie", profile: "frontend", requiredTerms: ["formulaire", "mobile"], expectedIntent: "Le formulaire ne marche pas sur mobile." },

  // Mélange français/anglais technique
  { id: "mix-1", input: "il faut refactor le AuthContext pour qu'il utilise le nouveau hook useSession", profile: "code", requiredTerms: ["AuthContext", "useSession", "refactoriser"], expectedIntent: "Refactoriser AuthContext pour utiliser useSession." },
  { id: "mix-2", input: "update le composant Button avec les nouveaux tokens du design system", profile: "frontend", requiredTerms: ["Button", "tokens", "design system"], expectedIntent: "Mettre à jour le composant Button avec les nouveaux tokens." },

  // Blocs de code
  { id: "codeblock-1", input: "```ts\nconst x = 1\n```\nexplique ce code", profile: "code", requiredTerms: ["expliquer", "code"], expectedIntent: "Expliquer le code TypeScript." },
  { id: "codeblock-2", input: "```bash\nnpm install\n```\nfais en sorte que cette commande soit dans le README", profile: "code", requiredTerms: ["npm install", "README"], expectedIntent: "Ajouter la commande npm install dans le README." },

  // Commandes et chemins à préserver
  { id: "preserve-1", input: "dans src/components/Header.tsx change le lien par /dashboard", profile: "frontend", requiredTerms: ["src/components/Header.tsx", "/dashboard"], expectedIntent: "Modifier le lien dans Header.tsx vers /dashboard." },
  { id: "preserve-2", input: "exécute pnpm test avant de commit", profile: "code", requiredTerms: ["pnpm test", "commit"], expectedIntent: "Exécuter pnpm test avant de commit." },

  // Clean
  { id: "clean-1", input: "bonjour, je voudrai savoir si c'est possible de reporter la reunion", profile: "clean", requiredTerms: ["reporter", "réunion"], expectedIntent: "Demander si la réunion peut être reportée." },
  { id: "clean-2", input: "peux tu m'envoyer le doc final stp", profile: "clean", requiredTerms: ["envoyer", "document final"], expectedIntent: "Demander l'envoi du document final." },
];
