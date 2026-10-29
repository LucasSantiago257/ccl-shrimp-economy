ALTER TABLE purchases MODIFY supplier_id BIGINT NULL;
ALTER TABLE financial_titles DROP CHECK financial_titles_chk_2;
ALTER TABLE financial_titles ADD CONSTRAINT ck_financial_title_origin CHECK (
 (nature='RECEIVABLE' AND sale_id IS NOT NULL AND customer_id IS NOT NULL AND purchase_id IS NULL AND supplier_id IS NULL AND expense_id IS NULL)
 OR (nature='PAYABLE' AND purchase_id IS NOT NULL AND sale_id IS NULL AND customer_id IS NULL AND expense_id IS NULL)
 OR (nature='PAYABLE' AND expense_id IS NOT NULL AND sale_id IS NULL AND purchase_id IS NULL AND customer_id IS NULL AND supplier_id IS NULL)
);

-- Shared transactional gate: closing and posting must use the same lock.
CREATE TABLE business_guard (
 id TINYINT PRIMARY KEY,
 CHECK (id=1)
) ENGINE=InnoDB;
INSERT INTO business_guard(id) VALUES(1);

CREATE TABLE period_closures (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 date_from DATE NOT NULL,
 date_to DATE NOT NULL,
 timezone VARCHAR(60) NOT NULL,
 closed_at DATETIME(6) NOT NULL,
 closed_by VARCHAR(100) NOT NULL,
 note VARCHAR(500) NOT NULL DEFAULT '',
 schema_version INT NOT NULL,
 snapshot_sha256 CHAR(64) NOT NULL,
 -- TEXT preserves the exact bytes used for SHA-256; MySQL JSON can reorder them.
 snapshot_json LONGTEXT NOT NULL,
 UNIQUE(date_from,date_to),
 CHECK(date_from<=date_to), CHECK(JSON_VALID(snapshot_json))
) ENGINE=InnoDB;
CREATE INDEX idx_closures_dates ON period_closures(date_to,date_from);

CREATE TRIGGER period_closures_immutable_update BEFORE UPDATE ON period_closures
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fechamentos sao imutaveis: alteracao proibida';
CREATE TRIGGER period_closures_immutable_delete BEFORE DELETE ON period_closures
 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Fechamentos sao imutaveis: exclusao proibida';
