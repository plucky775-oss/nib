import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
// Original v34 control IDs. Menu regrouping may add controls, never lose an existing route.
const originalIDs=["sidebar-backdrop", "sidebar", "close-sidebar", "sidebar-library", "new-note", "note-count", "note-list", "app-version", "reload-app", "update-notice", "backup", "import", "delete-note", "help", "menu", "open-library", "title", "save-state", "export", "date", "note-tabs", "previous-page", "page-position", "next-page", "paper-zoom-out", "paper-zoom-reset", "paper-zoom-in", "delete-page", "add-page", "ink-tools", "pen", "open-pen", "open-drawing", "keyboard-text", "eraser", "eraser-options", "eraser-size", "select", "pan-page", "undo", "redo", "width", "color", "paper", "open-paper", "original", "open-settings", "convert-page", "mode-label", "auto-status", "recognition-progress", "cancel-recognition", "retry-recognition", "saved-recognition", "selection-actions", "selection-info", "selection-font", "selection-size", "selection-convert", "selection-apply-font", "selection-edit", "selection-restore", "selection-delete", "selection-clear", "object-editor", "object-edit-form", "object-editor-title", "object-text", "object-width", "object-height", "object-edit-error", "cancel-object-edit", "drawing-palette", "paper-viewport", "page-add-hint", "page", "paper-background", "page-date", "canvas", "ink", "converted-ink", "drawing-objects", "drawing-preview", "live", "lasso-path", "selection-box", "text-drag-outline", "eraser-cursor", "empty-hint", "legacy-result", "row-placement-warning", "object-recovery", "group-overflow", "detail", "toast", "import-file", "pen-dialog", "pen-title", "cancel-pen", "pen-kind-list", "pen-width-select", "pen-color-input", "pen-sample", "pen-error", "save-pen", "paper-dialog", "paper-title", "cancel-paper", "paper-sample", "paper-theme-list", "paper-scope", "paper-error", "save-paper", "notebook-dialog", "notebook-form", "notebook-dialog-title", "notebook-name", "cover-preview", "cover-preview-title", "cover-choice", "notebook-error", "new-paper-label", "new-paper-theme", "cancel-notebook", "save-notebook", "library-dialog", "library-title", "library-count", "close-library", "library-search", "library-sort", "library-grid", "library-list", "library-new", "library-items", "library-empty", "library-more", "library-all", "library-favorites", "pages-dialog", "pages-title", "close-pages", "page-list", "pages-previous", "pages-more", "pages-add", "settings-dialog", "close-settings", "ink-mode", "text-mode", "ink-settings", "smooth", "touch", "shape-correct", "text-settings", "recognize", "auto-convert", "edit-text", "add-font", "font-file", "missing-font", "font-options", "font-size", "help-dialog", "close-help", "text-edit-dialog", "text-input-title", "text-input-font", "text-input-size", "text-editor", "text-input-error", "save-text-edit", "cancel-text-edit", "export-dialog", "backup-notebook", "export-png", "print", "close-export", "ocr-dialog", "send-consent", "access-code", "ocr-message", "run-ocr", "cancel-ocr", "saved-recognition-dialog", "saved-recognition-info", "saved-recognition-text", "close-saved-recognition"];

test('menu redesign preserves every existing feature control exactly once',()=>{
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,'duplicate IDs break existing handler bindings');
 for(const id of originalIDs)assert.equal(ids.filter(value=>value===id).length,1,'missing original control '+id);
});
test('text insertion remains the v34 modal and never restores rejected direct body editing',()=>{
 assert.match(html,/<dialog id="text-edit-dialog" aria-labelledby="text-input-title">/);
 assert.match(html,/<textarea[^>]*id="text-editor"/);
 assert.match(html,/id="save-text-edit"/);
 assert.doesNotMatch(html,/id="body-editor"|id="body-controls"/);
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/from ['"]\.\/(?:body-text|inline-body)\.js['"]/);
});
// UX-only scope: databases, saved content, AI transport and keyboard modal semantics are unchanged.
const unchanged={"src/core.js": "59906ed42d4c80c482ec5e2c5f08dddfbaaecb948c3cea295321a8fb1ab98e4b", "src/storage.js": "55c584145cffcad2604dfaa4972b57668d8260be34fa6404b5bd0be9d4a4a467", "src/notebooks.js": "f4180a28dddeec46e0f567332913e55c5faba930d8d050e75f0c1cd2380ba8ea", "src/keyboard-text.js": "3bb7357b64b1a78046a529bed69f0d68f3c62e526288f36357a7635e2f49890b", "src/text-object-editor.js": "157759f633c3b52b1dfd4d99b454a13ed2dae45ad73e3687fde5d1c2c19453fb", "src/recognition-client.js": "9ca43dcab13946e1edaeace993c9cb4ef321321a5da50be75429df801b12b7e4", "api/recognize.js": "bee821b653d44bae23e9202c4d9f5c2b2b3c39d5d111d0595537713c4f471dbf", "api/status.js": "73ffa27854925c839052fb587d9848bbd1f7779bff5fa8e383aed8d06f5fa030"};
for(const [path,expected] of Object.entries(unchanged))test('menu-only release preserves data and recognition implementation: '+path,()=>{
 const bytes=readFileSync(new URL('../'+path,import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
});
