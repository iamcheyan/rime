(function (global) {
  class VimMode {
    constructor(editor, options = {}) {
      this.editor = editor;
      this.enabled = false;
      this.mode = 'insert'; // 'normal', 'insert'
      this.onModeChange = options.onModeChange || (() => {});
      this.clipboard = '';
      this._pendingAction = null;
      this._pendingActionTimeout = null;

      // UI Elements
      this.verticalRuler = document.getElementById('vertical-ruler');
      this.statusTag = document.getElementById('vim-status');
      this.cursorPosInfo = document.getElementById('cursor-pos');
      this.fileInfo = document.getElementById('file-info');
      
      this.handleKeyDown = this.handleKeyDown.bind(this);
      this.handleClick = this.updateUI.bind(this);
      this.handleInput = this.updateUI.bind(this);
      this.handleScroll = this.updateUI.bind(this);
      this.init();
    }

    init() {
      this.editor.addEventListener('keydown', this.handleKeyDown, true);
      this.editor.addEventListener('click', this.handleClick);
      this.editor.addEventListener('input', this.handleInput);
      this.editor.addEventListener('scroll', this.handleScroll);
    }

    enable() {
      this.enabled = true;
      this.setMode('insert'); // Default to insert mode even when enabled
      this.updateUI();
    }

    disable() {
      this.enabled = false;
      this.setMode('insert');
    }

    destroy() {
      this.disable();
      this.editor.removeEventListener('keydown', this.handleKeyDown, true);
      this.editor.removeEventListener('click', this.handleClick);
      this.editor.removeEventListener('input', this.handleInput);
      this.editor.removeEventListener('scroll', this.handleScroll);
    }

    setMode(mode) {
      this.mode = mode;
      if (mode === 'normal') {
        this.editor.classList.add('vim-normal-mode');
        this.editor.setAttribute('readonly', 'true');
        if (this.statusTag) {
          this.statusTag.textContent = 'NORMAL';
          this.statusTag.className = 'vim-status-tag mode-normal';
        }
      } else if (mode === 'insert') {
        this.editor.classList.remove('vim-normal-mode');
        this.editor.removeAttribute('readonly');
        if (this.statusTag) {
          this.statusTag.textContent = 'INSERT';
          this.statusTag.className = 'vim-status-tag mode-insert';
        }
      }
      this.onModeChange(mode);
      this.updateUI();
    }

    updateUI() {
      this.updateVerticalRuler();
      this.updateStatusInfo();
    }

    get pos() { return this.editor.selectionStart; }
    set pos(v) { 
      const val = Math.max(0, Math.min(this.editor.value.length, v));
      this.editor.selectionStart = this.editor.selectionEnd = val; 
    }

    updateVerticalRuler() {
      if (!this.verticalRuler) return;
      if (!this.enabled || this.mode !== 'normal') {
        this.verticalRuler.style.display = 'none';
        return;
      }

      const text = this.editor.value;
      const p = this.pos;
      const lineStart = text.lastIndexOf('\n', p - 1) + 1;
      const colIdx = p - lineStart;
      
      const paddingLeft = parseFloat(getComputedStyle(this.editor).paddingLeft) || 0;
      this.verticalRuler.style.display = 'block';
      this.verticalRuler.style.left = `calc(${colIdx}ch + ${paddingLeft}px)`;
    }

    updateStatusInfo() {
      if (this.cursorPosInfo) {
        const text = this.editor.value;
        const p = this.pos;
        const lines = text.slice(0, p).split('\n');
        const lineIdx = lines.length;
        const colIdx = p - text.lastIndexOf('\n', p - 1);
        this.cursorPosInfo.textContent = `${lineIdx}:${colIdx}`;
      }
    }

    scrollToCursor() {
      const lineHeight = parseFloat(getComputedStyle(this.editor).lineHeight);
      const editorHeight = this.editor.clientHeight;
      const text = this.editor.value;
      const lineIdx = text.slice(0, this.pos).split('\n').length - 1;
      
      const cursorY = lineIdx * lineHeight;
      const currentScroll = this.editor.scrollTop;
      
      // If cursor is out of view or we want to center it
      const scrollTop = cursorY - (editorHeight / 2) + (lineHeight / 2);
      this.editor.scrollTop = Math.max(0, scrollTop);
      this.editor.dispatchEvent(new Event('scroll'));
    }

    handleKeyDown(e) {
      if (!this.enabled) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        this._pendingAction = null;
        this.setMode('normal');
        return;
      }

      if (this.mode === 'insert') return;

      // Normal Mode
      const key = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;

      if (ctrl && key === 'r') { e.preventDefault(); this.redo(); return; }
      if (key === 'u') { e.preventDefault(); this.undo(); return; }

      // Motions
      if (this.handleMotion(key, shift)) {
        e.preventDefault();
        this.updateUI();
        return;
      }

      // Actions
      if (this.handleAction(key, shift)) {
        e.preventDefault();
        this.updateUI();
        return;
      }
    }

    handleMotion(key, shift) {
      if (key === 'h' || key === 'ArrowLeft') this.moveCursor(-1);
      else if (key === 'l' || key === 'ArrowRight') this.moveCursor(1);
      else if (key === 'j' || key === 'ArrowDown') { this.moveLine(1); this.scrollToCursor(); }
      else if (key === 'k' || key === 'ArrowUp') { this.moveLine(-1); this.scrollToCursor(); }
      else if (key === 'w') this.moveWord(1);
      else if (key === 'b') this.moveWord(-1);
      else if (key === 'e') this.moveWordEnd(1);
      else if (key === '0') this.moveToLineStart();
      else if (key === '$') this.moveToLineEnd();
      else if (key === 'G') { this.moveToEnd(); this.scrollToCursor(); }
      else if (key === 'g' && !shift) {
        if (this._pendingAction === 'g') {
          this.pos = 0;
          this.scrollToCursor();
          this._pendingAction = null;
        } else {
          this._setPending('g');
        }
        return true;
      }
      else return false;
      return true;
    }

    handleAction(key, shift) {
      if (key === 'i') this.setMode('insert');
      else if (key === 'a') { this.moveCursor(1); this.setMode('insert'); }
      else if (key === 'o') { this.openLine(1); this.setMode('insert'); }
      else if (key === 'O') { this.openLine(-1); this.setMode('insert'); }
      else if (key === 'x') this.deleteChar();
      else if (key === 'p') this.paste();
      else if (key === 'd') {
        if (this._pendingAction === 'd') {
          this.deleteLine();
          this._pendingAction = null;
        } else {
          this._setPending('d');
        }
      }
      else if (key === 'y') {
        if (this._pendingAction === 'y') {
          this.yankLine();
          this._pendingAction = null;
        } else {
          this._setPending('y');
        }
      }
      else return false;
      return true;
    }

    _setPending(key) {
      this._pendingAction = key;
      clearTimeout(this._pendingActionTimeout);
      this._pendingActionTimeout = setTimeout(() => { this._pendingAction = null; }, 1000);
    }

    // --- Commands Implementation ---

    moveCursor(delta) {
      this.pos = this.pos + delta;
    }

    moveLine(delta) {
      const text = this.editor.value;
      const lines = text.split('\n');
      const p = this.pos;
      const currentLineIdx = text.slice(0, p).split('\n').length - 1;
      const colIdx = p - text.lastIndexOf('\n', p - 1) - 1;

      const targetLineIdx = Math.max(0, Math.min(lines.length - 1, currentLineIdx + delta));
      let newPos = 0;
      for (let i = 0; i < targetLineIdx; i++) {
        newPos += lines[i].length + 1;
      }
      newPos += Math.min(colIdx, lines[targetLineIdx].length);
      this.pos = newPos;
    }

    moveWord(direction) {
      const text = this.editor.value;
      let p = this.pos;
      if (direction > 0) {
        const remaining = text.slice(p);
        const match = remaining.slice(1).search(/\s\S/);
        this.pos = match === -1 ? text.length : p + match + 2;
      } else {
        const before = text.slice(0, p);
        const match = before.slice(0, -1).split('').reverse().join('').search(/\S\s/);
        this.pos = match === -1 ? 0 : p - match - 2;
      }
    }

    moveWordEnd(direction) {
        const text = this.editor.value;
        let p = this.pos;
        const remaining = text.slice(p);
        const match = remaining.slice(1).search(/\S\s/);
        this.pos = match === -1 ? text.length : p + match + 1;
    }

    moveToLineStart() {
      this.pos = this.editor.value.lastIndexOf('\n', this.pos - 1) + 1;
    }

    moveToLineEnd() {
      const nextNL = this.editor.value.indexOf('\n', this.pos);
      this.pos = nextNL === -1 ? this.editor.value.length : nextNL;
    }

    moveToEnd() {
      this.pos = this.editor.value.length;
    }

    deleteChar() {
      const text = this.editor.value;
      const p = this.pos;
      if (p >= text.length) return;
      this.editor.value = text.slice(0, p) + text.slice(p + 1);
      this.pos = p;
      this.triggerInput();
    }

    deleteLine() {
      const text = this.editor.value;
      const start = text.lastIndexOf('\n', this.pos - 1) + 1;
      let end = text.indexOf('\n', this.pos);
      if (end === -1) end = text.length;
      else end += 1;

      this.clipboard = text.slice(start, end);
      this.editor.value = text.slice(0, start) + text.slice(end);
      this.pos = start;
      this.triggerInput();
    }

    yankLine() {
      const text = this.editor.value;
      const start = text.lastIndexOf('\n', this.pos - 1) + 1;
      let end = text.indexOf('\n', this.pos);
      if (end === -1) end = text.length;
      this.clipboard = text.slice(start, end) + (end === text.length ? '\n' : '');
    }

    paste() {
      if (!this.clipboard) return;
      const p = this.pos;
      const text = this.editor.value;
      this.editor.value = text.slice(0, p) + this.clipboard;
      this.pos = p + this.clipboard.length;
      this.triggerInput();
    }

    openLine(delta) {
      if (delta > 0) this.moveToLineEnd();
      else this.moveToLineStart();
      const p = this.pos;
      const text = this.editor.value;
      this.editor.value = text.slice(0, p) + '\n' + text.slice(p);
      this.pos = delta > 0 ? p + 1 : p;
      this.triggerInput();
    }

    undo() { document.execCommand('undo'); this.triggerInput(); }
    redo() { document.execCommand('redo'); this.triggerInput(); }

    triggerInput() {
      this.editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  global.VimMode = VimMode;
})(window);
