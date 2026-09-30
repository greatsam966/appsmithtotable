(() => {
  "use strict";

  const CONFIG = {
    preferredWidget: "caller_productivity_daywise",
    edgeSize: 55,
    maxScrollSpeed: 28
  };

  const state = {
    table: null,
    scrollContainer: null,

    dragging: false,
    pointer: { x: 0, y: 0 },

    anchor: null,
    focus: null,
    lastClicked: null,

    selectedKeys: new Set(),

    renderQueued: false,
    scrollRaf: null,

    toolbar: null
  };

  // ============================================================
  // TABLE DETECTION
  // ============================================================

  function findTables() {
    return [...document.querySelectorAll('[role="table"].table')]
      .filter(table =>
        table.querySelector(
          '[role="cell"][data-rowindex][data-colindex]'
        )
      );
  }

  function getBestTable() {
    const preferred = document.querySelector(
      `[data-widgetname-cy="${CONFIG.preferredWidget}"] [role="table"].table`
    );

    return preferred || findTables()[0] || null;
  }

  function getScrollContainer(table) {
    if (!table) return null;

    return (
      table.closest(".simplebar-content-wrapper") ||
      table.querySelector(".simplebar-content-wrapper") ||
      table.parentElement
    );
  }

  function refreshTable() {
    const table = getBestTable();

    if (!table) return;

    if (table !== state.table) {
      clearSelection(false);

      state.table = table;
      state.scrollContainer = getScrollContainer(table);

      installHandlers(table);
      createToolbar();
    }
  }

  // ============================================================
  // CELL / HEADER HELPERS
  // ============================================================

  function getHeaders() {
    if (!state.table) return [];

    return [...state.table.querySelectorAll(
      '[role="columnheader"][data-header]'
    )];
  }

  function getHeader(col) {
    return getHeaders()[col] || null;
  }

  function getHeaderText(header) {
    if (!header) return "";

    return cleanText(
      header.dataset.header || header.innerText
    );
  }

  function getCell(row, col) {
    if (!state.table || row < 0) return null;

    return state.table.querySelector(
      `[role="cell"][data-rowindex="${row}"][data-colindex="${col}"]`
    );
  }

  function getCellText(cell) {
    if (!cell) return "";

    const wrapper = cell.querySelector(".cell-wrapper");

    return cleanText(
      wrapper ? wrapper.innerText : cell.innerText
    );
  }

  function cleanText(text) {
    return String(text ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .trim();
  }

  function isRealCell(cell) {
    return !!cell && getCellText(cell) !== "";
  }

  function key(row, col) {
    return `${row}:${col}`;
  }

  function getSelectedBounds() {
    if (!state.anchor || !state.focus) return null;

    return {
      minRow: Math.min(state.anchor.row, state.focus.row),
      maxRow: Math.max(state.anchor.row, state.focus.row),
      minCol: Math.min(state.anchor.col, state.focus.col),
      maxCol: Math.max(state.anchor.col, state.focus.col)
    };
  }

  // ============================================================
  // EVENT INSTALLATION
  // ============================================================

  function installHandlers(table) {
    table.querySelectorAll(
      '[role="cell"][data-rowindex][data-colindex]'
    ).forEach(cell => {
      if (cell.dataset.appsmithCopyV6) return;

      cell.dataset.appsmithCopyV6 = "1";

      cell.addEventListener("mousedown", onCellDown);
    });

    table.querySelectorAll(
      '[role="columnheader"][data-header]'
    ).forEach((header, index) => {
      if (header.dataset.appsmithCopyV6) return;

      header.dataset.appsmithCopyV6 = "1";
      header.dataset.copyColindex = String(index);

      header.addEventListener("mousedown", onHeaderDown);
    });
  }

  // ============================================================
  // POINTER SELECTION
  // ============================================================

  function beginSelection(position, event) {
    state.dragging = true;

    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;

    if (event.shiftKey && state.lastClicked) {
      state.anchor = { ...state.lastClicked };
    } else {
      state.anchor = { ...position };
    }

    state.focus = { ...position };
    state.lastClicked = { ...position };

    document.body.classList.add("appsmith-copy-selecting");

    renderSelection();
    ensureScrollLoop();
  }

  function onCellDown(event) {
    if (event.button !== 0) return;

    const cell = event.currentTarget;

    beginSelection({
      row: Number(cell.dataset.rowindex),
      col: Number(cell.dataset.colindex)
    }, event);

    event.preventDefault();
  }

  function onHeaderDown(event) {
    if (event.button !== 0) return;

    const header = event.currentTarget;

    beginSelection({
      row: -1,
      col: Number(header.dataset.copyColindex)
    }, event);

    event.preventDefault();
  }

  document.addEventListener("mousemove", event => {
    if (!state.dragging) return;

    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;

    updateFocusFromPointer();
    ensureScrollLoop();
  }, { passive: true });

  document.addEventListener("mouseup", () => {
    if (!state.dragging) return;

    state.dragging = false;

    document.body.classList.remove(
      "appsmith-copy-selecting"
    );

    stopScrollLoop();
  });

  // ============================================================
  // POINTER -> LOGICAL CELL
  // ============================================================

  function updateFocusFromPointer() {
    const element = document.elementFromPoint(
      state.pointer.x,
      state.pointer.y
    );

    if (!element || !state.table) return;

    const cell = element.closest(
      '[role="cell"][data-rowindex][data-colindex]'
    );

    if (cell && state.table.contains(cell)) {
      const next = {
        row: Number(cell.dataset.rowindex),
        col: Number(cell.dataset.colindex)
      };

      if (
        !state.focus ||
        next.row !== state.focus.row ||
        next.col !== state.focus.col
      ) {
        state.focus = next;
        renderSelection();
      }

      return;
    }

    const header = element.closest(
      '[role="columnheader"][data-header]'
    );

    if (
      header &&
      state.table.contains(header)
    ) {
      const next = {
        row: -1,
        col: Number(header.dataset.copyColindex)
      };

      if (
        !state.focus ||
        next.row !== state.focus.row ||
        next.col !== state.focus.col
      ) {
        state.focus = next;
        renderSelection();
      }
    }
  }

  // ============================================================
  // SELECTION RENDER
  // ============================================================

  function renderSelection() {
    if (state.renderQueued) return;

    state.renderQueued = true;

    requestAnimationFrame(() => {
      state.renderQueued = false;

      clearVisualSelection();
      state.selectedKeys.clear();

      const bounds = getSelectedBounds();

      if (!bounds) return;

      for (
        let row = bounds.minRow;
        row <= bounds.maxRow;
        row++
      ) {
        for (
          let col = bounds.minCol;
          col <= bounds.maxCol;
          col++
        ) {
          if (row === -1) {
            const header = getHeader(col);
            if (!header) continue;

            header.classList.add(
              "appsmith-copy-selected"
            );

            state.selectedKeys.add(key(row, col));
            continue;
          }

          const cell = getCell(row, col);

          if (!isRealCell(cell)) continue;

          cell.classList.add(
            "appsmith-copy-selected"
          );

          state.selectedKeys.add(key(row, col));
        }
      }

      const anchor =
        state.anchor.row === -1
          ? getHeader(state.anchor.col)
          : getCell(
              state.anchor.row,
              state.anchor.col
            );

      anchor?.classList.add(
        "appsmith-copy-anchor"
      );
    });
  }

  function clearVisualSelection() {
    if (!state.table) return;

    state.table.querySelectorAll(
      ".appsmith-copy-selected, .appsmith-copy-anchor"
    ).forEach(element => {
      element.classList.remove(
        "appsmith-copy-selected"
      );

      element.classList.remove(
        "appsmith-copy-anchor"
      );
    });
  }

  function clearSelection(clearLastClicked = true) {
    clearVisualSelection();

    state.selectedKeys.clear();

    state.anchor = null;
    state.focus = null;

    if (clearLastClicked) {
      state.lastClicked = null;
    }
  }

  // ============================================================
  // SMOOTH EDGE SCROLL
  // ============================================================

  function getScrollVector() {
    const container = state.scrollContainer;

    if (!container) {
      return { dx: 0, dy: 0 };
    }

    const rect = container.getBoundingClientRect();

    const x = state.pointer.x;
    const y = state.pointer.y;

    let dx = 0;
    let dy = 0;

    if (x < rect.left + CONFIG.edgeSize) {
      const distance =
        rect.left + CONFIG.edgeSize - x;

      dx = -Math.min(
        CONFIG.maxScrollSpeed,
        Math.max(2, distance * 0.45)
      );
    } else if (
      x > rect.right - CONFIG.edgeSize
    ) {
      const distance =
        x - (rect.right - CONFIG.edgeSize);

      dx = Math.min(
        CONFIG.maxScrollSpeed,
        Math.max(2, distance * 0.45)
      );
    }

    if (y < rect.top + CONFIG.edgeSize) {
      const distance =
        rect.top + CONFIG.edgeSize - y;

      dy = -Math.min(
        CONFIG.maxScrollSpeed,
        Math.max(2, distance * 0.45)
      );
    } else if (
      y > rect.bottom - CONFIG.edgeSize
    ) {
      const distance =
        y - (rect.bottom - CONFIG.edgeSize);

      dy = Math.min(
        CONFIG.maxScrollSpeed,
        Math.max(2, distance * 0.45)
      );
    }

    return { dx, dy };
  }

  function ensureScrollLoop() {
    if (state.scrollRaf) return;

    const tick = () => {
      state.scrollRaf = null;

      if (!state.dragging) return;

      const { dx, dy } = getScrollVector();

      if (!dx && !dy) return;

      const container = state.scrollContainer;

      if (!container) return;

      const oldLeft = container.scrollLeft;
      const oldTop = container.scrollTop;

      if (dx) container.scrollLeft += dx;
      if (dy) container.scrollTop += dy;

      if (
        oldLeft !== container.scrollLeft ||
        oldTop !== container.scrollTop
      ) {
        updateFocusFromPointer();
      }

      state.scrollRaf =
        requestAnimationFrame(tick);
    };

    state.scrollRaf =
      requestAnimationFrame(tick);
  }

  function stopScrollLoop() {
    if (!state.scrollRaf) return;

    cancelAnimationFrame(
      state.scrollRaf
    );

    state.scrollRaf = null;
  }

  // ============================================================
  // KEYBOARD
  // ============================================================

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      clearSelection();

      state.dragging = false;

      document.body.classList.remove(
        "appsmith-copy-selecting"
      );

      stopScrollLoop();

      return;
    }

    if (
      !state.table ||
      !state.focus
    ) {
      return;
    }

    const arrowKeys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight"
    ];

    if (!arrowKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();

    let row = state.focus.row;
    let col = state.focus.col;

    if (event.key === "ArrowUp") row--;
    if (event.key === "ArrowDown") row++;
    if (event.key === "ArrowLeft") col--;
    if (event.key === "ArrowRight") col++;

    row = Math.max(-1, row);
    col = Math.max(0, col);

    state.focus = { row, col };

    if (!event.shiftKey) {
      state.anchor = { row, col };
    }

    state.lastClicked = { row, col };

    renderSelection();

    const target =
      row === -1
        ? getHeader(col)
        : getCell(row, col);

    target?.scrollIntoView({
      block: "nearest",
      inline: "nearest"
    });
  });

  // ============================================================
  // CTRL/CMD + A
  // ============================================================

  document.addEventListener("keydown", event => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "a"
    ) {
      if (!state.table) return;

      event.preventDefault();

      clearSelection();

      getHeaders().forEach(header => {
        header.classList.add(
          "appsmith-copy-selected"
        );

        state.selectedKeys.add(
          key(
            -1,
            Number(header.dataset.copyColindex)
          )
        );
      });

      state.table.querySelectorAll(
        '[role="cell"][data-rowindex][data-colindex]'
      ).forEach(cell => {
        if (!isRealCell(cell)) return;

        cell.classList.add(
          "appsmith-copy-selected"
        );

        state.selectedKeys.add(
          key(
            Number(cell.dataset.rowindex),
            Number(cell.dataset.colindex)
          )
        );
      });
    }
  });

  // ============================================================
  // CLICK OUTSIDE
  // ============================================================

  document.addEventListener("mousedown", event => {
    if (!state.table) return;

    if (
      state.toolbar &&
      state.toolbar.contains(event.target)
    ) {
      return;
    }

    if (!state.table.contains(event.target)) {
      clearSelection();
    }
  });

  // ============================================================
  // COPY AS TSV
  // ============================================================

  document.addEventListener("copy", event => {
    if (!state.selectedKeys.size) return;

    const selected =
      [...state.selectedKeys].map(value => {
        const [row, col] =
          value.split(":").map(Number);

        return { row, col };
      });

    const headers =
      selected
        .filter(item => item.row === -1)
        .sort((a, b) => a.col - b.col);

    const body =
      selected
        .filter(item => item.row >= 0);

    const lines = [];

    if (headers.length) {
      lines.push(
        headers
          .map(item =>
            getHeaderText(
              getHeader(item.col)
            )
          )
          .join("\t")
      );
    }

    if (body.length) {
      const rows = new Map();

      body.forEach(item => {
        if (!rows.has(item.row)) {
          rows.set(item.row, new Map());
        }

        rows
          .get(item.row)
          .set(
            item.col,
            getCellText(
              getCell(item.row, item.col)
            )
          );
      });

      const rowNumbers =
        [...rows.keys()].sort(
          (a, b) => a - b
        );

      const minCol =
        Math.min(...body.map(x => x.col));

      const maxCol =
        Math.max(...body.map(x => x.col));

      rowNumbers.forEach(row => {
        const values = [];

        for (
          let col = minCol;
          col <= maxCol;
          col++
        ) {
          values.push(
            rows.get(row)?.get(col) ?? ""
          );
        }

        lines.push(
          values.join("\t")
        );
      });
    }

    event.preventDefault();

    event.clipboardData.setData(
      "text/plain",
      lines.join("\n")
    );
  });

  // ============================================================
  // TOOLBAR
  // ============================================================

  function createToolbar() {
    if (state.toolbar) return;

    const toolbar =
      document.createElement("div");

    toolbar.id =
      "appsmith-copy-toolbar";

    const title =
      document.createElement("span");

    title.className =
      "appsmith-copy-title";

    title.textContent =
      "Table Copy";

    // ----------------------------------------------------------
    // Copy selected snapshot
    // ----------------------------------------------------------

    const selectionSnapshot =
      document.createElement("button");

    selectionSnapshot.type = "button";

    selectionSnapshot.className =
      "appsmith-copy-button";

    selectionSnapshot.textContent =
      "📷 Selection";

    selectionSnapshot.title =
      "Copy selected cells as an image";

    selectionSnapshot.addEventListener(
      "click",
      captureSelectionSnapshot
    );

    // ----------------------------------------------------------
    // Copy visible table snapshot
    // ----------------------------------------------------------

    const visibleSnapshot =
      document.createElement("button");

    visibleSnapshot.type = "button";

    visibleSnapshot.className =
      "appsmith-copy-button";

    visibleSnapshot.textContent =
      "📷 Visible Table";

    visibleSnapshot.title =
      "Copy the visible table as an image";

    visibleSnapshot.addEventListener(
      "click",
      captureVisibleSnapshot
    );

    // ----------------------------------------------------------
    // Full table snapshot
    // ----------------------------------------------------------

    const fullSnapshot =
      document.createElement("button");

    fullSnapshot.type = "button";

    fullSnapshot.className =
      "appsmith-copy-button";

    fullSnapshot.textContent =
      "📷 Full Table";

    fullSnapshot.title =
      "Copy the complete table as one image";

    fullSnapshot.addEventListener(
      "click",
      captureFullTableSnapshot
    );

    toolbar.appendChild(title);
    toolbar.appendChild(selectionSnapshot);
    toolbar.appendChild(visibleSnapshot);
    toolbar.appendChild(fullSnapshot);

    document.body.appendChild(toolbar);

    state.toolbar = toolbar;
  }

  // ============================================================
  // SNAPSHOT: SHARED SCREEN CAPTURE
  // ============================================================

  function requestVisibleScreenshot() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "APPSMITH_CAPTURE_VISIBLE"
        },
        response => {
          if (!response?.success) {
            reject(
              new Error(
                response?.error ||
                "Screenshot failed"
              )
            );
            return;
          }

          resolve(response.dataUrl);
        }
      );
    });
  }

  function getElementRect(element) {
    const rect = element.getBoundingClientRect();

    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    };
  }

  function cropDataUrl(dataUrl, rect) {
    return new Promise(
      (resolve, reject) => {
        const image = new Image();

        image.onload = () => {
          const dpr =
            window.devicePixelRatio || 1;

          const left =
            Math.max(0, rect.left);

          const top =
            Math.max(0, rect.top);

          const right =
            Math.min(
              window.innerWidth,
              rect.right
            );

          const bottom =
            Math.min(
              window.innerHeight,
              rect.bottom
            );

          const width =
            Math.max(1, right - left);

          const height =
            Math.max(1, bottom - top);

          const canvas =
            document.createElement("canvas");

          canvas.width =
            Math.round(width * dpr);

          canvas.height =
            Math.round(height * dpr);

          const ctx =
            canvas.getContext("2d");

          ctx.drawImage(
            image,

            Math.round(left * dpr),
            Math.round(top * dpr),

            Math.round(width * dpr),
            Math.round(height * dpr),

            0,
            0,

            canvas.width,
            canvas.height
          );

          canvas.toBlob(
            blob => {
              if (!blob) {
                reject(
                  new Error(
                    "Unable to create PNG"
                  )
                );
                return;
              }

              resolve(blob);
            },
            "image/png"
          );
        };

        image.onerror = reject;
        image.src = dataUrl;
      }
    );
  }

  // ============================================================
  // SELECTION SNAPSHOT
  //
  // Captures exactly the currently selected visible rectangle.
  // The selection highlight itself is hidden during capture.
  // ============================================================

  async function captureSelectionSnapshot() {
    if (!state.table) return;

    if (!state.selectedKeys.size) {
      showToast("Select cells first");
      return;
    }

    const bounds = getSelectedBounds();

    if (!bounds) return;

    const selectedElements = [];

    for (
      let row = bounds.minRow;
      row <= bounds.maxRow;
      row++
    ) {
      for (
        let col = bounds.minCol;
        col <= bounds.maxCol;
        col++
      ) {
        const element =
          row === -1
            ? getHeader(col)
            : getCell(row, col);

        if (
          element &&
          state.selectedKeys.has(
            key(row, col)
          )
        ) {
          selectedElements.push(element);
        }
      }
    }

    if (!selectedElements.length) {
      showToast("Nothing visible to snapshot");
      return;
    }

    // The selected cells can be non-contiguous in the DOM if
    // Appsmith has virtualization/empty rows. The screenshot
    // rectangle should nevertheless represent the selected range.
    const rects =
      selectedElements.map(
        element =>
          element.getBoundingClientRect()
      );

    const rect = {
      left: Math.min(
        ...rects.map(r => r.left)
      ),
      top: Math.min(
        ...rects.map(r => r.top)
      ),
      right: Math.max(
        ...rects.map(r => r.right)
      ),
      bottom: Math.max(
        ...rects.map(r => r.bottom)
      )
    };

    const hadSelection =
      state.selectedKeys.size > 0;

    clearVisualSelection();

    try {
      const screenshot =
        await requestVisibleScreenshot();

      const blob =
        await cropDataUrl(
          screenshot,
          rect
        );

      await copyImageToClipboard(blob);

      showToast(
        "📷 Selection copied"
      );
    } catch (error) {
      console.error(
        "[Appsmith Table Copy] Selection snapshot:",
        error
      );

      showToast(
        "Could not copy selection snapshot"
      );
    }

    if (hadSelection) {
      renderSelection();
    }
  }

  // ============================================================
  // VISIBLE TABLE SNAPSHOT
  // ============================================================

  async function captureVisibleSnapshot() {
    if (!state.table) return;

    const hadSelection =
      state.selectedKeys.size > 0;

    clearVisualSelection();

    try {
      const rect =
        state.table.getBoundingClientRect();

      const screenshot =
        await requestVisibleScreenshot();

      const blob =
        await cropDataUrl(
          screenshot,
          rect
        );

      await copyImageToClipboard(blob);

      showToast(
        "📷 Visible table copied"
      );
    } catch (error) {
      console.error(
        "[Appsmith Table Copy] Visible snapshot:",
        error
      );

      showToast(
        "Could not copy table snapshot"
      );
    }

    if (hadSelection) {
      renderSelection();
    }
  }

  // ============================================================
  // FULL TABLE SNAPSHOT
  //
  // Best-effort stitched screenshot. It captures the complete
  // currently rendered table by walking horizontal/vertical
  // scroll positions. This is intentionally secondary to the
  // visible and selection snapshot buttons.
  // ============================================================

  async function captureFullTableSnapshot() {
    if (!state.table || !state.scrollContainer) {
      return;
    }

    const button =
      state.toolbar?.querySelector(
        '[data-full-snapshot]'
      );

    if (button) {
      button.disabled = true;
    }

    const hadSelection =
      state.selectedKeys.size > 0;

    clearVisualSelection();

    const container =
      state.scrollContainer;

    const originalLeft =
      container.scrollLeft;

    const originalTop =
      container.scrollTop;

    try {
      showToast(
        "📷 Building full table..."
      );

      const viewport =
        container.getBoundingClientRect();

      const totalWidth =
        container.scrollWidth;

      const totalHeight =
        container.scrollHeight;

      const viewportWidth =
        container.clientWidth;

      const viewportHeight =
        container.clientHeight;

      const positionsX =
        buildScrollPositions(
          totalWidth,
          viewportWidth
        );

      const positionsY =
        buildScrollPositions(
          totalHeight,
          viewportHeight
        );

      const shots = [];

      for (const y of positionsY) {
        container.scrollTop = y;

        for (const x of positionsX) {
          container.scrollLeft = x;

          await nextFrame();

          const dataUrl =
            await requestVisibleScreenshot();

          shots.push({
            x,
            y,
            dataUrl
          });
        }
      }

      const finalBlob =
        await stitchScreenshots(
          shots,
          viewport,
          totalWidth,
          totalHeight,
          viewportWidth,
          viewportHeight
        );

      await copyImageToClipboard(
        finalBlob
      );

      showToast(
        "📷 Full table copied"
      );
    } catch (error) {
      console.error(
        "[Appsmith Table Copy] Full snapshot:",
        error
      );

      showToast(
        "Could not build full table snapshot"
      );
    } finally {
      container.scrollLeft = originalLeft;
      container.scrollTop = originalTop;

      await nextFrame();

      if (hadSelection) {
        renderSelection();
      }

      if (button) {
        button.disabled = false;
      }
    }
  }

  function buildScrollPositions(total, viewport) {
    if (total <= viewport) {
      return [0];
    }

    const positions = [];

    for (
      let value = 0;
      value < total - viewport;
      value += viewport
    ) {
      positions.push(value);
    }

    const last =
      Math.max(0, total - viewport);

    if (
      positions[positions.length - 1] !== last
    ) {
      positions.push(last);
    }

    return positions;
  }

  async function stitchScreenshots(
    shots,
    viewportRect,
    totalWidth,
    totalHeight,
    viewportWidth,
    viewportHeight
  ) {
    const dpr =
      window.devicePixelRatio || 1;

    const canvas =
      document.createElement("canvas");

    canvas.width =
      Math.round(
        totalWidth * dpr
      );

    canvas.height =
      Math.round(
        totalHeight * dpr
      );

    const ctx =
      canvas.getContext("2d");

    for (const shot of shots) {
      const image =
        await loadImage(
          shot.dataUrl
        );

      // The screenshot contains the entire browser viewport.
      // Crop only the Appsmith scroll-container viewport.
      const sourceLeft =
        Math.max(
          0,
          viewportRect.left
        );

      const sourceTop =
        Math.max(
          0,
          viewportRect.top
        );

      const sourceWidth =
        Math.min(
          viewportWidth,
          window.innerWidth -
          sourceLeft
        );

      const sourceHeight =
        Math.min(
          viewportHeight,
          window.innerHeight -
          sourceTop
        );

      ctx.drawImage(
        image,

        Math.round(sourceLeft * dpr),
        Math.round(sourceTop * dpr),

        Math.round(sourceWidth * dpr),
        Math.round(sourceHeight * dpr),

        Math.round(shot.x * dpr),
        Math.round(shot.y * dpr),

        Math.round(sourceWidth * dpr),
        Math.round(sourceHeight * dpr)
      );
    }

    return new Promise(
      (resolve, reject) => {
        canvas.toBlob(
          blob => {
            if (!blob) {
              reject(
                new Error(
                  "Stitching failed"
                )
              );
              return;
            }

            resolve(blob);
          },
          "image/png"
        );
      }
    );
  }

  function loadImage(dataUrl) {
    return new Promise(
      (resolve, reject) => {
        const image = new Image();

        image.onload =
          () => resolve(image);

        image.onerror =
          reject;

        image.src =
          dataUrl;
      }
    );
  }

  function nextFrame() {
    return new Promise(resolve => {
      requestAnimationFrame(
        () => requestAnimationFrame(resolve)
      );
    });
  }

  async function copyImageToClipboard(blob) {
    if (
      !navigator.clipboard ||
      !window.ClipboardItem
    ) {
      throw new Error(
        "Image clipboard API unavailable"
      );
    }

    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob
      })
    ]);
  }

  // ============================================================
  // TOAST
  // ============================================================

  function showToast(message) {
    document
      .getElementById(
        "appsmith-copy-toast"
      )
      ?.remove();

    const toast =
      document.createElement("div");

    toast.id =
      "appsmith-copy-toast";

    toast.textContent =
      message;

    document.body.appendChild(
      toast
    );

    setTimeout(
      () => toast.remove(),
      2200
    );
  }

  // ============================================================
  // APPSMITH DOM OBSERVER
  // ============================================================

  const observer =
    new MutationObserver(() => {
      clearTimeout(
        observer.timer
      );

      observer.timer =
        setTimeout(() => {
          const previousTable =
            state.table;

          refreshTable();

          if (
            state.table === previousTable &&
            state.table
          ) {
            installHandlers(
              state.table
            );
          }
        }, 100);
    });

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );

  // ============================================================
  // INIT
  // ============================================================

  setTimeout(() => {
    refreshTable();

    // Mark full-table button for optional disabled state.
    if (state.toolbar) {
      const buttons =
        state.toolbar.querySelectorAll(
          ".appsmith-copy-button"
        );

      buttons[2]?.setAttribute(
        "data-full-snapshot",
        "true"
      );
    }

    console.log(
      "[Appsmith Table Copy] V6 loaded"
    );
  }, 1000);

})();
