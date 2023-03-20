/*
  Warnings:

  - You are about to drop the column `telegramAccountId` on the `Request` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Request` DROP FOREIGN KEY `Request_telegramAccountId_fkey`;

-- AlterTable
ALTER TABLE `Request` DROP COLUMN `telegramAccountId`,
    ADD COLUMN `source` ENUM('TELEGRAM') NULL;

-- CreateTable
CREATE TABLE `TelegramRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `query` VARCHAR(191) NOT NULL,
    `type` ENUM('PREFETCH', 'INLINE', 'MESSAGE') NOT NULL,
    `requestId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TelegramRequest` ADD CONSTRAINT `TelegramRequest_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `TelegramAccount`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
