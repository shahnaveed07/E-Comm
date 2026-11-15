export function createInventoryService({ repo }) {
  return {
    async listLowStockVariants() {
      const catalog = await repo.getCatalog({ includeArchived: false, includeHidden: true });
      const lowStock = [];
      for (const product of catalog) {
        for (const variant of product.variants || []) {
          if (variant.availableStock <= variant.lowStockThreshold) {
            lowStock.push({
              productId: product.id,
              productName: product.name,
              variantId: variant.id,
              sku: variant.sku,
              weightSize: variant.weightSize,
              stockQuantity: variant.stockQuantity,
              reservedStock: variant.reservedStock,
              availableStock: variant.availableStock,
              lowStockThreshold: variant.lowStockThreshold,
            });
          }
        }
      }
      return lowStock;
    },

    async adjustVariantStock(variantId, payload, actorUserId) {
      return repo.adjustVariantInventory(variantId, {
        ...payload,
        actorUserId,
      });
    },
  };
}
