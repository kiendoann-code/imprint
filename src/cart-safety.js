/* ImPrint cart safety: idempotent confirmation, optimistic edits, bulk recovery. */
(function () {
  'use strict';
  let confirming = false;
  let addingPlain = false;
  let confirmedDraftId = null;

  const beforeConfirm = confirmDesign;
  confirmDesign = async function () {
    if (confirming) return;
    // Repeated clicks after a completed confirmation must not create another row.
    if (draft?.id && draft.id === confirmedDraftId && !editCartId) {
      go('cart');
      return;
    }
    confirming = true;
    const button = document.querySelector('button[onclick="confirmDesign()"]');
    if (button) {
      button.disabled = true;
      button.textContent = 'Đang thêm vào giỏ…';
    }
    const draftId = draft?.id;
    try {
      // Assign a stable cart-item ID before any upload. If saving fails, retry
      // updates the same row rather than appending another item.
      if ($('#rights')?.checked && (!$('#acceptQuality') || $('#acceptQuality').checked) && !editCartId) {
        editCartId = uid();
      }
      await beforeConfirm();
      if (location.hash === '#cart') confirmedDraftId = draftId;
    } finally {
      confirming = false;
      if (button?.isConnected) {
        button.disabled = false;
        button.textContent = 'Xác nhận & thêm vào giỏ';
      }
    }
  };

  const beforePlain = addPlain;
  addPlain = async function () {
    if (addingPlain) return;
    addingPlain = true;
    const countBefore = data.cart.length;
    try {
      // A failed save leaves a local row. Retry its synchronization instead
      // of calling addPlain again and generating another row.
      if (addPlain.pendingId && data.cart.some(item => item.id === addPlain.pendingId)) {
        await persist();
        addPlain.pendingId = null;
        go('cart');
        return;
      }
      await beforePlain();
      addPlain.pendingId = null;
    } catch (error) {
      if (data.cart.length > countBefore) addPlain.pendingId = data.cart[data.cart.length - 1]?.id;
      throw error;
    } finally {
      addingPlain = false;
    }
  };

  function duplicateCartIds() {
    const seen = new Set();
    const duplicateIds = [];
    for (const item of data.cart) {
      // Plain garments can be deliberately added more than once; don't auto-
      // classify these as duplicates. Only exactly matching custom designs.
      if (!item.design?.id) continue;
      const d = item.design;
      const key = JSON.stringify([
        item.product?.id, item.color, item.size, item.sleeveColor, item.model,
        d.id, d.productId, d.color, d.size, d.side, d.model,
        d.sleeveColor, d.layers, d.sides, d.placement
      ]);
      if (seen.has(key)) duplicateIds.push(item.id);
      else seen.add(key);
    }
    return duplicateIds;
  }

  function redrawCart() {
    updateHeader();
    if (location.hash === '#cart') cart();
    else if (location.hash === '#checkout') checkout();
  }

  async function saveCartChange() {
    try {
      await persist();
    } catch (error) {
      // Keep the customer's intended change visible; don't silently restore
      // stale items. A subsequent edit/retry will attempt synchronization.
      toast('Giỏ chưa đồng bộ với máy chủ. Kiểm tra kết nối và thử lại.');
    }
  }

  removeItem = function (id) {
    if (!data.cart.some(item => item.id === id)) return;
    data.cart = data.cart.filter(item => item.id !== id);
    redrawCart();
    return saveCartChange();
  };

  quantity = function (id, delta) {
    const item = data.cart.find(entry => entry.id === id);
    if (!item) return;
    const product = data.products.find(p => p.id === item.product?.id);
    if (item.qty + delta < 1 || item.qty + delta > (product?.stock || 0)) {
      toast('Số lượng vượt tồn kho.');
      return;
    }
    item.qty += delta;
    redrawCart();
    return saveCartChange();
  };

  const beforeCart = cart;
  cart = function () {
    beforeCart();
    if (!data.cart.length) return;
    const rows = app.querySelector('.checkout > div:first-child');
    if (!rows) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'row imprint-cart-cleanup';
    toolbar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px';
    const duplicates = duplicateCartIds();

    function action(label, callback) {
      const button = document.createElement('button');
      button.className = 'quiet';
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', callback);
      toolbar.appendChild(button);
    }
    if (duplicates.length) action('Dọn ' + duplicates.length + ' sản phẩm trùng', () => {
      if (!confirm('Giữ lại một bản cho mỗi thiết kế trùng khớp và xóa các bản dư?')) return;
      const ids = new Set(duplicateCartIds());
      data.cart = data.cart.filter(item => !ids.has(item.id));
      redrawCart();
      void saveCartChange();
    });
    action('Xóa toàn bộ giỏ', () => {
      if (!confirm('Xóa toàn bộ ' + data.cart.length + ' sản phẩm trong giỏ? Thao tác không thể hoàn tác.')) return;
      data.cart = [];
      redrawCart();
      void saveCartChange();
    });
    rows.prepend(toolbar);
  };
})();
