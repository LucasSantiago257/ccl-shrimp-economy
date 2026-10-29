CREATE TABLE customers (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(160) NOT NULL,
 phone VARCHAR(30) NOT NULL DEFAULT '',
 document VARCHAR(30) NOT NULL DEFAULT '',
 notes VARCHAR(1000) NOT NULL DEFAULT '',
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
CREATE INDEX idx_customers_name ON customers(name);

CREATE TABLE suppliers (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(160) NOT NULL,
 phone VARCHAR(30) NOT NULL DEFAULT '',
 document VARCHAR(30) NOT NULL DEFAULT '',
 notes VARCHAR(1000) NOT NULL DEFAULT '',
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;

CREATE TABLE products (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 code VARCHAR(40) NOT NULL UNIQUE,
 name VARCHAR(160) NOT NULL,
 unit VARCHAR(4) NOT NULL DEFAULT 'KG',
 suggested_price DECIMAL(19,6) NOT NULL,
 minimum_stock DECIMAL(14,3) NOT NULL DEFAULT 0,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 CHECK (suggested_price > 0), CHECK (minimum_stock >= 0), CHECK (unit = 'KG')
) ENGINE=InnoDB;
CREATE TABLE stock_balances (
 product_id BIGINT PRIMARY KEY,
 quantity DECIMAL(14,3) NOT NULL DEFAULT 0,
 stock_value DECIMAL(19,6) NOT NULL DEFAULT 0,
 average_cost DECIMAL(19,6) NOT NULL DEFAULT 0,
 FOREIGN KEY (product_id) REFERENCES products(id),
 CHECK (quantity >= 0), CHECK (stock_value >= 0), CHECK (average_cost >= 0)
) ENGINE=InnoDB;
INSERT INTO products(code,name,suggested_price,minimum_stock) VALUES ('CAM-001','Camarão',50,5);
INSERT INTO stock_balances(product_id) SELECT id FROM products;

CREATE TABLE purchases (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 supplier_id BIGINT NOT NULL,
 total DECIMAL(19,2) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED',
 FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
 CHECK (total > 0), CHECK (status = 'CONFIRMED')
) ENGINE=InnoDB;
CREATE INDEX idx_purchases_date ON purchases(occurred_at);
CREATE TABLE purchase_items (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 purchase_id BIGINT NOT NULL,
 product_id BIGINT NOT NULL,
 quantity DECIMAL(14,3) NOT NULL,
 unit_price DECIMAL(19,6) NOT NULL,
 total DECIMAL(19,2) NOT NULL,
 FOREIGN KEY (purchase_id) REFERENCES purchases(id),
 FOREIGN KEY (product_id) REFERENCES products(id),
 UNIQUE(purchase_id,product_id),
 CHECK (quantity > 0), CHECK (unit_price > 0), CHECK (total > 0)
) ENGINE=InnoDB;

CREATE TABLE sales (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 customer_id BIGINT NOT NULL,
 total DECIMAL(19,2) NOT NULL,
 cost_total DECIMAL(19,6) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'CONFIRMED',
 FOREIGN KEY (customer_id) REFERENCES customers(id),
 CHECK (total > 0), CHECK (cost_total >= 0), CHECK (status = 'CONFIRMED')
) ENGINE=InnoDB;
CREATE INDEX idx_sales_date ON sales(occurred_at);
CREATE INDEX idx_sales_customer_date ON sales(customer_id,occurred_at);
CREATE TABLE sale_items (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 sale_id BIGINT NOT NULL,
 product_id BIGINT NOT NULL,
 quantity DECIMAL(14,3) NOT NULL,
 unit_price DECIMAL(19,6) NOT NULL,
 total DECIMAL(19,2) NOT NULL,
 cost_unit DECIMAL(19,6) NOT NULL,
 cost_total DECIMAL(19,6) NOT NULL,
 FOREIGN KEY (sale_id) REFERENCES sales(id),
 FOREIGN KEY (product_id) REFERENCES products(id),
 UNIQUE(sale_id,product_id),
 CHECK (quantity > 0), CHECK (unit_price > 0), CHECK (total > 0), CHECK (cost_total >= 0)
) ENGINE=InnoDB;

CREATE TABLE expenses (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 description VARCHAR(250) NOT NULL,
 category VARCHAR(80) NOT NULL,
 total DECIMAL(19,2) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 CHECK (total > 0)
) ENGINE=InnoDB;
CREATE INDEX idx_expenses_date ON expenses(occurred_at);

CREATE TABLE financial_titles (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 nature VARCHAR(12) NOT NULL,
 customer_id BIGINT,
 supplier_id BIGINT,
 sale_id BIGINT UNIQUE,
 purchase_id BIGINT UNIQUE,
 expense_id BIGINT UNIQUE,
 amount DECIMAL(19,2) NOT NULL,
 issued_at DATETIME(6) NOT NULL,
 due_date DATE NOT NULL,
 FOREIGN KEY (customer_id) REFERENCES customers(id),
 FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
 FOREIGN KEY (sale_id) REFERENCES sales(id),
 FOREIGN KEY (purchase_id) REFERENCES purchases(id),
 FOREIGN KEY (expense_id) REFERENCES expenses(id),
 CHECK (amount > 0),
 CHECK (
  (nature='RECEIVABLE' AND sale_id IS NOT NULL AND customer_id IS NOT NULL AND purchase_id IS NULL AND supplier_id IS NULL AND expense_id IS NULL)
  OR (nature='PAYABLE' AND purchase_id IS NOT NULL AND supplier_id IS NOT NULL AND sale_id IS NULL AND customer_id IS NULL AND expense_id IS NULL)
  OR (nature='PAYABLE' AND expense_id IS NOT NULL AND sale_id IS NULL AND purchase_id IS NULL AND customer_id IS NULL AND supplier_id IS NULL)
 )
) ENGINE=InnoDB;
CREATE INDEX idx_titles_customer_due ON financial_titles(customer_id,due_date);
CREATE INDEX idx_titles_supplier_due ON financial_titles(supplier_id,due_date);
CREATE INDEX idx_titles_issued ON financial_titles(issued_at);

CREATE TABLE financial_accounts (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;
INSERT INTO financial_accounts(name) VALUES ('Conta operacional');
CREATE TABLE settlements (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 direction VARCHAR(8) NOT NULL,
 account_id BIGINT NOT NULL DEFAULT 1,
 amount DECIMAL(19,2) NOT NULL,
 method VARCHAR(12) NOT NULL,
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 FOREIGN KEY (account_id) REFERENCES financial_accounts(id),
 CHECK (direction IN ('IN','OUT')), CHECK (amount > 0),
 CHECK (method IN ('CASH','PIX','TRANSFER','CARD'))
) ENGINE=InnoDB;
CREATE INDEX idx_settlements_date ON settlements(occurred_at);
CREATE TABLE settlement_allocations (
 settlement_id BIGINT NOT NULL,
 title_id BIGINT NOT NULL,
 amount DECIMAL(19,2) NOT NULL,
 PRIMARY KEY(settlement_id,title_id),
 FOREIGN KEY (settlement_id) REFERENCES settlements(id),
 FOREIGN KEY (title_id) REFERENCES financial_titles(id),
 CHECK (amount > 0)
) ENGINE=InnoDB;
CREATE INDEX idx_allocations_title ON settlement_allocations(title_id);

CREATE TABLE stock_movements (
 id BIGINT PRIMARY KEY AUTO_INCREMENT,
 product_id BIGINT NOT NULL,
 type VARCHAR(12) NOT NULL,
 quantity_delta DECIMAL(14,3) NOT NULL,
 value_delta DECIMAL(19,6) NOT NULL,
 purchase_item_id BIGINT UNIQUE,
 sale_item_id BIGINT UNIQUE,
 reason VARCHAR(250) NOT NULL DEFAULT '',
 occurred_at DATETIME(6) NOT NULL,
 created_by VARCHAR(100) NOT NULL,
 FOREIGN KEY (product_id) REFERENCES products(id),
 FOREIGN KEY (purchase_item_id) REFERENCES purchase_items(id),
 FOREIGN KEY (sale_item_id) REFERENCES sale_items(id),
 CHECK ((type='PURCHASE' AND quantity_delta > 0 AND value_delta > 0 AND purchase_item_id IS NOT NULL AND sale_item_id IS NULL)
 OR (type='SALE' AND quantity_delta < 0 AND value_delta <= 0 AND sale_item_id IS NOT NULL AND purchase_item_id IS NULL)
 OR (type='LOSS' AND quantity_delta < 0 AND value_delta <= 0 AND purchase_item_id IS NULL AND sale_item_id IS NULL AND reason <> ''))
) ENGINE=InnoDB;
CREATE INDEX idx_stock_product_date ON stock_movements(product_id,occurred_at);
CREATE INDEX idx_stock_date ON stock_movements(occurred_at);

CREATE TABLE operation_requests (
 request_key VARCHAR(64) PRIMARY KEY,
 operation_type VARCHAR(20) NOT NULL,
 request_hash CHAR(64) NOT NULL,
 result_id BIGINT,
 created_by VARCHAR(100) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB;
