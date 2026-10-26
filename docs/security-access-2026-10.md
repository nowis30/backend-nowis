# Accès et inscription

L'inscription publique est désactivée par défaut. Un administrateur existant crée les accès dans la gestion des utilisateurs. `ALLOW_PUBLIC_REGISTRATION=true` autorise seulement un compte personnel sans rôle administratif; les droits se donnent explicitement ensuite.

Les routes utilisant `requireRole` exigent maintenant un rôle global (`companyId: null`). Un rôle limité à une société ne permet plus de gérer les utilisateurs ou les rôles de toutes les sociétés. Les futurs endpoints délégués à une société devront vérifier cette société explicitement.

Le diagnostic public des conseillers retourne uniquement l'état de configuration. Il ne certifie pas la connectivité et ne lance aucune génération facturable.

Avant mise en production, vérifier les comptes ayant reçu ADMIN par l'ancienne inscription. Cette modification ne supprime ni compte ni droit existant automatiquement. Effectuer cette revue avec les responsables autorisés, puis tester deux comptes de sociétés différentes sur une base isolée.

Contrôle local ciblé : `npm test -- --runTestsByPath src/__tests__/accessBoundaries.unit.test.ts`. Les dépendances de stockage sont simulées; ces tests n'accèdent à aucune base ni fournisseur IA.

Le script `migrate:fallback` qui acceptait la perte de données a été retiré. Employer les migrations versionnées après sauvegarde et validation. Les fichiers locaux `.env`, `prisma/dev.db` et les sorties compilées `dist/` ne sont plus suivis : créer sa configuration depuis `.env.example` et exécuter le build avant `npm start`. Aucun contenu de base existante n’est modifié par cette PR.
