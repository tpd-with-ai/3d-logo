import { basicSetup } from 'codemirror';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { setDiagnostics } from '@codemirror/lint';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { findCommand, NAMED_COLORS } from '../lang/commands';
import type { LogoError, Span } from '../lang/errors';

const logoLanguage = StreamLanguage.define<null>({
  name: 'logo3d',
  startState: () => null,
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^;.*/)) return 'comment';
    if (stream.match(/^(\d+(\.\d+)?|\.\d+)/)) return 'number';
    if (stream.match(/^#[0-9a-fA-F]{3,6}\b/)) return 'string';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      const word = stream.current().toLowerCase();
      if (word === 'repeat') return 'keyword';
      if (word === 'repcount') return 'variableName.special';
      if (findCommand(word)) return 'variableName.function';
      if (word in NAMED_COLORS) return 'atom';
      return 'invalid';
    }
    if (stream.match(/^[[\]]/)) return 'bracket';
    if (stream.match(/^[()]/)) return 'paren';
    if (stream.match(/^[-+*/]/)) return 'operator';
    stream.next();
    return 'invalid';
  },
  languageData: { commentTokens: { line: ';' } },
});

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: '#7d8bab', fontStyle: 'italic' },
  { tag: tags.number, color: '#fbbf24' },
  { tag: tags.string, color: '#f9a8d4' },
  { tag: tags.atom, color: '#f9a8d4' },
  { tag: tags.keyword, color: '#c4b5fd', fontWeight: '600' },
  { tag: tags.function(tags.variableName), color: '#7dd3fc' },
  { tag: tags.special(tags.variableName), color: '#86efac' },
  { tag: tags.operator, color: '#cbd5e1' },
  { tag: [tags.bracket, tags.paren], color: '#94a3b8' },
  { tag: tags.invalid, color: '#fca5a5', textDecoration: 'underline wavy #f87171' },
]);

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'transparent', color: '#e2e8f0', fontSize: '14.5px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: '#f8fafc', padding: '10px 0' },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#5b6785', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(148, 163, 184, 0.07)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#cbd5e1' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(56, 189, 248, 0.28) !important',
    },
    '.cm-cursor': { borderLeftColor: '#f8fafc' },
    '.cm-step': { backgroundColor: 'rgba(250, 204, 21, 0.28)', borderRadius: '3px', outline: '1px solid rgba(250, 204, 21, 0.6)' },
    '.cm-tooltip': { backgroundColor: '#1b2338', border: '1px solid #33405e', color: '#e2e8f0' },
    '.cm-panels': { backgroundColor: '#141b2d', color: '#e2e8f0' },
  },
  { dark: true },
);

/** Highlights the command currently being replayed. */
const setStep = StateEffect.define<Span | null>();
const stepField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(setStep)) continue;
      const span = effect.value;
      if (!span || span.length === 0 || span.offset + span.length > tr.state.doc.length) return Decoration.none;
      return Decoration.set([Decoration.mark({ class: 'cm-step' }).range(span.offset, span.offset + span.length)]);
    }
    return tr.docChanged ? Decoration.none : decorations.map(tr.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface EditorOptions {
  parent: HTMLElement;
  doc: string;
  onRun: () => void;
  onStop: () => void;
  onChange: (doc: string) => void;
  label: string;
}

export class Editor {
  readonly view: EditorView;

  constructor(options: EditorOptions) {
    const extensions: Extension[] = [
      keymap.of([
        { key: 'Mod-Enter', run: () => (options.onRun(), true) },
        { key: 'Mod-.', run: () => (options.onStop(), true) },
      ]),
      basicSetup,
      logoLanguage,
      syntaxHighlighting(highlight),
      theme,
      stepField,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': options.label }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
      }),
    ];
    this.view = new EditorView({ parent: options.parent, state: EditorState.create({ doc: options.doc, extensions }) });
  }

  get doc(): string {
    return this.view.state.doc.toString();
  }

  setDoc(doc: string): void {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: doc }, selection: { anchor: 0 } });
    this.view.scrollDOM.scrollTop = 0;
  }

  showError(error: LogoError | undefined): void {
    const length = this.view.state.doc.length;
    const diagnostics = error
      ? [
          {
            from: Math.min(error.span.offset, length),
            to: Math.min(error.span.offset + Math.max(error.span.length, 1), length),
            severity: 'error' as const,
            message: error.message,
            source: error.kind === 'syntax' ? 'Syntax error' : 'Runtime error',
          },
        ]
      : [];
    this.view.dispatch(setDiagnostics(this.view.state, diagnostics));
  }

  highlightStep(span: Span | null): void {
    this.view.dispatch({ effects: setStep.of(span) });
  }

  /** Moves the cursor to a span and focuses the editor (used by "jump to error"). */
  reveal(span: Span): void {
    const at = Math.min(span.offset, this.view.state.doc.length);
    this.view.dispatch({ selection: { anchor: at, head: Math.min(at + span.length, this.view.state.doc.length) }, scrollIntoView: true });
    this.view.focus();
  }
}
