CREATE TABLE login_attempt_windows (
    source_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    window_start BIGINT NOT NULL,
    attempts INT UNSIGNED NOT NULL,
    PRIMARY KEY(source_hash,window_start),
    INDEX login_attempt_windows_age(window_start)
);
