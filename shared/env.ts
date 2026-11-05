/**
 * Chargement de la configuration depuis des fichiers .env, sans dépendance.
 *
 * Ordre de priorité (le premier gagne) :
 *   1. variables déjà présentes dans l'environnement (session, Planificateur de tâches...)
 *   2. .env de l'outil   (ex. tools/mon-outil/.env)
 *   3. .env racine du dépôt (réglages communs : LOG_LEVEL, LOG_DIR...)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/** Racine du dépôt (shared/ est à la racine). */
export const REPO_ROOT = path.resolve(import.meta.dirname, '..');

export interface LoadEnvOptions<R extends string, O extends string> {
  /** Variables obligatoires : erreur explicite si l'une manque ou est vide. */
  required?: readonly R[];
  /** Variables facultatives avec leur valeur par défaut. */
  defaults?: Readonly<Record<O, string>>;
  /** Dossier de l'outil (en général import.meta.dirname) pour charger son .env. */
  toolDir?: string;
  /** Charger aussi le .env racine (true par défaut). */
  includeRoot?: boolean;
}

export class MissingEnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[], searched: string[]) {
    const where = searched.length > 0 ? searched.join(', ') : 'aucun fichier .env trouvé';
    super(
      `Variable(s) d'environnement obligatoire(s) manquante(s) : ${missing.join(', ')}\n` +
        `Fichiers lus : ${where}\n` +
        `→ Copie le .env.example en .env et renseigne ces valeurs.`,
    );
    this.name = 'MissingEnvError';
    this.missing = missing;
  }
}

function readEnvFile(file: string): Record<string, string> {
  if (!existsSync(file)) return {};
  // Retire un éventuel BOM UTF-8 (fréquent avec le Bloc-notes / Out-File sous Windows).
  const content = readFileSync(file, 'utf8').replace(/^﻿/, '');
  return parseEnv(content) as Record<string, string>;
}

/**
 * Charge les fichiers .env dans process.env (sans écraser l'existant),
 * vérifie les variables obligatoires et renvoie un objet typé.
 *
 * @example
 * const env = loadEnv({
 *   toolDir: import.meta.dirname,
 *   required: ['SOURCE_DIR'],
 *   defaults: { DRY_RUN: 'true' },
 * });
 * env.SOURCE_DIR; // string
 */
export function loadEnv<R extends string = never, O extends string = never>(
  options: LoadEnvOptions<R, O> = {},
): Record<R | O, string> {
  const { required = [], defaults, toolDir, includeRoot = true } = options;

  // Du moins prioritaire au plus prioritaire.
  const files: string[] = [];
  if (includeRoot) files.push(path.join(REPO_ROOT, '.env'));
  if (toolDir) {
    const toolEnv = path.join(path.resolve(toolDir), '.env');
    if (!files.includes(toolEnv)) files.push(toolEnv);
  }

  const merged: Record<string, string> = {};
  const searched: string[] = [];
  for (const file of files) {
    if (existsSync(file)) searched.push(path.relative(REPO_ROOT, file) || file);
    Object.assign(merged, readEnvFile(file));
  }

  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  if (defaults) {
    for (const [key, value] of Object.entries(defaults) as [string, string][]) {
      if (process.env[key] === undefined || process.env[key] === '') process.env[key] = value;
    }
  }

  const missing = required.filter((key) => (process.env[key] ?? '').trim() === '');
  if (missing.length > 0) throw new MissingEnvError(missing, searched);

  const result = {} as Record<R | O, string>;
  const keys = [...required, ...(defaults ? (Object.keys(defaults) as O[]) : [])];
  for (const key of keys) result[key] = process.env[key] as string;
  return result;
}

/** Lit une variable booléenne : true/1/yes/oui/on → true. */
export function envBool(name: string, fallback = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return ['true', '1', 'yes', 'oui', 'on'].includes(raw);
}

/** Lit une variable entière, erreur claire si la valeur n'est pas un nombre. */
export function envInt(name: string, fallback?: number): number {
  const raw = process.env[name]?.trim();
  if (raw === undefined || raw === '') {
    if (fallback === undefined) throw new MissingEnvError([name], []);
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`${name} doit être un entier (reçu : "${raw}")`);
  return value;
}
