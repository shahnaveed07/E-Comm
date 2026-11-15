import { AppError } from '../../middleware/errorHandler.js';

export function createCatalogService({ repo, imageStorage }) {
  return {
    async listPublicCatalog() {
      return repo.getCatalog({ includeArchived: false, includeHidden: false });
    },

    async listAdminCatalog() {
      return repo.getCatalog({ includeArchived: true, includeHidden: true });
    },

    async getProduct(id) {
      const p = await repo.getProductById(id);
      if (!p) throw new AppError(404, 'Product not found.', 'NOT_FOUND');
      return p;
    },

    async createProduct(input, actorUserId) {
      return repo.createProduct(input, actorUserId);
    },

    async updateProduct(id, patch, actorUserId) {
      return repo.updateProduct(id, patch, actorUserId);
    },

    async uploadAndAttachImage(productId, { base64Data, imageUrl, filename, altText, isPrimary }, actorUserId) {
      const product = await repo.getProductById(productId);
      if (!product) throw new AppError(404, 'Product not found.', 'NOT_FOUND');

      if (base64Data) {
        const uploaded = await imageStorage.uploadImageBase64({ base64Data, filename });
        return repo.addProductImage(
          productId,
          {
            url: uploaded.url,
            storageKey: uploaded.storageKey,
            provider: uploaded.provider,
            altText: altText || product.name,
            isPrimary: Boolean(isPrimary),
          },
          actorUserId
        );
      }

      if (!imageUrl) {
        throw new AppError(400, 'Either imageUrl or base64 image file is required.', 'VALIDATION_ERROR');
      }

      return repo.addProductImage(
        productId,
        {
          url: imageUrl,
          provider: 'external',
          altText: altText || product.name,
          isPrimary: Boolean(isPrimary),
        },
        actorUserId
      );
    },

    async removeProductImage(imageId, actorUserId) {
      return repo.deleteProductImage(imageId, actorUserId);
    },
  };
}
