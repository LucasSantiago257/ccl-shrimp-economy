CREATE TABLE app_account (
 id TINYINT PRIMARY KEY,
 username VARCHAR(100) NOT NULL UNIQUE,
 password_hash VARCHAR(100) NOT NULL,
 version BIGINT NOT NULL DEFAULT 0,
 reset_hash CHAR(64) NULL,
 reset_expires DATETIME(6) NULL,
 reset_sent_at DATETIME(6) NULL,
 CHECK(id=1)
) ENGINE=InnoDB;

