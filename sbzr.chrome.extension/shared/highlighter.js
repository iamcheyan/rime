(function (global) {
  class SharedHighlighter {
    constructor(editor, overlay, options = {}) {
      this.editor = editor;
      this.overlay = overlay;
      this.enabled = true;
      this.showWhitespace = false;
      this.tabWidth = options.tabWidth || 4;
      
      this._resizeObserver = null;
      this._renderPending = false;
      this._timeoutIds = [];
      this._scrollHandler = null;
      this._inputHandler = null;
      this._resizeHandler = null;
      this.init();
    }

    init() {
      const scheduleRender = (delay = 0) => {
        if (delay > 0) {
          const timeoutId = setTimeout(() => {
            this._timeoutIds = this._timeoutIds.filter((id) => id !== timeoutId);
            this.render();
          }, delay);
          this._timeoutIds.push(timeoutId);
          return;
        }
        if (this._renderPending) return;
        this._renderPending = true;
        requestAnimationFrame(() => {
          this.render();
          this._renderPending = false;
        });
      };

      this._scrollHandler = () => scheduleRender();
      this._inputHandler = () => {
        scheduleRender();
        // Crucial for paste/cut: re-render after browser updates scrollHeight
        scheduleRender(20);
        scheduleRender(100);
      };
      this.editor.addEventListener('scroll', this._scrollHandler);
      this.editor.addEventListener('input', this._inputHandler);
      
      if (global.ResizeObserver) {
        this._resizeObserver = new ResizeObserver(() => scheduleRender());
        this._resizeObserver.observe(this.editor);
      } else {
        this._resizeHandler = () => scheduleRender();
        window.addEventListener('resize', this._resizeHandler);
      }
      
      // High frequency fallback during development
      setTimeout(() => scheduleRender(), 50);
    }

    destroy() {
      if (this._scrollHandler) {
        this.editor.removeEventListener('scroll', this._scrollHandler);
      }
      if (this._inputHandler) {
        this.editor.removeEventListener('input', this._inputHandler);
      }
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      this._timeoutIds.forEach((id) => clearTimeout(id));
      this._timeoutIds = [];
      this.overlay.innerHTML = '';
    }

    setWhitespace(enabled) {
      this.showWhitespace = enabled;
      this.render();
    }

    setLanguage(lang) {
      this.language = lang;
      this.render();
    }

    tokenize(line) {
      if (!line) return [{ type: 'text', content: '' }];
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) return [{ type: 'comment', content: line }];

      if (line.includes('\t')) {
        const parts = line.split(/(\t)/);
        let tabCount = 0;
        return parts.map(part => {
          if (part === '\t') { tabCount++; return { type: 'tab', content: '\t' }; }
          let type = 'word';
          if (tabCount === 1) type = 'code';
          if (tabCount >= 2) type = 'weight';
          return { type, content: part };
        });
      }

      const yamlMatch = line.match(/^(\s*)([^:]+)(:)(.*)$/);
      if (yamlMatch) {
         const key = yamlMatch[2].trim();
         if (['case', 'default', 'return', 'if', 'for', 'while'].indexOf(key) === -1) {
            return [{ type: 'text', content: yamlMatch[1] }, { type: 'key', content: yamlMatch[2] }, { type: 'text', content: yamlMatch[3] }, { type: 'value', content: yamlMatch[4] }];
         }
      }

      const allKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|try|catch|finally|throw|import|export|default|class|extends|super|this|async|await|yield|typeof|instanceof|in|of|interface|type|enum|namespace|module|declare|readonly|private|protected|public|static|get|set|as|any|unknown|never|void|null|undefined|true|false|def|elif|from|with|lambda|pass|and|or|not|is|None|self|implements|native|volatile|transient|synchronized|int|long|short|byte|float|double|char|boolean|package|throws)\b/g;
      const rules = [
        { type: 'string', regex: /("""[\s\S]*?"""|'''[\s\S]*?'''|".*?"|'.*?'|`.*?`)/g },
        { type: 'number', regex: /\b\d+(\.\d+)?\b/g },
        { type: 'keyword', regex: allKeywords },
        { type: 'operator', regex: /[+\-*/=<>!&|^%~?:]+/g }
      ];

      let tokens = [{ type: 'text', content: line }];
      for (const rule of rules) {
        let newTokens = [];
        for (const token of tokens) {
          if (token.type !== 'text') { newTokens.push(token); continue; }
          let lastIdx = 0; let match; rule.regex.lastIndex = 0;
          while ((match = rule.regex.exec(token.content)) !== null) {
            if (match.index > lastIdx) newTokens.push({ type: 'text', content: token.content.slice(lastIdx, match.index) });
            newTokens.push({ type: rule.type, content: match[0] });
            lastIdx = match.index + match[0].length;
            if (rule.regex.lastIndex === match.index) rule.regex.lastIndex++;
          }
          if (lastIdx < token.content.length) newTokens.push({ type: 'text', content: token.content.slice(lastIdx) });
        }
        tokens = newTokens;
      }

      let finalTokens = [];
      for (const t of tokens) {
        if (t.type === 'tab' || t.type === 'space') { finalTokens.push(t); continue; }
        const parts = t.content.split(/(\t| )/);
        for (const p of parts) {
          if (p === '\t') finalTokens.push({ type: 'tab', content: '\t' });
          else if (p === ' ') finalTokens.push({ type: 'space', content: ' ' });
          else if (p) finalTokens.push({ type: t.type, content: p });
        }
      }
      return finalTokens;
    }

    escapeHtml(text) { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

    render() {
      if (!this.enabled || !this.editor || !this.overlay) return;
      
      const text = this.editor.value;
      const lines = text.split('\n');
      const style = getComputedStyle(this.editor);
      
      const lineHeight = parseFloat(style.lineHeight) || 24;
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      
      // Crucial: Use current state, not cached ones
      const scrollTop = this.editor.scrollTop;
      const scrollLeft = this.editor.scrollLeft;
      const clientHeight = this.editor.clientHeight;
      
      if (clientHeight <= 0) return;

      const startIdx = Math.max(0, Math.floor(scrollTop / lineHeight));
      const endIdx = Math.min(lines.length, Math.ceil((scrollTop + clientHeight) / lineHeight) + 2);

      let html = '';
      for (let i = startIdx; i < endIdx; i++) {
        const line = lines[i];
        if (line === undefined) break;
        const tokens = this.tokenize(line);
        // Correct vertical position including scroll and padding
        const top = (i * lineHeight) + paddingTop - scrollTop;
        
        html += `<div class="hl-line" style="position:absolute; top:${top}px; left:${paddingLeft - scrollLeft}px; height:${lineHeight}px; width:max-content; min-width:100%; white-space:pre; color:var(--text); font:inherit; pointer-events:none; tab-size:${this.tabWidth}; letter-spacing:0px;">`;
        for (const token of tokens) {
          let content = this.escapeHtml(token.content);
          let extraClass = (this.showWhitespace && (token.type === 'tab' || token.type === 'space')) ? 'hl-ws-visible' : '';
          html += `<span class="hl-${token.type} ${extraClass}">${content}</span>`;
        }
        html += `</div>`;
      }
      this.overlay.innerHTML = html;
    }
  }
  global.SharedHighlighter = SharedHighlighter;
})(window);
