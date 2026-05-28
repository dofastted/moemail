CREATE INDEX `email_address_domain_idx` ON `email` (SUBSTR(LOWER("address"), INSTR(LOWER("address"), '@') + 1));
