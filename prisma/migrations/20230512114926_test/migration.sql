-- AlterTable
ALTER TABLE `Request` MODIFY `source` ENUM('TELEGRAM', 'DISCORD') NULL;

-- CreateTable
CREATE TABLE `DiscordRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `query` VARCHAR(191) NOT NULL,
    `requestId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DiscordRequest` ADD CONSTRAINT `DiscordRequest_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `Request`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
