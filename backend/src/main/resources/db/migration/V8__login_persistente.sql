CREATE TABLE remembered_logins (
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    account_version BIGINT NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    INDEX remembered_logins_expiry (expires_at)
);
