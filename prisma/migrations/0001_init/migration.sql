-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `fullName` VARCHAR(180) NOT NULL,
    `role` ENUM('CUSTOMER', 'ADMIN') NOT NULL DEFAULT 'CUSTOMER',
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `passwordHash` VARCHAR(255) NOT NULL,
    `passwordAlgo` VARCHAR(32) NOT NULL DEFAULT 'bcrypt',
    `passwordSalt` VARCHAR(128) NULL,
    `emailVerifiedAt` TIMESTAMP(3) NULL,
    `verifyTokenHash` VARCHAR(128) NULL,
    `verifyTokenExpiresAt` TIMESTAMP(3) NULL,
    `resetTokenHash` VARCHAR(128) NULL,
    `resetTokenExpiresAt` TIMESTAMP(3) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_role_status_idx`(`role`, `status`),
    INDEX `User_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSession` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `sessionTokenHash` VARCHAR(128) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `expiresAt` TIMESTAMP(3) NOT NULL,
    `revokedAt` TIMESTAMP(3) NULL,
    `lastSeenAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserSession_sessionTokenHash_key`(`sessionTokenHash`),
    INDEX `UserSession_userId_revokedAt_expiresAt_idx`(`userId`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Address` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `label` VARCHAR(60) NOT NULL DEFAULT 'Home',
    `fullName` VARCHAR(180) NOT NULL,
    `street` VARCHAR(255) NOT NULL,
    `city` VARCHAR(120) NOT NULL,
    `state` VARCHAR(80) NOT NULL,
    `postalCode` VARCHAR(32) NOT NULL,
    `countryCode` VARCHAR(2) NOT NULL DEFAULT 'US',
    `phone` VARCHAR(40) NOT NULL DEFAULT '',
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    INDEX `Address_userId_isDefault_idx`(`userId`, `isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `name` VARCHAR(140) NOT NULL,
    `description` TEXT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `Category_slug_key`(`slug`),
    INDEX `Category_isActive_sortOrder_idx`(`isActive`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `name` VARCHAR(200) NOT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `origin` VARCHAR(160) NOT NULL,
    `harvestBatch` VARCHAR(160) NOT NULL,
    `roastProfile` VARCHAR(64) NOT NULL,
    `roastLabel` VARCHAR(120) NOT NULL,
    `shortDescription` TEXT NOT NULL,
    `tastingNotes` TEXT NOT NULL,
    `nutritionPerServing` JSON NOT NULL,
    `dietaryTags` JSON NOT NULL,
    `allergens` JSON NOT NULL,
    `featuredTag` VARCHAR(80) NULL,
    `isVisible` BOOLEAN NOT NULL DEFAULT true,
    `isArchived` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `Product_slug_key`(`slug`),
    INDEX `Product_categoryId_isVisible_isArchived_idx`(`categoryId`, `isVisible`, `isArchived`),
    INDEX `Product_roastProfile_idx`(`roastProfile`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductVariant` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(80) NOT NULL,
    `weightSize` VARCHAR(16) NOT NULL,
    `weightLabel` VARCHAR(80) NOT NULL,
    `grams` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `priceMinor` INTEGER NOT NULL,
    `priceDecimal` DECIMAL(12, 2) NOT NULL,
    `stockQuantity` INTEGER NOT NULL DEFAULT 50,
    `reservedStock` INTEGER NOT NULL DEFAULT 0,
    `lowStockThreshold` INTEGER NOT NULL DEFAULT 8,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `ProductVariant_sku_key`(`sku`),
    INDEX `ProductVariant_stockQuantity_reservedStock_idx`(`stockQuantity`, `reservedStock`),
    UNIQUE INDEX `ProductVariant_productId_weightSize_key`(`productId`, `weightSize`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductImage` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(1024) NOT NULL,
    `storageKey` VARCHAR(512) NULL,
    `provider` VARCHAR(32) NOT NULL DEFAULT 'local',
    `altText` VARCHAR(255) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductImage_productId_sortOrder_idx`(`productId`, `sortOrder`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Review` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `authorName` VARCHAR(180) NOT NULL,
    `rating` INTEGER NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `comment` TEXT NOT NULL,
    `verifiedPurchase` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    INDEX `Review_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `Review_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerPreference` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `preferredRoast` VARCHAR(64) NOT NULL DEFAULT 'raw_sprouted',
    `dietaryGoals` JSON NOT NULL,
    `excludedAllergens` JSON NOT NULL,
    `wishlistProductIds` JSON NULL,
    `emailUpdates` BOOLEAN NOT NULL DEFAULT true,
    `smsDeliveryAlerts` BOOLEAN NOT NULL DEFAULT false,
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `CustomerPreference_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `status` ENUM('AWAITING_PAYMENT', 'PLACED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED') NOT NULL DEFAULT 'PLACED',
    `paymentStatus` ENUM('PENDING', 'PENDING_MANUAL_VERIFICATION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `isLive` BOOLEAN NOT NULL DEFAULT true,
    `source` VARCHAR(32) NOT NULL DEFAULT 'storefront',
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `subtotalMinor` INTEGER NOT NULL,
    `shippingFeeMinor` INTEGER NOT NULL,
    `discountMinor` INTEGER NOT NULL DEFAULT 0,
    `totalMinor` INTEGER NOT NULL,
    `totalDecimal` DECIMAL(12, 2) NOT NULL,
    `couponCode` VARCHAR(64) NULL,
    `paymentSummary` VARCHAR(160) NOT NULL,
    `trackingNumber` VARCHAR(120) NOT NULL,
    `estimatedDelivery` VARCHAR(32) NULL,
    `notes` TEXT NULL,
    `shippingAddress` JSON NOT NULL,
    `placedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `archivedAt` TIMESTAMP(3) NULL,
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `Order_orderNumber_key`(`orderNumber`),
    INDEX `Order_userId_placedAt_idx`(`userId`, `placedAt`),
    INDEX `Order_status_paymentStatus_isLive_idx`(`status`, `paymentStatus`, `isLive`),
    INDEX `Order_placedAt_idx`(`placedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NULL,
    `skuSnapshot` VARCHAR(80) NOT NULL,
    `productNameSnapshot` VARCHAR(200) NOT NULL,
    `weightSize` VARCHAR(16) NOT NULL,
    `weightLabel` VARCHAR(80) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `unitPriceMinor` INTEGER NOT NULL,
    `unitPriceDecimal` DECIMAL(12, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `lineTotalMinor` INTEGER NOT NULL,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    INDEX `OrderItem_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `provider` ENUM('UPI_QR', 'RAZORPAY', 'STRIPE', 'SAVED_CARD_TOKEN', 'MANUAL_INVOICE') NOT NULL,
    `status` ENUM('PENDING', 'PENDING_MANUAL_VERIFICATION', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `amountMinor` INTEGER NOT NULL,
    `amountDecimal` DECIMAL(12, 2) NOT NULL,
    `refundedMinor` INTEGER NOT NULL DEFAULT 0,
    `idempotencyKey` VARCHAR(128) NOT NULL,
    `paymentReference` VARCHAR(128) NOT NULL,
    `externalOrderId` VARCHAR(180) NULL,
    `externalPaymentId` VARCHAR(180) NULL,
    `upiUri` TEXT NULL,
    `qrExpiresAt` TIMESTAMP(3) NULL,
    `utrNumber` VARCHAR(64) NULL,
    `utrSubmittedAt` TIMESTAMP(3) NULL,
    `verifiedByUserId` VARCHAR(191) NULL,
    `verifiedAt` TIMESTAMP(3) NULL,
    `verificationNotes` TEXT NULL,
    `rejectionReason` TEXT NULL,
    `providerMetadata` JSON NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `Payment_idempotencyKey_key`(`idempotencyKey`),
    UNIQUE INDEX `Payment_paymentReference_key`(`paymentReference`),
    INDEX `Payment_orderId_status_idx`(`orderId`, `status`),
    INDEX `Payment_utrNumber_idx`(`utrNumber`),
    INDEX `Payment_provider_status_idx`(`provider`, `status`),
    INDEX `Payment_externalOrderId_idx`(`externalOrderId`),
    INDEX `Payment_externalPaymentId_idx`(`externalPaymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentWebhookEvent` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('UPI_QR', 'RAZORPAY', 'STRIPE', 'SAVED_CARD_TOKEN', 'MANUAL_INVOICE') NOT NULL,
    `eventId` VARCHAR(180) NOT NULL,
    `eventType` VARCHAR(120) NOT NULL,
    `signatureValid` BOOLEAN NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'PROCESSED',
    `payload` JSON NOT NULL,
    `processedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentWebhookEvent_processedAt_idx`(`processedAt`),
    UNIQUE INDEX `PaymentWebhookEvent_provider_eventId_key`(`provider`, `eventId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SavedPaymentMethod` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(32) NOT NULL DEFAULT 'CARD_TOKEN',
    `tokenRef` VARCHAR(180) NOT NULL,
    `brand` VARCHAR(40) NOT NULL,
    `last4` VARCHAR(4) NOT NULL,
    `expMonth` VARCHAR(2) NOT NULL,
    `expYear` VARCHAR(4) NOT NULL,
    `cardholderName` VARCHAR(180) NOT NULL,
    `billingZip` VARCHAR(24) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SavedPaymentMethod_userId_isDefault_idx`(`userId`, `isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(64) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `description` VARCHAR(255) NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `subtotalMinor` INTEGER NOT NULL,
    `shippingFeeMinor` INTEGER NOT NULL,
    `discountMinor` INTEGER NOT NULL DEFAULT 0,
    `totalMinor` INTEGER NOT NULL,
    `amountDecimal` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('UNPAID', 'PAID', 'VOID', 'REFUNDED') NOT NULL DEFAULT 'UNPAID',
    `paymentMethodSummary` VARCHAR(160) NOT NULL,
    `issuedAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` TIMESTAMP(3) NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    INDEX `Invoice_userId_issuedAt_idx`(`userId`, `issuedAt`),
    INDEX `Invoice_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryMovement` (
    `id` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `type` ENUM('RESTOCK', 'RESERVE', 'RELEASE', 'COMMIT', 'ADJUSTMENT', 'RETURN') NOT NULL,
    `quantityDelta` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `reservedAfter` INTEGER NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `InventoryMovement_variantId_createdAt_idx`(`variantId`, `createdAt`),
    INDEX `InventoryMovement_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderStatusHistory` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `fromStatus` ENUM('AWAITING_PAYMENT', 'PLACED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED') NULL,
    `toStatus` ENUM('AWAITING_PAYMENT', 'PLACED', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED') NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `note` VARCHAR(255) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OrderStatusHistory_orderId_createdAt_idx`(`orderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Coupon` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `discountType` ENUM('PERCENT', 'FIXED_MINOR') NOT NULL,
    `discountValue` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL DEFAULT 'USD',
    `minOrderMinor` INTEGER NOT NULL DEFAULT 0,
    `maxDiscountMinor` INTEGER NULL,
    `usageLimit` INTEGER NULL,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` TIMESTAMP(3) NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Coupon_code_key`(`code`),
    INDEX `Coupon_code_isActive_idx`(`code`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `actorRole` VARCHAR(32) NOT NULL,
    `action` VARCHAR(120) NOT NULL,
    `entityType` VARCHAR(80) NOT NULL,
    `entityId` VARCHAR(128) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `metadata` JSON NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    INDEX `AuditLog_action_createdAt_idx`(`action`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoreSetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `value` JSON NOT NULL,
    `description` VARCHAR(255) NULL,
    `updatedByUserId` VARCHAR(191) NULL,
    `updatedAt` TIMESTAMP(3) NOT NULL,

    UNIQUE INDEX `StoreSetting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReturnRequest` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED') NOT NULL DEFAULT 'REQUESTED',
    `adminNote` TEXT NULL,
    `createdAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` TIMESTAMP(3) NOT NULL,

    INDEX `ReturnRequest_orderId_idx`(`orderId`),
    INDEX `ReturnRequest_userId_status_idx`(`userId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NotificationJob` (
    `id` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(32) NOT NULL DEFAULT 'email',
    `recipient` VARCHAR(255) NOT NULL,
    `template` VARCHAR(80) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `scheduledAt` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` TIMESTAMP(3) NULL,

    INDEX `NotificationJob_status_scheduledAt_idx`(`status`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSession` ADD CONSTRAINT `UserSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Address` ADD CONSTRAINT `Address_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ProductVariant` ADD CONSTRAINT `ProductVariant_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Review` ADD CONSTRAINT `Review_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Review` ADD CONSTRAINT `Review_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CustomerPreference` ADD CONSTRAINT `CustomerPreference_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_verifiedByUserId_fkey` FOREIGN KEY (`verifiedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SavedPaymentMethod` ADD CONSTRAINT `SavedPaymentMethod_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `InventoryMovement` ADD CONSTRAINT `InventoryMovement_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `OrderStatusHistory` ADD CONSTRAINT `OrderStatusHistory_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `ReturnRequest` ADD CONSTRAINT `ReturnRequest_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `ReturnRequest` ADD CONSTRAINT `ReturnRequest_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
