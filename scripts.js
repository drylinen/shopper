'use strict';

(function initShoppr() {
  /**
   * Data model:
   * Category = { id: string, name: string, collapsed: boolean, items: Item[] }
   * Item = { id: string, name: string, status: 'none' | 'red' | 'blue' }
   * Storage = { hideUnselected: boolean, categories: Category[] }
   */
  /** @typedef {{id:string,name:string,status:'none'|'red'|'blue'}} Item */
  /** @typedef {{id:string,name:string,collapsed:boolean,items:Item[]}} Category */
  /** @typedef {{hideUnselected:boolean,categories:Category[]}} StorageModel */

  const STORAGE_KEY = 'shoppr.data.v1';

  /** @type {HTMLElement|null} */
  const listEl = document.getElementById('list');
  /** @type {HTMLButtonElement|null} */
  const addCategoryBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('addCategoryBtn'));
  /** @type {HTMLButtonElement|null} */
  const toggleHideBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('toggleHideBtn'));
  /** @type {HTMLButtonElement|null} */
  const resetSelectionBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('resetSelectionBtn'));
  /** @type {HTMLButtonElement|null} */
  const resetBoardBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('resetBoardBtn'));

  // Modal elements
  /** @type {HTMLElement|null} */
  const modalEl = document.getElementById('modal');
  /** @type {HTMLFormElement|null} */
  const nameForm = /** @type {HTMLFormElement|null} */ (document.getElementById('nameForm'));
  /** @type {HTMLInputElement|null} */
  const nameInput = /** @type {HTMLInputElement|null} */ (document.getElementById('nameInput'));
  /** @type {HTMLElement|null} */
  const modalTitleEl = document.getElementById('modalTitle');
  /** @type {HTMLButtonElement|null} */
  const saveBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('saveBtn'));
  /** @type {HTMLButtonElement|null} */
  const cancelBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('cancelBtn'));
  /** @type {HTMLButtonElement|null} */
  const deleteBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('deleteBtn'));
  /** @type {HTMLInputElement|null} */
  const modalKindInput = /** @type {HTMLInputElement|null} */ (document.getElementById('modalKind'));
  /** @type {HTMLInputElement|null} */
  const modalCategoryIdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('modalCategoryId'));
  /** @type {HTMLInputElement|null} */
  const modalItemIdInput = /** @type {HTMLInputElement|null} */ (document.getElementById('modalItemId'));

  if (!listEl || !addCategoryBtn || !toggleHideBtn || !resetSelectionBtn || !resetBoardBtn || !modalEl || !nameForm || !nameInput || !modalTitleEl || !saveBtn || !cancelBtn || !deleteBtn || !modalKindInput || !modalCategoryIdInput || !modalItemIdInput) {
    return;
  }

  /** @type {StorageModel} */
  let model = load();

  /** @type {{kind:'category'|'item'|null,id:string|null,categoryId?:string|null}} */
  let dragging = { kind: null, id: null, categoryId: null };

  // Wire events
  addCategoryBtn.addEventListener('click', () => openModalForCreate('category'));
  toggleHideBtn.addEventListener('click', () => {
    model.hideUnselected = !model.hideUnselected;
    save();
    render();
  });
  resetSelectionBtn.addEventListener('click', () => {
    model.categories.forEach((c) => c.items.forEach((it) => { it.status = 'none'; }));
    save();
    render();
  });
  resetBoardBtn.addEventListener('click', () => {
    const ok = window.confirm('Reset the entire board? This will remove all categories and items.');
    if (!ok) return;
    model.categories = [];
    save();
    render();
  });
  saveBtn.addEventListener('click', onSave);
  cancelBtn.addEventListener('click', closeModal);
  deleteBtn.addEventListener('click', onDelete);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });

  render();

  // Persistence
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { hideUnselected: false, categories: [] };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { hideUnselected: false, categories: [] };
      // Basic guards
      const categories = Array.isArray(parsed.categories) ? parsed.categories.map((c) => ({
        id: String(c.id || generateId()),
        name: String(c.name || 'Category'),
        collapsed: Boolean(c.collapsed),
        items: Array.isArray(c.items) ? c.items.map((it) => {
          const id = String(it.id || generateId());
          const name = String(it.name || 'Item');
          // Migrate old boolean "selected" to tri-state: true -> 'red' (not found yet), false -> 'none'
          const raw = typeof it.status === 'string' ? it.status : (it && it.selected ? 'red' : 'none');
          const status = raw === 'red' || raw === 'blue' ? raw : 'none';
          return { id, name, status };
        }) : []
      })) : [];
      const hideUnselected = Boolean(parsed.hideUnselected);
      return { hideUnselected, categories };
    } catch (_) {
      return { hideUnselected: false, categories: [] };
    }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  }

  // Rendering
  function render() {
    // Update toggle text/state
    toggleHideBtn.setAttribute('aria-pressed', model.hideUnselected ? 'true' : 'false');
    // Keep icon in the button; update accessibility label instead of text
    toggleHideBtn.setAttribute('aria-label', model.hideUnselected ? 'Show all' : 'Hide unselected');

    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    model.categories.forEach((category) => {
      const hasSelected = category.items.some((i) => i.status !== 'none');
      if (!model.hideUnselected || hasSelected) {
        frag.appendChild(createCategorySection(category));
      }
    });
    listEl.appendChild(frag);
  }

  /** @param {Category} category */
  function createCategorySection(category) {
    const section = document.createElement('section');
    section.className = 'category' + (category.collapsed ? ' collapsed' : '');
    section.dataset.categoryId = category.id;
    // Section itself is not draggable; use dedicated handle instead

    // Header
    const header = document.createElement('div');
    header.className = 'category-header';
    const title = document.createElement('div');
    title.className = 'category-title';
    title.textContent = category.name;
    const meta = document.createElement('div');
    meta.className = 'category-meta';
    const selectedCount = category.items.filter((i) => i.status !== 'none').length;
    meta.textContent = `${selectedCount}/${category.items.length}`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const addItemBtn = document.createElement('button');
    addItemBtn.className = 'btn small';
    addItemBtn.type = 'button';
    addItemBtn.textContent = 'Add item';
    addItemBtn.setAttribute('aria-label', `Add item to ${category.name}`);
    // Prevent header click/long-press from firing
    ['click','mousedown','touchstart'].forEach((evt) => {
      addItemBtn.addEventListener(evt, (e) => e.stopPropagation(), { passive: evt==='touchstart' });
    });
    addItemBtn.addEventListener('click', () => openModalForCreate('item', category.id));
    actions.appendChild(meta);
    actions.appendChild(addItemBtn);
    header.appendChild(title);
    header.appendChild(actions);

    // Toggle collapse on click
    header.addEventListener('click', () => {
      category.collapsed = !category.collapsed;
      save();
      render();
    });
    // Long press to edit category
    attachLongPress(header, () => openModalForEdit('category', category.id));

    section.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragging.kind || (dragging.kind === 'category' && dragging.id === category.id)) return;
      section.classList.add('drop-target');
    });
    section.addEventListener('dragleave', () => {
      section.classList.remove('drop-target');
    });
    section.addEventListener('drop', (e) => {
      e.preventDefault();
      section.classList.remove('drop-target');
      if (dragging.kind === 'category' && dragging.id && dragging.id !== category.id) {
        reorderCategoriesByIds(dragging.id, category.id);
      } else if (dragging.kind === 'item' && dragging.id) {
        // drop item onto category: move to end of this category
        moveItemToCategoryEnd(dragging.categoryId || '', dragging.id, category.id);
      }
    });

    section.appendChild(header);

    // Items
    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'items';
    itemsWrap.dataset.categoryId = category.id;
    // Drag handle (left-most pill)
    const handle = document.createElement('div');
    handle.className = 'category-handle';
    handle.setAttribute('aria-label', `Reorder ${category.name}`);
    handle.draggable = true;
    handle.textContent = '\u283F';
    // Prevent header interactions when using handle
    ['click','mousedown','touchstart'].forEach((evt) => {
      handle.addEventListener(evt, (e) => e.stopPropagation(), { passive: evt==='touchstart' });
    });
    handle.addEventListener('dragstart', (e) => {
      dragging = { kind: 'category', id: category.id, categoryId: null };
      handle.classList.add('dragging');
      try { e.dataTransfer?.setDragImage(handle, handle.clientWidth / 2, handle.clientHeight / 2); } catch (_) { /* noop */ }
    });
    handle.addEventListener('dragend', () => {
      dragging = { kind: null, id: null, categoryId: null };
      handle.classList.remove('dragging');
      clearDropHighlights();
    });
    itemsWrap.appendChild(handle);
    // Sort items A->Z by name (case-insensitive)
    const itemsSorted = [...category.items].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
    itemsSorted.forEach((item) => {
      const itemEl = createItemEl(category, item);
      // Hide if requested and not selected
      if (model.hideUnselected && item.status === 'none') {
        itemEl.classList.add('hidden');
      }
      itemsWrap.appendChild(itemEl);
    });

    section.appendChild(itemsWrap);
    return section;
  }

  /** @param {Category} category @param {Item} item */
  function createItemEl(category, item) {
    const el = document.createElement('div');
    el.className = 'item' + (item.status === 'red' ? ' state-red' : item.status === 'blue' ? ' state-blue' : '');
    el.textContent = item.name;
    el.tabIndex = 0;
    // Disable dragging for items; list is always alphabetical
    el.draggable = false;
    el.dataset.itemId = item.id;
    el.dataset.categoryId = category.id;

    // Toggle selected on click
    el.addEventListener('click', () => {
      // Cycle: none -> red -> blue -> none
      if (item.status === 'none') item.status = 'red';
      else if (item.status === 'red') item.status = 'blue';
      else item.status = 'none';
      save();
      render();
    });
    // Long press edit
    attachLongPress(el, () => openModalForEdit('item', category.id, item.id));

    // No DnD handlers for items

    return el;
  }

  // Reordering helpers
  function clearDropHighlights() {
    document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  }
  function findCategoryIndexById(id) {
    return model.categories.findIndex((c) => c.id === id);
  }
  function reorderCategoriesByIds(srcId, dstId) {
    const fromIdx = findCategoryIndexById(srcId);
    const toIdx = findCategoryIndexById(dstId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = model.categories.splice(fromIdx, 1);
    model.categories.splice(toIdx, 0, moved);
    save();
    render();
  }
  function findItem(categoryId, itemId) {
    const cIdx = findCategoryIndexById(categoryId);
    if (cIdx < 0) return { cIdx: -1, iIdx: -1 };
    const iIdx = model.categories[cIdx].items.findIndex((it) => it.id === itemId);
    return { cIdx, iIdx };
  }
  function moveItemToCategoryEnd(fromCategoryId, itemId, toCategoryId) {
    if (!itemId || !toCategoryId) return;
    const { cIdx: fromC, iIdx } = findItem(fromCategoryId, itemId);
    const toC = findCategoryIndexById(toCategoryId);
    if (fromC < 0 || iIdx < 0 || toC < 0) return;
    const [moved] = model.categories[fromC].items.splice(iIdx, 1);
    model.categories[toC].items.push(moved);
    save();
    render();
  }
  function reorderItemRelative(fromCategoryId, itemId, toCategoryId, beforeItemId) {
    const { cIdx: fromC, iIdx } = findItem(fromCategoryId, itemId);
    const toC = findCategoryIndexById(toCategoryId);
    if (fromC < 0 || iIdx < 0 || toC < 0) return;
    const [moved] = model.categories[fromC].items.splice(iIdx, 1);
    const beforeIdx = model.categories[toC].items.findIndex((it) => it.id === beforeItemId);
    if (beforeIdx < 0) {
      model.categories[toC].items.push(moved);
    } else {
      model.categories[toC].items.splice(beforeIdx, 0, moved);
    }
    save();
    render();
  }

  // Modal helpers
  /** @param {'category'|'item'} kind */
  function openModalForCreate(kind, categoryId) {
    modalKindInput.value = kind;
    modalCategoryIdInput.value = categoryId || '';
    modalItemIdInput.value = '';
    nameInput.value = '';
    nameInput.placeholder = kind === 'category' ? 'e.g. Dairy' : 'e.g. Milk';
    // Hide delete when creating
    deleteBtn.hidden = true;
    if (kind === 'category') {
      modalTitleEl.textContent = 'Add category';
    } else {
      modalTitleEl.textContent = 'Add item';
      // Use provided category or default to last if none
      if (!modalCategoryIdInput.value) {
        const last = model.categories[model.categories.length - 1];
        modalCategoryIdInput.value = last ? last.id : '';
      }
    }
    openModal();
  }
  /** @param {'category'|'item'} kind */
  function openModalForEdit(kind, categoryId, itemId) {
    modalKindInput.value = kind;
    modalCategoryIdInput.value = categoryId || '';
    modalItemIdInput.value = itemId || '';
    // Show delete when editing
    deleteBtn.hidden = false;
    if (kind === 'category') {
      const c = model.categories.find((x) => x.id === categoryId);
      nameInput.value = c ? c.name : '';
      nameInput.placeholder = 'e.g. Dairy';
      modalTitleEl.textContent = 'Edit category';
    } else {
      const c = model.categories.find((x) => x.id === categoryId);
      const it = c ? c.items.find((i) => i.id === itemId) : null;
      nameInput.value = it ? it.name : '';
      nameInput.placeholder = 'e.g. Milk';
      modalTitleEl.textContent = 'Edit item';
    }
    openModal();
  }
  function openModal() {
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
    try { nameInput.focus(); } catch (_) { /* noop */ }
  }
  function closeModal() {
    modalEl.classList.remove('open');
    modalEl.setAttribute('aria-hidden', 'true');
  }
  /** @param {MouseEvent} e */
  function onSave(e) {
    e.preventDefault();
    const kind = modalKindInput.value === 'category' ? 'category' : 'item';
    const name = sanitizeName(nameInput.value);
    const catId = modalCategoryIdInput.value || '';
    const itemId = modalItemIdInput.value || '';
    if (!name) {
      try { nameInput.focus(); } catch (_) { /* noop */ }
      return;
    }
    if (kind === 'category') {
      if (itemId) {
        // not applicable
      }
      if (catId) {
        // edit
        const idx = findCategoryIndexById(catId);
        if (idx >= 0) model.categories[idx].name = name;
      } else {
        // create
        model.categories.push({ id: generateId(), name, collapsed: false, items: [] });
      }
    } else {
      if (itemId && catId) {
        // edit item
        const { cIdx, iIdx } = findItem(catId, itemId);
        if (cIdx >= 0 && iIdx >= 0) model.categories[cIdx].items[iIdx].name = name;
      } else {
        // create item
        let targetCategoryId = catId;
        if (!targetCategoryId) {
          // Create default category if none exist
          const defaultCategory = { id: generateId(), name: 'General', collapsed: false, items: [] };
          model.categories.push(defaultCategory);
          targetCategoryId = defaultCategory.id;
        }
        const cIdx = findCategoryIndexById(targetCategoryId);
        if (cIdx >= 0) {
          model.categories[cIdx].items.push({ id: generateId(), name, status: 'none' });
        }
      }
    }
    save();
    render();
    closeModal();
  }

  /** @param {MouseEvent} e */
  function onDelete(e) {
    e.preventDefault();
    const kind = modalKindInput.value === 'category' ? 'category' : 'item';
    const catId = modalCategoryIdInput.value || '';
    const itemId = modalItemIdInput.value || '';
    if (kind === 'category' && catId) {
      const idx = findCategoryIndexById(catId);
      if (idx >= 0) {
        model.categories.splice(idx, 1);
      }
    } else if (kind === 'item' && catId && itemId) {
      const { cIdx, iIdx } = findItem(catId, itemId);
      if (cIdx >= 0 && iIdx >= 0) {
        model.categories[cIdx].items.splice(iIdx, 1);
      }
    }
    save();
    render();
    closeModal();
  }

  // Utilities
  function generateId() {
    const rnd = Math.floor(Math.random() * 1e9).toString(36);
    return `s_${Date.now().toString(36)}_${rnd}`;
  }
  /**
   * Attach long-press handler to an element. Press ~600ms to trigger.
   * @param {HTMLElement} el
   * @param {() => void} onPress
   */
  function attachLongPress(el, onPress) {
    let timer = /** @type {number|null} */ (null);
    let startX = 0;
    let startY = 0;
    const MOVE_THRESHOLD = 6; // px

    function beginTimer() {
      clearTimer();
      timer = window.setTimeout(() => {
        timer = null;
        onPress();
      }, 600);
    }
    function clearTimer() {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }
    function cancel() { clearTimer(); }

    el.addEventListener('mousedown', (e) => {
      if ((e.button ?? 0) !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      beginTimer();
    });
    el.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      beginTimer();
    }, { passive: true });
    el.addEventListener('mousemove', (e) => {
      if (timer === null) return;
      if (Math.abs(e.clientX - startX) > MOVE_THRESHOLD || Math.abs(e.clientY - startY) > MOVE_THRESHOLD) {
        clearTimer();
      }
    });
    el.addEventListener('touchmove', (e) => {
      if (timer === null) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (Math.abs(t.clientX - startX) > MOVE_THRESHOLD || Math.abs(t.clientY - startY) > MOVE_THRESHOLD) {
        clearTimer();
      }
    }, { passive: true });
    el.addEventListener('mouseup', cancel);
    el.addEventListener('mouseleave', cancel);
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('dragstart', cancel);
  }

  function sanitizeName(raw) {
    if (!raw) return '';
    let v = String(raw);
    v = v.replace(/\s+/g, ' ').trim();
    if (v.length > 100) v = v.slice(0, 100);
    return v;
  }
})();
