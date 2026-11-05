/**
 * Logger minimal : console (colorée) + fichier journalier dans logs/<outil>/AAAA-MM-JJ.log.
 *
 * Variables d'environnement lues (facultatives) :
 *   LOG_LEVEL  debug | info | warn | error   (défaut : info)
 *   LOG_DIR    dossier des logs              (défaut : <racine du dépôt>/logs)
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import { REPO_ROOT } from './env.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // gris
  info: '\x1b[36m', // cyan
  warn: '\x1b[33m', // jaune
  error: '\x1b[31m', // rouge
};
const RESET = '\x1b[0m';

export interface LoggerOptions {
  /** Niveau minimal affiché/écrit. Par défaut : LOG_LEVEL ou "info". */
  level?: LogLevel;
  /** Dossier racine des logs. Par défaut : LOG_DIR ou <dépôt>/logs. */
  logDir?: string;
  /** Écrire dans un fichier (true par défaut). */
  file?: boolean;
  /** Afficher dans la console (true par défaut). */
  console?: boolean;
}

export interface Logger {
  debug(message: string, ...details: unknown[]): void;
  info(message: string, ...details: unknown[]): void;
  warn(message: string, ...details: unknown[]): void;
  error(message: string, ...details: unknown[]): void;
  /** Chemin du fichier de log du jour (undefined si l'écriture fichier est désactivée). */
  readonly filePath: string | undefined;
}

function parseLevel(raw: string | undefined): LogLevel {
  const value = raw?.trim().toLowerCase();
  return value && value in LEVELS ? (value as LogLevel) : 'info';
}

/** Date/heure locale lisible : 2026-11-05 21:55:03. */
function timestamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

function formatDetails(details: unknown[]): string {
  if (details.length === 0) return '';
  return (
    ' ' +
    details
      .map((d) =>
        d instanceof Error
          ? (d.stack ?? d.message)
          : typeof d === 'string'
            ? d
            : inspect(d, { depth: 4, breakLength: Infinity }),
      )
      .join(' ')
  );
}

/**
 * Crée un logger pour un outil.
 *
 * @example
 * const log = createLogger('ranger-telechargements');
 * log.info('Démarrage', { dryRun: true });
 */
export function createLogger(name: string, options: LoggerOptions = {}): Logger {
  const minLevel = LEVELS[options.level ?? parseLevel(process.env.LOG_LEVEL)];
  const useConsole = options.console ?? true;
  const useFile = options.file ?? true;

  const baseDir = path.resolve(options.logDir ?? process.env.LOG_DIR ?? path.join(REPO_ROOT, 'logs'));
  const toolDir = path.join(baseDir, name);
  let fileReady = false;
  let fileDisabled = false;

  const currentFile = () => path.join(toolDir, `${timestamp().slice(0, 10)}.log`);

  const write = (level: LogLevel, message: string, details: unknown[]) => {
    if (LEVELS[level] < minLevel) return;

    const line = `${timestamp()} [${level.toUpperCase().padEnd(5)}] ${message}${formatDetails(details)}`;

    if (useConsole) {
      const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
      const colored = stream.isTTY ? `${COLORS[level]}${line}${RESET}` : line;
      stream.write(colored + '\n');
    }

    if (useFile && !fileDisabled) {
      try {
        if (!fileReady) {
          mkdirSync(toolDir, { recursive: true });
          fileReady = true;
        }
        // Écriture synchrone : rien n'est perdu si le script plante juste après.
        appendFileSync(currentFile(), line + '\n', 'utf8');
      } catch (err) {
        // Un problème de fichier ne doit jamais faire planter l'outil.
        fileDisabled = true;
        process.stderr.write(`[logger] écriture impossible dans ${toolDir} : ${(err as Error).message}\n`);
      }
    }
  };

  return {
    debug: (m, ...d) => write('debug', m, d),
    info: (m, ...d) => write('info', m, d),
    warn: (m, ...d) => write('warn', m, d),
    error: (m, ...d) => write('error', m, d),
    get filePath() {
      return useFile && !fileDisabled ? currentFile() : undefined;
    },
  };
}
