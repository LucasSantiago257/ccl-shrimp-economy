CREATE TABLE opening_balances (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 cash_amount DECIMAL(19,2) NOT NULL,
 note VARCHAR(500) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL
);
CREATE TABLE opening_stock (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 opening_id BIGINT NOT NULL,
 product_id BIGINT NOT NULL,
 product_name VARCHAR(160) NOT NULL,
 product_code VARCHAR(40) NOT NULL,
 quantity DECIMAL(14,3) NOT NULL,
 unit_cost DECIMAL(19,6) NOT NULL,
 total_cost DECIMAL(19,6) NOT NULL,
 UNIQUE(opening_id,product_id),
 FOREIGN KEY(opening_id) REFERENCES opening_balances(id),
 FOREIGN KEY(product_id) REFERENCES products(id),
 CHECK(quantity>0), CHECK(unit_cost>0), CHECK(total_cost>0)
);
CREATE TABLE opening_reversals (
 opening_id BIGINT PRIMARY KEY,
 reason VARCHAR(500) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 FOREIGN KEY(opening_id) REFERENCES opening_balances(id),
 CHECK(CHAR_LENGTH(TRIM(reason))>=5)
);
CREATE TRIGGER opening_balances_no_update BEFORE UPDATE ON opening_balances FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Saldos iniciais sao imutaveis';
CREATE TRIGGER opening_balances_no_delete BEFORE DELETE ON opening_balances FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Saldos iniciais sao imutaveis';
CREATE TRIGGER opening_stock_no_update BEFORE UPDATE ON opening_stock FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estoque inicial e imutavel';
CREATE TRIGGER opening_stock_no_delete BEFORE DELETE ON opening_stock FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estoque inicial e imutavel';
CREATE TRIGGER opening_reversals_no_update BEFORE UPDATE ON opening_reversals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estornos de implantacao sao imutaveis';
CREATE TRIGGER opening_reversals_no_delete BEFORE DELETE ON opening_reversals FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Estornos de implantacao sao imutaveis';

ALTER TABLE financial_titles
 ADD COLUMN opening_id BIGINT NULL,
 ADD COLUMN opening_description VARCHAR(250) NOT NULL DEFAULT '',
 ADD COLUMN opening_purchase BOOLEAN NOT NULL DEFAULT FALSE,
 ADD FOREIGN KEY(opening_id) REFERENCES opening_balances(id),
 DROP CHECK ck_financial_title_origin;
ALTER TABLE financial_titles ADD CONSTRAINT ck_financial_title_origin CHECK (
 (opening_id IS NULL AND opening_purchase=FALSE AND (
  (nature='RECEIVABLE' AND sale_id IS NOT NULL AND customer_id IS NOT NULL AND purchase_id IS NULL AND supplier_id IS NULL AND expense_id IS NULL)
  OR (nature='PAYABLE' AND purchase_id IS NOT NULL AND sale_id IS NULL AND customer_id IS NULL AND expense_id IS NULL)
  OR (nature='PAYABLE' AND expense_id IS NOT NULL AND sale_id IS NULL AND purchase_id IS NULL AND customer_id IS NULL AND supplier_id IS NULL)))
 OR (opening_id IS NOT NULL AND sale_id IS NULL AND purchase_id IS NULL AND expense_id IS NULL AND CHAR_LENGTH(TRIM(opening_description))>0 AND (
  (nature='RECEIVABLE' AND customer_id IS NOT NULL AND supplier_id IS NULL AND opening_purchase=FALSE)
  OR (nature='PAYABLE' AND customer_id IS NULL)))
);
CREATE OR REPLACE VIEW title_positions AS
 SELECT t.*,c.id AS correction_id,COALESCE(c.occurred_at,r.occurred_at) AS cancelled_at
 FROM financial_titles t LEFT JOIN corrections c ON
 (c.kind='SALE' AND c.source_id=t.sale_id) OR
 (c.kind='PURCHASE' AND c.source_id=t.purchase_id) OR
 (c.kind='EXPENSE' AND c.source_id=t.expense_id)
 LEFT JOIN opening_reversals r ON r.opening_id=t.opening_id;

CREATE VIEW cash_events AS
 SELECT direction COLLATE utf8mb4_unicode_ci AS direction,amount,occurred_at,CAST('SETTLEMENT' AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_unicode_ci AS origin FROM settlement_events
 UNION ALL SELECT 'IN',cash_amount,occurred_at,'OPENING' FROM opening_balances
 UNION ALL SELECT 'IN',-b.cash_amount,r.occurred_at,'OPENING' FROM opening_reversals r JOIN opening_balances b ON b.id=r.opening_id;

CREATE OR REPLACE VIEW stock_events AS
 SELECT m.id,m.product_id,m.type COLLATE utf8mb4_unicode_ci AS type,m.quantity_delta,m.value_delta,m.purchase_item_id,m.sale_item_id,m.reason,
        m.occurred_at,m.created_by,NULL AS correction_id,m.id AS source_movement_id,CONCAT('MOVEMENT:',m.id) AS event_key
 FROM stock_movements m
 UNION ALL
 SELECT -a.id,m.product_id,m.type,-m.quantity_delta,-m.value_delta,m.purchase_item_id,m.sale_item_id,
        CONCAT('Correção #',c.id,': ',LEFT(c.reason,180)),c.occurred_at,c.created_by,c.id,m.id,CONCAT('CORRECTION:',a.id)
 FROM correction_stock a JOIN corrections c ON c.id=a.correction_id JOIN stock_movements m ON m.id=a.movement_id
 UNION ALL
 SELECT s.id,s.product_id,'OPENING',s.quantity,s.total_cost,NULL,NULL,CONCAT('Saldo inicial #',b.id),
        b.occurred_at,b.created_by,NULL,NULL,CONCAT('OPENING:',s.id)
 FROM opening_stock s JOIN opening_balances b ON b.id=s.opening_id
 UNION ALL
 SELECT s.id,s.product_id,'OPENING',-s.quantity,-s.total_cost,NULL,NULL,CONCAT('Estorno do saldo inicial #',r.opening_id,': ',LEFT(r.reason,150)),
        r.occurred_at,r.created_by,NULL,NULL,CONCAT('OPENING_REVERSAL:',s.id)
 FROM opening_stock s JOIN opening_reversals r ON r.opening_id=s.opening_id;
