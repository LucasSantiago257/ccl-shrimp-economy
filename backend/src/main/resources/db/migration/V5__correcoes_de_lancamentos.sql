CREATE TABLE corrections (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 kind VARCHAR(12) NOT NULL,
 source_id BIGINT NOT NULL,
 reason VARCHAR(500) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 UNIQUE(kind,source_id),
 CHECK(kind IN ('SALE','PURCHASE','EXPENSE','PAYMENT','LOSS')),
 CHECK(CHAR_LENGTH(TRIM(reason))>=5)
) ENGINE=InnoDB;
CREATE INDEX idx_corrections_date ON corrections(occurred_at);

CREATE TABLE correction_stock (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 correction_id BIGINT NOT NULL,
 movement_id BIGINT NOT NULL UNIQUE,
 FOREIGN KEY(correction_id) REFERENCES corrections(id),
 FOREIGN KEY(movement_id) REFERENCES stock_movements(id)
) ENGINE=InnoDB;

CREATE TABLE correction_replacements (
 correction_id BIGINT PRIMARY KEY,
 kind VARCHAR(12) NOT NULL,
 source_id BIGINT NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 UNIQUE(kind,source_id),
 FOREIGN KEY(correction_id) REFERENCES corrections(id)
) ENGINE=InnoDB;

CREATE TRIGGER corrections_no_update BEFORE UPDATE ON corrections FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Correcoes sao imutaveis';
CREATE TRIGGER corrections_no_delete BEFORE DELETE ON corrections FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Correcoes sao imutaveis';
CREATE TRIGGER correction_stock_no_update BEFORE UPDATE ON correction_stock FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estornos de estoque sao imutaveis';
CREATE TRIGGER correction_stock_no_delete BEFORE DELETE ON correction_stock FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estornos de estoque sao imutaveis';
CREATE TRIGGER correction_replacements_no_update BEFORE UPDATE ON correction_replacements FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Vinculos de substituicao sao imutaveis';
CREATE TRIGGER correction_replacements_no_delete BEFORE DELETE ON correction_replacements FOR EACH ROW
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Vinculos de substituicao sao imutaveis';

CREATE VIEW sale_events AS
 SELECT id,total,gross_total,discount_amount,cost_total,occurred_at FROM sales
 UNION ALL
 SELECT -c.id,-s.total,-s.gross_total,-s.discount_amount,-s.cost_total,c.occurred_at
 FROM corrections c JOIN sales s ON c.kind='SALE' AND c.source_id=s.id;
CREATE VIEW purchase_events AS
 SELECT id,total,occurred_at FROM purchases
 UNION ALL
 SELECT -c.id,-p.total,c.occurred_at FROM corrections c JOIN purchases p ON c.kind='PURCHASE' AND c.source_id=p.id;
CREATE VIEW expense_events AS
 SELECT id,total,occurred_at FROM expenses
 UNION ALL
 SELECT -c.id,-e.total,c.occurred_at FROM corrections c JOIN expenses e ON c.kind='EXPENSE' AND c.source_id=e.id;
CREATE VIEW settlement_events AS
 SELECT id,direction,amount,occurred_at FROM settlements
 UNION ALL
 SELECT -c.id,s.direction,-s.amount,c.occurred_at FROM corrections c JOIN settlements s ON c.kind='PAYMENT' AND c.source_id=s.id;
CREATE VIEW allocation_events AS
 SELECT a.*,s.occurred_at,NULL AS correction_id FROM settlement_allocations a JOIN settlements s ON s.id=a.settlement_id
 UNION ALL
 SELECT a.settlement_id,a.title_id,-a.amount,c.occurred_at,c.id
 FROM corrections c JOIN settlement_allocations a ON c.kind='PAYMENT' AND c.source_id=a.settlement_id;
CREATE VIEW title_positions AS
 SELECT t.*,c.id AS correction_id,c.occurred_at AS cancelled_at
 FROM financial_titles t LEFT JOIN corrections c ON
 (c.kind='SALE' AND c.source_id=t.sale_id) OR
 (c.kind='PURCHASE' AND c.source_id=t.purchase_id) OR
 (c.kind='EXPENSE' AND c.source_id=t.expense_id);
CREATE VIEW stock_events AS
 SELECT m.id,m.product_id,m.type,m.quantity_delta,m.value_delta,m.purchase_item_id,m.sale_item_id,m.reason,
        m.occurred_at,m.created_by,NULL AS correction_id,m.id AS source_movement_id
 FROM stock_movements m
 UNION ALL
 SELECT -a.id,m.product_id,m.type,-m.quantity_delta,-m.value_delta,m.purchase_item_id,m.sale_item_id,
        CONCAT('Correção #',c.id,': ',LEFT(c.reason,180)),c.occurred_at,c.created_by,c.id,m.id
 FROM correction_stock a JOIN corrections c ON c.id=a.correction_id JOIN stock_movements m ON m.id=a.movement_id;

