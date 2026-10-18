/**
 * The complete built-in command set. The parser uses this table for arity and aliases, and the
 * playground renders its help panel from it, so documentation and behavior cannot drift apart.
 */
export type ArgKind = 'none' | 'distance' | 'angle' | 'color';

export interface CommandInfo {
  name: string;
  aliases: readonly string[];
  arg: ArgKind;
  summary: string;
  group: 'Move' | 'Turn' | 'Pen & drawing' | 'Reset';
}

export const COMMANDS = [
  { name: 'forward', aliases: ['fd'], arg: 'distance', group: 'Move', summary: 'Move along the heading H.' },
  { name: 'back', aliases: ['bk'], arg: 'distance', group: 'Move', summary: 'Move opposite to the heading.' },
  { name: 'home', aliases: [], arg: 'none', group: 'Move', summary: 'Move to the origin (draws if pen is down) and face the start orientation.' },
  { name: 'yawleft', aliases: ['left', 'lt'], arg: 'angle', group: 'Turn', summary: 'Yaw about the up axis U: the nose swings toward the left wing.' },
  { name: 'yawright', aliases: ['right', 'rt'], arg: 'angle', group: 'Turn', summary: 'Yaw about the up axis U: the nose swings toward the right wing.' },
  { name: 'pitchup', aliases: ['climb'], arg: 'angle', group: 'Turn', summary: 'Pitch about the wing axis: the nose rises toward U.' },
  { name: 'pitchdown', aliases: ['dive'], arg: 'angle', group: 'Turn', summary: 'Pitch about the wing axis: the nose drops away from U.' },
  { name: 'rollleft', aliases: ['rl'], arg: 'angle', group: 'Turn', summary: 'Roll about the heading H: the left wing drops.' },
  { name: 'rollright', aliases: ['rr'], arg: 'angle', group: 'Turn', summary: 'Roll about the heading H: the right wing drops.' },
  { name: 'penup', aliases: ['pu'], arg: 'none', group: 'Pen & drawing', summary: 'Stop drawing; ends the current triangle strip.' },
  { name: 'pendown', aliases: ['pd'], arg: 'none', group: 'Pen & drawing', summary: 'Start drawing; starts a new strip in triangle mode.' },
  { name: 'lines', aliases: [], arg: 'none', group: 'Pen & drawing', summary: 'Line mode: each pen-down move draws a segment.' },
  { name: 'triangles', aliases: [], arg: 'none', group: 'Pen & drawing', summary: 'Triangle mode: start a new strip here; each move adds a point.' },
  { name: 'color', aliases: [], arg: 'color', group: 'Pen & drawing', summary: 'Set the pen color: a name (red) or hex (#ff8800).' },
  { name: 'clear', aliases: [], arg: 'none', group: 'Reset', summary: 'Erase the drawing. The turtle stays where it is.' },
  { name: 'reset', aliases: [], arg: 'none', group: 'Reset', summary: 'Erase the drawing and restore every start setting.' },
] as const satisfies readonly CommandInfo[];

export type CommandName = (typeof COMMANDS)[number]['name'];

const byWord = new Map<string, CommandInfo & { name: CommandName }>();
for (const command of COMMANDS) {
  byWord.set(command.name, command);
  for (const alias of command.aliases) byWord.set(alias, command);
}

/** Looks up a command by its lowercase name or alias. */
export function findCommand(word: string): (CommandInfo & { name: CommandName }) | undefined {
  return byWord.get(word);
}

/** Every word the parser treats as reserved: command names, aliases, and keywords. */
export const RESERVED_WORDS: readonly string[] = [...byWord.keys(), 'repeat', 'repcount'];

/** Named colors. The first entry is the default pen color. */
export const NAMED_COLORS: Readonly<Record<string, string>> = {
  cyan: '#22d3ee',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#facc15',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  brown: '#a16207',
  white: '#f8fafc',
  gray: '#94a3b8',
  black: '#1e293b',
};

export const DEFAULT_COLOR = NAMED_COLORS.cyan;
