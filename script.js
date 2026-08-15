document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const outputText = document.getElementById('output-text');
  const copyBtn = document.getElementById('copy-btn');
  const formatSelect = document.getElementById('format-select');
  const ignoreGit = document.getElementById('ignore-git');
  const ignoreModules = document.getElementById('ignore-modules');

  let rawPathsCache = [];

  // --- イベントリスナー設定 ---

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  // ドラッグ＆ドロップ処理（エントリー解析）
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');

    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      outputText.textContent = '解析中...';
      const paths = [];

      const promiseList = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // File System APIのエントリーを取得
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        if (entry) {
          promiseList.push(traverseFileTree(entry, ''));
        }
      }

      const results = await Promise.all(promiseList);
      // 配列の平坦化
      rawPathsCache = results.flat();
      renderOutput();
    }
  });

  // ファイルダイアログ選択時の処理（webkitdirectory用）
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const paths = [];
      for (const file of e.target.files) {
        // webkitRelativePath からパスを取得
        paths.push(file.webkitRelativePath || file.name);
      }
      rawPathsCache = paths;
      renderOutput();
    }
  });

  formatSelect.addEventListener('change', renderOutput);
  ignoreGit.addEventListener('change', renderOutput);
  ignoreModules.addEventListener('change', renderOutput);

  // コピー機能
  copyBtn.addEventListener('click', () => {
    const textToCopy = outputText.textContent;
    if (!textToCopy || textToCopy === 'ここにツリー構造が出力されます...' || textToCopy === '解析中...') return;

    navigator.clipboard.writeText(textToCopy).then(() => {
      const originalText = copyBtn.textContent;
      copyBtn.textContent = '✅ コピー完了！';
      copyBtn.style.background = 'var(--success-color)';
      copyBtn.style.color = '#fff';

      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = 'var(--accent-color)';
        copyBtn.style.color = '#000';
      }, 2000);
    }).catch(err => {
      alert('コピーに失敗しました: ' + err);
    });
  });

  // --- エントリーを再帰的に走査してパスを配列で返す関数 ---

  function traverseFileTree(item, path = '') {
    return new Promise((resolve) => {
      const paths = [];
      const currentPath = path + item.name;

      if (item.isFile) {
        paths.push(currentPath);
        resolve(paths);
      } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const readEntries = () => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              // 空フォルダの場合
              paths.push(currentPath + '/');
              resolve(paths);
            } else {
              const childPromises = [];
              for (let i = 0; i < entries.length; i++) {
                childPromises.push(traverseFileTree(entries[i], currentPath + '/'));
              }
              const childResults = await Promise.all(childPromises);
              resolve(childResults.flat());
            }
          });
        };
        readEntries();
      }
    });
  }

  // --- レンダリング・出力処理 ---

  function renderOutput() {
    if (rawPathsCache.length === 0) return;

    const paths = [];
    const isIgnoreGit = ignoreGit.checked;
    const isIgnoreModules = ignoreModules.checked;

    for (const path of rawPathsCache) {
      if (isIgnoreGit && (path.includes('.git/') || path.endsWith('.git'))) continue;
      if (isIgnoreModules && (path.includes('node_modules/') || path.endsWith('node_modules'))) continue;

      paths.push(path);
    }

    if (paths.length === 0) {
      outputText.textContent = '対象となるファイルが見つかりませんでした。';
      return;
    }

    const format = formatSelect.value;
    if (format === 'tree') {
      const treeStructure = buildTreeStructure(paths);
      outputText.textContent = generateTreeText(treeStructure);
    } else if (format === 'markdown') {
      const treeStructure = buildTreeStructure(paths);
      outputText.textContent = generateMarkdownText(treeStructure);
    } else if (format === 'path') {
      outputText.textContent = paths.join('\n');
    }
  }

  // --- ツリー構造オブジェクトの生成 ---

  function buildTreeStructure(paths) {
    const root = {};

    paths.forEach(path => {
      const parts = path.split('/').filter(p => p.length > 0);
      let current = root;

      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = (index === parts.length - 1 && !path.endsWith('/')) ? null : {};
        }
        if (current[part] !== null) {
          current = current[part];
        }
      });
    });

    return root;
  }

  // --- ツリー形式テキストの生成 (├─ └─) ---

  function generateTreeText(node, prefix = '') {
    let result = '';
    const keys = Object.keys(node);

    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const isDirectory = node[key] !== null;
      const icon = isDirectory ? '📁 ' : '📄 ';

      result += prefix + connector + icon + key + '\n';

      if (isDirectory) {
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        result += generateTreeText(node[key], childPrefix);
      }
    });

    return result;
  }

  // --- Markdown形式テキストの生成 ---

  function generateMarkdownText(node, depth = 0) {
    let result = '';
    const keys = Object.keys(node);
    const indent = '  '.repeat(depth);

    keys.forEach(key => {
      const isDirectory = node[key] !== null;
      const icon = isDirectory ? '📁 ' : '📄 ';

      result += `${indent}* ${icon}${key}\n`;

      if (isDirectory) {
        result += generateMarkdownText(node[key], depth + 1);
      }
    });

    return result;
  }
});