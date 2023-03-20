-- AddForeignKey
ALTER TABLE `TelegramRequest` ADD CONSTRAINT `TelegramRequest_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `Request`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
