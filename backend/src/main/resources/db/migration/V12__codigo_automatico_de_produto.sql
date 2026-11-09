CREATE TABLE product_code_guard (
 id TINYINT PRIMARY KEY,
 CHECK(id=1)
);
INSERT INTO product_code_guard(id) VALUES(1);
CREATE TABLE product_code_sequences (
 prefix VARCHAR(3) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
 last_number BIGINT NOT NULL,
 CHECK(last_number>=0)
);
